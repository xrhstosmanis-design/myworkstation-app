import test from 'node:test';
import assert from 'node:assert/strict';
import {buildWholesaleQuote,normalizeQuoteInput,quoteInputSchema,assertWholesaleManager} from '../src/lib/wholesale-pricing.js';

const ctx={companyId:'company-a',actorId:'owner-a',role:'OWNER',tokenType:'BACKOFFICE_USER',channel:'BACKOFFICE'};
const input=(items=[{productId:'product-a',quantity:'1'}])=>({customerId:'customer-a',storeId:'store-a',items});
function fixture({products,tiers,store=true,customer=true,list=true}={}){
  products??=[{id:'product-a',sku:'SKU-A',name:'Product A',unit:'PIECE',vatRate:'24.000'}];
  tiers??=[{id:'tier-a',productId:'product-a',minimumQuantity:'1',unitPrice:'1.0050',discountPercent:null,priceBasis:'NET',version:1}];
  const reads=[];
  const db={$queryRaw:async sql=>{
    if(Array.isArray(sql))sql={sql:sql.join('?'),values:[]};
    assert.equal(typeof sql.sql,'string');assert.ok(Array.isArray(sql.values));reads.push(sql);
    if(sql.sql.includes('JOIN "CompanyModule"'))return [{companyId:sql.values[0]}];
    if(sql.sql.includes('SELECT clock_timestamp()'))return [{now:new Date()}];
    if(sql.sql.includes('FROM "Store"'))return store?[{id:'store-a',name:'Own store'}]:[];
    if(sql.sql.includes('FROM "WholesaleCustomer"'))return customer?[{id:'customer-a',name:'Own customer'}]:[];
    if(sql.sql.includes('FROM "WholesaleCustomerPriceList"'))return list?[{id:'list-a',name:'Own list',discountPercent:'50'}]:[];
    if(sql.sql.includes('FROM "Product"'))return products.filter(product=>sql.values[2].includes(product.id));
    if(sql.sql.includes('UNNEST'))return sql.values[0].flatMap((productId,index)=>tiers.filter(tier=>tier.productId===productId&&Number(tier.minimumQuantity)<=Number(sql.values[1][index])).sort((a,b)=>Number(b.minimumQuantity)-Number(a.minimumQuantity)).slice(0,1));
    throw Error('Unexpected query: '+sql.sql);
  }};
  return {db,reads,products,tiers};
}
const rejectsCode=(work,code,status)=>assert.rejects(work,error=>error.code===code&&(status===undefined||error.status===status));

test('quote input has strict base-unit decimal strings, normalized quantities and unique bounded items',()=>{
  assert.deepEqual(normalizeQuoteInput({customerId:' customer-a ',storeId:'store-a',items:[{productId:'product-a',quantity:'0.125'}]}),input([{productId:'product-a',quantity:'0.1250'}]));
  assert.equal(quoteInputSchema.parse(input()).items[0].quantity,'1.0000');
  for(const value of ['0','-1','1.00001','NaN','Infinity','1e2','1000000.0001',' 1','01',1,null,{}])assert.throws(()=>normalizeQuoteInput(input([{productId:'product-a',quantity:value}])),error=>error.status===400);
  assert.equal(normalizeQuoteInput(input([{productId:'product-a',quantity:'1000000'}])).items[0].quantity,'1000000.0000');
  for(const body of [{...input(),companyId:'foreign'},{...input(),items:[]},{...input(),items:Array.from({length:101},(_,n)=>({productId:String(n),quantity:'1'}))},input([{productId:'x',quantity:'1'},{productId:'x',quantity:'2'}]),input([{productId:'x',quantity:'1',unitPrice:'0'}])])assert.throws(()=>normalizeQuoteInput(body),error=>error.status===400);
});

test('manager context rejects operator, customer/seller channel and absent identity before reads',async()=>{
  for(const changed of [{role:'EMPLOYEE'},{tokenType:'STORE_OPERATOR'},{tokenType:undefined},{tokenType:'B2B_CUSTOMER'},{channel:'B2B'},{channel:'FIELD_SALES'},{companyId:''},{actorId:''},null]){
    const state=fixture(),actor=changed===null?null:{...ctx,...changed};
    await rejectsCode(()=>buildWholesaleQuote(state.db,actor,input()),'WHOLESALE_ACCESS_DENIED',403);assert.equal(state.reads.length,0);
  }
  for(const role of ['SUPER_ADMIN','OWNER','ADMIN','MANAGER'])assert.doesNotThrow(()=>assertWholesaleManager({...ctx,role}));
});

