import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import PDFDocument from 'pdfkit';
import {myDataPrintedEconomicsRowsFingerprint,readMyDataPrintedEconomicsReview} from '../src/lib/mydata-printed-economics-review.js';
import {invoiceDbFixture,isolatedInvoiceDb} from './helpers/invoice-common-draft-fixture.js';
import {acquireOriginal,prefillStoredMyDataDraft} from '../src/mydata-original.js';

const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const scope = {companyId:'c',storeId:'s',orderId:'mydata'};
const originalRow = () => ({id:'line',productId:null,supplierCode:'CODE',description:'Printed product',invoiceUnit:'PIECE',quantity:'12',unitCost:'3.100000',initialUnitCost:'3.100000',discount1:'38.79032258',discount2:'0',discount3:'0',exciseTotal:'0',vatRate:'13',netAmount:'22.77',vatAmount:'2.96',grossAmount:'25.73',stockUnitsPerInvoiceUnit:'1'});

test('printed economics fingerprint preserves exact decimals and every economic/source row field',()=>{
  const row=originalRow(),fingerprint=myDataPrintedEconomicsRowsFingerprint([row]);
  assert.match(fingerprint,/^[a-f0-9]{64}$/);
  assert.equal(myDataPrintedEconomicsRowsFingerprint([{...row,unitCost:'31e-1',quantity:'12.0000'}]),fingerprint);
  assert.equal(myDataPrintedEconomicsRowsFingerprint([{...row,discount2:'-0.000'}]),fingerprint);
  for(const [key,value] of Object.entries({discount1:'38.79032259',initialUnitCost:'3.100001',productId:'p',supplierCode:'OTHER',description:'Edited',invoiceUnit:'PACKAGE',stockUnitsPerInvoiceUnit:'12'}))
    assert.notEqual(myDataPrintedEconomicsRowsFingerprint([{...row,[key]:value}]),fingerprint,key);
  assert.equal(myDataPrintedEconomicsRowsFingerprint([{...row,unitCost:'NaN'}]),null);
  assert.equal(myDataPrintedEconomicsRowsFingerprint([{...row,quantity:null}]),null);
  assert.equal(myDataPrintedEconomicsRowsFingerprint([row,row]),null);
  assert.equal(myDataPrintedEconomicsRowsFingerprint(Array.from({length:251},(_,n)=>({...row,id:String(n)}))),null);
  assert.equal(myDataPrintedEconomicsRowsFingerprint([]),null);
});

test('printed economics optional reader rejects absent schema or absent scope without bootstrap/writes',async()=>{
  let reads=0;
  const db={$queryRaw:async()=>{reads++;return [];},$executeRaw:()=>assert.fail('Must remain read-only'),$executeRawUnsafe:()=>assert.fail('Must not bootstrap schema')};
  assert.equal(await readMyDataPrintedEconomicsReview(db,scope),null);assert.equal(reads,1);
  assert.equal(await readMyDataPrintedEconomicsReview(db,{companyId:'c',storeId:'',orderId:'mydata'}),null);assert.equal(reads,1);
});

