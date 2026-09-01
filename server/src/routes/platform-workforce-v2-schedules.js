import {Router} from "express";
import {z} from "zod";
import {prisma} from "../prisma.js";
import {audit,contextFor,loadEmployee} from "./workforce-v2-access.js";
import {confirmed} from "./workforce-v2-validation.js";

const router=Router({mergeParams:true});
const dateText=z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const mutableStates=["DRAFT","PREVIEWED"];
const exceptionCodes=["DOUBLE_SHIFT","HOURS_EXCEEDED","ROLE_MISMATCH","MAX_DAYS_EXCEEDED","MIN_DAYS_OFF"];
const assignmentInclude={employee:true,shiftTemplate:{include:{requiredRole:true}}};
const scheduleInclude={assignments:{include:assignmentInclude,orderBy:[{date:"asc"},{shiftTemplate:{startTime:"asc"}},{slot:"asc"}]}};
const dayStart=value=>new Date(`${value}T00:00:00.000Z`);
const iso=value=>new Date(value).toISOString().slice(0,10);
const weekStart=value=>{const date=dayStart(value),day=(date.getUTCDay()+6)%7;date.setUTCDate(date.getUTCDate()-day);return date};
const dateBefore=(date,days)=>{const next=new Date(date);next.setUTCDate(next.getUTCDate()-days);return next};
const isWeekend=date=>[0,6].includes(new Date(date).getUTCDay());
const shiftMinutes=template=>{const [sh,sm]=String(template.startTime).split(":").map(Number),[eh,em]=String(template.endTime).split(":").map(Number),value=eh*60+em-sh*60-sm;return value<=0?value+1440:value};
const warningList=assignment=>Array.isArray(assignment.warningJson)?assignment.warningJson:Array.isArray(assignment.warningJson?.warnings)?assignment.warningJson.warnings:[];
const roleSummary=role=>role?{id:role.id,name:role.name}:null;
const serialize=schedule=>({...schedule,periodStart:iso(schedule.periodStart),periodEnd:iso(schedule.periodEnd),assignments:schedule.assignments.map(item=>({...item,date:iso(item.date),employee:item.employee?{id:item.employee.id,fullName:item.employee.fullName}:null,shiftTemplate:{id:item.shiftTemplate.id,name:item.shiftTemplate.name,category:item.shiftTemplate.category,startTime:item.shiftTemplate.startTime,endTime:item.shiftTemplate.endTime,minimumPeople:item.shiftTemplate.minimumPeople,maximumPeople:item.shiftTemplate.maximumPeople,requiredRole:roleSummary(item.shiftTemplate.requiredRole)}}))});

