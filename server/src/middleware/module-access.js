import { prisma } from "../prisma.js";

function isCurrentlyActive(row,now=new Date()){
  if(!row?.active)return false;
  if(row.startsAt&&new Date(row.startsAt)>now)return false;
  if(row.endsAt&&new Date(row.endsAt)<now)return false;
  return true;
}

export function moduleKeyForPath(path="/"){
  if(path.startsWith("/employees"))return "PERSONNEL";
  if(path.startsWith("/shifts")||path.startsWith("/schedules"))return "SHIFTS";
  if(path.startsWith("/leaves")||path.startsWith("/availability"))return "LEAVES";
  return "CORE";
}

export async function companyModuleState(companyId){
  const company=await prisma.company.findUnique({
    where:{id:companyId},
    select:{
      id:true,
      name:true,
      active:true,
      licenseStatus:true,
      subscriptionEndsAt:true,
      modules:{select:{moduleKey:true,active:true,startsAt:true,endsAt:true}}
    }
  });
  if(!company)return null;
  const now=new Date();
  const licenseExpired=company.licenseStatus==="EXPIRED"||Boolean(company.subscriptionEndsAt&&new Date(company.subscriptionEndsAt)<now);
  const licenseAllowed=company.active&&!licenseExpired&&company.licenseStatus!=="SUSPENDED";
  const activeModules=company.modules.filter(row=>isCurrentlyActive(row,now)).map(row=>row.moduleKey);
  return {...company,licenseAllowed,activeModules};
}

export function requireCompanyModule(moduleKey){
  return async(req,res,next)=>{
    try{
      const companyId=req.user?.companyId;
      if(!companyId)return res.status(401).json({error:"Απαιτείται σύνδεση."});
      const state=await companyModuleState(companyId);
      if(!state)return res.status(404).json({error:"Δεν βρέθηκε η εταιρεία."});
      if(!state.licenseAllowed)return res.status(403).json({error:"Η άδεια της εταιρείας είναι σε αναστολή ή έχει λήξει.",code:"LICENSE_INACTIVE"});
      if(!state.activeModules.includes(moduleKey))return res.status(403).json({error:"Το συγκεκριμένο module δεν είναι ενεργό για την εταιρεία.",code:"MODULE_DISABLED",moduleKey});
      req.license=state;
      next();
    }catch(error){next(error)}
  };
}

export function requireOperationalModuleByPath(req,res,next){
  return requireCompanyModule(moduleKeyForPath(req.path||"/"))(req,res,next);
}

// Public Store Mode discovery/login routes reach requireStoreModule before auth,
// so an absent user is intentionally allowed here. Once a route is authenticated,
// tenant/store isolation is mandatory. SUPER_ADMIN is the only role allowed to
// target a store outside its own company for controlled platform administration.
export function storeTenantAccessAllowed(user,store){
  if(!user)return true;
  if(user.role==="SUPER_ADMIN"||user.isSuperAdmin===true)return true;
  if(!user.companyId||String(user.companyId)!==String(store?.companyId||""))return false;
  if(user.tokenType==="STORE_OPERATOR"&&String(user.storeId||"")!==String(store?.id||""))return false;
  return true;
}

export function requireStoreModule(moduleKey){
  return async(req,res,next)=>{
    try{
      const storeId=String(req.body?.storeId||req.params?.storeId||req.path.match(/\/stores\/([^/]+)/)?.[1]||"");
      if(!storeId)return res.status(400).json({error:"Δεν προσδιορίστηκε κατάστημα."});
      const store=await prisma.store.findUnique({where:{id:storeId},select:{id:true,companyId:true}});
      if(!store)return res.status(404).json({error:"Δεν βρέθηκε κατάστημα."});
      if(!storeTenantAccessAllowed(req.user,store)){
        return res.status(404).json({error:"Δεν βρέθηκε κατάστημα.",code:"TENANT_STORE_REJECTED"});
      }
      const state=await companyModuleState(store.companyId);
      if(!state?.licenseAllowed)return res.status(403).json({error:"Η άδεια του καταστήματος είναι σε αναστολή ή έχει λήξει.",code:"LICENSE_INACTIVE"});
      if(!state.activeModules.includes(moduleKey))return res.status(403).json({error:"Το Store Mode δεν είναι ενεργό για το κατάστημα.",code:"MODULE_DISABLED",moduleKey});
      req.license=state;
      req.targetStore=store;
      next();
    }catch(error){next(error)}
  };
}

export {isCurrentlyActive};
