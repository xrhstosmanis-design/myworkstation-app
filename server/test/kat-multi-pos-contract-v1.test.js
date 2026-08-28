import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";

const [cash,pos,ledger,e2e]=await Promise.all([
  readFile(new URL("../src/routes/cash-control.js",import.meta.url),"utf8"),
  readFile(new URL("../src/routes/store-pos.js",import.meta.url),"utf8"),
  readFile(new URL("../src/routes/store-transactions.js",import.meta.url),"utf8"),
  readFile(new URL("../e2e/multi-pos-shift-isolation-flow.mjs",import.meta.url),"utf8")
]);

test("each KAT POS opens and returns its own terminal-scoped shift",()=>{
  assert.match(cash,/CashShiftSession_one_open_per_terminal_idx/);
  assert.match(cash,/"terminalPos"=\$\{terminalPos\} AND "status"='OPEN'/);
  assert.match(cash,/INSERT INTO "CashShiftSession" \("id","companyId","storeId","terminalPos"/);
  assert.doesNotMatch(e2e,/UPDATE "CashShiftSession" SET "terminalPos"/);
  assert.match(e2e,/assert\.equal\(open1\.payload\.terminalPos,"POS-1"\)/);
  assert.match(e2e,/assert\.equal\(open2\.payload\.terminalPos,"POS-2"\)/);
});

test("multiple KAT POS terminals share store stock but isolate sale ledgers",()=>{
  assert.match(pos,/reserveSharedStock\(tx,\{companyId:req\.user\.companyId,storeId:store\.id,productId:item\.productId,quantity:item\.quantity/);
  assert.match(pos,/COALESCE\(sp\."currentStock",0\)>=\$\{quantity\}/);
  assert.match(pos,/NOT EXISTS\(SELECT 1 FROM "PreparationRecipeLine"/);
  assert.match(pos,/SHARED_STOCK_INSUFFICIENT/);
  assert.match(pos,/"terminalPos"=\$\{terminalPos\} AND "status"='OPEN'/);
  assert.match(ledger,/"terminalPos"=\$\{terminalPos\} AND "status"='OPEN'/);
  assert.match(ledger,/WHERE "sessionId"=\$\{openSession\.id\}/);
  assert.match(e2e,/assert\.equal\(Number\(stock\?\.currentStock\),7/);
  assert.match(e2e,/POS-1 ledger includes another terminal/);
  assert.match(e2e,/POS-2 ledger includes another terminal/);
});

test("one KAT POS cannot close another terminal shift",()=>{
  assert.match(e2e,/crossTerminalClose\.response\.status,403/);
  assert.match(e2e,/άλλου POS/);
  assert.match(e2e,/Closing POS-1 closed or hid POS-2 shift/);
});
