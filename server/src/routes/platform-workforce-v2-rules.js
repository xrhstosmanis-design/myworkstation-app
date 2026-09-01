import {Router} from "express";
import {z} from "zod";
import {prisma} from "../prisma.js";
import {PERSONNEL_PRO,requirePersonnelPackage} from "../store-paid-modules.js";
import {normalizeWorkforceRuleValue,serializeWorkforceRule} from "../workforce-v2-rules.js";
import {audit,cleanText,contextFor,loadEmployee} from "./workforce-v2-access.js";
import {confirmed,workforceRuleSchema} from "./workforce-v2-validation.js";

const router=Router({mergeParams:true});

async function rulesContext(req){
  const context=await contextFor(req);
  await requirePersonnelPackage(req,context.store.id,PERSONNEL_PRO);
  return context;
}

async function loadRuleEmployee(req,context,employeeId){
  const employee=await loadEmployee(req,context,employeeId);
  const visible=employee.baseStoreId===context.store.id||(employee.storeAccess||[]).some(access=>access.storeId===context.store.id&&access.active);
  if(!visible)throw Object.assign(new Error("Δεν βρέθηκε εργαζόμενος Workforce v2 στο επιλεγμένο κατάστημα."),{status:404});
  return employee;
}

async function loadRule(req,context,ruleId){
  const rule=await prisma.workforceEmployeeRule.findFirst({
    where:{id:String(ruleId),employee:{companyId:context.company.id}},
    include:{employee:{select:{id:true,fullName:true}}}
  });
  if(!rule)throw Object.assign(new Error("Δεν βρέθηκε ο κανόνας εργαζομένου."),{status:404});
  await loadRuleEmployee(req,context,rule.employeeId);
  return rule;
}

async function relatedEmployee(req,context,employeeId,relatedEmployeeId){
  if(!relatedEmployeeId)return null;
  if(String(employeeId)===String(relatedEmployeeId))throw Object.assign(new Error("Ο εργαζόμενος δεν μπορεί να είναι ασύμβατος με τον εαυτό του."),{status:400});
  return loadRuleEmployee(req,context,relatedEmployeeId);
}

async function ensureRuleAvailable({employeeId,ruleType,relatedEmployeeId=null,excludeId=null}){
  const duplicate=await prisma.workforceEmployeeRule.findFirst({
    where:{employeeId,ruleType,relatedEmployeeId:relatedEmployeeId||null,active:true,...(excludeId?{NOT:{id:excludeId}}:{})},
    select:{id:true}
  });
  if(duplicate)throw Object.assign(new Error("Υπάρχει ήδη ενεργός ίδιος κανόνας για αυτόν τον εργαζόμενο."),{status:409,code:"WORKFORCE_RULE_DUPLICATE"});
}

async function serializeWithNames(rule){
  const ids=[rule.employeeId,rule.relatedEmployeeId].filter(Boolean);
  const employees=ids.length?await prisma.workforceEmployee.findMany({where:{id:{in:ids}},select:{id:true,fullName:true}}):[];
  const names=new Map(employees.map(item=>[item.id,item.fullName]));
  return serializeWorkforceRule(rule,{employeeName:names.get(rule.employeeId)||null,relatedEmployeeName:names.get(rule.relatedEmployeeId)||null});
}

router.get("/",async(req,res,next)=>{
  try{
    const context=await rulesContext(req);
    const query=z.object({employeeId:z.string().optional(),includeInactive:z.enum(["true","false"]).optional().default("false")}).parse(req.query||{});
    let employeeIds=[];
    if(query.employeeId){
      const employee=await loadRuleEmployee(req,context,query.employeeId);employeeIds=[employee.id];
    }else{
      const visible=await prisma.workforceEmployee.findMany({
        where:{companyId:context.company.id,OR:[{baseStoreId:context.store.id},{storeAccess:{some:{storeId:context.store.id,active:true}}}]},
        select:{id:true}
      });
      employeeIds=visible.map(item=>item.id);
    }
    const items=employeeIds.length?await prisma.workforceEmployeeRule.findMany({
      where:{employeeId:{in:employeeIds},...(query.includeInactive==="true"?{}:{active:true})},
      include:{employee:{select:{id:true,fullName:true}}},orderBy:[{active:"desc"},{createdAt:"asc"}],take:1000
    }):[];
    const relatedIds=[...new Set(items.map(item=>item.relatedEmployeeId).filter(Boolean))];
    const related=relatedIds.length?await prisma.workforceEmployee.findMany({where:{id:{in:relatedIds},companyId:context.company.id},select:{id:true,fullName:true}}):[];
    const relatedNames=new Map(related.map(item=>[item.id,item.fullName]));
    res.json({items:items.map(item=>serializeWorkforceRule(item,{employeeName:item.employee?.fullName||null,relatedEmployeeName:relatedNames.get(item.relatedEmployeeId)||null})),count:items.length});
  }catch(error){next(error)}
});