async function fixture(){
  const f=await invoiceDbFixture();
  try{
    await f.seed({pos:false,payment:false});
    await f.db.$executeRawUnsafe('ALTER TABLE "PurchaseOrderLine" ADD COLUMN "initialUnitCost" numeric');
    await f.db.$executeRawUnsafe(`UPDATE "DocumentAttachment" SET "checksum"='${'a'.repeat(64)}' WHERE "id"='pdf'`);
    const row=originalRow();
    await f.db.$executeRaw`INSERT INTO "PurchaseOrderLine"("id","orderId","productId","supplierCode","description","quantity","unitCost","initialUnitCost","discount1","discount2","discount3","exciseTotal","vatRate","netAmount","vatAmount","grossAmount","invoiceUnit","stockUnitsPerInvoiceUnit") VALUES(${row.id},'mydata',NULL,${row.supplierCode},${row.description},12,3.1,3.1,38.79032258,0,0,0,13,22.77,2.96,25.73,'PIECE',1)`;
    const rawText='Synthetic server-captured original',xml='<invoice>synthetic exact XML source</invoice>';
    const result={source:'MYDATA_PROVIDER_ORIGINAL',myDataMark:'400015624303633',rawText,pageCount:1,providerOriginalTextProof:{version:'SERVER_PROVIDER_PDF_V1',pdfChecksum:'a'.repeat(64),rawTextSHA256:hash(rawText),pageCount:1,profile:'E_INVOICING_DETAILED_LINE_AMOUNT_V1'}};
    const marker={version:'MYDATA_PRINTED_ECONOMICS_V1',state:'VERIFIED',...scope,inboxId:'inbox',mark:'400015624303633',documentId:'d-mydata',jobId:'j-pdf',attachmentId:'pdf',supplierId:'sup',attachmentChecksum:'a'.repeat(64),rawTextSHA256:hash(rawText),xmlSHA256:hash(xml),rowsFingerprint:myDataPrintedEconomicsRowsFingerprint([row]),lineCount:1,reason:'PRINTED_LINE_AMOUNT_CONFIRMED',discountAmountTotal:'14.43',rows:[{lineId:'line',printedDiscountSteps:[{kind:'LINE_AMOUNT',amount:'14.43'}]}]};
    await f.db.$executeRaw`UPDATE "AiReaderJob" SET "resultJson"=${JSON.stringify(result)}::jsonb WHERE "id"='j-pdf'`;
    await f.db.$executeRaw`UPDATE "MyDataInboundDocument" SET "rawPayload"="rawPayload"||${JSON.stringify({xml,printedEconomicsReview:marker})}::jsonb WHERE "id"='m'`;
    return {...f,marker,result,xml};
  }catch(error){await f.close();throw error;}
}

test('native printed economics observer binds source/rows/supplier, survives description rename, and never writes', {skip:!isolatedInvoiceDb(),timeout:180000},async t=>{
  const f=await fixture();try{
    const read=()=>readMyDataPrintedEconomicsReview(f.db,scope);
    const base=await read();assert.equal(base.state,'VERIFIED');assert.equal(base.discountAmountTotal,'14.43');
    const businessBefore=await f.snapshot();
    await t.test('mutable description cannot hide the proof or unknown notice',async()=>{
      for(const description of ['An ordinary custom name','']){
        await f.db.$executeRaw`UPDATE "PurchaseOrder" SET "description"=${description} WHERE "id"='mydata'`;
        assert.equal((await read()).state,'VERIFIED');
      }
    });
    await t.test('last stored discount decimal and initial price invalidate rows',async()=>{
      await f.db.$executeRawUnsafe(`UPDATE "PurchaseOrderLine" SET "discount1"=38.79032259 WHERE "id"='line'`);
      assert.equal((await read()).reason,'STALE_ROWS');
      await f.db.$executeRawUnsafe(`UPDATE "PurchaseOrderLine" SET "discount1"=38.79032258,"initialUnitCost"=1.8975 WHERE "id"='line'`);
      assert.equal((await read()).reason,'STALE_ROWS');
      await f.db.$executeRawUnsafe(`UPDATE "PurchaseOrderLine" SET "initialUnitCost"=3.1 WHERE "id"='line'`);
      assert.equal((await read()).state,'VERIFIED');
    });
    await t.test('supplier header, XML, raw text and checksum changes are stale',async()=>{
      await f.db.$executeRawUnsafe(`UPDATE "PurchaseOrder" SET "supplierId"=NULL WHERE "id"='mydata'`);
      assert.equal((await read()).reason,'STALE_SOURCE');
      await f.db.$executeRawUnsafe(`UPDATE "PurchaseOrder" SET "supplierId"='sup' WHERE "id"='mydata'`);
      await f.db.$executeRawUnsafe(`UPDATE "MyDataInboundDocument" SET "rawPayload"=jsonb_set("rawPayload",'{xml}','"changed"') WHERE "id"='m'`);
      assert.equal((await read()).reason,'STALE_SOURCE');
      await f.db.$executeRaw`UPDATE "MyDataInboundDocument" SET "rawPayload"=jsonb_set("rawPayload",'{xml}',${JSON.stringify(f.xml)}::jsonb) WHERE "id"='m'`;
      await f.db.$executeRawUnsafe(`UPDATE "AiReaderJob" SET "resultJson"=jsonb_set("resultJson",'{rawText}','"changed"') WHERE "id"='j-pdf'`);
      assert.equal((await read()).reason,'STALE_SOURCE');
      await f.db.$executeRaw`UPDATE "AiReaderJob" SET "resultJson"=${JSON.stringify(f.result)}::jsonb WHERE "id"='j-pdf'`;
      await f.db.$executeRawUnsafe(`UPDATE "DocumentAttachment" SET "checksum"='${'b'.repeat(64)}' WHERE "id"='pdf'`);
      assert.equal((await read()).reason,'STALE_SOURCE');
      await f.db.$executeRawUnsafe(`UPDATE "DocumentAttachment" SET "checksum"='${'a'.repeat(64)}' WHERE "id"='pdf'`);
    });
    await t.test('cross-store/company/order and removed marker produce no summary',async()=>{
      for(const foreign of [{...scope,storeId:'control'},{...scope,companyId:'foreign'},{...scope,orderId:'pos'}])assert.equal(await readMyDataPrintedEconomicsReview(f.db,foreign),null);
      await f.db.$executeRawUnsafe(`UPDATE "MyDataInboundDocument" SET "rawPayload"="rawPayload"-'printedEconomicsReview' WHERE "id"='m'`);
      assert.equal(await read(),null);
      await f.db.$executeRaw`UPDATE "MyDataInboundDocument" SET "rawPayload"="rawPayload"||${JSON.stringify({printedEconomicsReview:{...f.marker,state:'UNKNOWN',reason:'MISSING_ORIGINAL_TEXT_PROOF'}})}::jsonb WHERE "id"='m'`;
      const unknown=await read();assert.equal(unknown.state,'UNKNOWN');assert.equal(unknown.reason,'MISSING_ORIGINAL_TEXT_PROOF');assert.equal(Object.hasOwn(unknown,'discountAmountTotal'),false);
    });
    assert.equal(await f.snapshot(),businessBefore);
  }finally{await f.close();}
});

