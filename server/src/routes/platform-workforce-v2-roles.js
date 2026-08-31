import {Router} from "express";
import {z} from "zod";
import {prisma} from "../prisma.js";
import {audit,cleanText,contextFor,rolesForCompany,serializeRole} from "./workforce-v2-access.js";
import {confirmed,roleSchema} from "./workforce-v2-validation.js";
import {workforceRoleCode} from "../workforce-v2-migration.js";

const router=Router({mergeParams:true});

router.get("/",async(req,res,next)=>{
  try{const context=await contextFor(req);res.json({items:(await rolesForCompany(context.company.id)).map(serializeRole)})}
  catch(error){next(error)}
});

router.post("/",async(req,res,next)=>{
  try{
    const context=await contextFor(req),body=roleSchema.parse(req.body||{}),code=workforceRoleCode(body.code||body.name);
    const duplicate=await prisma.workforceRole.findFirst({where:{companyId:context.company.id,OR:[{code},{name:{equals:body.name,mode:"insensitive"}}]},select:{id:true}});
    if(duplicate)return res.status(409).json({error:"Υπάρχει ήδη ρόλος με το ίδιο όνομα ή κωδικό."});
    const role=await prisma.$transaction(async tx=>{
      const created=await tx.workforceRole.create({data:{companyId:context.company.id,name:body.name,code,description:cleanText(body.description)}});
      await audit(tx,req,{companyId:context.company.id,storeId:context.store.id,action:"WORKFORCE_ROLE_CREATED",entityType:"WORKFORCE_ROLE",entityId:created.id,after:created,reason:body.reason});
      return created;
    });
    res.status(201).json({item:serializeRole({...role,_count:{employeeAssignments:0,requiredByTemplates:0}})});
  }catch(error){next(error)}
});

router.put("/:roleId",async(req,res,next)=>{
  try{
    const context=await contextFor(req),body=roleSchema.parse(req.body||{});
    const existing=await prisma.workforceRole.findFirst({where:{id:req.params.roleId,companyId:context.company.id},include:{_count:{select:{employeeAssignments:true,requiredByTemplates:true}}}});
    if(!existing)return res.status(404).json({error:"Δεν βρέθηκε ο ρόλος."});
    const code=workforceRoleCode(body.code||body.name);
    const duplicate=await prisma.workforceRole.findFirst({where:{companyId:context.company.id,NOT:{id:existing.id},OR:[{code},{name:{equals:body.name,mode:"insensitive"}}]},select:{id:true}});
    if(duplicate)return res.status(409).json({error:"Υπάρχει ήδη ρόλος με το ίδιο όνομα ή κωδικό."});
    const updated=await prisma.$transaction(async tx=>{
      const item=await tx.workforceRole.update({where:{id:existing.id},data:{name:body.name,code,description:cleanText(body.description)}});
      await audit(tx,req,{companyId:context.company.id,storeId:context.store.id,action:"WORKFORCE_ROLE_UPDATED",entityType:"WORKFORCE_ROLE",entityId:item.id,before:serializeRole(existing),after:item,reason:body.reason});
      return item;
    });
    res.json({item:serializeRole({...updated,_count:existing._count})});
  }catch(error){next(error)}
});

router.patch("/:roleId/status",async(req,res,next)=>{
  try{
    const context=await contextFor(req),body=z.object({active:z.boolean(),confirmed,reason:z.string().trim().min(3).max(500)}).parse(req.body||{});
    const existing=await prisma.workforceRole.findFirst({where:{id:req.params.roleId,companyId:context.company.id},include:{_count:{select:{employeeAssignments:true,requiredByTemplates:true}}}});
    if(!existing)return res.status(404).json({error:"Δεν βρέθηκε ο ρόλος."});
    if(!body.active){
      const [activeEmployees,activeTemplates]=await Promise.all([
        prisma.workforceEmployeeRole.count({where:{roleId:existing.id,employee:{companyId:context.company.id,active:true}}}),
        prisma.workforceShiftTemplate.count({where:{requiredRoleId:existing.id,companyId:context.company.id,active:true}})
      ]);
      if(activeEmployees||activeTemplates)return res.status(409).json({error:"Ο ρόλος χρησιμοποιείται από ενεργούς εργαζομένους ή πρότυπα βαρδιών και δεν μπορεί να απενεργοποιηθεί.",usage:{activeEmployees,activeTemplates}});
    }
    const updated=await prisma.$transaction(async tx=>{
      const item=await tx.workforceRole.update({where:{id:existing.id},data:{active:body.active}});
      await audit(tx,req,{companyId:context.company.id,storeId:context.store.id,action:body.active?"WORKFORCE_ROLE_ACTIVATED":"WORKFORCE_ROLE_DEACTIVATED",entityType:"WORKFORCE_ROLE",entityId:item.id,before:existing,after:item,reason:body.reason});
      return item;
    });
    res.json({item:serializeRole({...updated,_count:existing._count})});
  }catch(error){next(error)}
});

export default router;
