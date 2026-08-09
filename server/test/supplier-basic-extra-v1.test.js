import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";

const route=await readFile(new URL("../src/routes/supplier-basic-extra.js",import.meta.url),"utf8");
const normalized=await readFile(new URL("../src/routes/supplier-control-normalized.js",import.meta.url),"utf8");
const client=await readFile(new URL("../../client/src/components/commerce/installSupplierBasicExtras.js",import.meta.url),"utf8");
const entry=await readFile(new URL("../../client/src/entry.jsx",import.meta.url),"utf8");

const check=file=>{const path=fileURLToPath(new URL(file,import.meta.url));const result=spawnSync(process.execPath,["--check",path],{encoding:"utf8"});assert.equal(result.status,0,`${file}\n${result.stderr||result.stdout}`)};

test("supplier basic-extra server and client modules parse",()=>{
  check("../src/routes/supplier-basic-extra.js");
  check("../../client/src/components/commerce/installSupplierBasicExtras.js");
});

test("supplier basic-extra persists DOU and MYF tenant-scoped",()=>{
  assert.match(route,/ADD COLUMN IF NOT EXISTS "taxOffice"/);
  assert.match(route,/ADD COLUMN IF NOT EXISTS "myfEnabled"/);
  assert.match(route,/"companyId"=\$\{req\.user\.companyId\}/);
  assert.match(route,/taxOffice:z\.string/);
  assert.match(route,/myfEnabled:z\.boolean/);
});

test("DOU and MYF are injected into the existing basic form and saved before original submit",()=>{
  assert.match(client,/form\[data-basic\]/);
  assert.match(client,/Δ\.Ο\.Υ\./);
  assert.match(client,/Υποβολή ΜΥΦ/);
  assert.match(client,/data-sbe-tax-office/);
  assert.match(client,/data-sbe-myf/);
  assert.match(client,/const original=form\.onsubmit/);
  assert.match(client,/await api\(`\/api\/supplier-control\/\$\{encodeURIComponent\(id\)\}\/basic-extra`/);
  assert.match(client,/original\.call\(form,event\)/);
});

test("extra fields do not leak unknown names into the existing generic supplier FormData",()=>{
  const taxInput=client.match(/<input data-sbe-tax-office[^>]*>/)?.[0]||"";
  const myfInput=client.match(/<input type="checkbox" data-sbe-myf[^>]*>/)?.[0]||"";
  assert.doesNotMatch(taxInput,/name=/);
  assert.doesNotMatch(myfInput,/name=/);
});

test("online AADE lookup is not faked without a real integration",()=>{
  assert.doesNotMatch(client,/ΑΑΔΕ/);
  assert.doesNotMatch(route,/aade/i);
});

test("extension mounts before generic routes and retains touch + anti-freeze wiring",()=>{
  assert.match(normalized,/supplierBasicExtraRoutes/);
  assert.ok(normalized.indexOf("router.use(supplierBasicExtraRoutes)")<normalized.indexOf("router.use(supplierControlRoutes)"));
  assert.match(entry,/installSupplierBasicExtras\(\)/);
  assert.match(entry,/installTouchKeyboard\(\)/);
  assert.match(entry,/purchaseOrdersHostObserver/);
  assert.match(entry,/window\.MutationObserver=class\{observe\(\)\{\}disconnect\(\)\{\}\}/);
});
