import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {execFileSync} from "node:child_process";

const server=fs.readFileSync(new URL("../src/routes/kiosk-reports-delivery-v5.js",import.meta.url),"utf8");
const index=fs.readFileSync(new URL("../src/index.js",import.meta.url),"utf8");
const client=fs.readFileSync(new URL("../../client/src/components/commerce/installKioskReportsDeliveryV5.js",import.meta.url),"utf8");
const html=fs.readFileSync(new URL("../../client/index.html",import.meta.url),"utf8");

test("delivery report server and client parse",()=>{
  execFileSync(process.execPath,["--check",new URL("../src/routes/kiosk-reports-delivery-v5.js",import.meta.url).pathname]);
  execFileSync(process.execPath,["--check",new URL("../../client/src/components/commerce/installKioskReportsDeliveryV5.js",import.meta.url).pathname]);
});

test("delivery report uses real DispatchNote ledgers and tenant/store scope",()=>{
  assert.match(server,/DispatchNote/);
  assert.match(server,/DispatchNoteLine/);
  assert.match(server,/req\.user\.companyId/);
  assert.match(server,/storeId/);
  assert.match(server,/recipientName/);
  assert.match(server,/recipientTaxId/);
  assert.match(server,/destinationAddress/);
});

test("delivery report never invents fiscal transmission",()=>{
  assert.match(server,/fiscalTransmission:false/);
  assert.match(server,/φορολογική διαβίβαση παραμένει μη διαθέσιμη/);
  assert.doesNotMatch(server,/providerMark:/);
});

test("delivery UI intercepts the real tab and lazy loads line detail",()=>{
  assert.match(client,/dataset\.krTab==="delivery"/);
  assert.match(client,/data-delivery-note/);
  assert.match(client,/\/api\/reports\/delivery/);
  assert.match(client,/\/lines/);
  assert.match(client,/Excel|CSV|exportCsv/);
  assert.doesNotMatch(client,/MutationObserver/);
});

test("delivery route is mounted before generic reports and bootstrap is loaded",()=>{
  const specific=index.indexOf("kioskReportsDeliveryV5Routes"),generic=index.indexOf("kioskReportsRoutes");
  assert.ok(specific>=0&&generic>specific);
  assert.match(html,/report-delivery-bootstrap\.js/);
});
