import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const commercial=await readFile(new URL("../src/commercial-bootstrap.js",import.meta.url),"utf8");
const extended=await readFile(new URL("../src/extended-modules-bootstrap.js",import.meta.url),"utf8");
const route=await readFile(new URL("../src/routes/commerce-v1-legacy.js",import.meta.url),"utf8");
const guard=await readFile(new URL("../src/middleware/commerce-tenant-guard.js",import.meta.url),"utf8");
const modules=await readFile(new URL("../src/services/module-catalog.js",import.meta.url),"utf8");
const client=await readFile(new URL("../../client/src/components/commerce/InvoiceInboxPanel.jsx",import.meta.url),"utf8");

test("invoice inbox schema additions are non destructive",()=>{
  assert.match(commercial,/ADD COLUMN IF NOT EXISTS "contentData"/);
  for(const field of ["responsibleName","createdByUserId","updatedAt"])assert.match(extended,new RegExp(`ADD COLUMN IF NOT EXISTS "${field}"`));
  assert.doesNotMatch(commercial,/DROP TABLE|TRUNCATE TABLE/);
  assert.doesNotMatch(extended,/DROP TABLE|TRUNCATE TABLE/);
});

test("invoice inbox validates tenant, module, type and size",()=>{
  assert.match(route,/requireCompanyModule\("DOCUMENTS"\)/);
  assert.match(route,/application\\\/pdf\|image/);
  assert.match(route,/bytes\.length>3400000/);
  assert.match(route,/crypto\.createHash\("sha256"\)/);
  assert.match(guard,/path==="\/documents\/inbox"/);
  assert.match(modules,/key:"DOCUMENTS"[\s\S]*commercialReady:true/);
});

test("invoice inbox UI supports store, supplier, responsible person and lifecycle",()=>{
  assert.match(client,/Θυρίδα Τιμολογίων/);
  assert.match(client,/supplierId/);
  assert.match(client,/responsibleName/);
  assert.match(client,/IN_REVIEW/);
  assert.match(client,/PROCESSED/);
  assert.match(client,/application\/pdf/);
});