const printedText = 'Synthetic original\nΚΩΔΙΚΟΣ\nΠΕΡΙΓΡΑΦΗ\nΜΜ\nΠΟΣΟΤΗΤΑ\nΤΙΜΗ ΜΟΝ.\nΑΞΙΑ ΠΡΟ ΕΚΠΤ.\nΕΚΠΤ.\nΚΑΘΑΡΗ ΑΞΙΑ\nΦΠΑ%\nTEST001\nSYNTHETIC PRODUCT\nΤΕΜ\n12,00\n3,10\n37,20\n14,43\n22,77\n13%\nΑξία προ έκπτωσης\n37,20EUR\nΈκπτωση\n14,43EUR\nΕπιβάρυνση\n0,00EUR\nΚαθαρή Αξία\n22,77EUR\nΦ.Π.Α\n2,96EUR\nΤΕΛΙΚΗ ΑΞΙΑ\n25,73EUR';
async function insertionFixture({fresh=false}={}){
 const f=await invoiceDbFixture();try{
  await f.seed({pos:false,mydata:!fresh,payment:false});
  await f.db.$executeRawUnsafe('ALTER TABLE "MyDataInboundDocument" ADD COLUMN "totalNet" numeric, ADD COLUMN "totalVat" numeric, ADD COLUMN "currency" text');
  await f.db.$executeRawUnsafe('ALTER TABLE "Product" ADD COLUMN "active" boolean DEFAULT true');
  await f.db.$executeRawUnsafe('ALTER TABLE "StoreProduct" ADD COLUMN "active" boolean DEFAULT true');
  await f.db.$executeRawUnsafe('ALTER TABLE "PurchaseOrderLine" ADD COLUMN "initialUnitCost" numeric(14,6)');
  await f.db.$executeRawUnsafe('ALTER TABLE "PurchaseOrderLine" ALTER COLUMN "unitCost" TYPE numeric(14,6), ALTER COLUMN "discount1" TYPE numeric(12,8), ALTER COLUMN "discount2" TYPE numeric(12,8), ALTER COLUMN "discount3" TYPE numeric(12,8)');
  const original='https://e-invoicing.gr/edocuments/ViewInvoice/-1/00000000-0000-0000-0000-000000000000_ABC123';
  const xml=`<invoice><downloadingInvoiceUrl>${original}</downloadingInvoiceUrl><invoiceDetails><lineNumber>1</lineNumber><itemCode>TEST001</itemCode><itemDescr>SYNTHETIC PRODUCT</itemDescr><quantity>12</quantity><measurementUnit>1</measurementUnit><netValue>22.77</netValue><vatCategory>2</vatCategory><vatAmount>2.96</vatAmount></invoiceDetails></invoice>`;
  const result={source:'MYDATA_PROVIDER_ORIGINAL',myDataMark:'400015624303633',rawText:printedText,pageCount:1,providerOriginalTextProof:{version:'SERVER_PROVIDER_PDF_V1',pdfChecksum:'a'.repeat(64),rawTextSHA256:hash(printedText),pageCount:1,profile:'E_INVOICING_DETAILED_LINE_AMOUNT_V1'}};
  await f.db.$executeRaw`UPDATE "MyDataInboundDocument" SET "totalNet"=22.77,"totalVat"=2.96,"totalGross"=25.73,"currency"='EUR',"rawPayload"="rawPayload"||${JSON.stringify({xml})}::jsonb WHERE "id"='m'`;
  await f.db.$executeRawUnsafe(`UPDATE "DocumentAttachment" SET "checksum"='${'a'.repeat(64)}' WHERE "id"='pdf'`);
  await f.db.$executeRaw`UPDATE "AiReaderJob" SET "resultJson"=${JSON.stringify(result)}::jsonb WHERE "id"='j-pdf'`;
  await f.db.$executeRawUnsafe(`UPDATE "PurchaseDocument" SET "totalGross"=25.73 WHERE "id"='d-mydata'`);
  if(fresh){
   await f.db.$executeRawUnsafe('ALTER TABLE "DocumentAttachment" ADD COLUMN "documentType" text, ADD COLUMN "storageKey" text');
   await f.db.$executeRawUnsafe('ALTER TABLE "AiReaderJob" ADD COLUMN "localConfidence" numeric, ADD COLUMN "requestedByUserId" text');
   await f.db.$executeRawUnsafe('DELETE FROM "AiReaderJob"');
   await f.db.$executeRawUnsafe('UPDATE "DocumentInbox" SET "attachmentId"=NULL,"status"=\'RECEIVED\'');
   await f.db.$executeRawUnsafe('DELETE FROM "DocumentAttachment"');
  }
  const acquire=()=>acquireOriginal(f.db,'c','s','inbox','owner',true,()=>assert.fail('Cached original must not redownload'));
  return {...f,acquire};
 }catch(error){await f.close();throw error;}
}

