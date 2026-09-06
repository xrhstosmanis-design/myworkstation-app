import test from "node:test";
import assert from "node:assert/strict";
import {effectiveModuleEnabled,isCurrentlyActive,isPlatformSuperAdmin,moduleKeyForPath,userMayAccessModule} from "../src/middleware/module-access.js";

test("maps operational routes to licensed modules",()=>{
  assert.equal(moduleKeyForPath("/dashboard"),"CORE");
  assert.equal(moduleKeyForPath("/stores"),"CORE");
  assert.equal(moduleKeyForPath("/employees"),"PERSONNEL");
  assert.equal(moduleKeyForPath("/employees/123"),"PERSONNEL");
  assert.equal(moduleKeyForPath("/shifts"),"SHIFTS");
  assert.equal(moduleKeyForPath("/schedules/generate"),"SHIFTS");
  assert.equal(moduleKeyForPath("/leaves"),"LEAVES");
  assert.equal(moduleKeyForPath("/availability"),"LEAVES");
});

test("honors module start and end dates",()=>{
  const now=new Date("2026-08-06T12:00:00Z");
  assert.equal(isCurrentlyActive({active:true,startsAt:null,endsAt:null},now),true);
  assert.equal(isCurrentlyActive({active:false,startsAt:null,endsAt:null},now),false);
  assert.equal(isCurrentlyActive({active:true,startsAt:"2026-08-07T00:00:00Z",endsAt:null},now),false);
  assert.equal(isCurrentlyActive({active:true,startsAt:null,endsAt:"2026-08-05T00:00:00Z"},now),false);
  assert.equal(isCurrentlyActive({active:true,startsAt:"2026-08-01T00:00:00Z",endsAt:"2026-08-10T00:00:00Z"},now),true);
});

test("Super Admin always has every module",()=>{
  for(const user of [{role:"SUPER_ADMIN"},{platformRole:"SUPER_ADMIN"},{isSuperAdmin:true}]){
    assert.equal(isPlatformSuperAdmin(user),true);
    assert.equal(userMayAccessModule(user,"PROFITABILITY"),true);
    assert.equal(userMayAccessModule(user,"AI_OWNER_ASSISTANT"),true);
  }
});

test("employee financial and evaluation access is denied by default but may be explicitly granted",()=>{
  assert.equal(userMayAccessModule({role:"EMPLOYEE"},"CORE"),true);
  assert.equal(userMayAccessModule({role:"EMPLOYEE"},"PROFITABILITY"),false);
  assert.equal(userMayAccessModule({role:"EMPLOYEE",permissions:["MODULE:PROFITABILITY"]},"PROFITABILITY"),true);
  assert.equal(userMayAccessModule({tokenType:"STORE_OPERATOR",role:"EMPLOYEE"},"CASHIER_PERFORMANCE"),false);
  assert.equal(userMayAccessModule({role:"OWNER"},"PROFITABILITY"),true);
});

test("store module configuration overrides company entitlement only when configured",()=>{
  const nowActive={configured:true,active:true,startsAt:null,endsAt:null};
  const disabled={configured:true,active:false,startsAt:null,endsAt:null};
  assert.equal(effectiveModuleEnabled(true,{configured:false}),true);
  assert.equal(effectiveModuleEnabled(false,{configured:false}),false);
  assert.equal(effectiveModuleEnabled(false,nowActive),true);
  assert.equal(effectiveModuleEnabled(true,disabled),false);
});
