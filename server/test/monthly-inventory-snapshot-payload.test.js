import test from 'node:test';
import assert from 'node:assert/strict';
import {buildMonthlyInventorySnapshotCandidate as build,MONTHLY_INVENTORY_SNAPSHOT_BASIS as basis} from '../src/services/monthly-inventory-snapshot-payload.js';
const product=(id='p',patch={})=>({id,companyId:'c',storeId:'s',name:'Προϊόν',sku:'SKU',unit:'piece',quantity:'2.5',retailUnitPrice:'1.234',purchaseUnitCost:'0.2',...patch});
const invoice=(id='i',patch={})=>({id,companyId:'c',storeId:'s',documentNumber:'A 1',supplierName:'Supplier',issueDay:'2026-10-03',categories:['UNPOSTED_DOCUMENT','POSSIBLE_DUPLICATE'],totalAmount:'12.34',...patch});
const pending=(id='pending',patch={})=>({id,companyId:'c',storeId:'s',documentNumber:'OLD',supplierName:'Supplier',documentDate:'2025-01-01',status:'AWAITING_INVOICE',amount:'10.5',...patch});
function input(){return {companyId:'c',storeId:'s',lifecycleGeneration:'0',issueMonth:'2026-10',sourceObservedAt:'2026-11-01T05:00:00.000Z',sourceRevision:'a'.repeat(40),valuationBasis:basis,coverage:{complete:true,productCount:1,invoiceCount:1,pendingOriginalCount:1},products:[product()],invoices:{period:'2026-10',items:[invoice()]},pendingOriginals:{period:'ALL_MONTHS',items:[pending()]}}}
const throws=(value,code)=>assert.throws(()=>build(value),{code});

