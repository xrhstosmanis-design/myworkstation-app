import { prisma } from "../prisma.js";
import { ownerRestrictedModuleKeys } from "../services/module-catalog.js";

function isCurrentlyActive(row,now=new Date()){
  if(!row?.active)return false;
  if(row.startsAt&&new Date(row.startsAt)>now)return false;
  if(row.endsAt&&new Date(row.endsAt)<now)return false;
  return true;
}

export function isPlatformSuperAdmin(user){
  return user?.role==="SUPER_ADMIN"||user?.platformRole==="SUPER_ADMIN"||user?.isSuperAdmin===true;
}

function hasPermanentSuperAdminAccess(user,moduleKey){
  return Boolean(moduleKey)&&isPlatformSuperAdmin(user);
}

const ownerRestrictedModules=new Set(ownerRestrictedModuleKeys);

export function userMayAccessModule(user,moduleKey){
  if(isPlatformSuperAdmin(user))return true;
  const employee=user?.role==="EMPLOYEE"||user?.tokenType==="STORE_OPERATOR";
  if(!employee||!ownerRestrictedModules.has(moduleKey))return true;
  const permissions=Array.isArray(user?.permissions)?user.permissions:[];
  return permissions.includes(moduleKey)||permissions.includes(`MODULE:${moduleKey}`);
}

export function effectiveModuleEnabled(companyActive,storeOverride){
  return storeOverride?.configured?isCurrentlyActive(storeOverride):Boolean(companyActive);
}

async function storeModuleOverride(storeId,moduleKey){
  const rows=await prisma.$queryRaw`SELECT "active","startsAt","endsAt" FROM "StorePaidModule" WHERE "storeId"=${storeId} AND "moduleKey"=${moduleKey} LIMIT 1`;
  const row=rows[0];
  return row?{...row,configured:true}:{configured:false};
}

function denyRoleModule(res,moduleKey){
  return res.status(403).json({
    error:"Ο ρόλος εργαζομένου δεν έχει πρόσβαση σε οικονομικά στοιχεία, αναλύσεις ή αξιολόγηση χωρίς ειδικό δικαίωμα.",
    code:"ROLE_MODULE_DENIED",
    moduleKey
  });
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
      if(hasPermanentSuperAdminAccess(req.user,moduleKey)){
        req.license={superAdminBypass:true,activeModules:[moduleKey]};
        return next();
      }
      if(!userMayAccessModule(req.user,moduleKey))return denyRoleModule(res,moduleKey);
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
      if(hasPermanentSuperAdminAccess(req.user,moduleKey)){
        req.license={superAdminBypass:true,activeModules:[moduleKey]};
        req.targetStore=store;
        return next();
      }
      if(!userMayAccessModule(req.user,moduleKey))return denyRoleModule(res,moduleKey);
      const state=await companyModuleState(store.companyId);
      if(!state?.licenseAllowed)return res.status(403).json({error:"Η άδεια του καταστήματος είναι σε αναστολή ή έχει λήξει.",code:"LICENSE_INACTIVE"});
      const override=await storeModuleOverride(store.id,moduleKey);
      if(!effectiveModuleEnabled(state.activeModules.includes(moduleKey),override))return res.status(403).json({error:"Το συγκεκριμένο module δεν είναι ενεργό για το κατάστημα.",code:"MODULE_DISABLED",moduleKey});
      req.license=state;
      req.storeModuleOverride=override;
      req.targetStore=store;
      next();
    }catch(error){next(error)}
  };
}

// Ledger/payment routes are mixed: most actions are scoped by /stores/:storeId,
// while a few follow-up actions (for example reversal by transaction id) are not.
// Resolve module entitlement from the real target store whenever a store id exists;
// otherwise preserve the existing company-scoped behaviour. This keeps tenant
// isolation intact and avoids using a Super Admin/login company as the entitlement
// source for a transaction that belongs to another explicitly selected store.
export function requireCompanyOrStoreModule(moduleKey){
  return async(req,res,next)=>{
    try{
      const storeId=String(req.body?.storeId||req.params?.storeId||req.path.match(/\/stores\/([^/]+)/)?.[1]||"");
      if(!storeId)return requireCompanyModule(moduleKey)(req,res,next);
      const store=await prisma.store.findUnique({where:{id:storeId},select:{id:true,companyId:true}});
      if(!store)return res.status(404).json({error:"Δεν βρέθηκε κατάστημα."});
      if(!storeTenantAccessAllowed(req.user,store)){
        return res.status(404).json({error:"Δεν βρέθηκε κατάστημα.",code:"TENANT_STORE_REJECTED"});
      }
      if(hasPermanentSuperAdminAccess(req.user,moduleKey)){
        req.license={superAdminBypass:true,activeModules:[moduleKey]};
        req.targetStore=store;
        return next();
      }
      if(!userMayAccessModule(req.user,moduleKey))return denyRoleModule(res,moduleKey);
      const state=await companyModuleState(store.companyId);
      if(!state?.licenseAllowed)return res.status(403).json({error:"Η άδεια του καταστήματος είναι σε αναστολή ή έχει λήξει.",code:"LICENSE_INACTIVE"});
      const override=await storeModuleOverride(store.id,moduleKey);
      if(!effectiveModuleEnabled(state.activeModules.includes(moduleKey),override))return res.status(403).json({error:"Το συγκεκριμένο module δεν είναι ενεργό για το κατάστημα.",code:"MODULE_DISABLED",moduleKey});
      req.license=state;
      req.storeModuleOverride=override;
      req.targetStore=store;
      next();
    }catch(error){next(error)}
  };
}

export {isCurrentlyActive};
