import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import {PrismaClient} from "@prisma/client";

const prisma=new PrismaClient();
const baseUrl=process.env.E2E_BASE_URL||"http://127.0.0.1:8080";
const companyId="pilot-company";
const storeId="kat-store";
const ownerEmail=process.env.KAT_OWNER_EMAIL||"ci-kat-owner@myworkstation.test";
const ownerPassword="ci-workforce-v2-rules-password";
const roleCode="E2E_RULE_SHIFT_ROLE";
const templateCode="E2E_NIGHT_SHIFT";
const employeeEmails=["e2e-rule-a@example.test","e2e-rule-b@example.test"];

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

async function setPackage(moduleKey,active){
  await prisma.$executeRawUnsafe(`
    INSERT INTO "StorePaidModule" ("id","companyId","storeId","moduleKey","active","monthlyPrice","createdAt","updatedAt")
    VALUES ($1,$2,$3,$4,$5,0,NOW(),NOW())
    ON CONFLICT ("storeId","moduleKey") DO UPDATE SET "active"=$5,"startsAt"=NULL,"endsAt"=NULL,"updatedAt"=NOW()
  `,`e2e-${moduleKey.toLowerCase()}-${storeId}`,companyId,storeId,moduleKey,active);
}

async function cleanPrevious(){
  const roles=await prisma.workforceRole.findMany({where:{companyId,code:roleCode},select:{id:true}});
  const roleIds=roles.map(item=>item.id);
  const employees=await prisma.workforceEmployee.findMany({
    where:{companyId,OR:[{email:{in:employeeEmails}},...(roleIds.length?[{roleAssignments:{some:{roleId:{in:roleIds}}}}]:[])]},select:{id:true}
  });
  const employeeIds=employees.map(item=>item.id);
  const templates=await prisma.workforceShiftTemplate.findMany({where:{companyId,storeId,OR:[{code:templateCode},...(roleIds.length?[{requiredRoleId:{in:roleIds}}]:[])]},select:{id:true}});
  const templateIds=templates.map(item=>item.id);
  const entityIds=[...employeeIds,...roleIds,...templateIds];
  if(employeeIds.length){
    await prisma.workforceEmployeeRule.deleteMany({where:{OR:[{employeeId:{in:employeeIds}},{relatedEmployeeId:{in:employeeIds}}]}});
    await prisma.workforceHourlyRate.deleteMany({where:{employeeId:{in:employeeIds}}});
    await prisma.workforceEmployeeStoreAccess.deleteMany({where:{employeeId:{in:employeeIds}}});
    await prisma.workforceEmployeeRole.deleteMany({where:{employeeId:{in:employeeIds}}});
    await prisma.workforceEmployee.deleteMany({where:{id:{in:employeeIds}}});
  }
  if(templateIds.length){
    await prisma.workforceScheduleAssignment.deleteMany({where:{shiftTemplateId:{in:templateIds}}});
    await prisma.workforceShiftTemplate.deleteMany({where:{id:{in:templateIds}}});
  }
  if(roleIds.length)await prisma.workforceRole.deleteMany({where:{id:{in:roleIds}}});
  if(entityIds.length)await prisma.workforceAuditLog.deleteMany({where:{entityId:{in:entityIds}}});
}

