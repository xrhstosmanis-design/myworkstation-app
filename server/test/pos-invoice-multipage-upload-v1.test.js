import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const client=await readFile(new URL("../../client/src/components/store/StoreSupplierInvoicePremiumFast.jsx",import.meta.url),"utf8");
const intake=await readFile(new URL("../src/routes/commerce-pos-v244-core.js",import.meta.url),"utf8");
const wrapper=await readFile(new URL("../src/routes/commerce-pos-v244.js",import.meta.url),"utf8");
const jobs=await readFile(new URL("../src/routes/commerce-v1.js",import.meta.url),"utf8");
const azure=await readFile(new URL("../src/routes/commerce-azure-invoice-reader.js",import.meta.url),"utf8");
const aiRecheck=await readFile(new URL("../src/routes/commerce-pos-ai-recheck.js",import.meta.url),"utf8");

test("POS accepts and visibly orders up to five pages for one invoice",()=>{
  assert.match(client,/type="file" multiple accept="image\/\*,application\/pdf"/);
  assert.match(client,/incoming\.length>5-pages\.length/);
  assert.match(client,/Σελίδα \{index\+1\}/);
  assert.match(client,/movePage\(index,-1\)/);
  assert.match(client,/movePage\(index,1\)/);
});

test("multipage OCR sends all ordered pages through one invoice analysis",()=>{
  const background=client.slice(client.indexOf("async function backgroundV244"),client.indexOf("export default function"));
  assert.match(background,/for\(const \[pageIndex,page\] of pages\.entries\(\)\)/);
  assert.match(background,/ai-recheck.*additionalPageJobIds:pageJobs\.slice\(1\)/s);
  assert.match(background,/const combinedLines=finalizeV244ProductLines/);
  assert.match(background,/productLines:combinedLines/);
  assert.match(background,/additionalPageJobIds:pageJobs\.slice\(1\)/);
  assert.match(aiRecheck,/const fileParts=pageJobs\.map/);
  assert.match(aiRecheck,/content:\[\{type:"input_text",text:prompt\},\.\.\.fileParts\]/);
  assert.match(aiRecheck,/πρώτα από τη σελίδα 1, μετά από τη σελίδα 2/);
  assert.match(azure,/additionalPageJobIds.*return next\(\)/s);
});

test("a multipage invoice is blocked rather than saved empty when no product lines are found",()=>{
  const background=client.slice(client.indexOf("async function backgroundV244"),client.indexOf("export default function"));
  assert.match(background,/if\(!combinedLines\.length\)throw new Error/);
  assert.doesNotMatch(background,/allowEmptyLines/);
  assert.match(wrapper,/if\(!lines\.length\)return res\.status\(409\)/);
  assert.match(intake,/rawLines\.length===0\)return res\.status\(409\)/);
});

test("all page attachments are archived only after the single purchase is created",()=>{
  assert.match(wrapper,/additionalPageJobIds:Array\.isArray\(source\.additionalPageJobIds\)/);
  assert.match(intake,/additionalPageJobIds:z\.array\(z\.string\(\)\.min\(1\)\)\.max\(4\)/);
  assert.match(intake,/const archiveJobs=\[job,/);
  assert.match(intake,/Σελίδα \$\{pageIndex\+1\}\/\$\{archiveJobs\.length\}/);
  assert.match(intake,/"status"='MERGED_PAGE'/);
  assert.match(jobs,/COALESCE\(j\."status",''\)<>'MERGED_PAGE'/);
  assert.ok(intake.indexOf('INSERT INTO "PurchaseOrder"')<intake.indexOf('const archiveJobs='));
});

test("additional page jobs are locked individually and internal intake errors identify their stage",()=>{
  assert.match(intake,/for\(const pageJobId of pageJobIds\)/);
  assert.match(intake,/"id"=\$\{pageJobId\} LIMIT 1 FOR UPDATE/);
  assert.doesNotMatch(intake,/ANY\(\$\{pageJobIds\}::text\[\]\)/);
  assert.match(intake,/Η καταχώριση τιμολογίου απέτυχε στο στάδιο \$\{stage\}/);
  assert.match(intake,/safeError\.code="V244_INTAKE_INTERNAL"/);
});


test("empty initial invoice extraction triggers the table recovery pass",()=>{
  assert.match(aiRecheck,/const needsTablePass=parsed\.productLines\.length===0\|\|allNumericMissing\|\|partialNumericMissing\|\|totalMismatch/);
  assert.match(aiRecheck,/if\(needsTablePass\)/);
  assert.match(aiRecheck,/const recovered=Array\.isArray\(tableParsed\.productLines\)/);
});


test("multipage invoice recovery falls back to Azure only when no safe line remains",()=>{
  assert.match(aiRecheck,/import \{callAzure,normalizeAzure\} from ".\/commerce-azure-invoice-reader\.js"/);
  assert.match(aiRecheck,/const hasSafeLine=parsed\.productLines\.some/);
  assert.match(aiRecheck,/if\(!hasSafeLine&&process\.env\.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT&&process\.env\.AZURE_DOCUMENT_INTELLIGENCE_KEY\)/);
  assert.match(aiRecheck,/for\(const page of pageJobs\)/);
  assert.match(aiRecheck,/azureRecovered\.push\(\.\.\.\(Array\.isArray\(azure\?\.productLines\)/);
  assert.match(aiRecheck,/parsed\.productLines=mergeRecoveredLines\(parsed\.productLines,azureRecovered\)/);
});
