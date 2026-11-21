import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import {z} from 'zod';
import {retainCapturedPaymentOriginal} from '../src/lib/invoice-recovery-original.js';
import {findInvoicePayment,assertReusableInvoicePayment} from '../src/lib/invoice-payment-reuse.js';
import {lockInvoiceStore} from '../src/lib/invoice-common-draft.js';
import {invoiceDbFixture,isolatedInvoiceDb} from './helpers/invoice-common-draft-fixture.js';

test('ordinary legacy draft sources without a capture registry keep existing behavior',async()=>{
 let queries=0;
 assert.equal(await retainCapturedPaymentOriginal({$queryRaw:async()=>{queries++;return [{relation:null}]}},{companyId:'c',storeId:'s'},'payment'),false);
 assert.equal(queries,1);
});
test('a registry with no exact capture never grants recovery or changes anything',async()=>{
 let queries=0;
 assert.equal(await retainCapturedPaymentOriginal({$queryRaw:async()=>++queries===1?[{relation:'audit'}]:[]},{companyId:'c',storeId:'s'},'payment'),false);
 assert.equal(queries,2);
});
test('native actual paid-draft factory retains capture bytes and proof, rolls back corruption and never resurrects deleted draft',{skip:!isolatedInvoiceDb()},async()=>{
 const f=await invoiceDbFixture();
 try{
  await f.seed({pos:false,mydata:false});
  await f.db.$executeRawUnsafe('ALTER TABLE "StoreTransaction" ADD COLUMN "actorId" text,ADD COLUMN "attachmentMimeType" text,ADD COLUMN "attachmentChecksum" text,ADD COLUMN "attachmentData" text');
  await f.db.$executeRawUnsafe('CREATE TABLE "StoreOperatorAudit"("id" text PRIMARY KEY,"companyId" text,"storeId" text,"actorId" text,"eventType" text,"details" jsonb)');
  const bytes=Buffer.from('%PDF-1.4\n'+'Synthetic immutable source\n'.repeat(10)+'%%EOF'),checksum=crypto.createHash('sha256').update(bytes).digest('hex'),data='data:application/pdf;base64,'+bytes.toString('base64');
  const suffix=crypto.createHash('sha256').update('payment').digest('hex');
  const identity={companyId:'c',storeId:'s',supplierId:'sup',documentNumber:'21-ΤΔΑ 006836',documentDate:'2026-10-12',totalGross:3.39};
  const proof={version:'POS_DEFERRED_INVOICE_V1',sourceKind:'PLAIN_CAPTURE',transactionId:'payment',fingerprint:'a'.repeat(64),originalActorId:'original-operator',contextSessionId:'historical-shift',supplierId:'sup',documentNumber:identity.documentNumber,documentDate:identity.documentDate,amountCents:339,filename:'original.pdf',mimeType:'application/pdf',checksum,manifest:[{mimeType:'application/pdf',checksum}]};
  const intent={...proof};delete intent.sourceKind;
  await f.db.$executeRaw`UPDATE "StoreTransaction" SET "actorId"='original-operator',"attachmentFilename"='original.pdf',"attachmentMimeType"='application/pdf',"attachmentChecksum"=${checksum},"attachmentData"=${data} WHERE "id"='payment'`;
  await f.db.$executeRaw`INSERT INTO "StoreOperatorAudit" VALUES (${'pi_capture_'+suffix},'c','s','original-operator','POS_INVOICE_PLAIN_CAPTURED',${JSON.stringify(proof)}::jsonb),(${'pi_pending_'+suffix},'c','s','original-operator','POS_INVOICE_PENDING_CREATED',${JSON.stringify(intent)}::jsonb)`;
  await f.db.$executeRaw`INSERT INTO "AiReaderJob"("id","companyId","storeId","status") VALUES ('recovery-job','c','s','POS_QUEUED')`;
  const source=fs.readFileSync(new URL('../src/routes/commerce-pos-v244-core.js',import.meta.url),'utf8'),a=source.indexOf('router.post("/ai-reader/jobs/:jobId/pos-draft"'),b=source.indexOf('\n});',a)+4,registration=source.slice(a,b),handler=registration.slice(registration.indexOf('async(req,res,next)=>'),-2).trim();
  const deps={z,prisma:f.db,id:crypto.randomUUID,lockInvoiceStore,retainCapturedPaymentOriginal,findInvoicePayment,assertReusableInvoicePayment,ensureInvoiceCommonDraftSchema:async()=>{},assertNoUnresolvedInbound:async()=>{},reuseInboundDraftForPosJob:async()=>null,findUnlinkedMyDataOriginal:async()=>null,bindUnlinkedMyDataOriginal:async()=>{},duplicateInvoice:async()=>null};
  const route=new Function(...Object.keys(deps),'return '+handler)(...Object.values(deps));
  const request=async()=>{let status,error,body;const res={status(n){status=n;return this},json(v){body=v;return this}};await route({user:{id:'reviewer',companyId:'c',role:'OWNER'},params:{jobId:'recovery-job'},body:{...identity,documentType:'INVOICE',settlementMode:'PAID',paymentTransactionId:'payment'}},res,e=>{error=e});return {status,error,body}};
  const immutable=async()=>JSON.stringify({payment:await f.db.$queryRaw`SELECT * FROM "StoreTransaction" ORDER BY "id"`,audit:await f.db.$queryRaw`SELECT * FROM "StoreOperatorAudit" ORDER BY "id"`,controls:await f.snapshot()});
  const before=await immutable();
  for(const changed of [{checksum:'b'.repeat(64)},{filename:'replacement.pdf'},{originalActorId:'other'},{fingerprint:'b'.repeat(64)}]){
   await f.db.$executeRaw`UPDATE "StoreOperatorAudit" SET "details"=${JSON.stringify({...proof,...changed})}::jsonb WHERE "eventType"='POS_INVOICE_PLAIN_CAPTURED'`;
   const denied=await request();assert.equal(denied.error?.code,'INVOICE_RECOVERY_ORIGINAL_CHANGED');assert.equal((await f.db.$queryRaw`SELECT COUNT(*)::int AS n FROM "PurchaseDocument"`)[0].n,0);
  }
  await f.db.$executeRaw`UPDATE "StoreOperatorAudit" SET "details"=${JSON.stringify(proof)}::jsonb WHERE "eventType"='POS_INVOICE_PLAIN_CAPTURED'`;
  assert.equal(await immutable(),before);
  const created=await request();assert.equal(created.error,undefined);assert.equal(created.status,201);assert.equal(created.body.stockUpdated,false);assert.equal(await immutable(),before);
  const document=await f.db.$queryRaw`SELECT "id","paymentTransactionId","status" FROM "PurchaseDocument"`;
  assert.equal(document.length,1);assert.equal(document[0].paymentTransactionId,'payment');assert.equal(document[0].status,'DRAFT');
  const replay=await request();assert.equal(replay.body.documentId,created.body.documentId);assert.equal(replay.body.reused,true);assert.equal(await immutable(),before);
  await f.db.$executeRaw`DELETE FROM "PurchaseDocument" WHERE "id"=${created.body.documentId}`;
  const deleted=await request();assert.equal(deleted.error?.status,409);assert.equal((await f.db.$queryRaw`SELECT COUNT(*)::int AS n FROM "PurchaseDocument"`)[0].n,0);assert.equal(await immutable(),before);
 }finally{await f.close()}
});