async function main(){
  await prisma.company.update({where:{id:companyId},data:{active:true,licenseStatus:"ACTIVE",subscriptionEndsAt:new Date(Date.now()+7*24*60*60*1000)}});
  await prisma.store.update({where:{id:storeId},data:{active:true}});
  await cleanPrevious();
  await setPackage("PERSONNEL_BASIC",true);
  await setPackage("PERSONNEL_PRO",false);
  await setPackage("PERSONNEL_AI",false);
  await setPackage("AI_STAFF_SCHEDULER",false);

  await prisma.user.update({
    where:{email:ownerEmail},
    data:{passwordHash:await bcrypt.hash(ownerPassword,4),mustChangePassword:false,role:"OWNER",companyId}
  });

  const login=await request("/api/auth/login",{method:"POST",body:{email:ownerEmail,password:ownerPassword,deviceName:"CI Workforce rules E2E"}});
  assert.equal(login.response.status,200,JSON.stringify(login.payload));
  const token=login.payload?.token;
  assert.ok(token);
  const base=`/api/platform/store-modules/companies/${companyId}/stores/${storeId}/workforce-v2`;

  const basicBootstrap=await request(`${base}/bootstrap`,{token});
  assert.equal(basicBootstrap.response.status,200,JSON.stringify(basicBootstrap.payload));
  assert.equal(basicBootstrap.payload?.capabilities?.rulesManagement,false);
  assert.equal(basicBootstrap.payload?.capabilities?.shiftTemplateManagement,true);
  assert.ok(basicBootstrap.payload?.ruleDefinitions?.some(item=>item.type==="NO_MORNING_AFTER_NIGHT"));
  assert.ok(basicBootstrap.payload?.shiftCategories?.some(item=>item.code==="NIGHT"));

  const blockedRules=await request(`${base}/rules`,{token});
  assert.equal(blockedRules.response.status,403,JSON.stringify(blockedRules.payload));

  const roleCreated=await request(`${base}/roles`,{
    method:"POST",token,body:{name:"E2E Υπεύθυνος Βάρδιας",code:roleCode,description:"Rules and shifts E2E",confirmed:true,reason:"E2E role setup"}
  });
  assert.equal(roleCreated.response.status,201,JSON.stringify(roleCreated.payload));
  const roleId=roleCreated.payload?.item?.id;
  assert.ok(roleId);

  const createEmployee=async(index)=>{
    const result=await request(`${base}/employees`,{
      method:"POST",token,body:{
        fullName:`E2E Rule Employee ${index+1}`,phone:null,email:employeeEmails[index],baseStoreId:storeId,
        paymentType:"HOURLY",hourlyRate:6+index,fixedMonthlyAmount:null,effectiveFrom:new Date().toISOString(),
        maxDaysPerWeek:6,maxHoursPerWeek:48,minimumDaysOff:1,canChangeStore:false,
        worksMorning:true,worksAfternoon:true,worksNight:true,worksWeekend:true,notes:"Rules E2E",
        roleIds:[roleId],primaryRoleId:roleId,storeAccess:[{storeId,canSchedule:true}],confirmed:true,reason:"E2E employee setup"
      }
    });
    assert.equal(result.response.status,201,JSON.stringify(result.payload));
    return result.payload.item.id;
  };
  const employeeA=await createEmployee(0),employeeB=await createEmployee(1);

  const shiftWithoutConfirmation=await request(`${base}/shift-templates`,{
    method:"POST",token,body:{name:"E2E Βράδυ",code:templateCode,category:"NIGHT",startTime:"23:00",endTime:"07:00",minimumPeople:1,maximumPeople:2,requiredRoleId:roleId,requiresSupervisor:true,changeAllowed:false,reason:"E2E shift setup"}
  });
  assert.equal(shiftWithoutConfirmation.response.status,400,JSON.stringify(shiftWithoutConfirmation.payload));

  const shiftCreated=await request(`${base}/shift-templates`,{
    method:"POST",token,body:{name:"E2E Βράδυ",code:templateCode,category:"NIGHT",startTime:"23:00",endTime:"07:00",minimumPeople:1,maximumPeople:2,requiredRoleId:roleId,requiresSupervisor:true,changeAllowed:false,confirmed:true,reason:"E2E shift setup"}
  });
  assert.equal(shiftCreated.response.status,201,JSON.stringify(shiftCreated.payload));
  const templateId=shiftCreated.payload?.item?.id;
  assert.ok(templateId);
  assert.equal(shiftCreated.payload?.item?.requiredRole?.id,roleId);
  assert.equal(shiftCreated.payload?.item?.startTime,"23:00");
  assert.equal(shiftCreated.payload?.item?.endTime,"07:00");

  const shiftDuplicate=await request(`${base}/shift-templates`,{
    method:"POST",token,body:{name:"E2E Άλλο βράδυ",code:templateCode,category:"NIGHT",startTime:"22:00",endTime:"06:00",minimumPeople:1,maximumPeople:null,requiredRoleId:null,requiresSupervisor:false,changeAllowed:true,confirmed:true,reason:"E2E duplicate guard"}
  });
  assert.equal(shiftDuplicate.response.status,409,JSON.stringify(shiftDuplicate.payload));

  const shiftUpdated=await request(`${base}/shift-templates/${templateId}`,{
    method:"PUT",token,body:{name:"E2E Βράδυ",code:templateCode,category:"NIGHT",startTime:"23:00",endTime:"07:00",minimumPeople:2,maximumPeople:3,requiredRoleId:roleId,requiresSupervisor:true,changeAllowed:true,confirmed:true,reason:"E2E shift update"}
  });
  assert.equal(shiftUpdated.response.status,200,JSON.stringify(shiftUpdated.payload));
  assert.equal(shiftUpdated.payload?.item?.minimumPeople,2);
  assert.equal(shiftUpdated.payload?.item?.maximumPeople,3);

  await setPackage("PERSONNEL_PRO",true);
  const proBootstrap=await request(`${base}/bootstrap`,{token});
  assert.equal(proBootstrap.response.status,200,JSON.stringify(proBootstrap.payload));
  assert.equal(proBootstrap.payload?.capabilities?.rulesManagement,true);

  const ruleWithoutConfirmation=await request(`${base}/rules`,{
    method:"POST",token,body:{employeeId:employeeA,ruleType:"INCOMPATIBLE_EMPLOYEE",severity:"ERROR",relatedEmployeeId:employeeB,value:{},note:"E2E incompatibility",validFrom:null,validTo:null,reason:"E2E rule setup"}
  });
  assert.equal(ruleWithoutConfirmation.response.status,400,JSON.stringify(ruleWithoutConfirmation.payload));

  const ruleCreated=await request(`${base}/rules`,{
    method:"POST",token,body:{employeeId:employeeA,ruleType:"INCOMPATIBLE_EMPLOYEE",severity:"ERROR",relatedEmployeeId:employeeB,value:{},note:"E2E incompatibility",validFrom:null,validTo:null,confirmed:true,reason:"E2E rule setup"}
  });
  assert.equal(ruleCreated.response.status,201,JSON.stringify(ruleCreated.payload));
  const ruleId=ruleCreated.payload?.item?.id;
  assert.ok(ruleId);
  assert.equal(ruleCreated.payload?.item?.relatedEmployeeId,employeeB);

  const duplicateRule=await request(`${base}/rules`,{
    method:"POST",token,body:{employeeId:employeeA,ruleType:"INCOMPATIBLE_EMPLOYEE",severity:"WARNING",relatedEmployeeId:employeeB,value:{},note:null,validFrom:null,validTo:null,confirmed:true,reason:"E2E duplicate rule"}
  });
  assert.equal(duplicateRule.response.status,409,JSON.stringify(duplicateRule.payload));

  const ruleUpdated=await request(`${base}/rules/${ruleId}`,{
    method:"PUT",token,body:{employeeId:employeeA,ruleType:"MIN_DAYS_OFF",severity:"ERROR",relatedEmployeeId:null,value:{days:2},note:"Δύο ρεπό",validFrom:null,validTo:null,confirmed:true,reason:"E2E rule update"}
  });
  assert.equal(ruleUpdated.response.status,200,JSON.stringify(ruleUpdated.payload));
  assert.equal(ruleUpdated.payload?.item?.ruleType,"MIN_DAYS_OFF");
  assert.equal(Number(ruleUpdated.payload?.item?.value?.days),2);

  const ruleDisabled=await request(`${base}/rules/${ruleId}/status`,{method:"PATCH",token,body:{active:false,confirmed:true,reason:"E2E rule deactivate"}});
  assert.equal(ruleDisabled.response.status,200,JSON.stringify(ruleDisabled.payload));
  assert.equal(ruleDisabled.payload?.item?.active,false);
  const ruleEnabled=await request(`${base}/rules/${ruleId}/status`,{method:"PATCH",token,body:{active:true,confirmed:true,reason:"E2E rule activate"}});
  assert.equal(ruleEnabled.response.status,200,JSON.stringify(ruleEnabled.payload));
  assert.equal(ruleEnabled.payload?.item?.active,true);

  const shiftDisabled=await request(`${base}/shift-templates/${templateId}/status`,{method:"PATCH",token,body:{active:false,confirmed:true,reason:"E2E shift deactivate"}});
  assert.equal(shiftDisabled.response.status,200,JSON.stringify(shiftDisabled.payload));
  assert.equal(shiftDisabled.payload?.item?.active,false);
  const shiftEnabled=await request(`${base}/shift-templates/${templateId}/status`,{method:"PATCH",token,body:{active:true,confirmed:true,reason:"E2E shift activate"}});
  assert.equal(shiftEnabled.response.status,200,JSON.stringify(shiftEnabled.payload));
  assert.equal(shiftEnabled.payload?.item?.active,true);

  const employeeRead=await request(`${base}/employees/${employeeA}`,{token});
  assert.equal(employeeRead.response.status,200,JSON.stringify(employeeRead.payload));
  assert.ok(employeeRead.payload?.item?.rules?.some(item=>item.id===ruleId&&item.ruleType==="MIN_DAYS_OFF"));

  const audits=await prisma.workforceAuditLog.count({where:{companyId,entityId:{in:[roleId,employeeA,employeeB,templateId,ruleId]}}});
  assert.ok(audits>=10,`expected at least 10 Workforce audit rows, got ${audits}`);

  const missingApply=await request(`${base}/migration/apply`,{method:"POST",token,body:{previewHash:"not-used"}});
  assert.equal(missingApply.response.status,404,"migration apply was enabled by the rules/shift checkpoint");

  console.log("E2E Workforce v2 rules and shift templates flow passed",{roleId,employeeA,employeeB,templateId,ruleId,audits});
}

try{await main()}finally{await prisma.$disconnect()}
