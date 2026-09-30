import test from "node:test";
import assert from "node:assert/strict";
import {invoiceAssistantPageCount,normalizePdfPageEvidence} from "../src/lib/invoice-assistant-page-count.js";

function pdf(pageCount){
  const objects=["<< /Type /Catalog /Pages 2 0 R >>",`<< /Type /Pages /Count ${pageCount} /Kids [${Array.from({length:pageCount},(_,i)=>`${i+3} 0 R`).join(" ")}] >>`,...Array.from({length:pageCount},()=>"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << >> >>")];
  let data="%PDF-1.4\n",offsets=[0];
  objects.forEach((object,index)=>{offsets.push(Buffer.byteLength(data));data+=`${index+1} 0 obj\n${object}\nendobj\n`});
  const xref=Buffer.byteLength(data);
  data+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n${offsets.slice(1).map(offset=>`${String(offset).padStart(10,"0")} 00000 n \n`).join("")}trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return {mimeType:"application/pdf",contentData:`data:application/pdf;base64,${Buffer.from(data).toString("base64")}`};
}

test("one bound two-page PDF counts as two physical pages",async()=>{
  assert.equal(await invoiceAssistantPageCount([pdf(2)]),2);
  assert.equal(await invoiceAssistantPageCount([pdf(2),{mimeType:"image/jpeg"}]),3);
  assert.equal(await invoiceAssistantPageCount([{mimeType:"image/jpeg"},{mimeType:"image/png"}]),2);
});
test("invalid PDFs and more than five physical pages refuse review",async()=>{
  await assert.rejects(invoiceAssistantPageCount([pdf(6)]),/5 φυσικές/);
  await assert.rejects(invoiceAssistantPageCount([{mimeType:"application/pdf",contentData:"not-pdf"}]));
});
test("PDF evidence normalizes only spacing, never missing identity or visibility",()=>{
  const evidence=[{documentNumber:"ΤΔΠΤΛ137177",fullPageVisible:true},{documentNumber:"",fullPageVisible:false},{documentNumber:"ΤΔΠΤΛ137178",fullPageVisible:true}];
  const result=normalizePdfPageEvidence(evidence,[{mimeType:"application/pdf"}],"ΤΔΠΤΛ 137177");
  assert.equal(result[0].documentNumber,"ΤΔΠΤΛ 137177");assert.deepEqual(result[1],evidence[1]);assert.deepEqual(result[2],evidence[2]);
  assert.equal(normalizePdfPageEvidence(evidence,[{mimeType:"image/jpeg"}],"ΤΔΠΤΛ 137177"),evidence);
});
