import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {publicAzureFailureCode,retryableAzureFailure} from "../src/routes/platform-invoice-learning-ai.js";

const route=fs.readFileSync(new URL("../src/routes/platform-invoice-learning-ai.js",import.meta.url),"utf8");

test("Invoice Learning retries only transient Azure transport and service failures",()=>{
  assert.equal(retryableAzureFailure(new Error("AZURE_ANALYZE_429:busy")),true);
  assert.equal(retryableAzureFailure(new Error("AZURE_POLL_503")),true);
  assert.equal(retryableAzureFailure(new TypeError("fetch failed")),true);
  assert.equal(retryableAzureFailure(new Error("AZURE_TIMEOUT")),true);
  assert.equal(retryableAzureFailure(new Error("AZURE_ANALYZE_401:bad key")),false);
  assert.equal(retryableAzureFailure(new Error("AZURE_EMPTY_DOCUMENT")),false);
});

test("Invoice Learning exposes only safe actionable Azure diagnostics",()=>{
  assert.equal(publicAzureFailureCode(new Error("AZURE_ANALYZE_401:secret provider body")),"AUTH_401");
  assert.equal(publicAzureFailureCode(new Error("AZURE_ANALYZE_404:not found")),"ENDPOINT_OR_MODEL_404");
  assert.equal(publicAzureFailureCode(new Error("AZURE_POLL_429")),"RATE_LIMIT_429");
  assert.equal(publicAzureFailureCode(new TypeError("fetch failed")),"NETWORK");
  assert.equal(publicAzureFailureCode(new Error("AZURE_TIMEOUT")),"TIMEOUT");
});

test("Invoice Learning uses the configured POS-style fallback after an Azure request failure",()=>{
  const providerFailure=route.indexOf('azureState="REQUEST_FAILED"');
  const openAiGuard=route.indexOf('if(!process.env.OPENAI_API_KEY)',providerFailure);
  const openAi=route.indexOf('const base64=String(fileData)',openAiGuard);
  assert.ok(providerFailure>0);
  assert.ok(openAiGuard>providerFailure);
  assert.ok(openAi>openAiGuard);
  assert.doesNotMatch(route,/if\(azureState==="REQUEST_FAILED"\)return res\.status\(503\)/);
  assert.match(route,/azureFailureCode/);
  assert.match(route,/for\(let attempt=1;attempt<=3;attempt\+\+\)/);
  assert.match(route,/if\(!completeness\.complete\)return res\.json\(\{\.\.\.result,azureState,completeness,requiresManualCompletion:true,partialResult:true\}\)/);
});
