import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import {PrismaClient} from "@prisma/client";

const prisma=new PrismaClient();
const baseUrl=process.env.E2E_BASE_URL||"http://127.0.0.1:8080";
const companyId="pilot-company";
const storeId="kat-store";
const otherStoreId="e2e-payment-other-store";
const otherCompanyId="e2e-payment-other-company";
const otherTenantStoreId="e2e-payment-other-tenant-store";
const ownerEmail=process.env.KAT_OWNER_EMAIL||"ci-kat-owner@myworkstation.test";
const ownerPassword="ci-owner-e2e-password";

async function request(path,{method="GET",token,body}={}){
  const response=await fetch(`${baseUrl}${path}`,{
    method,
    headers:{...(token?{authorization:`Bearer ${token}`}:{ }),...(body!==undefined?{"content-type":"application/json"}:{})},
    body:body===undefined?undefined:JSON.stringify(body)
  });
  let payload=null;
  try{payload=await response.json()}catch{}
  return {response,payload};
}

async function transactionCount(){
  const rows=await prisma.$queryRawUnsafe(`SELECT COUNT(*)::int AS count FROM "StoreTransaction" WHERE "companyId"=$1 AND "storeId"=$2`,companyId,storeId);
  return Number(rows[0]?.count||0);
}

async function insertDocument({id,company,store,supplier,total=10,status="DRAFT"}){
  await prisma.$executeRawUnsafe(
    `INSERT INTO "PurchaseDocument" ("id","companyId","storeId","supplierId","documentType","documentNumber","documentDate","totalNet","totalVat","totalGross","sourceType","status") VALUES ($1,$2,$3,$4,'INVOICE',$5,NOW(),$6,0,$6,'OCR_DRAFT',$7)`,
    id,company,store,supplier,`E2E-${id}`,total,status
  );
}

