import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import express from 'express';
import {createWholesaleSellerRouter} from '../src/routes/wholesale-sellers.js';
import {assertWholesaleManager,assertWholesalePrincipal,authorizeWholesalePrincipal,authorizeWholesaleQuoteProducts,createWholesaleSellerPrincipal,isWholesaleSellerPrincipal,wholesaleError} from '../src/lib/wholesale-principal.js';

const principalScope={companyId:'company-a',userId:'seller-a',sessionId:'session-a'};
const input={customerId:'customer-a',storeId:'store-a',items:[{productId:'product-a',quantity:'2'}]};

function fixture(){
  const state={active:true,assigned:true,price:'1.2345',version:1,orders:[],events:[],calls:[],authorizations:[],bootstrap:0};
  const execute=async(query,...values)=>{
    const sql=Array.isArray(query)?query.join('?'):query.sql||query.text,v=Array.isArray(query)?values:query.values;state.calls.push({sql,values:v});
    if(sql.includes('pg_advisory_xact_lock'))return [{locked:''}];
    if(sql.includes('INSERT INTO "WholesaleOrderRequest"')){const [id,companyId,storeId,customerId,actorId,channel,clientOrderId,requestHash,quoteId,snapshot,notes,netTotal,vatTotal,grossTotal]=v;const row={id,companyId,storeId,customerId,actorId,channel,clientOrderId,requestHash,quoteId,snapshot:JSON.parse(snapshot),notes,netTotal,vatTotal,grossTotal,status:'SUBMITTED',createdAt:new Date('2026-10-18T15:00Z')};state.orders.push(row);return [structuredClone(row)]}
    if(sql.includes('INSERT INTO "WholesaleOrderEvent"')){state.events.push(v);return 1}
    if(sql.includes('FROM "WholesaleOrderRequest"')){
      let rows;
      if(sql.includes('"clientOrderId"='))rows=state.orders.filter(row=>row.companyId===v[0]&&row.actorId===v[1]&&row.clientOrderId===v[2]);
      else if(sql.includes('"id"='))rows=state.orders.filter(row=>row.id===v[0]&&row.companyId===v[1]&&row.actorId===v[2]&&row.customerId===v[3]&&row.storeId===v[4]&&row.channel==='FIELD_SALES');
      else rows=state.orders.filter(row=>row.companyId===v[0]&&row.actorId===v[1]&&row.customerId===v[2]&&row.storeId===v[3]&&row.channel==='FIELD_SALES');
      return sql.includes('COUNT(*)')?[{total:rows.length}]:structuredClone(rows);
    }
    if(sql.includes('FROM "User"'))return [{fullName:'Seller A',expiresAt:new Date('2026-10-19T15:00Z')}];
    if(sql.includes('FROM "WholesaleSellerAssignment"')){
      if(sql.includes('DISTINCT'))return state.assigned?[{id:'store-a',name:'Store A'}]:[];
      return sql.includes('COUNT(*)')?[{total:state.assigned?1:0}]:state.assigned?[{id:'customer-a',name:'Customer A',code:'A'}]:[];
    }
    if(sql.includes('FROM "Company"'))return [{id:'company-a'}];
    if(sql.includes('FROM "Store"'))return [{id:'store-a',name:'Store A'}];
    if(sql.includes('FROM "WholesaleCustomer"'))return [{id:'customer-a',name:'Customer A'}];
    if(sql.includes('FROM "WholesaleCustomerPriceList"'))return [{id:'list-a',name:'Private list metadata'}];
    if(sql.includes('FROM "Product"'))return sql.includes('COUNT(*)')?[{total:1}]:[{id:'product-a',name:'Product A',sku:'SKU-A',unit:'PIECE',...(sql.includes('"vatRate"')?{vatRate:'24.000'}:{})}];
    if(sql.includes('JOIN LATERAL'))return [{id:'tier-a',productId:'product-a',minimumQuantity:'1.0000',unitPrice:state.price,priceBasis:'NET',version:state.version,discountPercent:null}];
    throw Error('Unexpected seller query: '+sql);
  };
  const db={$queryRaw:execute,$executeRaw:execute,async $transaction(work){const before=structuredClone({orders:state.orders,events:state.events});try{return await work(db)}catch(error){state.orders=before.orders;state.events=before.events;throw error}}};
  const principal=(scope=principalScope)=>createWholesaleSellerPrincipal(scope,{authorize:async(tx,ctx,body,options)=>{
    assert.equal(tx,db);state.authorizations.push({ctx,body,options});if(!state.active)throw wholesaleError(401,'SELLER_AUTH_REQUIRED','Session revoked');
    if(body?.storeId&&(body.storeId!=='store-a'||!state.assigned||body.customerId&&body.customerId!=='customer-a'))throw wholesaleError(404,'SELLER_ASSIGNMENT_UNAVAILABLE','Assignment unavailable');return true;
  }});
  return {state,db,principal};
}

