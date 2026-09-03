import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const route=await readFile(new URL("../src/routes/commerce-invoice-draft-approval.js",import.meta.url),"utf8");
const inbox=await readFile(new URL("../../client/src/components/commerce/InvoiceInboxPanel.jsx",import.meta.url),"utf8");
const reader=await readFile(new URL("../../client/src/components/commerce/AiReaderPanel.jsx",import.meta.url),"utf8");
const hub=await readFile(new URL("../../client/src/components/commerce/CommerceHub.jsx",import.meta.url),"utf8");

test("BackOffice reprocesses an existing inbox attachment without another upload or payment",()=>{
  assert.match(route,/documents\/inbox\/:inboxId\/reprocess/);
  assert.match(route,/"attachmentId"=\$\{inbox\.attachmentId\}/);
  assert.match(route,/paymentCreated:false,uploadCreated:false/);
  assert.match(route,/Το τιμολόγιο έχει ήδη μεταφερθεί για έλεγχο/);
  assert.doesNotMatch(route,/documents\/inbox\/:inboxId\/reprocess[\s\S]*StoreTransaction/);
});

test("invoice inbox runs line recognition then opens the existing AI review",()=>{
  assert.match(inbox,/Επανεπεξεργασία γραμμών/);
  assert.match(inbox,/ai-reader\/jobs\/\$\{prepared\.jobId\}\/ai-recheck/);
  assert.match(inbox,/χωρίς νέα πληρωμή/);
  assert.match(inbox,/onOpenAi\?\.\(prepared\.jobId\)/);
  assert.match(hub,/onOpenAi=\{jobId=>\{setAiFocusJobId\(jobId\);setTab\("ai"\)\}\}/);
  assert.match(hub,/focusJobId=\{aiFocusJobId\}/);
  assert.match(reader,/jobs\.find\(row=>row\.id===focusJobId\)/);
});

test("AI review preserves structured product quantities and costs",()=>{
  assert.match(reader,/Array\.isArray\(result\.productLines\)/);
  assert.match(reader,/quantity:Number\(line\.quantity\|\|0\)\|\|1/);
  assert.match(reader,/unitCost:Number\(line\.unitCost\|\|0\)/);
  assert.match(reader,/vatRate:Number\(line\.vatRate\|\|0\)/);
  assert.match(reader,/setDocumentNumber\(String\(result\.documentNumber\|\|""\)\)/);
});