async function main(){
  await prisma.company.update({where:{id:companyId},data:{active:true,licenseStatus:"ACTIVE",subscriptionEndsAt:new Date(Date.now()+7*24*60*60*1000)}});
  for(const moduleKey of ["CASH_CONTROL","INVENTORY"]){
    await prisma.companyModule.upsert({where:{companyId_moduleKey:{companyId,moduleKey}},update:{active:true,startsAt:null,endsAt:null},create:{companyId,moduleKey,active:true}});
  }
  await prisma.store.update({where:{id:storeId},data:{active:true,cashCloseEmailEnabled:false}});
  await prisma.store.upsert({where:{id:otherStoreId},update:{companyId,name:"E2E Other Store",active:true,cashCloseEmailEnabled:false},create:{id:otherStoreId,companyId,name:"E2E Other Store",active:true,cashCloseEmailEnabled:false}});
  await prisma.user.update({where:{email:ownerEmail},data:{passwordHash:await bcrypt.hash(ownerPassword,4),mustChangePassword:false,role:"OWNER",companyId}});

  await prisma.company.upsert({where:{id:otherCompanyId},update:{name:"E2E Payment Other Company",active:true,licenseStatus:"ACTIVE",subscriptionEndsAt:new Date(Date.now()+7*24*60*60*1000)},create:{id:otherCompanyId,name:"E2E Payment Other Company",active:true,licenseStatus:"ACTIVE",subscriptionEndsAt:new Date(Date.now()+7*24*60*60*1000)}});
  await prisma.store.upsert({where:{id:otherTenantStoreId},update:{companyId:otherCompanyId,name:"E2E Payment Other Tenant Store",active:true,cashCloseEmailEnabled:false},create:{id:otherTenantStoreId,companyId:otherCompanyId,name:"E2E Payment Other Tenant Store",active:true,cashCloseEmailEnabled:false}});

  const login=await request("/api/auth/login",{method:"POST",body:{email:ownerEmail,password:ownerPassword,deviceName:"CI payment boundaries"}});
  assert.equal(login.response.status,200,JSON.stringify(login.payload));
  const token=login.payload?.token;
  assert.ok(token);

  const supplierA=await request("/api/commerce/suppliers",{method:"POST",token,body:{name:"E2E Boundary Supplier A",taxId:"E2E-BOUND-A"}});
  const supplierB=await request("/api/commerce/suppliers",{method:"POST",token,body:{name:"E2E Boundary Supplier B",taxId:"E2E-BOUND-B"}});
  assert.equal(supplierA.response.status,201,JSON.stringify(supplierA.payload));
  assert.equal(supplierB.response.status,201,JSON.stringify(supplierB.payload));
  const supplierAId=supplierA.payload.id,supplierBId=supplierB.payload.id;

  const foreignSupplierId=crypto.randomUUID();
  await prisma.$executeRawUnsafe(`INSERT INTO "Supplier" ("id","companyId","name","taxId","active") VALUES ($1,$2,'E2E Foreign Supplier','E2E-FOREIGN',true)`,foreignSupplierId,otherCompanyId);

  const validDocId="e2e-bound-valid-doc";
  const otherStoreDocId="e2e-bound-other-store-doc";
  const otherTenantDocId="e2e-bound-other-tenant-doc";
  await insertDocument({id:validDocId,company:companyId,store:storeId,supplier:supplierAId,total:12.4});
  await insertDocument({id:otherStoreDocId,company:companyId,store:otherStoreId,supplier:supplierAId,total:8});
  await insertDocument({id:otherTenantDocId,company:otherCompanyId,store:otherTenantStoreId,supplier:foreignSupplierId,total:9});

  const beforeNoShift=await transactionCount();
  const noShift=await request(`/api/transactions/stores/${storeId}`,{method:"POST",token,body:{type:"OTHER_EXPENSE",amount:2,description:"valid external payment without shift",evidenceMode:"NO_DOCUMENT",paymentSource:"EXTERNAL",idempotencyKey:"e2e-bound-no-shift-001"}});
  assert.equal(noShift.response.status,201,JSON.stringify(noShift.payload));
  assert.equal(noShift.payload.sessionId,null,"External BackOffice payment was attached to a shift");
  assert.equal(await transactionCount(),beforeNoShift+1,"External payment without shift was not stored");

  const noShiftCash=await request(`/api/transactions/stores/${storeId}`,{method:"POST",token,body:{type:"OTHER_EXPENSE",amount:2,description:"cash-shift payment without shift",evidenceMode:"NO_DOCUMENT",paymentSource:"CASH_SHIFT",idempotencyKey:"e2e-bound-no-shift-cash-001"}});
  assert.equal(noShiftCash.response.status,409,"CASH_SHIFT payment without open shift was stored");
  assert.equal(await transactionCount(),beforeNoShift+1,"Rejected CASH_SHIFT payment left a StoreTransaction");

  const opened=await request(`/api/cash/stores/${storeId}/sessions/open`,{method:"POST",token,body:{shiftLabel:"E2E payment boundaries",drawer:30,custody:0,coins:0,safe:0,note:"boundary validation"}});
  assert.equal(opened.response.status,201,JSON.stringify(opened.payload));
  const sessionId=opened.payload.id;

  let before=await transactionCount();
  const noDescription=await request(`/api/transactions/stores/${storeId}`,{method:"POST",token,body:{type:"OTHER_EXPENSE",amount:2,description:"",evidenceMode:"NO_DOCUMENT",paymentSource:"EXTERNAL",idempotencyKey:"e2e-bound-no-description-001"}});
  assert.equal(noDescription.response.status,400,"NO_DOCUMENT payment without description was accepted");
  assert.equal(await transactionCount(),before);

  before=await transactionCount();
  const supplierMismatch=await request(`/api/transactions/stores/${storeId}`,{method:"POST",token,body:{type:"SUPPLIER_PAYMENT",amount:12.4,description:"wrong supplier",supplierId:supplierBId,evidenceMode:"DOCUMENT",purchaseDocumentId:validDocId,paymentSource:"EXTERNAL",idempotencyKey:"e2e-bound-mismatch-001"}});
  assert.equal(supplierMismatch.response.status,400,"Supplier mismatch with PurchaseDocument was accepted");
  assert.equal(await transactionCount(),before);

  before=await transactionCount();
  const otherStoreDoc=await request(`/api/transactions/stores/${storeId}`,{method:"POST",token,body:{type:"SUPPLIER_PAYMENT",amount:8,description:"wrong store document",supplierId:supplierAId,evidenceMode:"DOCUMENT",purchaseDocumentId:otherStoreDocId,paymentSource:"EXTERNAL",idempotencyKey:"e2e-bound-other-store-001"}});
  assert.equal(otherStoreDoc.response.status,404,"PurchaseDocument from another store was accepted");
  assert.equal(await transactionCount(),before);

  before=await transactionCount();
  const otherTenantDoc=await request(`/api/transactions/stores/${storeId}`,{method:"POST",token,body:{type:"SUPPLIER_PAYMENT",amount:9,description:"wrong tenant document",supplierId:supplierAId,evidenceMode:"DOCUMENT",purchaseDocumentId:otherTenantDocId,paymentSource:"EXTERNAL",idempotencyKey:"e2e-bound-other-tenant-001"}});
  assert.equal(otherTenantDoc.response.status,404,"PurchaseDocument from another tenant was accepted");
  assert.equal(await transactionCount(),before);

  const valid=await request(`/api/transactions/stores/${storeId}`,{method:"POST",token,body:{type:"SUPPLIER_PAYMENT",amount:12.4,description:"valid linked document",supplierId:supplierAId,evidenceMode:"DOCUMENT",purchaseDocumentId:validDocId,paymentSource:"EXTERNAL",idempotencyKey:"e2e-bound-valid-001"}});
  assert.equal(valid.response.status,201,JSON.stringify(valid.payload));
  assert.equal(valid.payload.purchaseDocumentId,validDocId);
  assert.equal(valid.payload.sessionId,null,"External linked supplier payment was attached to active shift");

  const closed=await request(`/api/cash/sessions/${sessionId}/close`,{method:"POST",token,body:{cashSales:0,cardSales:0,eftposTotal:0,expenses:0,drawer:30,custody:0,coins:0,safe:0,note:"external payment boundary close"}});
  assert.equal(closed.response.status,200,JSON.stringify(closed.payload));
  assert.equal(closed.payload.expenses,0);
  assert.equal(closed.payload.expectedOperational,30);

  before=await transactionCount();
  const afterClose=await request(`/api/transactions/stores/${storeId}`,{method:"POST",token,body:{type:"OTHER_EXPENSE",amount:1,description:"external payment after close",evidenceMode:"NO_DOCUMENT",paymentSource:"EXTERNAL",idempotencyKey:"e2e-bound-after-close-001"}});
  assert.equal(afterClose.response.status,201,JSON.stringify(afterClose.payload));
  assert.equal(afterClose.payload.sessionId,null,"External payment after shift close was attached to a shift");
  assert.equal(await transactionCount(),before+1,"External payment after close was not stored");

  const afterCloseCash=await request(`/api/transactions/stores/${storeId}`,{method:"POST",token,body:{type:"OTHER_EXPENSE",amount:1,description:"cash-shift payment after close",evidenceMode:"NO_DOCUMENT",paymentSource:"CASH_SHIFT",idempotencyKey:"e2e-bound-after-close-cash-001"}});
  assert.equal(afterCloseCash.response.status,409,"CASH_SHIFT payment after shift close was stored");
  assert.equal(await transactionCount(),before+1,"Rejected CASH_SHIFT payment after close left a StoreTransaction");

  console.log("E2E payment validation boundaries passed",{sessionId,validPaymentId:valid.payload.id});
}

try{await main()}finally{await prisma.$disconnect()}
