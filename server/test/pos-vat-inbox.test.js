import {walletActivityFromRequest,publicWalletActivity} from "../src/services/ai-wallet-activity.js";
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {invoiceDbFixture,isolatedInvoiceDb} from './helpers/invoice-common-draft-fixture.js';
import {sameInvoiceNumber,invoiceNumberParts,lockInvoiceStore,previewInvoiceReconciliation} from '../src/lib/invoice-common-draft.js';

const row={inboxId:'inbox',issuerVat:'099999999',counterpartVat:'088888888',mark:'400015624303633',series:'21-ΤΔΑ',documentNumber:'6836',issueDate:new Date('2026-10-12'),currency:'EUR',invoiceType:'1.1',totalGross:3.39,inboxStatus:'IN_REVIEW',mimeType:'application/pdf'};
async function library(){
 const src=(await readFile(new URL('../src/lib/pos-inbox-original.js',import.meta.url),'utf8')).replace(/^import .*;\n/gm,'').replace(/export /g,'');
 const reader=async()=>({text:'400015624303633 099999999 088888888 6836',pageCount:2});
 const verify=(text,r)=>{for(const s of [r.mark,r.issuerVat,r.counterpartVat,r.documentNumber])assert.ok(text.includes(s))};
 return new Function('publicWalletActivity','crypto','sameInvoiceNumber','invoiceNumberParts','lockInvoiceStore','previewInvoiceReconciliation','readOriginalPdf','verifyOriginalText','fetchOriginalPdf','acquireOriginal',src+'\nreturn {inboxHeader,verifiedInboxPdf,selectedInboxRow,prepareSelectedInbox,queueEmptyInboxRead,assertEmptyInboxRead,assertInboxSelectionUnambiguous};')(publicWalletActivity,crypto,sameInvoiceNumber,invoiceNumberParts,lockInvoiceStore,previewInvoiceReconciliation,reader,verify,()=>{throw Error('unexpected network')},()=>{throw Error('unexpected write')});
}
async function handler(db,lib,readPdf){
 const src=(await readFile(new URL('../src/routes/commerce-pos-inbox.js',import.meta.url),'utf8')).replace(/^import .*;\n/gm,'').replace(/export /g,'');
 return new Function('prisma','assertCustomerDemoOutboundAllowed','inboxHeader','selectedInboxRow','verifiedInboxPdf',src+'\nreturn createPosInboxHandler;')(db,()=>{},lib.inboxHeader,lib.selectedInboxRow,lib.verifiedInboxPdf)({database:db,readPdf});
}
async function invoke(h,body,user={companyId:'c',id:'owner',role:'OWNER'}){let result,failure,status=200;const res={set(){},status:n=>(status=n,res),json:v=>result=v};await h({body,user},res,e=>failure=e);return {result,failure,status};}
test('inbox header and original validation reject recipient/type/currency and unsafe PDF; header lookup does not create a job',async()=>{
 const lib=await library();assert.equal(lib.inboxHeader(row,'088888888').documentNumber,'21-ΤΔΑ 6836');
 for(const patch of [{counterpartVat:'011111111'},{invoiceType:'5.1'},{currency:'USD'},{totalGross:0},{mark:''}])assert.throws(()=>lib.inboxHeader({...row,...patch},'088888888'));
 const bytes=Buffer.from('%PDF-'+ 'a'.repeat(110)),dataUrl='data:application/pdf;base64,'+bytes.toString('base64');
 assert.equal((await lib.verifiedInboxPdf(row,dataUrl)).pageCount,2);
 await assert.rejects(lib.verifiedInboxPdf(row,'data:image/png;base64,abcd'));
 await assert.rejects(lib.verifiedInboxPdf(row,dataUrl,{reader:async()=>({text:'missing',pageCount:2})}));
 await assert.rejects(lib.verifiedInboxPdf(row,dataUrl,{reader:async()=>({text:'400015624303633 099999999 088888888 6836',pageCount:6})}));
});
test('actual POS inbox handler denies unowned/permissionless roles before data access, scopes VAT/store, and does not write',async()=>{
 const lib=await library(),calls=[];const db={store:{findFirst:async args=>{calls.push(args);return {id:'s',companyId:'c',company:{taxId:'088888888'}}}},$queryRaw:async(strings,...values)=>{calls.push({sql:strings.join('?'),values});return [row]}};
 const h=await handler(db,lib,async()=>({bytes:Buffer.from('%PDF-'+'a'.repeat(110)),filename:'original.pdf',pageCount:2}));
 const body={storeId:'s',taxId:'099999999'};
 for(const user of [{companyId:'c',role:'EMPLOYEE',storeId:'other',permissions:['SUPPLIER_PAYMENT']},{companyId:'c',tokenType:'STORE_OPERATOR',storeId:'s',permissions:[]},{companyId:'c',role:'CASHIER'}])assert.equal((await invoke(h,body,user)).status,403);
 assert.equal(calls.length,0);assert.equal((await invoke(h,{...body,storeId:''})).status,400);
 const result=await invoke(h,body);assert.equal(result.result.items.length,1);assert.deepEqual(calls[0].where,{id:'s',companyId:'c',active:true});assert.ok(calls[1].sql.includes('m."issuerVat"=?'));assert.ok(calls[1].values.includes('099999999'));
 assert.equal((await invoke(h,{...body,inboxId:'inbox'})).result.header.mark,row.mark);
 assert.equal((await invoke(h,{...body,taxId:'011111111',inboxId:'inbox'})).status,409);
});
test('native actual selected-store inbox SQL and concurrent empty draft queue preserve financial/stock/control rows',{skip:!isolatedInvoiceDb()},async()=>{
 const f=await invoiceDbFixture();try{
  await f.seed({pos:false,mydata:true,payment:true});
  await f.db.$executeRawUnsafe(`ALTER TABLE "DocumentInbox" ADD COLUMN "supplierId" text,ADD COLUMN "receivedAt" timestamptz DEFAULT NOW()`);
  await f.db.$executeRawUnsafe(`ALTER TABLE "MyDataInboundDocument" ADD COLUMN "currency" text DEFAULT 'EUR'`);
  const lib=await library(),db={store:{findFirst:async()=>({id:'s',companyId:'c',company:{taxId:'088888888'}})},$queryRaw:f.db.$queryRaw.bind(f.db)},h=await handler(db,lib,async()=>({bytes:Buffer.from('%PDF-'+ 'a'.repeat(110)),filename:'original.pdf',pageCount:1}));
  const before=await f.snapshot();assert.equal((await invoke(h,{storeId:'s',taxId:'099999999'})).result.items[0].inboxId,'inbox');
  assert.equal((await invoke(h,{storeId:'s',taxId:'099999999',number:'NO-SUCH'})).result.items.length,0);
  assert.equal((await invoke(h,{storeId:'s',taxId:'011111111'})).result.items.length,0);
  await assert.rejects(lib.selectedInboxRow(f.db,'foreign','s','inbox'));await assert.rejects(lib.selectedInboxRow(f.db,'c','control','inbox'));
  const identity={companyId:'c',storeId:'s',supplierId:'sup',supplierTaxId:'099999999',documentNumber:'21-ΤΔΑ 6836',documentDate:'2026-10-12',totalGross:3.39,documentType:'INVOICE'},match={jobId:'j-pdf',purchaseNumber:identity.documentNumber};
  const activity=walletActivityFromRequest({user:{id:"pos-caller",tokenType:"STORE_OPERATOR",companyId:"c",storeId:"s",fullName:"Synthetic operator",role:"EMPLOYEE"}},{storeId:"s",purpose:"PAYMENT_INVOICE_READ",jobId:match.jobId});
  const queued=await Promise.all(Array.from({length:4},()=>lib.queueEmptyInboxRead(f.db,identity,match,{id:"payment"},activity)));assert.equal(queued.filter(Boolean).length,1);
  const job=(await f.db.$queryRawUnsafe(`SELECT * FROM "AiReaderJob" WHERE "id"='j-pdf'`))[0];assert.equal(job.status,'POS_DRAFT_READY');assert.equal(job.resultJson.posHandoff.inboxInitialRead,true);assert.deepEqual(job.resultJson.posHandoff.pageJobIds,['j-pdf']);assert.equal(job.resultJson.posHandoff.paymentTransactionId,'payment');assert.equal(job.resultJson.posHandoff.settlementMode,'PAID');assert.equal(job.resultJson.posHandoff.walletActivity.actor.id,'pos-caller');assert.equal(job.resultJson.posHandoff.walletActivity.jobId,'j-pdf');
  assert.equal(await f.snapshot(),before);assert.equal((await f.db.$queryRawUnsafe(`SELECT COUNT(*)::int AS n FROM "PurchaseOrder"`))[0].n,1);
 }finally{await f.close()}
});
test('native populated/reviewed/posted inbox jobs cannot queue initial reading',{skip:!isolatedInvoiceDb()},async()=>{
 for(const change of ["UPDATE \"PurchaseOrder\" SET \"status\"='FINAL'", "UPDATE \"PurchaseDocument\" SET \"status\"='APPROVED'", "INSERT INTO \"PurchaseOrderLine\"(\"id\",\"orderId\",\"description\") VALUES('reviewed','mydata','Keep row')", "INSERT INTO \"PurchaseDocumentLine\"(\"id\",\"purchaseDocumentId\",\"description\") VALUES('reviewed','d-mydata','Keep row')"]){const f=await invoiceDbFixture();try{await f.seed({pos:false,mydata:true,payment:false});await f.db.$executeRawUnsafe(change);const lib=await library(),before=await f.snapshot();assert.equal(await lib.queueEmptyInboxRead(f.db,{companyId:'c',storeId:'s'},{jobId:'j-pdf'},null),false);assert.equal(await f.snapshot(),before);assert.equal((await f.db.$queryRawUnsafe(`SELECT "status" FROM "AiReaderJob" WHERE "id"='j-pdf'`))[0].status,'AWAITING_APPROVAL')}finally{await f.close()}}
});
test('native final empty-row fence used by real intake refuses concurrent reviewed rows and changed headers without financial effect',{skip:!isolatedInvoiceDb()},async()=>{
 const f=await invoiceDbFixture();try{
  await f.seed({pos:false,mydata:true,payment:true});const lib=await library(),identity={companyId:'c',storeId:'s',supplierId:'sup',documentType:'INVOICE',documentNumber:'21-ΤΔΑ 6836',documentDate:new Date('2026-10-12'),totalGross:3.39};
  await f.db.$transaction(tx=>lib.assertEmptyInboxRead(tx,identity,'d-mydata','mydata'));const before=await f.snapshot();
  await f.db.$executeRawUnsafe(`INSERT INTO "PurchaseOrderLine"("id","orderId","description","quantity") VALUES('reviewed','mydata','Human-reviewed row',3)`);
  await assert.rejects(f.db.$transaction(tx=>lib.assertEmptyInboxRead(tx,identity,'d-mydata','mydata')),/γραμμές διατηρήθηκαν/);
  assert.equal((await f.db.$queryRawUnsafe(`SELECT "description" FROM "PurchaseOrderLine" WHERE "id"='reviewed'`))[0].description,'Human-reviewed row');
  await f.db.$executeRawUnsafe(`DELETE FROM "PurchaseOrderLine" WHERE "id"='reviewed'`);
  for(const patch of [{companyId:'foreign'},{storeId:'control'},{documentNumber:'22-ΤΔΑ 6836'},{supplierId:'other'},{totalGross:9},{documentDate:new Date('2026-10-13')}])await assert.rejects(f.db.$transaction(tx=>lib.assertEmptyInboxRead(tx,{...identity,...patch},'d-mydata','mydata')));
  assert.equal(await f.snapshot(),before);
  const src=await readFile(new URL('../src/routes/commerce-pos-v244-core.js',import.meta.url),'utf8');assert.ok(src.indexOf('await assertEmptyInboxRead(tx,')<src.indexOf('stage="replace-purchase-lines"'));
 }finally{await f.close()}
});
test('native selected-inbox pre-payment gate blocks an existing duplicate or missing-VAT POS candidate before any second charge',{skip:!isolatedInvoiceDb()},async()=>{
 for(const kind of ['duplicate','missingVat','mydataOnly']){const f=await invoiceDbFixture();try{
  await f.seed({pos:kind!=='mydataOnly',mydata:true,payment:true});
  if(kind==='missingVat'){
   await f.db.$executeRawUnsafe(`INSERT INTO "Supplier"("id","companyId","taxId","name") VALUES('ocr','c',NULL,'Short OCR supplier')`);
   await f.db.$executeRawUnsafe(`UPDATE "PurchaseOrder" SET "supplierId"='ocr' WHERE "id"='pos'`);await f.db.$executeRawUnsafe(`UPDATE "PurchaseDocument" SET "supplierId"='ocr' WHERE "id"='d-pos'`);
  }
  const lib=await library(),before=await f.snapshot();
  if(kind==='mydataOnly')assert.equal((await lib.assertInboxSelectionUnambiguous(f.db,{companyId:'c',storeId:'s',inboxId:'inbox'})).orders.length,1);
  else await assert.rejects(lib.assertInboxSelectionUnambiguous(f.db,{companyId:'c',storeId:'s',inboxId:'inbox'}),/πριν από νέα πληρωμή/);
  assert.equal(await f.snapshot(),before);
 }finally{await f.close()}}
});
