import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import {PrismaClient} from "@prisma/client";

const prisma=new PrismaClient();
const baseUrl=process.env.E2E_BASE_URL||"http://127.0.0.1:8080";
const companyA="pilot-company";
const storeA="kat-store";
const ownerAEmail=process.env.KAT_OWNER_EMAIL||"ci-kat-owner@myworkstation.test";
const ownerAPassword="ci-owner-e2e-password";
const companyB="e2e-company-b";
const storeB="e2e-store-b";
const ownerBEmail="e2e-owner-b@myworkstation.test";
const ownerBPassword="e2e-owner-b-password";

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

async function login(email,password,label){
  const result=await request("/api/auth/login",{method:"POST",body:{email,password,deviceName:label}});
  assert.equal(result.response.status,200,JSON.stringify(result.payload));
  assert.ok(result.payload?.token);
  return result.payload.token;
}

async function main(){
  await prisma.company.update({where:{id:companyA},data:{active:true,licenseStatus:"ACTIVE",subscriptionEndsAt:new Date(Date.now()+7*24*60*60*1000)}});
  await prisma.companyModule.upsert({where:{companyId_moduleKey:{companyId:companyA,moduleKey:"CASH_CONTROL"}},update:{active:true,startsAt:null,endsAt:null},create:{companyId:companyA,moduleKey:"CASH_CONTROL",active:true}});
  await prisma.user.update({where:{email:ownerAEmail},data:{passwordHash:await bcrypt.hash(ownerAPassword,4),mustChangePassword:false,role:"OWNER",companyId:companyA}});

  await prisma.company.upsert({
    where:{id:companyB},
    update:{name:"E2E Company B",active:true,licenseStatus:"ACTIVE",subscriptionEndsAt:new Date(Date.now()+7*24*60*60*1000)},
    create:{id:companyB,name:"E2E Company B",active:true,licenseStatus:"ACTIVE",subscriptionEndsAt:new Date(Date.now()+7*24*60*60*1000)}
  });
  await prisma.companyModule.upsert({where:{companyId_moduleKey:{companyId:companyB,moduleKey:"CASH_CONTROL"}},update:{active:true,startsAt:null,endsAt:null},create:{companyId:companyB,moduleKey:"CASH_CONTROL",active:true}});
  await prisma.store.upsert({where:{id:storeB},update:{name:"E2E Store B",companyId:companyB,active:true,cashCloseEmailEnabled:false},create:{id:storeB,name:"E2E Store B",companyId:companyB,active:true,cashCloseEmailEnabled:false}});
  await prisma.user.upsert({
    where:{email:ownerBEmail},
    update:{passwordHash:await bcrypt.hash(ownerBPassword,4),mustChangePassword:false,fullName:"E2E Owner B",role:"OWNER",companyId:companyB},
    create:{email:ownerBEmail,passwordHash:await bcrypt.hash(ownerBPassword,4),mustChangePassword:false,fullName:"E2E Owner B",role:"OWNER",companyId:companyB}
  });

  const tokenA=await login(ownerAEmail,ownerAPassword,"CI tenant A");
  const tokenB=await login(ownerBEmail,ownerBPassword,"CI tenant B");

  const openedB=await request(`/api/cash/stores/${storeB}/sessions/open`,{method:"POST",token:tokenB,body:{shiftLabel:"E2E Tenant B",drawer:20,custody:0,coins:0,safe:0,note:"tenant isolation"}});
  assert.equal(openedB.response.status,201,JSON.stringify(openedB.payload));
  const sessionB=openedB.payload.id;

  const reversedCandidate=await request(`/api/transactions/stores/${storeB}`,{
    method:"POST",token:tokenB,
    body:{type:"OTHER_EXPENSE",amount:4,description:"E2E reversible expense",evidenceMode:"NO_DOCUMENT",paymentSource:"CASH_SHIFT",idempotencyKey:"e2e-tenant-b-reverse-001"}
  });
  assert.equal(reversedCandidate.response.status,201,JSON.stringify(reversedCandidate.payload));

  const crossCash=await request(`/api/cash/stores/${storeB}/overview`,{token:tokenA});
  assert.equal(crossCash.response.status,404,"Tenant A could read Tenant B cash overview");
  const crossLedger=await request(`/api/transactions/stores/${storeB}/overview`,{token:tokenA});
  assert.equal(crossLedger.response.status,404,"Tenant A could read Tenant B ledger");
  const crossReport=await request(`/api/owner-payments/report?storeId=${storeB}`,{token:tokenA});
  assert.equal(crossReport.response.status,404,"Tenant A could query Tenant B BackOffice report");
  const crossReverse=await request(`/api/transactions/${reversedCandidate.payload.id}/reverse`,{method:"POST",token:tokenA,body:{reason:"cross tenant attempt"}});
  assert.equal(crossReverse.response.status,404,"Tenant A could address Tenant B transaction for reversal");

  const reversed=await request(`/api/transactions/${reversedCandidate.payload.id}/reverse`,{method:"POST",token:tokenB,body:{reason:"E2E valid reversal"}});
  assert.equal(reversed.response.status,200,JSON.stringify(reversed.payload));
  assert.ok(reversed.payload.reversedAt);
  assert.equal(reversed.payload.reversalReason,"E2E valid reversal");

  const ledgerAfterReverse=await request(`/api/transactions/stores/${storeB}/overview`,{token:tokenB});
  assert.equal(ledgerAfterReverse.response.status,200,JSON.stringify(ledgerAfterReverse.payload));
  assert.equal(ledgerAfterReverse.payload.summary?.expensesTotal,0,"Reversed same-shift expense still affects shift totals");
  const reversedRow=(ledgerAfterReverse.payload.recent||[]).find(row=>row.id===reversedCandidate.payload.id);
  assert.ok(reversedRow?.reversedAt);
  assert.equal(reversedRow.reversalReason,"E2E valid reversal");

  const finalPayment=await request(`/api/transactions/stores/${storeB}`,{
    method:"POST",token:tokenB,
    body:{type:"OTHER_EXPENSE",amount:2,description:"E2E finalized expense",evidenceMode:"NO_DOCUMENT",paymentSource:"CASH_SHIFT",idempotencyKey:"e2e-tenant-b-final-001"}
  });
  assert.equal(finalPayment.response.status,201,JSON.stringify(finalPayment.payload));

  const closed=await request(`/api/cash/sessions/${sessionB}/close`,{method:"POST",token:tokenB,body:{cashSales:999,cardSales:999,eftposTotal:0,expenses:999,drawer:18,custody:0,coins:0,safe:0,note:"tenant B finalized"}});
  assert.equal(closed.response.status,200,JSON.stringify(closed.payload));
  assert.equal(closed.payload.expenses,2);
  assert.equal(closed.payload.expectedOperational,18);
  assert.equal(closed.payload.actualOperational,18);
  assert.equal(closed.payload.variance,0);

  const reverseAfterClose=await request(`/api/transactions/${finalPayment.payload.id}/reverse`,{method:"POST",token:tokenB,body:{reason:"must fail after final close"}});
  assert.equal(reverseAfterClose.response.status,409,"Finalized shift transaction was reversible after close");

  const from=new Date(Date.now()-24*60*60*1000).toISOString();
  const to=new Date(Date.now()+24*60*60*1000).toISOString();
  const reportB=await request(`/api/owner-payments/report?storeId=${storeB}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,{token:tokenB});
  assert.equal(reportB.response.status,200,JSON.stringify(reportB.payload));
  const reportReversed=(reportB.payload.movements||[]).find(row=>row.id===reversedCandidate.payload.id);
  const reportFinal=(reportB.payload.movements||[]).find(row=>row.id===finalPayment.payload.id);
  assert.ok(reportReversed?.reversedAt,"BackOffice report lost reversal audit");
  assert.equal(reportReversed.reversalReason,"E2E valid reversal");
  assert.ok(reportFinal&&!reportFinal.reversedAt,"BackOffice report lost finalized active expense");
  assert.equal(reportB.payload.summary?.totalExpenses,2);

  console.log("E2E reversal / tenant isolation passed",{sessionB,reversedId:reversedCandidate.payload.id,finalizedId:finalPayment.payload.id});
}

try{await main()}finally{await prisma.$disconnect()}