test('native delegated stored prefill fills one scoped draft and records one audit on replay',{skip:!isolatedInvoiceDb(),timeout:180000},async()=>{
 const f=await insertionFixture();
 try{
  await f.db.$executeRawUnsafe('CREATE TABLE "StoreOperatorAudit" ("id" text PRIMARY KEY,"companyId" text,"storeId" text,"operatorId" text,"actorId" text,"eventType" text,"details" jsonb)');
  const snapshot=await f.snapshot();
  const delegated={...scope,actorId:'staff'};
  let checks=0;
  const verify=async db=>{const rows=await db.$queryRaw`SELECT 1 AS active`;assert.equal(rows[0].active,1);checks++};
  await assert.rejects(()=>prefillStoredMyDataDraft(f.db,delegated,async()=>{throw new Error('grant revoked')}),/grant revoked/);
  await assert.rejects(()=>prefillStoredMyDataDraft(f.db,{...delegated,storeId:'control'},verify),error=>error.status===409);
  assert.deepEqual(await prefillStoredMyDataDraft(f.db,delegated,verify),{lineCount:1});
  assert.deepEqual(await prefillStoredMyDataDraft(f.db,delegated,verify),{lineCount:1});
  assert.equal(checks,3);
  assert.equal((await readMyDataPrintedEconomicsReview(f.db,scope)).state,'VERIFIED');
  const audits=await f.db.$queryRaw`SELECT "actorId","eventType" FROM "StoreOperatorAudit"`;
  assert.deepEqual(audits,[{actorId:'staff',eventType:'PURCHASE_MYDATA_PREFILLED'}]);
  assert.equal(await f.snapshot(),snapshot);
 }finally{await f.close();}
});

