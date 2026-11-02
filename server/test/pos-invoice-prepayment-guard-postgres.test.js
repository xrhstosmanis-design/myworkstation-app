import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import vm from 'node:vm';
import {invoiceDbFixture,isolatedInvoiceDb} from './helpers/invoice-common-draft-fixture.js';
import {lockInvoiceStore} from '../src/lib/invoice-common-draft.js';
import {findInvoicePayment,assertReusableInvoicePayment,invoiceToken} from '../src/lib/invoice-payment-reuse.js';
import {findCompetingPosDraftReview,findExistingInvoicePaymentReview} from '../src/lib/pos-invoice-duplicate-review.js';

// Synthetic-only fixtures. The handler and protected transaction closure come
// from production source; their shared candidate queries execute on native PG.
const commerce=fs.readFileSync(new URL('../src/routes/commerce-pos-v244.js',import.meta.url),'utf8');
const transactions=fs.readFileSync(new URL('../src/routes/store-transactions.js',import.meta.url),'utf8');
const referenceStart=transactions.indexOf('function normalizeInvoicePaymentReference('),referenceEnd=transactions.indexOf('\nasync function alertRecipients',referenceStart);
assert.ok(referenceStart>=0&&referenceEnd>referenceStart,'actual server invoice-reference helpers');
const invoicePaymentReference=new Function(transactions.slice(referenceStart,referenceEnd)+';return invoicePaymentReference;')();
const native={skip:!isolatedInvoiceDb()};
const identity={storeId:'s',supplierId:'sup',documentNumber:'21-NT 006836',documentDate:'2026-10-12',totalGross:3.39,documentType:'INVOICE'};
const noop=async()=>{};
async function snapshot(f){
 const records={moneyStock:JSON.parse(await f.snapshot())};
 for(const name of ['PurchaseDocument','PurchaseOrder','PurchaseDocumentLine','PurchaseOrderLine','AiReaderJob','DocumentAttachment','DocumentInbox','MyDataInboundDocument','InvoiceDraftAlias'])records[name]=await f.db.$queryRawUnsafe(`SELECT row_to_json(t) AS row FROM "${name}" t ORDER BY row_to_json(t)::text`);
 return records;
}
async function fixture(seed={}){
 const f=await invoiceDbFixture();await f.seed(seed);
 await f.db.$executeRawUnsafe('ALTER TABLE "StoreTransaction" ADD COLUMN "actorName" TEXT');
 return f;
}
function actualPrecheck(f,{myDataPurchase=null,observeGuards=()=>{}}={}){
 const a=commerce.indexOf('router.post("/ai-reader/fast-duplicate-check"'),b=commerce.indexOf('\n});',a)+4;
 assert.ok(a>=0&&b>a,'actual precheck registration');
 const registration=commerce.slice(a,b),handler=registration.slice(registration.indexOf('async(req,res,next)=>'),-2).trim();
 const prisma={
  $queryRaw:f.db.$queryRaw.bind(f.db),
  store:{findFirst:async({where})=>(await f.db.$queryRaw`SELECT "id" FROM "Store" WHERE "id"=${where.id} AND "companyId"=${where.companyId}`)[0]||null}
 };
 const forbidden=()=>{throw new Error('Unexpected write/provider/pending branch')};
 const deps={prisma,normalizeDocumentNumber:v=>String(v||'').trim().toUpperCase().replace(/\s+/g,''),norm:invoiceToken,
  cleanTaxId:v=>String(v||'').replace(/\D/g,''),normalizeIntakeDate:v=>v==null?null:String(v).slice(0,10),intakeNumber:Number,crypto,
  ensureV244IntakeSchema:noop,ensureFastHandoffSchema:noop,ensureInvoiceCommonDraftSchema:noop,assertNoUnresolvedInbound:noop,
  unpaidMyDataHeaderReview:forbidden,prepareSelectedInbox:forbidden,assertExpectedPendingInvoice:forbidden,invoicePageManifest:forbidden,
  findMyDataPurchase:async()=>myDataPurchase,findInvoicePayment,assertReusableInvoicePayment,
  findCompetingPosDraftReview:async(...args)=>{observeGuards('draft');return findCompetingPosDraftReview(...args)},
  findExistingInvoicePaymentReview:async(...args)=>{observeGuards('payment');return findExistingInvoicePaymentReview(...args)},
  findUnlinkedMyDataOriginal:async()=>null};
 const route=new Function(...Object.keys(deps),'return '+handler)(...Object.values(deps));
 return async body=>{let status=200,result,failure;const res={status:n=>(status=n,res),json:v=>(result=v,res)};
  await route({user:{companyId:'c',id:'synthetic-owner'},body},res,e=>{failure=e});if(failure)throw failure;return {status,body:result};
 };
}
function actualPaymentClosure(f,body,{insertTransaction,storeId='s'}={}){
 const a=transactions.indexOf('const checkInvoicePayment=async tx=>{'),b=transactions.indexOf('\n    const outcome=tx===prisma',a);
 assert.ok(a>=0&&b>a,'actual direct transaction guard closure');
 const invoiceReference=invoicePaymentReference(body),invoicePaymentKey=`c:VAT:099999999:${invoiceReference}`;
 const deps={req:{user:{companyId:'c'}},store:{id:storeId},body,supplierTaxId:'099999999',invoicePaymentKey,invoiceReference,lockInvoiceStore,findExistingInvoicePaymentReview,
  insertTransaction:insertTransaction|| (tx=>tx.$queryRaw`INSERT INTO "StoreTransaction"("id","companyId","storeId","supplierId","type","amount","description","invoiceDocumentNumber","invoicePaymentKey") VALUES(${crypto.randomUUID()},'c',${storeId},'sup','SUPPLIER_PAYMENT',${body.amount},${`Τιμολόγιο ${body.invoiceDocumentNumber} — synthetic original`},${body.invoiceDocumentNumber},${invoicePaymentKey}) RETURNING *`)};
 return new Function(...Object.keys(deps),transactions.slice(a,b)+';return checkInvoicePayment;')(...Object.values(deps));
}

