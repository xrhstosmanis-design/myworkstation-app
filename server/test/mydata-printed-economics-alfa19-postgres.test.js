import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import PDFDocument from 'pdfkit';
import {invoiceDbFixture,isolatedInvoiceDb} from './helpers/invoice-common-draft-fixture.js';
import {acquireOriginal} from '../src/mydata-original.js';
import {readMyDataPrintedEconomicsReview} from '../src/lib/mydata-printed-economics-review.js';
import {parseMyDataPrintedLineEconomics} from '../src/lib/mydata-printed-line-economics.js';
import {invoiceDetailLines} from '../src/mydata-xml.js';

const PROFILE='EPSILON19_DETAILED_LINE_AMOUNTS_V1';
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
const header=['ΚΩΔΙΚΟΣ','ΠΕΡΙΓΡΑΦΗ','Μ.Μ','ΠΟΣΟΤ.','ΚΥΤΙΟ','Μ.Μ','ΠΟΣΟΤ.','ΤΕΜ.','ΤΙΜΗ','ΜΟΝΑΔΑΣ','ΑΞΙΑ(ΠΡΟ','ΕΚΠΤΩΣΗΣ)','ΕΚΠΤΩΣΗ 1','%','ΠΟΣΟ','ΕΚΠΤΩΣΗ 2','%','ΠΟΣΟ','ΕΚΠΤΩΣΗ 3','%','ΠΟΣΟ','ΕΠΙΒΑΡ','ΑΞΙΑ ΜΕΤΑ','ΤΗΝ','ΕΚΠΤ.','ΦΠΑ','ΦΟΡΟΥ','%'];
const greek=(value,places=2)=>Number(value).toFixed(places).replace('.',',');

