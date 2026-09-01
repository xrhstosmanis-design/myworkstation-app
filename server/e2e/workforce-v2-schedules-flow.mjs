import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import {PrismaClient} from "@prisma/client";

const prisma=new PrismaClient();
const baseUrl=process.env.E2E_BASE_URL||"http://127.0.0.1:8080";
const companyId="pilot-company",storeId="kat-store";
const ownerEmail=process.env.KAT_OWNER_EMAIL||"ci-kat-owner@myworkstation.test";
const ownerPassword="ci-workforce-v2-schedules-password";
const periodStart="2027-03-01";
const roleCode="E2E_SCHEDULE_ROLE",morningCode="E2E_SCHEDULE_MORNING",afternoonCode="E2E_SCHEDULE_AFTERNOON";
const employeeEmails=["e2e-schedule-a@example.test","e2e-schedule-b@example.test"];

async function request(path,{method="GET",token,body}={}){
  const response=await fetch(`${baseUrl}${path}`,{method,headers:{...(token?{authorization:`Bearer ${token}`}:{ }),...(body!==undefined?{"content-type":"application/json"}:{})},body:body===undefined?undefined:JSON.stringify(body)});
  let payload=null;try{payload=await response.json()}catch{}
  return {response,payload};
}
async function setPackage(key,active){
  await prisma.$executeRawUnsafe(`INSERT INTO "StorePaidModule" ("id","companyId","storeId","moduleKey","active","monthlyPrice","createdAt","updatedAt") VALUES ($1,$2,$3,$4,$5,0,NOW(),NOW()) ON CONFLICT ("storeId","moduleKey") DO UPDATE SET "active"=$5,"startsAt"=NULL,"endsAt"=NULL,"updatedAt"=NOW()`,`e2e-schedules-${key.toLowerCase()}`,companyId,storeId,key,active);
}
async function clean(){
  const schedules=await prisma.workforceSchedule.findMany({where:{companyId,storeId,periodStart:new Date(`${periodStart}T00:00:00.000Z`)},select:{id:true}});
  const scheduleIds=schedules.map(item=>item.id);
  if(scheduleIds.length){
    const assignments=await prisma.workforceScheduleAssignment.findMany({where:{scheduleId:{in:scheduleIds}},select:{id:true}});
    await prisma.workforceAuditLog.deleteMany({where:{entityId:{in:[...scheduleIds,...assignments.map(item=>item.id)]}}});
    await prisma.workforceScheduleAssignment.deleteMany({where:{scheduleId:{in:scheduleIds}}});
    await prisma.workforceSchedule.deleteMany({where:{id:{in:scheduleIds}}});
  }
  const employees=await prisma.workforceEmployee.findMany({where:{companyId,email:{in:employeeEmails}},select:{id:true}}),employeeIds=employees.map(item=>item.id);
  if(employeeIds.length){
    const sessions=await prisma.workforceAttendanceSession.findMany({where:{employeeId:{in:employeeIds}},select:{id:true}});
    await prisma.workforceAuditLog.deleteMany({where:{entityId:{in:sessions.map(item=>item.id)}}});
    await prisma.workforceAttendanceSession.deleteMany({where:{employeeId:{in:employeeIds}}});
    await prisma.workforceTimeClockEntry.deleteMany({where:{employeeId:{in:employeeIds}}});
    const leaves=await prisma.workforceLeaveRequest.findMany({where:{employeeId:{in:employeeIds}},select:{id:true}});
    await prisma.workforceAuditLog.deleteMany({where:{entityId:{in:[...employeeIds,...leaves.map(item=>item.id)]}}});
    await prisma.workforceLeaveRequest.deleteMany({where:{employeeId:{in:employeeIds}}});
    await prisma.workforceEmployeeRule.deleteMany({where:{OR:[{employeeId:{in:employeeIds}},{relatedEmployeeId:{in:employeeIds}}]}});
    await prisma.workforceHourlyRate.deleteMany({where:{employeeId:{in:employeeIds}}});
    await prisma.workforceEmployeeStoreAccess.deleteMany({where:{employeeId:{in:employeeIds}}});
    await prisma.workforceEmployeeRole.deleteMany({where:{employeeId:{in:employeeIds}}});
    await prisma.workforceEmployee.deleteMany({where:{id:{in:employeeIds}}});
  }
  const templates=await prisma.workforceShiftTemplate.findMany({where:{companyId,storeId,code:{in:[morningCode,afternoonCode]}},select:{id:true}}),templateIds=templates.map(item=>item.id);
  if(templateIds.length){await prisma.workforceAuditLog.deleteMany({where:{entityId:{in:templateIds}}});await prisma.workforceShiftTemplate.deleteMany({where:{id:{in:templateIds}}});}
  const roles=await prisma.workforceRole.findMany({where:{companyId,code:roleCode},select:{id:true}}),roleIds=roles.map(item=>item.id);
  if(roleIds.length){await prisma.workforceAuditLog.deleteMany({where:{entityId:{in:roleIds}}});await prisma.workforceRole.deleteMany({where:{id:{in:roleIds}}});}
}

