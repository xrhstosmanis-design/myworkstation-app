import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const cash=fs.readFileSync(new URL("../src/routes/cash-control.js",import.meta.url),"utf8");

test("opening check remains tenant scoped in addition to the store lock",()=>{
  const open=cash.slice(cash.indexOf('router.post("/stores/:storeId/sessions/open"'),cash.indexOf('router.post("/sessions/:sessionId/close"'));
  assert.match(open,/"companyId"=\$\{req\.user\.companyId\}/);
  assert.match(cash,/CashShiftSession_one_open_per_store_idx/);
});

test("cash close is atomic and cannot send a second close email",()=>{
  const update=cash.slice(cash.indexOf('UPDATE "CashShiftSession"',cash.indexOf('router.post("/sessions/:sessionId/close"')));
  assert.match(update,/WHERE "id"=\$\{session\.id\} AND "companyId"=\$\{req\.user\.companyId\} AND "status"='OPEN' RETURNING/);
  assert.ok(update.indexOf("if(!rows[0])")<update.indexOf("sendCashShiftClosedEmail"));
  assert.match(update,/Δεν δημιουργήθηκε δεύτερο κλείσιμο ή email/);
});