const assertMutable=schedule=>{if(!mutableStates.includes(schedule.status))throw Object.assign(new Error("Το πρόγραμμα δεν είναι πρόχειρο ή σε προεπισκόπηση. Για αλλαγή δημοσιευμένου προγράμματος δημιουργείται νέα έκδοση."),{status:409})};
async function loadSchedule(context,id){const item=await prisma.workforceSchedule.findFirst({where:{id:String(id),companyId:context.company.id,storeId:context.store.id},include:scheduleInclude});if(!item)throw Object.assign(new Error("Δεν βρέθηκε πρόγραμμα Workforce v2."),{status:404});return item}
function assertVersion(schedule,version){if(Number(version)!==Number(schedule.version))throw Object.assign(new Error("Το πρόγραμμα άλλαξε από άλλο χρήστη. Κάνε ανανέωση πριν συνεχίσεις."),{status:409})}
function addFinding(list,{ruleCode,message,severity="APPROVAL_REQUIRED",assignmentId=null,employeeId=null,date=null}){list.push({ruleCode,message,severity,assignmentId,employeeId,date:date?iso(date):null})}
function activeRules(employee,date){return (employee.rules||[]).filter(rule=>rule.active&&(!rule.validFrom||rule.validFrom<=date)&&(!rule.validTo||rule.validTo>=date))}
function availabilityError(employee,template,date){
  const category=template.category;
  if(!employee.active)return "Ο εργαζόμενος είναι ανενεργός.";
  if(isWeekend(date)&&!employee.worksWeekend)return "Ο εργαζόμενος δεν είναι διαθέσιμος Σαββατοκύριακο.";
  if(category==="MORNING"&&!employee.worksMorning)return "Ο εργαζόμενος δεν είναι διαθέσιμος για πρωινή βάρδια.";
  if(category==="AFTERNOON"&&!employee.worksAfternoon)return "Ο εργαζόμενος δεν είναι διαθέσιμος για απογευματινή βάρδια.";
  if(category==="NIGHT"&&!employee.worksNight)return "Ο εργαζόμενος δεν είναι διαθέσιμος για νυχτερινή βάρδια.";
  return null;
}
function ruleBlockingError(employee,template,date){
  for(const rule of activeRules(employee,date)){
    if(rule.ruleType==="NO_WEEKEND"&&isWeekend(date))return "Ο κανόνας εργαζομένου αποκλείει εργασία Σαββατοκύριακο.";
    if(rule.ruleType==="ONLY_MORNING"&&template.category!=="MORNING")return "Ο κανόνας εργαζομένου επιτρέπει μόνο πρωινή βάρδια.";
    if(rule.ruleType==="ONLY_AFTERNOON"&&template.category!=="AFTERNOON")return "Ο κανόνας εργαζομένου επιτρέπει μόνο απογευματινή βάρδια.";
    if(rule.ruleType==="ONLY_NIGHT"&&template.category!=="NIGHT")return "Ο κανόνας εργαζομένου επιτρέπει μόνο νυχτερινή βάρδια.";
  }
  return null;
}
async function loadEmployeeForAssignment(context,employeeId){return loadEmployee({user:context.requestUser,params:{companyId:context.company.id,storeId:context.store.id}},context,employeeId)}
async function assignmentChecks(context,{schedule,employeeId,template,date,excludeId=null}){
  if(!employeeId)return {warnings:[]};
  const employee=await loadEmployeeForAssignment(context,employeeId);
  const access=employee.baseStoreId===context.store.id||employee.storeAccess.some(row=>row.storeId===context.store.id&&row.active&&row.canSchedule);
  if(!access)throw Object.assign(new Error("Ο εργαζόμενος δεν έχει δικαίωμα προγραμματισμού στο επιλεγμένο κατάστημα."),{status:409});
  const availability=availabilityError(employee,template,date)||ruleBlockingError(employee,template,date);
  if(availability)throw Object.assign(new Error(availability),{status:409});
  const leave=await prisma.workforceLeaveRequest.findFirst({where:{companyId:context.company.id,employeeId,status:"APPROVED",startDate:{lte:date},endDate:{gte:date}}});
  if(leave)throw Object.assign(new Error("Ο εργαζόμενος έχει εγκεκριμένη άδεια, ρεπό ή απουσία την επιλεγμένη ημέρα."),{status:409});
  const rows=await prisma.workforceScheduleAssignment.findMany({where:{employeeId,date,...(excludeId?{NOT:{id:excludeId}}:{})},include:{shiftTemplate:true,schedule:true}});
  const active=rows.filter(row=>row.schedule.status!=="SUPERSEDED"),warnings=[];
  if(active.length)addFinding(warnings,{ruleCode:"DOUBLE_SHIFT",message:"Ο εργαζόμενος έχει ήδη βάρδια την ίδια ημέρα.",employeeId,date});
  if(template.requiredRoleId&&!employee.roleAssignments.some(row=>row.roleId===template.requiredRoleId))addFinding(warnings,{ruleCode:"ROLE_MISMATCH",message:"Ο εργαζόμενος δεν έχει τον απαιτούμενο ρόλο για τη βάρδια.",employeeId,date});
  const dailyMinutes=active.reduce((sum,row)=>sum+shiftMinutes(row.shiftTemplate),shiftMinutes(template));
  if(dailyMinutes>480)addFinding(warnings,{ruleCode:"HOURS_EXCEEDED",message:`Η ανάθεση δημιουργεί ${Math.round(dailyMinutes/6)/10} ώρες εργασίας την ίδια ημέρα.`,employeeId,date});
  const previousNight=await prisma.workforceScheduleAssignment.findFirst({where:{employeeId,date:dateBefore(date,1),shiftTemplate:{category:"NIGHT"},schedule:{status:{not:"SUPERSEDED"}}},select:{id:true}});
  if(template.category==="MORNING"&&previousNight&&activeRules(employee,date).some(rule=>rule.ruleType==="NO_MORNING_AFTER_NIGHT"))throw Object.assign(new Error("Ο κανόνας εργαζομένου δεν επιτρέπει πρωινή βάρδια μετά από νυχτερινή."),{status:409});
  const sameShift=await prisma.workforceScheduleAssignment.findMany({where:{scheduleId:schedule.id,date,shiftTemplateId:template.id,...(excludeId?{NOT:{id:excludeId}}:{})},include:{employee:{include:{rules:true}}}});
  const incompatible=activeRules(employee,date).some(rule=>rule.ruleType==="INCOMPATIBLE_EMPLOYEE"&&sameShift.some(row=>row.employeeId===rule.relatedEmployeeId))||sameShift.some(row=>row.employee&&activeRules(row.employee,date).some(rule=>rule.ruleType==="INCOMPATIBLE_EMPLOYEE"&&rule.relatedEmployeeId===employee.id));
  if(incompatible)throw Object.assign(new Error("Ο κανόνας εργαζομένου δεν επιτρέπει τα δύο άτομα στην ίδια βάρδια."),{status:409});
  const start=weekStart(iso(date)),end=new Date(start.getTime()+7*86400000);
  const weeklyRows=await prisma.workforceScheduleAssignment.findMany({where:{employeeId,date:{gte:start,lt:end},schedule:{status:{not:"SUPERSEDED"}},...(excludeId?{NOT:{id:excludeId}}:{})},include:{shiftTemplate:true}});
  const weeklyHours=weeklyRows.reduce((sum,row)=>sum+shiftMinutes(row.shiftTemplate),shiftMinutes(template))/60;
  const weeklyDays=new Set([...weeklyRows.map(row=>iso(row.date)),iso(date)]).size;
  const maxRule=activeRules(employee,date).find(rule=>rule.ruleType==="MAX_HOURS_PER_WEEK"),maxHours=Number(maxRule?.valueJson?.hours||employee.maxHoursPerWeek||0);
  if(maxHours>0&&weeklyHours>maxHours)addFinding(warnings,{ruleCode:"HOURS_EXCEEDED",message:`Η εβδομάδα φτάνει ${weeklyHours.toFixed(1)} ώρες, πάνω από το όριο ${maxHours}.`,employeeId,date});
  if(employee.maxDaysPerWeek&&weeklyDays>employee.maxDaysPerWeek)addFinding(warnings,{ruleCode:"MAX_DAYS_EXCEEDED",message:`Ο εργαζόμενος προγραμματίζεται ${weeklyDays} ημέρες, πάνω από το όριο ${employee.maxDaysPerWeek}.`,employeeId,date});
  return {warnings};
}
async function scheduleValidation(context,schedule){
  const findings=[],assignments=schedule.assignments||[],byShift=new Map();
  for(const assignment of assignments){
    const key=`${iso(assignment.date)}:${assignment.shiftTemplateId}`,rows=byShift.get(key)||[];rows.push(assignment);byShift.set(key,rows);
    if(!assignment.employeeId)addFinding(findings,{ruleCode:"UNCOVERED_SHIFT",message:`Η βάρδια «${assignment.shiftTemplate.name}» έχει κενή θέση.`,severity:"ERROR",assignmentId:assignment.id,date:assignment.date});
    if(assignment.warningState==="NEEDS_APPROVAL")for(const warning of warningList(assignment))addFinding(findings,{...warning,severity:"APPROVAL_REQUIRED",assignmentId:assignment.id,employeeId:assignment.employeeId,date:assignment.date});
  }
  for(const rows of byShift.values()){
    const template=rows[0].shiftTemplate,covered=rows.filter(row=>row.employeeId).length;
    if(covered<template.minimumPeople)addFinding(findings,{ruleCode:"SHIFT_COVERAGE",message:`Η βάρδια «${template.name}» χρειάζεται ${template.minimumPeople} άτομα και έχει ${covered}.`,severity:"ERROR",date:rows[0].date});
    if(template.maximumPeople&&covered>template.maximumPeople)addFinding(findings,{ruleCode:"SHIFT_CAPACITY",message:`Η βάρδια «${template.name}» υπερβαίνει το όριο ${template.maximumPeople} ατόμων.`,severity:"APPROVAL_REQUIRED",date:rows[0].date});
    for(const row of rows.filter(item=>item.employeeId)){
      const employee=await loadEmployeeForAssignment(context,row.employeeId);
      if(activeRules(employee,row.date).some(rule=>rule.ruleType==="NEVER_ALONE")&&covered<2)addFinding(findings,{ruleCode:"NEVER_ALONE",message:`Ο κανόνας του/της ${employee.fullName} δεν επιτρέπει να μείνει μόνος/μόνη στη βάρδια.`,severity:"ERROR",assignmentId:row.id,employeeId:row.employeeId,date:row.date});
      const minDaysOff=activeRules(employee,row.date).find(rule=>rule.ruleType==="MIN_DAYS_OFF");
      if(minDaysOff){const start=weekStart(iso(row.date)),end=new Date(start.getTime()+7*86400000),weekRows=assignments.filter(item=>item.employeeId===employee.id&&item.date>=start&&item.date<end),days=new Set(weekRows.map(item=>iso(item.date))).size,required=Number(minDaysOff.valueJson?.days||0);if(required&&7-days<required)addFinding(findings,{ruleCode:"MIN_DAYS_OFF",message:`Ο/Η ${employee.fullName} έχει ${7-days} ρεπό αντί για ${required}.`,severity:"APPROVAL_REQUIRED",assignmentId:row.id,employeeId:employee.id,date:row.date})}
    }
  }
  return {findings,errors:findings.filter(item=>item.severity==="ERROR"),approvals:findings.filter(item=>item.severity==="APPROVAL_REQUIRED")};
}

