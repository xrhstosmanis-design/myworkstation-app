import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";
import {invoiceNodes,invoiceSummary,myDataError,nextPage,unwrapMyDataXml} from "../src/mydata-xml.js";

const route=await readFile(new URL("../src/routes/commerce-mydata-inbox.js",import.meta.url),"utf8");
const ui=await readFile(new URL("../../client/src/components/commerce/InvoiceInboxPanel.jsx",import.meta.url),"utf8");

test("production receiving requires company VAT and leaves fiscal issuance untouched",()=>{
  assert.match(route,/\["SANDBOX","PRODUCTION"\]/);assert.match(route,/doc.counterpartVat!==companyVat/);assert.match(route,/fiscalTransmission:false/);
});
test("AADE pagination requires both continuation keys",()=>{
  assert.deepEqual(nextPage("<response><nextPartitionKey>p</nextPartitionKey><nextRowKey>r</nextRowKey></response>"),{partition:"p",row:"r"});
  assert.equal(nextPage("<response></response>"),null);
  assert.throws(()=>nextPage("<response><nextPartitionKey>p</nextPartitionKey></response>"));
});
test("myDATA documents are idempotent and remain inbox drafts",()=>{
  assert.match(route,/UNIQUE \("companyId","mark"\)/);assert.match(route,/SELECT "inboxId" FROM "MyDataInboundDocument"/);assert.match(route,/'RECEIVED'/);assert.match(route,/stockUpdated:false/);
});
test("zero results distinguish an empty AADE response from rejected documents",()=>{
  assert.match(route,/fetched===0\?/);assert.match(route,/ignoredVat/);assert.match(route,/missingMark/);
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

const envelope=xml=>`<?xml version="1.0"?><string xmlns="http://schemas.microsoft.com/2003/10/Serialization/">${xml.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")}</string>`;
test("production string envelope preserves invoice XML and continuation keys",()=>{
  const inner=`<RequestedDoc xmlns="http://www.aade.gr/myDATA/invoice/v1.0"><invoicesDoc><invoice><mark>12345</mark><uid>A&amp;B</uid><counterpart><vatNumber>088888888</vatNumber></counterpart><invoiceSummary><totalGrossValue>12.40</totalGrossValue></invoiceSummary></invoice></invoicesDoc><nextPartitionKey>p</nextPartitionKey><nextRowKey>r</nextRowKey></RequestedDoc>`;
  const xml=unwrapMyDataXml(envelope(inner));
  assert.equal(xml,inner);
  assert.equal(unwrapMyDataXml(inner),inner);
  const invoices=invoiceNodes(xml);assert.equal(invoices.length,1);
  assert.equal(invoiceSummary(invoices[0]).mark,"12345");
  assert.equal(invoiceSummary(invoices[0]).uid,"A&B");
  assert.equal(invoiceSummary(invoices[0]).counterpartVat,"088888888");
  assert.equal(invoiceSummary(invoices[0]).totalGross,12.4);
  assert.deepEqual(nextPage(xml),{partition:"p",row:"r"});
  assert.match(route,/const xml=unwrapMyDataXml\(responseXml\)/);
});
test("wrapped errors and empty results remain distinct",()=>{
  assert.equal(myDataError(unwrapMyDataXml(envelope("<Response><error><message>Invalid credentials</message></error></Response>"))),"Invalid credentials");
  assert.deepEqual(invoiceNodes(unwrapMyDataXml(envelope("<RequestedDoc></RequestedDoc>"))),[]);
  assert.throws(()=>unwrapMyDataXml(envelope("not XML")),/περιτύλιγμα/);
});
