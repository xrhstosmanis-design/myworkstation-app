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

async function main(){
  await prisma.company.update({where:{id:companyId},data:{active:true,licenseStatus:"ACTIVE",subscriptionEndsAt:new Date(Date.now()+7*24*60*60*1000)}});
  await prisma.companyModule.upsert({where:{companyId_moduleKey:{companyId,moduleKey:"CASH_CONTROL"}},update:{active:true,startsAt:null,endsAt:null},create:{companyId,moduleKey:"CASH_CONTROL",active:true}});
  await prisma.store.update({where:{id:storeId},data:{active:true,cashCloseEmailEnabled:false}});
  await prisma.user.update({where:{email:ownerEmail},data:{passwordHash:await bcrypt.hash(ownerPassword,4),mustChangePassword:false,role:"OWNER",companyId}});

  const login=await request("/api/auth/login",{method:"POST",body:{email:ownerEmail,password:ownerPassword,deviceName:"CI EFTPOS close"}});
  assert.equal(login.response.status,200,JSON.stringify(login.payload));
  const token=login.payload?.token;
  assert.ok(token);

  const opened=await request(`/api/cash/stores/${storeId}/sessions/open`,{
    method:"POST",token,
    body:{shiftLabel:"E2E EFTPOS",drawer:100,custody:0,coins:0,safe:0,note:"EFTPOS close flow"}
  });
  assert.equal(opened.response.status,201,JSON.stringify(opened.payload));
  const sessionId=opened.payload.id;

  const cashSale=await request(`/api/transactions/stores/${storeId}`,{
    method:"POST",token,body:{type:"SALE_CASH",amount:20,description:"E2E cash sale"}
  });
  assert.equal(cashSale.response.status,201,JSON.stringify(cashSale.payload));

  const cardSale=await request(`/api/transactions/stores/${storeId}`,{
    method:"POST",token,body:{type:"SALE_CARD",amount:30,description:"E2E card sale"}
  });
  assert.equal(cardSale.response.status,201,JSON.stringify(cardSale.payload));

  const ledger=await request(`/api/transactions/stores/${storeId}/overview`,{token});
  assert.equal(ledger.response.status,200,JSON.stringify(ledger.payload));
  assert.equal(ledger.payload.summary?.cashSales,20);
  assert.equal(ledger.payload.summary?.cardSales,30);

  const closed=await request(`/api/cash/sessions/${sessionId}/close`,{
    method:"POST",token,
    body:{cashSales:999,cardSales:999,eftposTotal:25,expenses:999,drawer:120,custody:0,coins:0,safe:0,note:"E2E EFTPOS settlement differs by 5"}
  });
  assert.equal(closed.response.status,200,JSON.stringify(closed.payload));
  assert.equal(closed.payload.cashSales,20,"Close trusted client cash sales instead of ledger");
  assert.equal(closed.payload.cardSales,30,"Close trusted client card sales instead of ledger");
  assert.equal(closed.payload.eftposTotal,25);
  assert.equal(closed.payload.cardVariance,5);
  assert.equal(closed.payload.expectedOperational,120);
  assert.equal(closed.payload.actualOperational,120);
  assert.equal(closed.payload.variance,0,"Card mismatch incorrectly changed physical cash variance");
  assert.equal(closed.payload.nextOpeningTotal,120);

  const from=new Date(Date.now()-24*60*60*1000).toISOString();
  const to=new Date(Date.now()+24*60*60*1000).toISOString();
  const report=await request(`/api/owner-shifts/report?storeId=${storeId}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,{token});
  assert.equal(report.response.status,200,JSON.stringify(report.payload));
  const row=(report.payload.shifts||[]).find(item=>item.id===sessionId);
  assert.ok(row,"EFTPOS shift missing from BackOffice shift report");
  assert.equal(row.cashSales,20);
  assert.equal(row.cardSales,30);
  assert.equal(row.eftposTotal,25);
  assert.equal(row.cardVariance,5);
  assert.equal(row.variance,0);
  assert.ok((report.payload.summary?.alerts||0)>=1,"BackOffice did not flag EFTPOS/card variance");

  const detail=await request(`/api/owner-shifts/${sessionId}/detail`,{token});
  assert.equal(detail.response.status,200,JSON.stringify(detail.payload));
  assert.equal(detail.payload.shift?.cardVariance,5);
  assert.ok((detail.payload.transactions||[]).some(item=>item.id===cardSale.payload.id&&item.type==="SALE_CARD"));
  assert.ok((detail.payload.transactions||[]).some(item=>item.id===cashSale.payload.id&&item.type==="SALE_CASH"));

  console.log("E2E EFTPOS/card shift close passed",{sessionId,cardSales:closed.payload.cardSales,eftposTotal:closed.payload.eftposTotal,cardVariance:closed.payload.cardVariance});
}

try{await main()}finally{await prisma.$disconnect()}
