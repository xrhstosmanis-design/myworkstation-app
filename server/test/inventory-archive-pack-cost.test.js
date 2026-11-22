import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const route=fs.readFileSync(new URL("../src/routes/inventory-archive.js",import.meta.url),"utf8");

test("archive prices corrected package purchases by stocked piece in latest and average cost",()=>{
  assert.match(route,/sm\."movementType"='PURCHASE_PACK_CORRECTION'/);
  assert.match(route,/sm\."sourceId"=d\."id"/);
  assert.match(route,/l\."netAmount"\/\(l\."quantity"\*CASE WHEN l\."unit"='PACKAGE' THEN l\."unitsPerPackage"/);
  assert.match(route,/SUM\(pl\."quantity"\*CASE WHEN pl\."invoiceUnit"='PACKAGE' THEN pl\."stockUnitsPerInvoiceUnit"/);
  assert.match(route,/\$\{purchaseUnitCost\} AS "unitCost"/);
  assert.match(route,/AVG\(NULLIF\(\$\{purchaseUnitCost\},0\)\)/);
});

test("KM3621 margin and markup use net retail and round-trip to gross retail",()=>{
  const panel=fs.readFileSync(new URL("../../client/src/components/commerce/InventoryArchivePanel.jsx",import.meta.url),"utf8");
  const helpers=panel.slice(panel.indexOf("const vatFactor="),panel.indexOf("const recalculateCardMetrics="));
  const {priceMetrics,retailFromMargin,retailFromMarkup}=vm.runInNewContext(
    helpers+"\n({priceMetrics,retailFromMargin,retailFromMarkup})"
  );
  const cost=17.30/12;
  const {margin,markup}=priceMetrics(cost,2.70,13);
  assert.equal(margin.toFixed(2),"39.66");
  assert.equal(markup.toFixed(2),"65.74");
  assert.equal(retailFromMargin(cost,margin,13).toFixed(2),"2.70");
  assert.equal(retailFromMarkup(cost,markup,13).toFixed(2),"2.70");
  assert.equal(priceMetrics(1,2,0).margin,50);
});
