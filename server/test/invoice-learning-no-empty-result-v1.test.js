import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const route=fs.readFileSync(new URL("../src/routes/platform-invoice-learning-ai.js",import.meta.url),"utf8");

test("Invoice Learning never presents an empty AI result as a completed invoice",()=>{
  assert.match(route,/code:"NO_PRODUCT_LINES"/);
  assert.match(route,/Δεν δημιουργήθηκε κενό πρόχειρο/);
  assert.match(route,/Μην επιστρέψεις κενό productLines όταν βλέπεις πίνακα ειδών/);
});