// Public synthetic identities and economics. No retained supplier identifiers,
// descriptions, URLs, XML or original PDF are included in this fixture.
function syntheticRows(){
 const rows=Array.from({length:23},(_,i)=>({code:'DL'+String(9000001+i),quantity:5,cost:1.4,initial:7,amounts:[1,1],net:5,vat:.65}));
 rows[0]={...rows[0],quantity:10,cost:1.49,initial:14.9,amounts:[2.46,1.49],net:10.95,vat:1.43};
 rows[1]={...rows[1],quantity:10,cost:1.49,initial:14.9,amounts:[2.46,1.49],net:10.95,vat:1.42};
 rows[2]={...rows[2],quantity:5,cost:2.43,initial:12.15,amounts:[1.77,1.56,.69],net:8.13,vat:1.06};
 rows[21]={...rows[21],quantity:10,cost:2,initial:20,amounts:[2,3],net:15,vat:1.95};
 rows[22]={...rows[22],quantity:10,cost:2.462,initial:24.62,amounts:[5,5.81],net:13.81,vat:1.79};
 return rows;
}
function sourceText(rows){
 const tokens=['Synthetic two-page original, not a supplier invoice',...header];
 for(const [i,row] of rows.entries())tokens.push('0,00','0,00','0,00',greek(row.amounts[0]),...(row.amounts[2]?[greek(row.amounts[2])]:[]),greek(row.net),'13',greek(row.amounts[1]),row.code,
  i===2?'DIS':'ΤΕΜ',greek(row.cost,4),greek(row.initial),i===2?'0,36':greek(row.quantity),String(row.quantity),'ΤΕΜ','SYNTHETIC PRODUCT '+String(i+1));
 tokens.push('148,84','ΣΕ ΜΕΤΑΦΟΡΑ',':',...header,'148,84','ΑΠΟ','ΜΕΤΑΦΟΡΑ :','.',String(rows.reduce((sum,row)=>sum+row.quantity,0)),'148,84`','`','0,00','0,00','ΣΥΝ.ΠΟΣΟΤΗΤΑ:','ΠΡΟΗΓ.ΥΠΟΛΟΙΠΟ:','ΝΕΟ ΥΠΟΛΟΙΠΟ:','ΚΑΘΑΡΗ ΑΞΙΑ','% ΦΠΑ','ΑΞΙΑ','ΦΠΑ','ΑΝΑΛΥΣΗ Φ.Π.Α.','13,00`','19,35`','0,00`','0,00`','ΕΚΠΤΩΣΕΙΣ','212,57','148,84','19,35','168,19','168,19','63,73','Α Ξ Ι Α','ΕΠΙΒΑΡΥΝΣΕΙΣ','ΦΟΡΟΛ. ΑΞΙΑ','ΕΚΔΟΤΗΣ','ΠΑΡΑΛΗΠΤΗΣ','ΦΠΑ','ΣΥΝΟΛΟ','ΛΗΦΘ.ΕΓΓΥΗΣΗ','ΓΕΝ.ΣΥΝΟΛΟ','ΤΕΛΙΚΗ ΑΞΙΑ','168,19');
 return tokens.join('\n');
}
let pdfPromise;
function syntheticPdf(){
 return pdfPromise??=new Promise((resolve,reject)=>{
  const document=new PDFDocument({compress:false}),parts=[];
  document.on('data',part=>parts.push(part));document.on('error',reject);document.on('end',()=>resolve(Buffer.concat(parts)));
  document.font('Helvetica').text('Synthetic first-page source provenance fixture');
  document.addPage().text('Synthetic second-page source provenance fixture');document.end();
 });
}
async function fixture(){
 const f=await invoiceDbFixture();try{
  await f.seed({pos:false,mydata:false,payment:false});
  await f.db.$executeRawUnsafe('ALTER TABLE "MyDataInboundDocument" ADD COLUMN "totalNet" numeric, ADD COLUMN "totalVat" numeric, ADD COLUMN "currency" text');
  await f.db.$executeRawUnsafe('ALTER TABLE "Product" ADD COLUMN "active" boolean DEFAULT true');
  await f.db.$executeRawUnsafe('ALTER TABLE "StoreProduct" ADD COLUMN "active" boolean DEFAULT true');
  await f.db.$executeRawUnsafe('ALTER TABLE "PurchaseOrderLine" ADD COLUMN "initialUnitCost" numeric(14,6)');
  await f.db.$executeRawUnsafe('ALTER TABLE "PurchaseOrderLine" ALTER COLUMN "unitCost" TYPE numeric(14,6), ALTER COLUMN "discount1" TYPE numeric(12,8), ALTER COLUMN "discount2" TYPE numeric(12,8), ALTER COLUMN "discount3" TYPE numeric(12,8)');
  await f.db.$executeRawUnsafe('ALTER TABLE "DocumentAttachment" ADD COLUMN "documentType" text, ADD COLUMN "storageKey" text');
  await f.db.$executeRawUnsafe('ALTER TABLE "AiReaderJob" ADD COLUMN "localConfidence" numeric, ADD COLUMN "requestedByUserId" text');
  await f.db.$executeRawUnsafe('ALTER TABLE "PurchaseOrder" ADD COLUMN IF NOT EXISTS "reopenVersion" integer DEFAULT 0');
  await f.db.$executeRawUnsafe('DELETE FROM "AiReaderJob"');
  await f.db.$executeRawUnsafe('UPDATE "DocumentInbox" SET "attachmentId"=NULL,"status"=\'RECEIVED\'');
  await f.db.$executeRawUnsafe('DELETE FROM "DocumentAttachment"');
  const rows=syntheticRows(),xmlRows=[...rows.slice(7),...rows.slice(0,7)],text=sourceText(rows);
  const xml='<invoice><downloadingInvoiceUrl>https://epsilondigital19.epsilonnet.gr/fd/'+ 'a'.repeat(32)+':177</downloadingInvoiceUrl>'+xmlRows.map((r,i)=>`<invoiceDetails><lineNumber>${i+1}</lineNumber><itemCode>${r.code}</itemCode><itemDescr>SYNTHETIC PRODUCT ${i+1}</itemDescr><quantity>${r.quantity}</quantity><measurementUnit>1</measurementUnit><netValue>${r.net}</netValue><vatCategory>2</vatCategory><vatAmount>${r.vat}</vatAmount></invoiceDetails>`).join('')+'</invoice>';
  assert.ok(parseMyDataPrintedLineEconomics({text,xmlLines:invoiceDetailLines(xml),totalNet:'148.84',totalVat:'19.35',totalGross:'168.19',pageCount:2,profile:PROFILE}),'Synthetic native source must independently satisfy the pure ALFA parser');
  await f.db.$executeRaw`UPDATE "MyDataInboundDocument" SET "totalNet"=148.84,"totalVat"=19.35,"totalGross"=168.19,"currency"='EUR',"rawPayload"="rawPayload"||${JSON.stringify({xml})}::jsonb WHERE "id"='m'`;
  const bytes=await syntheticPdf(),checksum=hash(bytes);let downloads=0;
  const acquire=()=>acquireOriginal(f.db,'c','s','inbox','owner',true,async()=>{downloads++;return {bytes,checksum,filename:'synthetic-two-page.pdf',text,pageCount:2};});
  const state=async()=>{
   const [inbound]=await f.db.$queryRawUnsafe('SELECT "rawPayload" FROM "MyDataInboundDocument" WHERE "id"=\'m\'');
   const [job]=await f.db.$queryRawUnsafe('SELECT "id","resultJson" FROM "AiReaderJob"');
   const orderId=inbound.rawPayload.mydataDraftOrderId;
   return {rawPayload:inbound.rawPayload,marker:inbound.rawPayload.printedEconomicsReview,job,orderId,scope:{companyId:'c',storeId:'s',orderId}};
  };
  return {...f,rows,xmlRows,text,xml,checksum,acquire,state,downloads:()=>downloads};
 }catch(error){await f.close();throw error;}
}
async function setMarker(f,value){await f.db.$executeRaw`UPDATE "MyDataInboundDocument" SET "rawPayload"=jsonb_set("rawPayload",'{printedEconomicsReview}',${JSON.stringify(value)}::jsonb) WHERE "id"='m'`;}
async function setJob(f,value){await f.db.$executeRaw`UPDATE "AiReaderJob" SET "resultJson"=${JSON.stringify(value)}::jsonb`;}
async function prepareStoredOrderInspection(f){
 // Complete only the isolated fixture columns used by the existing real detail
 // query. Its actual read-only transaction/auth/SQL/DTO are not replaced.
 await f.db.$executeRawUnsafe('CREATE TABLE "User"("id" text PRIMARY KEY,"role" text,"companyId" text)');
 await f.db.$executeRawUnsafe('INSERT INTO "User" VALUES(\'alfa-inspector\',\'SUPER_ADMIN\',\'c\')');
 await f.db.$executeRawUnsafe('ALTER TABLE "Store" ADD COLUMN "active" boolean DEFAULT true');
 await f.db.$executeRawUnsafe('ALTER TABLE "Product" ADD COLUMN "name" text, ADD COLUMN "sku" text, ADD COLUMN "vatRate" numeric, ADD COLUMN "categoryId" text, ADD COLUMN "subcategoryId" text, ADD COLUMN "vatDepartmentId" text');
 await f.db.$executeRawUnsafe('ALTER TABLE "StoreProduct" ADD COLUMN "categoryIdOverride" text, ADD COLUMN "subcategoryIdOverride" text, ADD COLUMN "vatDepartmentIdOverride" text');
 await f.db.$executeRawUnsafe('ALTER TABLE "PurchaseOrderLine" ADD COLUMN IF NOT EXISTS "ocrLineIndex" integer');
 await f.db.$executeRawUnsafe('CREATE TABLE "ProductCategory"("id" text PRIMARY KEY,"name" text)');
 await f.db.$executeRawUnsafe('CREATE TABLE "ProductBarcode"("productId" text,"barcode" text,"createdAt" timestamp DEFAULT NOW())');
 const {readPurchaseOrderInspection}=await import('../src/routes/purchase-orders.js');
 return orderId=>readPurchaseOrderInspection(f.db,{id:'alfa-inspector',companyId:'c',role:'SUPER_ADMIN',tokenType:'BACKOFFICE_USER'},'s',orderId);
}

