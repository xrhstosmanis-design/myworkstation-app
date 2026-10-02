import crypto from "crypto";
import {Router} from "express";
import {z} from "zod";
import {prisma} from "../prisma.js";

const router=Router();
const uid=()=>crypto.randomUUID();
const roles=new Set(["SUPER_ADMIN","OWNER","ADMIN","MANAGER"]);
let schemaReady=null;

const EXEMPTIONS=[
  {code:"7",description:"Χωρίς ΦΠΑ - άρθρο 27 του Κώδικα ΦΠΑ"},
  {code:"8",description:"Χωρίς ΦΠΑ - άρθρο 29 του Κώδικα ΦΠΑ"},
  {code:"9",description:"Χωρίς ΦΠΑ - άρθρο 30 του Κώδικα ΦΠΑ"},
  {code:"10",description:"Χωρίς ΦΠΑ - άρθρο 31 του Κώδικα ΦΠΑ"},
  {code:"11",description:"Χωρίς ΦΠΑ - άρθρο 32 του Κώδικα ΦΠΑ"},
  {code:"14",description:"Χωρίς ΦΠΑ - άρθρο 33 του Κώδικα ΦΠΑ"},
  {code:"15",description:"Χωρίς ΦΠΑ - άρθρο 44 του Κώδικα ΦΠΑ"},
  {code:"16",description:"Χωρίς ΦΠΑ - άρθρο 45 του Κώδικα ΦΠΑ"},
  {code:"17",description:"Χωρίς ΦΠΑ - άρθρο 47 του Κώδικα ΦΠΑ"},
  {code:"18",description:"Χωρίς ΦΠΑ - άρθρο 48 του Κώδικα ΦΠΑ"}
];

function requireAccess(req,res,next){
  if(req.user?.tokenType==="STORE_OPERATOR"||!roles.has(req.user?.role))return res.status(403).json({error:"Τα Τμήματα ΦΠΑ είναι διαθέσιμα μόνο σε Super Admin, Ιδιοκτήτη, Admin ή Manager."});
  next();
}
router.use(requireAccess);

