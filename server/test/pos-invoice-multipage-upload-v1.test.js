import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const client=await readFile(new URL("../../client/src/components/store/StoreSupplierInvoicePremiumFast.jsx",import.meta.url),"utf8");
const intake=await readFile(new URL("../src/routes/commerce-pos-v244-core.js",import.meta.url),"utf8");
const wrapper=await readFile(new URL("../src/routes/commerce-pos-v244.js",import.meta.url),"utf8");
const jobs=await readFile(new URL("../src/routes/commerce-v1.js",import.meta.url),"utf8");

test("POS accepts and visibly orders up to five pages for one invoice",()=>{
  assert.match(client,/type="file" multiple accept="image\/\*,application\/pdf"/);
  assert.match(client,/incoming\.length>5-pages\.length/);
  assert.match(client,/Σελίδα \{index\+1\}/);
  assert.match(client,/movePage\(index,-1\)/);
  assert.match(client,/movePage\(index,1\)/);
});

test("multipage OCR concatenates product lines in the selected page order",()=>{
  const background=client.slice(client.indexOf("async function backgroundV244"),client.indexOf("export default function"));
  assert.match(background,/for\(const \[pageIndex,page\] of pages\.entries\(\)\)/);
  assert.match(background,/combinedLines\.push\(\.\.\.pageLines\)/);
  assert.match(background,/productLines:combinedLines/);
  assert.match(background,/additionalPageJobIds:pageJobs\.slice\(1\)/);
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