test('prepayment fixtures extract the actual HTTP handler and direct-post transaction closure',()=>{
 const f={db:{$queryRaw:async()=>[]}};
 assert.equal(typeof actualPrecheck(f),'function');
 assert.equal(typeof actualPaymentClosure(f,{supplierId:'sup',invoiceDocumentNumber:'SYNTHETIC 742',amount:4.2}),'function');
});

test('native actual precheck refuses a competing POS draft before client payment and preserves every source',native,async()=>{
 const f=await fixture({mydata:false,payment:false,posLines:1});try{
  const before=await snapshot(f),result=await actualPrecheck(f)(identity);
  assert.equal(result.status,409);assert.equal(result.body.code,'INVOICE_DUPLICATE_REVIEW_REQUIRED');assert.notEqual(result.body.duplicate,false);
  assert.deepEqual(await snapshot(f),before);
 }finally{await f.close()}
});

test('native actual precheck and direct-post closure refuse uncertain-number repeat of an existing payment without modifying it',native,async()=>{
 const f=await fixture({pos:false,mydata:false,payment:true});try{
  const before=await snapshot(f),precheck=await actualPrecheck(f)(identity);
  assert.equal(precheck.status,409);assert.equal(precheck.body.code,'INVOICE_DUPLICATE_REVIEW_REQUIRED');
  const outcome=await f.db.$transaction(actualPaymentClosure(f,{supplierId:'sup',invoiceDocumentNumber:identity.documentNumber,amount:identity.totalGross},{insertTransaction:()=>{throw new Error('Duplicate attempted ledger insertion')}}));
  assert.equal(outcome.review?.id,'payment');assert.equal(outcome.rows,null);
  assert.deepEqual(await snapshot(f),before,'direct POST bypass cannot alter the existing payment, source or control stock');
 }finally{await f.close()}
});

test('native stale prechecks and concurrent direct payment posts with different raw-number keys commit exactly one payment',native,async()=>{
 const f=await fixture({pos:false,mydata:false,payment:false});try{
  const before=await snapshot(f),numbers=['SER-A 000742','SER-B 742'];
  const requests=numbers.map(documentNumber=>({...identity,documentNumber,totalGross:4.2}));
  for(const request of requests){const precheck=await actualPrecheck(f)(request);assert.equal(precheck.status,200);assert.equal(precheck.body.duplicate,false)}
  assert.deepEqual(await snapshot(f),before,'both read-only prechecks precede money');
  const outcomes=await Promise.all(requests.map(request=>f.db.$transaction(actualPaymentClosure(f,{supplierId:'sup',invoiceDocumentNumber:request.documentNumber,amount:request.totalGross}))));
  assert.equal(outcomes.filter(o=>o.rows?.length===1).length,1);assert.equal(outcomes.filter(o=>o.review&&o.rows===null).length,1);
  const after=await snapshot(f);assert.equal(after.moneyStock.StoreTransaction.length,1);assert.equal(Number(after.moneyStock.StoreTransaction[0].row.amount),4.2);
  assert.deepEqual(after.moneyStock.StoreProduct,before.moneyStock.StoreProduct);assert.deepEqual(after.moneyStock.StockMovement,before.moneyStock.StockMovement);
  for(const name of Object.keys(before).filter(n=>n!=='moneyStock'))assert.deepEqual(after[name],before[name],name+' remains unchanged');
  const committed=after.moneyStock.StoreTransaction;
  const retry=await f.db.$transaction(actualPaymentClosure(f,{supplierId:'sup',invoiceDocumentNumber:'SER-C 0000742',amount:4.2}));
  assert.equal(retry.review?.id,committed[0].row.id);assert.deepEqual((await snapshot(f)).moneyStock.StoreTransaction,committed,'a third spelling preserves the one immutable payment');
 }finally{await f.close()}
});

