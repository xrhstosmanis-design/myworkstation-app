import crypto from "crypto";
import {Router} from "express";
import {z} from "zod";
import {prisma} from "../prisma.js";

const router=Router();
const roles=new Set(["SUPER_ADMIN","OWNER","ADMIN","MANAGER"]);
const uid=()=>crypto.randomUUID();
let schemaReady;

function requireAccess(req,res,next){
  if(req.user?.tokenType==="STORE_OPERATOR"||!roles.has(req.user?.role))return res.status(403).json({error:"Η Διαχείριση κατηγοριών πελατών είναι διαθέσιμη μόνο σε Super Admin, Ιδιοκτήτη, Admin ή Manager."});
  next();
}
router.use(requireAccess);

async function ensureSchema(){
  if(schemaReady)return schemaReady;
  schemaReady=(async()=>{
    await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "ManagementCustomerCategory" (
      "id" TEXT PRIMARY KEY,
      "companyId" TEXT NOT NULL,
      "description" TEXT NOT NULL,
      "selectable" BOOLEAN NOT NULL DEFAULT false,
      "allowCredit" BOOLEAN NOT NULL DEFAULT false,
      "saleAtCostOrWholesale" BOOLEAN NOT NULL DEFAULT false,
      "deferred" BOOLEAN NOT NULL DEFAULT false,
      "active" BOOLEAN NOT NULL DEFAULT true,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT "ManagementCustomerCategory_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE
    )`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "ManagementCustomerCategory_company_idx" ON "ManagementCustomerCategory"("companyId","active","description")`);
    await prisma.$executeRawUnsafe(`ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "customerCategoryId" TEXT`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "Customer_customerCategoryId_idx" ON "Customer"("customerCategoryId")`);
  })().catch(error=>{schemaReady=undefined;throw error});
  return schemaReady;
}
router.use(async(req,res,next)=>{try{await ensureSchema();next()}catch(error){next(error)}});

const payload=z.object({
  description:z.string().trim().min(1).max(160),
  selectable:z.boolean().default(false),
  allowCredit:z.boolean().default(false),
  saleAtCostOrWholesale:z.boolean().default(false),
  deferred:z.boolean().default(false),
  active:z.boolean().default(true)
});

router.get("/",async(req,res,next)=>{
  try{
    const companyId=req.user.companyId;
    const rows=await prisma.$queryRaw`
      SELECT c.*,COUNT(cu."id")::int AS "usageCount"
      FROM "ManagementCustomerCategory" c
      LEFT JOIN "Customer" cu ON cu."companyId"=${companyId} AND cu."customerCategoryId"=c."id"
      WHERE c."companyId"=${companyId}
      GROUP BY c."id"
      ORDER BY c."description"`;
    res.json({items:rows.map(r=>({...r,usageCount:Number(r.usageCount||0)}))});
  }catch(error){next(error)}
});

router.post("/",async(req,res,next)=>{
  try{
    const companyId=req.user.companyId,b=payload.parse(req.body||{});
    const exists=await prisma.$queryRaw`SELECT "id" FROM "ManagementCustomerCategory" WHERE "companyId"=${companyId} AND LOWER("description")=LOWER(${b.description}) LIMIT 1`;
    if(exists[0])return res.status(409).json({error:"Υπάρχει ήδη κατηγορία πελατών με αυτή την περιγραφή."});
    const id=uid();
    await prisma.$executeRaw`INSERT INTO "ManagementCustomerCategory" ("id","companyId","description","selectable","allowCredit","saleAtCostOrWholesale","deferred","active") VALUES (${id},${companyId},${b.description},${b.selectable},${b.allowCredit},${b.saleAtCostOrWholesale},${b.deferred},${b.active})`;
    res.status(201).json({id});
  }catch(error){next(error)}
});

router.patch("/:id",async(req,res,next)=>{
  try{
    const companyId=req.user.companyId,b=payload.parse(req.body||{});
    const count=await prisma.$executeRaw`UPDATE "ManagementCustomerCategory" SET "description"=${b.description},"selectable"=${b.selectable},"allowCredit"=${b.allowCredit},"saleAtCostOrWholesale"=${b.saleAtCostOrWholesale},"deferred"=${b.deferred},"active"=${b.active},"updatedAt"=NOW() WHERE "id"=${req.params.id} AND "companyId"=${companyId}`;
    if(!count)return res.status(404).json({error:"Δεν βρέθηκε η κατηγορία πελατών."});
    res.json({ok:true});
  }catch(error){next(error)}
});

router.delete("/:id",async(req,res,next)=>{
  try{
    const companyId=req.user.companyId;
    const count=await prisma.$executeRaw`UPDATE "ManagementCustomerCategory" SET "active"=false,"updatedAt"=NOW() WHERE "id"=${req.params.id} AND "companyId"=${companyId}`;
    if(!count)return res.status(404).json({error:"Δεν βρέθηκε η κατηγορία πελατών."});
    res.json({ok:true,softDeleted:true});
  }catch(error){next(error)}
});

export default router;
