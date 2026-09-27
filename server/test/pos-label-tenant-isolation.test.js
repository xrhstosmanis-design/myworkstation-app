import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";
import {storeTenantAccessAllowed} from "../src/middleware/module-access.js";

const lab={id:"lab-store",companyId:"lab-company"};
const sibling={id:"lab-sibling",companyId:"lab-company"};
const kat={id:"kat-store",companyId:"kat-company"};
const operator={role:"EMPLOYEE",tokenType:"STORE_OPERATOR",companyId:lab.companyId,storeId:lab.id};

test("label store access permits own store and rejects sibling and KAT for LAB operator",()=>{
  assert.equal(storeTenantAccessAllowed(operator,lab),true);
  assert.equal(storeTenantAccessAllowed(operator,sibling),false);
  assert.equal(storeTenantAccessAllowed(operator,kat),false);
});

test("label settings route checks operator store and company before fetching settings",async()=>{
  const source=await readFile(new URL("../src/routes/store-pos-catalog.js",import.meta.url),"utf8");
  const route=source.match(/router\.get\("\/stores\/:storeId\/label-settings"[\s\S]*?\n\}\);/)?.[0];
  assert.ok(route,"label settings GET must exist");
  assert.match(route,/assertStore\(req,req\.params\.storeId\);const store=await storeFor\(req,req\.params\.storeId\)/);
  assert.match(route,/getStoreLabelSettings\(store\.companyId,store\.id\)/);
  assert.match(source,/req\.user\?\.tokenType==="STORE_OPERATOR"&&req\.user\.storeId!==storeId/);
  assert.match(source,/id:storeId,companyId:req\.user\.companyId,active:true/);
});

test("label settings query includes both company and store identifiers",async()=>{
  const source=await readFile(new URL("../src/services/store-label-settings.js",import.meta.url),"utf8");
  assert.match(source,/WHERE "companyId"=\$\{companyId\} AND "storeId"=\$\{storeId\}/);
});
