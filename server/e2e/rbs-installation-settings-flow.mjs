import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import {PrismaClient} from "@prisma/client";
const db=new PrismaClient(),base=process.env.E2E_BASE_URL||"http://127.0.0.1:8080";
async function request(path,{token,method="GET",body}={}){
  const response=await fetch(base+path,{method,headers:{...(token?{authorization:`Bearer ${token}`}:{ }),...(body?{"content-type":"application/json"}:{})},body:body?JSON.stringify(body):undefined});
  return {status:response.status,body:await response.json()};
}
try{
  // This fixture runs only in the isolated CI database, never against production.
  const company=await db.company.create({data:{name:"CI RBS installation",active:true,licenseStatus:"ACTIVE",subscriptionEndsAt:new Date(Date.now()+86400000)}});
  const store=await db.store.create({data:{name:"CI single RBS",companyId:company.id}}),sibling=await db.store.create({data:{name:"CI sibling",companyId:company.id}});
  const admin=await db.user.create({data:{email:`rbs-install-${company.id}@unit.test`,fullName:"CI RBS Super Admin",role:"SUPER_ADMIN",companyId:company.id,passwordHash:"isolated-fixture-no-login",mustChangePassword:false}});
  const session=await db.userSession.create({data:{userId:admin.id,expiresAt:new Date(Date.now()+86400000)}});
  const token=jwt.sign({id:admin.id,email:admin.email,companyId:company.id,role:"OWNER",platformRole:"SUPER_ADMIN",isSuperAdmin:true,sessionId:session.id,sessionVersion:admin.sessionVersion},process.env.JWT_SECRET,{expiresIn:"5m"});
  const root=`/api/platform/companies/${company.id}/stores/${store.id}`;
  const terminal=await request(root+"/installation-terminals",{token,method:"POST",body:{terminalPos:"POS-01",displayName:"Single POS"}});assert.equal(terminal.status,201,JSON.stringify(terminal.body));
  const routing={fiscalDevices:[{deviceCode:"RBS-01",displayName:"One RBS",terminalPos:"POS-01",active:true}],eftposDevices:[{deviceCode:"CARD-01",displayName:"One EFTPOS",fiscalDeviceCode:"RBS-01",role:"STORE",active:true}]};
  assert.equal((await request(root+"/device-routing",{token,method:"PUT",body:routing})).status,200);
  const form={terminalPos:"POS-01",cashCode:"4",cardCode:"8",deliveryCode:"",workFolder:"C:\\capture",confirmed:true};
  assert.equal((await request(root+"/rbs-installation",{method:"PUT",body:form})).status,401);
  const ownerToken=jwt.sign({id:admin.id,companyId:company.id,role:"OWNER",isSuperAdmin:false},process.env.JWT_SECRET,{expiresIn:"5m"});
  assert.equal((await request(root+"/rbs-installation",{token:ownerToken,method:"PUT",body:form})).status,403);
  assert.equal((await request(`/api/platform/companies/foreign-company/stores/${store.id}/rbs-installation`,{token,method:"PUT",body:form})).status,404);
  assert.equal((await request(root+"/rbs-installation",{token,method:"PUT",body:{...form,deliveryCode:"3"}})).status,409,"Missing Delivery must not fall back to STORE");
  const saved=await request(root+"/rbs-installation",{token,method:"PUT",body:form});assert.equal(saved.status,200,JSON.stringify(saved.body));assert.equal(saved.body.physicalTestConfirmed,false);
  const read=await request(root+"/rbs-installation/POS-01",{token});assert.equal(read.status,200);assert.equal(read.body.settings.cardCode,"8");assert.equal(read.body.connectorAllowed,false,"Configuration must not activate a licensed module");
  const other=await request(`/api/platform/companies/${company.id}/stores/${sibling.id}/rbs-installation/POS-01`,{token});assert.equal(other.body.settings,null,"Settings leaked to a sibling store");
  const packageResult=await request(root+"/rbs-installation/POS-01/package",{token,method:"POST",body:{apiBase:"https://unit.test"}});assert.equal(packageResult.status,200,JSON.stringify(packageResult.body));assert.equal(packageResult.body.containsCredentials,false);
  const audit=await db.authAudit.count({where:{userId:admin.id,event:"STORE_RBS_INSTALLATION_CONFIRMED"}});assert.equal(audit,1);
  const changed={...routing,eftposDevices:[{...routing.eftposDevices[0],deviceCode:"CARD-NEW"}]};assert.equal((await request(root+"/device-routing",{token,method:"PUT",body:changed})).status,200);
  assert.equal((await request(root+"/rbs-installation/POS-01",{token})).status,409,"Changing equipment must invalidate old payment configuration");
  assert.equal((await request(root+"/rbs-installation",{token,method:"PUT",body:form})).status,200);
  assert.equal((await request(root+"/installation-terminals",{token,method:"POST",body:{terminalPos:"POS-02",displayName:"Second POS"}})).status,201);
  assert.equal((await request(root+"/rbs-installation/POS-01/package",{token,method:"POST",body:{apiBase:"https://unit.test"}})).status,409,"Store-wide writer queue must not be packaged as safe multi-POS routing");
  console.log("RBS installation HTTP E2E PASS: Super Admin isolation, one EFTPOS, durable explicit codes, module gate, stale mapping invalidation, credential-free package and multi-POS block.");
}finally{await db.$disconnect()}
