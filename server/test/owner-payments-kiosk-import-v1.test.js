import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const route=await readFile(new URL("../src/routes/owner-payments-import.js",import.meta.url),"utf8");
const client=await readFile(new URL("../../client/src/components/commerce/installKioskPaymentsImport.js",import.meta.url),"utf8");
const entry=await readFile(new URL("../../client/src/entry.jsx",import.meta.url),"utf8");
const server=await readFile(new URL("../src/index.js",import.meta.url),"utf8");

test("kiosk import accepts only controlled spreadsheet exports",()=>{
  assert.match(route,/import \* as XLSX from "xlsx"/);
  assert.match(route,/\.\(xlsx\|xls\|csv\)/);
  assert.match(route,/8\*1024\*1024/);
  assert.match(route,/sheet_to_json/);
  assert.match(route,/findHeader/);
  assert.match(route,/Ημερομηνία και Ποσό\/Πληρωμές/);
});

test("kiosk import is tenant store scoped and deduplicated",()=>{
  assert.match(route,/companyId:req\.user\.companyId/);
  assert.match(route,/id:body\.storeId/);
  assert.match(route,/sourceHash/);
  assert.match(route,/CREATE UNIQUE INDEX IF NOT EXISTS "StoreTransaction_kiosk_import_hash_key"/);
  assert.match(route,/ON CONFLICT DO NOTHING RETURNING "id"/);
  assert.match(route,/crypto\.createHash\("sha256"\)/);
});

test("imported Kiosk rows never alter an open shift",()=>{
  assert.match(route,/"sessionId"[\s\S]*NULL/);
  assert.match(route,/"subtractFromShift"[\s\S]*false/);
  assert.match(route,/'KIOSK_IMPORT'/);
  assert.doesNotMatch(route,/CashShiftSession/);
  assert.doesNotMatch(route,/FiscalDocument/);
});

test("owner UI exposes explicit Kiosk import with store requirement",()=>{
  assert.match(client,/Εισαγωγή Kiosk Excel \/ CSV/);
  assert.match(client,/data-op-store/);
  assert.match(client,/Επίλεξε πρώτα συγκεκριμένο κατάστημα/);
  assert.match(client,/\/api\/owner-payments\/import-kiosk/);
  assert.match(client,/διπλές/);
  assert.match(client,/δεν αφαιρούνται από καμία βάρδια/);
});

test("Kiosk import is mounted in both client and server entry points",()=>{
  assert.match(entry,/installKioskPaymentsImport/);
  assert.match(server,/ownerPaymentsImportRoutes/);
  assert.match(server,/owner-payments-import\.js/);
});
