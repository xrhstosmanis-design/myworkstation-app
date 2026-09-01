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
import scheduleRoutes from "./platform-workforce-v2-schedules.js";
import leaveRoutes from "./platform-workforce-v2-leaves.js";
import {
  contextFor,employeeInclude,managementGuard,rolesForCompany,serializeEmployee,serializeRole,storePaidModuleStates,storesForContext
} from "./workforce-v2-access.js";

const router=Router({mergeParams:true});
router.use(managementGuard);

const auditObject=value=>value&&typeof value==="object"&&!Array.isArray(value)?value:{};
const auditDate=value=>value?String(value).slice(0,10):null;

router.get("/audit",async(req,res,next)=>{
  try{
    const context=await contextFor(req);
    const rows=await prisma.workforceAuditLog.findMany({where:{companyId:context.company.id,storeId:context.store.id},orderBy:{createdAt:"desc"},take:100});
    const contexts=rows.map(row=>({row,before:auditObject(row.beforeJson),after:auditObject(row.afterJson)}));
    const actorIds=[...new Set(rows.map(row=>row.actorUserId).filter(Boolean))];
    const employeeIds=[...new Set(contexts.map(item=>item.after.employeeId||item.before.employeeId).filter(Boolean))];
    const templateIds=[...new Set(contexts.map(item=>item.after.shiftTemplateId||item.before.shiftTemplateId).filter(Boolean))];
    const [actors,employees,templates]=await Promise.all([
      actorIds.length?prisma.user.findMany({where:{id:{in:actorIds}},select:{id:true,fullName:true}}):[],
      employeeIds.length?prisma.workforceEmployee.findMany({where:{id:{in:employeeIds}},select:{id:true,fullName:true}}):[],
      templateIds.length?prisma.workforceShiftTemplate.findMany({where:{id:{in:templateIds}},select:{id:true,name:true,startTime:true,endTime:true}}):[]
    ]);
    const actorMap=new Map(actors.map(item=>[item.id,item.fullName]));
    const employeeMap=new Map(employees.map(item=>[item.id,item.fullName]));
    const templateMap=new Map(templates.map(item=>[item.id,item]));
    res.json({items:contexts.map(({row,before,after})=>{
      const source={...before,...after},employeeId=source.employeeId||null,shiftTemplateId=source.shiftTemplateId||null,template=templateMap.get(shiftTemplateId);
      return {id:row.id,action:row.action,entityType:row.entityType,createdAt:row.createdAt,actorName:actorMap.get(row.actorUserId)||"Χρήστης συστήματος",storeName:context.store.name,employeeName:employeeMap.get(employeeId)||null,date:auditDate(source.date||source.startDate),shift:template?`${template.name} · ${template.startTime}–${template.endTime}`:null,ruleCode:source.ruleCode||null,reason:row.reason||null};
    })});
  }catch(error){next(error)}
});

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
router.use("/schedules",scheduleRoutes);
router.use("/leaves",leaveRoutes);
router.use("/migration",migrationRoutes);

// Deliberately terminate unknown Workforce routes here. This guarantees that
// a non-existent migration/apply action remains an explicit 404 and can never
// fall through into another Platform router or a broader privilege gate.
router.use((req,res)=>res.status(404).json({error:"Δεν βρέθηκε η λειτουργία Workforce v2.",code:"WORKFORCE_ROUTE_NOT_FOUND"}));

export default router;
