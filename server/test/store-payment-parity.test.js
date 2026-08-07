import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const route=await readFile(new URL("../src/routes/store-transactions.js",import.meta.url),"utf8");
const client=await readFile(new URL("../../client/src/components/store/StoreTransactionsPanel.jsx",import.meta.url),"utf8");

test("supplier payments and other expenses require a protected photo",()=>{
  assert.match(route,/needsPhoto=body\.type==="SUPPLIER_PAYMENT"\|\|body\.type==="OTHER_EXPENSE"/);
  assert.match(route,/Η φωτογραφία παραστατικού είναι υποχρεωτική/);
  assert.match(route,/image\\\/\(\?:jpeg\|png\|webp\)/);
  assert.match(route,/bytes\.length>1200000/);
  assert.match(route,/attachmentChecksum/);
});

test("store operators only receive and open their own transactions",()=>{
  assert.match(route,/req\.user\.tokenType!=="STORE_OPERATOR"/);
  assert.match(route,/"actorId"=\$\{req\.user\.id\}/);
  assert.match(route,/row\.actorId!==req\.user\.id/);
  assert.match(route,/Μπορείς να δεις μόνο τα δικά σου παραστατικά/);
});

test("my transactions query reads from the protected ledger table",()=>{
  assert.match(route,/SELECT "id","companyId","storeId"[\s\S]*FROM "StoreTransaction"[\s\S]*"actorId"=\$\{req\.user\.id\}/);
});

test("store UI exposes camera capture and my payments",()=>{
  assert.match(client,/capture="environment"/);
  assert.match(client,/Οι πληρωμές και συναλλαγές μου/);
  assert.match(client,/photoRequired\(type\)&&!attachment/);
  assert.match(client,/Προβολή φωτογραφίας/);
});
