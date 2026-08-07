import crypto from "crypto";
import {Router} from "express";
import {z} from "zod";
import * as XLSX from "xlsx";
import {prisma} from "../prisma.js";

const router=Router();
const uid=()=>crypto.randomUUID();
const adminRoles=new Set(["OWNER","ADMIN","MANAGER"]);
const isOperator=req=>req.user?.tokenType==="STORE_OPERATOR";

function requireBackoffice(req,res,next){
  if(isOperator(req)||!adminRoles.has(req.user?.role))return res.status(403).json({error:"Απαιτείται δικαίωμα Owner, Admin ή Manager."});
  next();
}

async function ownedStore(companyId,storeId){
  return prisma.store.findFirst({where:{id:String(storeId),companyId,active:true},select:{id:true,name:true}});
}

async function ownedEmployee(companyId,employeeId,storeId=null){
  return prisma.employee.findFirst({where:{id:String(employeeId),active:true,store:{companyId},...(storeId?{storeId:String(storeId)}:{})},select:{id:true,fullName:true,storeId:true}});
}

async function latestActiveEvent(employeeId){
  const rows=await prisma.$queryRaw`SELECT "id","eventType","occurredAt" FROM "AttendanceEvent" WHERE "employeeId"=${employeeId} AND "voidedAt" IS NULL ORDER BY "occurredAt" DESC,"createdAt" DESC LIMIT 1`;
  return rows[0]||null;
}

function parseRange(query){
  const schema=z.object({from:z.coerce.date(),to:z.coerce.date(),storeId:z.string().optional()});
  const range=schema.parse(query);
  if(range.to<=range.from||range.to-range.from>370*86400000){const error=new Error("Το χρονικό διάστημα δεν είναι έγκυρο.");error.status=400;throw error}
  return range;
}

async function attendanceSummaryFor(companyId,{from,to,storeId=null}){
  const employees=await prisma.$queryRaw`SELECT e."id",e."fullName",e."storeId",s."name" AS "storeName" FROM "Employee" e JOIN "Store" s ON s."id"=e."storeId" WHERE s."companyId"=${companyId} AND e."active"=true AND (${storeId}::text IS NULL OR e."storeId"=${storeId}) ORDER BY e."fullName"`;
  const events=await prisma.$queryRaw`SELECT "id","employeeId","eventType","occurredAt" FROM "AttendanceEvent" WHERE "companyId"=${companyId} AND "voidedAt" IS NULL AND "occurredAt">=${from} AND "occurredAt"<${to} AND (${storeId}::text IS NULL OR "storeId"=${storeId}) UNION ALL SELECT prior."id",prior."employeeId",prior."eventType",prior."occurredAt" FROM (SELECT DISTINCT ON (a."employeeId") a."id",a."employeeId",a."eventType",a."occurredAt" FROM "AttendanceEvent" a WHERE a."companyId"=${companyId} AND a."voidedAt" IS NULL AND a."occurredAt"<${from} AND (${storeId}::text IS NULL OR a."storeId"=${storeId}) ORDER BY a."employeeId",a."occurredAt" DESC) prior WHERE prior."eventType"='IN' ORDER BY "occurredAt"`;
  const rows=calculateAttendanceSummary(employees,events,from,to);
  return {rows,totals:{workedMinutes:rows.reduce((sum,row)=>sum+row.workedMinutes,0),shifts:rows.reduce((sum,row)=>sum+row.shifts,0),issues:rows.reduce((sum,row)=>sum+row.issues.length,0)}};
}

