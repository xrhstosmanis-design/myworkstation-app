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

test("Netlink report end date includes the complete selected day",()=>{
  assert.match(route,/to\.setHours\(23,59,59,999\)/);
});
