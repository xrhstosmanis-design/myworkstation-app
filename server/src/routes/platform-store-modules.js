import crypto from "crypto";
import {Router} from "express";
import {z} from "zod";
import {prisma} from "../prisma.js";
import {auth} from "../middleware/auth.js";
import {
  AI_STAFF_SCHEDULER,
  PERSONNEL_PACKAGE_DEFINITIONS,
  PERSONNEL_WRITABLE_MODULE_KEYS,
  ensureStorePaidModulesSchema,
  isSuperAdmin,
  storePaidModuleState,
  storePaidModuleStates
} from "../store-paid-modules.js";

const router=Router();
router.use(auth,(req,res,next)=>isSuperAdmin(req.user)?next():res.status(403).json({error:"Απαιτείται Platform Super Admin."}));

async function ownedStore(companyId,storeId){
  const store=await prisma.store.findFirst({where:{id:storeId,companyId},select:{id:true,name:true,companyId:true}});
  if(!store)throw Object.assign(new Error("Δεν βρέθηκε το κατάστημα."),{status:404});
  return store;
}

async function moduleResponse(store){
  const resolved=await storePaidModuleStates(store.id);
  return {
    store,
    packages:PERSONNEL_PACKAGE_DEFINITIONS,
    states:resolved.states,
    legacyState:resolved.legacy,
    state:await storePaidModuleState(store.id),
    superAdminAlwaysEnabled:true
  };
}

router.get("/companies/:companyId/stores/:storeId",async(req,res,next)=>{
  try{
    const store=await ownedStore(req.params.companyId,req.params.storeId);
    res.json(await moduleResponse(store));
  }catch(error){next(error)}
});

router.put("/companies/:companyId/stores/:storeId",async(req,res,next)=>{
  try{
    await ensureStorePaidModulesSchema();
    const store=await ownedStore(req.params.companyId,req.params.storeId);
    const body=z.object({
      moduleKey:z.enum(PERSONNEL_WRITABLE_MODULE_KEYS).optional().default(AI_STAFF_SCHEDULER),
      active:z.boolean(),
      monthlyPrice:z.coerce.number().min(0).max(100000),
      startsAt:z.string().datetime().nullable().optional(),
      endsAt:z.string().datetime().nullable().optional(),
      notes:z.string().trim().max(500).optional().default("")
    }).superRefine((value,ctx)=>{
      if(value.startsAt&&value.endsAt&&new Date(value.endsAt)<new Date(value.startsAt))ctx.addIssue({code:z.ZodIssueCode.custom,path:["endsAt"],message:"Η λήξη δεν μπορεί να είναι πριν από την έναρξη."});
    }).parse(req.body||{});

    await prisma.$executeRaw`INSERT INTO "StorePaidModule" ("id","companyId","storeId","moduleKey","active","monthlyPrice","startsAt","endsAt","notes","updatedBy") VALUES (${crypto.randomUUID()},${store.companyId},${store.id},${body.moduleKey},${body.active},${body.monthlyPrice},${body.startsAt?new Date(body.startsAt):null},${body.endsAt?new Date(body.endsAt):null},${body.notes||null},${req.user.id}) ON CONFLICT ("storeId","moduleKey") DO UPDATE SET "active"=EXCLUDED."active","monthlyPrice"=EXCLUDED."monthlyPrice","startsAt"=EXCLUDED."startsAt","endsAt"=EXCLUDED."endsAt","notes"=EXCLUDED."notes","updatedBy"=EXCLUDED."updatedBy","updatedAt"=NOW()`;

    await prisma.authAudit.create({data:{
      userId:req.user.id,
      email:req.user.email||"super-admin",
      event:`STORE_MODULE_${body.moduleKey}_${body.active?"ENABLED":"DISABLED"}`,
      success:true,
      deviceName:store.name,
      userAgent:req.headers["user-agent"]||null,
      ipAddress:req.ip||null
    }});

    res.json(await moduleResponse(store));
  }catch(error){next(error)}
});

export default router;
