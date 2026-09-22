import fs from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const route=fs.readFileSync(new URL("../src/routes/platform-invoice-learning-ai.js",import.meta.url),"utf8");

test("Invoice Learning uses the same Azure transport as the POS reader",()=>{
  assert.match(route,/import \{callAzure as callPosAzure\} from "\.\/commerce-azure-invoice-reader\.js"/);
  assert.match(route,/callPosAzure\(\{contentData:fileData,mimeType\}\)/);
  assert.doesNotMatch(route,/async function callAzureOnce\(/);
});

test("Invoice Learning follows the POS fallback when Azure transport fails",()=>{
  const providerFailure=route.indexOf('azureState="REQUEST_FAILED"');
  const openAiFallback=route.indexOf('const fileParts=pages.map');
  assert.ok(providerFailure>=0&&openAiFallback>providerFailure);
  assert.doesNotMatch(route,/if\(azureState==="REQUEST_FAILED"\)return res\.status\(503\)/);
  assert.match(route,/if\(!process\.env\.OPENAI_API_KEY\)return res\.status\(503\)/);
});
