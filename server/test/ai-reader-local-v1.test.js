import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";

const route=await readFile(new URL("../src/routes/commerce-v1.js",import.meta.url),"utf8");
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
