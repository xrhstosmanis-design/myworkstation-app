import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {fileURLToPath} from "node:url";

const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
const read=p=>fs.readFileSync(path.join(repo,p),"utf8");
const backendPath="server/src/routes/store-pos.js";
const clientPath="client/src/components/commerce/CommercialPosApp.jsx";
const backend=read(backendPath),client=read(clientPath),css=read("client/src/components/commerce/pos-customer.css"),index=read("server/src/index.js");

test("POS customer implementation parses",()=>{execFileSync(process.execPath,["--check",path.join(repo,backendPath)])});

test("POS has a minimal company-scoped customer search endpoint",()=>{
  assert.match(backend,/router\.get\("\/stores\/:storeId\/customers"/);
  assert.match(backend,/FROM "Customer"/);
  assert.match(backend,/"companyId"=\$\{req\.user\.companyId\}/);
  assert.match(backend,/"active"=true/);
  assert.match(backend,/LIMIT 30/);
  assert.doesNotMatch(backend,/customerCategoryId|notes/);
  assert.match(backend,/"points"/);
  assert.match(backend,/hasMemberCard:Boolean/);
  assert.match(backend,/memberCard:undefined/);
});

test("checkout validates customer in tenant and persists Sale.customerId",()=>{
  assert.match(backend,/resolveCustomer\(req,body\.customerId\)/);
  assert.match(backend,/WHERE "id"=\$\{customerId\} AND "companyId"=\$\{req\.user\.companyId\} AND "active"=true/);
  assert.match(backend,/customerId:z\.string\(\)\.min\(1\)\.optional\(\)\.nullable\(\)/);
  assert.match(backend,/INSERT INTO "Sale" \("id","companyId","storeId","customerId"/);
  assert.match(backend,/\$\{customer\?\.id\|\|null\}/);
});

test("held transactions preserve and restore the selected customer",()=>{
  assert.match(backend,/ADD COLUMN IF NOT EXISTS "customerId" TEXT/);
  assert.match(backend,/ADD COLUMN IF NOT EXISTS "customerName" TEXT/);
  assert.match(backend,/holdSchema=quoteSchema/);
  assert.match(backend,/"customerId","customerName","itemsJson"/);
  assert.match(backend,/RETURNING "id","customerId","customerName","itemsJson"/);
  assert.match(client,/customerId:customer\?\.id\|\|null/);
  assert.match(client,/applyCustomerPricing\(r\.customer\|\|null,rows\)/);
});

test("POS UI lets operator search select and clear a real customer",()=>{
  for(const text of ["ΠΕΛΑΤΗΣ","Χωρίς πελάτη","Αναζήτηση πελάτη","Όνομα, ΑΦΜ, τηλέφωνο ή email"])assert.ok(client.includes(text),text);
  assert.match(client,/searchCustomers/);
  assert.match(client,/chooseCustomer/);
  assert.match(client,/store-pos-customer-button/);
  assert.match(client,/pos-customer-panel/);
  assert.match(client,/customerId:customer\?\.id\|\|null/);
});

test("successful checkout clears customer but HOLD restore brings it back through pricing resolver",()=>{
  assert.match(client,/setCart\(\[\]\);setSelectedId\(null\);setCustomer\(null\)/);
  assert.match(client,/applyCustomerPricing\(r\.customer\|\|null,rows\)/);
  assert.match(client,/setCustomer\(value\)/);
});

test("store POS remains protected by authenticated Store Mode module route",()=>{
  assert.match(index,/app\.use\("\/api\/store-pos",auth,requireCompanyModule\("STORE_MODE"\),storePosRoutes\)/);
});

test("customer selector uses MyWorkStation palette and touch keyboard compatible inputs",()=>{
  assert.match(css,/#123b5d/);
  assert.match(css,/#0f766e/);
  assert.doesNotMatch(css,/#ffa500|#ff9800/i);
  assert.match(client,/customerQuery/);
});