router.get("/",async(req,res,next)=>{try{const context=await contextFor(req),q=z.object({from:dateText.optional(),to:dateText.optional(),status:z.string().optional()}).parse(req.query||{});const items=await prisma.workforceSchedule.findMany({where:{companyId:context.company.id,storeId:context.store.id,...(q.from?{periodEnd:{gte:dayStart(q.from)}}:{}),...(q.to?{periodStart:{lte:new Date(`${q.to}T23:59:59.999Z`)}}:{}),...(q.status?{status:q.status}:{})},include:scheduleInclude,orderBy:[{periodStart:"desc"},{version:"desc"}],take:100});res.json({items:items.map(serialize)});}catch(error){next(error)}});
router.get("/:scheduleId/validation",async(req,res,next)=>{try{const context=await contextFor(req);context.requestUser=req.user;res.json(await scheduleValidation(context,await loadSchedule(context,req.params.scheduleId)));}catch(error){next(error)}});
router.post("/",async(req,res,next)=>{try{
  const context=await contextFor(req);context.requestUser=req.user;const body=z.object({periodStart:dateText,periodType:z.enum(["WEEK","MONTH"]).default("WEEK"),notes:z.string().trim().max(1000).optional().nullable(),confirmed,reason:z.string().trim().min(3).max(500)}).parse(req.body||{});
  const start=body.periodType==="WEEK"?weekStart(body.periodStart):dayStart(`${body.periodStart.slice(0,7)}-01`),end=new Date(start);if(body.periodType==="WEEK")end.setUTCDate(end.getUTCDate()+6);else end.setUTCMonth(end.getUTCMonth()+1,0);
  const active=await prisma.workforceSchedule.findFirst({where:{storeId:context.store.id,periodStart:start,periodEnd:end,status:{in:["DRAFT","PREVIEWED","APPROVED"]}}});if(active)throw Object.assign(new Error("Υπάρχει ήδη ενεργή πρόχειρη ή εγκεκριμένη έκδοση για το ίδιο διάστημα."),{status:409});
  const published=await prisma.workforceSchedule.findFirst({where:{storeId:context.store.id,periodStart:start,periodEnd:end,status:"PUBLISHED"},include:scheduleInclude,orderBy:{version:"desc"}});
  const created=await prisma.$transaction(async tx=>{if(published){await tx.workforceSchedule.update({where:{id:published.id},data:{status:"SUPERSEDED"}});await audit(tx,req,{companyId:context.company.id,storeId:context.store.id,action:"WORKFORCE_SCHEDULE_SUPERSEDED",entityType:"WORKFORCE_SCHEDULE",entityId:published.id,before:published,after:{status:"SUPERSEDED"},reason:body.reason})}const item=await tx.workforceSchedule.create({data:{companyId:context.company.id,storeId:context.store.id,periodStart:start,periodEnd:end,periodType:body.periodType,version:published?published.version+1:1,createdByUserId:req.user.id,notes:body.notes||null}});if(published?.assignments.length)await tx.workforceScheduleAssignment.createMany({data:published.assignments.map(row=>({scheduleId:item.id,date:row.date,shiftTemplateId:row.shiftTemplateId,employeeId:row.employeeId,slot:row.slot,status:"PLANNED",warningState:"OK",warningJson:null,note:row.note||null}))});const result=await tx.workforceSchedule.findUnique({where:{id:item.id},include:scheduleInclude});await audit(tx,req,{companyId:context.company.id,storeId:context.store.id,action:"WORKFORCE_SCHEDULE_CREATED",entityType:"WORKFORCE_SCHEDULE",entityId:item.id,after:result,reason:body.reason});return result});
  res.status(201).json({item:serialize(created),copiedFromPublished:Boolean(published)});
}catch(error){next(error)}});