test('NET and GROSS use exact half-up cent arithmetic with authoritative persisted source evidence',async()=>{
  const state=fixture({products:[{id:'product-a',name:'Net',sku:'A',unit:'PIECE',vatRate:'24'},{id:'product-b',name:'Gross',sku:'B',unit:'KG',vatRate:'24'}],tiers:[{id:'net',productId:'product-a',minimumQuantity:'1',unitPrice:'1.005',discountPercent:'0',priceBasis:'NET',version:2},{id:'gross',productId:'product-b',minimumQuantity:'0.0001',unitPrice:'1.005',discountPercent:null,priceBasis:'GROSS',version:3}]});
  const quote=await buildWholesaleQuote(state.db,ctx,input([{productId:'product-a',quantity:'1'},{productId:'product-b',quantity:'1'}]));
  assert.deepEqual(quote.totals,{net:'1.82',vat:'0.44',gross:'2.26'});assert.equal(quote.currency,'EUR');assert.equal(quote.creditChecked,false);assert.match(quote.quoteId,/^[a-f0-9]{64}$/);
  assert.deepEqual(quote.items[0],{productId:'product-a',name:'Net',sku:'A',unit:'PIECE',quantity:'1.0000',priceListId:'list-a',tierId:'net',sourceUnitPrice:'1.0050',sourcePriceBasis:'NET',minimumQuantity:'1.0000',priceVersion:2,vatRate:'24.000',netTotal:'1.01',vatTotal:'0.24',grossTotal:'1.25'});
  assert.deepEqual({net:quote.items[1].netTotal,vat:quote.items[1].vatTotal,gross:quote.items[1].grossTotal},{net:'0.81',vat:'0.20',gross:'1.01'});
  assert.equal(state.reads.length,9,'batch reads do not grow with item count');assert.equal(JSON.stringify(quote).includes('costPrice'),false);
});

test('zero price/VAT and fractional quantities remain exact; fixed tier overrides list default discount',async()=>{
  const state=fixture();state.products[0].vatRate='0';state.tiers[0].minimumQuantity='0.0001';state.tiers[0].unitPrice='0';
  assert.deepEqual((await buildWholesaleQuote(state.db,ctx,input([{productId:'product-a',quantity:'0.125'}]))).totals,{net:'0.00',vat:'0.00',gross:'0.00'});
  state.tiers[0].unitPrice='0.0125';const quote=await buildWholesaleQuote(state.db,ctx,input([{productId:'product-a',quantity:'0.4'}]));assert.deepEqual(quote.totals,{net:'0.01',vat:'0.00',gross:'0.01'});
  state.tiers[0].priceBasis='GROSS';state.tiers[0].unitPrice='12.4';state.products[0].vatRate='24';assert.deepEqual((await buildWholesaleQuote(state.db,ctx,input([{productId:'product-a',quantity:'3'}]))).totals,{net:'30.00',vat:'7.20',gross:'37.20'});
});

test('highest eligible tier is selected before validation; unknown or ambiguous configured values fail closed',async()=>{
  const state=fixture();state.tiers.push({...state.tiers[0],id:'tier-high',minimumQuantity:'2.5',unitPrice:'0.5',priceBasis:null});
  assert.equal((await buildWholesaleQuote(state.db,ctx,input([{productId:'product-a',quantity:'2.4999'}]))).items[0].tierId,'tier-a');
  await rejectsCode(()=>buildWholesaleQuote(state.db,ctx,input([{productId:'product-a',quantity:'2.5'}])),'WHOLESALE_PRICE_BASIS_REQUIRED',409);
  state.tiers[1].priceBasis='GROSS';assert.equal((await buildWholesaleQuote(state.db,ctx,input([{productId:'product-a',quantity:'2.5'}]))).items[0].tierId,'tier-high');
  state.tiers[1].unitPrice=null;await rejectsCode(()=>buildWholesaleQuote(state.db,ctx,input([{productId:'product-a',quantity:'3'}])),'WHOLESALE_FIXED_PRICE_REQUIRED',409);
  state.tiers[1].unitPrice='2';state.tiers[1].discountPercent='0.001';await rejectsCode(()=>buildWholesaleQuote(state.db,ctx,input([{productId:'product-a',quantity:'3'}])),'WHOLESALE_AMBIGUOUS_PRICE',409);
  state.tiers.length=0;await rejectsCode(()=>buildWholesaleQuote(state.db,ctx,input()),'WHOLESALE_PRICE_REQUIRED',409);
});