async function http(f){
  const app=express();app.use(express.json());
  app.use((req,res,next)=>{req.user={id:req.headers['x-test-user']||'seller-a',companyId:'company-a',sessionId:'session-a',sessionVersion:0,role:'EMPLOYEE',tokenType:req.headers['x-test-token']||'BACKOFFICE_USER'};next()});
  app.use('/api/wholesale/sellers',createWholesaleSellerRouter({db:f.db,ensureSchema:async()=>{f.state.bootstrap++},authenticateSeller:async(db,user)=>f.principal({...principalScope,userId:user.id})}));
  const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s))});
  return {async request(path,method='GET',body,headers={}){
    const response=await fetch(`http://127.0.0.1:${server.address().port}/api/wholesale/sellers`+path,{method,headers:{'content-type':'application/json','x-wholesale-seller':'seller-a','x-wholesale-company':'company-a',...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:response.status,body:await response.json(),headers:response.headers};
  },close:()=>new Promise(resolve=>{server.close(resolve);server.closeIdleConnections()})};
}

test('seller principals require a verified WeakMap brand and delegate current selections without becoming managers or portal users',async()=>{
  const f=fixture(),ctx=f.principal();assert.ok(Object.isFrozen(ctx));assert.equal(ctx.actorId,'seller:seller-a');assert.equal(ctx.role,undefined);assert.ok(isWholesaleSellerPrincipal(ctx));assert.doesNotThrow(()=>assertWholesalePrincipal(ctx));assert.throws(()=>assertWholesaleManager(ctx),error=>error.status===403);
  for(const forged of [{...ctx},JSON.parse(JSON.stringify(ctx)),{...ctx,role:'OWNER'}])assert.throws(()=>assertWholesalePrincipal(forged),error=>error.status===403);
  await authorizeWholesalePrincipal(f.db,ctx,input,{lock:true});assert.equal(f.state.authorizations[0].options.lock,true);assert.equal(f.state.authorizations[0].body,input);
  await authorizeWholesaleQuoteProducts(f.db,ctx,input,{lock:true});assert.equal(f.state.calls.length,0,'seller products do not depend on portal publication or site state');
  await assert.rejects(authorizeWholesalePrincipal(f.db,ctx,{...input,customerId:'foreign-customer'},{lock:true}),error=>error.status===404);
  const incomplete=createWholesaleSellerPrincipal(principalScope,{authorize:async()=>{}});await assert.rejects(authorizeWholesalePrincipal(f.db,incomplete,input),error=>error.code==='WHOLESALE_SELLER_ACCESS_DENIED');
});

test('seller router rejects unsupported tokens, missing expected bindings and changed accounts before operational data',async()=>{
  const f=fixture(),api=await http(f);
  try{
    for(const tokenType of ['STORE_OPERATOR','B2B_CUSTOMER','WHOLESALE_SELLER'])assert.equal((await api.request('/context','GET',undefined,{'x-test-token':tokenType})).status,401);
    assert.equal(f.state.bootstrap,0);
    assert.equal((await api.request('/customers?storeId=store-a','GET',undefined,{'x-wholesale-seller':''})).status,428);
    assert.equal((await api.request('/customers?storeId=store-a','GET',undefined,{'x-wholesale-company':''})).status,428);
    assert.equal((await api.request('/customers?storeId=store-a','GET',undefined,{'x-wholesale-company':'company-b'})).status,401);
    assert.equal((await api.request('/customers?storeId=store-a','GET',undefined,{'x-wholesale-seller':'seller:seller-a'})).status,401);
    assert.equal(f.state.calls.length,0);
    const context=await api.request('/context','GET',undefined,{'x-wholesale-seller':'','x-wholesale-company':''});assert.equal(context.status,200);assert.deepEqual(context.body.user,{id:'seller-a',fullName:'Seller A'});assert.equal(context.body.actorId,'seller:seller-a');assert.deepEqual(context.body.stores,[{id:'store-a',name:'Store A'}]);assert.match(context.headers.get('cache-control'),/no-store/);
  }finally{await api.close()}
});

test('seller lists require explicit granted selections, bounded pagination and safe catalog/customer projections',async()=>{
  const f=fixture(),api=await http(f);
  try{
    for(const path of ['/customers','/catalog?storeId=store-a','/orders?storeId=store-a','/orders/missing?storeId=store-a','/customers?storeId=store-a&page=0','/customers?storeId=store-a&pageSize=101','/catalog?storeId=store-a&customerId=customer-a&companyId=company-b'])assert.equal((await api.request(path)).status,400,path);
    assert.equal((await api.request('/customers?storeId=store-b')).status,404);assert.equal((await api.request('/catalog?storeId=store-a&customerId=foreign-customer')).status,404);
    const customers=await api.request('/customers?storeId=store-a'),catalog=await api.request('/catalog?storeId=store-a&customerId=customer-a');assert.equal(customers.status,200);assert.deepEqual(customers.body.items,[{id:'customer-a',name:'Customer A',code:'A'}]);assert.equal(catalog.status,200);assert.deepEqual(catalog.body.items,[{id:'product-a',name:'Product A',sku:'SKU-A',unit:'PIECE'}]);
    assert.doesNotMatch(JSON.stringify([customers.body,catalog.body]),/creditLimit|costPrice|priceList|tier-a|WholesalePortal/);
    const hostile="' OR 1=1 --";await api.request('/customers?storeId=store-a&q='+encodeURIComponent(hostile));assert.ok(f.state.calls.some(call=>call.values.includes('%'+hostile+'%')));assert.ok(!f.state.calls.some(call=>call.sql.includes(hostile)));
  }finally{await api.close()}
});

test('seller quote/order adapters preserve exact amounts, sanitize metadata and keep own accepted replay after price changes',async()=>{
  const f=fixture(),api=await http(f);
  try{
    for(const extra of [{actorId:'owner-a'},{companyId:'company-b'},{channel:'BACKOFFICE'},{unitPrice:'0'}])assert.equal((await api.request('/quotes','POST',{...input,...extra})).status,400);
    const quote=await api.request('/quotes','POST',input);assert.equal(quote.status,200);assert.deepEqual(quote.body.totals,{net:'2.47',vat:'0.59',gross:'3.06'});assert.doesNotMatch(JSON.stringify(quote.body),/tier-a|list-a|priceVersion/);
    const body={...input,clientOrderId:crypto.randomUUID(),quoteId:quote.body.quoteId,notes:'Seller request'},first=await api.request('/orders','POST',body);assert.equal(first.status,201);assert.equal(first.body.order.snapshot.totals.gross,'3.06');assert.equal(first.body.order.notes,'Seller request');assert.doesNotMatch(JSON.stringify(first.body),/requestHash|seller:seller-a|priceVersion|tier-a|list-a/);
    assert.equal(f.state.orders[0].actorId,'seller:seller-a');assert.equal(f.state.orders[0].channel,'FIELD_SALES');
    f.state.price='99.0000';f.state.version=2;const replay=await api.request('/orders','POST',body);assert.equal(replay.status,200);assert.equal(replay.body.replayed,true);assert.deepEqual(replay.body.order,first.body.order);
    assert.equal((await api.request('/orders','POST',{...body,notes:'Changed body'})).status,409);
    const stale=await api.request('/orders','POST',{...body,clientOrderId:crypto.randomUUID()});assert.equal(stale.status,409);assert.equal(stale.body.code,'PRICE_CHANGED');assert.doesNotMatch(JSON.stringify(stale.body),/tier-a|list-a|priceVersion/);
    const list=await api.request('/orders?customerId=customer-a&storeId=store-a');assert.equal(list.status,200);assert.equal(list.body.items.length,1);
    const other=await api.request('/orders?customerId=customer-a&storeId=store-a','GET',undefined,{'x-test-user':'seller-other','x-wholesale-seller':'seller-other'});assert.equal(other.status,200);assert.equal(other.body.items.length,0);
    const detail=await api.request('/orders/'+first.body.orderId+'?customerId=customer-a&storeId=store-a');assert.equal(detail.status,200);assert.deepEqual(detail.body.order,first.body.order);
    assert.equal((await api.request('/orders/'+first.body.orderId+'?customerId=customer-a&storeId=store-a','GET',undefined,{'x-test-user':'seller-other','x-wholesale-seller':'seller-other'})).status,404);
    f.state.assigned=false;assert.equal((await api.request('/orders','POST',body)).status,404);assert.equal((await api.request('/orders?customerId=customer-a&storeId=store-a')).status,404);assert.equal(f.state.orders.length,1);assert.equal(f.state.events.length,1);
  }finally{await api.close()}
});
