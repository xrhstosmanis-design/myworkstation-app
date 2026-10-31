import test from 'node:test';
import assert from 'node:assert/strict';
import {compareInvoiceRowsForReview,lineEvidenceCandidates} from '../src/lib/invoice-line-evidence.js';
import {previewInvoiceReconciliation,reconcileInvoiceDrafts,assertInvoiceStockAvailable} from '../src/lib/invoice-common-draft.js';
import {invoiceDbFixture,isolatedInvoiceDb} from './helpers/invoice-common-draft-fixture.js';
import {archiveQuery,archiveStatus} from '../src/invoice-archive.js';
import {readFile} from 'node:fs/promises';

const lines=Array.from({length:13},(_,i)=>({description:'PRINTED ITEM '+i,quantity:1,netAmount:1,grossAmount:1.13}));
test('line review needs multiple distinct matching physical rows and corroborating totals, never only an equal amount',()=>{
 const right=lines.map(l=>({...l,description:l.description+'#'}));
 assert.equal(compareInvoiceRowsForReview(lines,right).matchedRows,13);
 assert.equal(compareInvoiceRowsForReview(lines,right.map((l,i)=>({...l,description:'OTHER ITEM '+i}))),null);
 assert.equal(compareInvoiceRowsForReview(lines,right.slice(1)),null);
 assert.equal(compareInvoiceRowsForReview(lines,right.map(l=>({...l,quantity:2}))),null);
 assert.equal(compareInvoiceRowsForReview(lines,Array(13).fill(right[0])),null);
 assert.equal(compareInvoiceRowsForReview(lines,right.map(l=>({...l,grossAmount:Infinity}))),null);
 const partial=right.map((l,i)=>i<8?l:{...l,description:'different '+i});
 assert.equal(compareInvoiceRowsForReview(lines,partial).matchedRows,8);
 partial[0].quantity=2;assert.equal(compareInvoiceRowsForReview(lines,partial),null);
});
test('actual purchase order renderer suppresses obsolete pending OCR diagnostics only for invoiced orders',async()=>{
 const source=await readFile(new URL('../../client/src/components/commerce/installPurchaseOrdersSuite.js',import.meta.url),'utf8');
 const line=source.split('\n').find(l=>l.startsWith('const ocrJobDiagnostic='));
 const render=new Function('esc','fmt',line+';return ocrJobDiagnostic')(v=>v,v=>v);
 const job={status:'AWAITING_APPROVAL',stage:'MYDATA_DRAFT_READY',updatedAt:'now'};
 assert.equal(render(job,'INVOICED'),'');assert.match(render(job,'NEW'),/AWAITING_APPROVAL/);
 const descriptionLine=source.split('\n').find(l=>l.startsWith('const assistantDraftDescription='));
 const describe=new Function(descriptionLine+';return assistantDraftDescription')();
 assert.doesNotMatch(describe('myDATA — Ανάγνωση από βοηθό — ΠΡΟΣ ΕΛΕΓΧΟ','INVOICED'),/ΠΡΟΣ ΕΛΕΓΧΟ/);
 assert.match(describe('myDATA — ΠΡΟΣ ΕΛΕΓΧΟ','NEW'),/ΠΡΟΣ ΕΛΕΓΧΟ/);
});
async function seedWrong(f){
 await f.seed({posLines:0,mydataLines:0});
 await f.db.$executeRawUnsafe(`UPDATE "PurchaseOrder" SET "supplierId"=NULL WHERE "id"='mydata'`);
 await f.db.$executeRawUnsafe(`UPDATE "PurchaseDocument" SET "supplierId"=NULL WHERE "id"='d-mydata'`);
 await f.db.$executeRawUnsafe(`UPDATE "PurchaseOrder" SET "invoiceNumber"=CASE WHEN "id"='pos' THEN '146066' ELSE '1ΤΔΑ 846666' END`);
 await f.db.$executeRawUnsafe(`UPDATE "PurchaseDocument" SET "documentNumber"=CASE WHEN "id"='d-pos' THEN '146066' ELSE '1ΤΔΑ 846666' END,"documentDate"=CASE WHEN "id"='d-pos' THEN '2026-07-14'::timestamptz ELSE '2026-10-14'::timestamptz END,"totalGross"=CASE WHEN "id"='d-pos' THEN 12.34 ELSE 14.69 END`);
 await f.db.$executeRawUnsafe(`UPDATE "MyDataInboundDocument" SET "series"='1ΤΔΑ',"documentNumber"='846666',"issueDate"='2026-10-14',"totalGross"=14.69`);
 for(const order of ['pos','mydata'])for(let i=0;i<13;i++)await f.db.$executeRaw`INSERT INTO "PurchaseOrderLine"("id","orderId","productId","supplierCode","description","quantity","unitCost","netAmount","vatRate","vatAmount","grossAmount") VALUES(${order+'-'+i},${order},'p',${'CODE'+i},${'PRINTED ITEM '+i+(order==='mydata'?'#':'')},1,1,1,13,.13,1.13)`;
}
const scope={companyId:'c',storeId:'s',inboxId:'inbox'};
for(const selectedRowsOrderId of ['pos','mydata'])test('native wrong-number/date/header pair requires explicit review and keeps one complete rowset, original files and unchanged payment: '+selectedRowsOrderId,{skip:!isolatedInvoiceDb()},async()=>{
 const f=await invoiceDbFixture();try{
  await seedWrong(f);const {db}=f;
  const rows=async()=>JSON.stringify(await db.$queryRaw`SELECT row_to_json(l) AS row FROM "PurchaseOrderLine" l ORDER BY "id"`);
  const before=await f.snapshot(),rowBefore=await rows(),filesBefore=JSON.stringify(await db.$queryRaw`SELECT * FROM "DocumentAttachment" ORDER BY "id"`);
  const preview=await previewInvoiceReconciliation(db,scope),pos=preview.orders.find(o=>o.orderId==='pos');
  assert.equal(pos.headerReviewRequired,true);assert.equal(pos.lineEvidence.matchedRows,13);assert.equal(pos.exact,false);
  assert.equal(preview.orders.length,2);
  for(const sourceDocumentId of ['d-pos','d-mydata'])await assert.rejects(db.$transaction(tx=>assertInvoiceStockAvailable(tx,{companyId:'c',storeId:'s',sourceDocumentId})),e=>e.code==='INVOICE_LINE_IDENTITY_REVIEW');
  const input={posOrderId:'pos',expectedVersion:preview.version,confirmSameInvoice:true,confirmMark:preview.mark,confirmPaymentDiscrepancy:true,selectedRowsOrderId,reason:'Both printed originals reviewed',actorId:'owner'};
  await assert.rejects(db.$transaction(tx=>reconcileInvoiceDrafts(tx,scope,input)),e=>e.code==='INVOICE_HEADER_REVIEW_REQUIRED');
  await assert.rejects(db.$transaction(tx=>reconcileInvoiceDrafts(tx,scope,{...input,confirmHeaderCorrection:true,reason:'short'})),e=>e.code==='INVOICE_HEADER_REVIEW_REQUIRED');
  assert.equal(await f.snapshot(),before);assert.equal(await rows(),rowBefore);
  const results=await Promise.all(Array.from({length:3},()=>db.$transaction(tx=>reconcileInvoiceDrafts(tx,scope,{...input,confirmHeaderCorrection:true}),{timeout:20000})));
  assert.ok(results.every(r=>r.orderId===selectedRowsOrderId));
  assert.equal((await db.$queryRaw`SELECT * FROM "PurchaseOrder" WHERE "status"='NEW'`).length,1);
  assert.equal((await db.$queryRaw`SELECT * FROM "InvoiceDraftAlias"`).length,1);
  assert.equal((await db.$queryRaw`SELECT "supplierId" FROM "PurchaseOrder" WHERE "id"=${selectedRowsOrderId}`)[0].supplierId,'sup');
  assert.equal((await db.$queryRaw`SELECT "supplierId" FROM "PurchaseDocument" WHERE "id"=${'d-'+selectedRowsOrderId}`)[0].supplierId,'sup');
  assert.equal((await db.$queryRaw`SELECT * FROM "PurchaseOrderLine" WHERE "orderId"=${selectedRowsOrderId}`).length,13);
  assert.equal(await rows(),rowBefore);assert.equal(await f.snapshot(),before);
  assert.equal(JSON.stringify(await db.$queryRaw`SELECT * FROM "DocumentAttachment" ORDER BY "id"`),filesBefore);
  const alias=(await db.$queryRaw`SELECT "details" FROM "InvoiceDraftAlias"`)[0];
  assert.equal(alias.details.headerCorrection,true);assert.equal(alias.details.lineEvidence.matchedRows,13);
  assert.equal((await db.$queryRaw`SELECT * FROM "InvoiceStockPosting"`).length,0);
 }finally{await f.close()}
});
test('native line review excludes equal amount without matching lines, other VAT/store/type and stale line edits',{skip:!isolatedInvoiceDb()},async()=>{
 const f=await invoiceDbFixture();try{
  await seedWrong(f);const p=await previewInvoiceReconciliation(f.db,scope);
  await f.db.$executeRawUnsafe(`UPDATE "PurchaseOrderLine" SET "description"='Other physical item' WHERE "orderId"='pos'`);
  assert.equal((await previewInvoiceReconciliation(f.db,scope)).orders.some(o=>o.orderId==='pos'),false);
  await f.db.$executeRawUnsafe(`UPDATE "PurchaseOrderLine" SET "description"='PRINTED ITEM '||SUBSTRING("id" FROM '[0-9]+$') WHERE "orderId"='pos'`);
  await f.db.$executeRawUnsafe(`UPDATE "Supplier" SET "taxId"='011111111'`);
  assert.equal((await previewInvoiceReconciliation(f.db,scope)).orders.some(o=>o.orderId==='pos'),false);
  await f.db.$executeRawUnsafe(`UPDATE "Supplier" SET "taxId"='099999999'`);
  await f.db.$executeRawUnsafe(`UPDATE "PurchaseDocument" SET "documentType"='CREDIT_NOTE' WHERE "id"='d-pos'`);
  assert.equal((await previewInvoiceReconciliation(f.db,scope)).orders.some(o=>o.orderId==='pos'),false);
  await f.db.$executeRawUnsafe(`UPDATE "PurchaseDocument" SET "documentType"='INVOICE' WHERE "id"='d-pos'`);
  await assert.rejects(previewInvoiceReconciliation(f.db,{...scope,storeId:'control'}),e=>e.status===404);
  await f.db.$executeRawUnsafe(`UPDATE "PurchaseOrderLine" SET "quantity"=2 WHERE "id"='pos-0'`);
  const before=await f.snapshot();
  await assert.rejects(f.db.$transaction(tx=>reconcileInvoiceDrafts(tx,scope,{posOrderId:'pos',expectedVersion:p.version,confirmSameInvoice:true,confirmMark:p.mark,confirmHeaderCorrection:true,confirmPaymentDiscrepancy:true,selectedRowsOrderId:'pos',reason:'Both originals reviewed after OCR'})),e=>e.code==='INVOICE_RECONCILIATION_STALE');
  assert.equal(await f.snapshot(),before);
 }finally{await f.close()}
});
test('native inbox business status follows exact scoped order despite stale AI/inbox labels; filters/count/export agree and conflicts never choose a draft',{skip:!isolatedInvoiceDb()},async()=>{
 const f=await invoiceDbFixture();try{
  await f.seed();const {db}=f;
  await db.$executeRawUnsafe(`ALTER TABLE "DocumentInbox" ADD "receivedAt" timestamp DEFAULT NOW(),ADD "supplierId" text,ADD "responsibleName" text`);
  await db.$executeRawUnsafe(`ALTER TABLE "MyDataInboundDocument" ADD "currency" text,ADD "totalNet" numeric,ADD "totalVat" numeric`);
  await db.$executeRawUnsafe(`UPDATE "PurchaseOrder" SET "status"='INVOICED' WHERE "id"='mydata'`);
  const run=async(processing,count=false)=>{const q=archiveQuery('c','s',{processing},count);return db.$queryRawUnsafe(q.sql,...q.values)};
  const before=await f.snapshot(),registered=await run('REGISTERED');
  assert.equal(registered.length,1);assert.equal(registered[0].linkedOrderId,'mydata');assert.equal(registered[0].status,'IN_REVIEW');assert.match(archiveStatus(registered[0]),/Τιμολογημένο/);
  assert.equal((await run('PENDING')).length,0);assert.equal((await run('REGISTERED',true))[0].count,1);
  await db.$executeRawUnsafe(`INSERT INTO "AiReaderJob"("id","companyId","storeId","attachmentId","purchaseDocumentId") VALUES('conflict','c','s','pdf','d-pos')`);
  assert.equal((await run('REGISTERED')).length,0);
  const conflict=(await run('LINK_REVIEW'))[0];assert.equal(conflict.linkedOrderId,null);
  await db.$executeRawUnsafe(`DELETE FROM "AiReaderJob" WHERE "id"='conflict'`);
  await db.$executeRawUnsafe(`UPDATE "PurchaseDocument" SET "storeId"='control' WHERE "id"='d-mydata'`);
  assert.equal((await run('REGISTERED')).length,0);assert.equal((await run('LINK_REVIEW')).length,1);
  assert.equal(await f.snapshot(),before);
 }finally{await f.close()}
});

