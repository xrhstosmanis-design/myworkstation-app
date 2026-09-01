import {Router} from "express";
import {z} from "zod";
import {prisma} from "../prisma.js";
import {audit,contextFor,loadEmployee} from "./workforce-v2-access.js";
import {confirmed} from "./workforce-v2-validation.js";

const router=Router({mergeParams:true});
const dateText=z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const dayStart=value=>new Date(`${value}T00:00:00.000Z`);
const iso=value=>new Date(value).toISOString().slice(0,10);
const minutes=value=>Math.max(0,Math.round(Number(value||0)));
const shiftMinutes=template=>{const [sh,sm]=template.startTime.split(":").map(Number),[eh,em]=template.endTime.split(":").map(Number),raw=eh*60+em-sh*60-sm;return raw<=0?raw+1440:raw};
const atShiftTime=(date,time)=>new Date(`${date}T${time}:00.000Z`);
const assignmentInclude={shiftTemplate:true};

function isApprovalUser(user){return user?.platformRole==="SUPER_ADMIN"||["SUPER_ADMIN","OWNER"].includes(user?.role)}
function issueSummary(session,assignment){
  const issues=[];
  if(session.workedMinutes>480)issues.push({code:"OVER_8_HOURS",message:`Υπέρβαση ορίου 8 ωρών: ${session.workedMinutes-480} λεπτά.`});
  if(session.lateMinutes)issues.push({code:"LATE_ARRIVAL",message:`Καθυστέρηση ${session.lateMinutes} λεπτών.`});
  if(session.earlyLeaveMinutes)issues.push({code:"EARLY_DEPARTURE",message:`Πρόωρη αποχώρηση ${session.earlyLeaveMinutes} λεπτών.`});
  if(session.overtimeMinutes)issues.push({code:"OVERTIME",message:`Υπέρβαση ${session.overtimeMinutes} λεπτών.`});
  return {issues,scheduledMinutes:assignment?shiftMinutes(assignment.shiftTemplate):null};
}
function serializeSession(session){
  const assignment=session.scheduledAssignmentId&&session.assignment?{id:session.assignment.id,date:iso(session.assignment.date),shiftTemplate:{id:session.assignment.shiftTemplate.id,name:session.assignment.shiftTemplate.name,startTime:session.assignment.shiftTemplate.startTime,endTime:session.assignment.shiftTemplate.endTime}}:null;
  return {id:session.id,employee:{id:session.employee.id,fullName:session.employee.fullName},startedAt:session.startedAt,endedAt:session.endedAt,workedMinutes:minutes(session.workedMinutes),lateMinutes:minutes(session.lateMinutes),earlyLeaveMinutes:minutes(session.earlyLeaveMinutes),overtimeMinutes:minutes(session.overtimeMinutes),status:session.status,issues:Array.isArray(session.issueJson?.issues)?session.issueJson.issues:[],assignment};
}
async function publishedAssignment(context,employeeId,date){
  const at=dayStart(date);
  return prisma.workforceScheduleAssignment.findFirst({where:{employeeId,date:at,schedule:{companyId:context.company.id,storeId:context.store.id,status:"PUBLISHED"}},include:assignmentInclude,orderBy:{createdAt:"desc"}});
}

router.get("/",async(req,res,next)=>{try{
  const context=await contextFor(req),query=z.object({date:dateText}).parse(req.query||{}),start=dayStart(query.date),end=new Date(start.getTime()+86400000);
  const sessions=await prisma.workforceAttendanceSession.findMany({where:{companyId:context.company.id,storeId:context.store.id,startedAt:{gte:start,lt:end}},include:{employee:true},orderBy:[{startedAt:"asc"}]});
  const sessionIds=sessions.map(item=>item.scheduledAssignmentId).filter(Boolean),assignments=sessionIds.length?await prisma.workforceScheduleAssignment.findMany({where:{id:{in:sessionIds}},include:assignmentInclude}):[];
  const map=new Map(assignments.map(item=>[item.id,item]));
  const rows=sessions.map(item=>serializeSession({...item,assignment:map.get(item.scheduledAssignmentId)||null}));
  const employees=await prisma.workforceEmployee.findMany({where:{companyId:context.company.id,active:true,OR:[{baseStoreId:context.store.id},{storeAccess:{some:{storeId:context.store.id,active:true}}}]},select:{id:true,fullName:true},orderBy:{fullName:"asc"}});
  res.json({date:query.date,employees,items:rows,canApprove:isApprovalUser(req.user),summary:{open:rows.filter(row=>row.status==="OPEN").length,closed:rows.filter(row=>!["OPEN","NEEDS_APPROVAL"].includes(row.status)).length,workedMinutes:rows.reduce((total,row)=>total+row.workedMinutes,0),review:rows.filter(row=>["NEEDS_REVIEW","NEEDS_APPROVAL"].includes(row.status)).length}});
}catch(error){next(error)}});

