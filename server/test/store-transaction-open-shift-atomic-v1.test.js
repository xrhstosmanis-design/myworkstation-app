import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const route=await readFile(new URL("../src/routes/store-transactions.js",import.meta.url),"utf8");
const createStart=route.indexOf('router.post("/stores/:storeId"');
const createEnd=route.indexOf('router.get("/:transactionId/attachment"',createStart);
const createRoute=route.slice(createStart,createEnd);

test("a store transaction is inserted atomically only from an open scoped shift",()=>{
  assert.match(createRoute,/INSERT INTO "StoreTransaction"[\s\S]*SELECT[\s\S]*FROM "CashShiftSession" shift/);
  assert.match(createRoute,/shift\."storeId"=\$\{store\.id\}/);
  assert.match(createRoute,/shift\."companyId"=\$\{req\.user\.companyId\}/);
  assert.match(createRoute,/shift\."status"='OPEN'/);
  assert.match(createRoute,/shift\."id"[\s\S]*RETURNING \*/);
  assert.doesNotMatch(createRoute,/SELECT "id" FROM "CashShiftSession"/);
});

test("a shift closed before persistence produces a conflict and no notification",()=>{
  const conflict=createRoute.indexOf("Η βάρδια έχει κλείσει ή δεν είναι πλέον ενεργή");
  const notification=createRoute.indexOf("notifyLedgerAlert");
  assert.ok(conflict>createRoute.indexOf('RETURNING *'));
  assert.ok(notification>conflict);
  assert.match(createRoute,/if\(!rows\[0\]\)return res\.status\(409\)/);
  assert.match(createRoute,/Η συναλλαγή δεν αποθηκεύτηκε/);
});

const reverseStart=route.indexOf('router.post("/:transactionId/reverse"');
const reverseRoute=route.slice(reverseStart);

test("a reversal is atomic and permitted only while its scoped shift is open",()=>{
  assert.match(reverseRoute,/UPDATE "StoreTransaction" transaction[\s\S]*FROM "CashShiftSession" shift/);
  assert.match(reverseRoute,/transaction\."companyId"=\$\{req\.user\.companyId\}/);
  assert.match(reverseRoute,/transaction\."reversedAt" IS NULL/);
  assert.match(reverseRoute,/shift\."id"=transaction\."sessionId"/);
  assert.match(reverseRoute,/shift\."companyId"=transaction\."companyId"/);
  assert.match(reverseRoute,/shift\."storeId"=transaction\."storeId"/);
  assert.match(reverseRoute,/shift\."status"='OPEN'/);
});

test("a closed shift cannot be changed or trigger a reversal email",()=>{
  const conflict=reverseRoute.indexOf("Η βάρδια της συναλλαγής έχει κλείσει");
  const notification=reverseRoute.indexOf("notifyLedgerAlert");
  assert.ok(conflict>reverseRoute.indexOf("RETURNING transaction.*"));
  assert.ok(notification>conflict);
  assert.match(reverseRoute,/if\(!rows\[0\]\)return res\.status\(409\)/);
  assert.match(reverseRoute,/οριστικοποιημένα στοιχεία/);
});
