import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const lab=fs.readFileSync(new URL("../../client/src/invoice-learning-lab-bootstrap.js",import.meta.url),"utf8");

test("Invoice Learning draft save waits for durable central persistence and reports success",()=>{
  assert.match(lab,/async function persistWorkspaceNow\(\)/);
  assert.match(lab,/fetch\('\/api\/platform\/invoice-learning\/workspace',\{method:'PUT'/);
  assert.match(lab,/\$\('#saveDraft'\)\.onclick=async\(\)=>/);
  assert.match(lab,/await persistWorkspaceNow\(\)/);
  assert.match(lab,/Το πρόχειρο αποθηκεύτηκε κεντρικά στο Learning Lab/);
});

test("Invoice Learning draft save exposes a visible failure instead of silently doing nothing",()=>{
  assert.match(lab,/Δεν αποθηκεύτηκε το πρόχειρο:/);
  assert.match(lab,/alert\(`Δεν αποθηκεύτηκε το πρόχειρο\./);
  assert.match(lab,/button\.disabled=true;button\.textContent='Αποθήκευση…'/);
});
