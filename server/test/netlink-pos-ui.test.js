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

test("POS preview does not execute or weaken Netlink gates",()=>{
  assert.doesNotMatch(panel,/\/api\/netlink\/execute/);
  assert.match(panel,/ΕΚΤΕΛΕΣΗ ΚΛΕΙΔΩΜΕΝΗ/);
  assert.match(index,/"\/api\/netlink",auth,requireCompanyModule\("NETLINK_PREPAID"\),netlinkRoutes/);
});

test("Netlink transaction history and cancellation request stay inside the POS panel",()=>{
  assert.match(panel,/Αναφορές/);
  assert.match(panel,/Αναλυτική ημερήσια/);
  assert.match(panel,/Συνοπτική ημερήσια/);
  assert.match(panel,/Εβδομαδιαία εκκαθάριση/);
  assert.match(panel,/\/api\/netlink\/reports\/daily/);
  assert.match(panel,/\/api\/netlink\/cancellation-requests/);
  assert.match(panel,/Αίτημα/);
});
