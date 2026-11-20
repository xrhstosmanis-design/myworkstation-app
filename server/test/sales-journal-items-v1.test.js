import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";

const route=await readFile(new URL("../src/routes/store-pos-sale-display.js",import.meta.url),"utf8");
const client=await readFile(new URL("../../client/src/components/commerce/installSalesAnalysisSuite.js",import.meta.url),"utf8");

test("sales journal is tenant/store/date scoped and returns real lines and payments",()=>{
  assert.match(route,/router\.get\("\/sales\/journal"/);
  assert.match(route,/s\."companyId"=\$\{req\.user\.companyId\}/);
  assert.match(route,/\$\{storeId\}::text IS NULL/);
  assert.match(route,/s\."occurredAt">=\$\{from\}/);
  assert.match(route,/'description',l\."description"/);
  assert.match(route,/'quantity',l\."quantity"/);
  assert.match(route,/FROM "Payment" p WHERE p\."saleId"=s\."id"/);
  assert.match(route,/JOIN "Store" st/);
});

test("BackOffice sales journal shows item quantity payment total and state",()=>{
  assert.match(client,/Είδος \/ είδη/);
  assert.match(client,/Ποσότητα/);
  assert.match(client,/Πληρωμή/);
  assert.match(client,/lines\.map\(i=>/);
  assert.match(client,/payments\.map\(p=>/);
  assert.match(client,/\/api\/store-pos\/sales\/journal/);
});

test("owner sales tabs do not install inside the delegated workspace",async()=>{
  const {JSDOM}=await import("jsdom");
  const dom=new JSDOM('<div class="staff-backoffice"><div class="kiosk-sales"><main class="kiosk-main" id="staff"></main></div></div><div class="kiosk-sales"><main class="kiosk-main" id="owner"></main></div>');
  try{
    const selector=client.match(/const install=\(\)=>\{const main=document.querySelector\('([^']+)'\)/)?.[1];
    assert.ok(selector);
    assert.deepEqual([...dom.window.document.querySelectorAll(selector)].map(node=>node.id),["owner"]);
  }finally{
    dom.window.close();
  }
});
