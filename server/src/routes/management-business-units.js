import crypto from "crypto";
import {Router} from "express";
import {z} from "zod";
import {prisma} from "../prisma.js";

const router=Router();
const roles=new Set(["SUPER_ADMIN","OWNER","ADMIN","MANAGER"]);
const uid=()=>crypto.randomUUID();
let schemaPromise;

async function ensureSchema(){
  if(!schemaPromise){
    schemaPromise=(async()=>{
      await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "ManagementBank" (
        "id" TEXT PRIMARY KEY,
        "companyId" TEXT NOT NULL,
        "internalCode" TEXT NOT NULL,
        "name" TEXT NOT NULL,
        "accountingAccount" TEXT,
        "auxiliaryName" TEXT,
        "active" BOOLEAN NOT NULL DEFAULT true,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`);
      await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "ManagementBank_company_code_uq" ON "ManagementBank" ("companyId","internalCode")`);
      await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "ManagementBank_company_active_idx" ON "ManagementBank" ("companyId","active","name")`);
      await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "ManagementShippingMethod" (
        "id" TEXT PRIMARY KEY,
        "companyId" TEXT NOT NULL,
        "code" TEXT NOT NULL,
        "description" TEXT NOT NULL,
        "active" BOOLEAN NOT NULL DEFAULT true,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`);
      await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "ManagementShippingMethod_company_code_uq" ON "ManagementShippingMethod" ("companyId","code")`);
      await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "ManagementShippingMethod_company_active_idx" ON "ManagementShippingMethod" ("companyId","active","code")`);
    })().catch(error=>{schemaPromise=undefined;throw error});
  }
  return schemaPromise;
}
function requireAccess(req,res,next){
  if(req.user?.tokenType==="STORE_OPERATOR"||!roles.has(req.user?.role))return res.status(403).json({error:"Η Διαχείριση Business Units είναι διαθέσιμη μόνο σε Super Admin, Ιδιοκτήτη, Admin ή Manager."});
  next();
}
router.use(requireAccess);
router.use(async(req,res,next)=>{try{await ensureSchema();next()}catch(error){next(error)}});

const bankSchema=z.object({
  internalCode:z.string().trim().min(1).max(40),
  name:z.string().trim().min(1).max(180),
  accountingAccount:z.string().trim().max(80).optional().nullable(),
  auxiliaryName:z.string().trim().max(220).optional().nullable(),
  active:z.coerce.boolean().optional()
});
const shippingSchema=z.object({
  code:z.string().trim().min(1).max(40),
  description:z.string().trim().min(1).max(180),
  active:z.coerce.boolean().optional()
});

async function ensureBankCodeFree(companyId,code,excludeId=null){
  const rows=await prisma.$queryRaw`SELECT "id" FROM "ManagementBank" WHERE "companyId"=${companyId} AND "internalCode"=${code} AND (${excludeId}::text IS NULL OR "id"<>${excludeId}) LIMIT 1`;
  if(rows.length){const e=new Error("Υπάρχει ήδη τράπεζα με αυτόν τον εσωτερικό κωδικό.");e.status=409;throw e}
}
async function ensureShippingCodeFree(companyId,code,excludeId=null){
  const rows=await prisma.$queryRaw`SELECT "id" FROM "ManagementShippingMethod" WHERE "companyId"=${companyId} AND "code"=${code} AND (${excludeId}::text IS NULL OR "id"<>${excludeId}) LIMIT 1`;
  if(rows.length){const e=new Error("Υπάρχει ήδη τρόπος αποστολής με αυτόν τον κωδικό.");e.status=409;throw e}
}