test('native first insert retains original costs and typed amount, replay/delete never refills or changes business identities', {skip:!isolatedInvoiceDb(),timeout:180000},async()=>{
 const f=await insertionFixture();try{
  const before=await f.snapshot();
  const counts=()=>f.db.$queryRawUnsafe('SELECT (SELECT COUNT(*)::int FROM "PurchaseOrder") AS orders,(SELECT COUNT(*)::int FROM "PurchaseDocument") AS documents,(SELECT COUNT(*)::int FROM "AiReaderJob") AS jobs,(SELECT COUNT(*)::int FROM "DocumentAttachment") AS attachments');
  const identities=await counts();
  await f.acquire();
  const rows=await f.db.$queryRawUnsafe('SELECT "id","unitCost"::text,"initialUnitCost"::text,"discount1"::text,"netAmount"::text FROM "PurchaseOrderLine"');
  assert.equal(rows.length,1);assert.equal(rows[0].unitCost,'3.100000');assert.equal(rows[0].initialUnitCost,'3.100000');assert.equal(rows[0].discount1,'38.79032258');assert.equal(rows[0].netAmount,'22.77');
  assert.equal((await readMyDataPrintedEconomicsReview(f.db,scope)).state,'VERIFIED');
  const [inbound]=await f.db.$queryRawUnsafe('SELECT "rawPayload" FROM "MyDataInboundDocument" WHERE "id"=\'m\'');
  assert.deepEqual(inbound.rawPayload.printedEconomicsReview.rows[0].printedDiscountSteps,[{kind:'LINE_AMOUNT',amount:'14.43'}]);
  await f.acquire();assert.deepEqual(await counts(),identities);
  await f.db.$executeRawUnsafe('DELETE FROM "PurchaseOrderLine"');await f.acquire();
  assert.equal((await f.db.$queryRawUnsafe('SELECT COUNT(*)::int AS count FROM "PurchaseOrderLine"'))[0].count,0);
  assert.equal(await f.snapshot(),before);
 }finally{await f.close();}
});

test('native incompatible SQL precision and persisted rewrite cannot receive VERIFIED economics', {skip:!isolatedInvoiceDb(),timeout:180000},async t=>{
 for(const kind of ['discount scale','unit-price scale','trigger rewrite','trigger identity rewrite'])await t.test(kind,async()=>{
  const f=await insertionFixture();try{
   if(kind==='discount scale')await f.db.$executeRawUnsafe('ALTER TABLE "PurchaseOrderLine" ALTER COLUMN "discount1" TYPE numeric(12,4)');
   if(kind==='unit-price scale')await f.db.$executeRawUnsafe('ALTER TABLE "PurchaseOrderLine" ALTER COLUMN "unitCost" TYPE numeric(14,0)');
   if(kind==='trigger rewrite'){
    await f.db.$executeRawUnsafe('CREATE FUNCTION rewrite_cost() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW."unitCost" := round(NEW."unitCost",0); RETURN NEW; END $$');
    await f.db.$executeRawUnsafe('CREATE TRIGGER rewrite_cost BEFORE INSERT ON "PurchaseOrderLine" FOR EACH ROW EXECUTE FUNCTION rewrite_cost()');
   }
   if(kind==='trigger identity rewrite'){
    await f.db.$executeRawUnsafe('CREATE FUNCTION rewrite_identity() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW."id" := \'rewritten-\' || NEW."id"; RETURN NEW; END $$');
    await f.db.$executeRawUnsafe('CREATE TRIGGER rewrite_identity BEFORE INSERT ON "PurchaseOrderLine" FOR EACH ROW EXECUTE FUNCTION rewrite_identity()');
   }
   await f.acquire();const review=await readMyDataPrintedEconomicsReview(f.db,scope);
   assert.ok(review);assert.equal(review.state,'UNKNOWN');assert.equal(Object.hasOwn(review,'discountAmountTotal'),false);
  }finally{await f.close();}
 });
});

