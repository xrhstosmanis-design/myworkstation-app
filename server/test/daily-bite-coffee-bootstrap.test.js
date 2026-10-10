import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const source=fs.readFileSync(new URL("../src/daily-bite-coffee-bootstrap.js",import.meta.url),"utf8");
test("DAILY BITE coffee one-shot patch is exact, idempotent and excludes recipe stock copying",()=>{
 assert.match(source,/DAILY_COMPANY_ID="cmv25lf0w000seegf1cn4bbmx"/);
 assert.match(source,/DataPatchMarker/);
 assert.match(source,/DB000002","MWS-KAT-BEV-FREDDO-ESP/);
 assert.match(source,/DB000005","MWS-KAT-BEV-FREDDO-CAP/);
 assert.match(source,/PreparationProductModifierGroup/);
 assert.match(source,/PreparationProductSettings/);
 assert.doesNotMatch(source,/PreparationRecipeLine/);
 assert.doesNotMatch(source,/PreparationModifierConsumption/);
 assert.doesNotMatch(source,/StoreProduct".*"currentStock/);
});
