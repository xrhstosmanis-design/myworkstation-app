import crypto from "crypto";
import {Router} from "express";
import {z} from "zod";
import {prisma} from "../prisma.js";
import {auth} from "../middleware/auth.js";
import {AI_STAFF_SCHEDULER,ensureStorePaidModulesSchema,isSuperAdmin,storePaidModuleState} from "../store-paid-modules.js";
const router=Router();
router.use(auth,(req,res,next)=>isSuperAdmin(req.user)?next():res.status(403).json({error:"Απαιτείται Platform Super Admin."}));
async function ownedStore(companyId,storeId){const store=await prisma.store.findFirst({where:{id:storeId,companyId},select:{id:true,name:true,companyId:true}});if(!store)throw Object.assign(new Error("Δεν βρέθηκε το κατάστημα."),{status:404});return store}
router.get("/companies/:companyId/stores/:storeId",async(req,res,next)=>{try{const store=await ownedStore(req.params.companyId,req.params.storeId);res.json({store,state:await storePaidModuleState(store.id),superAdminAlwaysEnabled:true})}catch(error){next(error)}});
router.put("/companies/:companyId/stores/:storeId",async(req,res,next)=>{try{
  await ensureStorePaidModulesSchema();const store=await ownedStore(req.params.companyId,req.params.storeId);
  const body=z.object({active:z.boolean(),monthlyPrice:z.number().min(0).max(100000),startsAt:z.string().datetime().nullable().optional(),endsAt:z.string().datetime().nullable().optional(),notes:z.string().trim().max(500).optional().default("")}).parse(req.body||{});
  await prisma.$executeRaw`INSERT INTO "StorePaidModule" ("id","companyId","storeId","moduleKey","active","monthlyPrice","startsAt","endsAt","notes","updatedBy") VALUES (${crypto.randomUUID()},${store.companyId},${store.id},${AI_STAFF_SCHEDULER},${body.active},${body.monthlyPrice},${body.startsAt?new Date(body.startsAt):null},${body.endsAt?new Date(body.endsAt):null},${body.notes||null},${req.user.id}) ON CONFLICT ("storeId","moduleKey") DO UPDATE SET "active"=EXCLUDED."active","monthlyPrice"=EXCLUDED."monthlyPrice","startsAt"=EXCLUDED."startsAt","endsAt"=EXCLUDED."endsAt","notes"=EXCLUDED."notes","updatedBy"=EXCLUDED."updatedBy","updatedAt"=NOW()`;
  await prisma.authAudit.create({data:{userId:req.user.id,email:req.user.email||"super-admin",event:`STORE_MODULE_${AI_STAFF_SCHEDULER}_${body.active?"ENABLED":"DISABLED"}`,success:true,deviceName:store.name,userAgent:req.headers["user-agent"]||null,ipAddress:req.ip||null}});
  res.json({store,state:await storePaidModuleState(store.id),superAdminAlwaysEnabled:true});
}catch(error){next(error)}});
export default router;
