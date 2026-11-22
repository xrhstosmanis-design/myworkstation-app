import {staffRequestCapability} from '../../../shared/backoffice-staff.mjs';
import {requireStaffGrant} from '../services/backoffice-staff-access.js';
import {createHash} from "node:crypto";
import {Router} from "express";
import {z} from "zod";
import {prisma} from "../prisma.js";
import {audit,contextFor,loadEmployee} from "./workforce-v2-access.js";
import {confirmed} from "./workforce-v2-validation.js";

const router=Router({mergeParams:true});
const date=z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const employeeLabel={id:true,fullName:true};
const exclusiveEmployee=(c)=>({companyId:c.company.id,baseStoreId:c.store.id,
  storeAccess:{none:{active:true,storeId:{not:c.store.id}}}});
const types=["LEAVE","DAY_OFF","SICKNESS","EMERGENCY_ABSENCE","SHIFT_CHANGE_REQUEST","LATE_ARRIVAL","EARLY_DEPARTURE"];
const serial=item=>({...item,startDate:item.startDate.toISOString().slice(0,10),endDate:item.endDate.toISOString().slice(0,10),employee:{id:item.employee.id,fullName:item.employee.fullName}});
router.get("/",async(req,res,next)=>{try{
  const c=await contextFor(req),delegated=req.user?.staffAccess===true;
  const q=z.object({from:date.optional(),to:date.optional(),status:z.string().optional()}).parse(req.query||{});
  const items=await prisma.workforceLeaveRequest.findMany({where:{companyId:c.company.id,
    ...(delegated?{storeId:c.store.id,employee:{companyId:c.company.id,OR:[{baseStoreId:c.store.id},{storeAccess:{some:{storeId:c.store.id,active:true}}}]}}:{}),
    ...(q.from?{endDate:{gte:new Date(`${q.from}T00:00:00Z`)}}:{}),...(q.to?{startDate:{lte:new Date(`${q.to}T23:59:59Z`)}}:{}),...(q.status?{status:q.status}:{})},
    ...(delegated?{select:{id:true,companyId:true,storeId:true,employeeId:true,startDate:true,endDate:true,leaveType:true,status:true,comments:true,rejectedReason:true,approvedAt:true,createdAt:true,updatedAt:true,employee:{select:{id:true,fullName:true}}}}:{include:{employee:true}}),orderBy:{startDate:"asc"},take:500});
  if(delegated)await requireStaffGrant(prisma,req.user,c.store.id,'leaves.read');
  res.json({...(delegated?{companyId:c.company.id,storeId:c.store.id}:{}),items:items.map(serial)});
}catch(error){next(error)}});

router.get("/eligible-employees",async(req,res,next)=>{try{
  const c=await contextFor(req);
  if(req.user?.staffAccess!==true)return res.sendStatus(404);
  const items=await prisma.workforceEmployee.findMany({
    where:{...exclusiveEmployee(c),active:true},select:employeeLabel,orderBy:[{fullName:"asc"},{id:"asc"}]
  });
  await requireStaffGrant(prisma,req.user,c.store.id,"leaves.create");
  res.json({companyId:c.company.id,storeId:c.store.id,items});
}catch(error){next(error)}});