export function calculateAttendanceSummary(employees,events,rangeStart=null,rangeEnd=null){
  const byEmployee=new Map(employees.map(employee=>[employee.id,{employeeId:employee.id,employeeName:employee.fullName,storeId:employee.storeId,storeName:employee.storeName,workedMinutes:0,shifts:0,openEntry:false,issues:[]} ]));
  for(const employee of employees){
    const summary=byEmployee.get(employee.id);let open=null;
    for(const event of events.filter(row=>row.employeeId===employee.id).sort((a,b)=>new Date(a.occurredAt)-new Date(b.occurredAt))){
      if(event.eventType==="IN"){
        if(open)summary.issues.push({type:"DUPLICATE_IN",eventId:event.id,occurredAt:event.occurredAt});
        open=event;
      }else if(!open){summary.issues.push({type:"UNPAIRED_OUT",eventId:event.id,occurredAt:event.occurredAt});}
      else{
        const start=rangeStart?Math.max(new Date(open.occurredAt).getTime(),new Date(rangeStart).getTime()):new Date(open.occurredAt).getTime();
        const end=rangeEnd?Math.min(new Date(event.occurredAt).getTime(),new Date(rangeEnd).getTime()):new Date(event.occurredAt).getTime();
        const minutes=Math.max(0,Math.round((end-start)/60000));
        summary.workedMinutes+=minutes;summary.shifts+=1;open=null;
      }
    }
    if(open){summary.openEntry=true;summary.issues.push({type:"OPEN_ENTRY",eventId:open.id,occurredAt:open.occurredAt,rangeEnd});}
  }
  return [...byEmployee.values()].map(row=>({...row,workedHours:Number((row.workedMinutes/60).toFixed(2))}));
}

router.get("/me",async(req,res,next)=>{
  try{
    if(!isOperator(req)||!req.user.employeeId)return res.status(403).json({error:"Η προσωπική κάρτα παρουσίας είναι διαθέσιμη μόνο στο Store Mode."});
    const employee=await ownedEmployee(req.user.companyId,req.user.employeeId,req.user.storeId);if(!employee)return res.status(404).json({error:"Δεν βρέθηκε ενεργός εργαζόμενος."});
    const latest=await latestActiveEvent(employee.id);
    const recent=await prisma.$queryRaw`SELECT "id","eventType","method","occurredAt","note" FROM "AttendanceEvent" WHERE "companyId"=${req.user.companyId} AND "employeeId"=${employee.id} AND "voidedAt" IS NULL ORDER BY "occurredAt" DESC LIMIT 10`;
    res.json({employee,status:latest?.eventType==="IN"?"WORKING":"OUT",latest,recent});
  }catch(error){next(error)}
});

router.post("/clock",async(req,res,next)=>{
  try{
    if(!isOperator(req)||!req.user.employeeId||!req.user.permissions?.includes("ATTENDANCE"))return res.status(403).json({error:"Δεν επιτρέπεται καταχώριση παρουσίας."});
    const body=z.object({eventType:z.enum(["IN","OUT"]),note:z.string().trim().max(300).optional().nullable()}).parse(req.body||{});
    const store=await ownedStore(req.user.companyId,req.user.storeId),employee=await ownedEmployee(req.user.companyId,req.user.employeeId,req.user.storeId);
    if(!store||!employee)return res.status(404).json({error:"Δεν βρέθηκε ενεργός εργαζόμενος ή κατάστημα."});
    const latest=await latestActiveEvent(employee.id);
    if(latest?.eventType===body.eventType)return res.status(409).json({error:body.eventType==="IN"?"Υπάρχει ήδη ενεργή είσοδος. Καταχώρισε πρώτα έξοδο.":"Έχει ήδη καταχωριστεί έξοδος. Καταχώρισε πρώτα είσοδο."});
    if(!latest&&body.eventType==="OUT")return res.status(409).json({error:"Δεν υπάρχει προηγούμενη είσοδος για να καταχωριστεί έξοδος."});
    const eventId=uid();
    await prisma.$executeRaw`INSERT INTO "AttendanceEvent" ("id","companyId","storeId","employeeId","eventType","method","occurredAt","note","responsibleName","createdByUserId") VALUES (${eventId},${req.user.companyId},${store.id},${employee.id},${body.eventType},'STORE_MODE',CURRENT_TIMESTAMP,${body.note||null},${req.user.fullName||employee.fullName},${req.user.id})`;
    res.status(201).json({id:eventId,eventType:body.eventType,status:body.eventType==="IN"?"WORKING":"OUT",occurredAt:new Date()});
  }catch(error){next(error)}
});