const clockBody=z.object({employeeId:z.string().min(1),eventType:z.enum(["IN","OUT"]),note:z.string().trim().max(500).optional().nullable(),confirmed,reason:z.string().trim().min(3).max(500)});
router.post("/clock",async(req,res,next)=>{try{
  if(!isApprovalUser(req.user))throw Object.assign(new Error("Μόνο Super Admin ή Ιδιοκτήτης καταχωρίζει χειροκίνητα κάρτα παρουσίας."),{status:403});
  const context=await contextFor(req),body=clockBody.parse(req.body||{}),employee=await loadEmployee(req,context,body.employeeId),now=new Date(),date=iso(now);
  const open=await prisma.workforceAttendanceSession.findFirst({where:{companyId:context.company.id,storeId:context.store.id,employeeId:employee.id,status:"OPEN"},orderBy:{startedAt:"desc"}});
  if(body.eventType==="IN"&&open)throw Object.assign(new Error("Υπάρχει ήδη ανοιχτή παρουσία για τον εργαζόμενο."),{status:409});
  if(body.eventType==="OUT"&&!open)throw Object.assign(new Error("Δεν υπάρχει ανοιχτή παρουσία για λήξη."),{status:409});
  const assignment=body.eventType==="IN"?await publishedAssignment(context,employee.id,date):null;
  const result=await prisma.$transaction(async tx=>{
    const entry=await tx.workforceTimeClockEntry.create({data:{companyId:context.company.id,storeId:context.store.id,employeeId:employee.id,eventType:body.eventType,method:"SUPERVISOR",occurredAt:now,sourceShiftId:assignment?.id||open?.scheduledAssignmentId||null,note:body.note||null,createdByUserId:req.user.id}});
    let session;
    if(body.eventType==="IN"){
      const expected=assignment?atShiftTime(date,assignment.shiftTemplate.startTime):null,late=expected?Math.max(0,Math.round((now-expected)/60000)):0;
      session=await tx.workforceAttendanceSession.create({data:{companyId:context.company.id,storeId:context.store.id,employeeId:employee.id,scheduledAssignmentId:assignment?.id||null,clockInEntryId:entry.id,startedAt:now,lateMinutes:late,status:late?"NEEDS_REVIEW":"OPEN"}});
    }else{
      const source=open.scheduledAssignmentId?await tx.workforceScheduleAssignment.findUnique({where:{id:open.scheduledAssignmentId},include:assignmentInclude}):null;
      const worked=Math.max(0,Math.round((now-new Date(open.startedAt))/60000)),expectedEnd=source?atShiftTime(iso(open.startedAt),source.shiftTemplate.endTime):null,early=expectedEnd?Math.max(0,Math.round((expectedEnd-now)/60000)):0,over=source?Math.max(0,worked-shiftMinutes(source.shiftTemplate)):0;
      const draft={...open,endedAt:now,workedMinutes:worked,earlyLeaveMinutes:early,overtimeMinutes:over};
      session=await tx.workforceAttendanceSession.update({where:{id:open.id},data:{clockOutEntryId:entry.id,endedAt:now,workedMinutes:worked,earlyLeaveMinutes:early,overtimeMinutes:over,status:worked>480?"NEEDS_APPROVAL":(open.lateMinutes||early||over)?"NEEDS_REVIEW":"CLOSED",issueJson:issueSummary(draft,source)}});
    }
    await audit(tx,req,{companyId:context.company.id,storeId:context.store.id,action:body.eventType==="IN"?"WORKFORCE_CLOCK_IN":"WORKFORCE_CLOCK_OUT",entityType:"WORKFORCE_ATTENDANCE_SESSION",entityId:session.id,after:{employeeId:employee.id,date,shiftTemplateId:assignment?.shiftTemplateId||null,eventType:body.eventType,workedMinutes:session.workedMinutes},reason:body.reason});
    return session;
  });
  res.status(201).json({item:serializeSession({...result,employee,assignment})});
}catch(error){next(error)}});

const approvalBody=z.object({confirmed,reason:z.string().trim().min(3).max(500)});
router.post("/:sessionId/approve-over-8-hours",async(req,res,next)=>{try{
  if(!isApprovalUser(req.user))throw Object.assign(new Error("Μόνο Super Admin ή Ιδιοκτήτης εγκρίνει υπέρβαση 8 ωρών."),{status:403});
  const context=await contextFor(req),body=approvalBody.parse(req.body||{}),session=await prisma.workforceAttendanceSession.findFirst({where:{id:String(req.params.sessionId),companyId:context.company.id,storeId:context.store.id},include:{employee:true}});
  if(!session)throw Object.assign(new Error("Δεν βρέθηκε παρουσία Workforce v2."),{status:404});
  if(session.status!=="NEEDS_APPROVAL"||Number(session.workedMinutes)<=480)throw Object.assign(new Error("Η παρουσία δεν έχει εκκρεμή υπέρβαση 8 ωρών προς έγκριση."),{status:409});
  const updated=await prisma.$transaction(async tx=>{
    const item=await tx.workforceAttendanceSession.update({where:{id:session.id},data:{status:"APPROVED",issueJson:{...(session.issueJson||{}),approvedBy:req.user.id,approvedAt:new Date().toISOString(),approvalReason:body.reason}}});
    await audit(tx,req,{companyId:context.company.id,storeId:context.store.id,action:"WORKFORCE_OVER_8_HOURS_APPROVED",entityType:"WORKFORCE_ATTENDANCE_SESSION",entityId:item.id,before:{employeeId:session.employeeId,workedMinutes:session.workedMinutes,status:session.status},after:{employeeId:session.employeeId,workedMinutes:item.workedMinutes,status:item.status},reason:body.reason});
    return item;
  });
  res.json({item:serializeSession({...updated,employee:session.employee,assignment:null})});
}catch(error){next(error)}});

export default router;
