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

async function createOperator(ownerToken,{name,username,pin}){
  const created=await request(`/api/operator-management/stores/${storeId}/operators`,{
    method:"POST",token:ownerToken,
    body:{username,fullName:name,email:"",phone:"",role:"EMPLOYEE",active:true,pin}
  });
  assert.equal(created.response.status,201,JSON.stringify(created.payload));
  return created.payload.employeeId;
}

function profile(name,username,permissions){return {
  username,fullName:name,stationPhone:null,mobilePhone:null,hourlyRate:null,role:"EMPLOYEE",active:true,
  posAccess:true,backofficeAccess:false,powerUser:false,permissions,backofficeMenu:{},backofficeTabs:{},customerDisplay:{},
  terminalPos:null,cashLimit:null,notes:"E2E ledger visibility",retailSaleSeries:null,retailReturnSeries:null,installationAddress:null,installationPhone:null
}}
async function setProfile(ownerToken,employeeId,name,username,permissions){
  const result=await request(`/api/operator-management/stores/${storeId}/operators/${employeeId}`,{method:"PATCH",token:ownerToken,body:profile(name,username,permissions)});
  assert.equal(result.response.status,200,JSON.stringify(result.payload));
}
async function pinLogin(employeeId,pin){
  const result=await request("/api/operators/login/pin",{method:"POST",body:{storeId,employeeId,pin}});
  assert.equal(result.response.status,200,JSON.stringify(result.payload));
  assert.ok(result.payload?.token);
  return result.payload.token;
}