test('native ALFA19 fresh first insert binds 23 reordered rows, sequential amounts and authoritative VAT cents; replay preserves identities', {skip:!isolatedInvoiceDb(),timeout:180000},async()=>{
 const f=await fixture();try{
  const inspectStoredOrder=await prepareStoredOrderInspection(f);
  const before=await f.snapshot(),first=await f.acquire(),state=await f.state();
  assert.equal(first.downloaded,true);assert.equal(f.downloads(),1);
  assert.equal(state.marker.state,'VERIFIED',state.marker.reason);assert.equal(state.marker.printedProfile,PROFILE);assert.equal(state.marker.pageCount,2);assert.equal(state.marker.lineCount,23);
  assert.deepEqual(state.job.resultJson.providerOriginalTextProof,{version:'SERVER_PROVIDER_PDF_V1',pdfChecksum:f.checksum,rawTextSHA256:hash(f.text),pageCount:2,profile:PROFILE});
  assert.equal((await readMyDataPrintedEconomicsReview(f.db,state.scope)).state,'VERIFIED');
  const rows=await f.db.$queryRawUnsafe('SELECT "id","supplierCode","quantity"::text,"unitCost"::text,"initialUnitCost"::text,"discount1"::text,"discount2"::text,"discount3"::text,"netAmount"::text,"vatAmount"::text FROM "PurchaseOrderLine"');
  assert.equal(rows.length,23);
  for(const [i,source] of f.xmlRows.entries()){
   const row=rows.find(r=>r.supplierCode===source.code),proof=state.marker.rows.find(r=>r.lineId===row.id);
   assert.equal(row.unitCost,Number(source.cost).toFixed(6));assert.equal(row.initialUnitCost,row.unitCost);
   assert.equal(Number(row.quantity),source.quantity);assert.equal(Number(row.netAmount),source.net);assert.equal(Number(row.vatAmount),source.vat);
   assert.equal(proof.lineNumber,i+1);assert.equal(proof.physicalLineNumber,f.rows.indexOf(source)+1);
   assert.deepEqual(proof.printedDiscountSteps.map(s=>({kind:s.kind,amount:s.amount})),source.amounts.map(amount=>({kind:'LINE_AMOUNT',amount:Number(amount).toFixed(2)})));
  }
  const triple=rows.find(r=>r.supplierCode===f.rows[2].code);
  assert.equal(triple.netAmount,'8.13','Unconstrained SQL NUMERIC must preserve the exact printed/XML cents');
  assert.notEqual(Number(triple.discount1),0);assert.notEqual(Number(triple.discount2),0);assert.notEqual(Number(triple.discount3),0);
  assert.equal(Number(rows.find(r=>r.supplierCode===f.rows[0].code).vatAmount),1.43);
  assert.equal(Number(rows.find(r=>r.supplierCode===f.rows[1].code).vatAmount),1.42);
  const [totals]=await f.db.$queryRawUnsafe('SELECT SUM("netAmount")::text AS net,SUM("vatAmount")::text AS vat,SUM("grossAmount")::text AS gross FROM "PurchaseOrderLine"');
  assert.equal(Number(totals.net),148.84);assert.equal(Number(totals.vat),19.35);assert.equal(Number(totals.gross),168.19);
  const detail=await inspectStoredOrder(state.orderId);
  assert.equal(detail.readOnly,true);assert.equal(detail.navigationOnly,true);assert.equal(detail.lines.length,23);
  assert.equal(detail.totals.net,148.84);assert.equal(Number(detail.totals.vat.toFixed(2)),19.35);assert.equal(Number(detail.totals.gross.toFixed(2)),168.19);
  assert.equal(detail.mydataPrintedEconomics.state,'VERIFIED');
  assert.equal(detail.lines.find(r=>r.supplierCode===f.rows[0].code).vatAmount,1.43);
  assert.equal(detail.lines.find(r=>r.supplierCode===f.rows[1].code).vatAmount,1.42);
  await f.acquire();assert.equal(f.downloads(),1);
  const [counts]=await f.db.$queryRawUnsafe('SELECT (SELECT COUNT(*)::int FROM "PurchaseOrder") AS orders,(SELECT COUNT(*)::int FROM "PurchaseDocument") AS documents,(SELECT COUNT(*)::int FROM "AiReaderJob") AS jobs,(SELECT COUNT(*)::int FROM "DocumentAttachment") AS attachments');
  assert.deepEqual(counts,{orders:1,documents:1,jobs:1,attachments:1});assert.equal(await f.snapshot(),before);
 }finally{await f.close();}
});