export async function ensureVatDepartmentSchema(){
  if(schemaReady)return schemaReady;
  schemaReady=(async()=>{
    await prisma.$executeRawUnsafe(`ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "vatDepartmentId" TEXT`);
    await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "ManagementVatDepartment" (
      "id" TEXT NOT NULL,
      "companyId" TEXT NOT NULL,
      "legacyVatCode" TEXT,
      "cashRegisterDepartment" INTEGER,
      "description" TEXT NOT NULL,
      "vatRate" DECIMAL(6,3) NOT NULL DEFAULT 0,
      "commerce" BOOLEAN NOT NULL DEFAULT true,
      "exemptionCode" TEXT,
      "exemptionDescription" TEXT,
      "active" BOOLEAN NOT NULL DEFAULT true,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "ManagementVatDepartment_pkey" PRIMARY KEY ("id"),
      CONSTRAINT "ManagementVatDepartment_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE
    )`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "ManagementVatDepartment_company_idx" ON "ManagementVatDepartment"("companyId")`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "Product_vatDepartmentId_idx" ON "Product"("vatDepartmentId")`);
    await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "ManagementVatDepartmentCategory" (
      "companyId" TEXT NOT NULL,
      "categoryId" TEXT NOT NULL,
      "vatDepartmentId" TEXT NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "ManagementVatDepartmentCategory_pkey" PRIMARY KEY ("companyId","categoryId")
    )`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "ManagementVatDepartmentCategory_department_idx" ON "ManagementVatDepartmentCategory"("companyId","vatDepartmentId")`);
  })();
  return schemaReady;
}
const ensureSchema=ensureVatDepartmentSchema;

const cleanRate=value=>Math.round(Number(value||0)*1000)/1000;
const rateLabel=rate=>Number(rate||0).toLocaleString("el-GR",{maximumFractionDigits:3});

async function ensureCompanyDepartments(companyId){
  await ensureSchema();
  const existing=await prisma.$queryRaw`SELECT COUNT(*)::int AS count FROM "ManagementVatDepartment" WHERE "companyId"=${companyId}`;
  if(Number(existing[0]?.count||0)>0)return;
  const rates=await prisma.$queryRaw`SELECT DISTINCT "vatRate" FROM "Product" WHERE "companyId"=${companyId} ORDER BY "vatRate"`;
  for(const row of rates){
    const rate=cleanRate(row.vatRate),id=uid(),description=`ΦΠΑ ${rateLabel(rate)}%`;
    await prisma.$executeRaw`INSERT INTO "ManagementVatDepartment" ("id","companyId","description","vatRate","commerce","active") VALUES (${id},${companyId},${description},${rate},true,true)`;
    await prisma.$executeRaw`UPDATE "Product" SET "vatDepartmentId"=${id} WHERE "companyId"=${companyId} AND "vatDepartmentId" IS NULL AND "vatRate"=${rate}`;
  }
}

const departmentSchema=z.object({
  description:z.string().trim().min(1).max(160),
  active:z.boolean().default(true),
  cashRegisterDepartment:z.union([z.coerce.number().int().min(0).max(9999),z.null()]).optional(),
  vatRate:z.coerce.number().min(0).max(100),
  legacyVatCode:z.string().trim().max(40).optional().or(z.literal("")),
  commerce:z.boolean().default(true),
  exemptionCode:z.string().trim().max(20).nullable().optional(),
  exemptionDescription:z.string().trim().max(220).nullable().optional()
});

router.get("/",async(req,res,next)=>{
  try{
    const companyId=req.user.companyId;await ensureCompanyDepartments(companyId);
    const rows=await prisma.$queryRaw`
      SELECT vd."id",vd."legacyVatCode",vd."cashRegisterDepartment",vd."description",vd."vatRate",vd."commerce",vd."exemptionCode",vd."exemptionDescription",vd."active",
        COUNT(p."id")::int AS "productCount"
      FROM "ManagementVatDepartment" vd
      LEFT JOIN "Product" p ON p."vatDepartmentId"=vd."id" AND p."companyId"=${companyId}
      WHERE vd."companyId"=${companyId}
      GROUP BY vd."id"
      ORDER BY vd."cashRegisterDepartment" NULLS LAST,vd."vatRate",vd."description"`;
    const categories=await prisma.$queryRaw`
      SELECT c."id",c."name",m."vatDepartmentId",vd."description" AS "departmentDescription",vd."cashRegisterDepartment",vd."vatRate"
      FROM "ProductCategory" c
      LEFT JOIN "ManagementVatDepartmentCategory" m ON m."companyId"=c."companyId" AND m."categoryId"=c."id"
      LEFT JOIN "ManagementVatDepartment" vd ON vd."id"=m."vatDepartmentId" AND vd."companyId"=c."companyId"
      WHERE c."companyId"=${companyId} AND c."active"=true
      ORDER BY c."name",c."id"`;
    res.json({items:rows.map(r=>({...r,vatRate:Number(r.vatRate||0),productCount:Number(r.productCount||0)})),categories:categories.map(r=>({...r,vatRate:r.vatRate==null?null:Number(r.vatRate)})),exemptions:EXEMPTIONS});
  }catch(error){next(error)}
});

router.put("/category-mappings/:categoryId",async(req,res,next)=>{
  try{
    const companyId=req.user.companyId;await ensureCompanyDepartments(companyId);
    const categoryId=String(req.params.categoryId||"").trim();
    const vatDepartmentId=req.body?.vatDepartmentId==null?"":String(req.body.vatDepartmentId).trim();
    const category=(await prisma.$queryRaw`SELECT "id" FROM "ProductCategory" WHERE "id"=${categoryId} AND "companyId"=${companyId} AND "active"=true LIMIT 1`)[0];
    if(!category)return res.status(404).json({error:"Δεν βρέθηκε ενεργή κατηγορία ειδών."});
    if(!vatDepartmentId){
      await prisma.$executeRaw`DELETE FROM "ManagementVatDepartmentCategory" WHERE "companyId"=${companyId} AND "categoryId"=${categoryId}`;
      return res.json({ok:true,removed:true});
    }
    const department=(await prisma.$queryRaw`SELECT "id","vatRate" FROM "ManagementVatDepartment" WHERE "id"=${vatDepartmentId} AND "companyId"=${companyId} AND "active"=true LIMIT 1`)[0];
    if(!department)return res.status(404).json({error:"Δεν βρέθηκε ενεργό Τμήμα ΦΠΑ."});
    const mismatches=await prisma.$queryRaw`SELECT COUNT(*)::int AS count FROM "Product" WHERE "companyId"=${companyId} AND "categoryId"=${categoryId} AND ABS(COALESCE("vatRate",0)-${Number(department.vatRate)})>0.001`;
    if(Number(mismatches[0]?.count||0)>0)return res.status(409).json({error:"Η κατηγορία περιέχει είδη με διαφορετικό συντελεστή ΦΠΑ. Χώρισε πρώτα τα είδη σε σωστές κατηγορίες ή τμήματα ΦΠΑ."});
    await prisma.$executeRaw`INSERT INTO "ManagementVatDepartmentCategory" ("companyId","categoryId","vatDepartmentId","updatedAt") VALUES (${companyId},${categoryId},${vatDepartmentId},CURRENT_TIMESTAMP) ON CONFLICT ("companyId","categoryId") DO UPDATE SET "vatDepartmentId"=EXCLUDED."vatDepartmentId","updatedAt"=CURRENT_TIMESTAMP`;
    res.json({ok:true});
  }catch(error){next(error)}
});

router.post("/",async(req,res,next)=>{
  try{
    const companyId=req.user.companyId;await ensureSchema();const body=departmentSchema.parse(req.body||{}),id=uid();
    await prisma.$executeRaw`INSERT INTO "ManagementVatDepartment" ("id","companyId","legacyVatCode","cashRegisterDepartment","description","vatRate","commerce","exemptionCode","exemptionDescription","active") VALUES (${id},${companyId},${body.legacyVatCode||null},${body.cashRegisterDepartment??null},${body.description},${body.vatRate},${body.commerce},${body.exemptionCode||null},${body.exemptionDescription||null},${body.active})`;
    res.status(201).json({id});
  }catch(error){next(error)}
});

router.patch("/:id",async(req,res,next)=>{
  try{
    const companyId=req.user.companyId;await ensureSchema();const body=departmentSchema.parse(req.body||{});
    const rows=await prisma.$queryRaw`SELECT "id","vatRate" FROM "ManagementVatDepartment" WHERE "id"=${req.params.id} AND "companyId"=${companyId} LIMIT 1`;
    if(!rows[0])return res.status(404).json({error:"Δεν βρέθηκε το τμήμα ΦΠΑ."});
    await prisma.$transaction(async tx=>{
      await tx.$executeRaw`UPDATE "ManagementVatDepartment" SET "legacyVatCode"=${body.legacyVatCode||null},"cashRegisterDepartment"=${body.cashRegisterDepartment??null},"description"=${body.description},"vatRate"=${body.vatRate},"commerce"=${body.commerce},"exemptionCode"=${body.exemptionCode||null},"exemptionDescription"=${body.exemptionDescription||null},"active"=${body.active},"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${req.params.id} AND "companyId"=${companyId}`;
      if(cleanRate(rows[0].vatRate)!==cleanRate(body.vatRate))await tx.$executeRaw`UPDATE "Product" SET "vatRate"=${body.vatRate},"vatVerified"=true,"updatedAt"=CURRENT_TIMESTAMP WHERE "companyId"=${companyId} AND "vatDepartmentId"=${req.params.id}`;
    });
    res.json({ok:true});
  }catch(error){next(error)}
});

