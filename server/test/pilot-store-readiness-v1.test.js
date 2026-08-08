import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const route=await readFile(new URL("../src/routes/platform-admin.js",import.meta.url),"utf8");
const ui=await readFile(new URL("../../client/src/components/platform/PlatformAdminApp.jsx",import.meta.url),"utf8");

test("Super Admin pilot readiness is tenant and store scoped",()=>{
  assert.match(route,/companies\/:companyId\/stores\/:storeId\/pilot-readiness/);
  assert.match(route,/where:\{id:req\.params\.companyId\}/);
  assert.match(route,/stores:\{where:\{id:req\.params\.storeId\}/);
});

test("readiness checks mandatory pilot modules, credentials, manager and mail",()=>{
  assert.match(route,/requiredModules=\["CORE","STORE_MODE","CASH_CONTROL","PILOT_REPORT"\]/);
  assert.match(route,/"pinHash" IS NOT NULL/);
  assert.match(route,/"role"='MANAGER'/);
  assert.match(route,/getMailStatus\(\)/);
  assert.match(route,/to_regclass\('public\."CashShiftSession"'\)/);
});

test("Super Admin can assign the Store Mode manager remotely without changing credentials",()=>{
  assert.match(route,/stores\/:storeId\/store-mode-manager/);
  assert.match(route,/SET "role"='MANAGER'/);
  assert.match(route,/if\(!selected\[0\]\.hasCredential\)/);
  assert.match(ui,/Απομακρυσμένα · δεν αλλάζει PIN και δεν ανοίγει βάρδια/);
});

test("the readiness report separates remote work from checks performed at KAT",()=>{
  assert.match(route,/ΑΠΟΜΑΚΡΥΣΜΕΝΑ — Υπεύθυνος Store Mode/);
  assert.match(route,/ΑΠΟΜΑΚΡΥΣΜΕΝΑ — Επιβεβαιωμένο backup/);
  assert.match(route,/ΣΤΟ ΚΑΤ — Δοκιμή εισόδου εργαζομένου/);
  assert.match(route,/ΣΤΟ ΚΑΤ — Δοκιμή ανοίγματος και κλεισίματος βάρδιας/);
  assert.match(route,/ΣΤΟ ΚΑΤ — Επιβεβαίωση ανεπηρέαστου Kiosk Manager/);
});

test("readiness is read only and keeps RBS outside the pilot flow",()=>{
  assert.match(route,/Παράλληλη μη φορολογική λειτουργία — καμία εντολή προς RBS/);
  assert.match(ui,/Ο έλεγχος είναι μόνο ανάγνωσης/);
  assert.match(ui,/δεν επικοινωνεί με RBS\/ταμειακή/);
});
