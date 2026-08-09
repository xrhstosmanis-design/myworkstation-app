import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const route=await readFile(new URL("../src/routes/owner-payments-import.js",import.meta.url),"utf8");
const client=await readFile(new URL("../../client/src/components/commerce/installKioskPaymentsImport.js",import.meta.url),"utf8");
const entry=await readFile(new URL("../../client/src/entry.jsx",import.meta.url),"utf8");
const server=await readFile(new URL("../src/index.js",import.meta.url),"utf8");

test("kiosk spreadsheet import is controlled",()=>{
  assert.match(route,/XLSX/);
  assert.match(route,/xlsx\|xls\|csv/);
  assert.match(route,/8\*1024\*1024/);
  assert.match(route,/sheet_to_json/);
  assert.match(route,/findHeader/);
  assert.match(route,/Ημερομηνία και Ποσό\/Πληρωμές/);
});

test("kiosk import is tenant scoped and duplicate safe",()=>{
  assert.match(route,/companyId:req\.user\.companyId/);
  assert.match(route,/id:body\.storeId/);
  assert.match(route,/sourceHash/);
  assert.match(route,/StoreTransaction_kiosk_import_hash_key/);
  assert.match(route,/ON CONFLICT DO NOTHING/);
  assert.match(route,/createHash\("sha256"\)/);
});

test("historical kiosk imports cannot alter shift or fiscal state",()=>{
  assert.match(route,/sessionId/);
  assert.match(route,/subtractFromShift/);
  assert.match(route,/KIOSK_IMPORT/);
  assert.doesNotMatch(route,/CashShiftSession/);
  assert.doesNotMatch(route,/FiscalDocument/);
});

test("owner dashboard exposes Kiosk Excel CSV import",()=>{
  assert.match(client,/Εισαγωγή Kiosk Excel \/ CSV/);
  assert.match(client,/data-op-store/);
  assert.match(client,/Επίλεξε πρώτα συγκεκριμένο κατάστημα/);
  assert.match(client,/owner-payments\/import-kiosk/);
  assert.match(client,/διπλές/);
  assert.match(client,/δεν αφαιρούνται από καμία βάρδια/);
});

test("Kiosk import is mounted in client and server",()=>{
  assert.match(entry,/installKioskPaymentsImport/);
  assert.match(server,/ownerPaymentsImportRoutes/);
  assert.match(server,/owner-payments-import\.js/);
});
