import crypto from "crypto";
import {Router} from "express";
import {z} from "zod";
import {prisma} from "../prisma.js";
import {
  audit,cleanText,contextFor,employeeInclude,employeeResponse,isSuperAdmin,loadEmployee,serializeEmployee,storesForContext
} from "./workforce-v2-access.js";
import {confirmed,employeeSchema,ensureEmployeeNameAvailable,validateEmployeeReferences} from "./workforce-v2-validation.js";

const router=Router({mergeParams:true});

router.get("/",async(req,res,next)=>{
  try{
    const context=await contextFor(req);
    const query=z.object({q:z.string().trim().max(120).optional(),includeInactive:z.enum(["true","false"]).optional().default("false"),scope:z.enum(["STORE","COMPANY"]).optional().default("STORE")}).parse(req.query||{});
    const stores=await storesForContext(req,context.company.id),storeMap=new Map(stores.map(store=>[store.id,store])),visibleStoreIds=stores.map(item=>item.id);
    const items=await prisma.workforceEmployee.findMany({
      where:{
        companyId:context.company.id,...(query.includeInactive==="true"?{}:{active:true}),
        ...(query.q?{fullName:{contains:query.q,mode:"insensitive"}}:{}),
        ...(query.scope==="STORE"
          ?{OR:[{baseStoreId:context.store.id},{storeAccess:{some:{storeId:context.store.id,active:true}}}]}
          :isSuperAdmin(req.user)?{}:{OR:[{baseStoreId:{in:visibleStoreIds}},{storeAccess:{some:{storeId:{in:visibleStoreIds},active:true}}}]})
      },
      include:employeeInclude,orderBy:[{active:"desc"},{fullName:"asc"}],take:500
    });
    res.json({items:items.map(item=>serializeEmployee(item,storeMap)),count:items.length});
  }catch(error){next(error)}
});

router.get("/:employeeId",async(req,res,next)=>{
  try{
    const context=await contextFor(req),employee=await loadEmployee(req,context,req.params.employeeId);
    const stores=await prisma.store.findMany({where:{companyId:context.company.id},select:{id:true,name:true}});
    res.json({item:serializeEmployee(employee,new Map(stores.map(store=>[store.id,store])))});
  }catch(error){next(error)}
});

router.post("/",async(req,res,next)=>{
  try{
    const context=await contextFor(req),body=employeeSchema.parse(req.body||{}),refs=await validateEmployeeReferences(req,context,body);
    await ensureEmployeeNameAvailable(context.company.id,body.baseStoreId,body.fullName);
    const created=await prisma.$transaction(async tx=>{
      const employee=await tx.workforceEmployee.create({data:{
        companyId:context.company.id,baseStoreId:body.baseStoreId,fullName:body.fullName,phone:cleanText(body.phone),
        email:cleanText(body.email)?.toLowerCase()||null,paymentType:body.paymentType,
        fixedMonthlyAmount:body.paymentType==="FIXED_MONTHLY"?body.fixedMonthlyAmount:null,maxDaysPerWeek:body.maxDaysPerWeek,
        maxHoursPerWeek:body.maxHoursPerWeek,minimumDaysOff:body.minimumDaysOff,canChangeStore:body.canChangeStore,
        worksMorning:body.worksMorning,worksAfternoon:body.worksAfternoon,worksNight:body.worksNight,
        worksWeekend:body.worksWeekend,notes:cleanText(body.notes),active:true,createdByUserId:req.user?.id||null
      }});
      await tx.workforceEmployeeRole.createMany({data:body.roleIds.map(roleId=>({id:crypto.randomUUID(),employeeId:employee.id,roleId,primary:roleId===body.primaryRoleId}))});
      await tx.workforceEmployeeStoreAccess.createMany({data:refs.storeAccess.map(access=>({id:crypto.randomUUID(),employeeId:employee.id,storeId:access.storeId,isBaseStore:access.storeId===body.baseStoreId,canSchedule:access.canSchedule,active:true}))});
      if(body.paymentType==="HOURLY")await tx.workforceHourlyRate.create({data:{id:crypto.randomUUID(),employeeId:employee.id,hourlyRate:body.hourlyRate,validFrom:body.effectiveFrom,createdByUserId:req.user?.id||null,note:"Αρχικό ωρομίσθιο"}});
      const result=await tx.workforceEmployee.findUnique({where:{id:employee.id},include:employeeInclude});
      await audit(tx,req,{companyId:context.company.id,storeId:context.store.id,action:"WORKFORCE_EMPLOYEE_CREATED",entityType:"WORKFORCE_EMPLOYEE",entityId:employee.id,after:result,reason:body.reason});
      return result;
    });
    res.status(201).json({item:serializeEmployee(created,new Map(refs.stores.map(store=>[store.id,store])))});
  }catch(error){next(error)}
});

