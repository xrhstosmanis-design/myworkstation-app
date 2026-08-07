import crypto from "crypto";
import {Router} from "express";
import {z} from "zod";
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
  try{const range=parseRange(req.query);if(range.storeId&&!await ownedStore(req.user.companyId,range.storeId))return res.status(404).json({error:"Δεν βρέθηκε το κατάστημα."});const employees=await prisma.$queryRaw`SELECT e."id",e."fullName",e."storeId",s."name" AS "storeName" FROM "Employee" e JOIN "Store" s ON s."id"=e."storeId" WHERE s."companyId"=${req.user.companyId} AND e."active"=true AND (${range.storeId||null}::text IS NULL OR e."storeId"=${range.storeId||null}) ORDER BY e."fullName"`;const events=await prisma.$queryRaw`SELECT "id","employeeId","eventType","occurredAt" FROM "AttendanceEvent" WHERE "companyId"=${req.user.companyId} AND "voidedAt" IS NULL AND "occurredAt">=${range.from} AND "occurredAt"<${range.to} AND (${range.storeId||null}::text IS NULL OR "storeId"=${range.storeId||null}) UNION ALL SELECT prior."id",prior."employeeId",prior."eventType",prior."occurredAt" FROM (SELECT DISTINCT ON (a."employeeId") a."id",a."employeeId",a."eventType",a."occurredAt" FROM "AttendanceEvent" a WHERE a."companyId"=${req.user.companyId} AND a."voidedAt" IS NULL AND a."occurredAt"<${range.from} AND (${range.storeId||null}::text IS NULL OR a."storeId"=${range.storeId||null}) ORDER BY a."employeeId",a."occurredAt" DESC) prior WHERE prior."eventType"='IN' ORDER BY "occurredAt"`;const rows=calculateAttendanceSummary(employees,events,range.from,range.to);res.json({from:range.from,to:range.to,rows,totals:{workedMinutes:rows.reduce((sum,row)=>sum+row.workedMinutes,0),shifts:rows.reduce((sum,row)=>sum+row.shifts,0),issues:rows.reduce((sum,row)=>sum+row.issues.length,0)}})}catch(error){next(error)}
});

router.post("/events",async(req,res,next)=>{
  try{const body=z.object({storeId:z.string(),employeeId:z.string(),eventType:z.enum(["IN","OUT"]),occurredAt:z.coerce.date(),note:z.string().trim().max(300).optional().nullable()}).parse(req.body||{});const store=await ownedStore(req.user.companyId,body.storeId),employee=await ownedEmployee(req.user.companyId,body.employeeId,body.storeId);if(!store||!employee)return res.status(404).json({error:"Δεν βρέθηκε εργαζόμενος στο κατάστημα."});const eventId=uid();await prisma.$executeRaw`INSERT INTO "AttendanceEvent" ("id","companyId","storeId","employeeId","eventType","method","occurredAt","note","responsibleName","createdByUserId") VALUES (${eventId},${req.user.companyId},${store.id},${employee.id},${body.eventType},'MANUAL',${body.occurredAt},${body.note||null},${req.user.fullName||"Backoffice"},${req.user.id})`;res.status(201).json({id:eventId})}catch(error){next(error)}
});

router.post("/events/:eventId/correct",async(req,res,next)=>{
  try{const body=z.object({eventType:z.enum(["IN","OUT"]),occurredAt:z.coerce.date(),reason:z.string().trim().min(3).max(300),note:z.string().trim().max(300).optional().nullable()}).parse(req.body||{});const rows=await prisma.$queryRaw`SELECT "id","storeId","employeeId","voidedAt" FROM "AttendanceEvent" WHERE "id"=${req.params.eventId} AND "companyId"=${req.user.companyId} LIMIT 1`;const original=rows[0];if(!original)return res.status(404).json({error:"Δεν βρέθηκε η καταχώριση."});if(original.voidedAt)return res.status(409).json({error:"Η καταχώριση έχει ήδη διορθωθεί."});const replacementId=uid();await prisma.$transaction(async tx=>{const changed=await tx.$queryRaw`UPDATE "AttendanceEvent" SET "voidedAt"=CURRENT_TIMESTAMP,"voidedByUserId"=${req.user.id},"voidReason"=${body.reason},"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${original.id} AND "companyId"=${req.user.companyId} AND "voidedAt" IS NULL RETURNING "id"`;if(!changed[0]){const error=new Error("Η καταχώριση έχει ήδη διορθωθεί.");error.status=409;throw error}await tx.$executeRaw`INSERT INTO "AttendanceEvent" ("id","companyId","storeId","employeeId","eventType","method","occurredAt","note","responsibleName","createdByUserId","supersedesEventId") VALUES (${replacementId},${req.user.companyId},${original.storeId},${original.employeeId},${body.eventType},'CORRECTION',${body.occurredAt},${body.note||null},${req.user.fullName||"Backoffice"},${req.user.id},${original.id})`});res.status(201).json({id:replacementId,supersedesEventId:original.id})}catch(error){next(error)}
});

export default router;
