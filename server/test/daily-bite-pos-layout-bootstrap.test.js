import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source=fs.readFileSync(new URL("../src/daily-bite-pos-layout-bootstrap.js",import.meta.url),"utf8");

test("DAILY BITE POS layout bootstrap is store scoped, idempotent and uses MyWorkStation theme",()=>{
  assert.match(source,/cmv25lf0w000seegf1cn4bbmx/);
  assert.match(source,/cmv25lf3h000ueegf0kkii3pb/);
  assert.match(source,/DAILY_BITE_POS_LAYOUT_20261010_V1/);
  assert.match(source,/StorePosLayout/);
  assert.match(source,/ON CONFLICT \("storeId"\) DO NOTHING/);
  assert.match(source,/#033d2f/);
  assert.match(source,/#087a52/);
  assert.match(source,/ΚΑΦΕΣ ΚΡΥΑ/);
  assert.match(source,/ΚΑΦΕΣ ΖΕΣΤΑ/);
  assert.match(source,/DAILY_BITE_PRESET/);
});

test("DAILY BITE POS layout bootstrap never mutates catalog economics or KAT layout",()=>{
  assert.doesNotMatch(source,/UPDATE "Product"/);
  assert.doesNotMatch(source,/UPDATE "StoreProduct"/);
  assert.doesNotMatch(source,/StockMovement/);
  assert.doesNotMatch(source,/Payment/);
  assert.doesNotMatch(source,/Sale"/);
  assert.doesNotMatch(source,/kat-store/);
});
