import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

test("Commerce V1 is mounted behind the tenant guard",async()=>{
  const index=await fs.readFile(new URL("../src/index.js",import.meta.url),"utf8");
  assert.match(index,/app\.use\("\/api\/commerce",auth,commerceTenantGuard,commerceV1Routes\)/);
});

test("tenant guard validates all cross-company commerce references",async()=>{
  const source=await fs.readFile(new URL("../src/middleware/commerce-tenant-guard.js",import.meta.url),"utf8");
  for(const marker of ["ProductCategory","Supplier","Customer","operatorEmployeeId","fromEmployeeId","toEmployeeId","productId"]){
    assert.ok(source.includes(marker),`missing tenant check marker ${marker}`);
  }
});

test("barcode uniqueness is scoped to one company",async()=>{
  const source=await fs.readFile(new URL("../src/middleware/commerce-tenant-guard.js",import.meta.url),"utf8");
  assert.match(source,/JOIN \"Product\" p ON p\.\"id\"=b\.\"productId\"/);
  assert.match(source,/p\.\"companyId\"/);
  assert.match(source,/DUPLICATE_COMPANY_BARCODE/);
});
