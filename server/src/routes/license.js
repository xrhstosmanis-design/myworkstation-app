import { Router } from "express";
import { auth } from "../middleware/auth.js";
import { companyModuleState,isPlatformSuperAdmin,userMayAccessModule } from "../middleware/module-access.js";
import { moduleCatalog } from "../services/module-catalog.js";

const router=Router();
router.use(auth);

router.get("/current",async(req,res,next)=>{
  try{
    const state=await companyModuleState(req.user.companyId);
    if(!state)return res.status(404).json({error:"Δεν βρέθηκε η εταιρεία."});
    const superAdmin=isPlatformSuperAdmin(req.user);
    const roleAllowedKeys=new Set(moduleCatalog.filter(module=>userMayAccessModule(req.user,module.key)).map(module=>module.key));
    const activeModules=superAdmin?moduleCatalog.map(module=>module.key):state.activeModules.filter(key=>roleAllowedKeys.has(key));
    const activeSet=new Set(activeModules);
    res.json({
      company:{id:state.id,name:state.name},
      licenseStatus:state.licenseStatus,
      licenseAllowed:superAdmin||state.licenseAllowed,
      subscriptionEndsAt:state.subscriptionEndsAt,
      activeModules,
      superAdminBypass:superAdmin,
      modules:moduleCatalog.map(module=>({key:module.key,name:module.name,active:activeSet.has(module.key)}))
    });
  }catch(error){next(error)}
});

export default router;