test('native ALFA19 proof refuses missing/malformed/mismatched profile and page metadata while keeping UNKNOWN visible', {skip:!isolatedInvoiceDb(),timeout:180000},async()=>{
 const f=await fixture();try{
  await f.acquire();const {marker,job,scope}=await f.state();assert.equal(marker.state,'VERIFIED');
  const without=(object,keys)=>Object.fromEntries(Object.entries(object).filter(([key])=>!keys.includes(key)));
  for(const mutation of [without(marker,['printedProfile','pageCount']),without(marker,['printedProfile']),without(marker,['pageCount']),{...marker,pageCount:1},{...marker,pageCount:'2'},{...marker,printedProfile:'E_INVOICING_DETAILED_LINE_AMOUNT_V1'},{...marker,printedProfile:'UNKNOWN'}]){
   await setMarker(f,mutation);const review=await readMyDataPrintedEconomicsReview(f.db,scope);assert.ok(review);assert.equal(review.state,'UNKNOWN');
  }
  await setMarker(f,marker);
  for(const proof of [{...job.resultJson.providerOriginalTextProof,pageCount:1},{...job.resultJson.providerOriginalTextProof,profile:'E_INVOICING_DETAILED_LINE_AMOUNT_V1'},{...job.resultJson.providerOriginalTextProof,profile:'UNKNOWN'}]){
   await setJob(f,{...job.resultJson,providerOriginalTextProof:proof});assert.equal((await readMyDataPrintedEconomicsReview(f.db,scope)).state,'UNKNOWN');
  }
  await setJob(f,{...job.resultJson,pageCount:1});assert.equal((await readMyDataPrintedEconomicsReview(f.db,scope)).state,'UNKNOWN');
  await setJob(f,job.resultJson);await setMarker(f,{...marker,state:'UNKNOWN',reason:'PRINTED_ECONOMICS_NOT_PROVEN',printedProfile:'UNPROVEN',pageCount:17});
  const unknown=await readMyDataPrintedEconomicsReview(f.db,scope);assert.equal(unknown.state,'UNKNOWN');assert.equal(unknown.reason,'PRINTED_ECONOMICS_NOT_PROVEN');
 }finally{await f.close();}
});

