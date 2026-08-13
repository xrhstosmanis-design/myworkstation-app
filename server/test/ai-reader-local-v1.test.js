import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";

const route=await readFile(new URL("../src/routes/commerce-v1-legacy.js",import.meta.url),"utf8");
const approval=await readFile(new URL("../src/routes/commerce-invoice-draft-approval.js",import.meta.url),"utf8");
const wrapper=await readFile(new URL("../src/routes/commerce-v1.js",import.meta.url),"utf8");
const panel=await readFile(new URL("../../client/src/components/commerce/AiReaderPanel.jsx",import.meta.url),"utf8");
const catalog=await readFile(new URL("../src/services/module-catalog.js",import.meta.url),"utf8");

test("local OCR jobs are tenant and store scoped",()=>{
  assert.match(route,/\/ai-reader\/jobs/);
  assert.match(route,/j\."companyId"=\$\{req\.user\.companyId\}/);
  assert.match(route,/j\."storeId"=\$\{store\.id\}/);
  assert.match(route,/aiCalled:false/);
});

test("AI recheck is manual and provider remains locked",()=>{
  assert.match(panel,/Επανέλεγχος με AI \(χειροκίνητα\)/);
  assert.match(route,/AI provider δεν έχει συνδεθεί ακόμη/);
  assert.match(route,/aiAutomatic:false/);
});

test("reader retains OCR lines and confidence",()=>{
  assert.match(panel,/result\.data\.text/);
  assert.match(panel,/line\.confidence/);
  assert.match(panel,/Μη αναγνωρίσιμο/);
  assert.match(catalog,/key:"AI_READER"[\s\S]*commercialReady:true/);
});

test("OCR confirmation creates a tenant-guarded draft without stock mutation",()=>{
  assert.match(wrapper,/invoiceDraftApprovalRoutes/);
  assert.match(approval,/\/ai-reader\/jobs\/:jobId\/confirm/);
  assert.match(approval,/requireCompanyModule\("AI_READER"\),requireCompanyModule\("INVENTORY"\)/);
  assert.match(approval,/FOR UPDATE/);
  assert.match(approval,/'OCR_DRAFT','DRAFT'/);
  assert.match(approval,/stockUpdated:false/);
  assert.doesNotMatch(approval,/AI_READER_CONFIRM/);
});

test("only management approval updates purchase stock once",()=>{
  assert.match(approval,/\/purchases\/:documentId\/approve/);
  assert.match(approval,/\["OWNER","ADMIN","MANAGER"\]/);
  assert.match(approval,/doc\.status==="APPROVED"/);
  assert.match(approval,/movementType","quantity"[\s\S]*'PURCHASE'/);
  assert.match(approval,/PURCHASE_APPROVAL/);
  assert.match(approval,/"status"='APPROVED'/);
});

test("review UI requires explicit product lines and shows package conversion",()=>{
  assert.match(panel,/Τσέκαρε μόνο τις πραγματικές γραμμές προϊόντων/);
  assert.match(panel,/Τεμ\.\/κιβώτιο/);
  assert.match(panel,/Στην αποθήκη:/);
});
