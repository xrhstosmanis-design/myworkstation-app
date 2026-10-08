import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import {PrismaClient} from "@prisma/client";

const prisma=new PrismaClient();
const baseUrl=process.env.E2E_BASE_URL||"http://127.0.0.1:8080";
const companyId="pilot-company";
const storeId="kat-store";
const secondaryStoreId="e2e-workforce-store-2";
const ownerEmail=process.env.KAT_OWNER_EMAIL||"ci-kat-owner@myworkstation.test";
const ownerPassword="ci-workforce-v2-password";
const roleCode="E2E_WORKFORCE_CASHIER";
const legacyEmployeeId="e2e-workforce-legacy-employee";

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

async function activateBasic(targetStoreId){
  await prisma.$executeRawUnsafe(`
    INSERT INTO "StorePaidModule" ("id","companyId","storeId","moduleKey","active","monthlyPrice","createdAt","updatedAt")
    VALUES ($1,$2,$3,'PERSONNEL_BASIC',TRUE,0,NOW(),NOW())
    ON CONFLICT ("storeId","moduleKey") DO UPDATE SET "active"=TRUE,"startsAt"=NULL,"endsAt"=NULL,"updatedAt"=NOW()
  `,`e2e-basic-${targetStoreId}`,companyId,targetStoreId);
}

