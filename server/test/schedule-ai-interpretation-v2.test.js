import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const api=fs.readFileSync(new URL("../src/routes/api.js",import.meta.url),"utf8");
const client=fs.readFileSync(new URL("../../client/src/main.jsx",import.meta.url),"utf8");

test("scheduler interprets natural-language rules with a strict structured response",()=>{
  assert.match(api,/router\.post\("\/schedules\/interpret"/);
  assert.match(api,/type:"json_schema",name:"staff_schedule_rules",strict:true/);
  assert.match(api,/interpretationSchema\.parse/);
});

test("interpretation uses active store personnel, official rules and approved leave",()=>{
  assert.match(api,/employees:\{where:\{active:true\},include:\{rules:true,leaveRequests:\{where:\{status:"APPROVED"\}\}\}\}/);
  assert.match(api,/approvedLeaves:/);
  assert.match(api,/Προσωπικό και Άδειες προσωπικού/);
  assert.match(api,/συγκρούεται με εγκεκριμένη άδεια/);
});

test("generation applies confirmed rules and preserves fixed custom hours",()=>{
  assert.match(api,/applyInterpretedRules\(store\.employees/);
  assert.match(api,/AI_FIXED_TIME:/);
  assert.match(client,/match\(\/\^AI_FIXED_TIME:/);
});

test("user previews and confirms the interpretation before generation",()=>{
  assert.match(client,/Ανάλυση οδηγιών/);
  assert.match(client,/Τι κατάλαβα/);
  assert.match(client,/rulesConfirmed/);
  assert.match(client,/Επιβεβαιώνω ότι οι παραπάνω κανόνες διαβάστηκαν σωστά/);
});
