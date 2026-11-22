import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const source=await readFile(new URL('../src/routes/commerce-mydata-inbox.js',import.meta.url),'utf8');
const block=source.slice(source.indexOf('router.post("/documents/inbox/:inboxId/original"'),source.indexOf('router.post("/documents/mydata/orders/:orderId/prefill"'));
function fixture({allowed=true,storeExists=true,reconciliationRequired=false,readOnly=false,populated=false,downloaded=false}={}){
 const calls=[],routes=[];let status=200,body,error;
 const prisma={store:{findFirst:async query=>{calls.push({kind:'scope',query});return storeExists&&query.where.id==='s'&&query.where.companyId==='c'?{id:'s'}:null}}};
 const result={purchaseOrderId:'existing-order',paymentTransactionId:'existing-payment',downloaded,reconciliationRequired,readOnly};
 const readiness={version:'MYDATA_PDF_READINESS_V1',storeId:'s',inboxId:'inbox',orderId:reconciliationRequired?null:'existing-order',state:reconciliationRequired?'UNAVAILABLE':readOnly?'READ_ONLY':populated?'HAS_LINES':'NEEDS_READING',needsPdfReading:!reconciliationRequired&&!readOnly&&!populated,orderLineCount:populated?3:0,documentLineCount:0};
 const deps={router:{post:(path,...handlers)=>routes.push({path,handlers})},requireCompanyModule:key=>(req,res,next)=>{calls.push({kind:'module',key});return next()},canSync:()=>allowed,prisma,ensureSchema:async()=>{calls.push({kind:'existing-schema'})},acquireOriginal:async(...args)=>{calls.push({kind:'acquire',args:args.slice(1)});return result},readMyDataPdfDraftReadiness:async(db,context)=>{assert.equal(db,prisma);calls.push({kind:'readiness',context});assert.deepEqual(context,{companyId:'c',storeId:'s',inboxId:'inbox',orderId:reconciliationRequired?null:'existing-order'});return readiness}};
 new Function(...Object.keys(deps),block)(...Object.values(deps));
 const run=async()=>{const req={user:{id:'owner',companyId:'c'},body:{storeId:'s'},params:{inboxId:'inbox'}},res={status:n=>(status=n,res),json:value=>(body=value,res)},handlers=routes[0].handlers;const visit=async i=>{if(i===handlers.length)return;let downstream;await handlers[i](req,res,e=>{if(e)error=e;else downstream=visit(i+1)});await downstream};await visit(0);if(error)throw error;return {status,body,calls}};
 return {run,result,readiness};
}

test('explicit PDF original route enriches first and reused acquisition with the same canonical order/payment and scoped readiness',async()=>{
 for(const downloaded of [false,true]){
  const f=fixture({downloaded}),out=await f.run();assert.equal(out.status,200);assert.deepEqual(out.body,{...f.result,pdfReadiness:f.readiness});assert.equal(out.body.purchaseOrderId,'existing-order');assert.equal(out.body.paymentTransactionId,'existing-payment');assert.equal(out.body.pdfReadiness.needsPdfReading,true);
  assert.deepEqual(out.calls.filter(c=>c.kind==='module').map(c=>c.key),['DOCUMENTS','AI_READER','INVENTORY']);assert.deepEqual(out.calls.find(c=>c.kind==='scope').query,{where:{id:'s',companyId:'c'},select:{id:true}});assert.deepEqual(out.calls.find(c=>c.kind==='acquire').args,['c','s','inbox','owner',true]);assert.ok(out.calls.findIndex(c=>c.kind==='acquire')<out.calls.findIndex(c=>c.kind==='readiness'));
 }
});

test('populated, readonly and reconciliation outcomes remain distinct without a reader or payment operation',async()=>{
 for(const options of [{populated:true},{readOnly:true},{reconciliationRequired:true}]){const f=fixture(options),out=await f.run();assert.equal(out.body.pdfReadiness.needsPdfReading,false);assert.equal(out.body.paymentTransactionId,'existing-payment');assert.equal(out.calls.filter(c=>c.kind==='acquire').length,1);assert.equal(out.calls.filter(c=>c.kind==='readiness').length,1);assert.deepEqual(out.body.pdfReadiness,f.readiness)}
 for(const options of [{allowed:false},{storeExists:false}]){const out=await fixture(options).run();assert.equal(out.status,options.allowed===false?403:404);assert.equal(out.calls.some(c=>c.kind==='acquire'||c.kind==='readiness'),false)}
});
