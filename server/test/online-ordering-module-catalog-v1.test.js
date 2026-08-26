import test from "node:test";
import assert from "node:assert/strict";
import {moduleCatalog,planDefaults} from "../src/services/module-catalog.js";

test("Online Ordering is an explicit optional commercial module",()=>{
  const module=moduleCatalog.find(row=>row.key==="ONLINE_ORDERING");
  assert.ok(module);
  assert.equal(module.commercialReady,true);
  assert.equal(module.requiresTechnicalActivation,undefined);
  assert.match(module.description,/ανά πελάτη και κατάστημα/);
});

test("Online Ordering is never silently enabled by a commercial plan",()=>{
  for(const [plan,modules] of Object.entries(planDefaults)){
    assert.equal(modules.includes("ONLINE_ORDERING"),false,`${plan} must require explicit Super Admin activation`);
  }
});
