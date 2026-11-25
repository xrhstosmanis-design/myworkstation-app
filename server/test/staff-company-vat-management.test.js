import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {randomUUID} from "node:crypto";
import {z} from "zod";
import {companyVatManageCapability as capability,companyVatManagePath as path,companyVatManageRoute,companyVatActivateCapability,companyVatActivateRoute,staffCompanyRequestCapability,validStaffCompanyCapabilities} from "../../shared/backoffice-staff-company.mjs";
import {invoiceDbFixture,isolatedInvoiceDb} from "./helpers/invoice-common-draft-fixture.js";

const source=readFileSync(new URL("../src/services/backoffice-staff-company-vat.js",import.meta.url),"utf8")
  .replace(/^import .*;$/gm,"").replaceAll("export async function","async function");
const writer=new Function("randomUUID","z","capability","companyVatManageRoute","requireStaffCompanyGrant","staffError",source+";return saveStaffCompanyVatDepartment");
const fault=(status=403,code="STAFF_ACCESS_DENIED",message=code)=>Object.assign(Error(message),{status,code});
const request=(method,suffix,body)=>({method,originalUrl:path+suffix,body,
  staffCompanyGrant:{capability,companyId:"c",revision:1},user:{id:"staff",companyId:"c",staffAccess:true},
  get:name=>name==="x-backoffice-company-id"?"c":undefined});
const save=writer(randomUUID,z,capability,companyVatManageRoute,async()=>({revision:1}),fault);

test("company VAT label grant depends on read and only admits draft creation and rename",()=>{
  assert.equal(validStaffCompanyCapabilities([capability]),false);
  assert.equal(validStaffCompanyCapabilities(["vat-departments.read",capability]),true);
  assert.equal(staffCompanyRequestCapability("POST",path),capability);
  assert.equal(staffCompanyRequestCapability("PATCH",path+"/vat"),capability);
  for(const [method,suffix] of [["DELETE","/vat"],["PATCH","/bulk/assign"],["PATCH","/%2f"],["GET",""],["POST","/"]]){
    assert.equal(staffCompanyRequestCapability(method,path+suffix),null);
  }
});
test("fiscal fields and store-scoped attempts fail before write; closed company grant fails in transaction",async()=>{
  const noDb={$transaction:()=>assert.fail("must reject before transaction")};
  for(const extra of [{vatRate:24},{active:true},{cashRegisterDepartment:12},{exemptionCode:"6"},{commerce:true}]){
    await assert.rejects(save(noDb,request("POST","",{description:"Draft",...extra})),{status:400});
    await assert.rejects(save(noDb,request("PATCH","/vat",{description:"Label",expectedDescription:"Old",...extra})),{status:400});
  }
  const store=request("POST","",{description:"Draft"});
  store.user.storeId="s";
  await assert.rejects(save(noDb,store),{status:403});
  const revoked=writer(randomUUID,z,capability,companyVatManageRoute,async()=>({revision:2}),fault);
  await assert.rejects(revoked({$transaction:run=>run({})},request("POST","",{description:"Draft"})),{status:403});
});
test("native VAT drafts stay inactive and fiscal fields and tenant remain intact after label rename",{skip:!isolatedInvoiceDb()},async()=>{
  const {db,close}=await invoiceDbFixture();
  try{
    await db.$executeRawUnsafe(`CREATE TABLE "ManagementVatDepartment" ("id" text PRIMARY KEY,"companyId" text,"description" text,"active" bool,
      "commerce" bool,"vatRate" numeric DEFAULT 0,"cashRegisterDepartment" int,"legacyVatCode" text,"exemptionCode" text,"updatedAt" timestamptz)`);
    await db.$executeRawUnsafe('CREATE TABLE "BackofficeStaffAudit" ("id" text PRIMARY KEY,"companyId" text,"actorId" text,"targetUserId" text,"event" text,"detail" jsonb)');
    await db.$executeRaw`INSERT INTO "ManagementVatDepartment" VALUES ('active','c','Active',true,true,13,5,'6','7',NULL),('foreign','other','Foreign',true,true,24,2,NULL,NULL,NULL)`;
    const run=(method,suffix,body)=>save(db,request(method,suffix,body));
    const draft=await run("POST","",{description:"Draft"});
    assert.equal(draft.active,false);
    await assert.rejects(run("POST","",{description:"draft"}),{code:"STAFF_VAT_LABEL_DUPLICATE"});
    await assert.rejects(run("PATCH","/foreign",{description:"Wrong",expectedDescription:"Foreign"}),{status:404});
    await run("PATCH","/active",{description:"Renamed",expectedDescription:"Active"});
    await run("PATCH","/active",{description:"Renamed",expectedDescription:"Active"});
    await assert.rejects(run("PATCH","/active",{description:"Stale",expectedDescription:"Active"}),{code:"STAFF_VAT_LABEL_CHANGED"});
    const rows=await db.$queryRaw`SELECT "id","description","active","commerce","vatRate","cashRegisterDepartment","legacyVatCode","exemptionCode" FROM "ManagementVatDepartment"`;
    const dto=id=>{const row=rows.find(value=>value.id===id);return {...row,vatRate:Number(row.vatRate)};};
    assert.deepEqual(dto("active"),{id:"active",description:"Renamed",active:true,commerce:true,vatRate:13,cashRegisterDepartment:5,legacyVatCode:"6",exemptionCode:"7"});
    assert.deepEqual(dto(draft.id),{id:draft.id,description:"Draft",active:false,commerce:false,vatRate:0,cashRegisterDepartment:null,legacyVatCode:null,exemptionCode:null});
    assert.equal(dto("foreign").description,"Foreign");
    const audit=await db.$queryRaw`SELECT "event","actorId" FROM "BackofficeStaffAudit" ORDER BY "event"`;
    assert.deepEqual(audit,[{event:"VAT_DEPARTMENT_DRAFT_CREATED",actorId:"staff"},{event:"VAT_DEPARTMENT_LABEL_RENAMED",actorId:"staff"}]);
  }finally{await close();}
});

