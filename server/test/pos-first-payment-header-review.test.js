import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('../../client/src/components/store/StoreSupplierInvoicePremiumFast.jsx',import.meta.url),'utf8');
const start=source.indexOf('  const submit=async()=>{'),end=source.indexOf('  return <div className="pos-payment-form-v3-root',start);
assert.ok(start>=0&&end>start);
const handler=source.slice(start,end);
async function submit({confirmed=true,changed=false,paid=false,unlinked=false,changedMark=false,mode='PAID'}={}){
 const calls=[],messages=[],prompts=[];let checks=0,completed=0;
 const context=vm.createContext({ready:true,selectedInboxId:null,documentType:'INVOICE',mode,amount:'3.39',documentNumber:'OCR-X 9042',documentDate:'2026-10-12',store:{id:'s'},supplierId:'sup',supplier:{name:'Synthetic supplier'},file:{name:'photo.jpg'},fileDataUrl:'source',pages:[{file:{name:'photo.jpg',type:'image/jpeg'},dataUrl:'source'}],num:Number,paymentKey:()=> 'key',paymentSource:'CASH_SHIFT',paymentMethod:'CASH',paymentMethodLabel:'μετρητά',setBusy:()=>{},setStatus:()=>{},setMessage:v=>messages.push(v),onChanged:()=>{},onCompleted:()=>completed++,monitorBackgroundV244:()=>{},window:{confirm:v=>{prompts.push(v);return confirmed},dispatchEvent:()=>{}},CustomEvent:class{},api:async(path,opt)=>{
  const body=JSON.parse(opt.body);calls.push({path,body});
  if(path.endsWith('fast-duplicate-check')){
   if(++checks===1)return {myDataHeaderReviewRequired:true,canonicalDocumentNumber:'21-ΤΔΑ 6836',canonicalDocumentDate:'2026-10-12',myDataTotalGross:3.39,myDataMark:'400001'};
   assert.equal(body.documentNumber,'21-ΤΔΑ 6836');
   if(changed)throw Error('Το παραστατικό άλλαξε');
   return {...(unlinked?{myDataHeaderMatched:true,myDataMark:changedMark?'changed':'400001'}:{myDataMatched:true}),canonicalDocumentNumber:'21-ΤΔΑ 6836',...(paid?{paymentReused:true,paymentTransactionId:'already-paid'}:{})};
  }
  if(path.startsWith('/api/transactions/'))return {id:'first-payment'};
  if(path.endsWith('fast-handoff'))return {receiptLinked:true,jobId:'same-original'};
  throw Error(path);
 }});
 await vm.runInContext(`${handler}\nsubmit()`,context);
 return {calls,messages,prompts,completed};
}
test('actual POS cancel of unpaid-header proposal never calls payment or handoff',async()=>{
 const r=await submit({confirmed:false});assert.equal(r.calls.length,1);assert.equal(r.completed,0);assert.match(r.prompts[0],/ΑΠΛΗΡΩΤΟ/);
});
test('actual POS confirmed original rechecks exact header before one payment and same-draft handoff',async()=>{
 const r=await submit();assert.deepEqual(r.calls.map(c=>c.path),['/api/commerce/ai-reader/fast-duplicate-check','/api/commerce/ai-reader/fast-duplicate-check','/api/transactions/stores/s','/api/commerce/ai-reader/fast-handoff']);
 assert.equal(r.calls[2].body.invoiceDocumentNumber,'21-ΤΔΑ 6836');assert.equal(r.calls[2].body.amount,3.39);
 assert.equal(r.calls[3].body.documentNumber,'21-ΤΔΑ 6836');assert.equal(r.calls[3].body.paymentTransactionId,'first-payment');assert.equal(r.completed,1);
});
test('actual POS stale recheck stops before money or receipt writes',async()=>{
 const r=await submit({changed:true});assert.equal(r.calls.length,2);assert.equal(r.completed,0);assert.ok(r.messages.some(v=>v.includes('Το παραστατικό άλλαξε')));
});
test('actual POS payment discovered during recheck is reused without another transaction',async()=>{
 const r=await submit({paid:true});assert.equal(r.calls.length,3);assert.equal(r.prompts.length,2);assert.ok(r.calls.every(c=>!c.path.startsWith('/api/transactions/')));assert.equal(r.calls[2].body.paymentTransactionId,'already-paid');
});
test('actual POS credit confirmation links original without payment',async()=>{
 const r=await submit({mode:'CREDIT'});assert.equal(r.calls.length,3);assert.ok(r.calls.every(c=>!c.path.startsWith('/api/transactions/')));assert.equal(r.calls[2].body.settlementMode,'CREDIT');assert.equal(r.calls[2].body.paymentTransactionId,null);
});

