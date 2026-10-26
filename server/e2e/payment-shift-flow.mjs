import {withShiftCloseCardFixture} from "./helpers/shift-close-card-fixture.mjs";
import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import {createHash} from "node:crypto";
import {PrismaClient} from "@prisma/client";

const prisma=new PrismaClient();
const baseUrl=process.env.E2E_BASE_URL||"http://127.0.0.1:8080";
const companyId="pilot-company";
const storeId="kat-store";
const ownerEmail=process.env.KAT_OWNER_EMAIL||"ci-kat-owner@myworkstation.test";
const ownerPassword="ci-owner-e2e-password";

async function request(path,{method="GET",token,body}={}){
  body=await withShiftCloseCardFixture(prisma,baseUrl,path,token,body);
  const response=await fetch(`${baseUrl}${path}`,{
    method,
    headers:{
      ...(token?{authorization:`Bearer ${token}`}:{ }),
      ...(body!==undefined?{"content-type":"application/json"}:{})
    },
    body:body===undefined?undefined:JSON.stringify(body)
  });
  let payload=null;
  try{payload=await response.json()}catch{}
  return {response,payload};
}

async function main(){
  await prisma.company.update({
    where:{id:companyId},
    data:{active:true,licenseStatus:"ACTIVE",subscriptionEndsAt:new Date(Date.now()+7*24*60*60*1000)}
  });
  await prisma.companyModule.upsert({
    where:{companyId_moduleKey:{companyId,moduleKey:"CASH_CONTROL"}},
    update:{active:true,startsAt:null,endsAt:null},
    create:{companyId,moduleKey:"CASH_CONTROL",active:true}
  });
  await prisma.store.update({where:{id:storeId},data:{active:true,cashCloseEmailEnabled:false}});
  await prisma.user.update({
    where:{email:ownerEmail},
    data:{passwordHash:await bcrypt.hash(ownerPassword,4),mustChangePassword:false,role:"OWNER",companyId}
  });

  const login=await request("/api/auth/login",{
    method:"POST",
    body:{email:ownerEmail,password:ownerPassword,deviceName:"CI E2E"}
  });
  assert.equal(login.response.status,200,JSON.stringify(login.payload));
  assert.ok(login.payload?.token,"BackOffice login did not return a token");
  const token=login.payload.token;

  const opened=await request(`/api/cash/stores/${storeId}/sessions/open`,{
    method:"POST",token,
    body:{shiftLabel:"E2E Βάρδια",drawer:100,custody:20,coins:5,safe:50,note:"isolated CI flow"}
  });
  assert.equal(opened.response.status,201,JSON.stringify(opened.payload));
  assert.equal(opened.payload.openingOperational,125);
  const sessionId=opened.payload.id;
  assert.ok(sessionId);

  const paymentBody={
    type:"OTHER_EXPENSE",
    amount:25,
    description:"E2E έξοδο χωρίς παραστατικό",
    evidenceMode:"NO_DOCUMENT",
    paymentSource:"CASH_SHIFT",
    idempotencyKey:"e2e-no-document-expense-0001"
  };
  const payment=await request(`/api/transactions/stores/${storeId}`,{method:"POST",token,body:paymentBody});
  assert.equal(payment.response.status,201,JSON.stringify(payment.payload));
  assert.equal(payment.payload.amount,25);
  assert.equal(payment.payload.paymentSource,"CASH_SHIFT");
  assert.equal(payment.payload.evidenceMode,"NO_DOCUMENT");
  assert.equal(payment.payload.sessionId,sessionId);

  const duplicate=await request(`/api/transactions/stores/${storeId}`,{method:"POST",token,body:paymentBody});
  assert.equal(duplicate.response.status,409,"Duplicate payment was not rejected");

  const ledger=await request(`/api/transactions/stores/${storeId}/overview`,{token});
  assert.equal(ledger.response.status,200,JSON.stringify(ledger.payload));
  assert.equal(ledger.payload.openSession?.id,sessionId);
  assert.equal(ledger.payload.summary?.expensesTotal,25);
  assert.equal(ledger.payload.summary?.recordedExpensesTotal,25);

  const from=new Date(Date.now()-24*60*60*1000).toISOString();
  const to=new Date(Date.now()+24*60*60*1000).toISOString();
  const report=await request(`/api/owner-payments/report?storeId=${storeId}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,{token});
  assert.equal(report.response.status,200,JSON.stringify(report.payload));
  const movement=(report.payload.movements||[]).find(row=>row.id===payment.payload.id);
  assert.ok(movement,"Payment is missing from BackOffice Owner Payments report");
  assert.equal(movement.sessionId,sessionId);
  assert.equal(movement.paymentSource,"CASH_SHIFT");
  assert.equal(movement.evidenceMode,"NO_DOCUMENT");

  const closed=await request(`/api/cash/sessions/${sessionId}/close`,{
    method:"POST",token,
    body:{
      cashSales:9999,
      cardSales:9999,
      eftposTotal:0,
      expenses:9999,
      drawer:75,
      custody:20,
      coins:5,
      safe:50,
      note:"E2E authoritative close"
    }
  });
  assert.equal(closed.response.status,200,JSON.stringify(closed.payload));
  assert.equal(closed.payload.expenses,25,"Close trusted client expenses instead of StoreTransaction ledger");
  assert.equal(closed.payload.cashSales,0,"Close trusted client cashSales instead of StoreTransaction ledger");
  assert.equal(closed.payload.expectedOperational,100);
  assert.equal(closed.payload.actualOperational,100);
  assert.equal(closed.payload.variance,0);
  assert.equal(closed.payload.nextOpeningTotal,100);

  const afterClose=await request(`/api/cash/stores/${storeId}/overview`,{token});
  assert.equal(afterClose.response.status,200,JSON.stringify(afterClose.payload));
  assert.equal(afterClose.payload.openSession,null);
  assert.equal(afterClose.payload.suggestedOpening?.operational,100);

  // Separate positive plain-invoice flow. Keep every original 25/100
  // authoritative-close assertion above; do not initialize an AI intake schema.
  const aiKey={companyId,moduleKey:"AI_READER"},originalAiModule=await prisma.companyModule.findUnique({where:{companyId_moduleKey:aiKey}});
  await prisma.companyModule.upsert({where:{companyId_moduleKey:aiKey},update:{active:false},create:{...aiKey,active:false}});
  try{
    const schemaState=async()=>({columns:(await prisma.$queryRaw`SELECT a.attname AS name FROM pg_attribute a WHERE a.attrelid=to_regclass(format('%I.%I',current_schema(),'PurchaseDocument')) AND a.attname=ANY(ARRAY['purchaseOrderId','paymentTransactionId','settlementMode']) AND a.attnum>0 AND NOT a.attisdropped ORDER BY a.attname`).map(row=>row.name),task:(await prisma.$queryRaw`SELECT to_regclass(format('%I.%I',current_schema(),'PosInvoiceBackgroundTask'))::text AS name`)[0].name});
    const optionalBefore=await schemaState();assert.ok(!optionalBefore.columns.includes("purchaseOrderId"));assert.ok(!optionalBefore.columns.includes("paymentTransactionId"));
    const workCounts=async()=>prisma.$queryRaw`SELECT (SELECT COUNT(*)::int FROM "AiReaderJob" WHERE "companyId"=${companyId} AND "storeId"=${storeId}) AS jobs,(SELECT COUNT(*)::int FROM "PurchaseDocument" WHERE "companyId"=${companyId} AND "storeId"=${storeId}) AS drafts`;
    const workBefore=await workCounts(),supplierId="e2e-plain-supplier";
    await prisma.$executeRaw`INSERT INTO "Supplier"("id","companyId","name","active") VALUES(${supplierId},${companyId},'Synthetic E2E plain supplier',TRUE)`;
    const plainOpened=await request(`/api/cash/stores/${storeId}/sessions/open`,{method:"POST",token,body:{shiftLabel:"E2E Plain",drawer:100,custody:0,coins:0,safe:50,note:"isolated plain invoice flow"}});assert.equal(plainOpened.response.status,201,JSON.stringify(plainOpened.payload));assert.equal(plainOpened.payload.openingOperational,100);const plainSessionId=plainOpened.payload.id;assert.notEqual(plainSessionId,sessionId);
    const documentDate=new Date().toISOString().slice(0,10),plainBody={type:"SUPPLIER_PAYMENT",supplierId,invoiceDocumentNumber:" e2e - plain - 1 ",amount:10,evidenceMode:"NO_DOCUMENT",paymentSource:"CASH_SHIFT",paymentMethod:"CASH_SHIFT",idempotencyKey:"e2e-deferred-plain-payment-0001",deferredInvoice:{documentDate,sessionId:plainSessionId}};
    const plainPayment=await request(`/api/transactions/stores/${storeId}`,{method:"POST",token,body:plainBody});assert.equal(plainPayment.response.status,201,JSON.stringify(plainPayment.payload));const plainId=plainPayment.payload.pendingInvoiceId;assert.equal(plainId,plainPayment.payload.id);assert.equal(plainPayment.payload.invoiceDocumentNumber,"E2E-PLAIN-1");assert.equal(plainPayment.payload.sessionId,plainSessionId);
    const paymentReplay=await request(`/api/transactions/stores/${storeId}`,{method:"POST",token,body:plainBody});assert.equal(paymentReplay.response.status,200);assert.equal(paymentReplay.payload.pendingInvoiceId,plainId);assert.equal(paymentReplay.payload.duplicate,true);
    const pending=await request(`/api/transactions/stores/${storeId}/pending-invoices`,{token});assert.equal(pending.response.status,200,JSON.stringify(pending.payload));assert.equal(pending.payload.count,1);const original=pending.payload.rows[0];assert.equal(original.id,plainId);assert.equal(original.status,"AWAITING_INVOICE");assert.equal(original.amount,10);
    const overview=await request(`/api/cash/stores/${storeId}/overview`,{token});assert.equal(overview.response.status,200,JSON.stringify(overview.payload));assert.equal(overview.payload.pendingInvoices.count,1);assert.equal(overview.payload.pendingInvoices.missingCount,1);
    const moneySnapshot=async()=>prisma.$queryRaw`SELECT "id","sessionId","type","amount","subtractFromShift","paymentMethod","actorId","invoiceDocumentNumber","invoicePaymentKey","reversedAt" FROM "StoreTransaction" WHERE "companyId"=${companyId} AND "storeId"=${storeId} ORDER BY "id"`,shiftSnapshot=async()=>prisma.$queryRaw`SELECT * FROM "CashShiftSession" WHERE "companyId"=${companyId} AND "storeId"=${storeId} ORDER BY "id"`;
    const moneyBeforeClose=await moneySnapshot(),shiftsBeforeClose=await shiftSnapshot(),plainCloseBody={cashSales:9999,cardSales:9999,eftposTotal:0,expenses:9999,drawer:90,custody:0,coins:0,safe:50,note:"E2E pending acknowledged"};
    const missing=await request(`/api/cash/sessions/${plainSessionId}/close`,{method:"POST",token,body:plainCloseBody});assert.equal(missing.response.status,409,JSON.stringify(missing.payload));assert.equal(missing.payload.code,"MISSING_INVOICES_CONFIRMATION_REQUIRED");assert.deepEqual(await moneySnapshot(),moneyBeforeClose);assert.deepEqual(await shiftSnapshot(),shiftsBeforeClose);
    const plainClosed=await request(`/api/cash/sessions/${plainSessionId}/close`,{method:"POST",token,body:{...plainCloseBody,pendingInvoiceAcknowledged:true,pendingInvoiceFingerprint:overview.payload.pendingInvoices.fingerprint}});assert.equal(plainClosed.response.status,200,JSON.stringify(plainClosed.payload));assert.equal(plainClosed.payload.expenses,10);assert.equal(plainClosed.payload.cashSales,0);assert.equal(plainClosed.payload.expectedOperational,90);assert.equal(plainClosed.payload.actualOperational,90);assert.equal(plainClosed.payload.variance,0);
    assert.deepEqual(await moneySnapshot(),moneyBeforeClose);assert.deepEqual((await shiftSnapshot()).filter(row=>row.id!==plainSessionId),shiftsBeforeClose.filter(row=>row.id!==plainSessionId),"Original closed shift/control rows changed during the separate close");
    const stillPending=await request(`/api/transactions/stores/${storeId}/pending-invoices`,{token});assert.equal(stillPending.response.status,200);assert.equal(stillPending.payload.count,1,"ACK cannot resolve missing original content");
    const bytes=Buffer.from('%PDF-1.4\n'+'Synthetic E2E original E2E-PLAIN-1\n'.repeat(8)+'%%EOF'),attachment={filename:"e2e-plain-original.pdf",mimeType:"application/pdf",dataUrl:'data:application/pdf;base64,'+bytes.toString('base64')},captureBody={sourceKind:"PLAIN_CAPTURE",supplierId,documentNumber:original.documentNumber,documentDate,totalGross:10,documentType:"INVOICE",settlementMode:"PAID",paymentTransactionId:plainId,expectedPendingInvoice:{id:plainId,fingerprint:original.fingerprint},attachment};
    const moneyBeforeCapture=await moneySnapshot(),shiftsBeforeCapture=await shiftSnapshot(),capturePath=`/api/transactions/stores/${storeId}/pending-invoices/${plainId}/attachment`;
    const capture=await request(capturePath,{method:"POST",token,body:captureBody});assert.equal(capture.response.status,201,JSON.stringify(capture.payload));assert.equal(capture.payload.sourceKind,"PLAIN_CAPTURE");assert.equal(capture.payload.paymentTransactionId,plainId);assert.equal(capture.payload.attachmentId,plainId);assert.equal(capture.payload.checksum,createHash('sha256').update(bytes).digest('hex'));assert.equal(capture.payload.jobId,undefined);assert.equal(capture.payload.purchaseDocumentId,undefined);
    const captureReplay=await request(capturePath,{method:"POST",token,body:captureBody});assert.equal(captureReplay.response.status,200,JSON.stringify(captureReplay.payload));assert.equal(captureReplay.payload.proofId,capture.payload.proofId);assert.equal(captureReplay.payload.checksum,capture.payload.checksum);
    const resolved=await request(`/api/transactions/stores/${storeId}/pending-invoices`,{token});assert.equal(resolved.response.status,200);assert.equal(resolved.payload.count,0);const closedOverview=await request(`/api/cash/stores/${storeId}/overview`,{token});assert.equal(closedOverview.response.status,200,JSON.stringify(closedOverview.payload));assert.equal(closedOverview.payload.openSession,null);
    assert.deepEqual(await moneySnapshot(),moneyBeforeCapture);assert.deepEqual(await shiftSnapshot(),shiftsBeforeCapture);assert.deepEqual(await workCounts(),workBefore);assert.deepEqual(await schemaState(),optionalBefore);assert.equal((await prisma.companyModule.findUnique({where:{companyId_moduleKey:aiKey}})).active,false);
    const stored=(await prisma.$queryRaw`SELECT "attachmentData","attachmentChecksum" FROM "StoreTransaction" WHERE "id"=${plainId} AND "companyId"=${companyId}`)[0];assert.equal(stored.attachmentData,attachment.dataUrl);assert.equal(stored.attachmentChecksum,capture.payload.checksum);
    assert.equal((await prisma.$queryRaw`SELECT COUNT(*)::int AS n FROM "StoreOperatorAudit" WHERE "companyId"=${companyId} AND "storeId"=${storeId} AND "eventType"='SHIFT_CLOSED_WITH_PENDING_INVOICES' AND "details"->>'sessionId'=${plainSessionId}`)[0].n,1);
    console.log("E2E plain invoice without AI intake passed",{sessionId:plainSessionId,paymentId:plainId,proofId:capture.payload.proofId});
  }finally{
    if(originalAiModule)await prisma.companyModule.update({where:{companyId_moduleKey:aiKey},data:{active:originalAiModule.active,startsAt:originalAiModule.startsAt,endsAt:originalAiModule.endsAt}});else await prisma.companyModule.delete({where:{companyId_moduleKey:aiKey}});
  }

  console.log("E2E payment/shift/BackOffice flow passed",{
    sessionId,
    paymentId:payment.payload.id,
    expectedOperational:closed.payload.expectedOperational,
    variance:closed.payload.variance
  });
}

try{
  await main();
}finally{
  await prisma.$disconnect();
}
