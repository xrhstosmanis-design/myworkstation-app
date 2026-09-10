import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";
import {invoiceNodes,invoiceSummary,myDataError} from "../src/mydata-xml.js";

const route=await readFile(new URL("../src/routes/commerce-mydata-inbox.js",import.meta.url),"utf8");
const ui=await readFile(new URL("../../client/src/components/commerce/InvoiceInboxPanel.jsx",import.meta.url),"utf8");

test("myDATA receiving is locked to configured LAB sandbox",()=>{
  assert.match(route,/environment!=="SANDBOX"/);assert.match(route,/Δεν έγινε σύνδεση παραγωγής/);assert.match(route,/fiscalTransmission:false/);
});
test("myDATA documents are idempotent and remain inbox drafts",()=>{
  assert.match(route,/UNIQUE \("companyId","mark"\)/);assert.match(route,/SELECT "inboxId" FROM "MyDataInboundDocument"/);assert.match(route,/'RECEIVED'/);assert.match(route,/stockUpdated:false/);
});
test("invoice inbox exposes manual sync and ten minute refresh",()=>{
  assert.match(ui,/Λήψη από myDATA/);assert.match(ui,/10\*60\*1000/);assert.match(ui,/Η αποθήκη ενημερώνεται μόνο μετά τον έλεγχο/);
});
test("AADE namespaced XML is parsed into the expected draft summary",()=>{
  const xml=`<RequestedDoc><invoicesDoc><invoice><uid>abc</uid><mark>12345</mark><issuer><vatNumber>099999999</vatNumber></issuer><counterpart><vatNumber>088888888</vatNumber></counterpart><invoiceHeader><series>A</series><aa>42</aa><issueDate>2026-09-10</issueDate><invoiceType>1.1</invoiceType><currency>EUR</currency></invoiceHeader><invoiceSummary><totalNetValue>10.00</totalNetValue><totalVatAmount>2.40</totalVatAmount><totalGrossValue>12.40</totalGrossValue></invoiceSummary></invoice></invoicesDoc></RequestedDoc>`;
  const invoices=invoiceNodes(xml);assert.equal(invoices.length,1);assert.deepEqual(invoiceSummary(invoices[0]),{mark:"12345",uid:"abc",issuerVat:"099999999",counterpartVat:"088888888",series:"A",documentNumber:"42",issueDate:"2026-09-10",invoiceType:"1.1",currency:"EUR",totalNet:10,totalVat:2.4,totalGross:12.4});
});
test("AADE error XML is never treated as an empty successful sync",()=>{
  assert.equal(myDataError("<Response><error><message>Invalid credentials</message></error></Response>"),"Invalid credentials");
});
