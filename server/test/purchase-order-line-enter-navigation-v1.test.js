import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../../client/src/components/commerce/installPurchaseOrdersSuite.js", import.meta.url), "utf8");

test("Enter advances through editable purchase-order line fields", () => {
  assert.match(source, /function installLineEnterNavigation\(\)/);
  assert.match(source, /event\.key!=="Enter"/);
  assert.match(source, /closest\?\.\("form\.po-line-form,form\.po-entry-row"\)/);
  assert.match(source, /querySelectorAll\("input\[name\],select\[name\]"\)/);
  assert.match(source, /fields\[fields\.indexOf\(current\)\+1\]/);
  assert.match(source, /button\.primary\[type="submit"\]/);
  assert.match(source, /next\?\.focus\(\)/);
  assert.match(source, /current\.matches\?\.\("\[data-product-q\]"\)/);
  assert.match(source, /querySelector\("\[data-product-search\]"\)\?\.click\(\)/);
});

test("Enter navigation is installed once for both new and edit line forms", () => {
  assert.equal((source.match(/installLineEnterNavigation\(\);/g) || []).length, 1);
  assert.ok((source.match(/class="po-line-form/g) || []).length >= 2);
});

test("new-line entry stays open and resets for the next product", () => {
  assert.match(source, /form\.reset\(\);products=\[\];mode="NONE"/);
  assert.match(source, /search\.value="";search\.focus\(\)/);
  assert.match(source, /Η γραμμή καταχωρήθηκε\. Συνέχισε με το επόμενο είδος\./);
  assert.match(source, /parent\.remove\(\);await openOrder\(root,orderId\)/);
});

test("the current invoice lines remain visible and refresh after every entry", () => {
  assert.match(source, /function entryLinesGrid\(data\)/);
  assert.match(source, /data-entry-lines/);
  assert.match(source, /Γραμμές τιμολογίου/);
  assert.match(source, /await refreshEntryLines\(\);form\.reset\(\)/);
});

test("live invoice lines are fully editable in the large entry workspace", () => {
  assert.match(source, /workspace\.style\.width="min\(1850px,99vw\)"/);
  assert.match(source, /form class="row po-entry-row"/);
  for (const field of ["description", "gift", "quantity", "unitCost", "discount1", "discount2", "discount3", "exciseTotal", "vatRate", "markupPercent", "proposedSalePrice"]) {
    assert.match(source, new RegExp(`name="${field}"`));
  }
  assert.match(source, /method:"PATCH"/);
  assert.match(source, /data-entry-delete/);
  assert.match(source, /form\.po-line-form,form\.po-entry-row/);
});
