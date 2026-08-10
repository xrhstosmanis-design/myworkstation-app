import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {spawnSync} from "node:child_process";

const themePath=new URL("../../client/src/theme-normalization-bootstrap.js",import.meta.url);
const cssPath=new URL("../../client/src/components/commerce/myworkstation-global-theme-normalization.css",import.meta.url);
const htmlPath=new URL("../../client/index.html",import.meta.url);
const theme=fs.readFileSync(themePath,"utf8");
const css=fs.readFileSync(cssPath,"utf8");
const html=fs.readFileSync(htmlPath,"utf8");

test("theme normalization bootstrap parses",()=>{
  const r=spawnSync(process.execPath,["--check",themePath.pathname],{encoding:"utf8"});
  assert.equal(r.status,0,r.stderr||r.stdout);
});

test("canonical MyWorkStation navy and teal are the structural palette",()=>{
  assert.match(css,/--mws-navy:#123b5d/);
  assert.match(css,/--mws-teal:#0f766e/);
  assert.match(css,/--mws-bg:#f3f7fb/);
});

test("known Kiosk-orange structural navigation is overridden",()=>{
  for(const selector of [
    ".sc-tabs button.active",".sc-edit-tabs button.active",
    ".cc-tabs button.active",".cc-detail-tabs button.active",
    ".po-tabs button.active",".kr-tabs button.active",
    ".sgr-table .row.selected",".kiosk-tr.selected-row"
  ])assert.ok(css.includes(selector),selector);
  for(const kioskOrange of ["#ffc76d","#ffc86f","#ffc978","#ffcf87","#ffd187","#ffd18c","#ef9b20","#efb04f"])
    assert.doesNotMatch(css,new RegExp(kioskOrange,"i"));
});

test("bright Kiosk structural headers are normalized across core Commerce suites",()=>{
  for(const selector of [
    ".sc-table .row.head",".cc-table .row.head",".po-orders-table .row.head",
    ".kr-head",".sgr-table .row.head",".spc-table .row.head",".spt-table .row.head",
    ".owner-payments-table .row.head",".osc-row.head",".pcv2-table .row.head",".kiosk-tr.head"
  ])assert.ok(css.includes(selector),selector);
});

test("primary commercial actions are teal and semantic warning classes are not globally overwritten",()=>{
  assert.match(css,/\.sc-form button\.primary/);
  assert.match(css,/\.cc-form button\.primary/);
  assert.match(css,/\.owner-payments-search/);
  assert.match(css,/\.osc-search/);
  assert.match(css,/background:var\(--mws-teal\)!important/);
  assert.doesNotMatch(css,/\.warn\s*\{/);
  assert.doesNotMatch(css,/\.negative\s*\{/);
  assert.doesNotMatch(css,/\.danger\s*\{/);
});

test("theme normalization is loaded after every report bootstrap",()=>{
  const themeIndex=html.indexOf("theme-normalization-bootstrap.js");
  assert.ok(themeIndex>0);
  for(const script of ["entry.jsx","report-audit-bootstrap.js","report-stock-bootstrap.js","report-sales-bootstrap.js","report-delivery-bootstrap.js"])
    assert.ok(html.indexOf(script)>=0&&html.indexOf(script)<themeIndex,script);
  assert.match(theme,/myworkstation-global-theme-normalization\.css/);
});