router.use(requireBackoffice);

router.get("/employees",async(req,res,next)=>{
  try{const store=await ownedStore(req.user.companyId,req.query.storeId);if(!store)return res.status(404).json({error:"Δεν βρέθηκε το κατάστημα."});const rows=await prisma.$queryRaw`SELECT e."id",e."fullName",e."position",e."storeId",s."name" AS "storeName",last."eventType" AS "lastEventType",last."occurredAt" AS "lastOccurredAt" FROM "Employee" e JOIN "Store" s ON s."id"=e."storeId" LEFT JOIN LATERAL (SELECT a."eventType",a."occurredAt" FROM "AttendanceEvent" a WHERE a."employeeId"=e."id" AND a."voidedAt" IS NULL ORDER BY a."occurredAt" DESC LIMIT 1) last ON TRUE WHERE e."storeId"=${store.id} AND e."active"=true ORDER BY e."fullName"`;res.json(rows)}catch(error){next(error)}
});

router.get("/events",async(req,res,next)=>{
  try{const range=parseRange(req.query);if(range.storeId&&!await ownedStore(req.user.companyId,range.storeId))return res.status(404).json({error:"Δεν βρέθηκε το κατάστημα."});const rows=await prisma.$queryRaw`SELECT a."id",a."storeId",a."employeeId",a."eventType",a."method",a."occurredAt",a."note",a."responsibleName",a."voidedAt",a."voidReason",a."supersedesEventId",e."fullName" AS "employeeName",s."name" AS "storeName" FROM "AttendanceEvent" a JOIN "Employee" e ON e."id"=a."employeeId" LEFT JOIN "Store" s ON s."id"=a."storeId" WHERE a."companyId"=${req.user.companyId} AND a."occurredAt">=${range.from} AND a."occurredAt"<${range.to} AND (${range.storeId||null}::text IS NULL OR a."storeId"=${range.storeId||null}) ORDER BY a."occurredAt" DESC LIMIT 2000`;res.json(rows)}catch(error){next(error)}
});

router.get("/summary",async(req,res,next)=>{
  try{const range=parseRange(req.query);if(range.storeId&&!await ownedStore(req.user.companyId,range.storeId))return res.status(404).json({error:"Δεν βρέθηκε το κατάστημα."});const summary=await attendanceSummaryFor(req.user.companyId,{from:range.from,to:range.to,storeId:range.storeId||null});res.json({from:range.from,to:range.to,...summary})}catch(error){next(error)}
});

router.post("/events",async(req,res,next)=>{
  try{const body=z.object({storeId:z.string(),employeeId:z.string(),eventType:z.enum(["IN","OUT"]),occurredAt:z.coerce.date(),note:z.string().trim().max(300).optional().nullable()}).parse(req.body||{});const store=await ownedStore(req.user.companyId,body.storeId),employee=await ownedEmployee(req.user.companyId,body.employeeId,body.storeId);if(!store||!employee)return res.status(404).json({error:"Δεν βρέθηκε εργαζόμενος στο κατάστημα."});const eventId=uid();await prisma.$executeRaw`INSERT INTO "AttendanceEvent" ("id","companyId","storeId","employeeId","eventType","method","occurredAt","note","responsibleName","createdByUserId") VALUES (${eventId},${req.user.companyId},${store.id},${employee.id},${body.eventType},'MANUAL',${body.occurredAt},${body.note||null},${req.user.fullName||"Backoffice"},${req.user.id})`;res.status(201).json({id:eventId})}catch(error){next(error)}
});