async function main(){
  await prisma.company.update({where:{id:companyId},data:{active:true,licenseStatus:"ACTIVE",subscriptionEndsAt:new Date(Date.now()+7*86400000)}});
  await prisma.store.update({where:{id:storeId},data:{active:true}});
  await setPackage("PERSONNEL_BASIC",true);await setPackage("PERSONNEL_PRO",true);await clean();
  await prisma.user.update({where:{email:ownerEmail},data:{passwordHash:await bcrypt.hash(ownerPassword,4),mustChangePassword:false,role:"OWNER",companyId}});
  const login=await request("/api/auth/login",{method:"POST",body:{email:ownerEmail,password:ownerPassword,deviceName:"CI Workforce schedules E2E"}});
  assert.equal(login.response.status,200,JSON.stringify(login.payload));const token=login.payload.token;
  const base=`/api/platform/store-modules/companies/${companyId}/stores/${storeId}/workforce-v2`;
  const role=await request(`${base}/roles`,{method:"POST",token,body:{name:"E2E Ρόλος Προγράμματος",code:roleCode,description:"Schedule E2E",confirmed:true,reason:"E2E schedule role"}});
  assert.equal(role.response.status,201,JSON.stringify(role.payload));const roleId=role.payload.item.id;
  const createEmployee=async(index)=>{
    const result=await request(`${base}/employees`,{method:"POST",token,body:{fullName:`E2E Schedule Employee ${index+1}`,phone:null,email:employeeEmails[index],baseStoreId:storeId,paymentType:"HOURLY",hourlyRate:6,effectiveFrom:new Date().toISOString(),maxDaysPerWeek:6,maxHoursPerWeek:48,minimumDaysOff:1,canChangeStore:false,worksMorning:true,worksAfternoon:true,worksNight:false,worksWeekend:true,notes:"Schedule E2E",roleIds:[roleId],primaryRoleId:roleId,storeAccess:[{storeId,canSchedule:true}],confirmed:true,reason:"E2E schedule employee"}});
    assert.equal(result.response.status,201,JSON.stringify(result.payload));return result.payload.item.id;
  };
  const employeeA=await createEmployee(0),employeeB=await createEmployee(1);
  const createTemplate=async({name,code,category,startTime,endTime})=>{
    const result=await request(`${base}/shift-templates`,{method:"POST",token,body:{name,code,category,startTime,endTime,minimumPeople:1,maximumPeople:2,requiredRoleId:roleId,requiresSupervisor:false,changeAllowed:true,confirmed:true,reason:"E2E schedule template"}});
    assert.equal(result.response.status,201,JSON.stringify(result.payload));return result.payload.item.id;
  };
  const morningId=await createTemplate({name:"E2E Πρωί",code:morningCode,category:"MORNING",startTime:"07:00",endTime:"15:00"});
  const afternoonId=await createTemplate({name:"E2E Απόγευμα",code:afternoonCode,category:"AFTERNOON",startTime:"15:00",endTime:"23:00"});
  const created=await request(`${base}/schedules`,{method:"POST",token,body:{periodStart,periodType:"WEEK",confirmed:true,reason:"E2E δημιουργία draft"}});
  assert.equal(created.response.status,201,JSON.stringify(created.payload));const schedule=created.payload.item;
  const add=async({employeeId,shiftTemplateId,slot=1})=>{
    const result=await request(`${base}/schedules/${schedule.id}/assignments`,{method:"POST",token,body:{version:schedule.version,date:periodStart,employeeId,shiftTemplateId,slot,confirmed:true,reason:"E2E ανάθεση"}});
    schedule.version=result.payload?.version||schedule.version;return result;
  };
  const first=await add({employeeId:employeeA,shiftTemplateId:morningId});assert.equal(first.response.status,201,JSON.stringify(first.payload));
  const second=await add({employeeId:employeeA,shiftTemplateId:afternoonId});assert.equal(second.response.status,201,JSON.stringify(second.payload));assert.ok(second.payload.warnings.some(item=>item.ruleCode==="DOUBLE_SHIFT"));assert.ok(second.payload.warnings.some(item=>item.ruleCode==="HOURS_EXCEEDED"));
  const preview=await request(`${base}/schedules/${schedule.id}/transition`,{method:"POST",token,body:{version:schedule.version,status:"PREVIEWED",confirmed:true,reason:"E2E προεπισκόπηση"}});assert.equal(preview.response.status,200,JSON.stringify(preview.payload));schedule.version=preview.payload.item.version;
  const read=await request(`${base}/schedules?from=${periodStart}`,{token});assert.equal(read.response.status,200,JSON.stringify(read.payload));const activeSchedule=read.payload.items.find(item=>item.id===schedule.id),warningAssignment=activeSchedule.assignments.find(item=>item.shiftTemplate.id===afternoonId);
  for(const warning of warningAssignment.warningJson){const exception=await request(`${base}/schedules/${schedule.id}/exceptions`,{method:"POST",token,body:{assignmentId:warningAssignment.id,ruleCode:warning.ruleCode,confirmed:true,reason:`E2E έγκριση ${warning.ruleCode}`}});assert.equal(exception.response.status,201,JSON.stringify(exception.payload));}
  const approved=await request(`${base}/schedules/${schedule.id}/transition`,{method:"POST",token,body:{version:schedule.version,status:"APPROVED",confirmed:true,reason:"E2E έγκριση προγράμματος"}});assert.equal(approved.response.status,200,JSON.stringify(approved.payload));schedule.version=approved.payload.item.version;
  const published=await request(`${base}/schedules/${schedule.id}/transition`,{method:"POST",token,body:{version:schedule.version,status:"PUBLISHED",confirmed:true,reason:"E2E δημοσίευση προγράμματος"}});assert.equal(published.response.status,200,JSON.stringify(published.payload));
  const revision=await request(`${base}/schedules`,{method:"POST",token,body:{periodStart,periodType:"WEEK",confirmed:true,reason:"E2E νέα έκδοση δημοσιευμένου"}});assert.equal(revision.response.status,201,JSON.stringify(revision.payload));assert.equal(revision.payload.copiedFromPublished,true);assert.equal(revision.payload.item.status,"DRAFT");assert.equal(revision.payload.item.version,published.payload.item.version+1);
  const leave=await request(`${base}/leaves`,{method:"POST",token,body:{employeeId:employeeB,storeId,startDate:"2027-03-02",endDate:"2027-03-02",leaveType:"DAY_OFF",comments:"E2E ρεπό",confirmed:true,reason:"E2E αίτημα ρεπό"}});assert.equal(leave.response.status,201,JSON.stringify(leave.payload));
  const leaveApproved=await request(`${base}/leaves/${leave.payload.item.id}/decision`,{method:"POST",token,body:{status:"APPROVED",confirmed:true,reason:"E2E έγκριση ρεπό"}});assert.equal(leaveApproved.response.status,200,JSON.stringify(leaveApproved.payload));
  const blockedLeaveAssignment=await request(`${base}/schedules/${revision.payload.item.id}/assignments`,{method:"POST",token,body:{version:revision.payload.item.version,date:"2027-03-02",employeeId:employeeB,shiftTemplateId:morningId,confirmed:true,reason:"E2E άδεια block"}});assert.equal(blockedLeaveAssignment.response.status,409,JSON.stringify(blockedLeaveAssignment.payload));
  const validation=await request(`${base}/schedules/${revision.payload.item.id}/validation`,{token});assert.equal(validation.response.status,200,JSON.stringify(validation.payload));
  const audits=await prisma.workforceAuditLog.count({where:{companyId,action:{startsWith:"WORKFORCE_"}}});assert.ok(audits>=12,`expected Workforce audit rows, got ${audits}`);
  const auditFeed=await request(`${base}/audit`,{token});assert.equal(auditFeed.response.status,200,JSON.stringify(auditFeed.payload));assert.ok(auditFeed.payload.items.some(item=>item.action==="WORKFORCE_EXCEPTION_APPROVED"&&item.reason));assert.ok(auditFeed.payload.items.some(item=>item.action==="WORKFORCE_LEAVE_APPROVED"&&item.employeeName));
  const clockIn=await request(`${base}/attendance/clock`,{method:"POST",token,body:{employeeId:employeeA,eventType:"IN",confirmed:true,reason:"E2E έναρξη παρουσίας"}});assert.equal(clockIn.response.status,201,JSON.stringify(clockIn.payload));
  const attendanceOpen=await request(`${base}/attendance?date=${new Date().toISOString().slice(0,10)}`,{token});assert.equal(attendanceOpen.response.status,200,JSON.stringify(attendanceOpen.payload));assert.ok(attendanceOpen.payload.items.some(item=>item.id===clockIn.payload.item.id&&item.status==="OPEN"));
  const clockOut=await request(`${base}/attendance/clock`,{method:"POST",token,body:{employeeId:employeeA,eventType:"OUT",confirmed:true,reason:"E2E λήξη παρουσίας"}});assert.equal(clockOut.response.status,201,JSON.stringify(clockOut.payload));
  const publishedMorningAssignment=published.payload.item.assignments.find(item=>item.shiftTemplate.id===morningId);
  await prisma.workforceAttendanceSession.update({where:{id:clockIn.payload.item.id},data:{startedAt:new Date(`${periodStart}T07:00:00.000Z`),endedAt:new Date(`${periodStart}T15:30:00.000Z`),scheduledAssignmentId:publishedMorningAssignment.id,workedMinutes:510,status:"NEEDS_APPROVAL",issueJson:{issues:[{code:"OVER_8_HOURS",message:"E2E υπέρβαση 8 ωρών."}],scheduledMinutes:480}}});
  const overEight=await request(`${base}/attendance?date=${periodStart}`,{token});assert.equal(overEight.response.status,200,JSON.stringify(overEight.payload));assert.equal(overEight.payload.summary.scheduledMinutes,480);assert.equal(overEight.payload.summary.varianceMinutes,30);assert.ok(overEight.payload.items.some(item=>item.id===clockIn.payload.item.id&&item.status==="NEEDS_APPROVAL"&&item.scheduledMinutes===480&&item.varianceMinutes===30));
  const overEightApproval=await request(`${base}/attendance/${clockIn.payload.item.id}/approve-over-8-hours`,{method:"POST",token,body:{confirmed:true,reason:"E2E έγκριση υπέρβασης 8 ωρών"}});assert.equal(overEightApproval.response.status,200,JSON.stringify(overEightApproval.payload));assert.equal(overEightApproval.payload.item.status,"APPROVED");
  const attendanceClosed=await request(`${base}/attendance?date=${periodStart}`,{token});assert.equal(attendanceClosed.response.status,200,JSON.stringify(attendanceClosed.payload));assert.ok(attendanceClosed.payload.items.some(item=>item.id===clockIn.payload.item.id&&item.status==="APPROVED"));
  const attendanceAudit=await request(`${base}/audit`,{token});assert.equal(attendanceAudit.response.status,200,JSON.stringify(attendanceAudit.payload));assert.ok(attendanceAudit.payload.items.some(item=>item.action==="WORKFORCE_CLOCK_IN"&&item.reason));assert.ok(attendanceAudit.payload.items.some(item=>item.action==="WORKFORCE_CLOCK_OUT"&&item.reason));assert.ok(attendanceAudit.payload.items.some(item=>item.action==="WORKFORCE_OVER_8_HOURS_APPROVED"&&item.reason));
  console.log("E2E Workforce v2 schedules flow passed",{scheduleId:schedule.id,revisionId:revision.payload.item.id,employeeA,employeeB,audits});
}

try{await main()}finally{await prisma.$disconnect()}
