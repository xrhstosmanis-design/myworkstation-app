import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {randomUUID} from "node:crypto";
import {z} from "zod";
import {companyCategoryManageCapability as capability,companyCategoryManagePrefix as prefix,companyCategoryManageRoute,companyCategoryReactivateCapability,companyCategoryReactivateRoute,staffCompanyRequestCapability,validStaffCompanyCapabilities} from "../../shared/backoffice-staff-company.mjs";
import {invoiceDbFixture,isolatedInvoiceDb} from "./helpers/invoice-common-draft-fixture.js";

const source=readFileSync(new URL("../src/services/backoffice-staff-company-taxonomy.js",import.meta.url),"utf8")
  .replace(/^import .*;$/gm,"").replaceAll("export async function","async function");
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

const activationWriter=new Function("randomUUID","z","companyCategoryReactivateCapability","companyCategoryReactivateRoute","requireStaffCompanyGrant","staffError",source+";return reactivateStaffCompanyCategory");
const reactivate=activationWriter(randomUUID,z,companyCategoryReactivateCapability,companyCategoryReactivateRoute,async()=>({revision:1}),fault);
function reactivation(kind,id,body={expectedName:id,confirm:true}){
  const req=request("POST","/"+kind+"/"+id+"/reactivate",body);
  req.staffCompanyGrant.capability=companyCategoryReactivateCapability;
  return req;
}
test("taxonomy reactivation has a separate company grant and admits only exact confirmed POST",async()=>{
  const cap=companyCategoryReactivateCapability,url=prefix+"/categories/item/reactivate";
  assert.equal(staffCompanyRequestCapability("POST",url),cap);
  assert.equal(staffCompanyRequestCapability("PATCH",url),null);
  assert.equal(staffCompanyRequestCapability("POST",url.replace("reactivate","archive")),null);
  assert.equal(staffCompanyRequestCapability("POST",url.replace("item","%2F")),null);
  assert.equal(validStaffCompanyCapabilities([cap]),false);
  assert.equal(validStaffCompanyCapabilities(["categories.read",cap]),true);
  await assert.rejects(reactivate({$transaction:()=>assert.fail("invalid body")},reactivation("categories","item",{expectedName:"item",confirm:false})),{status:400});
  const revoked=activationWriter(randomUUID,z,cap,companyCategoryReactivateRoute,async()=>({revision:2}),fault);
  await assert.rejects(revoked({$transaction:run=>run({})},reactivation("categories","item")),{status:403});
});

test("native reactivation rejects company and store references, inactive parents and foreign rows",{skip:!isolatedInvoiceDb()},async()=>{
  const {db,close}=await invoiceDbFixture();
  try{
    await db.$executeRawUnsafe('CREATE TABLE "ProductCategory" ("id" text PRIMARY KEY,"companyId" text,"name" text,"active" bool,"updatedAt" timestamptz)');
    await db.$executeRawUnsafe('CREATE TABLE "ProductSubcategory" ("id" text PRIMARY KEY,"companyId" text,"categoryId" text,"name" text,"active" bool,"updatedAt" timestamptz)');
    await db.$executeRawUnsafe('CREATE TABLE "BackofficeStaffAudit" ("id" text PRIMARY KEY,"companyId" text,"actorId" text,"targetUserId" text,"event" text,"detail" jsonb)');
    await db.$executeRawUnsafe('ALTER TABLE "Product" ADD COLUMN "categoryId" text, ADD COLUMN "subcategoryId" text');
    await db.$executeRawUnsafe('ALTER TABLE "StoreProduct" ADD COLUMN "categoryIdOverride" text, ADD COLUMN "subcategoryIdOverride" text');
    await db.$executeRaw`INSERT INTO "ProductCategory" VALUES ('cat','c','cat',false,NULL),('parent','c','parent',true,NULL),
      ('used','c','used',false,NULL),('override','c','override',false,NULL),('foreign','x','foreign',false,NULL)`;
    await db.$executeRaw`INSERT INTO "ProductSubcategory" VALUES ('child','c','cat','child',false,NULL),('leaf','c','parent','leaf',false,NULL),
      ('refsub','c','parent','refsub',false,NULL)`;
    await db.$executeRaw`UPDATE "Product" SET "categoryId"='used' WHERE "id"='p'`;
    await db.$executeRaw`UPDATE "StoreProduct" SET "categoryIdOverride"='override',"subcategoryIdOverride"='refsub' WHERE "id"='stock'`;
    const activate=(kind,id)=>reactivate(db,reactivation(kind,id));
    for(const id of ["used","override"])await assert.rejects(activate("categories",id),{code:"STAFF_TAXONOMY_REFERENCED"});
    await assert.rejects(activate("subcategories","refsub"),{code:"STAFF_TAXONOMY_REFERENCED"});
    await assert.rejects(activate("subcategories","child"),{code:"STAFF_TAXONOMY_PARENT_INACTIVE"});
    await assert.rejects(activate("categories","foreign"),{status:404});
    const results=await Promise.allSettled([activate("categories","cat"),activate("categories","cat")]);
    assert.equal(results.filter(result=>result.status==="fulfilled").length,1);
    assert.equal(results.find(result=>result.status==="rejected").reason.code,"STAFF_TAXONOMY_ALREADY_ACTIVE");
    assert.equal((await activate("subcategories","leaf")).active,true);
    const [child]=await db.$queryRaw`SELECT "active" FROM "ProductSubcategory" WHERE "id"='child'`;
    assert.equal(child.active,false);
    const audit=await db.$queryRaw`SELECT "event","actorId" FROM "BackofficeStaffAudit"`;
    assert.equal(audit.length,2);
    assert.ok(audit.every(row=>row.event==="PRODUCT_TAXONOMY_REACTIVATED"&&row.actorId==="staff"));
  }finally{await close();}
});