const assignmentBody=z.object({version:z.coerce.number().int().positive(),date:dateText,shiftTemplateId:z.string().min(1),employeeId:z.string().min(1).nullable().optional(),slot:z.coerce.number().int().min(1).max(100).default(1),note:z.string().trim().max(1000).optional().nullable(),confirmed,reason:z.string().trim().min(3).max(500)});
async function loadTemplate(context,templateId){const template=await prisma.workforceShiftTemplate.findFirst({where:{id:templateId,companyId:context.company.id,storeId:context.store.id,active:true},include:{requiredRole:true}});if(!template)throw Object.assign(new Error("Δεν βρέθηκε ενεργό πρότυπο βάρδιας."),{status:404});return template}
async function saveAssignment(req,res,{existing=null}){
  const context=await contextFor(req);context.requestUser=req.user;const body=assignmentBody.parse(req.body||{}),schedule=await loadSchedule(context,req.params.scheduleId);assertMutable(schedule);assertVersion(schedule,body.version);const date=dayStart(body.date);if(date<schedule.periodStart||date>schedule.periodEnd)throw Object.assign(new Error("Η ημέρα είναι εκτός του διαστήματος προγράμματος."),{status:400});const template=await loadTemplate(context,body.shiftTemplateId),checks=await assignmentChecks(context,{schedule,employeeId:body.employeeId,template,date,excludeId:existing?.id||null}),data={date,shiftTemplateId:template.id,employeeId:body.employeeId||null,slot:body.slot,note:body.note||null,warningState:checks.warnings.length?"NEEDS_APPROVAL":"OK",warningJson:checks.warnings.length?checks.warnings:null};
  const item=await prisma.$transaction(async tx=>{const result=existing?await tx.workforceScheduleAssignment.update({where:{id:existing.id},data}):await tx.workforceScheduleAssignment.create({data:{scheduleId:schedule.id,...data}});await tx.workforceSchedule.update({where:{id:schedule.id},data:{version:{increment:1}}});await audit(tx,req,{companyId:context.company.id,storeId:context.store.id,action:existing?"WORKFORCE_ASSIGNMENT_UPDATED":"WORKFORCE_ASSIGNMENT_CREATED",entityType:"WORKFORCE_SCHEDULE_ASSIGNMENT",entityId:result.id,before:existing,after:result,reason:body.reason});return result});
  res.status(existing?200:201).json({item,version:schedule.version+1,warnings:checks.warnings});
}
router.post("/:scheduleId/assignments",async(req,res,next)=>{try{await saveAssignment(req,res,{})}catch(error){next(error)}});
router.put("/:scheduleId/assignments/:assignmentId",async(req,res,next)=>{try{const context=await contextFor(req),schedule=await loadSchedule(context,req.params.scheduleId),assignment=schedule.assignments.find(item=>item.id===req.params.assignmentId);if(!assignment)throw Object.assign(new Error("Δεν βρέθηκε η ανάθεση."),{status:404});await saveAssignment(req,res,{existing:assignment});}catch(error){next(error)}});
router.delete("/:scheduleId/assignments/:assignmentId",async(req,res,next)=>{try{const context=await contextFor(req),body=z.object({version:z.coerce.number().int().positive(),confirmed,reason:z.string().trim().min(3).max(500)}).parse(req.body||{}),schedule=await loadSchedule(context,req.params.scheduleId);assertMutable(schedule);assertVersion(schedule,body.version);const assignment=schedule.assignments.find(item=>item.id===req.params.assignmentId);if(!assignment)throw Object.assign(new Error("Δεν βρέθηκε η ανάθεση."),{status:404});await prisma.$transaction(async tx=>{await tx.workforceScheduleAssignment.delete({where:{id:assignment.id}});await tx.workforceSchedule.update({where:{id:schedule.id},data:{version:{increment:1}}});await audit(tx,req,{companyId:context.company.id,storeId:context.store.id,action:"WORKFORCE_ASSIGNMENT_REMOVED",entityType:"WORKFORCE_SCHEDULE_ASSIGNMENT",entityId:assignment.id,before:assignment,reason:body.reason})});res.status(204).end();}catch(error){next(error)}});

