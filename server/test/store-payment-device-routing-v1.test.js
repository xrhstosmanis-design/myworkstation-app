import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const platformRoutes=await readFile(new URL("../src/routes/platform-admin.js",import.meta.url),"utf8");
const platformUi=await readFile(new URL("../../client/src/components/platform/PlatformAdminApp.jsx",import.meta.url),"utf8");

test("Super Admin stores configurable fiscal and EFTPOS device mappings",()=>{
  assert.match(platformRoutes,/CREATE TABLE IF NOT EXISTS "StoreFiscalDevice"/);
  assert.match(platformRoutes,/CREATE TABLE IF NOT EXISTS "StoreEftposDevice"/);
  assert.match(platformRoutes,/device-routing/);
  assert.match(platformRoutes,/STORE_PAYMENT_DEVICE_ROUTING_UPDATED/);
  assert.match(platformRoutes,/fallbackAllowed:false/);
  assert.match(platformUi,/Fiscal \/ EFTPOS mapping/);
  assert.match(platformUi,/saveTerminalDeviceRouting/);
  assert.match(platformUi,/Fail-closed: δεν γίνεται αυτόματη επιλογή άλλου EFTPOS/);
});

test("mapping binds one fiscal device to one physical installation terminal",()=>{
  assert.match(platformRoutes,/UNIQUE \("storeId","terminalPos"\)/);
  assert.match(platformRoutes,/Δεν υπάρχουν ενεργά installation terminals/);
});

test("each fiscal device has explicit STORE or DELIVERY EFTPOS routing",()=>{
  assert.match(platformRoutes,/CHECK \("role" IN \('STORE','DELIVERY'\)\)/);
  assert.match(platformRoutes,/UNIQUE \("storeId","fiscalDeviceCode","role"\)/);
  assert.match(platformRoutes,/Το EFTPOS δείχνει σε ταμειακή που δεν υπάρχει στο mapping/);
});

test("device mapping replacement is atomic and writes EFTPOS after fiscal devices",()=>{
  const transaction=platformRoutes.indexOf("await prisma.$transaction(async tx=>",platformRoutes.indexOf('router.put("/companies/:companyId/stores/:storeId/device-routing"'));
  const deleteEftpos=platformRoutes.indexOf('DELETE FROM "StoreEftposDevice"',transaction);
  const deleteFiscal=platformRoutes.indexOf('DELETE FROM "StoreFiscalDevice"',transaction);
  const insertFiscal=platformRoutes.indexOf('INSERT INTO "StoreFiscalDevice"',deleteFiscal);
  const insertEftpos=platformRoutes.indexOf('INSERT INTO "StoreEftposDevice"',insertFiscal);
  assert.ok(transaction>0&&deleteEftpos>transaction&&deleteFiscal>deleteEftpos&&insertFiscal>deleteFiscal&&insertEftpos>insertFiscal);
});
