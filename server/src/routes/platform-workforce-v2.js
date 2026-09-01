import {Router} from "express";
import {prisma} from "../prisma.js";
import {PERSONNEL_PRO,isSuperAdmin} from "../store-paid-modules.js";
import {
  WORKFORCE_RULE_DEFINITIONS,
  WORKFORCE_RULE_SEVERITIES,
  WORKFORCE_SHIFT_CATEGORIES,
  serializeWorkforceShiftTemplate
} from "../workforce-v2-rules.js";
import employeeRoutes from "./platform-workforce-v2-employees.js";
import migrationRoutes from "./platform-workforce-v2-migration.js";
import roleRoutes from "./platform-workforce-v2-roles.js";
import ruleRoutes from "./platform-workforce-v2-rules.js";
import shiftTemplateRoutes from "./platform-workforce-v2-shift-templates.js";
import {
  contextFor,employeeInclude,managementGuard,rolesForCompany,serializeEmployee,serializeRole,storePaidModuleStates,storesForContext
} from "./workforce-v2-access.js";

const router=Router({mergeParams:true});
router.use(managementGuard);

router.get("/bootstrap",async(req,res,next)=>{
  try{
    const context=await contextFor(req);
    const [stores,roles,moduleStates,shiftTemplates]=await Promise.all([
      storesForContext(req,context.company.id),rolesForCompany(context.company.id),storePaidModuleStates(context.store.id),
      prisma.workforceShiftTemplate.findMany({
        where:{companyId:context.company.id,storeId:context.store.id},include:{requiredRole:true,_count:{select:{assignments:true}}},
        orderBy:[{active:"desc"},{startTime:"asc"},{name:"asc"}],take:200
      })
    ]);
    const storeMap=new Map(stores.map(store=>[store.id,store]));
    const employees=await prisma.workforceEmployee.findMany({
      where:{companyId:context.company.id,OR:[{baseStoreId:context.store.id},{storeAccess:{some:{storeId:context.store.id,active:true}}}]},
      include:employeeInclude,orderBy:[{active:"desc"},{fullName:"asc"}],take:500
    });
    const rulesManagement=isSuperAdmin(req.user)||Boolean(moduleStates.states?.[PERSONNEL_PRO]?.effectiveActive);
    res.json({
      company:context.company,contextStore:context.store,stores,roles:roles.map(serializeRole),
      employees:employees.map(employee=>serializeEmployee(employee,storeMap)),shiftTemplates:shiftTemplates.map(serializeWorkforceShiftTemplate),
      ruleDefinitions:WORKFORCE_RULE_DEFINITIONS,ruleSeverities:WORKFORCE_RULE_SEVERITIES,shiftCategories:WORKFORCE_SHIFT_CATEGORIES,
      moduleStates:moduleStates.states,
      capabilities:{
        employeeCreate:true,employeeUpdate:true,roleManagement:true,multiStoreAccess:true,
        rulesManagement,shiftTemplateManagement:true,migrationPreview:true,migrationApply:false
      },
      migration:{mode:"PREVIEW_ONLY",applyAvailable:false,applyEndpoint:null}
    });
  }catch(error){next(error)}
});

router.use("/roles",roleRoutes);
router.use("/employees",employeeRoutes);
router.use("/rules",ruleRoutes);
router.use("/shift-templates",shiftTemplateRoutes);
router.use("/migration",migrationRoutes);

// Deliberately terminate unknown Workforce routes here. This guarantees that
// a non-existent migration/apply action remains an explicit 404 and can never
// fall through into another Platform router or a broader privilege gate.
router.use((req,res)=>res.status(404).json({error:"Δεν βρέθηκε η λειτουργία Workforce v2.",code:"WORKFORCE_ROUTE_NOT_FOUND"}));

export default router;
