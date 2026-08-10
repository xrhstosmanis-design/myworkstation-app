import crypto from "crypto";
import {Router} from "express";
import {z} from "zod";
import {prisma} from "../prisma.js";

const router=Router();
const roles=new Set(["SUPER_ADMIN","OWNER","ADMIN","MANAGER"]);
let schemaReady=null;

function requireAccess(req,res,next){
  if(req.user?.tokenType==="STORE_OPERATOR"||!roles.has(req.user?.role))return res.status(403).json({error:"Οι Κατηγορίες εξόδων είναι διαθέσιμες μόνο σε Super Admin, Ιδιοκτήτη, Admin ή Manager."});
  next();
}
router.use(requireAccess);

async function ensureSchema(){
  if(schemaReady)return schemaReady;
  schemaReady=(async()=>{
    await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "ManagementExpenseCategory" (
      "id" TEXT NOT NULL,
      "companyId" TEXT NOT NULL,
      "description" TEXT NOT NULL,
      "active" BOOLEAN NOT NULL DEFAULT true,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "ManagementExpenseCategory_pkey" PRIMARY KEY ("id"),
      CONSTRAINT "ManagementExpenseCategory_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE
    )`);
    await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "ManagementExpenseCategory_company_description_key" ON "ManagementExpenseCategory"("companyId",LOWER("description"))`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "ManagementExpenseCategory_company_idx" ON "ManagementExpenseCategory"("companyId","active")`);
    await prisma.$executeRawUnsafe(`ALTER TABLE "StoreTransaction" ADD COLUMN IF NOT EXISTS "expenseCategoryId" TEXT`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "StoreTransaction_expense_category_idx" ON "StoreTransaction"("companyId","expenseCategoryId","occurredAt" DESC)`);
  })();
  return schemaReady;
}

const bodySchema=z.object({description:z.string().trim().min(1).max(180),active:z.boolean().default(true)});

router.get("/",async(req,res,next)=>{
  try{
    const companyId=req.user.companyId;await ensureSchema();
    const rows=await prisma.$queryRaw`
      SELECT c."id",c."description",c."active",c."createdAt",c."updatedAt",
        COUNT(t."id") FILTER (WHERE t."type"='OTHER_EXPENSE')::int AS "usageCount"
      FROM "ManagementExpenseCategory" c
      LEFT JOIN "StoreTransaction" t ON t."companyId"=${companyId} AND t."expenseCategoryId"=c."id"
      WHERE c."companyId"=${companyId}
      GROUP BY c."id"
      ORDER BY c."active" DESC,c."description"`;
    res.json({items:rows.map(r=>({...r,usageCount:Number(r.usageCount||0)}))});
  }catch(error){next(error)}
});

router.post("/",async(req,res,next)=>{
  try{
    const companyId=req.user.companyId;await ensureSchema();const body=bodySchema.parse(req.body||{});
    const exists=await prisma.$queryRaw`SELECT "id" FROM "ManagementExpenseCategory" WHERE "companyId"=${companyId} AND LOWER("description")=LOWER(${body.description}) LIMIT 1`;
    if(exists[0])return res.status(409).json({error:"Υπάρχει ήδη κατηγορία εξόδου με αυτή την περιγραφή."});
    const id=crypto.randomUUID();await prisma.$executeRaw`INSERT INTO "ManagementExpenseCategory" ("id","companyId","description","active") VALUES (${id},${companyId},${body.description},${body.active})`;
    res.status(201).json({id});
  }catch(error){next(error)}
});

router.patch("/:id",async(req,res,next)=>{
  try{
    const companyId=req.user.companyId;await ensureSchema();const body=bodySchema.parse(req.body||{});
    const duplicate=await prisma.$queryRaw`SELECT "id" FROM "ManagementExpenseCategory" WHERE "companyId"=${companyId} AND "id"<>${req.params.id} AND LOWER("description")=LOWER(${body.description}) LIMIT 1`;
    if(duplicate[0])return res.status(409).json({error:"Υπάρχει ήδη κατηγορία εξόδου με αυτή την περιγραφή."});
    const count=await prisma.$executeRaw`UPDATE "ManagementExpenseCategory" SET "description"=${body.description},"active"=${body.active},"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${req.params.id} AND "companyId"=${companyId}`;
    if(!count)return res.status(404).json({error:"Δεν βρέθηκε η κατηγορία εξόδου."});res.json({ok:true});
  }catch(error){next(error)}
});

router.delete("/:id",async(req,res,next)=>{
  try{
    const companyId=req.user.companyId;await ensureSchema();
    const count=await prisma.$executeRaw`UPDATE "ManagementExpenseCategory" SET "active"=false,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${req.params.id} AND "companyId"=${companyId}`;
    if(!count)return res.status(404).json({error:"Δεν βρέθηκε η κατηγορία εξόδου."});res.json({ok:true,softDeleted:true});
  }catch(error){next(error)}
});

export default router;
