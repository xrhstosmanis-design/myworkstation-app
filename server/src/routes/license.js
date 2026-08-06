import { Router } from "express";
import { auth } from "../middleware/auth.js";
import { companyModuleState } from "../middleware/module-access.js";
import { moduleCatalog } from "../services/module-catalog.js";

const router=Router();
router.use(auth);

router.get("/current",async(req,res,next)=>{
  try{
    const state=await companyModuleState(req.user.companyId);
    if(!state)return res.status(404).json({error:"Δεν βρέθηκε η εταιρεία."});
    const activeSet=new Set(state.activeModules);
    res.json({
      company:{id:state.id,name:state.name},
      licenseStatus:state.licenseStatus,
      licenseAllowed:state.licenseAllowed,
      subscriptionEndsAt:state.subscriptionEndsAt,
      activeModules:state.activeModules,
      modules:moduleCatalog.map(module=>({key:module.key,name:module.name,active:activeSet.has(module.key)}))
    });
  }catch(error){next(error)}
});

export default router;
