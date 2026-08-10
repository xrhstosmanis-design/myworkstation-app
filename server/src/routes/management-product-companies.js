import crypto from "crypto";
import {Router} from "express";
import {z} from "zod";
import {prisma} from "../prisma.js";

const router=Router();
const roles=new Set(["SUPER_ADMIN","OWNER","ADMIN","MANAGER"]);
const uid=()=>crypto.randomUUID();
let schemaReady=null;

function requireAccess(req,res,next){
  if(req.user?.tokenType==="STORE_OPERATOR"||!roles.has(req.user?.role))return res.status(403).json({error:"Η Διαχείριση Εταιρειών είναι διαθέσιμη μόνο σε Super Admin, Ιδιοκτήτη, Admin ή Manager."});
  next();
}
router.use(requireAccess);

async function ensureSchema(){
  if(schemaReady)return schemaReady;
  schemaReady=(async()=>{
    await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "ManagementProductCompany" (
      "id" TEXT NOT NULL,
      "companyId" TEXT NOT NULL,
      "name" TEXT NOT NULL,
      "sourceBrandName" TEXT,
      "systemKey" TEXT,
      "active" BOOLEAN NOT NULL DEFAULT true,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "ManagementProductCompany_pkey" PRIMARY KEY ("id"),
      CONSTRAINT "ManagementProductCompany_company_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE
    )`);
    await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "ManagementProductCompany_company_name_key" ON "ManagementProductCompany"("companyId","name")`);
    await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "ManagementProductCompany_company_source_key" ON "ManagementProductCompany"("companyId","sourceBrandName") WHERE "sourceBrandName" IS NOT NULL`);
    await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "ManagementProductCompany_company_system_key" ON "ManagementProductCompany"("companyId","systemKey") WHERE "systemKey" IS NOT NULL`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "ManagementProductCompany_company_idx" ON "ManagementProductCompany"("companyId")`);
    await prisma.$executeRawUnsafe(`ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "productCompanyId" TEXT`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "Product_productCompanyId_idx" ON "Product"("productCompanyId")`);
    await prisma.$executeRawUnsafe(`DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='Product_productCompanyId_fkey') THEN
        ALTER TABLE "Product" ADD CONSTRAINT "Product_productCompanyId_fkey" FOREIGN KEY ("productCompanyId") REFERENCES "ManagementProductCompany"("id") ON DELETE SET NULL ON UPDATE CASCADE;
      END IF;
    END $$;`);
    await prisma.$executeRawUnsafe(`ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "subcategoryId" TEXT`);
    await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "ProductSubcategory" (
      "id" TEXT NOT NULL,
      "companyId" TEXT NOT NULL,
      "categoryId" TEXT NOT NULL,
      "legacyCode" TEXT,
      "name" TEXT NOT NULL,
      "property" TEXT NOT NULL DEFAULT 'STOCK_ITEM',
      "points" DECIMAL(14,4) NOT NULL DEFAULT 0,
      "pluGroup" INTEGER NOT NULL DEFAULT 0,
      "classification" TEXT NOT NULL DEFAULT 'MERCHANDISE',
      "eshopCode" TEXT,
      "active" BOOLEAN NOT NULL DEFAULT true,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "ProductSubcategory_pkey" PRIMARY KEY ("id"),
      CONSTRAINT "ProductSubcategory_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "ProductSubcategory_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ProductCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE
    )`);
  })().catch(error=>{schemaReady=null;throw error});
  return schemaReady;
}

async function ensureCompanyMappings(companyId){
  await ensureSchema();
  const brands=await prisma.$queryRaw`
    SELECT DISTINCT TRIM(mp."brandName") AS name
    FROM "Product" p JOIN "MasterProduct" mp ON mp."id"=p."masterProductId"
    WHERE p."companyId"=${companyId} AND NULLIF(TRIM(mp."brandName"),'') IS NOT NULL
    ORDER BY name`;
  for(const brand of brands){
    const name=String(brand.name||"").trim();if(!name)continue;
    let row=(await prisma.$queryRaw`SELECT "id","sourceBrandName" FROM "ManagementProductCompany" WHERE "companyId"=${companyId} AND ("sourceBrandName"=${name} OR LOWER("name")=LOWER(${name})) ORDER BY CASE WHEN "sourceBrandName"=${name} THEN 0 ELSE 1 END LIMIT 1`)[0];
    if(!row){const id=uid();await prisma.$executeRaw`INSERT INTO "ManagementProductCompany" ("id","companyId","name","sourceBrandName") VALUES (${id},${companyId},${name},${name})`;row={id}}
    else if(!row.sourceBrandName){await prisma.$executeRaw`UPDATE "ManagementProductCompany" SET "sourceBrandName"=${name},"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${row.id} AND "companyId"=${companyId}`}
    await prisma.$executeRaw`UPDATE "Product" p SET "productCompanyId"=${row.id},"updatedAt"=CURRENT_TIMESTAMP FROM "MasterProduct" mp WHERE p."companyId"=${companyId} AND p."productCompanyId" IS NULL AND p."masterProductId"=mp."id" AND TRIM(mp."brandName")=${name}`;
  }
  const missing=Number((await prisma.$queryRaw`SELECT COUNT(*)::int AS count FROM "Product" WHERE "companyId"=${companyId} AND "productCompanyId" IS NULL`)[0]?.count||0);
  if(missing>0){
    let placeholder=(await prisma.$queryRaw`SELECT "id" FROM "ManagementProductCompany" WHERE "companyId"=${companyId} AND "systemKey"='UNASSIGNED' LIMIT 1`)[0];
    if(!placeholder){
      placeholder=(await prisma.$queryRaw`SELECT "id" FROM "ManagementProductCompany" WHERE "companyId"=${companyId} AND "name"='_ΧΩΡΙΣ ΕΤΑΙΡΕΙΑ' LIMIT 1`)[0];
      if(placeholder)await prisma.$executeRaw`UPDATE "ManagementProductCompany" SET "systemKey"='UNASSIGNED',"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${placeholder.id}`;
      else{const id=uid();await prisma.$executeRaw`INSERT INTO "ManagementProductCompany" ("id","companyId","name","systemKey") VALUES (${id},${companyId},'_ΧΩΡΙΣ ΕΤΑΙΡΕΙΑ','UNASSIGNED')`;placeholder={id}}
    }
    await prisma.$executeRaw`UPDATE "Product" SET "productCompanyId"=${placeholder.id},"updatedAt"=CURRENT_TIMESTAMP WHERE "companyId"=${companyId} AND "productCompanyId" IS NULL`;
  }
}

