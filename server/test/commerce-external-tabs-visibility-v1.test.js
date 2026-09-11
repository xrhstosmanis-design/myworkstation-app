import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const root=new URL("../../client/src/components/commerce/",import.meta.url);
const hub=fs.readFileSync(new URL("CommerceHub.jsx",root),"utf8");
const css=fs.readFileSync(new URL("commerce-external-tabs.css",root),"utf8");
const installers=[
  "installPurchaseOrdersSuite.js",
  "installPriceCatalogSuite.js",
  "installSupplierControlSuite.js",
  "installCustomerControlSuite.js",
  "installCustomerControlSuiteV2.js",
  "installKioskReportsSuite.js",
];

test("external commerce tabs hide the module cards",()=>{
  assert.match(hub,/import "\.\/commerce-external-tabs\.css"/);
  assert.match(css,/\.commerce-hub\.commerce-external-tab-active\s*>\s*\.commerce-status-grid/);
  assert.match(css,/display:\s*none\s*!important/);

  for(const filename of installers){
    const source=fs.readFileSync(new URL(filename,root),"utf8");
    assert.match(source,/hub\.classList\.toggle\("commerce-external-tab-active",hide\)/,filename);
  }
});