test('native ALFA19 incompatible SQL precision and persisted rewriting never receive VERIFIED', {skip:!isolatedInvoiceDb(),timeout:180000},async t=>{
 for(const kind of ['percent scale','unit-price scale','persisted rewrite'])await t.test(kind,async()=>{
  const f=await fixture();try{
   if(kind==='percent scale')await f.db.$executeRawUnsafe('ALTER TABLE "PurchaseOrderLine" ALTER COLUMN "discount3" TYPE numeric(12,4)');
   if(kind==='unit-price scale')await f.db.$executeRawUnsafe('ALTER TABLE "PurchaseOrderLine" ALTER COLUMN "unitCost" TYPE numeric(14,2)');
   if(kind==='persisted rewrite'){
    await f.db.$executeRawUnsafe('CREATE FUNCTION rewrite_alfa_cost() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW."discount2" := round(NEW."discount2",4); RETURN NEW; END $$');
    await f.db.$executeRawUnsafe('CREATE TRIGGER rewrite_alfa_cost BEFORE INSERT ON "PurchaseOrderLine" FOR EACH ROW EXECUTE FUNCTION rewrite_alfa_cost()');
   }
   await f.acquire();const state=await f.state();assert.equal(state.marker.state,'UNKNOWN');assert.equal((await readMyDataPrintedEconomicsReview(f.db,state.scope)).state,'UNKNOWN');
  }finally{await f.close();}
 });
});

