import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";
import {
  WORKFORCE_RULE_DEFINITIONS,
  WORKFORCE_RULE_SEVERITIES,
  WORKFORCE_SHIFT_CATEGORIES,
  normalizeWorkforceRuleValue,
  workforceShiftCode
} from "../src/workforce-v2-rules.js";

const read=path=>fs.readFileSync(new URL(path,import.meta.url),"utf8");

const expectedRules=[
  "NO_WEEKEND","ONLY_MORNING","ONLY_AFTERNOON","ONLY_NIGHT","NO_MORNING_AFTER_NIGHT","MIN_DAYS_OFF",
  "INCOMPATIBLE_EMPLOYEE","NEVER_ALONE","CAN_COVER_OTHER_STORE","CANNOT_CHANGE_STORE",
  "DOUBLE_SHIFT_REQUIRES_APPROVAL","MAX_HOURS_PER_WEEK"
];

const expectedShiftCategories=["MORNING","AFTERNOON","NIGHT","INTERMEDIATE","DELIVERY","PRODUCTION","CASHIER","CUSTOM"];

test("Workforce v2 exposes the agreed employee rule catalog",()=>{
  assert.deepEqual(WORKFORCE_RULE_DEFINITIONS.map(item=>item.type),expectedRules);
  assert.deepEqual(WORKFORCE_RULE_SEVERITIES,["WARNING","ERROR","APPROVAL_REQUIRED"]);
  assert.equal(WORKFORCE_RULE_DEFINITIONS.find(item=>item.type==="INCOMPATIBLE_EMPLOYEE")?.valueKind,"RELATED_EMPLOYEE");
  assert.equal(WORKFORCE_RULE_DEFINITIONS.find(item=>item.type==="DOUBLE_SHIFT_REQUIRES_APPROVAL")?.defaultSeverity,"APPROVAL_REQUIRED");
});

test("Workforce rule values and Greek shift codes are deterministic",()=>{
  assert.deepEqual(normalizeWorkforceRuleValue("MIN_DAYS_OFF",{days:"2"}),{days:2});
  assert.deepEqual(normalizeWorkforceRuleValue("MAX_HOURS_PER_WEEK",{hours:"47.5"}),{hours:47.5});
  assert.deepEqual(normalizeWorkforceRuleValue("NEVER_ALONE",{ignored:true}),{});
  assert.equal(workforceShiftCode("Βράδυ ΚΑΤ"),"VRADY_KAT");
});

test("Workforce v2 shift categories keep the requested operational templates",()=>{
  assert.deepEqual(WORKFORCE_SHIFT_CATEGORIES.map(item=>item.code),expectedShiftCategories);
  assert.deepEqual(
    WORKFORCE_SHIFT_CATEGORIES.filter(item=>["MORNING","AFTERNOON","NIGHT"].includes(item.code)).map(item=>[item.code,item.defaultStartTime,item.defaultEndTime]),
    [["MORNING","07:00","15:00"],["AFTERNOON","15:00","23:00"],["NIGHT","23:00","07:00"]]
  );
});

test("rules are PRO-gated while shift templates remain inside BASIC Workforce access",()=>{
  const rules=read("../src/routes/platform-workforce-v2-rules.js");
  const shifts=read("../src/routes/platform-workforce-v2-shift-templates.js");
  const access=read("../src/routes/workforce-v2-access.js");
  const validation=read("../src/routes/workforce-v2-validation.js");

  assert.match(rules,/requirePersonnelPackage\(req,context\.store\.id,PERSONNEL_PRO\)/);
  assert.match(rules,/WORKFORCE_RULE_CREATED/);
  assert.match(rules,/WORKFORCE_RULE_UPDATED/);
  assert.match(rules,/WORKFORCE_RULE_DEACTIVATED/);
  assert.match(rules,/WORKFORCE_RULE_DUPLICATE/);
  assert.match(shifts,/companyId:context\.company\.id,storeId:context\.store\.id/);
  assert.match(shifts,/WORKFORCE_SHIFT_TEMPLATE_CREATED/);
  assert.match(shifts,/WORKFORCE_SHIFT_TEMPLATE_UPDATED/);
  assert.match(shifts,/activeAssignments/);
  assert.match(access,/requirePersonnelPackage\(req,storeId,PERSONNEL_BASIC\)/);
  assert.match(validation,/const confirmed=z\.literal\(true\)/);
  assert.match(validation,/workforceRuleSchema/);
  assert.match(validation,/workforceShiftTemplateSchema/);
});

test("Workforce bootstrap and UI mount rules and shift templates without enabling migration apply",()=>{
  const route=read("../src/routes/platform-workforce-v2.js");
  const panel=read("../../client/src/components/platform/WorkforceV2EmployeesPanel.jsx");
  const preview=read("../../client/src/components/platform/WorkforceV2ActionPreview.jsx");
  const manager=read("../../client/src/components/platform/useWorkforceV2Manager.js");

  assert.match(route,/router\.use\("\/rules",ruleRoutes\)/);
  assert.match(route,/router\.use\("\/shift-templates",shiftTemplateRoutes\)/);
  assert.match(route,/rulesManagement/);
  assert.match(route,/shiftTemplateManagement:true/);
  assert.match(route,/migrationApply:false/);
  assert.match(route,/applyAvailable:false/);
  assert.match(panel,/Κανόνες/);
  assert.match(panel,/Πρότυπα βαρδιών/);
  assert.match(preview,/pending\?\.type==="rule"/);
  assert.match(preview,/pending\?\.type==="shiftTemplate"/);
  assert.match(manager,/confirmed:true/);
  assert.doesNotMatch(route,/router\.(?:post|put|patch)\("\/migration\/apply/);
  assert.doesNotMatch(`${panel}\n${preview}\n${manager}`,/request\([^\n]*migration\/apply/);
});

test("new Workforce server modules pass Node syntax check",()=>{
  for(const relative of [
    "../src/workforce-v2-rules.js",
    "../src/routes/platform-workforce-v2-rules.js",
    "../src/routes/platform-workforce-v2-shift-templates.js",
    "../src/routes/platform-workforce-v2.js",
    "../src/routes/workforce-v2-access.js",
    "../src/routes/workforce-v2-validation.js"
  ]){
    const path=fileURLToPath(new URL(relative,import.meta.url));
    const result=spawnSync(process.execPath,["--check",path],{encoding:"utf8"});
    assert.equal(result.status,0,`${relative}: ${result.stderr}`);
  }
});
