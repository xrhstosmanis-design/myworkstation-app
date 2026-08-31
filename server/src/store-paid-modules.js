import {prisma} from "./prisma.js";
import {
  AI_STAFF_SCHEDULER,
  PERSONNEL_AI,
  PERSONNEL_BASIC,
  PERSONNEL_PACKAGE_DEFINITIONS,
  PERSONNEL_PACKAGE_KEYS,
  PERSONNEL_PAYROLL,
  PERSONNEL_PRO,
  PERSONNEL_WRITABLE_MODULE_KEYS,
  isPaidModuleRowActive,
  personnelPackageDefinition,
  resolvePersonnelPackageStates
} from "./personnel-packages.js";

export {
  AI_STAFF_SCHEDULER,
  PERSONNEL_AI,
  PERSONNEL_BASIC,
  PERSONNEL_PACKAGE_DEFINITIONS,
  PERSONNEL_PACKAGE_KEYS,
  PERSONNEL_PAYROLL,
  PERSONNEL_PRO,
  PERSONNEL_WRITABLE_MODULE_KEYS,
  isPaidModuleRowActive,
  personnelPackageDefinition,
  resolvePersonnelPackageStates
};

let ready;

export function ensureStorePaidModulesSchema(){
  return ready||(ready=(async()=>{
    await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "StorePaidModule" (
      "id" TEXT PRIMARY KEY,"companyId" TEXT NOT NULL,"storeId" TEXT NOT NULL,"moduleKey" TEXT NOT NULL,
      "active" BOOLEAN NOT NULL DEFAULT FALSE,"monthlyPrice" DECIMAL(12,2) NOT NULL DEFAULT 0,
      "startsAt" TIMESTAMPTZ,"endsAt" TIMESTAMPTZ,"notes" TEXT,"updatedBy" TEXT,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),"updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT "StorePaidModule_store_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE,
      CONSTRAINT "StorePaidModule_company_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE)`);
    await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "StorePaidModule_store_key" ON "StorePaidModule" ("storeId","moduleKey")`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "StorePaidModule_company_key_idx" ON "StorePaidModule" ("companyId","moduleKey")`);
  })().catch(error=>{ready=null;throw error}));
}

export function isSuperAdmin(user){
  return Boolean(user?.role==="SUPER_ADMIN"||user?.platformRole==="SUPER_ADMIN"||user?.isSuperAdmin);
}

async function storePaidModuleRows(storeId){
  await ensureStorePaidModulesSchema();
  return prisma.$queryRaw`SELECT "moduleKey","active","monthlyPrice","startsAt","endsAt","notes","updatedAt" FROM "StorePaidModule" WHERE "storeId"=${storeId}`;
}

export async function storePaidModuleStates(storeId){
  const rows=await storePaidModuleRows(storeId);
  return resolvePersonnelPackageStates(rows);
}

export async function storePaidModuleState(storeId,moduleKey=AI_STAFF_SCHEDULER){
  const rows=await storePaidModuleRows(storeId);
  const resolved=resolvePersonnelPackageStates(rows);
  if(moduleKey===AI_STAFF_SCHEDULER){
    const aiState=resolved.states[PERSONNEL_AI];
    return {
      ...resolved.legacy,
      active:resolved.legacy.active||aiState.effectiveActive,
      effectiveActive:resolved.legacy.active||aiState.effectiveActive,
      inherited:!resolved.legacy.active&&aiState.effectiveActive,
      inheritedFrom:!resolved.legacy.active&&aiState.effectiveActive?PERSONNEL_AI:null,
      legacyCompatible:true
    };
  }
  if(resolved.states[moduleKey])return resolved.states[moduleKey];
  const row=rows.find(item=>item.moduleKey===moduleKey);
  return {
    moduleKey,
    active:isPaidModuleRowActive(row),
    effectiveActive:isPaidModuleRowActive(row),
    inherited:false,
    inheritedFrom:null,
    monthlyPrice:Number(row?.monthlyPrice||0),
    startsAt:row?.startsAt||null,
    endsAt:row?.endsAt||null,
    notes:row?.notes||null,
    updatedAt:row?.updatedAt||null
  };
}

async function tenantStore(req,storeId){
  const where=isSuperAdmin(req.user)?{id:storeId}:{id:storeId,companyId:req.user?.companyId};
  const store=await prisma.store.findFirst({where,select:{id:true,companyId:true,name:true}});
  if(!store)throw Object.assign(new Error("Δεν βρέθηκε το κατάστημα."),{status:404});
  return store;
}

export async function requirePersonnelPackage(req,storeId,moduleKey){
  const definition=personnelPackageDefinition(moduleKey);
  if(!definition)throw Object.assign(new Error("Το πακέτο προσωπικού δεν είναι έγκυρο."),{status:400,code:"INVALID_PERSONNEL_PACKAGE"});
  const store=await tenantStore(req,storeId);
  if(isSuperAdmin(req.user))return {store,moduleKey,active:true,effectiveActive:true,superAdminBypass:true};
  const state=await storePaidModuleState(store.id,moduleKey);
  if(!state.effectiveActive)throw Object.assign(new Error(`Το επί πληρωμή πακέτο «${definition.title}» δεν είναι ενεργό για αυτό το κατάστημα.`),{status:403,code:"STORE_MODULE_DISABLED",moduleKey});
  return {store,...state};
}

export async function requireAiStaffScheduler(req,storeId){
  const store=await tenantStore(req,storeId);
  if(isSuperAdmin(req.user))return {store,moduleKey:PERSONNEL_AI,active:true,effectiveActive:true,superAdminBypass:true};
  const state=await storePaidModuleState(store.id,PERSONNEL_AI);
  if(!state.effectiveActive)throw Object.assign(new Error("Το επί πληρωμή module «Πρόγραμμα Εργαζομένων με AI» δεν είναι ενεργό για αυτό το κατάστημα."),{status:403,code:"STORE_MODULE_DISABLED",moduleKey:PERSONNEL_AI});
  return {store,...state};
}
