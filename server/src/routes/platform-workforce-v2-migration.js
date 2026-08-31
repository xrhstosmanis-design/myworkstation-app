import {Router} from "express";
import {z} from "zod";
import {prisma} from "../prisma.js";
import {contextFor,isSuperAdmin,storesForContext} from "./workforce-v2-access.js";
import {buildWorkforceMigrationPreview} from "../workforce-v2-migration.js";

const router=Router({mergeParams:true});

router.post("/preview",async(req,res,next)=>{
  try{
    const context=await contextFor(req);
    const body=z.object({
      scope:z.enum(["STORE","COMPANY"]).optional().default("STORE"),
      includeInactive:z.boolean().optional().default(false),
      legacyEmployeeIds:z.array(z.string()).max(500).optional().default([])
    }).parse(req.body||{});
    const visibleStores=await storesForContext(req,context.company.id),visibleStoreIds=visibleStores.map(item=>item.id);
    const legacyEmployees=await prisma.employee.findMany({
      where:{
        store:{companyId:context.company.id},storeId:body.scope==="STORE"?context.store.id:{in:visibleStoreIds},
        ...(body.includeInactive?{}:{active:true}),...(body.legacyEmployeeIds.length?{id:{in:body.legacyEmployeeIds}}:{})
      },
      include:{store:true,rules:{include:{shiftType:true}}},orderBy:{fullName:"asc"},take:1000
    });
    const [workforceEmployees,roles]=await Promise.all([
      prisma.workforceEmployee.findMany({
        where:{companyId:context.company.id,...(isSuperAdmin(req.user)?{}:{OR:[{baseStoreId:{in:visibleStoreIds}},{storeAccess:{some:{storeId:{in:visibleStoreIds},active:true}}}]})},
        include:{roleAssignments:{include:{role:true}},storeAccess:true,hourlyRates:{orderBy:{validFrom:"desc"},take:1}}
      }),
      prisma.workforceRole.findMany({where:{companyId:context.company.id,active:true},orderBy:{name:"asc"}})
    ]);
    const preview=buildWorkforceMigrationPreview({legacyEmployees,workforceEmployees,roles,stores:visibleStores});
    res.json({
      mode:"PREVIEW_ONLY",readOnly:true,applyAvailable:false,applyEndpoint:null,generatedAt:new Date().toISOString(),
      company:context.company,contextStore:context.store,scope:body.scope,source:"LEGACY_EMPLOYEE",target:"WORKFORCE_EMPLOYEE",...preview
    });
  }catch(error){next(error)}
});

export default router;