async function main(){
  await prisma.company.update({where:{id:companyId},data:{active:true,licenseStatus:"ACTIVE",subscriptionEndsAt:new Date(Date.now()+7*24*60*60*1000)}});
  for(const moduleKey of ["CASH_CONTROL","STORE_MODE"]){
    await prisma.companyModule.upsert({where:{companyId_moduleKey:{companyId,moduleKey}},update:{active:true,startsAt:null,endsAt:null},create:{companyId,moduleKey,active:true}});
  }
  await prisma.store.update({where:{id:storeId},data:{active:true,cashCloseEmailEnabled:false}});
  await prisma.user.update({where:{email:ownerEmail},data:{passwordHash:await bcrypt.hash(ownerPassword,4),mustChangePassword:false,role:"OWNER",companyId}});

  const ownerLogin=await request("/api/auth/login",{method:"POST",body:{email:ownerEmail,password:ownerPassword,deviceName:"CI ledger visibility"}});
  assert.equal(ownerLogin.response.status,200,JSON.stringify(ownerLogin.payload));
  const ownerToken=ownerLogin.payload.token;

  const employeeA=await createOperator(ownerToken,{name:"E2E Ledger Operator A",username:"e2e.ledger.a",pin:"3579"});
  const employeeB=await createOperator(ownerToken,{name:"E2E Ledger Operator B",username:"e2e.ledger.b",pin:"4680"});
  const ownOnly={cash:true,shiftTransactionsPos:true,allShiftTransactionsPos:false,supplierPayment:false,sameShiftPayments:false};
  await setProfile(ownerToken,employeeA,"E2E Ledger Operator A","e2e.ledger.a",ownOnly);
  await setProfile(ownerToken,employeeB,"E2E Ledger Operator B","e2e.ledger.b",ownOnly);

  const tokenA=await pinLogin(employeeA,"3579");
  const tokenB=await pinLogin(employeeB,"4680");

  const opened=await request(`/api/cash/stores/${storeId}/sessions/open`,{method:"POST",token:ownerToken,body:{shiftLabel:"E2E ledger visibility",drawer:25,custody:0,coins:0,safe:0,note:"two operators"}});
  assert.equal(opened.response.status,201,JSON.stringify(opened.payload));
  const sessionId=opened.payload.id;

  const paymentA=await request(`/api/transactions/stores/${storeId}`,{method:"POST",token:tokenA,body:{type:"OTHER_EXPENSE",amount:2,description:"Operator A external expense",evidenceMode:"NO_DOCUMENT",paymentSource:"EXTERNAL",idempotencyKey:"e2e-ledger-a-001"}});
  assert.equal(paymentA.response.status,201,JSON.stringify(paymentA.payload));

  const viewBBeforeOwn=await request(`/api/transactions/stores/${storeId}/overview`,{token:tokenB});
  assert.equal(viewBBeforeOwn.response.status,200,JSON.stringify(viewBBeforeOwn.payload));
  assert.equal((viewBBeforeOwn.payload.recent||[]).some(row=>row.id===paymentA.payload.id),false,"Own-only operator B could see operator A movement");

  const paymentB=await request(`/api/transactions/stores/${storeId}`,{method:"POST",token:tokenB,body:{type:"OTHER_EXPENSE",amount:1,description:"Operator B external expense",evidenceMode:"NO_DOCUMENT",paymentSource:"EXTERNAL",idempotencyKey:"e2e-ledger-b-001"}});
  assert.equal(paymentB.response.status,201,JSON.stringify(paymentB.payload));

  const viewBOwnOnly=await request(`/api/transactions/stores/${storeId}/overview`,{token:tokenB});
  assert.equal(viewBOwnOnly.response.status,200,JSON.stringify(viewBOwnOnly.payload));
  const ownOnlyIds=new Set((viewBOwnOnly.payload.recent||[]).map(row=>row.id));
  assert.equal(ownOnlyIds.has(paymentB.payload.id),true,"Operator B cannot see own payment");
  assert.equal(ownOnlyIds.has(paymentA.payload.id),false,"Operator B sees another operator without allShiftTransactionsPos");

  const reviewPermissions={...ownOnly,allShiftTransactionsPos:true};
  await setProfile(ownerToken,employeeB,"E2E Ledger Operator B","e2e.ledger.b",reviewPermissions);

  const viewBAfterLiveGrant=await request(`/api/transactions/stores/${storeId}/overview`,{token:tokenB});
  assert.equal(viewBAfterLiveGrant.response.status,200,JSON.stringify(viewBAfterLiveGrant.payload));
  const allIds=new Set((viewBAfterLiveGrant.payload.recent||[]).map(row=>row.id));
  assert.equal(allIds.has(paymentA.payload.id),true,"Existing operator token did not gain all-shift visibility from BackOffice live grant");
  assert.equal(allIds.has(paymentB.payload.id),true);
  assert.equal(viewBAfterLiveGrant.payload.access?.canReviewStoreLedger,true);
  assert.equal(viewBAfterLiveGrant.payload.access?.canReverse,false,"Review permission unexpectedly granted reversal permission");

  const forbiddenReverse=await request(`/api/transactions/${paymentA.payload.id}/reverse`,{method:"POST",token:tokenB,body:{reason:"review is not reversal"}});
  assert.equal(forbiddenReverse.response.status,403,"allShiftTransactionsPos incorrectly granted transaction reversal");

  const from=new Date(Date.now()-24*60*60*1000).toISOString();
  const to=new Date(Date.now()+24*60*60*1000).toISOString();
  const report=await request(`/api/owner-payments/report?storeId=${storeId}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,{token:ownerToken});
  assert.equal(report.response.status,200,JSON.stringify(report.payload));
  const rowA=(report.payload.movements||[]).find(row=>row.id===paymentA.payload.id);
  const rowB=(report.payload.movements||[]).find(row=>row.id===paymentB.payload.id);
  assert.ok(rowA&&rowB,"BackOffice report does not include both operator payments");
  assert.notEqual(rowA.actorId,rowB.actorId,"Payments from two operators lost actor isolation");

  const closed=await request(`/api/cash/sessions/${sessionId}/close`,{method:"POST",token:ownerToken,body:{cashSales:0,cardSales:0,eftposTotal:0,expenses:0,drawer:25,custody:0,coins:0,safe:0,note:"external-only operator payments"}});
  assert.equal(closed.response.status,200,JSON.stringify(closed.payload));
  assert.equal(closed.payload.expenses,0);
  assert.equal(closed.payload.expectedOperational,25);
  assert.equal(closed.payload.variance,0);

  console.log("E2E operator ledger visibility passed",{employeeA,employeeB,paymentA:paymentA.payload.id,paymentB:paymentB.payload.id});
}

try{await main()}finally{await prisma.$disconnect()}
