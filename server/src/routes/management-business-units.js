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
      await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "ManagementPosTerminal" (
        "id" TEXT PRIMARY KEY,
        "companyId" TEXT NOT NULL,
        "bankId" TEXT NOT NULL,
        "name" TEXT NOT NULL,
        "tid" TEXT,
        "paymentMethodCode" TEXT NOT NULL,
        "iris" BOOLEAN NOT NULL DEFAULT false,
        "helperField1" TEXT,
        "deferredCode" TEXT,
        "helperField3" TEXT,
        "ipAddress" TEXT,
        "port" INTEGER,
        "onlineMiddleware" BOOLEAN NOT NULL DEFAULT false,
        "notes" TEXT,
        "active" BOOLEAN NOT NULL DEFAULT true,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`);
      await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "ManagementPosTerminal_company_active_idx" ON "ManagementPosTerminal" ("companyId","active","name")`);
      await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "ManagementPosTerminal_company_bank_idx" ON "ManagementPosTerminal" ("companyId","bankId")`);
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
const terminalSchema=z.object({
  bankId:z.string().trim().min(1).max(80),
  name:z.string().trim().min(1).max(180),
  tid:z.string().trim().max(80).optional().nullable(),
  paymentMethodCode:z.string().trim().min(1).max(40),
  iris:z.coerce.boolean().optional(),
  helperField1:z.string().trim().max(180).optional().nullable(),
  deferredCode:z.string().trim().max(80).optional().nullable(),
  helperField3:z.string().trim().max(180).optional().nullable(),
  ipAddress:z.string().trim().max(120).optional().nullable(),
  port:z.coerce.number().int().min(1).max(65535).optional().nullable(),
  onlineMiddleware:z.coerce.boolean().optional(),
  notes:z.string().trim().max(1000).optional().nullable(),
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
async function requireBank(companyId,bankId){
  const bank=(await prisma.$queryRaw`SELECT "id","name","active" FROM "ManagementBank" WHERE "id"=${bankId} AND "companyId"=${companyId} LIMIT 1`)[0];
  if(!bank){const e=new Error("Δεν βρέθηκε η επιλεγμένη τράπεζα.");e.status=400;throw e}
  return bank;
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

router.get("/pos-terminals",async(req,res,next)=>{try{
  const companyId=req.user.companyId;
  const items=await prisma.$queryRaw`
    SELECT t.*,b."name" AS "bankName",b."internalCode" AS "bankInternalCode"
    FROM "ManagementPosTerminal" t
    LEFT JOIN "ManagementBank" b ON b."id"=t."bankId" AND b."companyId"=t."companyId"
    WHERE t."companyId"=${companyId} AND t."active"=true
    ORDER BY COALESCE(b."name",''),t."name",t."createdAt"
  `;
  res.json({items});
}catch(error){next(error)}});
router.post("/pos-terminals",async(req,res,next)=>{try{
  const companyId=req.user.companyId,b=terminalSchema.parse(req.body||{}),id=uid();
  await requireBank(companyId,b.bankId);
  await prisma.$executeRaw`INSERT INTO "ManagementPosTerminal" ("id","companyId","bankId","name","tid","paymentMethodCode","iris","helperField1","deferredCode","helperField3","ipAddress","port","onlineMiddleware","notes","active") VALUES (${id},${companyId},${b.bankId},${b.name},${b.tid||null},${b.paymentMethodCode},${b.iris===true},${b.helperField1||null},${b.deferredCode||null},${b.helperField3||null},${b.ipAddress||null},${b.port??null},${b.onlineMiddleware===true},${b.notes||null},${b.active!==false})`;
  res.status(201).json({id});
}catch(error){next(error)}});
router.patch("/pos-terminals/:id",async(req,res,next)=>{try{
  const companyId=req.user.companyId,b=terminalSchema.partial().parse(req.body||{});
  const found=(await prisma.$queryRaw`SELECT * FROM "ManagementPosTerminal" WHERE "id"=${req.params.id} AND "companyId"=${companyId} LIMIT 1`)[0];
  if(!found)return res.status(404).json({error:"Δεν βρέθηκε το PoS τερματικό."});
  const bankId=b.bankId??found.bankId,name=b.name??found.name,tid=b.tid===undefined?found.tid:b.tid,paymentMethodCode=b.paymentMethodCode??found.paymentMethodCode,iris=b.iris===undefined?found.iris:b.iris,helperField1=b.helperField1===undefined?found.helperField1:b.helperField1,deferredCode=b.deferredCode===undefined?found.deferredCode:b.deferredCode,helperField3=b.helperField3===undefined?found.helperField3:b.helperField3,ipAddress=b.ipAddress===undefined?found.ipAddress:b.ipAddress,port=b.port===undefined?found.port:b.port,onlineMiddleware=b.onlineMiddleware===undefined?found.onlineMiddleware:b.onlineMiddleware,notes=b.notes===undefined?found.notes:b.notes,active=b.active===undefined?found.active:b.active;
  await requireBank(companyId,bankId);
  await prisma.$executeRaw`UPDATE "ManagementPosTerminal" SET "bankId"=${bankId},"name"=${name},"tid"=${tid||null},"paymentMethodCode"=${paymentMethodCode},"iris"=${iris},"helperField1"=${helperField1||null},"deferredCode"=${deferredCode||null},"helperField3"=${helperField3||null},"ipAddress"=${ipAddress||null},"port"=${port??null},"onlineMiddleware"=${onlineMiddleware},"notes"=${notes||null},"active"=${active},"updatedAt"=NOW() WHERE "id"=${found.id} AND "companyId"=${companyId}`;
  res.json({ok:true});
}catch(error){next(error)}});
router.delete("/pos-terminals/:id",async(req,res,next)=>{try{
  const companyId=req.user.companyId;
  const count=await prisma.$executeRaw`UPDATE "ManagementPosTerminal" SET "active"=false,"updatedAt"=NOW() WHERE "id"=${req.params.id} AND "companyId"=${companyId}`;
  if(!count)return res.status(404).json({error:"Δεν βρέθηκε το PoS τερματικό."});
  res.json({ok:true});
}catch(error){next(error)}});

export default router;