router.get("/",async(req,res,next)=>{
  try{
    const companyId=req.user.companyId;await ensureCompanyMappings(companyId);
    const rows=await prisma.$queryRaw`
      SELECT c."id",c."name",c."active",c."systemKey",COUNT(p."id")::int AS "productCount"
      FROM "ManagementProductCompany" c
      LEFT JOIN "Product" p ON p."companyId"=${companyId} AND p."productCompanyId"=c."id"
      WHERE c."companyId"=${companyId}
      GROUP BY c."id" ORDER BY CASE WHEN c."systemKey"='UNASSIGNED' THEN 0 ELSE 1 END,c."name"`;
    const totalProducts=Number((await prisma.$queryRaw`SELECT COUNT(*)::int AS count FROM "Product" WHERE "companyId"=${companyId}`)[0]?.count||0);
    res.json({items:rows.map(row=>({...row,productCount:Number(row.productCount||0),percent:totalProducts?Number(row.productCount||0)*100/totalProducts:0})),totalProducts});
  }catch(error){next(error)}
});

router.post("/",async(req,res,next)=>{
  try{
    const companyId=req.user.companyId;await ensureSchema();const body=z.object({name:z.string().trim().min(1).max(180),active:z.boolean().default(true)}).parse(req.body||{});
    const duplicate=await prisma.$queryRaw`SELECT "id" FROM "ManagementProductCompany" WHERE "companyId"=${companyId} AND LOWER("name")=LOWER(${body.name}) LIMIT 1`;
    if(duplicate[0])return res.status(409).json({error:"Υπάρχει ήδη εταιρεία με αυτή την περιγραφή."});
    const id=uid();await prisma.$executeRaw`INSERT INTO "ManagementProductCompany" ("id","companyId","name","active") VALUES (${id},${companyId},${body.name},${body.active})`;res.status(201).json({id});
  }catch(error){next(error)}
});

router.patch("/:id",async(req,res,next)=>{
  try{
    const companyId=req.user.companyId;await ensureSchema();const body=z.object({name:z.string().trim().min(1).max(180),active:z.boolean()}).parse(req.body||{});
    const duplicate=await prisma.$queryRaw`SELECT "id" FROM "ManagementProductCompany" WHERE "companyId"=${companyId} AND LOWER("name")=LOWER(${body.name}) AND "id"<>${req.params.id} LIMIT 1`;
    if(duplicate[0])return res.status(409).json({error:"Υπάρχει ήδη εταιρεία με αυτή την περιγραφή."});
    const count=await prisma.$executeRaw`UPDATE "ManagementProductCompany" SET "name"=${body.name},"active"=${body.active},"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${req.params.id} AND "companyId"=${companyId}`;
    if(!count)return res.status(404).json({error:"Δεν βρέθηκε η εταιρεία."});res.json({ok:true});
  }catch(error){next(error)}
});

router.delete("/:id",async(req,res,next)=>{
  try{const companyId=req.user.companyId;await ensureSchema();const count=await prisma.$executeRaw`UPDATE "ManagementProductCompany" SET "active"=false,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${req.params.id} AND "companyId"=${companyId}`;if(!count)return res.status(404).json({error:"Δεν βρέθηκε η εταιρεία."});res.json({ok:true,softDeleted:true})}catch(error){next(error)}
});

