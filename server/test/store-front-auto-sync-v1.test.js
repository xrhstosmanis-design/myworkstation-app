import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const operator=await readFile(new URL("../../client/src/components/store/StoreOperatorApp.jsx",import.meta.url),"utf8");
const backoffice=await readFile(new URL("../../client/src/components/cloud/StoreCloudPage.jsx",import.meta.url),"utf8");

test("Store Mode publishes a store-scoped refresh signal after real ledger changes",()=>{
  assert.match(operator,/const STORE_SYNC_KEY="myworkstation:store-sync"/);
  assert.match(operator,/localStorage\.setItem\(STORE_SYNC_KEY,JSON\.stringify\(\{storeId:session\?\.store\?\.id\|\|storeId,at:Date\.now\(\)\}\)\)/);
  assert.match(operator,/const changed=\(\)=>\{setLedgerVersion\(v=>v\+1\);/);
});

test("BackOffice refreshes both operational panels when the same store changes",()=>{
  assert.match(backoffice,/window\.addEventListener\("storage",syncFromStoreMode\)/);
  assert.match(backoffice,/payload\.storeId===store\.id/);
  assert.match(backoffice,/window\.addEventListener\("focus",refreshOnFocus\)/);
  assert.match(backoffice,/key=\{`transactions-\$\{version\}`\}/);
  assert.match(backoffice,/key=\{`cash-\$\{version\}`\}/);
});
