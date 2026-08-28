import {prisma} from "./prisma.js";

let ready;
export const AI_STAFF_SCHEDULER="AI_STAFF_SCHEDULER";

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
  })().catch(error=>{ready=null;throw error}));
}

export function isSuperAdmin(user){return Boolean(user?.role==="SUPER_ADMIN"||user?.platformRole==="SUPER_ADMIN"||user?.isSuperAdmin)}

export async function storePaidModuleState(storeId,moduleKey=AI_STAFF_SCHEDULER){
  await ensureStorePaidModulesSchema();
  const rows=await prisma.$queryRaw`SELECT "active","monthlyPrice","startsAt","endsAt","notes" FROM "StorePaidModule" WHERE "storeId"=${storeId} AND "moduleKey"=${moduleKey} LIMIT 1`;
  const row=rows[0],now=new Date();
  const active=Boolean(row?.active&&(!row.startsAt||new Date(row.startsAt)<=now)&&(!row.endsAt||new Date(row.endsAt)>=now));
  return {moduleKey,active,monthlyPrice:Number(row?.monthlyPrice||0),startsAt:row?.startsAt||null,endsAt:row?.endsAt||null,notes:row?.notes||null};
}

export async function requireAiStaffScheduler(req,storeId){
  if(isSuperAdmin(req.user))return {moduleKey:AI_STAFF_SCHEDULER,active:true,superAdminBypass:true};
  const store=await prisma.store.findFirst({where:{id:storeId,companyId:req.user?.companyId},select:{id:true}});
  if(!store)throw Object.assign(new Error("Δεν βρέθηκε το κατάστημα."),{status:404});
  const state=await storePaidModuleState(store.id);
  if(!state.active)throw Object.assign(new Error("Το επί πληρωμή module «Πρόγραμμα Εργαζομένων με AI» δεν είναι ενεργό για αυτό το κατάστημα."),{status:403,code:"STORE_MODULE_DISABLED"});
  return state;
}
