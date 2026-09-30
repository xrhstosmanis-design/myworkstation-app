import assert from "node:assert/strict";
import test from "node:test";
import {originalDownloadUrl,verifyOriginalText,fetchOriginalPdf,acquireOriginal} from "../src/mydata-original.js";
const base="https://einvoice.impact.gr/p/EL099999999/"+ "A".repeat(40)+"/"+"B".repeat(32);
const row={inboxId:"inbox",issuerVat:"099999999",counterpartVat:"088888888",mark:"400000000000001",documentNumber:"42",totalGross:"12.4",status:"RECEIVED",rawPayload:{xml:`<invoice><downloadingInvoiceUrl>${base}</downloadingInvoiceUrl></invoice>`}};
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
test("attachment and AI job persist once under lock; foreign or deleted inbox never writes",async()=>{
  let attached=false,exists=true,downloads=0;
  const writes=[];
  const tx={async $queryRaw(strings,...values){assert.deepEqual(values,["inbox","company","store"]);return exists?[{id:"inbox",status:"RECEIVED",attachmentId:attached?"already":null}]:[]},async $executeRaw(strings,...values){const sql=strings.join("?");writes.push({sql,values});if(sql.startsWith('UPDATE "DocumentInbox"'))attached=true}};
  const prisma={async $queryRaw(strings,...values){assert.deepEqual(values,["company","store","inbox"]);return exists?[{...row,attachmentId:attached?"already":null}]:[]},async $transaction(fn){return fn(tx)}};
  const download=async()=>{downloads++;return {bytes:Buffer.from("%PDF-fixture"),checksum:"checksum",filename:"fixture.pdf",text:"source",pageCount:1}};
  const run=()=>acquireOriginal(prisma,"company","store","inbox","owner",true,download);
  assert.equal((await run()).downloaded,true);
  assert.equal(writes.length,4);
  assert.equal(writes.filter(w=>w.sql.includes('INSERT INTO "AiReaderJob"')).length,1);
  assert.equal(writes.some(w=>/PurchaseDocument|StockMovement|StoreTransaction/.test(w.sql)),false);
  assert.equal((await run()).reused,true);assert.equal(downloads,1);assert.equal(writes.length,4);
  exists=false;await assert.rejects(run(),e=>e.status===404);assert.equal(writes.length,4);
  exists=true;attached=false;
  await assert.rejects(acquireOriginal(prisma,"company","store","inbox","owner",true,async()=>{exists=false;return download()}),e=>e.status===404);
  assert.equal(writes.length,4);
});