router.delete("/:id",async(req,res,next)=>{
  try{const companyId=req.user.companyId;await ensureSchema();const count=await prisma.$executeRaw`UPDATE "ManagementVatDepartment" SET "active"=false,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${req.params.id} AND "companyId"=${companyId}`;if(!count)return res.status(404).json({error:"Δεν βρέθηκε το τμήμα ΦΠΑ."});res.json({ok:true,softDeleted:true})}catch(error){next(error)}});

router.get("/:id/products",async(req,res,next)=>{
  try{
    const companyId=req.user.companyId;await ensureCompanyDepartments(companyId);const storeId=String(req.query.storeId||"")||null,q=String(req.query.q||"").trim(),text=q?`%${q}%`:null;
    const page=Math.max(1,Number.parseInt(String(req.query.page||"1"),10)||1),pageSize=Math.min(200,Math.max(25,Number.parseInt(String(req.query.pageSize||"100"),10)||100)),offset=(page-1)*pageSize;
    const dep=await prisma.$queryRaw`SELECT "id","description","vatRate" FROM "ManagementVatDepartment" WHERE "id"=${req.params.id} AND "companyId"=${companyId} LIMIT 1`;if(!dep[0])return res.status(404).json({error:"Δεν βρέθηκε το τμήμα ΦΠΑ."});
    if(storeId){const store=await prisma.store.findFirst({where:{id:storeId,companyId,active:true},select:{id:true}});if(!store)return res.status(404).json({error:"Δεν βρέθηκε το κατάστημα."})}
    const countRows=await prisma.$queryRaw`SELECT COUNT(*)::int AS count FROM "Product" p WHERE p."companyId"=${companyId} AND p."vatDepartmentId"=${req.params.id} AND (${text}::text IS NULL OR p."name" ILIKE ${text} OR COALESCE(p."sku",'') ILIKE ${text})`;
    const rows=await prisma.$queryRaw`
      SELECT p."id",p."name",p."sku",p."vatRate",COALESCE(sp."salePrice",p."salePrice",0) AS "salePrice",c."name" AS "categoryName",sc."name" AS "subcategoryName",lp."supplierName"
      FROM "Product" p LEFT JOIN "ProductCategory" c ON c."id"=p."categoryId" LEFT JOIN "ProductSubcategory" sc ON sc."id"=p."subcategoryId"
      LEFT JOIN "StoreProduct" sp ON sp."productId"=p."id" AND (${storeId}::text IS NOT NULL AND sp."storeId"=${storeId})
      LEFT JOIN LATERAL (
        SELECT sup."name" AS "supplierName" FROM "PurchaseDocumentLine" l JOIN "PurchaseDocument" d ON d."id"=l."purchaseDocumentId" LEFT JOIN "Supplier" sup ON sup."id"=d."supplierId"
        WHERE d."companyId"=${companyId} AND d."status"='APPROVED' AND l."productId"=p."id" AND (${storeId}::text IS NULL OR d."storeId"=${storeId}) ORDER BY d."documentDate" DESC,d."createdAt" DESC LIMIT 1
      ) lp ON true
      WHERE p."companyId"=${companyId} AND p."vatDepartmentId"=${req.params.id} AND (${text}::text IS NULL OR p."name" ILIKE ${text} OR COALESCE(p."sku",'') ILIKE ${text})
      ORDER BY p."name" LIMIT ${pageSize} OFFSET ${offset}`;
    const total=Number(countRows[0]?.count||0);res.json({department:{...dep[0],vatRate:Number(dep[0].vatRate||0)},items:rows.map(r=>({...r,salePrice:Number(r.salePrice||0),vatRate:Number(r.vatRate||0)})),total,page,pageSize,pages:Math.max(1,Math.ceil(total/pageSize))});
  }catch(error){next(error)}
});

