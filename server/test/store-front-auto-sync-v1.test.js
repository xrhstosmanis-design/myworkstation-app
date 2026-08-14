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

test("BackOffice refreshes both operational panels from browser or server ledger changes",()=>{
  assert.match(backoffice,/const SERVER_SYNC_MS=2000/);
  assert.match(backoffice,/window\.addEventListener\("storage",syncFromStoreMode\)/);
  assert.match(backoffice,/payload\.storeId===store\.id/);
  assert.match(backoffice,/window\.addEventListener\("focus",refreshOnFocus\)/);
  assert.match(backoffice,/api\(`\/api\/transactions\/stores\/\$\{store\.id\}\/overview`\)/);
  assert.match(backoffice,/const next=ledgerFingerprint\(result\)/);
  assert.match(backoffice,/if\(next!==lastServerFingerprint\.current\)\{lastServerFingerprint\.current=next;refresh\(\)\}/);
  assert.match(backoffice,/window\.setInterval\(checkServerFingerprint,SERVER_SYNC_MS\)/);
  assert.match(backoffice,/window\.clearInterval\(serverSignalWatch\)/);
  assert.match(backoffice,/key=\{`transactions-\$\{version\}`\}/);
  assert.match(backoffice,/key=\{`cash-\$\{version\}`\}/);
});

test("Automatic operational refresh does not remount owner payment controls",()=>{
  assert.match(backoffice,/<OwnerPaymentQuickActions api=\{api\} store=\{store\} onChanged=\{refresh\}\/\>/);
  assert.doesNotMatch(backoffice,/OwnerPaymentQuickActions key=/);
});