test('registered invoice opening uses only the existing detail GET; ordinary draft opening retains OCR reconciliation',async()=>{
 const source=await readFile(new URL('../../client/src/components/commerce/installPurchaseOrdersSuite.js',import.meta.url),'utf8');
 const line=source.split('\n').find(l=>l.startsWith('async function openOrder('));assert.ok(line);
 const calls=[],shown=[],state={storeId:'s'};
 const api=async(path,options={})=>{calls.push({path,options});return {order:{id:path.includes('/draft/')?'draft':'registered',status:path.includes('/draft/')?'NEW':'INVOICED'}}};
 const open=new Function('api','state','posContext','showOrder','notify',line+';return openOrder')(api,state,null,(...args)=>shown.push(args),e=>{throw Error(String(e))});
 await open({isConnected:true},'registered','',null,false,true);
 assert.equal(calls.length,1);assert.equal(calls[0].path,'/api/purchase-orders/registered/detail');assert.equal(calls[0].options.method,undefined);assert.equal(shown.length,1);
 calls.length=0;await open({isConnected:true},'draft');
 assert.match(calls[0].path,/detail$/);assert.equal(calls[0].options.method,undefined);assert.equal(calls[1].options.method,'POST');assert.match(calls[1].path,/reconcile-ocr-total$/);assert.match(calls[2].path,/detail$/);
 calls.length=0;await open({isConnected:true},'registered');assert.equal(calls.length,1);assert.equal(calls[0].options.method,undefined);
});

