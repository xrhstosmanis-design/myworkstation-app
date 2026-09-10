import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read=path=>fs.readFileSync(new URL(path,import.meta.url),"utf8");
const ai=read("../src/routes/commerce-pos-ai-recheck.js");
const intake=read("../src/routes/commerce-pos-v244-core.js");
const approval=read("../src/routes/commerce-invoice-draft-approval.js");
const suppliers=read("../src/routes/supplier-control.js");
const audit=read("../src/routes/kiosk-reports-audit.js");
const ui=read("../../client/src/components/store/StoreSupplierInvoiceV244.jsx");

test("AI and review UI distinguish invoices from supplier credit notes",()=>{
  assert.match(ai,/documentType:\{type:"string",enum:\["INVOICE","CREDIT_NOTE"\]\}/);
  assert.match(ai,/ΠΙΣΤΩΤΙΚΟ \/ CREDIT NOTE/);
  assert.match(ui,/<option value="CREDIT_NOTE">Πιστωτικό τιμολόγιο<\/option>/);
  assert.match(intake,/documentType:z\.enum\(\["INVOICE","CREDIT_NOTE"\]\)/);
  assert.match(intake,/\$\{body\.documentType\}/);
});

test("credit note approval subtracts stock exactly once and records supplier return",()=>{
  assert.match(approval,/if\(doc\.status==="APPROVED"\)return \{alreadyApproved:true/);
  assert.match(approval,/stockSign=creditNote\?-1:1/);
  assert.match(approval,/creditNote\?'SUPPLIER_RETURN':'PURCHASE'/);
  assert.match(approval,/creditNote\?'CREDIT_NOTE_APPROVAL':'PURCHASE_APPROVAL'/);
  assert.match(audit,/STOCK_SUPPLIER_RETURN="Επιστροφή σε προμηθευτή"/);
});

test("supplier balance treats an approved credit note as a negative amount",()=>{
  assert.match(suppliers,/d\."documentType"='CREDIT_NOTE' THEN -d\."totalGross"/);
  assert.match(suppliers,/THEN 'CREDIT_NOTE' ELSE 'PURCHASE'/);
});