router.post("/:scheduleId/transition",async(req,res,next)=>{try{const context=await contextFor(req);context.requestUser=req.user;const body=z.object({version:z.coerce.number().int().positive(),status:z.enum(["PREVIEWED","APPROVED","PUBLISHED"]),confirmed,reason:z.string().trim().min(3).max(500)}).parse(req.body||{}),schedule=await loadSchedule(context,req.params.scheduleId);assertVersion(schedule,body.version);const allowed={DRAFT:["PREVIEWED"],PREVIEWED:["APPROVED"],APPROVED:["PUBLISHED"]};if(!allowed[schedule.status]?.includes(body.status))throw Object.assign(new Error("Η μετάβαση κατάστασης δεν επιτρέπεται."),{status:409});const validation=await scheduleValidation(context,schedule);if(body.status==="PUBLISHED"&&validation.errors.length)throw Object.assign(new Error("Δεν μπορεί να δημοσιευτεί πρόγραμμα με πραγματικά σφάλματα κάλυψης ή διαθεσιμότητας."),{status:409,validation});if(body.status==="PUBLISHED"&&validation.approvals.length)throw Object.assign(new Error("Υπάρχουν αναθέσεις που χρειάζονται έγκριση εξαίρεσης."),{status:409,validation});const updated=await prisma.$transaction(async tx=>{const item=await tx.workforceSchedule.update({where:{id:schedule.id},data:{status:body.status,version:{increment:1},...(body.status==="APPROVED"?{approvedByUserId:req.user.id,approvedAt:new Date()}:{}),...(body.status==="PUBLISHED"?{publishedAt:new Date(),lockedAt:new Date()}:{} )},include:scheduleInclude});await audit(tx,req,{companyId:context.company.id,storeId:context.store.id,action:`WORKFORCE_SCHEDULE_${body.status}`,entityType:"WORKFORCE_SCHEDULE",entityId:item.id,before:schedule,after:item,reason:body.reason});return item});res.json({item:serialize(updated),validation});}catch(error){next(error)}});
router.post("/:scheduleId/exceptions",async(req,res,next)=>{try{const context=await contextFor(req);if(!["SUPER_ADMIN","OWNER"].includes(req.user?.role)&&req.user?.platformRole!=="SUPER_ADMIN")throw Object.assign(new Error("Μόνο Super Admin ή Ιδιοκτήτης εγκρίνει εξαίρεση προγράμματος."),{status:403});const body=z.object({assignmentId:z.string().min(1),ruleCode:z.enum(exceptionCodes),reason:z.string().trim().min(3).max(500),confirmed}).parse(req.body||{}),schedule=await loadSchedule(context,req.params.scheduleId),assignment=schedule.assignments.find(item=>item.id===body.assignmentId);if(!assignment)throw Object.assign(new Error("Δεν βρέθηκε η ανάθεση."),{status:404});const warnings=warningList(assignment);if(!warnings.some(item=>item.ruleCode===body.ruleCode))throw Object.assign(new Error("Ο κωδικός εξαίρεσης δεν αντιστοιχεί στην ανάθεση."),{status:409});const approvedRuleCodes=[...new Set([...(assignment.warningJson?.approvedRuleCodes||[]),body.ruleCode])],allApproved=warnings.every(item=>approvedRuleCodes.includes(item.ruleCode));await prisma.$transaction(async tx=>{await tx.workforceScheduleAssignment.update({where:{id:assignment.id},data:{warningState:allApproved?"APPROVED_EXCEPTION":"NEEDS_APPROVAL",warningJson:{warnings,approvedRuleCodes,approvedBy:req.user.id,approvedAt:new Date().toISOString(),reason:body.reason}}});await audit(tx,req,{companyId:context.company.id,storeId:context.store.id,action:"WORKFORCE_EXCEPTION_APPROVED",entityType:"WORKFORCE_SCHEDULE_ASSIGNMENT",entityId:assignment.id,after:{ruleCode:body.ruleCode,employeeId:assignment.employeeId,date:iso(assignment.date),shiftTemplateId:assignment.shiftTemplateId},reason:body.reason})});res.status(201).json({approved:true,ruleCode:body.ruleCode,allApproved});}catch(error){next(error)}});

export default router;
