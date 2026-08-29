import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source=fs.readFileSync(new URL("../src/routes/api.js",import.meta.url),"utf8");

test("staff scheduler separates continuous uppercase instructions by employee name",()=>{
  assert.match(source,/function writtenRuleSegments\(/);
  assert.match(source,/segments\.filter\(x=>x\.employee\.id===employee\.id\)/);
});

test("staff scheduler understands only named weekdays and excludes the other days",()=>{
  assert.match(source,/const allowedWeekdays=briefWeekdays/);
  assert.match(source,/!allowedWeekdays\.includes/);
  assert.match(source,/ΔΕΝ ΘΑ ΕΡΓΑΣΤ/);
});
