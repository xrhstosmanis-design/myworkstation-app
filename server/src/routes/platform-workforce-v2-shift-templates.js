import {Router} from "express";
import {z} from "zod";
import {prisma} from "../prisma.js";
import {serializeWorkforceShiftTemplate,workforceShiftCode} from "../workforce-v2-rules.js";
import {audit,contextFor} from "./workforce-v2-access.js";
import {confirmed,workforceShiftTemplateSchema} from "./workforce-v2-validation.js";

const router=Router({mergeParams:true});
const includeTemplate={requiredRole:true,_count:{select:{assignments:true}}};

async function loadTemplate(context,templateId){
  const item=await prisma.workforceShiftTemplate.findFirst({
    where:{id:String(templateId),companyId:context.company.id,storeId:context.store.id},include:includeTemplate
  });
  if(!item)throw Object.assign(new Error("Δεν βρέθηκε το πρότυπο βάρδιας."),{status:404});
  return item;
}

async function requiredRole(context,roleId){
  if(!roleId)return null;
  const role=await prisma.workforceRole.findFirst({where:{id:roleId,companyId:context.company.id,active:true},select:{id:true,name:true,code:true,active:true}});
  if(!role)throw Object.assign(new Error("Ο απαιτούμενος ρόλος δεν ανήκει στον ιδιοκτήτη ή είναι ανενεργός."),{status:400});
  return role;
}

async function ensureTemplateAvailable(context,{name,code,excludeId=null}){
  const duplicate=await prisma.workforceShiftTemplate.findFirst({
    where:{companyId:context.company.id,storeId:context.store.id,...(excludeId?{NOT:{id:excludeId}}:{}),OR:[{code},{name:{equals:name,mode:"insensitive"}}]},select:{id:true}
  });
  if(duplicate)throw Object.assign(new Error("Υπάρχει ήδη πρότυπο βάρδιας με το ίδιο όνομα ή κωδικό στο κατάστημα."),{status:409,code:"WORKFORCE_SHIFT_TEMPLATE_DUPLICATE"});
}

router.get("/",async(req,res,next)=>{
  try{
    const context=await contextFor(req),query=z.object({includeInactive:z.enum(["true","false"]).optional().default("true")}).parse(req.query||{});
    const items=await prisma.workforceShiftTemplate.findMany({
      where:{companyId:context.company.id,storeId:context.store.id,...(query.includeInactive==="true"?{}:{active:true})},
      include:includeTemplate,orderBy:[{active:"desc"},{startTime:"asc"},{name:"asc"}],take:200
    });
    res.json({items:items.map(serializeWorkforceShiftTemplate),count:items.length});
  }catch(error){next(error)}
});

router.post("/",async(req,res,next)=>{
  try{
    const context=await contextFor(req),body=workforceShiftTemplateSchema.parse(req.body||{}),role=await requiredRole(context,body.requiredRoleId);
    const code=workforceShiftCode(body.code||body.name);
    await ensureTemplateAvailable(context,{name:body.name,code});
    const created=await prisma.$transaction(async tx=>{
      const item=await tx.workforceShiftTemplate.create({data:{
        companyId:context.company.id,storeId:context.store.id,name:body.name,code,category:body.category,
        startTime:body.startTime,endTime:body.endTime,minimumPeople:body.minimumPeople,maximumPeople:body.maximumPeople??null,
        requiredRoleId:role?.id||null,requiresSupervisor:body.requiresSupervisor,changeAllowed:body.changeAllowed,active:true
      },include:includeTemplate});
      await audit(tx,req,{companyId:context.company.id,storeId:context.store.id,action:"WORKFORCE_SHIFT_TEMPLATE_CREATED",entityType:"WORKFORCE_SHIFT_TEMPLATE",entityId:item.id,after:item,reason:body.reason});
      return item;
    });
    res.status(201).json({item:serializeWorkforceShiftTemplate(created)});
  }catch(error){next(error)}
});

router.put("/:templateId",async(req,res,next)=>{
  try{
    const context=await contextFor(req),body=workforceShiftTemplateSchema.parse(req.body||{}),existing=await loadTemplate(context,req.params.templateId),role=await requiredRole(context,body.requiredRoleId);
    const code=workforceShiftCode(body.code||body.name);
    await ensureTemplateAvailable(context,{name:body.name,code,excludeId:existing.id});
    const updated=await prisma.$transaction(async tx=>{
      const item=await tx.workforceShiftTemplate.update({where:{id:existing.id},data:{
        name:body.name,code,category:body.category,startTime:body.startTime,endTime:body.endTime,
        minimumPeople:body.minimumPeople,maximumPeople:body.maximumPeople??null,requiredRoleId:role?.id||null,
        requiresSupervisor:body.requiresSupervisor,changeAllowed:body.changeAllowed
      },include:includeTemplate});
      await audit(tx,req,{companyId:context.company.id,storeId:context.store.id,action:"WORKFORCE_SHIFT_TEMPLATE_UPDATED",entityType:"WORKFORCE_SHIFT_TEMPLATE",entityId:item.id,before:existing,after:item,reason:body.reason});
      return item;
    });
    res.json({item:serializeWorkforceShiftTemplate(updated)});
  }catch(error){next(error)}
});

router.patch("/:templateId/status",async(req,res,next)=>{
  try{
    const context=await contextFor(req),body=z.object({active:z.boolean(),confirmed,reason:z.string().trim().min(3).max(500)}).parse(req.body||{}),existing=await loadTemplate(context,req.params.templateId);
    if(existing.active===body.active)return res.json({item:serializeWorkforceShiftTemplate(existing),changed:false});
    if(body.active&&existing.requiredRoleId)await requiredRole(context,existing.requiredRoleId);
    if(!body.active){
      const activeAssignments=await prisma.workforceScheduleAssignment.count({
        where:{shiftTemplateId:existing.id,schedule:{status:{in:["DRAFT","APPROVED","PUBLISHED"]},periodEnd:{gte:new Date()}}}
      });
      if(activeAssignments)return res.status(409).json({error:"Το πρότυπο χρησιμοποιείται σε ενεργό ή μελλοντικό πρόγραμμα και δεν μπορεί να απενεργοποιηθεί.",usage:{activeAssignments}});
    }
    const updated=await prisma.$transaction(async tx=>{
      const item=await tx.workforceShiftTemplate.update({where:{id:existing.id},data:{active:body.active},include:includeTemplate});
      await audit(tx,req,{companyId:context.company.id,storeId:context.store.id,action:body.active?"WORKFORCE_SHIFT_TEMPLATE_ACTIVATED":"WORKFORCE_SHIFT_TEMPLATE_DEACTIVATED",entityType:"WORKFORCE_SHIFT_TEMPLATE",entityId:item.id,before:existing,after:item,reason:body.reason});
      return item;
    });
    res.json({item:serializeWorkforceShiftTemplate(updated),changed:true});
  }catch(error){next(error)}
});

export default router;
