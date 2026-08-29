import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const pos=fs.readFileSync(new URL("../../client/src/components/commerce/CommercialPosApp.jsx",import.meta.url),"utf8");
const operatorPos=fs.readFileSync(new URL("../../client/src/components/store/StorePosPanel.jsx",import.meta.url),"utf8");
const panel=fs.readFileSync(new URL("../../client/src/components/commerce/NetlinkPosPanel.jsx",import.meta.url),"utf8");
const index=fs.readFileSync(new URL("../src/index.js",import.meta.url),"utf8");

test("POS exposes a dedicated Netlink catalogue",()=>{
  assert.match(pos,/NetlinkPosPanel/);
  assert.match(pos,/>NETLINK</);
  assert.match(pos,/netlinkAvailable&&<button/);
  assert.match(operatorPos,/api\("\/api\/netlink\/status"\)/);
  assert.match(operatorPos,/netlinkAvailable&&<button className="store-pos-netlink"/);
  assert.match(operatorPos,/netlinkPanel&&netlinkAvailable&&<NetlinkPosPanel/);
  assert.match(panel,/\/api\/netlink\/status/);
  assert.match(panel,/\/api\/netlink\/menu/);
  assert.match(panel,/stores\/\$\{encodeURIComponent\(storeId\)\}\/config/);
});

test("POS staging execution keeps explicit confirmation and server gates",()=>{
  assert.match(panel,/\/api\/netlink\/prepare/);
  assert.match(panel,/\/api\/netlink\/execute/);
  assert.match(panel,/selected\.flow\|\|""/);
  assert.match(panel,/toLowerCase\(\)==="prepare"/);
  assert.match(panel,/numericRequestId/);
  assert.match(panel,/Date\.now\(\)/);
  assert.doesNotMatch(panel,/randomUUID/);
  assert.match(panel,/STAGING \$\{selected\.productId\}/);
  assert.match(panel,/testRun:true/);
  assert.match(panel,/ΕΚΤΕΛΕΣΗ ΚΛΕΙΔΩΜΕΝΗ/);
  assert.match(index,/"\/api\/netlink",auth,requireCompanyModule\("NETLINK_PREPAID"\),netlinkRoutes/);
});

test("Netlink execute route isolates staging from production receipt flow",()=>{
  const route=fs.readFileSync(new URL("../src/routes/netlink.js",import.meta.url),"utf8");
  assert.match(route,/NETLINK_TEST_RUN_REQUIRED/);
  assert.match(route,/NETLINK_STAGING_CONFIRMATION_REQUIRED/);
  assert.match(route,/NETLINK_POS_SALE_REQUIRED/);
  assert.match(route,/TEST_EXECUTE_DIRECT/);
  assert.match(route,/!testMode&&!validFiscalReceipt/);
});
