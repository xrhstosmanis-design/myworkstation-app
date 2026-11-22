import test from "node:test";
import assert from "node:assert/strict";
import {buildStaffStocktakeCsv} from "../../client/src/components/inventory/staff-stocktake-csv.mjs";
import {changeStaffCapability, staffProfiles, validStaffCapabilities} from "../../shared/backoffice-staff.mjs";

test("stocktake CSV is a separate opt-in grant and requires store inventory read", () => {
  assert.ok(!staffProfiles.MANAGER.capabilities.includes("inventory.export"));
  assert.equal(validStaffCapabilities(["inventory.export"]), false);
  assert.equal(validStaffCapabilities(["inventory.read", "inventory.export"]), true);
  assert.deepEqual(changeStaffCapability(["inventory.read", "inventory.export"], "inventory.read", false), []);
});

test("blind CSV exports scoped count rows without stock, costs or formulas", () => {
  const csv = buildStaffStocktakeCsv([{
    barcodes: ["001", "002"], sku: "+CODE", name: ' =HYPERLINK("x")',
    countedQuantity: "0", expectedQuantity: 927, unitCost: 314, salePrice: 991
  }], false);
  assert.equal(csv, '\uFEFF"Barcode";"SKU";"Περιγραφή";"Καταμέτρηση"\r\n"001 / 002";"\'+CODE";"\' =HYPERLINK(""x"")";0\r\n');
});

test("expected stock is available only by request, with uncounted variance left blank", () => {
  const csv = buildStaffStocktakeCsv([
    { sku: "A", countedQuantity: null, expectedQuantity: 4 },
    { sku: "B", countedQuantity: 0.3, expectedQuantity: 0.1 },
  ], true);
  assert.match(csv, /"Θεωρητικό απόθεμα";"Διαφορά"\r\n"";"A";"";;4;\r\n"";"B";"";0\.3;0\.1;0\.2\r\n$/);
});