router.post("/events/:eventId/correct",async(req,res,next)=>{
  try{const body=z.object({eventType:z.enum(["IN","OUT"]),occurredAt:z.coerce.date(),reason:z.string().trim().min(3).max(300),note:z.string().trim().max(300).optional().nullable()}).parse(req.body||{});const rows=await prisma.$queryRaw`SELECT "id","storeId","employeeId","voidedAt" FROM "AttendanceEvent" WHERE "id"=${req.params.eventId} AND "companyId"=${req.user.companyId} LIMIT 1`;const original=rows[0];if(!original)return res.status(404).json({error:"Δεν βρέθηκε η καταχώριση."});if(original.voidedAt)return res.status(409).json({error:"Η καταχώριση έχει ήδη διορθωθεί."});const replacementId=uid();await prisma.$transaction(async tx=>{const changed=await tx.$queryRaw`UPDATE "AttendanceEvent" SET "voidedAt"=CURRENT_TIMESTAMP,"voidedByUserId"=${req.user.id},"voidReason"=${body.reason},"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${original.id} AND "companyId"=${req.user.companyId} AND "voidedAt" IS NULL RETURNING "id"`;if(!changed[0]){const error=new Error("Η καταχώριση έχει ήδη διορθωθεί.");error.status=409;throw error}await tx.$executeRaw`INSERT INTO "AttendanceEvent" ("id","companyId","storeId","employeeId","eventType","method","occurredAt","note","responsibleName","createdByUserId","supersedesEventId") VALUES (${replacementId},${req.user.companyId},${original.storeId},${original.employeeId},${body.eventType},'CORRECTION',${body.occurredAt},${body.note||null},${req.user.fullName||"Backoffice"},${req.user.id},${original.id})`});res.status(201).json({id:replacementId,supersedesEventId:original.id})}catch(error){next(error)}
});

router.get("/payroll-periods",async(req,res,next)=>{
  try{const rows=await prisma.$queryRaw`SELECT p."id",p."name",p."storeId",p."startDate",p."endDate",p."status",p."lockedAt",p."createdAt",s."name" AS "storeName",COUNT(e."id")::int AS "employeeCount",COALESCE(SUM(e."workedMinutes"),0)::int AS "workedMinutes",COALESCE(SUM(e."sourceIssues"),0)::int AS "sourceIssues" FROM "PayrollPeriod" p LEFT JOIN "Store" s ON s."id"=p."storeId" LEFT JOIN "PayrollEntry" e ON e."payrollPeriodId"=p."id" WHERE p."companyId"=${req.user.companyId} GROUP BY p."id",s."name" ORDER BY p."startDate" DESC LIMIT 100`;res.json(rows)}catch(error){next(error)}
});

router.post("/payroll-periods",async(req,res,next)=>{
  try{
    const body=z.object({name:z.string().trim().min(2).max(120),storeId:z.string().optional().nullable(),from:z.coerce.date(),to:z.coerce.date()}).parse(req.body||{});
    if(body.to<=body.from||body.to-body.from>370*86400000)return res.status(400).json({error:"Η περίοδος δεν είναι έγκυρη."});
    if(body.storeId&&!await ownedStore(req.user.companyId,body.storeId))return res.status(404).json({error:"Δεν βρέθηκε το κατάστημα."});
    const existing=await prisma.$queryRaw`SELECT "id" FROM "PayrollPeriod" WHERE "companyId"=${req.user.companyId} AND "startDate"=${body.from} AND "endDate"=${body.to} AND COALESCE("storeId",'')=COALESCE(${body.storeId||null},'') LIMIT 1`;if(existing[0])return res.status(409).json({error:"Υπάρχει ήδη περίοδος για το ίδιο διάστημα και κατάστημα."});
    const summary=await attendanceSummaryFor(req.user.companyId,{from:body.from,to:body.to,storeId:body.storeId||null}),periodId=uid();
    await prisma.$transaction(async tx=>{await tx.$executeRaw`INSERT INTO "PayrollPeriod" ("id","companyId","name","storeId","startDate","endDate","status","createdByUserId") VALUES (${periodId},${req.user.companyId},${body.name},${body.storeId||null},${body.from},${body.to},'DRAFT',${req.user.id})`;for(const row of summary.rows)await tx.$executeRaw`INSERT INTO "PayrollEntry" ("id","payrollPeriodId","employeeId","workedMinutes","sourceIssues","storeNameSnapshot","employeeNameSnapshot") VALUES (${uid()},${periodId},${row.employeeId},${row.workedMinutes},${row.issues.length},${row.storeName||null},${row.employeeName})`});
    res.status(201).json({id:periodId,status:"DRAFT",employees:summary.rows.length,sourceIssues:summary.totals.issues});
  }catch(error){next(error)}
});

