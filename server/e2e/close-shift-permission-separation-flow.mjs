import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import {PrismaClient} from "@prisma/client";

const prisma=new PrismaClient();
const baseUrl=process.env.E2E_BASE_URL||"http://127.0.0.1:8080";
const companyId="pilot-company";
const storeId="kat-store";
const ownerEmail=process.env.KAT_OWNER_EMAIL||"ci-kat-owner@myworkstation.test";
const ownerPassword="ci-close-shift-separation-owner";
const operatorPin="7391";

async function request(path,{method="GET",token,body}={}){
  const response=await fetch(`${baseUrl}${path}`,{
    method,
    headers:{...(token?{authorization:`Bearer ${token}`}:{ }),...(body!==undefined?{"content-type":"application/json"}:{})},
    body:body===undefined?undefined:JSON.stringify(body)
  });
  let payload=null;try{payload=await response.json()}catch{}
  return {response,payload};
}

const profileBody=permissions=>({
  username:"e2e.shift.permission",fullName:"E2E Shift Permission",stationPhone:null,mobilePhone:null,hourlyRate:null,
  role:"EMPLOYEE",active:true,posAccess:true,backofficeAccess:false,powerUser:false,permissions,
  backofficeMenu:{},backofficeTabs:{},customerDisplay:{},terminalPos:null,cashLimit:null,
  notes:"Dedicated close-shift permission separation",retailSaleSeries:null,retailReturnSeries:null,installationAddress:null,installationPhone:null
});

async function updateProfile(ownerToken,employeeId,permissions){
  const changed=await request(`/api/operator-management/stores/${storeId}/operators/${employeeId}`,{method:"PATCH",token:ownerToken,body:profileBody(permissions)});
  assert.equal(changed.response.status,200,JSON.stringify(changed.payload));
}

async function main(){
  await prisma.company.update({where:{id:companyId},data:{active:true,licenseStatus:"ACTIVE",subscriptionEndsAt:new Date(Date.now()+7*86400000)}});
  for(const moduleKey of ["CASH_CONTROL","STORE_MODE"]){
    await prisma.companyModule.upsert({where:{companyId_moduleKey:{companyId,moduleKey}},update:{active:true,startsAt:null,endsAt:null},create:{companyId,moduleKey,active:true}});
  }
  await prisma.store.update({where:{id:storeId},data:{active:true,cashCloseEmailEnabled:false}});
  await prisma.user.update({where:{email:ownerEmail},data:{passwordHash:await bcrypt.hash(ownerPassword,4),mustChangePassword:false,role:"OWNER",companyId}});

  const ownerLogin=await request("/api/auth/login",{method:"POST",body:{email:ownerEmail,password:ownerPassword,deviceName:"CI close shift separation"}});
  assert.equal(ownerLogin.response.status,200,JSON.stringify(ownerLogin.payload));
  const ownerToken=ownerLogin.payload?.token;assert.ok(ownerToken);

  const created=await request(`/api/operator-management/stores/${storeId}/operators`,{method:"POST",token:ownerToken,body:{username:"e2e.shift.permission",fullName:"E2E Shift Permission",email:"",phone:"",role:"EMPLOYEE",active:true,pin:operatorPin}});
  assert.equal(created.response.status,201,JSON.stringify(created.payload));
  const employeeId=created.payload.employeeId;assert.ok(employeeId);

  await updateProfile(ownerToken,employeeId,{cash:true,initialCash:true,centralCashPos:true,closeShift:false,shiftTransactionsPos:true});

  const login=await request("/api/operators/login/pin",{method:"POST",body:{storeId,employeeId,pin:operatorPin}});
  assert.equal(login.response.status,200,JSON.stringify(login.payload));
  const token=login.payload?.token;assert.ok(token);

  const accessBefore=await request(`/api/store-pos/stores/${storeId}`,{token});
  assert.equal(accessBefore.response.status,200,JSON.stringify(accessBefore.payload));
  assert.equal(accessBefore.payload?.access?.centralCashPos,true);
  assert.equal(accessBefore.payload?.access?.closeShift,false);

  const opened=await request(`/api/cash/stores/${storeId}/sessions/open`,{method:"POST",token,body:{shiftLabel:"E2E permission separation",drawer:40,custody:0,coins:0,safe:0,note:"dedicated permission test"}});
  assert.equal(opened.response.status,201,JSON.stringify(opened.payload));
  const sessionId=opened.payload.id;

  const denied=await request(`/api/cash/sessions/${sessionId}/close`,{method:"POST",token,body:{cashSales:0,cardSales:0,eftposTotal:0,expenses:0,drawer:40,custody:0,coins:0,safe:0,note:"must be denied without closeShift"}});
  assert.equal(denied.response.status,403,"centralCashPos incorrectly granted shift-close permission");
  assert.match(String(denied.payload?.error||""),/Κλείσιμο βάρδιας/);

  await updateProfile(ownerToken,employeeId,{cash:true,initialCash:true,centralCashPos:false,closeShift:true,shiftTransactionsPos:true});

  const accessAfter=await request(`/api/store-pos/stores/${storeId}`,{token});
  assert.equal(accessAfter.response.status,200,JSON.stringify(accessAfter.payload));
  assert.equal(accessAfter.payload?.access?.centralCashPos,false);
  assert.equal(accessAfter.payload?.access?.closeShift,true);

  const closed=await request(`/api/cash/sessions/${sessionId}/close`,{method:"POST",token,body:{cashSales:0,cardSales:0,eftposTotal:0,expenses:0,drawer:40,custody:0,coins:0,safe:0,note:"allowed by dedicated closeShift"}});
  assert.equal(closed.response.status,200,JSON.stringify(closed.payload));
  assert.equal(Number(closed.payload.variance),0);

  console.log("E2E dedicated close-shift permission separation passed",{employeeId,sessionId});
}

try{await main()}finally{await prisma.$disconnect()}