test('scope checks fail before price reads, tagged SQL binds hostile IDs and locks checked rows only when requested',async()=>{
  for(const [changes,code] of [[{store:false},'WHOLESALE_STORE_NOT_FOUND'],[{customer:false},'WHOLESALE_CUSTOMER_NOT_FOUND'],[{list:false},'WHOLESALE_PRICE_LIST_REQUIRED'],[{products:[]},'WHOLESALE_PRODUCT_UNAVAILABLE']])await rejectsCode(()=>buildWholesaleQuote(fixture(changes).db,ctx,input()),code);
  const state=fixture(),actor={...ctx,companyId:"company-a' OR true --"};await buildWholesaleQuote(state.db,actor,input(),{lock:true});
  const pricingReads=state.reads.filter(sql=>!sql.sql.includes('JOIN "CompanyModule"')&&!sql.sql.includes('SELECT clock_timestamp()'));
  assert.ok(pricingReads.every(sql=>sql.sql.includes('FOR SHARE')));assert.ok(state.reads.every(sql=>!sql.sql.includes(actor.companyId)));assert.ok(state.reads.filter(sql=>!sql.sql.includes('SELECT clock_timestamp()')).every(sql=>sql.values.includes(actor.companyId)));
  assert.ok(pricingReads[0].sql.includes('c."active"=true'));assert.ok(pricingReads[1].sql.includes('co."active"=true'));assert.ok(pricingReads[2].sql.includes('l."companyId"=a."companyId"'));assert.ok(pricingReads[3].sql.includes('sp."active"=true'));assert.ok(pricingReads[4].sql.includes('ORDER BY t."minimumQuantity" DESC'));
  const unlocked=fixture();await buildWholesaleQuote(unlocked.db,ctx,input());assert.ok(unlocked.reads.every(sql=>!sql.sql.includes('FOR SHARE')));
});

test('quote checksum is stable for normalized requests and changes with authoritative price, version, VAT and actor',async()=>{
  const state=fixture(),first=await buildWholesaleQuote(state.db,ctx,input()),equivalent=await buildWholesaleQuote(state.db,ctx,input([{productId:'product-a',quantity:'1.0000'}]));assert.equal(first.quoteId,equivalent.quoteId);
  for(const change of [()=>{state.tiers[0].version++},()=>{state.tiers[0].unitPrice='1.006'},()=>{state.products[0].vatRate='13'},()=>{state.products[0].name='Renamed'}]){change();assert.notEqual((await buildWholesaleQuote(state.db,ctx,input())).quoteId,first.quoteId)}
  assert.notEqual((await buildWholesaleQuote(state.db,{...ctx,actorId:'other-owner'},input())).quoteId,(await buildWholesaleQuote(state.db,ctx,input())).quoteId);
});

test('invalid database price/VAT/unit/version and aggregate NUMERIC18,2 overflow cannot return a quote',async()=>{
  for(const patch of [{unitPrice:'-1'},{unitPrice:'1e9'},{unitPrice:'10000000000'},{version:0},{version:1.5},{minimumQuantity:'0'}]){const state=fixture();Object.assign(state.tiers[0],patch);await assert.rejects(()=>buildWholesaleQuote(state.db,ctx,input()))}
  for(const vatRate of ['-1','100.001','NaN','0.0001']){const state=fixture();state.products[0].vatRate=vatRate;await assert.rejects(()=>buildWholesaleQuote(state.db,ctx,input()))}
  const unit=fixture();unit.products[0].unit='';await rejectsCode(()=>buildWholesaleQuote(unit.db,ctx,input()),'WHOLESALE_INVALID_PRICING_DATA');
  const overflow=fixture();overflow.tiers[0].unitPrice='9999999999.9999';overflow.products[0].vatRate='100';await rejectsCode(()=>buildWholesaleQuote(overflow.db,ctx,input([{productId:'product-a',quantity:'1000000'}])),'WHOLESALE_TOTAL_TOO_LARGE',400);
});
