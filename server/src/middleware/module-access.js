import { prisma } from "../prisma.js";

function isCurrentlyActive(row,now=new Date()){
  if(!row?.active)return false;
  if(row.startsAt&&new Date(row.startsAt)>now)return false;
  if(row.endsAt&&new Date(row.endsAt)<now)return false;
  return true;
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
  const path=req.path||"/";
  let moduleKey="CORE";
  if(path.startsWith("/employees"))moduleKey="PERSONNEL";
  else if(path.startsWith("/shifts")||path.startsWith("/schedules"))moduleKey="SHIFTS";
  else if(path.startsWith("/leaves")||path.startsWith("/availability"))moduleKey="LEAVES";
  else if(path.startsWith("/dashboard")||path.startsWith("/stores"))moduleKey="CORE";
  return requireCompanyModule(moduleKey)(req,res,next);
}

export function requireStoreModule(moduleKey){
  return async(req,res,next)=>{
    try{
      const storeId=String(req.body?.storeId||req.params?.storeId||req.path.match(/\/stores\/([^/]+)/)?.[1]||"");
      if(!storeId)return res.status(400).json({error:"Δεν προσδιορίστηκε κατάστημα."});
      const store=await prisma.store.findUnique({where:{id:storeId},select:{companyId:true}});
      if(!store)return res.status(404).json({error:"Δεν βρέθηκε κατάστημα."});
      const state=await companyModuleState(store.companyId);
      if(!state?.licenseAllowed)return res.status(403).json({error:"Η άδεια του καταστήματος είναι σε αναστολή ή έχει λήξει.",code:"LICENSE_INACTIVE"});
      if(!state.activeModules.includes(moduleKey))return res.status(403).json({error:"Το Store Mode δεν είναι ενεργό για το κατάστημα.",code:"MODULE_DISABLED",moduleKey});
      req.license=state;
      next();
    }catch(error){next(error)}
  };
}

export {isCurrentlyActive};
