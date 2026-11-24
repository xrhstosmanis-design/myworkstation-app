import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {randomUUID} from "node:crypto";
import {z} from "zod";
import {companyCategoryManageCapability as capability,companyCategoryManagePrefix as prefix,companyCategoryManageRoute,staffCompanyRequestCapability,validStaffCompanyCapabilities} from "../../shared/backoffice-staff-company.mjs";
import {invoiceDbFixture,isolatedInvoiceDb} from "./helpers/invoice-common-draft-fixture.js";

const source=readFileSync(new URL("../src/services/backoffice-staff-company-taxonomy.js",import.meta.url),"utf8")
  .replace(/^import .*;$/gm,"").replace("export async function","async function");
const writer=new Function("randomUUID","z","capability","companyCategoryManageRoute","requireStaffCompanyGrant","staffError",source+";return saveStaffCompanyCategory");
const fault=(status=403,code="STAFF_ACCESS_DENIED",message=code)=>Object.assign(Error(message),{status,code});
const request=(method,path,body)=>({method,originalUrl:prefix+path,body,
  staffCompanyGrant:{capability,companyId:"c",revision:1},user:{id:"staff",companyId:"c",staffAccess:true},
  get:name=>name==="x-backoffice-company-id"?"c":undefined});
const create=writer(randomUUID,z,capability,companyCategoryManageRoute,async()=>({revision:1}),fault);

test("company taxonomy admits only create and rename with an explicit dependent company grant",()=>{
  assert.equal(validStaffCompanyCapabilities([capability]),false);
  assert.equal(validStaffCompanyCapabilities(["categories.read",capability]),true);
  for(const kind of ["categories","subcategories"]){
    assert.equal(staffCompanyRequestCapability("POST",prefix+"/"+kind),capability);
    assert.equal(staffCompanyRequestCapability("PATCH",prefix+"/"+kind+"/id"),capability);
    for(const [method,tail] of [["DELETE","/id"],["PATCH","/id/transfer"],["PATCH","/%2f"],["POST","/"],["GET",""]]){
      assert.equal(staffCompanyRequestCapability(method,prefix+"/"+kind+tail),null);
    }
  }
});

test("company context, strict body and live revision recheck precede any write",async()=>{
  const minimal={$transaction:()=>assert.fail("must reject before transaction")};
  for(const extra of [{active:false},{legacyCode:"code"},{storeId:"store"}]){
    await assert.rejects(create(minimal,request("POST","/categories",{name:"Test",...extra})),{status:400});
  }
  const wrongScope=request("POST","/categories",{name:"Test"});
  wrongScope.user.storeId="store";
  await assert.rejects(create(minimal,wrongScope),{status:403});
  const revoked=writer(randomUUID,z,capability,companyCategoryManageRoute,async()=>({revision:2}),fault);
  await assert.rejects(revoked({$transaction:run=>run({})},request("POST","/categories",{name:"Test"})),{status:403});
});

test("native category and subcategory changes preserve parent, flags and foreign tenant and audit once",{skip:!isolatedInvoiceDb()},async()=>{
  const {db,close}=await invoiceDbFixture();
  try{
    await db.$executeRawUnsafe('CREATE TABLE "ProductCategory" ("id" text PRIMARY KEY,"companyId" text,"name" text,"active" bool,"updatedAt" timestamptz)');
    await db.$executeRawUnsafe('CREATE TABLE "ProductSubcategory" ("id" text PRIMARY KEY,"companyId" text,"categoryId" text,"name" text,"active" bool,"updatedAt" timestamptz)');
    await db.$executeRawUnsafe('CREATE TABLE "BackofficeStaffAudit" ("id" text PRIMARY KEY,"companyId" text,"actorId" text,"targetUserId" text,"event" text,"detail" jsonb)');
    await db.$executeRaw`INSERT INTO "ProductCategory" VALUES ('foreign','other','Foreign',true,NULL)`;
    const call=(method,path,body)=>create(db,request(method,path,body));
    const category=await call("POST","/categories",{name:"Category"});
    const sub=await call("POST","/subcategories",{name:"Sub",categoryId:category.id});
    await assert.rejects(call("POST","/subcategories",{name:"Wrong",categoryId:"foreign"}),{status:404});
    await assert.rejects(call("PATCH","/categories/foreign",{name:"Wrong",expectedName:"Foreign"}),{status:404});
    await assert.rejects(call("POST","/categories",{name:"cAtEgOrY"}),{code:"STAFF_TAXONOMY_DUPLICATE"});
    await call("PATCH","/categories/"+category.id,{name:"Renamed",expectedName:"Category"});
    await call("PATCH","/subcategories/"+sub.id,{name:"Renamed Sub",expectedName:"Sub"});
    await call("PATCH","/subcategories/"+sub.id,{name:"Renamed Sub",expectedName:"Sub"}); // exact replay
    await assert.rejects(call("PATCH","/subcategories/"+sub.id,{name:"Stale edit",expectedName:"Sub"}),{code:"STAFF_TAXONOMY_CHANGED"});
    const [row]=await db.$queryRaw`SELECT "name","categoryId","active" FROM "ProductSubcategory" WHERE "id"=${sub.id}`;
    assert.deepEqual(row,{name:"Renamed Sub",categoryId:category.id,active:true});
    const audit=await db.$queryRaw`SELECT "companyId","actorId","event" FROM "BackofficeStaffAudit"`;
    assert.equal(audit.length,4);
    assert.ok(audit.every(row=>row.companyId==="c"&&row.actorId==="staff"));
  }finally{await close();}
});