router.put("/:employeeId",async(req,res,next)=>{
  try{
    const context=await contextFor(req),body=employeeSchema.parse(req.body||{}),existing=await loadEmployee(req,context,req.params.employeeId);
    const refs=await validateEmployeeReferences(req,context,body);
    await ensureEmployeeNameAvailable(context.company.id,body.baseStoreId,body.fullName,existing.id);
    const updated=await prisma.$transaction(async tx=>{
      const currentRate=await tx.workforceHourlyRate.findFirst({where:{employeeId:existing.id,validTo:null},orderBy:{validFrom:"desc"}});
      if(currentRate&&body.effectiveFrom<=currentRate.validFrom&&(body.paymentType!=="HOURLY"||Number(currentRate.hourlyRate)!==Number(body.hourlyRate))){
        throw Object.assign(new Error("Η νέα ημερομηνία ισχύος πρέπει να είναι μετά από το ενεργό ωρομίσθιο."),{status:400});
      }
      await tx.workforceEmployee.update({where:{id:existing.id},data:{
        baseStoreId:body.baseStoreId,fullName:body.fullName,phone:cleanText(body.phone),email:cleanText(body.email)?.toLowerCase()||null,
        paymentType:body.paymentType,fixedMonthlyAmount:body.paymentType==="FIXED_MONTHLY"?body.fixedMonthlyAmount:null,
        maxDaysPerWeek:body.maxDaysPerWeek,maxHoursPerWeek:body.maxHoursPerWeek,minimumDaysOff:body.minimumDaysOff,
        canChangeStore:body.canChangeStore,worksMorning:body.worksMorning,worksAfternoon:body.worksAfternoon,
        worksNight:body.worksNight,worksWeekend:body.worksWeekend,notes:cleanText(body.notes)
      }});
      await tx.workforceEmployeeRole.deleteMany({where:{employeeId:existing.id}});
      await tx.workforceEmployeeStoreAccess.deleteMany({where:{employeeId:existing.id}});
      await tx.workforceEmployeeRole.createMany({data:body.roleIds.map(roleId=>({id:crypto.randomUUID(),employeeId:existing.id,roleId,primary:roleId===body.primaryRoleId}))});
      await tx.workforceEmployeeStoreAccess.createMany({data:refs.storeAccess.map(access=>({id:crypto.randomUUID(),employeeId:existing.id,storeId:access.storeId,isBaseStore:access.storeId===body.baseStoreId,canSchedule:access.canSchedule,active:true}))});
      if(body.paymentType==="HOURLY"){
        if(!currentRate||Number(currentRate.hourlyRate)!==Number(body.hourlyRate)){
          if(currentRate)await tx.workforceHourlyRate.update({where:{id:currentRate.id},data:{validTo:new Date(body.effectiveFrom.getTime()-1)}});
          await tx.workforceHourlyRate.create({data:{id:crypto.randomUUID(),employeeId:existing.id,hourlyRate:body.hourlyRate,validFrom:body.effectiveFrom,createdByUserId:req.user?.id||null,note:"Αλλαγή ωρομισθίου"}});
        }
      }else if(currentRate)await tx.workforceHourlyRate.update({where:{id:currentRate.id},data:{validTo:new Date(body.effectiveFrom.getTime()-1)}});
      const result=await tx.workforceEmployee.findUnique({where:{id:existing.id},include:employeeInclude});
      await audit(tx,req,{companyId:context.company.id,storeId:context.store.id,action:"WORKFORCE_EMPLOYEE_UPDATED",entityType:"WORKFORCE_EMPLOYEE",entityId:existing.id,before:existing,after:result,reason:body.reason});
      return result;
    });
    res.json({item:serializeEmployee(updated,new Map(refs.stores.map(store=>[store.id,store])))});
  }catch(error){next(error)}
});

router.patch("/:employeeId/status",async(req,res,next)=>{
  try{
    const context=await contextFor(req),body=z.object({active:z.boolean(),confirmed,reason:z.string().trim().min(3).max(500)}).parse(req.body||{}),existing=await loadEmployee(req,context,req.params.employeeId);
    if(existing.active===body.active)return res.json({item:await employeeResponse(context.company.id,existing.id),changed:false});
    await prisma.$transaction(async tx=>{
      const updated=await tx.workforceEmployee.update({where:{id:existing.id},data:{active:body.active}});
      await audit(tx,req,{companyId:context.company.id,storeId:context.store.id,action:body.active?"WORKFORCE_EMPLOYEE_ACTIVATED":"WORKFORCE_EMPLOYEE_DEACTIVATED",entityType:"WORKFORCE_EMPLOYEE",entityId:existing.id,before:existing,after:updated,reason:body.reason});
    });
    res.json({item:await employeeResponse(context.company.id,existing.id),changed:true});
  }catch(error){next(error)}
});

export default router;