test('native fresh ordinary acquisition stamps its own new source job and prefills one verified draft exactly once', {skip:!isolatedInvoiceDb(),timeout:180000},async()=>{
 const f=await insertionFixture({fresh:true});try{
  const before=await f.snapshot();
  // Synthetic PDF and captured text exercise the ordinary acquisition contract;
  // this is not a provider network call or a real invoice OCR acceptance test.
  const bytes=await new Promise((resolve,reject)=>{
   const document=new PDFDocument({compress:false}),parts=[];
   document.on('data',part=>parts.push(part));document.on('error',reject);
   document.on('end',()=>resolve(Buffer.concat(parts)));
   document.font('Helvetica').text('Synthetic source provenance fixture, not a supplier invoice');document.end();
  });
  const checksum=hash(bytes);let downloads=0;
  const download=async()=>{downloads++;return {bytes,checksum,filename:'synthetic-original.pdf',text:printedText,pageCount:1};};
  const acquire=()=>acquireOriginal(f.db,'c','s','inbox','owner',true,download);
  const first=await acquire();assert.equal(first.downloaded,true);assert.equal(downloads,1);
  const [job]=await f.db.$queryRawUnsafe('SELECT "id","attachmentId","purchaseDocumentId","resultJson" FROM "AiReaderJob"');
  assert.equal(job.id,first.jobId);
  assert.deepEqual(job.resultJson.providerOriginalTextProof,{version:'SERVER_PROVIDER_PDF_V1',pdfChecksum:checksum,rawTextSHA256:hash(printedText),pageCount:1,profile:'E_INVOICING_DETAILED_LINE_AMOUNT_V1'});
  const lines=await f.db.$queryRawUnsafe('SELECT "unitCost"::text,"initialUnitCost"::text,"discount1"::text FROM "PurchaseOrderLine"');
  assert.deepEqual(lines,[{unitCost:'3.100000',initialUnitCost:'3.100000',discount1:'38.79032258'}]);
  const review=await readMyDataPrintedEconomicsReview(f.db,{companyId:'c',storeId:'s',orderId:first.purchaseOrderId});
  assert.equal(review.state,'VERIFIED');assert.equal(review.discountAmountTotal,'14.43');
  const replay=await acquire();assert.equal(replay.purchaseOrderId,first.purchaseOrderId);assert.equal(downloads,1);
  const [counts]=await f.db.$queryRawUnsafe('SELECT (SELECT COUNT(*)::int FROM "PurchaseOrder") AS orders,(SELECT COUNT(*)::int FROM "PurchaseDocument") AS documents,(SELECT COUNT(*)::int FROM "AiReaderJob") AS jobs,(SELECT COUNT(*)::int FROM "DocumentAttachment") AS attachments,(SELECT COUNT(*)::int FROM "PurchaseOrderLine") AS lines');
  assert.deepEqual(counts,{orders:1,documents:1,jobs:1,attachments:1,lines:1});
  assert.equal(await f.snapshot(),before);
 }finally{await f.close();}
});

test('native review marker failure rolls back first insert and preserves financial/stock state', {skip:!isolatedInvoiceDb(),timeout:180000},async()=>{
 const f=await insertionFixture();try{
  const before=await f.snapshot();
  await f.db.$executeRawUnsafe('CREATE FUNCTION reject_marker() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."rawPayload" ? \'printedEconomicsReview\' THEN RAISE EXCEPTION \'synthetic marker failure\'; END IF; RETURN NEW; END $$');
  await f.db.$executeRawUnsafe('CREATE TRIGGER reject_marker BEFORE UPDATE ON "MyDataInboundDocument" FOR EACH ROW EXECUTE FUNCTION reject_marker()');
  await assert.rejects(f.acquire(),/synthetic marker failure/);
  assert.equal((await f.db.$queryRawUnsafe('SELECT COUNT(*)::int AS count FROM "PurchaseOrderLine"'))[0].count,0);
  assert.equal(await f.snapshot(),before);
 }finally{await f.close();}
});
