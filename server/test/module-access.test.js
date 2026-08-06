import test from "node:test";
import assert from "node:assert/strict";
import {isCurrentlyActive,moduleKeyForPath} from "../src/middleware/module-access.js";

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
