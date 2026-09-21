import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const dispatch=await readFile(new URL("../../client/src/entry-dispatch.js",import.meta.url),"utf8");
const index=await readFile(new URL("../../client/index.html",import.meta.url),"utf8");
const lab=await readFile(new URL("../../client/src/invoice-learning-lab-bootstrap.js",import.meta.url),"utf8");

test("Invoice Learning waits for central workspace restore before rendering",()=>{
  assert.match(dispatch,/module=>module\.invoiceLearningServerSyncReady/);
  assert.ok(dispatch.indexOf("invoiceLearningServerSyncReady")<dispatch.indexOf("invoice-learning-lab-bootstrap.js"));
  assert.doesNotMatch(index,/src\/invoice-learning-lab-bootstrap\.js/);
});

test("a centrally restored invoice can continue without another OCR read",()=>{
  assert.match(lab,/function continueLearning\(d\)/);
  assert.match(lab,/data-continue-invoice/);
  assert.match(lab,/δεν γίνεται νέα OCR ανάγνωση/);
  assert.match(lab,/Συνέχιση \/ Επιβεβαίωση/);
});