test('registered inbox activation reads the purchase list without background OCR recovery; ordinary activation retains recovery',async()=>{
 const source=await readFile(new URL('../../client/src/components/commerce/installPurchaseOrdersSuite.js',import.meta.url),'utf8');
 const activate=source.split('\n').find(l=>l.startsWith('function activate('));
 const report=source.slice(source.indexOf('async function loadReport('),source.indexOf('async function loadStock('));
 const calls=[],state={storeId:'s',tab:'orders'},root={isConnected:true};
 const api=async(path,options={})=>{calls.push({path,options});return {orders:[]}};
 const noop=()=>{};
 const open=new Function('api','state','render','nativeVisibility','updateRefreshControls','qReport','notify',`let reportRequestId=0;let posContext=null;${report}\n${activate};return activate`)(api,state,noop,noop,noop,()=>new URLSearchParams(),e=>{throw Error(String(e))});
 const hub={querySelector:()=>root},button={classList:{add:noop}};
 open(hub,button,true);await new Promise(resolve=>setImmediate(resolve));
 assert.equal(calls.length,1);assert.match(calls[0].path,/purchase-orders\/report/);assert.equal(calls[0].options.method,undefined);
 calls.length=0;open(hub,button);await new Promise(resolve=>setImmediate(resolve));
 assert.equal(calls.length,2);assert.equal(calls[1].path,'/api/commerce/ai-reader/fast-recover');assert.equal(calls[1].options.method,'POST');
 assert.match(source,/activate\(hub,button,event\.detail\.readOnly===true\)/);
});
