import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import {PrismaClient} from "@prisma/client";
import {saveStoreLabelSettings} from "../src/services/store-label-settings.js";

const prisma=new PrismaClient();
const base=process.env.E2E_BASE_URL||"http://127.0.0.1:8080";
const companyId="pilot-company",storeId="kat-store";
const email="label-isolation-owner@myworkstation.test",password="label-isolation-e2e-password",pin="3479";
async function request(path,{method="GET",token,body}={}){
  const response=await fetch(base+path,{method,headers:{...(token?{authorization:`Bearer ${token}`}:{ }),...(body?{"content-type":"application/json"}:{})},body:body?JSON.stringify(body):undefined});
  let payload;try{payload=await response.json()}catch{payload=null}
  return {response,payload};
}

try{
  await prisma.company.update({where:{id:companyId},data:{active:true,licenseStatus:"ACTIVE",subscriptionEndsAt:new Date(Date.now()+7*86400000)}});
  await prisma.companyModule.upsert({where:{companyId_moduleKey:{companyId,moduleKey:"STORE_MODE"}},update:{active:true,startsAt:null,endsAt:null},create:{companyId,moduleKey:"STORE_MODE",active:true}});
  await prisma.user.upsert({where:{email},update:{companyId,role:"OWNER",passwordHash:await bcrypt.hash(password,4),mustChangePassword:false},create:{email,companyId,role:"OWNER",fullName:"Label Isolation Owner",passwordHash:await bcrypt.hash(password,4),mustChangePassword:false}});
  const sibling=await prisma.store.create({data:{companyId,name:"E2E Sibling Label Store"}});
  const foreignCompany=await prisma.company.create({data:{name:"E2E Foreign Label Company",active:true}});
  const foreign=await prisma.store.create({data:{companyId:foreignCompany.id,name:"E2E Foreign Label Store"}});
  await saveStoreLabelSettings(companyId,storeId,"e2e",{widthMm:60,heightMm:40,printerName:"own-only"});
  await saveStoreLabelSettings(companyId,sibling.id,"e2e",{widthMm:50,heightMm:30,printerName:"sibling-secret"});
  await saveStoreLabelSettings(foreignCompany.id,foreign.id,"e2e",{widthMm:70,heightMm:35,printerName:"foreign-secret"});

  const owner=await request("/api/auth/login",{method:"POST",body:{email,password,deviceName:"CI label isolation"}});
  assert.equal(owner.response.status,200,JSON.stringify(owner.payload));
  const created=await request(`/api/operator-management/stores/${storeId}/operators`,{method:"POST",token:owner.payload.token,body:{username:"e2e.label.operator",fullName:"E2E Label Operator",email:"",phone:"",role:"EMPLOYEE",active:true,pin}});
  assert.equal(created.response.status,201,JSON.stringify(created.payload));
  const login=await request("/api/operators/login/pin",{method:"POST",body:{storeId,employeeId:created.payload.employeeId,pin}});
  assert.equal(login.response.status,200,JSON.stringify(login.payload));
  const token=login.payload.token;
  const own=await request(`/api/store-pos/stores/${storeId}/label-settings`,{token});
  assert.equal(own.response.status,200,JSON.stringify(own.payload));
  assert.deepEqual(own.payload.settings,{widthMm:60,heightMm:40,printerName:"own-only"});
  for(const target of [sibling,foreign]){
    const denied=await request(`/api/store-pos/stores/${target.id}/label-settings`,{token});
    assert.equal(denied.response.status,403,JSON.stringify(denied.payload));
    assert.equal(JSON.stringify(denied.payload).includes("secret"),false,"Foreign label settings leaked");
  }
  console.log("Label isolation HTTP E2E PASS: own 200, same-company sibling 403, foreign company 403");
}finally{await prisma.$disconnect()}