const activationWriter=new Function("randomUUID","z","companyVatActivateCapability","companyVatActivateRoute","requireStaffCompanyGrant","staffError",
  source+";return activateStaffCompanyVatDraft");
const activate=activationWriter(randomUUID,z,companyVatActivateCapability,companyVatActivateRoute,async()=>({revision:1}),fault);
function activation(id,body={expectedDescription:"Draft",vatRate:13,confirm:true}){
  const req=request("POST","/"+id+"/activate-draft",body);
  req.staffCompanyGrant.capability=companyVatActivateCapability;
  return req;
}
test("unused VAT draft activation is independent and rejects unconfirmed, zero or fiscal fields",async()=>{
  const url=path+"/dept/activate-draft";
  assert.equal(staffCompanyRequestCapability("POST",url),companyVatActivateCapability);
  assert.equal(staffCompanyRequestCapability("PATCH",url),null);
  assert.equal(staffCompanyRequestCapability("POST",url+"?storeId=s"),null);
  assert.equal(validStaffCompanyCapabilities([companyVatActivateCapability]),false);
  assert.equal(validStaffCompanyCapabilities(["vat-departments.read",companyVatActivateCapability]),true);
  const db={$transaction:()=>assert.fail("may not start transaction")};
  for(const body of [
    {expectedDescription:"Draft",vatRate:0,confirm:true},
    {expectedDescription:"Draft",vatRate:13.0001,confirm:true},
    {expectedDescription:"Draft",vatRate:13,confirm:false},
    {expectedDescription:"Draft",vatRate:24,confirm:true,cashRegisterDepartment:2}
  ])await assert.rejects(activate(db,activation("d",body)),{status:400});
  const revoked=activationWriter(randomUUID,z,companyVatActivateCapability,companyVatActivateRoute,async()=>({revision:2}),fault);
  await assert.rejects(revoked({$transaction:run=>run({})},activation("d")),{status:403});
});
test("native activation only changes an unused unconfigured company draft, atomically audited",{skip:!isolatedInvoiceDb()},async()=>{
  const {db,close}=await invoiceDbFixture();
  try{
    await db.$executeRawUnsafe(`CREATE TABLE "ManagementVatDepartment" ("id" text PRIMARY KEY,"companyId" text,"description" text,
      "active" bool default false,"commerce" bool default false,"vatRate" numeric default 0,"cashRegisterDepartment" int,
      "legacyVatCode" text,"exemptionCode" text,"exemptionDescription" text,"updatedAt" timestamptz)`);
    await db.$executeRawUnsafe('CREATE TABLE "BackofficeStaffAudit" ("id" text PRIMARY KEY,"companyId" text,"actorId" text,"targetUserId" text,"event" text,"detail" jsonb)');
    await db.$executeRawUnsafe('ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "vatDepartmentId" text');
    await db.$executeRawUnsafe('ALTER TABLE "StoreProduct" ADD COLUMN IF NOT EXISTS "vatDepartmentIdOverride" text');
    await db.$executeRaw`INSERT INTO "ManagementVatDepartment" ("id","companyId","description") VALUES ('d','c','Draft'),('mapped','c','Draft'),('used','c','Draft'),('override','c','Draft'),('foreign','else','Draft')`;
    await db.$executeRaw`UPDATE "ManagementVatDepartment" SET "cashRegisterDepartment"=4 WHERE "id"='mapped'`;
    await db.$executeRaw`UPDATE "Product" SET "vatDepartmentId"='used' WHERE "id"='p'`;
    await db.$executeRaw`UPDATE "StoreProduct" SET "vatDepartmentIdOverride"='override' WHERE "id"='stock'`;
    await assert.rejects(activate(db,activation("foreign")),{status:404});
    await assert.rejects(activate(db,activation("mapped")),{code:"STAFF_VAT_ACTIVATION_NOT_DRAFT"});
    await assert.rejects(activate(db,activation("used")),{code:"STAFF_VAT_ACTIVATION_REFERENCED"});
    await assert.rejects(activate(db,activation("override")),{code:"STAFF_VAT_ACTIVATION_REFERENCED"});
    const outcome=await Promise.allSettled([activate(db,activation("d")),activate(db,activation("d"))]);
    assert.equal(outcome.filter(row=>row.status==="fulfilled").length,1);
    assert.equal(outcome.find(row=>row.status==="rejected").reason.code,"STAFF_VAT_ACTIVATION_NOT_DRAFT");
    const [row]=await db.$queryRaw`SELECT "vatRate","active","commerce","cashRegisterDepartment" FROM "ManagementVatDepartment" WHERE "id"='d'`;
    assert.deepEqual({...row,vatRate:Number(row.vatRate)},{vatRate:13,active:true,commerce:false,cashRegisterDepartment:null});
    const audits=await db.$queryRaw`SELECT "event","actorId" FROM "BackofficeStaffAudit"`;
    assert.deepEqual(audits,[{event:"VAT_DEPARTMENT_DRAFT_ACTIVATED",actorId:"staff"}]);
  }finally{await close();}
});
