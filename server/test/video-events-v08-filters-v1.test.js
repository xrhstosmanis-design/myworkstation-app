import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const route=await readFile(new URL("../src/routes/kiosk-reports-audit.js",import.meta.url),"utf8");
const ui=await readFile(new URL("../../client/src/components/commerce/installKioskReportsAuditV2.js",import.meta.url),"utf8");

test("V08 supports date time operator POS event and amount filters",()=>{
  for(const filter of ["timeFrom","timeTo","operatorId","terminalPos","eventType","amountMin","amountMax"])assert.match(route,new RegExp(filter));
  assert.match(route,/timeZone:"Europe\/Athens"/);
  assert.match(route,/row\.actorId===operatorId/);
  assert.match(route,/row\.terminalPos===terminalPos/);
  assert.match(route,/row\.eventType===eventType/);
});

test("V08 exposes all filters in Events Audit including exact hour",()=>{
  assert.match(ui,/Ώρα από/);
  assert.match(ui,/Ώρα έως/);
  assert.match(ui,/Χειριστής \/ ID/);
  assert.match(ui,/Ποσό από/);
  assert.match(ui,/data-video-filter/);
});
