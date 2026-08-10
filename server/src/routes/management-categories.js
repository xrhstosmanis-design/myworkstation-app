import crypto from "crypto";
import {Router} from "express";
import {z} from "zod";
import {prisma} from "../prisma.js";

const router=Router();
const uid=()=>crypto.randomUUID();
const roles=new Set(["SUPER_ADMIN","OWNER","ADMIN","MANAGER"]);
let schemaReady=null;

function requireAccess(req,res,next){
  if(req.user?.tokenType==="STORE_OPERATOR"||!roles.has(req.user?.role))return res.status(403).json({error:"Η Διαχείριση είναι διαθέσιμη μόνο σε Super Admin, Ιδιοκτήτη, Admin ή Manager."});
  next();
}
router.use(requireAccess);

async function ensureSchema(){
  if(schemaReady)return schemaReady;
  schemaReady=(async()=>{
    await prisma.$executeRawUnsafe(`ALTER TABLE "ProductCategory" ADD COLUMN IF NOT EXISTS "legacyCode" TEXT`);
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
    await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "ProductSubcategory_company_category_name_key" ON "ProductSubcategory"("companyId","categoryId","name")`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "ProductSubcategory_company_idx" ON "ProductSubcategory"("companyId")`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "Product_subcategoryId_idx" ON "Product"("subcategoryId")`);
  })();
  return schemaReady;
}

async function ensureCompanyMappings(companyId){
  await ensureSchema();
  let uncategorized=(await prisma.$queryRaw`SELECT "id" FROM "ProductCategory" WHERE "companyId"=${companyId} AND "name"='ΧΩΡΙΣ ΚΑΤΗΓΟΡΙΑ' LIMIT 1`)[0];
  if(!uncategorized){const id=uid();await prisma.$executeRaw`INSERT INTO "ProductCategory" ("id","companyId","name","active") VALUES (${id},${companyId},'ΧΩΡΙΣ ΚΑΤΗΓΟΡΙΑ',true)`;uncategorized={id}}
  await prisma.$executeRaw`UPDATE "Product" SET "categoryId"=${uncategorized.id},"updatedAt"=CURRENT_TIMESTAMP WHERE "companyId"=${companyId} AND "categoryId" IS NULL`;

  const pairs=await prisma.$queryRaw`
    SELECT DISTINCT p."categoryId",COALESCE(NULLIF(TRIM(mp."subcategoryName"),''),'ΧΩΡΙΣ ΥΠΟΚΑΤΗΓΟΡΙΑ') AS name
    FROM "Product" p LEFT JOIN "MasterProduct" mp ON mp."id"=p."masterProductId"
    WHERE p."companyId"=${companyId} AND p."categoryId" IS NOT NULL`;
  for(const pair of pairs){
    let sub=(await prisma.$queryRaw`SELECT "id" FROM "ProductSubcategory" WHERE "companyId"=${companyId} AND "categoryId"=${pair.categoryId} AND "name"=${pair.name} LIMIT 1`)[0];
    if(!sub){const id=uid();await prisma.$executeRaw`INSERT INTO "ProductSubcategory" ("id","companyId","categoryId","name") VALUES (${id},${companyId},${pair.categoryId},${pair.name})`;sub={id}}
    if(pair.name==='ΧΩΡΙΣ ΥΠΟΚΑΤΗΓΟΡΙΑ'){
      await prisma.$executeRaw`UPDATE "Product" p SET "subcategoryId"=${sub.id},"updatedAt"=CURRENT_TIMESTAMP WHERE p."companyId"=${companyId} AND p."categoryId"=${pair.categoryId} AND p."subcategoryId" IS NULL AND (p."masterProductId" IS NULL OR NOT EXISTS (SELECT 1 FROM "MasterProduct" mp WHERE mp."id"=p."masterProductId" AND NULLIF(TRIM(mp."subcategoryName"),'') IS NOT NULL))`;
    }else{
      await prisma.$executeRaw`UPDATE "Product" p SET "subcategoryId"=${sub.id},"updatedAt"=CURRENT_TIMESTAMP FROM "MasterProduct" mp WHERE p."companyId"=${companyId} AND p."categoryId"=${pair.categoryId} AND p."masterProductId"=mp."id" AND p."subcategoryId" IS NULL AND TRIM(mp."subcategoryName")=${pair.name}`;
    }
  }
}

router.get("/categories",async(req,res,next)=>{
  try{
    const companyId=req.user.companyId;await ensureCompanyMappings(companyId);
    const categories=await prisma.$queryRaw`
      SELECT c."id",c."legacyCode",c."name",c."active",
        COUNT(DISTINCT sc."id") FILTER (WHERE sc."active"=true)::int AS "subcategoryCount",
        COUNT(DISTINCT p."id")::int AS "productCount"
      FROM "ProductCategory" c
      LEFT JOIN "ProductSubcategory" sc ON sc."categoryId"=c."id" AND sc."companyId"=${companyId}
      LEFT JOIN "Product" p ON p."categoryId"=c."id" AND p."companyId"=${companyId}
      WHERE c."companyId"=${companyId}
      GROUP BY c."id" ORDER BY c."name"`;
    const totalProducts=categories.reduce((sum,row)=>sum+Number(row.productCount||0),0);
    const selectedId=String(req.query.categoryId||"")||categories.find(row=>row.active)?.id||categories[0]?.id||null;
    const subcategories=selectedId?await prisma.$queryRaw`
      SELECT sc."id",sc."categoryId",sc."legacyCode",sc."name",sc."property",sc."points",sc."pluGroup",sc."classification",sc."eshopCode",sc."active",
        COUNT(DISTINCT p."id")::int AS "productCount"
      FROM "ProductSubcategory" sc LEFT JOIN "Product" p ON p."subcategoryId"=sc."id" AND p."companyId"=${companyId}
      WHERE sc."companyId"=${companyId} AND sc."categoryId"=${selectedId}
      GROUP BY sc."id" ORDER BY sc."name"`:[];
    res.json({categories:categories.map(row=>({...row,productCount:Number(row.productCount||0),subcategoryCount:Number(row.subcategoryCount||0),percent:totalProducts?Number(row.productCount||0)*100/totalProducts:0})),subcategories:subcategories.map(row=>({...row,points:Number(row.points||0),pluGroup:Number(row.pluGroup||0),productCount:Number(row.productCount||0)})),totalProducts,selectedCategoryId:selectedId});
  }catch(error){next(error)}
});

router.post("/categories",async(req,res,next)=>{
  try{const companyId=req.user.companyId;await ensureSchema();const body=z.object({name:z.string().trim().min(1).max(160),active:z.boolean().default(true),legacyCode:z.string().trim().max(50).optional().or(z.literal(""))}).parse(req.body||{});const exists=await prisma.$queryRaw`SELECT "id" FROM "ProductCategory" WHERE "companyId"=${companyId} AND LOWER("name")=LOWER(${body.name}) LIMIT 1`;if(exists[0])return res.status(409).json({error:"Υπάρχει ήδη κατηγορία με αυτή την περιγραφή."});const id=uid();await prisma.$executeRaw`INSERT INTO "ProductCategory" ("id","companyId","name","active","legacyCode") VALUES (${id},${companyId},${body.name},${body.active},${body.legacyCode||null})`;res.status(201).json({id})}catch(error){next(error)}});

router.patch("/categories/:id",async(req,res,next)=>{
  try{const companyId=req.user.companyId;await ensureSchema();const body=z.object({name:z.string().trim().min(1).max(160),active:z.boolean(),legacyCode:z.string().trim().max(50).optional().or(z.literal(""))}).parse(req.body||{});const count=await prisma.$executeRaw`UPDATE "ProductCategory" SET "name"=${body.name},"active"=${body.active},"legacyCode"=${body.legacyCode||null},"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${req.params.id} AND "companyId"=${companyId}`;if(!count)return res.status(404).json({error:"Δεν βρέθηκε η κατηγορία."});res.json({ok:true})}catch(error){next(error)}});

router.delete("/categories/:id",async(req,res,next)=>{
  try{const companyId=req.user.companyId;await ensureSchema();const count=await prisma.$executeRaw`UPDATE "ProductCategory" SET "active"=false,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${req.params.id} AND "companyId"=${companyId}`;if(!count)return res.status(404).json({error:"Δεν βρέθηκε η κατηγορία."});res.json({ok:true,softDeleted:true})}catch(error){next(error)}});

router.post("/subcategories",async(req,res,next)=>{
  try{const companyId=req.user.companyId;await ensureSchema();const body=z.object({categoryId:z.string().min(1),name:z.string().trim().min(1).max(180),active:z.boolean().default(true),property:z.enum(["STOCK_ITEM","NON_STOCK"]).default("STOCK_ITEM"),points:z.coerce.number().min(0).default(0),pluGroup:z.coerce.number().int().min(0).default(0),classification:z.enum(["MERCHANDISE","SERVICE","PRODUCT","FIXED_ASSET"]).default("MERCHANDISE"),eshopCode:z.string().trim().max(80).optional().or(z.literal("")),legacyCode:z.string().trim().max(50).optional().or(z.literal(""))}).parse(req.body||{});const category=await prisma.$queryRaw`SELECT "id" FROM "ProductCategory" WHERE "id"=${body.categoryId} AND "companyId"=${companyId} LIMIT 1`;if(!category[0])return res.status(404).json({error:"Δεν βρέθηκε η κατηγορία."});const id=uid();await prisma.$executeRaw`INSERT INTO "ProductSubcategory" ("id","companyId","categoryId","legacyCode","name","property","points","pluGroup","classification","eshopCode","active") VALUES (${id},${companyId},${body.categoryId},${body.legacyCode||null},${body.name},${body.property},${body.points},${body.pluGroup},${body.classification},${body.eshopCode||null},${body.active})`;res.status(201).json({id})}catch(error){next(error)}});

router.patch("/subcategories/:id",async(req,res,next)=>{
  try{const companyId=req.user.companyId;await ensureSchema();const body=z.object({name:z.string().trim().min(1).max(180),active:z.boolean(),property:z.enum(["STOCK_ITEM","NON_STOCK"]),points:z.coerce.number().min(0),pluGroup:z.coerce.number().int().min(0),classification:z.enum(["MERCHANDISE","SERVICE","PRODUCT","FIXED_ASSET"]),eshopCode:z.string().trim().max(80).optional().or(z.literal("")),legacyCode:z.string().trim().max(50).optional().or(z.literal(""))}).parse(req.body||{});const count=await prisma.$executeRaw`UPDATE "ProductSubcategory" SET "name"=${body.name},"active"=${body.active},"property"=${body.property},"points"=${body.points},"pluGroup"=${body.pluGroup},"classification"=${body.classification},"eshopCode"=${body.eshopCode||null},"legacyCode"=${body.legacyCode||null},"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${req.params.id} AND "companyId"=${companyId}`;if(!count)return res.status(404).json({error:"Δεν βρέθηκε η υποκατηγορία."});res.json({ok:true})}catch(error){next(error)}});

router.patch("/subcategories/:id/transfer",async(req,res,next)=>{
  try{const companyId=req.user.companyId;await ensureSchema();const body=z.object({categoryId:z.string().min(1)}).parse(req.body||{});const [sub]=await prisma.$queryRaw`SELECT "id","categoryId" FROM "ProductSubcategory" WHERE "id"=${req.params.id} AND "companyId"=${companyId} LIMIT 1`;if(!sub)return res.status(404).json({error:"Δεν βρέθηκε η υποκατηγορία."});const [category]=await prisma.$queryRaw`SELECT "id" FROM "ProductCategory" WHERE "id"=${body.categoryId} AND "companyId"=${companyId} LIMIT 1`;if(!category)return res.status(404).json({error:"Δεν βρέθηκε η νέα κατηγορία."});await prisma.$transaction(async tx=>{await tx.$executeRaw`UPDATE "ProductSubcategory" SET "categoryId"=${body.categoryId},"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${sub.id}`;await tx.$executeRaw`UPDATE "Product" SET "categoryId"=${body.categoryId},"updatedAt"=CURRENT_TIMESTAMP WHERE "companyId"=${companyId} AND "subcategoryId"=${sub.id}`});res.json({ok:true})}catch(error){next(error)}});

router.delete("/subcategories/:id",async(req,res,next)=>{
  try{const companyId=req.user.companyId;await ensureSchema();const count=await prisma.$executeRaw`UPDATE "ProductSubcategory" SET "active"=false,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${req.params.id} AND "companyId"=${companyId}`;if(!count)return res.status(404).json({error:"Δεν βρέθηκε η υποκατηγορία."});res.json({ok:true,softDeleted:true})}catch(error){next(error)}});

router.get("/products",async(req,res,next)=>{
  try{
    const companyId=req.user.companyId;await ensureCompanyMappings(companyId);
    const categoryId=String(req.query.categoryId||"")||null,subcategoryId=String(req.query.subcategoryId||"")||null,storeId=String(req.query.storeId||"")||null,q=String(req.query.q||"").trim(),text=q?`%${q}%`:null;
    const page=Math.max(1,Number.parseInt(String(req.query.page||"1"),10)||1),pageSize=Math.min(200,Math.max(25,Number.parseInt(String(req.query.pageSize||"100"),10)||100)),offset=(page-1)*pageSize;
    const countRows=await prisma.$queryRaw`SELECT COUNT(*)::int AS count FROM "Product" p WHERE p."companyId"=${companyId} AND (${categoryId}::text IS NULL OR p."categoryId"=${categoryId}) AND (${subcategoryId}::text IS NULL OR p."subcategoryId"=${subcategoryId}) AND (${text}::text IS NULL OR p."name" ILIKE ${text} OR COALESCE(p."sku",'') ILIKE ${text})`;
    const rows=await prisma.$queryRaw`
      SELECT p."id",p."sku",p."name",p."salePrice",p."vatRate",c."name" AS "categoryName",sc."name" AS "subcategoryName",pb."barcode",
        COALESCE(sp."salePrice",p."salePrice") AS "storeSalePrice",lp."supplierName"
      FROM "Product" p LEFT JOIN "ProductCategory" c ON c."id"=p."categoryId" LEFT JOIN "ProductSubcategory" sc ON sc."id"=p."subcategoryId"
      LEFT JOIN "StoreProduct" sp ON sp."productId"=p."id" AND (${storeId}::text IS NOT NULL AND sp."storeId"=${storeId})
      LEFT JOIN LATERAL (SELECT pb0."barcode" FROM "ProductBarcode" pb0 WHERE pb0."productId"=p."id" ORDER BY pb0."createdAt",pb0."barcode" LIMIT 1) pb ON true
      LEFT JOIN LATERAL (SELECT sup."name" AS "supplierName" FROM "PurchaseDocumentLine" l JOIN "PurchaseDocument" d ON d."id"=l."purchaseDocumentId" LEFT JOIN "Supplier" sup ON sup."id"=d."supplierId" WHERE l."productId"=p."id" AND d."companyId"=${companyId} AND d."status"='APPROVED' AND (${storeId}::text IS NULL OR d."storeId"=${storeId}) ORDER BY d."documentDate" DESC,d."createdAt" DESC LIMIT 1) lp ON true
      WHERE p."companyId"=${companyId} AND (${categoryId}::text IS NULL OR p."categoryId"=${categoryId}) AND (${subcategoryId}::text IS NULL OR p."subcategoryId"=${subcategoryId}) AND (${text}::text IS NULL OR p."name" ILIKE ${text} OR COALESCE(p."sku",'') ILIKE ${text})
      ORDER BY p."name" LIMIT ${pageSize} OFFSET ${offset}`;
    const total=Number(countRows[0]?.count||0);res.json({items:rows.map(r=>({...r,salePrice:Number(r.storeSalePrice??r.salePrice??0),vatRate:Number(r.vatRate||0)})),total,page,pageSize,pages:Math.max(1,Math.ceil(total/pageSize))});
  }catch(error){next(error)}
});

router.patch("/products/bulk-move",async(req,res,next)=>{
  try{const companyId=req.user.companyId;await ensureSchema();const body=z.object({productIds:z.array(z.string().min(1)).min(1).max(500),categoryId:z.string().min(1),subcategoryId:z.string().min(1).nullable().optional()}).parse(req.body||{});const ids=[...new Set(body.productIds)];const products=await prisma.$queryRaw`SELECT "id" FROM "Product" WHERE "companyId"=${companyId} AND "id"=ANY(${ids}::text[])`;if(products.length!==ids.length)return res.status(400).json({error:"Υπάρχει μη έγκυρο είδος."});if(body.subcategoryId){const sub=await prisma.$queryRaw`SELECT "id" FROM "ProductSubcategory" WHERE "id"=${body.subcategoryId} AND "companyId"=${companyId} AND "categoryId"=${body.categoryId} LIMIT 1`;if(!sub[0])return res.status(400).json({error:"Η υποκατηγορία δεν ανήκει στη νέα κατηγορία."})}await prisma.$executeRaw`UPDATE "Product" SET "categoryId"=${body.categoryId},"subcategoryId"=${body.subcategoryId||null},"updatedAt"=CURRENT_TIMESTAMP WHERE "companyId"=${companyId} AND "id"=ANY(${ids}::text[])`;res.json({ok:true,changed:ids.length})}catch(error){next(error)}});

export default router;