router.get("/payroll-periods/:periodId",async(req,res,next)=>{
  try{const periods=await prisma.$queryRaw`SELECT p."id",p."name",p."storeId",p."startDate",p."endDate",p."status",p."lockedAt",p."createdAt",s."name" AS "storeName" FROM "PayrollPeriod" p LEFT JOIN "Store" s ON s."id"=p."storeId" WHERE p."id"=${req.params.periodId} AND p."companyId"=${req.user.companyId} LIMIT 1`;if(!periods[0])return res.status(404).json({error:"Δεν βρέθηκε η περίοδος."});const entries=await prisma.$queryRaw`SELECT e."id",e."employeeId",e."employeeNameSnapshot" AS "employeeName",e."storeNameSnapshot" AS "storeName",e."workedMinutes",e."overtimeMinutes",e."absenceMinutes",e."sourceIssues",e."note",e."updatedAt" FROM "PayrollEntry" e WHERE e."payrollPeriodId"=${periods[0].id} ORDER BY e."employeeNameSnapshot"`;res.json({period:periods[0],entries})}catch(error){next(error)}
});

router.patch("/payroll-periods/:periodId/entries/:entryId",async(req,res,next)=>{
  try{const body=z.object({overtimeMinutes:z.coerce.number().int().min(0).max(50000),absenceMinutes:z.coerce.number().int().min(0).max(50000),note:z.string().trim().max(500).optional().nullable()}).parse(req.body||{});const rows=await prisma.$queryRaw`UPDATE "PayrollEntry" e SET "overtimeMinutes"=${body.overtimeMinutes},"absenceMinutes"=${body.absenceMinutes},"note"=${body.note||null},"updatedAt"=CURRENT_TIMESTAMP FROM "PayrollPeriod" p WHERE e."id"=${req.params.entryId} AND e."payrollPeriodId"=p."id" AND p."id"=${req.params.periodId} AND p."companyId"=${req.user.companyId} AND p."status"='DRAFT' RETURNING e."id"`;if(!rows[0])return res.status(409).json({error:"Η περίοδος δεν βρέθηκε ή έχει κλειδωθεί."});res.json({ok:true})}catch(error){next(error)}
});

router.post("/payroll-periods/:periodId/refresh",async(req,res,next)=>{
  try{const periods=await prisma.$queryRaw`SELECT "id","storeId","startDate","endDate","status" FROM "PayrollPeriod" WHERE "id"=${req.params.periodId} AND "companyId"=${req.user.companyId} LIMIT 1`;const period=periods[0];if(!period)return res.status(404).json({error:"Δεν βρέθηκε η περίοδος."});if(period.status!=="DRAFT")return res.status(409).json({error:"Η κλειδωμένη περίοδος δεν αλλάζει."});const summary=await attendanceSummaryFor(req.user.companyId,{from:period.startDate,to:period.endDate,storeId:period.storeId||null});await prisma.$transaction(async tx=>{await tx.$executeRaw`DELETE FROM "PayrollEntry" WHERE "payrollPeriodId"=${period.id}`;for(const row of summary.rows)await tx.$executeRaw`INSERT INTO "PayrollEntry" ("id","payrollPeriodId","employeeId","workedMinutes","sourceIssues","storeNameSnapshot","employeeNameSnapshot") VALUES (${uid()},${period.id},${row.employeeId},${row.workedMinutes},${row.issues.length},${row.storeName||null},${row.employeeName})`;await tx.$executeRaw`UPDATE "PayrollPeriod" SET "updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${period.id}`});res.json({ok:true,employees:summary.rows.length,sourceIssues:summary.totals.issues})}catch(error){next(error)}
});

