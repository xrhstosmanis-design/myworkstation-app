import crypto from "crypto";
import {Router} from "express";
import {z} from "zod";
import {prisma} from "../prisma.js";
import {audit,contextFor,isSuperAdmin,storesForContext} from "./workforce-v2-access.js";
import {buildWorkforceMigrationPreview,workforceRoleCode} from "../workforce-v2-migration.js";

const router=Router({mergeParams:true});

const previewInput=z.object({
  scope:z.enum(["STORE","COMPANY"]).optional().default("STORE"),includeInactive:z.boolean().optional().default(false),
  legacyEmployeeIds:z.array(z.string()).max(500).optional().default([])
});

async function loadMigrationPreview(req,context,body){
  const visibleStores=await storesForContext(req,context.company.id),visibleStoreIds=visibleStores.map(item=>item.id);
  const legacyEmployees=await prisma.employee.findMany({
    where:{store:{companyId:context.company.id},storeId:body.scope==="STORE"?context.store.id:{in:visibleStoreIds},
      ...(body.includeInactive?{}:{active:true}),...(body.legacyEmployeeIds.length?{id:{in:body.legacyEmployeeIds}}:{})},
    include:{store:true,rules:{include:{shiftType:true}}},orderBy:{fullName:"asc"},take:1000
  });
  const [workforceEmployees,roles]=await Promise.all([
    prisma.workforceEmployee.findMany({
      where:{companyId:context.company.id,...(isSuperAdmin(req.user)?{}:{OR:[{baseStoreId:{in:visibleStoreIds}},{storeAccess:{some:{storeId:{in:visibleStoreIds},active:true}}}]})},
      include:{roleAssignments:{include:{role:true}},storeAccess:true,hourlyRates:{orderBy:{validFrom:"desc"},take:1}}
    }),
    prisma.workforceRole.findMany({where:{companyId:context.company.id,active:true},orderBy:{name:"asc"}})
  ]);
  return {preview:buildWorkforceMigrationPreview({legacyEmployees,workforceEmployees,roles,stores:visibleStores})};
}

router.post("/preview",async(req,res,next)=>{
  try{
    const context=await contextFor(req);
    const body=previewInput.parse(req.body||{}),{preview}=await loadMigrationPreview(req,context,body);
    res.json({
      mode:"REVIEW_REQUIRED",readOnly:true,applyAvailable:true,applyEndpoint:"./apply",generatedAt:new Date().toISOString(),
      company:context.company,contextStore:context.store,scope:body.scope,source:"LEGACY_EMPLOYEE",target:"WORKFORCE_EMPLOYEE",...preview
    });
  }catch(error){next(error)}
});

