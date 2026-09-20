import fs from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const route=fs.readFileSync(new URL("../src/routes/platform-invoice-learning-ai.js",import.meta.url),"utf8");

test("Invoice Learning uses the same Azure transport as the POS reader",()=>{
  assert.match(route,/import \{callAzure as callPosAzure\} from "\.\/commerce-azure-invoice-reader\.js"/);
  assert.match(route,/callPosAzure\(\{contentData:fileData,mimeType\}\)/);
  assert.doesNotMatch(route,/async function callAzureOnce\(/);
});