router.post("/payroll-periods/:periodId/finalize",async(req,res,next)=>{
  try{const issues=await prisma.$queryRaw`SELECT p."id",p."status",COALESCE(SUM(e."sourceIssues"),0)::int AS issues FROM "PayrollPeriod" p LEFT JOIN "PayrollEntry" e ON e."payrollPeriodId"=p."id" WHERE p."id"=${req.params.periodId} AND p."companyId"=${req.user.companyId} GROUP BY p."id"`;const period=issues[0];if(!period)return res.status(404).json({error:"Δεν βρέθηκε η περίοδος."});if(period.status!=="DRAFT")return res.status(409).json({error:"Η περίοδος έχει ήδη κλειδωθεί."});if(period.issues>0)return res.status(409).json({error:`Δεν μπορεί να κλειδωθεί: υπάρχουν ${period.issues} εκκρεμότητες παρουσίας. Διόρθωσέ τες και πάτησε «Ανανέωση από παρουσίες».`});await prisma.$executeRaw`UPDATE "PayrollPeriod" SET "status"='FINALIZED',"lockedAt"=CURRENT_TIMESTAMP,"lockedByUserId"=${req.user.id},"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${period.id} AND "companyId"=${req.user.companyId}`;res.json({ok:true,status:"FINALIZED"})}catch(error){next(error)}
});

router.get("/payroll-periods/:periodId/export",async(req,res,next)=>{
  try{const periods=await prisma.$queryRaw`SELECT p."id",p."name",p."startDate",p."endDate",p."status",p."lockedAt",c."name" AS "companyName",s."name" AS "storeName" FROM "PayrollPeriod" p JOIN "Company" c ON c."id"=p."companyId" LEFT JOIN "Store" s ON s."id"=p."storeId" WHERE p."id"=${req.params.periodId} AND p."companyId"=${req.user.companyId} LIMIT 1`;const period=periods[0];if(!period)return res.status(404).json({error:"Δεν βρέθηκε η περίοδος."});const entries=await prisma.$queryRaw`SELECT "employeeNameSnapshot" AS "employeeName","storeNameSnapshot" AS "storeName","workedMinutes","overtimeMinutes","absenceMinutes","sourceIssues","note" FROM "PayrollEntry" WHERE "payrollPeriodId"=${period.id} ORDER BY "employeeNameSnapshot"`;const rows=entries.map(row=>({"Εργαζόμενος":row.employeeName,"Κατάστημα":row.storeName||"Όλα","Πραγματικές ώρες":Number((row.workedMinutes/60).toFixed(2)),"Υπερωρίες (λεπτά)":row.overtimeMinutes,"Απουσίες (λεπτά)":row.absenceMinutes,"Εκκρεμότητες":row.sourceIssues,"Σημείωση":row.note||""}));const workbook=XLSX.utils.book_new(),sheet=XLSX.utils.json_to_sheet(rows);sheet["!cols"]=[{wch:28},{wch:22},{wch:19},{wch:19},{wch:19},{wch:16},{wch:45}];XLSX.utils.book_append_sheet(workbook,sheet,"Ώρες εργασίας");const inclusiveEnd=new Date(new Date(period.endDate).getTime()-1);const info=XLSX.utils.aoa_to_sheet([["Εταιρεία",period.companyName],["Περίοδος",period.name||""],["Κατάστημα",period.storeName||"Όλα"],["Από",period.startDate],["Έως",inclusiveEnd],["Κατάσταση",period.status],["Σημαντικό","Το αρχείο αποτυπώνει ώρες και χειροκίνητες προσαρμογές. Δεν αποτελεί αυτόματο υπολογισμό μισθού ή νόμιμων προσαυξήσεων."]]);info["!cols"]=[{wch:20},{wch:95}];XLSX.utils.book_append_sheet(workbook,info,"Πληροφορίες");const buffer=XLSX.write(workbook,{type:"buffer",bookType:"xlsx"}),safe=String(period.name||"payroll-period").replace(/[^\p{L}\p{N}_-]+/gu,"_");res.json({filename:`${safe}.xlsx`,mimeType:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",dataUrl:`data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${buffer.toString("base64")}`})}catch(error){next(error)}
});

export default router;