test('native ALFA19 stale rows/source invalidate proof and deleted/final/reopened drafts are never refilled', {skip:!isolatedInvoiceDb(),timeout:180000},async()=>{
 const f=await fixture();try{
  await f.acquire();const {scope,orderId,marker}=await f.state(),first=marker.rows[0].lineId;
  await f.db.$executeRaw`UPDATE "PurchaseOrderLine" SET "initialUnitCost"="initialUnitCost"+0.000001 WHERE "id"=${first}`;
  assert.equal((await readMyDataPrintedEconomicsReview(f.db,scope)).reason,'STALE_ROWS');
  await f.acquire();assert.equal((await readMyDataPrintedEconomicsReview(f.db,scope)).reason,'STALE_ROWS');
  await f.db.$executeRaw`UPDATE "PurchaseOrderLine" SET "initialUnitCost"="initialUnitCost"-0.000001 WHERE "id"=${first}`;
  await f.db.$executeRawUnsafe('UPDATE "MyDataInboundDocument" SET "rawPayload"=jsonb_set("rawPayload",\'{xml}\',\'"changed"\')');
  assert.equal((await readMyDataPrintedEconomicsReview(f.db,scope)).reason,'STALE_SOURCE');
  await f.db.$executeRaw`UPDATE "MyDataInboundDocument" SET "rawPayload"=jsonb_set("rawPayload",'{xml}',${JSON.stringify(f.xml)}::jsonb)`;
  await f.db.$executeRaw`UPDATE "PurchaseOrder" SET "reopenVersion"=1 WHERE "id"=${orderId}`;
  assert.equal(await readMyDataPrintedEconomicsReview(f.db,scope),null);await f.acquire();
  await f.db.$executeRaw`UPDATE "PurchaseOrder" SET "reopenVersion"=0 WHERE "id"=${orderId}`;
  await f.db.$executeRawUnsafe('DELETE FROM "PurchaseOrderLine"');await f.acquire();
  assert.equal((await f.db.$queryRawUnsafe('SELECT COUNT(*)::int AS count FROM "PurchaseOrderLine"'))[0].count,0);
  await f.db.$executeRaw`UPDATE "PurchaseOrder" SET "status"='FINAL' WHERE "id"=${orderId}`;
  await f.db.$executeRawUnsafe('UPDATE "PurchaseDocument" SET "status"=\'APPROVED\'');
  assert.equal(await readMyDataPrintedEconomicsReview(f.db,scope),null);
  await f.acquire().catch(error=>assert.match(error.message,/ήδη|καταχωρ|έλεγχ/));assert.equal(f.downloads(),1);
  assert.equal((await f.db.$queryRawUnsafe('SELECT COUNT(*)::int AS count FROM "PurchaseOrderLine"'))[0].count,0);
  assert.equal((await f.db.$queryRaw`SELECT "status" FROM "PurchaseOrder" WHERE "id"=${orderId}`)[0].status,'FINAL');
 }finally{await f.close();}
});

test('native ALFA19 marker write failure rolls back newly acquired attachment/job/order/rows', {skip:!isolatedInvoiceDb(),timeout:180000},async()=>{
 const f=await fixture();try{
  const before=await f.snapshot();
  await f.db.$executeRawUnsafe('CREATE FUNCTION reject_alfa_marker() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."rawPayload" ? \'printedEconomicsReview\' THEN RAISE EXCEPTION \'synthetic ALFA marker failure\'; END IF; RETURN NEW; END $$');
  await f.db.$executeRawUnsafe('CREATE TRIGGER reject_alfa_marker BEFORE UPDATE ON "MyDataInboundDocument" FOR EACH ROW EXECUTE FUNCTION reject_alfa_marker()');
  await assert.rejects(f.acquire(),/synthetic ALFA marker failure/);
  const [counts]=await f.db.$queryRawUnsafe('SELECT (SELECT COUNT(*)::int FROM "PurchaseOrder") AS orders,(SELECT COUNT(*)::int FROM "PurchaseDocument") AS documents,(SELECT COUNT(*)::int FROM "AiReaderJob") AS jobs,(SELECT COUNT(*)::int FROM "DocumentAttachment") AS attachments,(SELECT COUNT(*)::int FROM "PurchaseOrderLine") AS lines');
  assert.deepEqual(counts,{orders:0,documents:0,jobs:0,attachments:0,lines:0});assert.equal(await f.snapshot(),before);
 }finally{await f.close();}
});
