import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {fileURLToPath} from "node:url";
import {storeTenantAccessAllowed} from "../src/middleware/module-access.js";

const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
const read=p=>fs.readFileSync(path.join(repo,p),"utf8");

const storeA={id:"store-a",companyId:"company-a"};
const storeB={id:"store-b",companyId:"company-b"};
const storeA2={id:"store-a2",companyId:"company-a"};

test("SUPER_ADMIN may target another tenant only as platform exception",()=>{
  assert.equal(storeTenantAccessAllowed({role:"SUPER_ADMIN",companyId:"platform"},storeA),true);
  assert.equal(storeTenantAccessAllowed({role:"OWNER",companyId:"company-a"},storeA),true);
  assert.equal(storeTenantAccessAllowed({role:"ADMIN",companyId:"company-a"},storeA),true);
  assert.equal(storeTenantAccessAllowed({role:"MANAGER",companyId:"company-a"},storeA),true);
  assert.equal(storeTenantAccessAllowed({role:"EMPLOYEE",companyId:"company-a"},storeA),true);
});

test("non-super-admin users cannot target another company store",()=>{
  for(const role of ["OWNER","ADMIN","MANAGER","EMPLOYEE"]){
    assert.equal(storeTenantAccessAllowed({role,companyId:"company-a"},storeB),false,role);
  }
});

test("STORE_OPERATOR is locked to both its company and exact store",()=>{
  const operator={role:"EMPLOYEE",tokenType:"STORE_OPERATOR",companyId:"company-a",storeId:"store-a"};
  assert.equal(storeTenantAccessAllowed(operator,storeA),true);
  assert.equal(storeTenantAccessAllowed(operator,storeA2),false);
  assert.equal(storeTenantAccessAllowed(operator,storeB),false);
});

test("public Store Mode discovery remains possible before authentication",()=>{
  assert.equal(storeTenantAccessAllowed(undefined,storeA),true);
});

test("requireStoreModule enforces tenant rejection after auth",()=>{
  const source=read("server/src/middleware/module-access.js");
  assert.match(source,/storeTenantAccessAllowed\(req\.user,store\)/);
  assert.match(source,/TENANT_STORE_REJECTED/);
  assert.match(source,/select:\{id:true,companyId:true\}/);
});

test("operator management keeps controlled SUPER_ADMIN targeting and tenant scope for owners",()=>{
  const source=read("server/src/routes/operator-management-v2.js");
  assert.match(source,/\["SUPER_ADMIN","OWNER","ADMIN"\]/);
  assert.match(source,/req\.user\?\.role==="SUPER_ADMIN"\?\{id:storeId,active:true\}:\{id:storeId,companyId:req\.user\.companyId,active:true\}/);
  assert.doesNotMatch(source,/"EMPLOYEE"\]\s*\.includes\(req\.user\?\.role\)/);
});

test("Store POS separately scopes store and product data to authenticated company",()=>{
  const source=read("server/src/routes/store-pos.js");
  assert.match(source,/companyId:req\.user\.companyId,active:true/);
  assert.match(source,/p\."companyId"=\$\{req\.user\.companyId\}/);
  assert.match(source,/req\.user\?\.tokenType==="STORE_OPERATOR"&&req\.user\.storeId!==storeId/);
});

test("commerce create flows reject cross-company references",()=>{
  const source=read("server/src/middleware/commerce-tenant-guard.js");
  for(const entity of ["ProductCategory","Product","Supplier","Customer"])assert.ok(source.includes(`\"${entity}\"`),entity);
  assert.match(source,/TENANT_REFERENCE_REJECTED/);
  assert.match(source,/DUPLICATE_COMPANY_BARCODE/);
  assert.match(source,/employeeExists\(companyId/);
});
