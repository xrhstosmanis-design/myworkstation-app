import crypto from "crypto";
import {Router} from "express";
import {z} from "zod";
import {prisma} from "../prisma.js";

const router=Router();
const roles=new Set(["SUPER_ADMIN","OWNER","ADMIN","MANAGER"]);
const id=()=>crypto.randomUUID();
let schemaPromise;

async function ensureSchema(){
  if(!schemaPromise){
    schemaPromise=(async()=>{
      await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "ManagementCustomerProfession" (
        "id" TEXT PRIMARY KEY,
        "companyId" TEXT NOT NULL,
        "code" TEXT,
        "description" TEXT NOT NULL,
        "active" BOOLEAN NOT NULL DEFAULT true,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`);
      await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "ManagementCustomerProfession_company_code_uq" ON "ManagementCustomerProfession" ("companyId","code") WHERE "code" IS NOT NULL`);
      await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "ManagementCustomerProfession_company_active_idx" ON "ManagementCustomerProfession" ("companyId","active","description")`);
      await prisma.$executeRawUnsafe(`ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "customerProfessionId" TEXT`);
      await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "Customer_company_profession_idx" ON "Customer" ("companyId","customerProfessionId")`);
    })().catch(error=>{schemaPromise=undefined;throw error});
  }
  return schemaPromise;
}

function requireAccess(req,res,next){
  if(req.user?.tokenType==="STORE_OPERATOR"||!roles.has(req.user?.role))return res.status(403).json({error:"Η διαχείριση επαγγελμάτων είναι διαθέσιμη μόνο σε Super Admin, Ιδιοκτήτη, Admin ή Manager."});
  next();
}
router.use(requireAccess);
router.use(async(req,res,next)=>{try{await ensureSchema();next()}catch(error){next(error)}});

const payloadSchema=z.object({code:z.string().trim().max(30).optional().nullable(),description:z.string().trim().min(1).max(300),active:z.coerce.boolean().optional()});

router.get("/",async(req,res,next)=>{try{
  const companyId=req.user.companyId,activeOnly=String(req.query.activeOnly||"false")==="true";
  const rows=await prisma.$queryRaw`
    SELECT p.*,COUNT(c."id")::int AS "customerCount"
    FROM "ManagementCustomerProfession" p
    LEFT JOIN "Customer" c ON c."companyId"=p."companyId" AND c."customerProfessionId"=p."id"
    WHERE p."companyId"=${companyId} AND (${activeOnly}=false OR p."active"=true)
    GROUP BY p."id"
    ORDER BY CASE WHEN p."code" ~ '^[0-9]+$' THEN LPAD(p."code",20,'0') ELSE p."code" END NULLS LAST,p."description"
    LIMIT 5000`;
  res.json({items:rows});
}catch(error){next(error)}});

router.post("/",async(req,res,next)=>{try{
  const companyId=req.user.companyId,b=payloadSchema.parse(req.body||{}),professionId=id(),code=b.code||null;
  await prisma.$executeRaw`INSERT INTO "ManagementCustomerProfession" ("id","companyId","code","description","active") VALUES (${professionId},${companyId},${code},${b.description},${b.active!==false})`;
  res.status(201).json({id:professionId});
}catch(error){if(error?.code==="P2010"||String(error?.message||"").includes("unique"))return res.status(409).json({error:"Υπάρχει ήδη επάγγελμα με αυτόν τον κωδικό."});next(error)}});

router.patch("/:professionId",async(req,res,next)=>{try{
  const companyId=req.user.companyId,b=payloadSchema.partial().parse(req.body||{});
  const found=(await prisma.$queryRaw`SELECT * FROM "ManagementCustomerProfession" WHERE "id"=${req.params.professionId} AND "companyId"=${companyId} LIMIT 1`)[0];
  if(!found)return res.status(404).json({error:"Δεν βρέθηκε το επάγγελμα."});
  const code=b.code===undefined?found.code:(b.code||null),description=b.description===undefined?found.description:b.description,active=b.active===undefined?found.active:b.active;
  await prisma.$executeRaw`UPDATE "ManagementCustomerProfession" SET "code"=${code},"description"=${description},"active"=${active},"updatedAt"=NOW() WHERE "id"=${found.id} AND "companyId"=${companyId}`;
  res.json({ok:true});
}catch(error){if(error?.code==="P2010"||String(error?.message||"").includes("unique"))return res.status(409).json({error:"Υπάρχει ήδη επάγγελμα με αυτόν τον κωδικό."});next(error)}});

router.delete("/:professionId",async(req,res,next)=>{try{
  const companyId=req.user.companyId;
  const result=await prisma.$executeRaw`UPDATE "ManagementCustomerProfession" SET "active"=false,"updatedAt"=NOW() WHERE "id"=${req.params.professionId} AND "companyId"=${companyId}`;
  if(!result)return res.status(404).json({error:"Δεν βρέθηκε το επάγγελμα."});
  res.json({ok:true,softDeleted:true});
}catch(error){next(error)}});

router.post("/synchronize",async(req,res,next)=>{try{
  const companyId=req.user.companyId;
  const rows=await prisma.$queryRaw`SELECT "id","code","description" FROM "ManagementCustomerProfession" WHERE "companyId"=${companyId} ORDER BY "description"`;
  const normalized=new Map(),duplicates=[];
  for(const row of rows){const key=String(row.code||row.description||"").trim().toLocaleUpperCase("el-GR");if(!key)continue;if(normalized.has(key))duplicates.push({id:row.id,otherId:normalized.get(key),code:row.code,description:row.description});else normalized.set(key,row.id)}
  res.json({ok:true,status:"LOCAL_ONLY",checked:rows.length,duplicates,externalSource:false,message:"Ο τοπικός κατάλογος ελέγχθηκε. Δεν υπάρχει συνδεδεμένη εξωτερική πηγή επαγγελμάτων για αυτόματο συγχρονισμό."});
}catch(error){next(error)}});

export default router;