router.get("/banks",async(req,res,next)=>{try{
  const companyId=req.user.companyId;
  const items=await prisma.$queryRaw`SELECT * FROM "ManagementBank" WHERE "companyId"=${companyId} AND "active"=true ORDER BY "name","internalCode"`;
  res.json({items});
}catch(error){next(error)}});
router.post("/banks",async(req,res,next)=>{try{
  const companyId=req.user.companyId,b=bankSchema.parse(req.body||{}),id=uid();
  await ensureBankCodeFree(companyId,b.internalCode);
  await prisma.$executeRaw`INSERT INTO "ManagementBank" ("id","companyId","internalCode","name","accountingAccount","auxiliaryName","active") VALUES (${id},${companyId},${b.internalCode},${b.name},${b.accountingAccount||null},${b.auxiliaryName||null},${b.active!==false})`;
  res.status(201).json({id});
}catch(error){next(error)}});
router.patch("/banks/:id",async(req,res,next)=>{try{
  const companyId=req.user.companyId,b=bankSchema.partial().parse(req.body||{});
  const found=(await prisma.$queryRaw`SELECT * FROM "ManagementBank" WHERE "id"=${req.params.id} AND "companyId"=${companyId} LIMIT 1`)[0];
  if(!found)return res.status(404).json({error:"Δεν βρέθηκε η τράπεζα."});
  const internalCode=b.internalCode??found.internalCode,name=b.name??found.name,accountingAccount=b.accountingAccount===undefined?found.accountingAccount:b.accountingAccount,auxiliaryName=b.auxiliaryName===undefined?found.auxiliaryName:b.auxiliaryName,active=b.active===undefined?found.active:b.active;
  await ensureBankCodeFree(companyId,internalCode,found.id);
  await prisma.$executeRaw`UPDATE "ManagementBank" SET "internalCode"=${internalCode},"name"=${name},"accountingAccount"=${accountingAccount||null},"auxiliaryName"=${auxiliaryName||null},"active"=${active},"updatedAt"=NOW() WHERE "id"=${found.id} AND "companyId"=${companyId}`;
  res.json({ok:true});
}catch(error){next(error)}});
router.delete("/banks/:id",async(req,res,next)=>{try{
  const companyId=req.user.companyId;
  const count=await prisma.$executeRaw`UPDATE "ManagementBank" SET "active"=false,"updatedAt"=NOW() WHERE "id"=${req.params.id} AND "companyId"=${companyId}`;
  if(!count)return res.status(404).json({error:"Δεν βρέθηκε η τράπεζα."});
  res.json({ok:true});
}catch(error){next(error)}});

router.get("/shipping-methods",async(req,res,next)=>{try{
  const companyId=req.user.companyId;
  const items=await prisma.$queryRaw`SELECT * FROM "ManagementShippingMethod" WHERE "companyId"=${companyId} AND "active"=true ORDER BY CASE WHEN "code" ~ '^[0-9]+$' THEN "code"::numeric ELSE NULL END NULLS LAST,"code"`;
  res.json({items});
}catch(error){next(error)}});
router.post("/shipping-methods",async(req,res,next)=>{try{
  const companyId=req.user.companyId,b=shippingSchema.parse(req.body||{}),id=uid();
  await ensureShippingCodeFree(companyId,b.code);
  await prisma.$executeRaw`INSERT INTO "ManagementShippingMethod" ("id","companyId","code","description","active") VALUES (${id},${companyId},${b.code},${b.description},${b.active!==false})`;
  res.status(201).json({id});
}catch(error){next(error)}});
router.patch("/shipping-methods/:id",async(req,res,next)=>{try{
  const companyId=req.user.companyId,b=shippingSchema.partial().parse(req.body||{});
  const found=(await prisma.$queryRaw`SELECT * FROM "ManagementShippingMethod" WHERE "id"=${req.params.id} AND "companyId"=${companyId} LIMIT 1`)[0];
  if(!found)return res.status(404).json({error:"Δεν βρέθηκε ο τρόπος αποστολής."});
  const code=b.code??found.code,description=b.description??found.description,active=b.active===undefined?found.active:b.active;
  await ensureShippingCodeFree(companyId,code,found.id);
  await prisma.$executeRaw`UPDATE "ManagementShippingMethod" SET "code"=${code},"description"=${description},"active"=${active},"updatedAt"=NOW() WHERE "id"=${found.id} AND "companyId"=${companyId}`;
  res.json({ok:true});
}catch(error){next(error)}});
router.delete("/shipping-methods/:id",async(req,res,next)=>{try{
  const companyId=req.user.companyId;
  const count=await prisma.$executeRaw`UPDATE "ManagementShippingMethod" SET "active"=false,"updatedAt"=NOW() WHERE "id"=${req.params.id} AND "companyId"=${companyId}`;
  if(!count)return res.status(404).json({error:"Δεν βρέθηκε ο τρόπος αποστολής."});
  res.json({ok:true});
}catch(error){next(error)}});

export default router;
