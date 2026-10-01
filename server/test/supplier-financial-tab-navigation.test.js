import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import vm from "node:vm";
const suite=await readFile(new URL("../../client/src/components/commerce/installSupplierControlSuite.js",import.meta.url),"utf8");
const reports=await readFile(new URL("../../client/src/components/commerce/installSupplierGlobalReports.js",import.meta.url),"utf8");
test("initial supplier catalog exposes financial reports without visiting invoices first",()=>{
 const header=suite.match(/function header\(\)\{[^\n]+/)[0];
 const html=vm.runInNewContext(header+";header()",{state:{tab:"catalog"}});
 const ids=Array.from(html.matchAll(/data-sc-tab="([^"]+)"/g),m=>m[1]);
 assert.deepEqual(ids,["catalog","balances","invoices","payments","purchases","sales"]);
 assert.match(html,/data-sc-tab="balances"[^>]*>€ Ποσά \/ Πιστωτικά/);
});
test("initial financial tab uses existing read-only report interceptor",()=>{
 const intercept=reports.match(/function intercept\(event\)\{[^\n]+/)[0];
 const root={innerHTML:""},state={},stops=[];
 const button={dataset:{scTab:"balances"},closest:()=>root};
 const context={state,monthStart:()=>"2026-10-01",today:()=>"2026-10-01",tabs:()=>"report tabs",load:r=>{assert.equal(r,root);stops.push("load")}};
 const event={target:{closest:()=>button},preventDefault:()=>stops.push("prevent"),stopImmediatePropagation:()=>stops.push("immediate"),stopPropagation:()=>stops.push("stop")};
 vm.runInNewContext(intercept+";intercept(event)",{...context,event});
 assert.equal(state.tab,"balances");assert.equal(state.supplierId,"");assert.equal(state.q,"");
 assert.deepEqual(stops,["prevent","immediate","stop","load"]);
 assert.match(root.innerHTML,/sgr-loading/);
});
