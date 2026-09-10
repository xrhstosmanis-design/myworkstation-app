import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const route=fs.readFileSync(new URL("../src/routes/owner-shifts.js",import.meta.url),"utf8");
const transactions=fs.readFileSync(new URL("../src/routes/store-transactions.js",import.meta.url),"utf8");
const panel=fs.readFileSync(new URL("../../client/src/components/store/StoreTransactionsPanel.jsx",import.meta.url),"utf8");

test("administrative shift close is Super Admin only, atomic and audited",()=>{
  assert.match(route,/router\.post\("\/:sessionId\/force-close"/);
  assert.match(route,/req\.user\?\.role!=="SUPER_ADMIN"/);
  assert.match(route,/FOR UPDATE OF s/);
  assert.match(route,/SHIFT_FORCE_CLOSED_BY_SUPER_ADMIN/);
  assert.match(route,/physicalCount:false/);
  assert.match(route,/AND "status"='OPEN' RETURNING/);
});

test("shift center exposes force close only from server-granted Super Admin access",()=>{
  assert.match(transactions,/canForceClose:req\.user\?\.tokenType!=="STORE_OPERATOR"&&req\.user\?\.role==="SUPER_ADMIN"/);
  assert.match(panel,/data\?\.access\?\.canForceClose/);
  assert.match(panel,/Κλείσιμο από Super Admin/);
  assert.match(panel,/χωρίς φυσική καταμέτρηση/);
});
