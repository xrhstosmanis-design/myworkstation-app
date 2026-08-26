import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import {PrismaClient} from "@prisma/client";

const prisma=new PrismaClient();
const baseUrl=process.env.E2E_BASE_URL||"http://127.0.0.1:8080";
const companyId="pilot-company";
const storeId="kat-store";
const ownerEmail=process.env.KAT_OWNER_EMAIL||"ci-kat-owner@myworkstation.test";
const ownerPassword="ci-owner-e2e-password";
const operatorPin="4682";

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

const profileBody=permissions=>({
  username:"e2e.shiftclose",
  fullName:"E2E Shift Closer",
  stationPhone:null,mobilePhone:null,hourlyRate:null,
  role:"EMPLOYEE",active:true,posAccess:true,backofficeAccess:false,powerUser:false,
  permissions,backofficeMenu:{},backofficeTabs:{},customerDisplay:{},terminalPos:null,cashLimit:null,
  notes:"E2E operator shift close audit",retailSaleSeries:null,retailReturnSeries:null,installationAddress:null,installationPhone:null
});

async function main(){
  await prisma.company.update({where:{id:companyId},data:{active:true,licenseStatus:"ACTIVE",subscriptionEndsAt:new Date(Date.now()+7*24*60*60*1000)}});
  for(const moduleKey of ["CASH_CONTROL","STORE_MODE"]){
    await prisma.companyModule.upsert({where:{companyId_moduleKey:{companyId,moduleKey}},update:{active:true,startsAt:null,endsAt:null},create:{companyId,moduleKey,active:true}});
  }
  await prisma.store.update({where:{id:storeId},data:{active:true,cashCloseEmailEnabled:false}});
  await prisma.user.update({where:{email:ownerEmail},data:{passwordHash:await bcrypt.hash(ownerPassword,4),mustChangePassword:false,role:"OWNER",companyId}});

  const ownerLogin=await request("/api/auth/login",{method:"POST",body:{email:ownerEmail,password:ownerPassword,deviceName:"CI shift close audit"}});
  assert.equal(ownerLogin.response.status,200,JSON.stringify(ownerLogin.payload));
  const ownerToken=ownerLogin.payload?.token;
  assert.ok(ownerToken);

  const created=await request(`/api/operator-management/stores/${storeId}/operators`,{
    method:"POST",token:ownerToken,
    body:{username:"e2e.shiftclose",fullName:"E2E Shift Closer",email:"",phone:"",role:"EMPLOYEE",active:true,pin:operatorPin}
  });
  assert.equal(created.response.status,201,JSON.stringify(created.payload));
  const employeeId=created.payload.employeeId;
  const changed=await request(`/api/operator-management/stores/${storeId}/operators/${employeeId}`,{
    method:"PATCH",token:ownerToken,body:profileBody({cash:true,initialCash:true,closeShift:true,centralCashPos:false,shiftTransactionsPos:true,allShiftTransactionsPos:false,supplierPayment:false,thirdPartyPayment:true,sameShiftPayments:true})
  });
  assert.equal(changed.response.status,200,JSON.stringify(changed.payload));

  const operatorLogin=await request("/api/operators/login/pin",{method:"POST",body:{storeId,employeeId,pin:operatorPin}});
  assert.equal(operatorLogin.response.status,200,JSON.stringify(operatorLogin.payload));
  const operatorToken=operatorLogin.payload?.token;
  assert.ok(operatorToken);

  const opened=await request(`/api/cash/stores/${storeId}/sessions/open`,{
    method:"POST",token:operatorToken,
    body:{shiftLabel:"E2E πραγματική καταμέτρηση",drawer:60,custody:0,coins:0,safe:20,note:"operator opened for physical count"}
  });
  assert.equal(opened.response.status,201,JSON.stringify(opened.payload));
  assert.equal(opened.payload.openingOperational,60);
  const sessionId=opened.payload.id;

  const expense=await request(`/api/transactions/stores/${storeId}`,{
    method:"POST",token:operatorToken,
    body:{type:"OTHER_EXPENSE",amount:10,description:"E2E μικρό έξοδο βάρδιας",evidenceMode:"NO_DOCUMENT",paymentSource:"CASH_SHIFT",idempotencyKey:"e2e-shift-close-expense-001"}
  });
  assert.equal(expense.response.status,201,JSON.stringify(expense.payload));

  const closed=await request(`/api/cash/sessions/${sessionId}/close`,{
    method:"POST",token:operatorToken,
    body:{cashSales:999,cardSales:999,eftposTotal:0,expenses:999,drawer:47,custody:0,coins:0,safe:20,note:"Μετρήθηκαν πραγματικά χρήματα μετά το άνοιγμα συρταριού από την ταμειακή"}
  });
  assert.equal(closed.response.status,200,JSON.stringify(closed.payload));
  assert.equal(closed.payload.closedByName,"E2E Shift Closer");
  assert.equal(closed.payload.expenses,10);
  assert.equal(closed.payload.expectedOperational,50);
  assert.equal(closed.payload.actualOperational,47);
  assert.equal(closed.payload.variance,-3);
  assert.equal(closed.payload.nextOpeningTotal,47);

  const duplicateClose=await request(`/api/cash/sessions/${sessionId}/close`,{
    method:"POST",token:operatorToken,
    body:{cashSales:0,cardSales:0,eftposTotal:0,expenses:0,drawer:47,custody:0,coins:0,safe:20,note:"duplicate close must fail"}
  });
  assert.equal(duplicateClose.response.status,409,"A closed shift was closed twice");

  const overview=await request(`/api/cash/stores/${storeId}/overview`,{token:operatorToken});
  assert.equal(overview.response.status,200,JSON.stringify(overview.payload));
  assert.equal(overview.payload.openSession,null);
  assert.equal(overview.payload.suggestedOpening?.drawer,47);
  assert.equal(overview.payload.suggestedOpening?.operational,47);

  const from=new Date(Date.now()-24*60*60*1000).toISOString();
  const to=new Date(Date.now()+24*60*60*1000).toISOString();
  const report=await request(`/api/owner-shifts/report?storeId=${storeId}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,{token:ownerToken});
  assert.equal(report.response.status,200,JSON.stringify(report.payload));
  const row=(report.payload.shifts||[]).find(item=>item.id===sessionId);
  assert.ok(row,"Closed operator shift is missing from BackOffice shift report");
  assert.equal(row.openedByName,"E2E Shift Closer");
  assert.equal(row.closedByName,"E2E Shift Closer");
  assert.equal(row.expenses,10);
  assert.equal(row.expectedOperational,50);
  assert.equal(row.actualOperational,47);
  assert.equal(row.variance,-3);
  assert.ok((report.payload.summary?.alerts||0)>=1,"BackOffice report did not flag non-zero shift variance");

  const detail=await request(`/api/owner-shifts/${sessionId}/detail`,{token:ownerToken});
  assert.equal(detail.response.status,200,JSON.stringify(detail.payload));
  assert.equal(detail.payload.shift?.id,sessionId);
  assert.equal(detail.payload.shift?.variance,-3);
  assert.ok((detail.payload.transactions||[]).some(item=>item.id===expense.payload.id&&item.actorName==="E2E Shift Closer"));

  const reopened=await request(`/api/cash/stores/${storeId}/sessions/open`,{
    method:"POST",token:operatorToken,
    body:{shiftLabel:"E2E επόμενη βάρδια",drawer:47,custody:0,coins:0,safe:20,note:"carry forward actual counted cash"}
  });
  assert.equal(reopened.response.status,201,JSON.stringify(reopened.payload));
  assert.equal(reopened.payload.expectedOpeningOperational,47);
  assert.equal(reopened.payload.openingOperational,47);
  assert.equal(reopened.payload.openingVariance,0);

  const closeSecond=await request(`/api/cash/sessions/${reopened.payload.id}/close`,{
    method:"POST",token:operatorToken,
    body:{cashSales:0,cardSales:0,eftposTotal:0,expenses:0,drawer:47,custody:0,coins:0,safe:20,note:"clean up second E2E shift"}
  });
  assert.equal(closeSecond.response.status,200,JSON.stringify(closeSecond.payload));
  assert.equal(closeSecond.payload.variance,0);

  console.log("E2E operator physical count/shift close BackOffice audit passed",{sessionId,variance:closed.payload.variance,nextOpening:closed.payload.nextOpeningTotal});
}

try{await main()}finally{await prisma.$disconnect()}