router.post("/",async(req,res,next)=>{
  try{
    const context=await rulesContext(req),body=workforceRuleSchema.parse(req.body||{});
    const employee=await loadRuleEmployee(req,context,body.employeeId),related=await relatedEmployee(req,context,employee.id,body.relatedEmployeeId);
    await ensureRuleAvailable({employeeId:employee.id,ruleType:body.ruleType,relatedEmployeeId:related?.id||null});
    const created=await prisma.$transaction(async tx=>{
      const item=await tx.workforceEmployeeRule.create({data:{
        employeeId:employee.id,ruleType:body.ruleType,severity:body.severity,relatedEmployeeId:related?.id||null,
        valueJson:normalizeWorkforceRuleValue(body.ruleType,body.value),note:cleanText(body.note),active:true,
        validFrom:body.validFrom||null,validTo:body.validTo||null
      }});
      await audit(tx,req,{companyId:context.company.id,storeId:context.store.id,action:"WORKFORCE_RULE_CREATED",entityType:"WORKFORCE_EMPLOYEE_RULE",entityId:item.id,after:item,reason:body.reason});
      return item;
    });
    res.status(201).json({item:await serializeWithNames(created)});
  }catch(error){next(error)}
});

router.put("/:ruleId",async(req,res,next)=>{
  try{
    const context=await rulesContext(req),body=workforceRuleSchema.parse(req.body||{}),existing=await loadRule(req,context,req.params.ruleId);
    const employee=await loadRuleEmployee(req,context,body.employeeId),related=await relatedEmployee(req,context,employee.id,body.relatedEmployeeId);
    await ensureRuleAvailable({employeeId:employee.id,ruleType:body.ruleType,relatedEmployeeId:related?.id||null,excludeId:existing.id});
    const updated=await prisma.$transaction(async tx=>{
      const item=await tx.workforceEmployeeRule.update({where:{id:existing.id},data:{
        employeeId:employee.id,ruleType:body.ruleType,severity:body.severity,relatedEmployeeId:related?.id||null,
        valueJson:normalizeWorkforceRuleValue(body.ruleType,body.value),note:cleanText(body.note),
        validFrom:body.validFrom||null,validTo:body.validTo||null
      }});
      await audit(tx,req,{companyId:context.company.id,storeId:context.store.id,action:"WORKFORCE_RULE_UPDATED",entityType:"WORKFORCE_EMPLOYEE_RULE",entityId:item.id,before:existing,after:item,reason:body.reason});
      return item;
    });
    res.json({item:await serializeWithNames(updated)});
  }catch(error){next(error)}
});

router.patch("/:ruleId/status",async(req,res,next)=>{
  try{
    const context=await rulesContext(req),body=z.object({active:z.boolean(),confirmed,reason:z.string().trim().min(3).max(500)}).parse(req.body||{}),existing=await loadRule(req,context,req.params.ruleId);
    if(existing.active===body.active)return res.json({item:await serializeWithNames(existing),changed:false});
    if(body.active)await ensureRuleAvailable({employeeId:existing.employeeId,ruleType:existing.ruleType,relatedEmployeeId:existing.relatedEmployeeId,excludeId:existing.id});
    const updated=await prisma.$transaction(async tx=>{
      const item=await tx.workforceEmployeeRule.update({where:{id:existing.id},data:{active:body.active}});
      await audit(tx,req,{companyId:context.company.id,storeId:context.store.id,action:body.active?"WORKFORCE_RULE_ACTIVATED":"WORKFORCE_RULE_DEACTIVATED",entityType:"WORKFORCE_EMPLOYEE_RULE",entityId:item.id,before:existing,after:item,reason:body.reason});
      return item;
    });
    res.json({item:await serializeWithNames(updated),changed:true});
  }catch(error){next(error)}
});

export default router;