router.post("/",async(req,res,next)=>{try{
  const c=await contextFor(req);
  const b=z.object({
    employeeId:z.string().min(1),storeId:z.string().min(1).nullable().optional(),
    startDate:date,endDate:date,leaveType:z.enum(types),comments:z.string().trim().max(1000).optional().nullable(),
    confirmed,reason:z.string().trim().min(3).max(500)
  }).parse(req.body||{});
  if(b.endDate<b.startDate)throw Object.assign(new Error("Η λήξη δεν μπορεί να είναι πριν από την έναρξη."),{status:400});
  const startDate=new Date(b.startDate+"T00:00:00Z");
  const endDate=new Date(b.endDate+"T23:59:59Z");
  const data={companyId:c.company.id,storeId:b.storeId||c.store.id,employeeId:b.employeeId,
    startDate,endDate,leaveType:b.leaveType,comments:b.comments||null,requestedByUserId:req.user.id};
  if(req.user?.staffAccess===true){
    const requestId=z.string().uuid().parse(req.body?.requestId);
    if(b.storeId&&b.storeId!==c.store.id)return res.status(403).json({error:"Δεν επιτρέπεται άλλο κατάστημα."});
    const id=createHash("sha256").update(JSON.stringify([c.company.id,c.store.id,req.user.id,requestId])).digest("hex");
    if(!Number.isFinite(+startDate)||!Number.isFinite(+endDate)||startDate.toISOString().slice(0,10)!==b.startDate||endDate.toISOString().slice(0,10)!==b.endDate){
      return res.status(400).json({error:"Μη έγκυρη ημερομηνία άδειας."});
    }
    const scopedData={...data,id};
    const result=await prisma.$transaction(async tx=>{
      await requireStaffGrant(tx,req.user,c.store.id,"leaves.create");
      await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${"workforce-leave:"+id},0))`;
      const existing=await tx.workforceLeaveRequest.findUnique({where:{id}});
      if(existing){
        if(Object.entries(scopedData).some(([field,value])=>String(existing[field])!==String(value)))throw Object.assign(new Error("Το αίτημα έχει ήδη χρησιμοποιηθεί με άλλα στοιχεία."),{status:409});
        return {status:200,item:existing};
      }
      const employee=await tx.workforceEmployee.findFirst({
        where:{id:b.employeeId,...exclusiveEmployee(c),active:true},select:{id:true}
      });
      if(!employee)throw Object.assign(new Error("Δεν βρέθηκε διαθέσιμος εργαζόμενος καταστήματος."),{status:404});
      const item=await tx.workforceLeaveRequest.create({data:scopedData});
      await audit(tx,req,{companyId:c.company.id,storeId:c.store.id,action:"WORKFORCE_LEAVE_REQUESTED",entityType:"WORKFORCE_LEAVE_REQUEST",entityId:item.id,after:item,reason:b.reason});
      return {status:201,item};
    });
    const {item}=result;
    return res.status(result.status).json({item:{id:item.id,companyId:item.companyId,storeId:item.storeId,status:item.status}});
  }
  await loadEmployee(req,c,b.employeeId);
  const created=await prisma.$transaction(async tx=>{
    const item=await tx.workforceLeaveRequest.create({data,include:{employee:true}});
    await audit(tx,req,{companyId:c.company.id,storeId:c.store.id,action:"WORKFORCE_LEAVE_REQUESTED",entityType:"WORKFORCE_LEAVE_REQUEST",entityId:item.id,after:item,reason:b.reason});
    return item;
  });
  res.status(201).json({item:serial(created)});
}catch(error){next(error)}});
router.post("/:leaveId/decision",async(req,res,next)=>{try{const c=await contextFor(req);const b=z.object({status:z.enum(["APPROVED","REJECTED","CANCELLED"]),confirmed,reason:z.string().trim().min(3).max(500)}).parse(req.body||{});const delegated=req.user?.staffAccess===true;
const updated=await prisma.$transaction(async tx=>{
  const where={id:String(req.params.leaveId),companyId:c.company.id};
  if(delegated){
    const capability=staffRequestCapability(req.method,req.originalUrl.split('?')[0],b);
    await requireStaffGrant(tx,req.user,c.store.id,capability);
    where.storeId=c.store.id;
    where.employee=exclusiveEmployee(c);
  }
  const old=await tx.workforceLeaveRequest.findFirst({where});
  if(!old)throw Object.assign(new Error("Δεν βρέθηκε αίτημα απουσίας."),{status:404});
  const result=await tx.workforceLeaveRequest.updateMany({
    where:{...where,status:"REQUESTED"},
    data:{status:b.status,approvedByUserId:b.status==="APPROVED"?req.user.id:null,approvedAt:b.status==="APPROVED"?new Date():null,rejectedReason:b.status==="REJECTED"?b.reason:null}
  });
  if(result.count!==1)throw Object.assign(new Error("Το αίτημα έχει ήδη αποφασιστεί ή δεν είναι πλέον διαθέσιμο."),{status:409});
  const item=await tx.workforceLeaveRequest.findUniqueOrThrow({where:{id:old.id},include:{employee:{select:{id:true,fullName:true}}}});
  await audit(tx,req,{companyId:c.company.id,storeId:c.store.id,action:`WORKFORCE_LEAVE_${b.status}`,entityType:"WORKFORCE_LEAVE_REQUEST",entityId:item.id,before:old,after:item,reason:b.reason});
  return item;
});
const item=serial(updated);
res.json({item:delegated?{id:item.id,status:item.status,companyId:item.companyId,storeId:item.storeId}:item});
}catch(error){next(error)}});
export default router;
