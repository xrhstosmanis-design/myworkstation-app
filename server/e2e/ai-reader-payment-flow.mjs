import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
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

  // A supplier credit note enters from POS as a reviewable credit document.
  // Approval reverses stock and supplier balance exactly once, without a POS payment.
  const creditNumber="E2E-CREDIT-9946";
  const creditData=`data:image/png;base64,${Buffer.from("printed-credit-note-9946-".repeat(20)).toString("base64")}`;
  const creditUpload=await request("/api/commerce/ai-reader/jobs",{method:"POST",token,body:{storeId,filename:"credit.png",mimeType:"image/png",dataUrl:creditData,localConfidence:95,result:{rawText:"ΠΙΣΤΩΤΙΚΟ ΤΙΜΟΛΟΓΙΟ",lines:[],pageCount:1}}});
  assert.equal(creditUpload.response.status,201,JSON.stringify(creditUpload.payload));
  const creditJobId=creditUpload.payload.id;
  const creditHeader={documentType:"CREDIT_NOTE",supplierId,documentNumber:creditNumber,documentDate:new Date().toISOString().slice(0,10),totalGross:6.04,settlementMode:"CREDIT"};
  const creditDraft=await request(`/api/commerce/ai-reader/jobs/${creditJobId}/pos-draft`,{method:"POST",token,body:creditHeader});
  assert.equal(creditDraft.response.status,201,JSON.stringify(creditDraft.payload));
  const creditLines=await request(`/api/commerce/ai-reader/jobs/${creditJobId}/product-lines`,{method:"PUT",token,body:{source:"V2.4.4",productLines:[
    {description:"E2E AI Product",quantity:2,unitCost:1.74,discount1:10,netAmount:3.13,vatRate:13,grossAmount:3.54,confidence:98},
    {description:"E2E AI Product",quantity:1,unitCost:2.46,discount1:10,netAmount:2.21,vatRate:13,grossAmount:2.50,confidence:98}
  ]}});
  assert.equal(creditLines.response.status,200,JSON.stringify(creditLines.payload));
  const creditIntake=await request(`/api/commerce/ai-reader/jobs/${creditJobId}/pos-intake`,{method:"POST",token,body:creditHeader});
  assert.equal(creditIntake.response.status,201,JSON.stringify(creditIntake.payload));
  assert.equal(await stock(productId),10,"Credit draft moved stock before approval");
  const creditDocs=await prisma.$queryRawUnsafe(`SELECT "documentType","status","paymentTransactionId" FROM "PurchaseDocument" WHERE "id"=$1`,creditDraft.payload.documentId);
  assert.equal(creditDocs[0].documentType,"CREDIT_NOTE");assert.equal(creditDocs[0].status,"DRAFT");assert.equal(creditDocs[0].paymentTransactionId,null);
  const creditPosted=await request(`/api/purchase-orders/${creditIntake.payload.purchaseOrderId}`,{method:"PATCH",token,body:{status:"FINAL"}});
  assert.equal(creditPosted.response.status,200,JSON.stringify(creditPosted.payload));
  assert.equal(creditPosted.payload.documentType,"CREDIT_NOTE");
  assert.equal(await stock(productId),7,"Approved credit should return exactly three pieces");
  const postedAgain=await request(`/api/purchase-orders/${creditIntake.payload.purchaseOrderId}`,{method:"PATCH",token,body:{status:"FINAL"}});
  assert.equal(postedAgain.response.status,200,JSON.stringify(postedAgain.payload));
  assert.equal(await stock(productId),7,"Repeated approval moved credit stock twice");
  const creditLedger=await prisma.$queryRawUnsafe(`SELECT "status","documentType","totalGross" FROM "PurchaseDocument" WHERE "id"=$1`,creditDraft.payload.documentId);
  assert.equal(creditLedger[0].status,"APPROVED");assert.equal(creditLedger[0].documentType,"CREDIT_NOTE");assert.equal(Number(creditLedger[0].totalGross),6.04);
  const supplierLedger=await request(`/api/supplier-control/${supplierId}/ledger`,{token});
  assert.equal(supplierLedger.response.status,200,JSON.stringify(supplierLedger.payload));
  assert.ok(supplierLedger.payload.rows.some(row=>row.type==="CREDIT_NOTE"&&row.ref===creditNumber&&Number(row.amount)===-6.04),"Supplier balance did not subtract the credit");
  const creditPayment=await prisma.$queryRawUnsafe(`SELECT COUNT(*)::int AS count FROM "StoreTransaction" WHERE "companyId"=$1 AND "invoiceDocumentNumber"=$2`,companyId,creditNumber);
  assert.equal(creditPayment[0].count,0);

  // Delete/reread a paid draft through the real POS/BackOffice HTTP endpoints.
  // This fixture uses only the isolated CI database and no external AI calls.
  const invoiceNumber="E2E-REREAD-2612188";
  const sourceData=`data:image/png;base64,${Buffer.from("reread-invoice-source-".repeat(20)).toString("base64")}`;
  const original=await request(`/api/transactions/stores/${storeId}`,{method:"POST",token,body:{type:"SUPPLIER_PAYMENT",amount:12.4,supplierId,invoiceDocumentNumber:invoiceNumber,description:`Τιμολόγιο ${invoiceNumber} — αρχική πληρωμή`,evidenceMode:"NO_DOCUMENT",paymentSource:"EXTERNAL",idempotencyKey:"e2e-reread-original-payment",attachment:{dataUrl:sourceData,filename:"reread.png"}}});
  assert.equal(original.response.status,201,JSON.stringify(original.payload));
  const originalPaymentId=original.payload.id;
  const paymentSnapshot=async()=>(await prisma.$queryRawUnsafe(`SELECT "id","amount","actorId","actorName","sessionId","occurredAt","subtractFromShift","paymentMethod","reversedAt" FROM "StoreTransaction" WHERE "id"=$1`,originalPaymentId))[0];
  const before=await paymentSnapshot();
  const upload=async(uploadToken=token)=>{
    const uploaded=await request("/api/commerce/ai-reader/jobs",{method:"POST",token:uploadToken,body:{storeId,filename:"reread.png",mimeType:"image/png",dataUrl:sourceData,localConfidence:95,result:{rawText:"printed test source",lines:[],pageCount:1}}});
    assert.equal(uploaded.response.status,201,JSON.stringify(uploaded.payload));
    const jobId=uploaded.payload.id;
    const finalized=await request(`/api/commerce/ai-reader/jobs/${jobId}/product-lines`,{method:"PUT",token:uploadToken,body:{source:"V2.4.4",productLines:[{description:"E2E AI Product",quantity:10,unitCost:1,retailPrice:2,netAmount:10,vatRate:24,grossAmount:12.4,confidence:95}]}});
    assert.equal(finalized.response.status,200,JSON.stringify(finalized.payload));
    return jobId;
  };
  const intakeBody={supplierId,documentNumber:invoiceNumber,documentDate:new Date().toISOString().slice(0,10),totalGross:12.4,settlementMode:"CREDIT"};
  const firstJob=await upload();
  const firstIntake=await request(`/api/commerce/ai-reader/jobs/${firstJob}/pos-intake`,{method:"POST",token,body:intakeBody});
  assert.equal(firstIntake.response.status,201,JSON.stringify(firstIntake.payload));
  const paidDocs=await prisma.$queryRawUnsafe(`SELECT "id","purchaseOrderId","settlementMode","paymentTransactionId" FROM "PurchaseDocument" WHERE "companyId"=$1 AND "documentNumber"=$2`,companyId,invoiceNumber);
  assert.equal(paidDocs.length,1);assert.equal(paidDocs[0].paymentTransactionId,originalPaymentId);assert.equal(paidDocs[0].settlementMode,"PAID");
  const duplicateBody={storeId,supplierId,documentNumber:invoiceNumber,totalGross:12.4,dataUrl:sourceData};
  const blocked=await request("/api/commerce/ai-reader/fast-duplicate-check",{method:"POST",token,body:duplicateBody});
  assert.equal(blocked.response.status,409,"An existing invoice must still block duplicate input");
  await prisma.$executeRawUnsafe(`UPDATE "PurchaseOrder" SET "sourceDocumentId"=NULL WHERE "id"=$1`,paidDocs[0].purchaseOrderId);
  const deleted=await request(`/api/purchase-orders/${paidDocs[0].purchaseOrderId}`,{method:"DELETE",token});
  assert.equal(deleted.response.status,200,JSON.stringify(deleted.payload));
  assert.equal(deleted.payload.paymentPreserved,true);
  assert.deepEqual(await paymentSnapshot(),before,"Deleting the draft must preserve all financial facts");
  const sources=await prisma.$queryRawUnsafe(`SELECT "id" FROM "DocumentAttachment" WHERE "companyId"=$1 AND "contentData"=$2`,companyId,sourceData);
  assert.equal(sources.length,0,"Deleted invoice source photo remained archived");
  const oldJobs=await prisma.$queryRawUnsafe(`SELECT "id" FROM "AiReaderJob" WHERE "id"=$1`,firstJob);
  assert.equal(oldJobs.length,0,"Deleted reading job would reuse stale extraction");
  const preserved=await prisma.$queryRawUnsafe(`SELECT "attachmentData","attachmentFilename" FROM "StoreTransaction" WHERE "id"=$1`,originalPaymentId);
  assert.equal(preserved[0].attachmentData,null);assert.equal(preserved[0].attachmentFilename,null);
  await prisma.user.create({data:{email:"ci-reread-second@myworkstation.test",fullName:"Different reread user",passwordHash:await bcrypt.hash(ownerPassword,4),mustChangePassword:false,role:"OWNER",companyId}});
  const secondLogin=await request("/api/auth/login",{method:"POST",body:{email:"ci-reread-second@myworkstation.test",password:ownerPassword,deviceName:"CI second invoice user"}});
  assert.equal(secondLogin.response.status,200,JSON.stringify(secondLogin.payload));
  const secondToken=secondLogin.payload.token;
  const reusable=await request("/api/commerce/ai-reader/fast-duplicate-check",{method:"POST",token:secondToken,body:duplicateBody});
  assert.equal(reusable.response.status,200,JSON.stringify(reusable.payload));
  assert.equal(reusable.payload.paymentTransactionId,originalPaymentId);assert.equal(reusable.payload.paymentReused,true);
  const wrongAmount=await request("/api/commerce/ai-reader/fast-duplicate-check",{method:"POST",token,body:{...duplicateBody,totalGross:13.4}});
  assert.equal(wrongAmount.response.status,409,"A different amount cannot reuse the payment");
  // Historical duplicate payments, legacy invoice descriptions and supplier alias:
  // prefer the row holding the canonical key; never rewrite financial facts.
  const aliasId=crypto.randomUUID();
  await prisma.$executeRawUnsafe(`INSERT INTO "Supplier" ("id","companyId","name","taxId","active") VALUES ($1,$2,'E2E legacy supplier alias','E2E AI 001',true)`,aliasId,companyId);
  const oldDuplicateId=crypto.randomUUID();
  await prisma.$executeRawUnsafe(`INSERT INTO "StoreTransaction" ("id","companyId","storeId","type","supplierId","amount","description","actorId","actorName","occurredAt") VALUES ($1,$2,$3,'SUPPLIER_PAYMENT',$4,12.4,$5,$6,'Legacy operator',NOW()-INTERVAL '1 day')`,oldDuplicateId,companyId,storeId,aliasId,`Τιμολόγιο ${invoiceNumber} — Γρήγορη καταχώριση POS`,owner.id);
  await prisma.$executeRawUnsafe(`UPDATE "StoreTransaction" SET "supplierId"=$2,"invoiceDocumentNumber"=NULL WHERE "id"=$1`,originalPaymentId,aliasId);
  const aliasCheck=await request("/api/commerce/ai-reader/fast-duplicate-check",{method:"POST",token:secondToken,body:duplicateBody});
  assert.equal(aliasCheck.response.status,200,JSON.stringify(aliasCheck.payload));
  assert.equal(aliasCheck.payload.paymentTransactionId,originalPaymentId,"Must keep the existing canonical payment despite an older historical duplicate");
  // Dangling jobs from older deletions must not block the same photo.
  const staleAttachment=crypto.randomUUID(),staleJob=crypto.randomUUID(),deletedDocument=crypto.randomUUID();
  const sourceChecksum=crypto.createHash("sha256").update(Buffer.from(sourceData.split(",")[1],"base64")).digest("hex");
  await prisma.$executeRawUnsafe(`INSERT INTO "DocumentAttachment" ("id","companyId","storeId","documentType","filename","mimeType","storageKey","checksum","contentData") VALUES ($1,$2,$3,'AI_READER_SOURCE','reread.png','image/png',$4,$5,$6)`,staleAttachment,companyId,storeId,`DATABASE:${sourceChecksum}`,sourceChecksum,sourceData);
  await prisma.$executeRawUnsafe(`INSERT INTO "PurchaseDocument" ("id","companyId","storeId","supplierId","documentNumber") VALUES ($1,$2,$3,$4,$5)`,deletedDocument,companyId,storeId,supplierId,invoiceNumber);
  await prisma.$executeRawUnsafe(`INSERT INTO "AiReaderJob" ("id","companyId","storeId","attachmentId","stage","status","purchaseDocumentId","resultJson") VALUES ($1,$2,$3,$4,'LOCAL','AWAITING_APPROVAL',$5,'{}'::jsonb)`,staleJob,companyId,storeId,staleAttachment,deletedDocument);
  await prisma.$executeRawUnsafe(`DELETE FROM "PurchaseDocument" WHERE "id"=$1`,deletedDocument);
  const staleCheck=await request("/api/commerce/ai-reader/fast-duplicate-check",{method:"POST",token:secondToken,body:duplicateBody});
  assert.equal(staleCheck.response.status,200,JSON.stringify(staleCheck.payload));
  assert.equal(staleCheck.payload.paymentTransactionId,originalPaymentId);
  const handedOff=await request("/api/commerce/ai-reader/fast-handoff",{method:"POST",token:secondToken,body:{...intakeBody,documentType:"INVOICE",storeId,paymentTransactionId:originalPaymentId,pages:[{filename:"reread.png",mimeType:"image/png",dataUrl:sourceData}]}});
  assert.equal(handedOff.response.status,202,JSON.stringify(handedOff.payload));
  const secondJob=handedOff.payload.jobId;
  assert.notEqual(secondJob,firstJob);assert.notEqual(secondJob,staleJob,"Handoff reused a deleted invoice's extraction");
  // CI has no external AI credentials. The payment and durable draft remain,
  // while the assistant read finishes with an explicit review status.
  let workerStatus;
  for(let attempt=0;attempt<100;attempt++){
    workerStatus=await request(`/api/commerce/ai-reader/fast-status/${secondJob}`,{token:secondToken});
    if(workerStatus.payload.draftReady&&workerStatus.payload.stage==='POS_BACKGROUND_COMPLETE')break;
    await new Promise(resolve=>setTimeout(resolve,50));
  }
  assert.equal(workerStatus.payload.failed,true,JSON.stringify(workerStatus.payload));
  assert.equal(workerStatus.payload.reviewRequired,true,JSON.stringify(workerStatus.payload));
  assert.equal(workerStatus.payload.done,false,JSON.stringify(workerStatus.payload));
  assert.equal(workerStatus.payload.draftReady,true,JSON.stringify(workerStatus.payload));
  assert.equal(workerStatus.payload.status,'AWAITING_APPROVAL',JSON.stringify(workerStatus.payload));
  assert.equal(workerStatus.payload.stage,'POS_BACKGROUND_COMPLETE',JSON.stringify(workerStatus.payload));
  const preservedDraft=await prisma.$queryRawUnsafe(`SELECT "id","status" FROM "PurchaseDocument" WHERE "id"=$1 AND "companyId"=$2 LIMIT 1`,workerStatus.payload.purchaseDocumentId,companyId);
  assert.equal(preservedDraft.length,1,"Background failure removed the durable BackOffice draft");
  assert.deepEqual(await paymentSnapshot(),before,"Rereading must not reassign payment to a new shift or change amounts");
  const paymentCount=await prisma.$queryRawUnsafe(`SELECT COUNT(*)::int AS count FROM "StoreTransaction" WHERE "companyId"=$1 AND "invoiceDocumentNumber"=$2`,companyId,invoiceNumber);
  assert.equal(paymentCount[0].count,1,"Reread charged the invoice again");
  const historicalCount=await prisma.$queryRawUnsafe(`SELECT COUNT(*)::int AS count FROM "StoreTransaction" WHERE "id" IN ($1,$2)`,originalPaymentId,oldDuplicateId);
  assert.equal(historicalCount[0].count,2,"Historical financial records must remain untouched");
  const canonical=await prisma.$queryRawUnsafe(`SELECT "supplierId" FROM "StoreTransaction" WHERE "id"=$1`,originalPaymentId);
  assert.equal(canonical[0].supplierId,aliasId,"Reread must not reassign the original payment supplier");
  assert.equal(await stock(productId),7,"Draft reread changed stock after the supplier credit");
  const raceNumber="E2E-REREAD-RACE";
  const race=await Promise.all([token,secondToken].map((raceToken,index)=>request(`/api/transactions/stores/${storeId}`,{method:"POST",token:raceToken,body:{type:"SUPPLIER_PAYMENT",amount:3,supplierId,invoiceDocumentNumber:raceNumber,description:`Τιμολόγιο ${raceNumber} — concurrency test`,evidenceMode:"NO_DOCUMENT",paymentSource:"EXTERNAL",idempotencyKey:`e2e-reread-race-${index}`}})));
  assert.deepEqual(race.map(result=>result.response.status).sort(),[201,409],JSON.stringify(race.map(result=>result.payload)));
  const raceCount=await prisma.$queryRawUnsafe(`SELECT COUNT(*)::int AS count FROM "StoreTransaction" WHERE "companyId"=$1 AND "invoiceDocumentNumber"=$2`,companyId,raceNumber);
  assert.equal(raceCount[0].count,1,"Concurrent operators created duplicate invoice payments");


  const close=await request(`/api/cash/sessions/${sessionId}/close`,{method:"POST",token,body:{cashSales:0,cardSales:0,eftposTotal:0,expenses:0,drawer:50,custody:0,coins:0,safe:0,note:"external payment does not reduce shift"}});
  assert.equal(close.response.status,200,JSON.stringify(close.payload));
  assert.equal(close.payload.expenses,0);
  assert.equal(close.payload.expectedOperational,50);
  assert.equal(close.payload.actualOperational,50);
  assert.equal(close.payload.variance,0);

  console.log("E2E AI Reader / supplier payment flow passed",{documentId,paymentId:payment.payload.id,stock:await stock(productId)});
}

try{await main()}finally{await prisma.$disconnect()}