router.post("/apply",async(req,res,next)=>{
  try{
    if(!isSuperAdmin(req.user))return res.status(403).json({error:"Η μεταφορά εργαζομένων απαιτεί Platform Super Admin."});
    const context=await contextFor(req);
    const body=previewInput.extend({previewHash:z.string().regex(/^[a-f0-9]{64}$/),legacyEmployeeIds:z.array(z.string()).min(1).max(100),
      confirmed:z.literal(true),acceptWarnings:z.literal(true),reason:z.string().trim().min(3).max(500)}).parse(req.body||{});
    const requestedIds=[...new Set(body.legacyEmployeeIds)];
    const {preview}=await loadMigrationPreview(req,context,{...body,legacyEmployeeIds:[]});
    if(preview.previewHash!==body.previewHash)return res.status(409).json({error:"Η προεπισκόπηση άλλαξε. Δημιούργησε νέα προεπισκόπηση πριν από τη μεταφορά.",code:"WORKFORCE_MIGRATION_PREVIEW_STALE"});
    const selectedRows=preview.rows.filter(row=>requestedIds.includes(row.legacy.id));
    if(selectedRows.length!==requestedIds.length)return res.status(400).json({error:"Ένας ή περισσότεροι εργαζόμενοι δεν ανήκουν πλέον στην προεπισκόπηση."});
    const invalid=selectedRows.filter(row=>row.status==="BLOCKED"||row.status==="ALREADY_LINKED"||row.duplicateCandidates.length>0);
    if(invalid.length)return res.status(409).json({error:"Η μεταφορά σταμάτησε λόγω μπλοκαρισμένου, ήδη συνδεδεμένου ή πιθανού διπλότυπου εργαζομένου.",code:"WORKFORCE_MIGRATION_SELECTION_INVALID",employeeIds:invalid.map(row=>row.legacy.id)});
    const created=await prisma.$transaction(async tx=>{
      const rows=[];
      for(const row of selectedRows){
        const roleName=row.roleMapping.role?.name||row.roleMapping.proposedName||"Εργαζόμενος";
        const roleCode=workforceRoleCode(row.roleMapping.role?.code||row.roleMapping.proposedCode||roleName);
        let role=row.roleMapping.role||await tx.workforceRole.findFirst({where:{companyId:context.company.id,OR:[{code:roleCode},{name:{equals:roleName,mode:"insensitive"}}]}});
        if(!role){
          role=await tx.workforceRole.create({data:{companyId:context.company.id,name:roleName,code:roleCode,description:"Δημιουργήθηκε από ελεγχόμενη μεταφορά παλιού Workforce."}});
          await audit(tx,req,{companyId:context.company.id,storeId:context.store.id,action:"WORKFORCE_MIGRATION_ROLE_CREATED",entityType:"WORKFORCE_ROLE",entityId:role.id,after:role,reason:body.reason});
        }
        const proposed=row.proposed;
        const employee=await tx.workforceEmployee.create({data:{companyId:context.company.id,legacyEmployeeId:row.legacy.id,
          baseStoreId:proposed.baseStoreId,fullName:proposed.fullName,phone:proposed.phone,email:proposed.email?.toLowerCase()||null,
          paymentType:proposed.paymentType,fixedMonthlyAmount:proposed.fixedMonthlyAmount,maxDaysPerWeek:proposed.maxDaysPerWeek,
          maxHoursPerWeek:proposed.maxHoursPerWeek,minimumDaysOff:proposed.minimumDaysOff,canChangeStore:proposed.canChangeStore,
          worksMorning:proposed.worksMorning,worksAfternoon:proposed.worksAfternoon,worksNight:proposed.worksNight,
          worksWeekend:proposed.worksWeekend,notes:proposed.notes,active:proposed.active,createdByUserId:req.user?.id||null}});
        await tx.workforceEmployeeRole.create({data:{id:crypto.randomUUID(),employeeId:employee.id,roleId:role.id,primary:true}});
        await tx.workforceEmployeeStoreAccess.createMany({data:proposed.storeAccess.map(access=>({id:crypto.randomUUID(),employeeId:employee.id,storeId:access.storeId,isBaseStore:access.isBaseStore,canSchedule:access.canSchedule,active:true}))});
        await audit(tx,req,{companyId:context.company.id,storeId:row.legacy.storeId,action:"WORKFORCE_LEGACY_EMPLOYEE_MIGRATED",entityType:"WORKFORCE_EMPLOYEE",entityId:employee.id,
          after:{employee,legacyEmployeeId:row.legacy.id,previewHash:body.previewHash,warnings:row.warnings},reason:body.reason});
        rows.push({id:employee.id,legacyEmployeeId:row.legacy.id,fullName:employee.fullName,roleId:role.id});
      }
      await audit(tx,req,{companyId:context.company.id,storeId:context.store.id,action:"WORKFORCE_MIGRATION_APPLIED",entityType:"WORKFORCE_MIGRATION",entityId:body.previewHash,after:{created:rows,previewHash:body.previewHash},reason:body.reason});
      return rows;
    });
    res.status(201).json({created,count:created.length,previewHash:body.previewHash});
  }catch(error){
    if(error?.code==="P2002")return res.status(409).json({error:"Η μεταφορά σταμάτησε για αποφυγή διπλοεγγραφής. Δημιούργησε νέα προεπισκόπηση.",code:"WORKFORCE_MIGRATION_DUPLICATE"});
    next(error);
  }
});

export default router;