test('native first unpaid canonical myDATA keeps its earlier precheck return and is not evidence of an existing payment',native,async()=>{
 const f=await fixture({pos:false,mydata:true,payment:false});try{
  const before=await snapshot(f),number='21-ΤΔΑ 6836',observed=[];
  const purchase={documentId:'d-mydata',purchaseNumber:number,status:'DRAFT',settlementMode:'CREDIT',paymentTransactionId:null,resultJson:{},rawPayload:{}};
  const precheck=await actualPrecheck(f,{myDataPurchase:purchase,observeGuards:x=>observed.push(x)})({...identity,documentNumber:number});
  assert.equal(precheck.status,200);assert.equal(precheck.body.myDataMatched,true);assert.equal(precheck.body.paymentReused,false);assert.equal(precheck.body.paymentTransactionId,null);
  assert.deepEqual(observed,[],'existing canonical first-payment branch precedes uncertain duplicate reviews');assert.deepEqual(await snapshot(f),before);
  const outcome=await f.db.$transaction(actualPaymentClosure(f,{supplierId:'sup',invoiceDocumentNumber:number,amount:3.39}));
  assert.equal(outcome.review,undefined);assert.equal(outcome.rows.length,1,'an unpaid draft alone never blocks the first real payment');
  const after=await snapshot(f);assert.equal(after.moneyStock.StoreTransaction.length,1);assert.deepEqual(after.moneyStock.StoreProduct,before.moneyStock.StoreProduct);assert.deepEqual(after.moneyStock.StockMovement,before.moneyStock.StockMovement);
  assert.deepEqual(after.PurchaseDocument,before.PurchaseDocument);assert.deepEqual(after.PurchaseOrder,before.PurchaseOrder);
 }finally{await f.close()}
});


test('native actual direct-post closure uses the server-derived legacy description reference before another payment',native,async()=>{
 const f=await fixture({pos:false,mydata:false,payment:true});try{
  await f.db.$executeRaw`UPDATE "StoreTransaction" SET "invoiceDocumentNumber"='SER000742',"description"='Τιμολόγιο SER000742 — original proof' WHERE "id"='payment'`;
  const before=await snapshot(f);
  for(const description of ['Τιμολόγιο SER742 — incoming proof','invoice SER742 — incoming proof']){
   const body={supplierId:'sup',amount:3.39,description};
   assert.equal(body.invoiceDocumentNumber,undefined);assert.equal(invoicePaymentReference(body),'SER742');
   const outcome=await f.db.$transaction(actualPaymentClosure(f,body,{insertTransaction:()=>{throw new Error('Description-only duplicate attempted insertion')}}));
   assert.equal(outcome.review?.id,'payment');assert.equal(outcome.rows,null);
   assert.deepEqual(await snapshot(f),before,'legacy description-only request preserves the existing payment, sources and stock');
  }
 }finally{await f.close()}
});


test('actual POS submit stops at precheck review before any transaction or handoff request',async()=>{
 const source=fs.readFileSync(new URL('../../client/src/components/store/StoreSupplierInvoicePremiumFast.jsx',import.meta.url),'utf8');
 const start=source.indexOf('  const submit=async()=>{'),end=source.indexOf('  return <div className="pos-payment-form-v3-root',start);
 assert.ok(start>=0&&end>start);const calls=[],messages=[];
 const context=vm.createContext({ready:true,busy:false,selectedInboxId:null,documentType:'INVOICE',mode:'PAID',amount:'4.2',documentNumber:'SER 000742',documentDate:'2026-11-01',store:{id:'s'},supplierId:'sup',supplier:{name:'Synthetic supplier'},file:{name:'different-original.jpg'},fileDataUrl:'different-bytes',pages:[{file:{name:'different-original.jpg'},dataUrl:'different-bytes'}],num:Number,setBusy:()=>{},setStatus:v=>messages.push(v),setMessage:v=>messages.push(v),api:async(path)=>{calls.push(path);throw Object.assign(new Error('INVOICE_DUPLICATE_REVIEW_REQUIRED'),{status:409})}});
 await vm.runInContext(source.slice(start,end)+'\nsubmit()',context);
 assert.deepEqual(calls,['/api/commerce/ai-reader/fast-duplicate-check']);assert.ok(messages.some(x=>x.includes('INVOICE_DUPLICATE_REVIEW_REQUIRED')));
});
