import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const read=path=>readFile(new URL(path,import.meta.url),"utf8");

test("POS barcode registration is tenant and store scoped with duplicate protection",async()=>{
  const source=await read("../src/routes/store-pos-catalog.js");
  assert.match(source,/barcode-registration/);
  assert.match(source,/p\."companyId"=\$\{req\.user\.companyId\}/);
  assert.match(source,/sp\."storeId"=\$\{store\.id\}/);
  assert.match(source,/υπάρχει ήδη στο προϊόν/);
  assert.match(source,/ProductBarcodePriceRequest/);
});

test("barcode price stays on one product stock and the sale line records the scanned barcode",async()=>{
  const [route,compat]=await Promise.all([read("../src/routes/store-pos.js"),read("../src/commerce-compatibility.js")]);
  assert.match(route,/applyBarcodePrices/);
  assert.match(route,/match\.productId!==item\.productId/);
  assert.match(route,/"scannedBarcode"/);
  assert.match(route,/reserveSharedStock\(tx,\{companyId:req\.user\.companyId,storeId:store\.id,productId:item\.productId/);
  assert.match(compat,/SaleLine_scannedBarcode_idx/);
});

test("POS exposes the barcode tool and an internal radio player",async()=>{
  const [pos,barcode,radio,chatCss]=await Promise.all([read("../../client/src/components/store/StorePosPanel.jsx"),read("../../client/src/components/store/PosBarcodeRegistrationModal.jsx"),read("../../client/src/components/store/PosOnlineRadioPlayer.jsx"),read("../../client/src/components/store/store-chat.css")]);
  assert.match(pos,/Έλεγχος και καταχώρηση νέου Barcode/);
  assert.match(barcode,/ΧΩΡΙΣ BARCODE/);
  assert.match(pos,/Online Ράδιο/);
  assert.match(radio,/<audio/);
  assert.doesNotMatch(radio,/window\.open|youtube|iframe/i);
  assert.match(chatCss,/\.store-chat-top-host\{display:flex;flex-flow:row nowrap/);
  assert.match(chatCss,/\.store-chat-top-button\{flex:0 0 auto;white-space:nowrap/);
});

test("online radio is paid-module gated and persists terminal-specific state",async()=>{
  const [route,compat,catalog,platform]=await Promise.all([read("../src/routes/store-pos-catalog.js"),read("../src/commerce-compatibility.js"),read("../src/services/module-catalog.js"),read("../src/routes/platform-store-modules.js")]);
  assert.match(route,/moduleKey"='ONLINE_RADIO'/);
  assert.match(route,/allowedStationIds/);
  assert.match(route,/terminalPos/);
  assert.match(compat,/PosOnlineRadioState/);
  assert.match(compat,/PRIMARY KEY\("companyId","storeId","terminalPos"\)/);
  assert.match(catalog,/key:"ONLINE_RADIO"/);
  assert.match(platform,/online-radio\/stations/);
  assert.match(platform,/STORE_ONLINE_RADIO_/);
});

test("barcode price requests are reviewed once and approved against the same barcode",async()=>{
  const source=await read("../src/routes/store-pos-catalog.js");
  assert.match(source,/barcode-price-requests/);
  assert.match(source,/FOR UPDATE/);
  assert.match(source,/row\.status!=="PENDING"/);
  assert.match(source,/WHERE "id"=\$\{row\.barcodeId\} AND "productId"=\$\{row\.productId\}/);
  assert.match(source,/POS_BARCODE_PRICE_/);
});

test("barcode sales report returns product totals and barcode breakdown",async()=>{
  const source=await read("../src/routes/store-pos-catalog.js");
  assert.match(source,/barcode-sales-report/);
  assert.match(source,/COALESCE\(sl\."scannedBarcode",'ΧΩΡΙΣ BARCODE'\)/);
  assert.match(source,/product\.barcodes\.push\(detail\)/);
  assert.match(source,/s\."companyId"=\$\{req\.user\.companyId\}/);
  assert.match(source,/s\."storeId"=\$\{store\.id\}/);
});

test("BackOffice exposes barcode approvals, report and paid radio configuration",async()=>{
  const [page,panel,route]=await Promise.all([read("../../client/src/components/cloud/StoreCloudPage.jsx"),read("../../client/src/components/cloud/BarcodeRadioManagement.jsx"),read("../src/routes/store-pos-catalog.js")]);
  assert.match(page,/BarcodeRadioManagement/);
  assert.match(panel,/barcode-price-requests/);
  assert.match(panel,/barcode-sales-report/);
  assert.match(panel,/online-radio\/config/);
  assert.match(route,/availableStations=req\.user\?\.tokenType!=="STORE_OPERATOR"&&moduleActive/);
});

test("Super Admin has a central radio station and store activation screen",async()=>{
  const [app,center]=await Promise.all([read("../../client/src/components/platform/PlatformAdminApp.jsx"),read("../../client/src/components/platform/SuperAdminOnlineRadioCenter.jsx")]);
  assert.match(app,/Online Ράδιο · Διαχείριση/);
  assert.match(app,/SuperAdminOnlineRadioCenter/);
  assert.match(center,/online-radio\/stations/);
  assert.match(center,/moduleKey:"ONLINE_RADIO"/);
  assert.match(center,/allowedStationIds/);
  assert.match(center,/Πληρωμένο module ενεργό/);
});