test('actual precheck returns an unpaid proposal before any financial or handoff path; paid/ambiguous errors remain errors',async()=>{
 const route=fs.readFileSync(new URL('../src/routes/commerce-pos-v244.js',import.meta.url),'utf8');
 const a=route.indexOf('router.post("/ai-reader/fast-duplicate-check"'),b=route.indexOf('\n// Durable POS handoff',a),body=route.slice(a,b);
 const code=body.slice(body.indexOf('async(req,res,next)=>'),-3).trim();
 let proposal={myDataHeaderReviewRequired:true,canonicalDocumentNumber:'A 100'},result,failure,lookups=0;
 const deps={prisma:{store:{findFirst:async()=>({id:'s'})},$queryRaw:async()=>[{id:'sup',taxId:'099999999'}]},normalizeDocumentNumber:String,norm:String,cleanTaxId:String,normalizeIntakeDate:String,intakeNumber:Number,ensureV244IntakeSchema:async()=>{},ensureFastHandoffSchema:async()=>{},ensureInvoiceCommonDraftSchema:async()=>{},assertNoUnresolvedInbound:async()=>{throw Object.assign(Error('review'),{code:'INVOICE_HEADER_REVIEW_REQUIRED'})},unpaidMyDataHeaderReview:async()=>{if(proposal instanceof Error)throw proposal;return proposal},findMyDataPurchase:async()=>{lookups++;throw Error('Must not reach handoff/payment')},crypto:{}};
 const fn=new Function(...Object.keys(deps),`return ${code}`)(...Object.values(deps));
 const req={body:{storeId:'s',supplierId:'sup',documentNumber:'OCR 9',documentDate:'2026-10-12',totalGross:3.39},user:{companyId:'c'}};
 const res={json:v=>{result=v;return res},status:()=>res};
 await fn(req,res,e=>failure=e);assert.ifError(failure);assert.equal(result.myDataHeaderReviewRequired,true);assert.equal(lookups,0);
 proposal=null;await fn(req,res,e=>failure=e);assert.equal(failure.code,'INVOICE_HEADER_REVIEW_REQUIRED');
 proposal=Object.assign(Error('paid'),{code:'INVOICE_ALREADY_PAID'});await fn(req,res,e=>failure=e);assert.equal(failure.code,'INVOICE_ALREADY_PAID');assert.equal(lookups,0);
});

test('actual photographed POS handoff queues the existing empty myDATA reader, preserves populated rows and skips receipt replays',async()=>{
 const route=fs.readFileSync(new URL('../src/routes/commerce-pos-v244.js',import.meta.url),'utf8');
 const a=route.indexOf('router.post("/ai-reader/fast-handoff"'),b=route.indexOf('\n});',a)+4,body=route.slice(a,b);
 const code=body.slice(body.indexOf('async(req,res,next)=>'),-2).trim();
 for(const state of ['empty','populated','replay']){
  let queues=0,enqueues=0,result,failure;
  const deps={prisma:{store:{findFirst:async()=>({id:'s'})},$queryRaw:async()=>[{id:'sup',taxId:'099999999'}]},normalizeIntakeDate:String,intakeNumber:Number,round2:Number,cleanTaxId:String,ensureV244IntakeSchema:async()=>{},ensureFastHandoffSchema:async()=>{},ensureInvoiceCommonDraftSchema:async()=>{},assertNoUnresolvedInbound:async()=>{},findMyDataPurchase:async()=>({purchaseNumber:'A 100',jobId:'original-job'}),findInvoicePayment:async()=>({id:'existing-pos-payment'}),pendingIntentForPayment:async()=>null,assertReusableInvoicePayment:()=>{},finalizeV244ProductLines:()=>[],crypto:{createHash:()=>({update:()=>({digest:()=> 'checksum'})})},attachMyDataPosReceipt:async()=>({receiptLinked:true,reused:state==='replay'}),queueEmptyInboxRead:async()=>{queues++;return state==='empty'},enqueueFastBackground:async()=>{enqueues++}};
  const fn=new Function(...Object.keys(deps),`return ${code}`)(...Object.values(deps));
  const req={body:{storeId:'s',supplierId:'sup',documentNumber:'A 100',documentDate:'2026-10-12',totalGross:3.39,documentType:'INVOICE',settlementMode:'PAID',paymentTransactionId:'existing-pos-payment',pages:[{mimeType:'image/jpeg',dataUrl:'data:image/jpeg;base64,'+Buffer.alloc(120,1).toString('base64')}]},user:{companyId:'c'},protocol:'https',get:()=> 'example.test'};
  const res={json:v=>{result=v;return res},status:()=>res};
  await fn(req,res,e=>failure=e);assert.ifError(failure);assert.equal(result.receiptLinked,true);assert.equal(queues,state==='replay'?0:1);assert.equal(enqueues,state==='empty'?1:0);assert.equal(result.backgroundQueued,state==='empty');
 }
});

test('actual POS confirms a header without a draft, rechecks it and submits one canonical payment and handoff',async()=>{
 const r=await submit({unlinked:true});assert.equal(r.calls.length,4);assert.equal(r.calls[2].body.invoiceDocumentNumber,'21-ΤΔΑ 6836');assert.equal(r.calls[3].body.documentNumber,'21-ΤΔΑ 6836');assert.equal(r.completed,1);
});
test('actual POS refuses an unlinked header whose MARK changed before payment',async()=>{
 const r=await submit({unlinked:true,changedMark:true});assert.equal(r.calls.length,2);assert.equal(r.completed,0);
});