router.patch("/products/bulk-assign",async(req,res,next)=>{
  try{
    const companyId=req.user.companyId;await ensureSchema();const body=z.object({productIds:z.array(z.string().min(1)).min(1).max(500),vatDepartmentId:z.string().min(1)}).parse(req.body||{}),ids=[...new Set(body.productIds)];
    const dep=await prisma.$queryRaw`SELECT "id","vatRate" FROM "ManagementVatDepartment" WHERE "id"=${body.vatDepartmentId} AND "companyId"=${companyId} AND "active"=true LIMIT 1`;if(!dep[0])return res.status(404).json({error:"Δεν βρέθηκε ενεργό τμήμα ΦΠΑ."});
    const found=await prisma.$queryRaw`SELECT "id" FROM "Product" WHERE "companyId"=${companyId} AND "id"=ANY(${ids}::text[])`;if(found.length!==ids.length)return res.status(400).json({error:"Υπάρχει μη έγκυρο προϊόν στην επιλογή."});
    const mismatches=await prisma.$queryRaw`SELECT COUNT(*)::int AS count FROM "Product" WHERE "companyId"=${companyId} AND "id"=ANY(${ids}::text[]) AND ABS(COALESCE("vatRate",0)-${Number(dep[0].vatRate)})>0.001`;
    if(Number(mismatches[0]?.count||0)>0)return res.status(409).json({error:"Το επιλεγμένο Τμήμα ΦΠΑ έχει διαφορετικό συντελεστή από ένα ή περισσότερα προϊόντα. Δεν άλλαξε ο ΦΠΑ τους."});
    await prisma.$executeRaw`UPDATE "Product" SET "vatDepartmentId"=${body.vatDepartmentId},"updatedAt"=CURRENT_TIMESTAMP WHERE "companyId"=${companyId} AND "id"=ANY(${ids}::text[])`;
    res.json({ok:true,changed:ids.length,vatRatesChanged:0});
  }catch(error){next(error)}
});

export default router;