async function main(){
  await prisma.company.update({where:{id:companyId},data:{active:true,licenseStatus:"ACTIVE",subscriptionEndsAt:new Date(Date.now()+7*24*60*60*1000)}});
  await prisma.store.update({where:{id:storeId},data:{active:true}});
  await prisma.store.upsert({
    where:{id:secondaryStoreId},
    update:{companyId,name:"E2E Workforce Δεύτερο Κατάστημα",active:true},
    create:{id:secondaryStoreId,companyId,name:"E2E Workforce Δεύτερο Κατάστημα",active:true,city:"Αθήνα"}
  });
  await activateBasic(storeId);
  await activateBasic(secondaryStoreId);

  const owner=await prisma.user.update({
    where:{email:ownerEmail},
    data:{passwordHash:await bcrypt.hash(ownerPassword,4),mustChangePassword:false,role:"OWNER",companyId}
  });

  const existingRoles=await prisma.workforceRole.findMany({where:{companyId,code:roleCode},select:{id:true}});
  const existingRoleIds=existingRoles.map(row=>row.id);
  if(existingRoleIds.length){
    const existingEmployees=await prisma.workforceEmployee.findMany({where:{companyId,roleAssignments:{some:{roleId:{in:existingRoleIds}}}},select:{id:true}});
    const employeeIds=existingEmployees.map(row=>row.id);
    if(employeeIds.length){
      await prisma.workforceAuditLog.deleteMany({where:{entityId:{in:employeeIds}}});
      await prisma.workforceHourlyRate.deleteMany({where:{employeeId:{in:employeeIds}}});
      await prisma.workforceEmployeeStoreAccess.deleteMany({where:{employeeId:{in:employeeIds}}});
      await prisma.workforceEmployeeRole.deleteMany({where:{employeeId:{in:employeeIds}}});
      await prisma.workforceEmployee.deleteMany({where:{id:{in:employeeIds}}});
    }
    await prisma.workforceAuditLog.deleteMany({where:{entityId:{in:existingRoleIds}}});
    await prisma.workforceRole.deleteMany({where:{id:{in:existingRoleIds}}});
  }
  await prisma.employee.deleteMany({where:{id:legacyEmployeeId}});

  const login=await request("/api/auth/login",{method:"POST",body:{email:ownerEmail,password:ownerPassword,deviceName:"CI Workforce v2 E2E"}});
  assert.equal(login.response.status,200,JSON.stringify(login.payload));
  const token=login.payload?.token;
  assert.ok(token);

  const base=`/api/platform/store-modules/companies/${companyId}/stores/${storeId}/workforce-v2`;
  const bootstrap=await request(`${base}/bootstrap`,{token});
  assert.equal(bootstrap.response.status,200,JSON.stringify(bootstrap.payload));
  assert.equal(bootstrap.payload?.migration?.mode,"REVIEW_REQUIRED");
  assert.equal(bootstrap.payload?.migration?.applyAvailable,false);
  assert.ok(bootstrap.payload?.stores?.some(row=>row.id===secondaryStoreId));

  const roleWithoutConfirmation=await request(`${base}/roles`,{
    method:"POST",token,body:{name:"E2E Ταμίας Workforce",code:roleCode,description:"E2E role",reason:"E2E role setup"}
  });
  assert.equal(roleWithoutConfirmation.response.status,400,JSON.stringify(roleWithoutConfirmation.payload));

  const roleCreated=await request(`${base}/roles`,{
    method:"POST",token,
    body:{name:"E2E Ταμίας Workforce",code:roleCode,description:"E2E role",confirmed:true,reason:"E2E role setup"}
  });
  assert.equal(roleCreated.response.status,201,JSON.stringify(roleCreated.payload));
  const roleId=roleCreated.payload?.item?.id;
  assert.ok(roleId);

  const roleUpdated=await request(`${base}/roles/${roleId}`,{
    method:"PUT",token,
    body:{name:"E2E Ταμίας Workforce",code:roleCode,description:"E2E role updated",confirmed:true,reason:"E2E role update"}
  });
  assert.equal(roleUpdated.response.status,200,JSON.stringify(roleUpdated.payload));
  assert.equal(roleUpdated.payload?.item?.description,"E2E role updated");

  const employeeBody={
    fullName:"E2E Workforce Employee",
    phone:"2100000000",
    email:"e2e-workforce@example.test",
    baseStoreId:storeId,
    paymentType:"HOURLY",
    hourlyRate:5.75,
    fixedMonthlyAmount:null,
    effectiveFrom:new Date().toISOString(),
    maxDaysPerWeek:6,
    maxHoursPerWeek:48,
    minimumDaysOff:1,
    canChangeStore:true,
    worksMorning:true,
    worksAfternoon:true,
    worksNight:false,
    worksWeekend:true,
    notes:"E2E multi-store employee",
    roleIds:[roleId],
    primaryRoleId:roleId,
    storeAccess:[{storeId,canSchedule:true},{storeId:secondaryStoreId,canSchedule:true}],
    reason:"E2E employee setup"
  };

  const employeeWithoutConfirmation=await request(`${base}/employees`,{method:"POST",token,body:employeeBody});
  assert.equal(employeeWithoutConfirmation.response.status,400,JSON.stringify(employeeWithoutConfirmation.payload));

  const employeeCreated=await request(`${base}/employees`,{
    method:"POST",token,body:{...employeeBody,confirmed:true}
  });
  assert.equal(employeeCreated.response.status,201,JSON.stringify(employeeCreated.payload));
  const employeeId=employeeCreated.payload?.item?.id;
  assert.ok(employeeId);
  assert.equal(employeeCreated.payload.item.storeAccess.length,2);
  assert.equal(employeeCreated.payload.item.primaryRole.id,roleId);
  assert.equal(Number(employeeCreated.payload.item.currentHourlyRate.hourlyRate),5.75);

  const employeeRead=await request(`${base}/employees/${employeeId}`,{token});
  assert.equal(employeeRead.response.status,200,JSON.stringify(employeeRead.payload));
  assert.equal(employeeRead.payload?.item?.fullName,"E2E Workforce Employee");
  assert.ok(employeeRead.payload?.item?.storeAccess?.some(row=>row.storeId===secondaryStoreId));

  // Isolated CI fixture only: verify actual SQL and HTTP without relying on cached close totals.
  const monthlyOperator="e2e-task26-operator",monthlyShift="e2e-task26-shift";
  await prisma.$executeRaw`INSERT INTO "StoreOperatorCredential" ("id","companyId","storeId","employeeId","displayName","createdBy") VALUES (${monthlyOperator},${companyId},${storeId},${employeeId},'Monthly fixture',${owner.id})`;
  try{
    await prisma.$executeRaw`INSERT INTO "CashShiftSession" ("id","companyId","storeId","terminalPos","status","openedBy","openedAt","cashSales") VALUES (${monthlyShift},${companyId},${storeId},'E2E-TASK26','OPEN',${monthlyOperator},'2026-09-01T00:00:00Z'::timestamptz,999)`;
    for(const [id,at,amount,reversed] of [
      ['start','2026-09-30T21:00:00Z',1.2,false],
      ['inside','2026-10-15T12:00:00Z',2.4,false],
      ['before','2026-09-30T20:59:59Z',100,false],
      ['end','2026-10-31T22:00:00Z',200,false],
      ['reversed','2026-10-15T12:00:00Z',300,true]
    ]){
      await prisma.$executeRaw`INSERT INTO "StoreTransaction" ("id","companyId","storeId","sessionId","type","amount","actorId","actorName","occurredAt","reversedAt") VALUES (${`e2e-task26-${id}`},${companyId},${storeId},${monthlyShift},'SALE_CASH',${amount},${monthlyOperator},'Monthly fixture',${new Date(at)},${reversed?new Date(at):null})`;
    }
    const snapshot=await prisma.$queryRaw`SELECT COUNT(*)::int AS "count",SUM("amount") AS "total" FROM "StoreTransaction" WHERE "sessionId"=${monthlyShift}`;
    const monthly=await request(`${base}/employees/${employeeId}/performance?month=2026-10`,{token});
    assert.equal(monthly.response.status,200,JSON.stringify(monthly.payload));
    assert.equal(monthly.payload.cashier.totalSales,3.6);
    assert.equal(monthly.payload.cashier.transactions,2);
    assert.equal(monthly.payload.cashier.reversed,1);
    assert.equal(monthly.payload.cashier.openShifts,1);
    assert.equal(monthly.payload.cashier.variance,0);
    assert.equal(monthly.payload.cashier.recentShifts[0].id,monthlyShift);
    assert.equal(monthly.payload.cashier.recentShifts[0].variance,null);
    assert.equal(monthly.payload.period.from,'2026-09-30T21:00:00.000Z');
    assert.equal(monthly.payload.period.to,'2026-10-31T22:00:00.000Z');
    const secondBase=`/api/platform/store-modules/companies/${companyId}/stores/${secondaryStoreId}/workforce-v2`;
    const otherStore=await request(`${secondBase}/employees/${employeeId}/performance?month=2026-10`,{token});
    assert.equal(otherStore.response.status,200,JSON.stringify(otherStore.payload));
    assert.equal(otherStore.payload.cashier.totalSales,0);
    assert.equal(otherStore.payload.cashier.linked,false);
    const wrongCompany=await request(`/api/platform/store-modules/companies/foreign/stores/${storeId}/workforce-v2/employees/${employeeId}/performance?month=2026-10`,{token});
    assert.equal(wrongCompany.response.status,404);
    const invalidMonth=await request(`${base}/employees/${employeeId}/performance?month=2026-13`,{token});
    assert.equal(invalidMonth.response.status,400);
    const after=await prisma.$queryRaw`SELECT COUNT(*)::int AS "count",SUM("amount") AS "total" FROM "StoreTransaction" WHERE "sessionId"=${monthlyShift}`;
    assert.deepEqual(after,snapshot,'monthly reads altered ledger');
    console.log('E2E monthly cashier actual SQL, Athens boundaries, reversal, open cached totals, store/tenant and read-only checks passed');
  }finally{
    await prisma.$executeRaw`DELETE FROM "StoreTransaction" WHERE "sessionId"=${monthlyShift}`;
    await prisma.$executeRaw`DELETE FROM "CashShiftSession" WHERE "id"=${monthlyShift}`;
    await prisma.$executeRaw`DELETE FROM "StoreOperatorCredential" WHERE "id"=${monthlyOperator}`;
  }

  const roleInUse=await request(`${base}/roles/${roleId}/status`,{
    method:"PATCH",token,body:{active:false,confirmed:true,reason:"E2E dependency guard"}
  });
  assert.equal(roleInUse.response.status,409,JSON.stringify(roleInUse.payload));

  await prisma.employee.create({data:{
    id:legacyEmployeeId,
    fullName:"E2E Legacy Ready Employee",
    phone:"2101111111",
    email:"e2e-legacy-ready@example.test",
    position:"E2E Ταμίας Workforce",
    type:"PERMANENT",
    active:true,
    maxDaysPerWeek:5,
    allowSixthDay:false,
    maxHoursPerWeek:40,
    storeId
  }});

  const beforePreview=await prisma.workforceEmployee.count({where:{companyId}});
  const preview=await request(`${base}/migration/preview`,{
    method:"POST",token,body:{scope:"STORE",includeInactive:false,legacyEmployeeIds:[legacyEmployeeId]}
  });
  assert.equal(preview.response.status,200,JSON.stringify(preview.payload));
  assert.equal(preview.payload?.mode,"REVIEW_REQUIRED");
  assert.equal(preview.payload?.readOnly,true);
  assert.equal(preview.payload?.applyAvailable,false);
  assert.equal(preview.payload?.applyEndpoint,null);
  assert.match(preview.payload?.previewHash||"",/^[a-f0-9]{64}$/);
  const legacyRow=preview.payload?.rows?.find(row=>row.legacy?.id===legacyEmployeeId);
  assert.ok(legacyRow,JSON.stringify(preview.payload));
  assert.equal(legacyRow.status,"READY");
  assert.equal(legacyRow.proposed.primaryRoleId,roleId);
  const afterPreview=await prisma.workforceEmployee.count({where:{companyId}});
  assert.equal(afterPreview,beforePreview,"migration preview created a Workforce employee");
  const linked=await prisma.workforceEmployee.count({where:{legacyEmployeeId}});
  assert.equal(linked,0,"preview linked a legacy employee");

  const ownerApply=await request(`${base}/migration/apply`,{method:"POST",token,body:{previewHash:preview.payload.previewHash}});
  assert.equal(ownerApply.response.status,403,"a non-Platform-Super-Admin applied a migration");

  const wrongTenant=await request(`/api/platform/store-modules/companies/not-${companyId}/stores/${storeId}/workforce-v2/bootstrap`,{token});
  assert.equal(wrongTenant.response.status,404,JSON.stringify(wrongTenant.payload));

  // The Owner BackOffice now uses these same card/invitation endpoints.
  const cardPath=`${base}/employees/${employeeId}/work-card`;
  const card=await request(cardPath,{method:"POST",token});
  assert.equal(card.response.status,200,JSON.stringify(card.payload));
  assert.equal(card.payload.store.id,storeId);
  assert.ok(card.payload.cardCode);
  assert.ok(card.payload.mobileUrl.startsWith(`/store/${storeId}?employee-card=1`));
  assert.equal((await request(`/api/platform/store-modules/companies/not-${companyId}/stores/${storeId}/workforce-v2/employees/${employeeId}/work-card`,{method:"POST",token})).response.status,404);
  const cardAuditBefore=await prisma.workforceAuditLog.count({where:{companyId,action:"WORKFORCE_WORK_CARD_PREPARED"}});
  // Expiry must block both the panel and credential preparation. Isolated CI only.
  const packages=await prisma.$queryRaw`SELECT "id","active","startsAt","endsAt" FROM "StorePaidModule" WHERE "storeId"=${storeId} AND "moduleKey" IN ('PERSONNEL_BASIC','PERSONNEL_PRO','PERSONNEL_AI','PERSONNEL_PAYROLL','AI_STAFF_SCHEDULER')`;
  try{
    await prisma.$executeRaw`UPDATE "StorePaidModule" SET "active"=FALSE WHERE "storeId"=${storeId} AND "moduleKey" IN ('PERSONNEL_BASIC','PERSONNEL_PRO','PERSONNEL_AI','PERSONNEL_PAYROLL','AI_STAFF_SCHEDULER')`;
    assert.equal((await request(`${base}/bootstrap`,{token})).response.status,403);
    assert.equal((await request(cardPath,{method:"POST",token})).response.status,403);
    await prisma.$executeRaw`UPDATE "StorePaidModule" SET "active"=TRUE,"endsAt"=NOW()-INTERVAL '1 minute' WHERE "storeId"=${storeId} AND "moduleKey"='PERSONNEL_BASIC'`;
    assert.equal((await request(`${base}/bootstrap`,{token})).response.status,403);
    assert.equal((await request(cardPath,{method:"POST",token})).response.status,403);
    assert.equal(await prisma.workforceAuditLog.count({where:{companyId,action:"WORKFORCE_WORK_CARD_PREPARED"}}),cardAuditBefore);
  }finally{
    for(const row of packages)await prisma.$executeRaw`UPDATE "StorePaidModule" SET "active"=${row.active},"startsAt"=${row.startsAt},"endsAt"=${row.endsAt} WHERE "id"=${row.id}`;
  }

  const employeeDisabled=await request(`${base}/employees/${employeeId}/status`,{
    method:"PATCH",token,body:{active:false,confirmed:true,reason:"E2E status audit"}
  });
  assert.equal(employeeDisabled.response.status,200,JSON.stringify(employeeDisabled.payload));
  assert.equal(employeeDisabled.payload?.item?.active,false);

  const audits=await prisma.workforceAuditLog.count({where:{companyId,entityId:{in:[roleId,employeeId]}}});
  assert.ok(audits>=4,`expected Workforce audit rows, got ${audits}`);

  console.log("E2E Workforce v2 employee/role/preview flow passed",{roleId,employeeId,audits,previewHash:preview.payload.previewHash});
}

try{await main()}finally{await prisma.$disconnect()}