router.get("/:id/products",async(req,res,next)=>{
  try{
    const companyId=req.user.companyId;await ensureCompanyMappings(companyId);
    const company=(await prisma.$queryRaw`SELECT "id","name" FROM "ManagementProductCompany" WHERE "id"=${req.params.id} AND "companyId"=${companyId} LIMIT 1`)[0];
    if(!company)return res.status(404).json({error:"Δεν βρέθηκε η εταιρεία."});
    const storeId=String(req.query.storeId||"")||null;if(storeId){const store=await prisma.$queryRaw`SELECT "id" FROM "Store" WHERE "id"=${storeId} AND "companyId"=${companyId} LIMIT 1`;if(!store[0])return res.status(404).json({error:"Δεν βρέθηκε το κατάστημα."})}
    const q=String(req.query.q||"").trim(),text=q?`%${q}%`:null;
    const page=Math.max(1,Number.parseInt(String(req.query.page||"1"),10)||1),pageSize=Math.min(200,Math.max(25,Number.parseInt(String(req.query.pageSize||"100"),10)||100)),offset=(page-1)*pageSize;
    const countRows=await prisma.$queryRaw`SELECT COUNT(*)::int AS count FROM "Product" p WHERE p."companyId"=${companyId} AND p."productCompanyId"=${company.id} AND (${text}::text IS NULL OR p."name" ILIKE ${text} OR COALESCE(p."sku",'') ILIKE ${text} OR EXISTS (SELECT 1 FROM "ProductBarcode" pb WHERE pb."productId"=p."id" AND pb."barcode" ILIKE ${text}))`;
    const rows=await prisma.$queryRaw`
      SELECT p."id",p."sku",p."name",p."salePrice",p."vatRate",pc."name" AS "categoryName",COALESCE(sc."name",mp."subcategoryName") AS "subcategoryName",pb."barcode",
        COALESCE(sp."salePrice",p."salePrice") AS "storeSalePrice",lp."supplierName"
      FROM "Product" p
      LEFT JOIN "ProductCategory" pc ON pc."id"=p."categoryId"
      LEFT JOIN "ProductSubcategory" sc ON sc."id"=p."subcategoryId"
      LEFT JOIN "MasterProduct" mp ON mp."id"=p."masterProductId"
      LEFT JOIN "StoreProduct" sp ON sp."productId"=p."id" AND (${storeId}::text IS NOT NULL AND sp."storeId"=${storeId})
      LEFT JOIN LATERAL (SELECT pb0."barcode" FROM "ProductBarcode" pb0 WHERE pb0."productId"=p."id" ORDER BY pb0."createdAt",pb0."barcode" LIMIT 1) pb ON true
      LEFT JOIN LATERAL (SELECT sup."name" AS "supplierName" FROM "PurchaseDocumentLine" l JOIN "PurchaseDocument" d ON d."id"=l."purchaseDocumentId" LEFT JOIN "Supplier" sup ON sup."id"=d."supplierId" WHERE l."productId"=p."id" AND d."companyId"=${companyId} AND d."status"='APPROVED' AND (${storeId}::text IS NULL OR d."storeId"=${storeId}) ORDER BY d."documentDate" DESC,d."createdAt" DESC LIMIT 1) lp ON true
      WHERE p."companyId"=${companyId} AND p."productCompanyId"=${company.id} AND (${text}::text IS NULL OR p."name" ILIKE ${text} OR COALESCE(p."sku",'') ILIKE ${text} OR EXISTS (SELECT 1 FROM "ProductBarcode" pbs WHERE pbs."productId"=p."id" AND pbs."barcode" ILIKE ${text}))
      ORDER BY p."name" LIMIT ${pageSize} OFFSET ${offset}`;
    const total=Number(countRows[0]?.count||0);res.json({company,items:rows.map(r=>({...r,salePrice:Number(r.storeSalePrice??r.salePrice??0),vatRate:Number(r.vatRate||0)})),total,page,pageSize,pages:Math.max(1,Math.ceil(total/pageSize))});
  }catch(error){next(error)}
});

router.patch("/products/bulk-assign",async(req,res,next)=>{
  try{
    const companyId=req.user.companyId;await ensureSchema();const body=z.object({productIds:z.array(z.string().min(1)).min(1).max(500),productCompanyId:z.string().min(1)}).parse(req.body||{});const ids=[...new Set(body.productIds)];
    const target=await prisma.$queryRaw`SELECT "id" FROM "ManagementProductCompany" WHERE "id"=${body.productCompanyId} AND "companyId"=${companyId} AND "active"=true LIMIT 1`;if(!target[0])return res.status(400).json({error:"Δεν βρέθηκε ενεργή εταιρεία προορισμού."});
    const products=await prisma.$queryRaw`SELECT "id" FROM "Product" WHERE "companyId"=${companyId} AND "id"=ANY(${ids}::text[])`;if(products.length!==ids.length)return res.status(400).json({error:"Υπάρχει μη έγκυρο είδος."});
    await prisma.$executeRaw`UPDATE "Product" SET "productCompanyId"=${body.productCompanyId},"updatedAt"=CURRENT_TIMESTAMP WHERE "companyId"=${companyId} AND "id"=ANY(${ids}::text[])`;res.json({ok:true,changed:ids.length});
  }catch(error){next(error)}
});

export default router;
