import test from "node:test";
import assert from "node:assert/strict";
import {moduleCatalog,moduleKeys,ownerRestrictedModuleKeys,planDefaults,catalogView} from "../src/services/module-catalog.js";

test("module catalog has unique keys and required core",()=>{
  assert.equal(new Set(moduleKeys).size,moduleKeys.length);
  assert.ok(moduleKeys.includes("CORE"));
  assert.ok(moduleKeys.includes("CONNECTOR_RBS"));
});

test("commercial plan defaults always include CORE",()=>{
  for(const [plan,modules] of Object.entries(planDefaults)){
    assert.ok(modules.includes("CORE"),`${plan} must include CORE`);
    for(const key of modules)assert.ok(moduleKeys.includes(key),`${plan} contains unknown module ${key}`);
  }
});

test("RBS connector is locked until technical activation",()=>{
  const connector=moduleCatalog.find(module=>module.key==="CONNECTOR_RBS");
  assert.equal(connector.commercialReady,false);
  assert.equal(connector.requiresTechnicalActivation,true);
});

test("catalog view merges customer entitlements",()=>{
  const view=catalogView([{moduleKey:"CORE",active:true,startsAt:null,endsAt:null,notes:"test"}]);
  assert.equal(view.find(module=>module.key==="CORE").active,true);
  assert.equal(view.find(module=>module.key==="SHIFTS").active,false);
});

test("new owner modules are registered but cannot be sold before implementation",()=>{
  const expected=["OFFERS_ADVANCED","INVOICE_CHANNEL","CASHIER_PERFORMANCE","PROFITABILITY","SUPPLIER_COMPARISON","ORDER_SUGGESTIONS","LOW_VALUE_PRODUCTS","OWNER_MONTHLY_REPORT","SMART_AUDIT"];
  for(const key of expected){
    const module=moduleCatalog.find(row=>row.key===key);
    assert.ok(module,`${key} must be registered`);
    assert.equal(module.commercialReady,false,`${key} must stay commercially locked until implemented`);
  }
  for(const key of ["PROFITABILITY","CASHIER_PERFORMANCE","LOSS_DETECTION","AI_OWNER_ASSISTANT"]){
    assert.ok(ownerRestrictedModuleKeys.includes(key),`${key} must be owner restricted`);
  }
  const lossDetection=moduleCatalog.find(row=>row.key==="LOSS_DETECTION");
  assert.equal(lossDetection.commercialReady,true);
  assert.equal(lossDetection.monthlyPriceEur,29.9);
  const pendingCenter=moduleCatalog.find(row=>row.key==="PENDING_CENTER");
  assert.equal(pendingCenter.commercialReady,true);
  assert.ok(ownerRestrictedModuleKeys.includes("PENDING_CENTER"));
});

test("implemented Owner cash assistant remains opt-in and owner restricted; availability never grants entitlement",()=>{
  const assistant=catalogView([]).find(row=>row.key==="AI_OWNER_ASSISTANT");
  assert.equal(assistant.commercialReady,true);
  assert.equal(assistant.active,false);
  assert.equal(assistant.ownerOnly,true);
  assert.ok(ownerRestrictedModuleKeys.includes(assistant.key));
  for(const defaults of Object.values(planDefaults))assert.equal(defaults.includes(assistant.key),false);
});
