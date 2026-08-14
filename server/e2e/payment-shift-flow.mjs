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
