import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const storeBootstrap=await readFile(
  new URL("../src/store-integration-bootstrap.js",import.meta.url),
  "utf8",
);
const efoodRoutes=await readFile(
  new URL("../src/routes/platform-efood-integrations.js",import.meta.url),
  "utf8",
);

test("legacy integration kind constraints are replaced before EFOOD is added",()=>{
  assert.match(storeBootstrap,/DROP CONSTRAINT IF EXISTS "StoreIntegrationCredential_kind_check"/);
  assert.match(storeBootstrap,/attname='kind'/);
  assert.match(storeBootstrap,/= ANY \(conkey\)/);
  assert.match(storeBootstrap,/DROP CONSTRAINT IF EXISTS %I/);
  assert.match(storeBootstrap,/CHECK \("kind" IN \('MYDATA','VAT_LOOKUP','EFOOD'\)\)/);
  assert.doesNotMatch(storeBootstrap,/pg_get_constraintdef\(oid\) LIKE '%\\"kind\\"%'/);
});

test("efood credentials remain LAB-only and fail closed",()=>{
  assert.match(efoodRoutes,/requireEfoodLabStore/);
  assert.match(efoodRoutes,/body\.environment!=="SANDBOX"/);
  assert.match(efoodRoutes,/"enabled"=false/);
  assert.match(efoodRoutes,/"externalCallsEnabled"=false/);
  assert.match(efoodRoutes,/orderPostingEnabled:false/);
  assert.match(efoodRoutes,/stockMutationEnabled:false/);
  assert.match(efoodRoutes,/paymentPostingEnabled:false/);
  assert.match(efoodRoutes,/fiscalExecutionEnabled:false/);
});