test('candidate is detached/frozen format only, exact decimal arithmetic has no implicit rounding',()=>{
 const source=input(),before=structuredClone(source),r=build(source);
 assert.equal(r.candidateOnly,true);assert.equal(r.persisted,false);assert.equal(r.validationBasis,'FORMAT_VALIDATED_ONLY');assert.equal(r.products[0].retailValue,'3.085');assert.equal(r.products[0].purchaseValue,'0.5');assert.equal(r.quantityByUnit[0].retailValue,'3.085');assert.match(r.sourceHash,/^[a-f0-9]{64}$/);assert.match(r.payloadHash,/^[a-f0-9]{64}$/);
 assert.deepEqual(source,before);assert.ok(!Object.isFrozen(source));assert.ok(Object.isFrozen(r));assert.ok(Object.isFrozen(r.products[0]));assert.ok(Object.isFrozen(r.invoices.items[0].categories));source.products[0].name='changed';assert.equal(r.products[0].name,'Προϊόν');assert.equal(r.pendingOriginals.period,'ALL_MONTHS');assert.equal(r.pendingOriginals.items[0].documentDate,'2025-01-01');assert.ok(r.invoices.items[0].categories.includes('UNPOSTED_DOCUMENT'));
});
test('valid negative/zero facts remain exact and mixed-unit quantities never produce a grand total',()=>{
 const v=input();v.products=[product('b',{quantity:'-0.000',unit:'kg',retailUnitPrice:'-2.000'}),product('a',{quantity:'-9007199254740993.123456789012',retailUnitPrice:'0.000000000001'})];v.coverage.productCount=2;
 const r=build(v);assert.equal(r.products[0].quantity,'-9007199254740993.123456789012');assert.equal(r.products[0].retailValue,'-9007.199254740993123456789012');assert.equal(r.products[1].quantity,'0');assert.equal(r.products[1].retailUnitPrice,'-2');assert.equal(r.products[1].retailValue,'0');assert.equal(r.quantityByUnit.length,2);assert.equal(Object.hasOwn(r,'quantityTotal'),false);
});
test('missing and invalid monetary values stay UNKNOWN and never turn into complete zero valuation',()=>{
 const v=input();v.products=[product('a',{retailUnitPrice:null,purchaseUnitCost:'1,23'}),product('b',{retailUnitPrice:'0',purchaseUnitCost:'1.5'})];v.coverage.productCount=2;
 const r=build(v),u=r.quantityByUnit[0];assert.equal(r.products[0].retailUnitPrice,null);assert.equal(r.products[0].retailUnknownReason,'MISSING');assert.equal(r.products[0].purchaseUnknownReason,'INVALID');assert.equal(u.retailValue,null);assert.equal(u.purchaseValue,null);assert.equal(u.unknownRetailCount,1);assert.equal(u.unknownPurchaseCount,1);assert.equal(u.knownRetailValueSubtotal,'0');assert.equal(u.knownPurchaseValueSubtotal,'3.75');
});
test('ordinal ordering, canonical decimals and source observation/scope/revision bindings make hashes deterministic',()=>{
 const a=input();a.products.push(product('a',{quantity:'2.5000'}));a.coverage.productCount=2;const b=structuredClone(a);b.products.reverse();b.invoices.items[0].categories.reverse();b.products.find(p=>p.id==='a').quantity='2.5';assert.equal(build(a).payloadHash,build(b).payloadHash);assert.equal(build(a).sourceHash,build(b).sourceHash);
 for(const patch of [{sourceObservedAt:'2026-11-01T05:00:00.001Z'},{sourceRevision:'b'.repeat(40)},{lifecycleGeneration:'1'}]){const r=build({...a,...patch});assert.notEqual(r.sourceHash,build(a).sourceHash);assert.notEqual(r.payloadHash,build(a).payloadHash)}
 const c=structuredClone(a);c.storeId='other';for(const rows of [c.products,c.invoices.items,c.pendingOriginals.items])for(const row of rows)row.storeId='other';assert.notEqual(build(c).sourceHash,build(a).sourceHash);
});
test('partial source counts, wrong periods, foreign/duplicate identities and bad quantity are named refusals',()=>{
 for(const patch of [{complete:false},{productCount:0},{invoiceCount:0},{pendingOriginalCount:0}])throws({...input(),coverage:{...input().coverage,...patch}},patch.complete===false?'SNAPSHOT_COVERAGE_INCOMPLETE':'SNAPSHOT_COVERAGE_MISMATCH');
 for(const quantity of ['1,5','1e2',1.5,'01','1\n','0.1234567890123']){const v=input();v.products[0].quantity=quantity;throws(v,'SNAPSHOT_QUANTITY_INVALID')}
 for(const collection of ['products','invoices','pendingOriginals']){const v=input(),rows=collection==='products'?v.products:v[collection].items;rows[0].storeId='foreign';throws(v,'SNAPSHOT_FOREIGN_SCOPE')}
 const dup=input();dup.products.push(product());dup.coverage.productCount=2;throws(dup,'SNAPSHOT_DUPLICATE_ID');const period=input();period.pendingOriginals.period='2026-10';throws(period,'SNAPSHOT_PENDING_PERIOD_INVALID');const wrong=input();wrong.invoices.items[0].issueDay='2026-09-30';throws(wrong,'SNAPSHOT_INVOICE_PERIOD_INVALID');
 for(const issueDay of ['',undefined,null]){const v=input();v.invoices.items[0].issueDay=issueDay;throws(v,'SNAPSHOT_DOCUMENT_DATE_INVALID')}
 let touched=0;const early=input();early.coverage.productCount=0;Object.defineProperty(early.products[0],'name',{get(){touched++;throw Error('mustnotread')}});throws(early,'SNAPSHOT_COVERAGE_MISMATCH');assert.equal(touched,0);
});
test('unknown/private fields, cycles, arrays with getters and value getters are refused without invocation',()=>{
 const v=input();v.rawOCR='PRIVATE';throws(v,'SNAPSHOT_FIELD_UNSUPPORTED');const cyclic=input();cyclic.products[0].raw=cyclic;throws(cyclic,'SNAPSHOT_FIELD_UNSUPPORTED');
 const moneyCycle=input();moneyCycle.products[0].purchaseUnitCost=moneyCycle;throws(moneyCycle,'SNAPSHOT_VALUE_INVALID');
 let calls=0;for(const place of ['root','row','array']){const x=input();const target=place==='root'?x:place==='row'?x.products[0]:x.products;Object.defineProperty(target,place==='root'?'companyId':place==='row'?'name':'0',{enumerable:true,get(){calls++;throw Error('privategetter')}});throws(x,'SNAPSHOT_ACCESSOR_REFUSED')}assert.equal(calls,0);
});
test('digit, text, array and cumulative canonical budgets refuse before unbounded expansion',()=>{
 const huge=input();huge.products[0].purchaseUnitCost='9'.repeat(1000000);throws(huge,'SNAPSHOT_DECIMAL_LIMIT');const label=input();label.products[0].name='Ω'.repeat(257);throws(label,'SNAPSHOT_TEXT_INVALID');const count=input();count.products=new Array(20001);throws(count,'SNAPSHOT_ARRAY_LIMIT');
 const many=input();many.products=Array.from({length:20000},(_,i)=>product('p'+String(i).padStart(5,'0'),{name:'x'.repeat(512)}));many.coverage.productCount=many.products.length;let touched=0;Object.defineProperty(many.products[19999],'name',{get(){touched++;throw Error('lategetter')},enumerable:true});throws(many,'SNAPSHOT_PAYLOAD_LIMIT');assert.equal(touched,0);
});
test('generation, revision and basis bounds do not grant authenticity or allow legacy epoch relabeling',()=>{
 for(const g of ['-1','01','1\n',0,'9223372036854775808','9'.repeat(100000)])throws({...input(),lifecycleGeneration:g},'SNAPSHOT_GENERATION_INVALID');assert.equal(build({...input(),lifecycleGeneration:'9223372036854775807'}).lifecycleGeneration,'9223372036854775807');for(const sourceRevision of ['A'.repeat(40),'a'.repeat(40)+'\n'])throws({...input(),sourceRevision},'SNAPSHOT_REVISION_INVALID');throws({...input(),valuationBasis:'FIFO'},'SNAPSHOT_BASIS_INVALID');
});
test('invoice and pending monetary facts retain signed precision or named UNKNOWN without inferring unpaid totals',()=>{
 const v=input();v.invoices.items[0].totalAmount='-9007199254740993.123456789012';v.pendingOriginals.items[0].amount='-0.1000';const r=build(v);
 assert.equal(r.invoices.items[0].totalAmount,'-9007199254740993.123456789012');assert.equal(r.pendingOriginals.items[0].amount,'-0.1');assert.equal(Object.hasOwn(r,'unpaidTotal'),false);
 for(const [section,key]of [['invoices','totalAmount'],['pendingOriginals','amount']]){
  const changed=structuredClone(v);changed[section].items[0][key]='1.234567890123';assert.notEqual(build(changed).sourceHash,r.sourceHash);assert.notEqual(build(changed).payloadHash,r.payloadHash);
  for(const [amount,reason]of [[undefined,'MISSING'],['1,23','INVALID'],['0.1234567890123','INVALID']]){const unknown=structuredClone(v);unknown[section].items[0][key]=amount;const row=build(unknown)[section].items[0];assert.equal(row[key],null);assert.equal(row[key+'UnknownReason'],reason)}
 }
});
