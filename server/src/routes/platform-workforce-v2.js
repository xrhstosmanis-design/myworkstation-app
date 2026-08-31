import {Router} from "express";
import {prisma} from "../prisma.js";
import employeeRoutes from "./platform-workforce-v2-employees.js";
import migrationRoutes from "./platform-workforce-v2-migration.js";
import roleRoutes from "./platform-workforce-v2-roles.js";
import {
  contextFor,employeeInclude,managementGuard,rolesForCompany,serializeEmployee,serializeRole,storePaidModuleStates,storesForContext
} from "./workforce-v2-access.js";

const router=Router({mergeParams:true});
router.use(managementGuard);

router.get("/bootstrap",async(req,res,next)=>{
  try{
    const context=await contextFor(req);
    const [stores,roles,moduleStates]=await Promise.all([
      storesForContext(req,context.company.id),rolesForCompany(context.company.id),storePaidModuleStates(context.store.id)
    ]);
    const storeMap=new Map(stores.map(store=>[store.id,store]));
    const employees=await prisma.workforceEmployee.findMany({
      where:{companyId:context.company.id,OR:[{baseStoreId:context.store.id},{storeAccess:{some:{storeId:context.store.id,active:true}}}]},
      include:employeeInclude,orderBy:[{active:"desc"},{fullName:"asc"}],take:500
    });
    res.json({
      company:context.company,contextStore:context.store,stores,roles:roles.map(serializeRole),
      employees:employees.map(employee=>serializeEmployee(employee,storeMap)),moduleStates:moduleStates.states,
      capabilities:{employeeCreate:true,employeeUpdate:true,roleManagement:true,multiStoreAccess:true,migrationPreview:true,migrationApply:false},
      migration:{mode:"PREVIEW_ONLY",applyAvailable:false,applyEndpoint:null}
    });
  }catch(error){next(error)}
});

router.use("/roles",roleRoutes);
router.use("/employees",employeeRoutes);
router.use("/migration",migrationRoutes);

// Deliberately terminate unknown Workforce routes here. This guarantees that
// a non-existent migration/apply action remains an explicit 404 and can never
// fall through into another Platform router or a broader privilege gate.
router.use((req,res)=>res.status(404).json({error:"Δεν βρέθηκε η λειτουργία Workforce v2.",code:"WORKFORCE_ROUTE_NOT_FOUND"}));

export default router;
