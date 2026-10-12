import {z} from "zod";
import {greeceRangeDate} from "../../shared/greece-time.mjs";
import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const route=fs.readFileSync(new URL("../src/routes/netlink.js",import.meta.url),"utf8");
const compat=fs.readFileSync(new URL("../scripts/ensure-netlink-reports-compat.js",import.meta.url),"utf8");
const render=fs.readFileSync(new URL("../../render.yaml",import.meta.url),"utf8");

test("Netlink reports expose daily detail and weekly settlement without provider cancellation execution",()=>{
  assert.match(route,/router\.get\("\/reports\/daily"/);
  assert.match(route,/router\.get\("\/reports\/weekly-settlement"/);
  assert.match(route,/router\.get\("\/reports\/daily-summary"/);
  assert.match(route,/ensureCancellationRequestStorage/);
  assert.match(route,/AWAITING_NETLINK_STATEMENT/);
  assert.doesNotMatch(route,/netlinkClient\(\)\.cancel/);
});

test("Netlink cancellation requests stay operational and auditable",()=>{
  assert.match(route,/router\.post\("\/cancellation-requests"/);
  assert.match(route,/PENDING_NETLINK/);
  assert.match(route,/NETLINK_CANCELLATION_ALREADY_REQUESTED/);
  assert.match(compat,/CREATE TABLE IF NOT EXISTS "NetlinkCancellationRequest"/);
  assert.match(render,/ensure-netlink-reports-compat\.js/);
});

test("Netlink report end date includes the complete selected Greek day",()=>{
  const start=route.indexOf("const reportQuery="),definition=route.slice(start+"const reportQuery=".length,route.indexOf("\n",start)).replace(/;$/,"");
  const schema=new Function("z","greeceRangeDate","return "+definition)(z,greeceRangeDate);
  const range=schema.parse({from:"2026-10-12",to:"2026-10-12"});
  assert.equal(range.from.toISOString(),"2026-10-11T21:00:00.000Z");
  assert.equal(range.to.toISOString(),"2026-10-12T20:59:59.999Z");
  const spring=schema.parse({from:"2026-03-29",to:"2026-03-29"});
  assert.equal(spring.to-spring.from+1,23*3600000);
  const autumn=schema.parse({from:"2026-10-25",to:"2026-10-25"});
  assert.equal(autumn.to-autumn.from+1,25*3600000);
});
