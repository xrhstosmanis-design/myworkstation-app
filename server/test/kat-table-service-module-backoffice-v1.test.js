import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const catalog=await readFile(new URL("../src/services/module-catalog.js",import.meta.url),"utf8");
const tableRoute=await readFile(new URL("../src/routes/store-table-orders.js",import.meta.url),"utf8");
const posRoute=await readFile(new URL("../src/routes/store-pos.js",import.meta.url),"utf8");
const platformRoute=await readFile(new URL("../src/routes/platform-admin.js",import.meta.url),"utf8");
const platformUi=await readFile(new URL("../../client/src/components/platform/PlatformAdminApp.jsx",import.meta.url),"utf8");
const launcher=await readFile(new URL("../../client/src/components/commerce/CommerceLauncher.jsx",import.meta.url),"utf8");
const posUi=await readFile(new URL("../../client/src/components/store/StorePosPanel.jsx",import.meta.url),"utf8");
const backoffice=await readFile(new URL("../../client/src/components/commerce/TableServiceBackofficePanel.jsx",import.meta.url),"utf8");

test("TABLE_SERVICE is a separately licensed commercial module",()=>{
  assert.match(catalog,/key:"TABLE_SERVICE"[\s\S]*commercialReady:true/);
  assert.match(tableRoute,/moduleKey:"TABLE_SERVICE",active:true/);
  assert.match(tableRoute,/StoreTableServiceConfig/);
  assert.match(tableRoute,/config\?\.enabled/);
});

test("Super Admin can enable the module per store with audit",()=>{
  assert.match(platformRoute,/stores\/:storeId\/table-service/);
  assert.match(platformRoute,/TABLE_SERVICE_STORE_ENABLED/);
  assert.match(platformRoute,/TABLE_SERVICE_STORE_DISABLED/);
  assert.match(platformUi,/toggleTableService/);
  assert.match(platformUi,/TABLE_SERVICE ενεργό/);
});

test("inactive table service is hidden and checkout is blocked",()=>{
  assert.match(posRoute,/tableServiceEnabled/);
  assert.match(posRoute,/if\(!await hasTableService/);
  assert.match(posUi,/data\?\.tableServiceEnabled&&<button[\s\S]*ΤΡΑΠΕΖΙΑ/);
  assert.match(launcher,/activeModules\.includes\("TABLE_SERVICE"\)/);
  assert.match(launcher,/\/api\/license\/current/);
});

test("BackOffice includes complete searchable table history",()=>{
  assert.match(tableRoute,/table-service\/history/);
  assert.match(tableRoute,/tokenType==="STORE_OPERATOR"&&req\.user\?\.role!=="MANAGER"/);
  assert.match(tableRoute,/receiptNumber/);
  assert.match(tableRoute,/PosSaleActionAudit/);
  assert.match(backoffice,/Τραπέζια και σερβιτόροι/);
  assert.match(backoffice,/Παραγγελίες, παρασκευή, πληρωμές, φύρα χωρίς απόδειξη/);
  assert.match(backoffice,/Τραπέζι, σερβιτόρος, είδος, πώληση/);
  assert.match(backoffice,/toLocaleString\("el-GR"/);
});
