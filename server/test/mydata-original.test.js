import assert from "node:assert/strict";
import test from "node:test";
import {originalDownloadUrl,verifyOriginalText,fetchOriginalPdf,acquireOriginal} from "../src/mydata-original.js";
const base="https://einvoice.impact.gr/p/EL099999999/"+ "A".repeat(40)+"/"+"B".repeat(32);
const row={inboxId:"inbox",issuerVat:"099999999",counterpartVat:"088888888",mark:"400000000000001",documentNumber:"42",totalGross:"12.4",status:"RECEIVED",invoiceType:"1.1",currency:"EUR",issueDate:"2026-09-28",rawPayload:{xml:`<invoice><downloadingInvoiceUrl>${base}</downloadingInvoiceUrl></invoice>`}};
test("provider adapter rejects arbitrary hosts, credentials, redirects targets and wrong issuer",()=>{
  assert.equal(originalDownloadUrl(row.rawPayload.xml,row.issuerVat),base+"/pdf");
  for(const url of [base.replace("https:","http:"),base.replace("einvoice.impact.gr","127.0.0.1"),base.replace("einvoice.impact.gr","einvoice.impact.gr.evil.test"),base.replace("//","//user:pass@"),base+"?redirect=evil",base.replace("099999999","088888888")])assert.throws(()=>originalDownloadUrl(`<downloadingInvoiceUrl>${url}</downloadingInvoiceUrl>`,row.issuerVat));
  assert.throws(()=>originalDownloadUrl("<qrCodeUrl>https://mydatapi.aade.gr</qrCodeUrl>",row.issuerVat),/δεν έχει/);
});
test("download accepts bounded real PDF bytes only and verifies invoice identity",async()=>{
  const bytes=Buffer.from("%PDF-"+ "x".repeat(110)),text="099999999 088888888 400000000000001 42";
  const reader=async()=>({text,pageCount:1});
  let options;
  const result=await fetchOriginalPdf(row,async(url,opts)=>{assert.equal(url,base+"/pdf");options=opts;return new Response(bytes,{headers:{"content-type":"application/pdf"}})},reader);
  assert.equal(options.redirect,"error");assert.equal(result.bytes.length,115);
  await assert.rejects(fetchOriginalPdf(row,async()=>new Response("<html>login</html>",{headers:{"content-type":"text/html"}}),reader),/PDF/);
  await assert.rejects(fetchOriginalPdf(row,async()=>new Response(bytes,{headers:{"content-type":"application/pdf","content-length":"3400001"}}),reader),/3,4/);
  for(const field of ["099999999","088888888","400000000000001","42"])assert.throws(()=>verifyOriginalText(text.replace(field,"different"),row),/δεν επιβεβαιώνει/);
});
test("one original, job and editable draft are reused; deletion and tenant mismatch cannot recreate",async()=>{
  let exists=true,attached=null,job=null,order=null,downloads=0;
  const writes=[];
  const tx={async $queryRaw(strings,...values){
    const sql=strings.join("?");
    if(sql.includes('FROM "DocumentInbox"')){assert.deepEqual(values,["inbox","company","store"]);return exists?[{id:"inbox",status:"IN_REVIEW",attachmentId:attached}]:[]}
    if(sql.includes('FROM "AiReaderJob"'))return job?[job]:[];
    if(sql.includes('FROM "Supplier"'))return [{id:"supplier"}];
    if(sql.includes('FROM "PurchaseOrder"'))return order?[order]:[];
    if(sql.includes('FROM "PurchaseDocument"'))return [];
    throw new Error(sql);
  },async $executeRaw(strings,...values){
    const sql=strings.join("?");writes.push({sql,values});
    if(sql.startsWith('INSERT INTO "AiReaderJob"'))job={id:values[0],purchaseDocumentId:null};
    if(sql.startsWith('INSERT INTO "PurchaseOrder"'))order={id:values[0],status:"NEW"};
    if(sql.startsWith('UPDATE "AiReaderJob"'))job.purchaseDocumentId=values[0];
    if(sql.startsWith('UPDATE "DocumentInbox"')&&values[0]!=="myDATA • MARK "+row.mark+" • Πρόχειρο στις Παραγγελίες & Αγορές — Ανάγνωση από βοηθό")attached=values[0];
  }};
  const prisma={async $queryRaw(strings,...values){assert.deepEqual(values,["company","store","inbox"]);return exists?[{...row,attachmentId:attached}]:[]},async $transaction(fn){return fn(tx)}};
  const download=async()=>{downloads++;return {bytes:Buffer.from("%PDF-fixture"),checksum:"checksum",filename:"fixture.pdf",text:"source",pageCount:1}};
  const run=()=>acquireOriginal(prisma,"company","store","inbox","owner",true,download);
  // First lock is for attachment acquisition, then the draft helper reads the updated attachment.
  const query=tx.$queryRaw;let initial=true;
  tx.$queryRaw=async(strings,...values)=>{if(initial&&strings.join("?").includes('FROM "DocumentInbox"')){initial=false;return [{id:"inbox",status:"RECEIVED",attachmentId:null}]}return query(strings,...values)};
  const first=await run();assert.equal(first.downloaded,true);assert.ok(first.purchaseOrderId);
  assert.equal(writes.filter(w=>w.sql.includes('INSERT INTO "AiReaderJob"')).length,1);
  assert.equal(writes.filter(w=>w.sql.includes('INSERT INTO "PurchaseOrder"')).length,1);
  assert.equal(writes.some(w=>/StockMovement|StoreTransaction|PurchaseOrderLine|INSERT INTO "Product"/.test(w.sql)),false);
  const count=writes.length;const second=await run();assert.equal(second.purchaseOrderId,first.purchaseOrderId);assert.equal(downloads,1);assert.equal(writes.length,count);
  order=null;await assert.rejects(run(),/διαγραφεί/);assert.equal(writes.length,count);
  exists=false;await assert.rejects(run(),e=>e.status===404);assert.equal(writes.length,count);
});
