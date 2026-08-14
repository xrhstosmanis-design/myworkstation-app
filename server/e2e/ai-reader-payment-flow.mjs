import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import {PrismaClient} from "@prisma/client";

const prisma=new PrismaClient();
const baseUrl=process.env.E2E_BASE_URL||"http://127.0.0.1:8080";
const companyId="pilot-company";
const storeId="kat-store";
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

async function stock(productId){
  const rows=await prisma.$queryRawUnsafe(`SELECT COALESCE("currentStock",0) AS stock FROM "StoreProduct" WHERE "storeId"=$1 AND "productId"=$2 LIMIT 1`,storeId,productId);
  return Number(rows[0]?.stock||0);
}
async function movementCount(documentId){
  const rows=await prisma.$queryRawUnsafe(`SELECT COUNT(*)::int AS count FROM "StockMovement" WHERE "sourceType"='PURCHASE_APPROVAL' AND "sourceId"=$1`,documentId);
  return Number(rows[0]?.count||0);
}

async function main(){
  await prisma.company.update({where:{id:companyId},data:{active:true,licenseStatus:"ACTIVE",subscriptionEndsAt:new Date(Date.now()+7*24*60*60*1000)}});
  for(const moduleKey of ["CASH_CONTROL","INVENTORY","AI_READER"]){
    await prisma.companyModule.upsert({where:{companyId_moduleKey:{companyId,moduleKey}},update:{active:true,startsAt:null,endsAt:null},create:{companyId,moduleKey,active:true}});
  }
  await prisma.store.update({where:{id:storeId},data:{active:true,cashCloseEmailEnabled:false}});
  const owner=await prisma.user.update({where:{email:ownerEmail},data:{passwordHash:await bcrypt.hash(ownerPassword,4),mustChangePassword:false,role:"OWNER",companyId}});

  const login=await request("/api/auth/login",{method:"POST",body:{email:ownerEmail,password:ownerPassword,deviceName:"CI AI Reader E2E"}});
  assert.equal(login.response.status,200,JSON.stringify(login.payload));
  const token=login.payload?.token;
  assert.ok(token);

  const supplier=await request("/api/commerce/suppliers",{method:"POST",token,body:{name:"E2E Supplier",taxId:"E2E-AI-001"}});
  assert.equal(supplier.response.status,201,JSON.stringify(supplier.payload));
  const supplierId=supplier.payload.id;

  const product=await request("/api/commerce/products",{method:"POST",token,body:{name:"E2E AI Product",sku:"E2E-AI-PRODUCT",unit:"PIECE",vatRate:24,salePrice:2,costPrice:1,trackStock:true,storeId,openingStock:0}});
  assert.equal(product.response.status,201,JSON.stringify(product.payload));
  const productId=product.payload.id;
  assert.equal(await stock(productId),0);

  const aiJobId="e2e-ai-reader-job-0001";
  await prisma.$executeRawUnsafe(`INSERT INTO "AiReaderJob" ("id","companyId","storeId","stage","status","localConfidence","resultJson","requestedByUserId") VALUES ($1,$2,$3,'LOCAL','PENDING',92.5,'{}'::jsonb,$4)`,aiJobId,companyId,storeId,owner.id);

  const draft=await request(`/api/commerce/ai-reader/jobs/${aiJobId}/confirm`,{
    method:"POST",token,
    body:{supplierId,documentNumber:"E2E-INV-001",documentDate:new Date().toISOString(),lines:[{productId,description:"E2E AI Product",quantity:10,unit:"PIECE",unitsPerPackage:1,unitCost:1,vatRate:24}]}
  });
  assert.equal(draft.response.status,201,JSON.stringify(draft.payload));
  assert.equal(draft.payload.status,"DRAFT");
  assert.equal(draft.payload.stockUpdated,false);
  assert.equal(draft.payload.awaitingApproval,true);
  const documentId=draft.payload.id;
  assert.ok(documentId);
  assert.equal(await stock(productId),0,"DRAFT confirmation changed stock before approval");
  assert.equal(await movementCount(documentId),0,"DRAFT confirmation created stock movement before approval");

  const opened=await request(`/api/cash/stores/${storeId}/sessions/open`,{method:"POST",token,body:{shiftLabel:"E2E AI payment",drawer:50,custody:0,coins:0,safe:0,note:"document payment flow"}});
  assert.equal(opened.response.status,201,JSON.stringify(opened.payload));
  const sessionId=opened.payload.id;

  const payment=await request(`/api/transactions/stores/${storeId}`,{
    method:"POST",token,
    body:{type:"SUPPLIER_PAYMENT",amount:12.4,description:"E2E linked invoice payment",supplierId,evidenceMode:"DOCUMENT",purchaseDocumentId:documentId,paymentSource:"EXTERNAL",idempotencyKey:"e2e-ai-document-payment-0001"}
  });
  assert.equal(payment.response.status,201,JSON.stringify(payment.payload));
  assert.equal(payment.payload.purchaseDocumentId,documentId);
  assert.equal(payment.payload.evidenceMode,"DOCUMENT");
  assert.equal(payment.payload.paymentSource,"EXTERNAL");
  assert.equal(payment.payload.sessionId,null,"External BackOffice payment must not belong to the employee cash shift");
  assert.equal(await stock(productId),0,"Payment linked to DRAFT changed inventory");

  const overview=await request(`/api/transactions/stores/${storeId}/overview`,{token});
  assert.equal(overview.response.status,200,JSON.stringify(overview.payload));
  assert.equal(overview.payload.openSession?.id,sessionId);
  assert.equal(Number(overview.payload.summary?.expensesTotal||0),0,"External BackOffice payment changed active-shift cash expenses");
  const documentChoice=(overview.payload.purchaseDocuments||[]).find(row=>row.id===documentId);
  assert.ok(documentChoice,"DRAFT PurchaseDocument is not exposed to existing payment UI overview");
  assert.equal(documentChoice.status,"DRAFT");

  const from=new Date(Date.now()-24*60*60*1000).toISOString();
  const to=new Date(Date.now()+24*60*60*1000).toISOString();
  const report=await request(`/api/owner-payments/report?storeId=${storeId}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,{token});
  assert.equal(report.response.status,200,JSON.stringify(report.payload));
  const reportMovement=(report.payload.movements||[]).find(row=>row.id===payment.payload.id);
  assert.ok(reportMovement,"Linked supplier payment missing from BackOffice report");
  assert.equal(reportMovement.purchaseDocumentId,documentId);
  assert.equal(reportMovement.evidenceMode,"DOCUMENT");
  assert.equal(reportMovement.paymentSource,"EXTERNAL");

  const approved=await request(`/api/commerce/purchases/${documentId}/approve`,{method:"POST",token,body:{}});
  assert.equal(approved.response.status,200,JSON.stringify(approved.payload));
  assert.equal(approved.payload.status,"APPROVED");
  assert.equal(approved.payload.stockUpdated,true);
  assert.equal(await stock(productId),10);
  assert.equal(await movementCount(documentId),1);

  const approveAgain=await request(`/api/commerce/purchases/${documentId}/approve`,{method:"POST",token,body:{}});
  assert.equal(approveAgain.response.status,200,JSON.stringify(approveAgain.payload));
  assert.equal(approveAgain.payload.alreadyApproved,true);
  assert.equal(await stock(productId),10,"Second approval changed stock again");
  assert.equal(await movementCount(documentId),1,"Second approval created duplicate stock movement");

  const close=await request(`/api/cash/sessions/${sessionId}/close`,{method:"POST",token,body:{cashSales:0,cardSales:0,eftposTotal:0,expenses:0,drawer:50,custody:0,coins:0,safe:0,note:"external payment does not reduce shift"}});
  assert.equal(close.response.status,200,JSON.stringify(close.payload));
  assert.equal(close.payload.expenses,0);
  assert.equal(close.payload.expectedOperational,50);
  assert.equal(close.payload.actualOperational,50);
  assert.equal(close.payload.variance,0);

  console.log("E2E AI Reader / supplier payment flow passed",{documentId,paymentId:payment.payload.id,stock:await stock(productId)});
}

try{await main()}finally{await prisma.$disconnect()}
