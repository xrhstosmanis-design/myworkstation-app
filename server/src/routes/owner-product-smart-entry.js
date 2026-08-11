import crypto from "crypto";
import {Router} from "express";
import {z} from "zod";
import {prisma} from "../prisma.js";
import {requireCompanyModule} from "../middleware/module-access.js";

const router=Router();
const uid=()=>crypto.randomUUID();
let schemaReady=null;

async function ensureSchema(){
  if(schemaReady)return schemaReady;
  schemaReady=(async()=>{
    await prisma.$executeRawUnsafe(`ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "subcategoryId" TEXT`);
    await prisma.$executeRawUnsafe(`ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "vatDepartmentId" TEXT`);
    await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "ProductSubcategory" (
      "id" TEXT NOT NULL,"companyId" TEXT NOT NULL,"categoryId" TEXT NOT NULL,"legacyCode" TEXT,"name" TEXT NOT NULL,
      "property" TEXT NOT NULL DEFAULT 'STOCK_ITEM',"points" DECIMAL(14,4) NOT NULL DEFAULT 0,"pluGroup" INTEGER NOT NULL DEFAULT 0,
      "classification" TEXT NOT NULL DEFAULT 'MERCHANDISE',"eshopCode" TEXT,"active" BOOLEAN NOT NULL DEFAULT true,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "ProductSubcategory_pkey" PRIMARY KEY ("id"),
      CONSTRAINT "ProductSubcategory_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "ProductSubcategory_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ProductCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE)`);
    await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "ManagementVatDepartment" (
      "id" TEXT NOT NULL,"companyId" TEXT NOT NULL,"legacyVatCode" TEXT,"cashRegisterDepartment" INTEGER,"description" TEXT NOT NULL,
      "vatRate" DECIMAL(6,3) NOT NULL DEFAULT 0,"commerce" BOOLEAN NOT NULL DEFAULT true,"exemptionCode" TEXT,"exemptionDescription" TEXT,
      "active" BOOLEAN NOT NULL DEFAULT true,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "ManagementVatDepartment_pkey" PRIMARY KEY ("id"),
      CONSTRAINT "ManagementVatDepartment_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE)`);
  })();
  return schemaReady;
}

async function nextSku(companyId,tx=prisma){
  const rows=await tx.$queryRaw`SELECT COALESCE(MAX(CASE WHEN "sku" ~ '^[0-9]+$' THEN "sku"::bigint END),10000)+1 AS next FROM "Product" WHERE "companyId"=${companyId}`;
  return String(rows[0]?.next||10001);
}

router.get("/catalog",requireCompanyModule("INVENTORY"),async(req,res,next)=>{
  try{
    const companyId=req.user.companyId,q=String(req.query.q||"").trim(),like=`%${q}%`;await ensureSchema();
    const rows=await prisma.$queryRaw`
      SELECT p."id",p."sku",p."name",p."description",p."unit",p."salePrice",p."costPrice",p."vatRate",p."vatVerified",p."trackStock",p."active",p."masterProductId",
             c."name" AS "categoryName",sc."name" AS "subcategoryName",vd."id" AS "vatDepartmentId",vd."description" AS "vatDepartmentName",
             COALESCE((SELECT json_agg(jsonb_build_object('barcode',pb."barcode",'unitMultiplier',pb."unitMultiplier") ORDER BY pb."barcode") FROM "ProductBarcode" pb WHERE pb."productId"=p."id"),'[]') AS barcodes,
             COALESCE(json_agg(DISTINCT jsonb_build_object('storeId',s."id",'storeName',s."name",'salePrice',sp."salePrice",'active',sp."active",'currentStock',sp."currentStock",'minStock',sp."minStock")) FILTER (WHERE s."id" IS NOT NULL),'[]') AS stores
      FROM "Product" p
      LEFT JOIN "ProductCategory" c ON c."id"=p."categoryId"
      LEFT JOIN "ProductSubcategory" sc ON sc."id"=p."subcategoryId" AND sc."companyId"=${companyId}
      LEFT JOIN "ManagementVatDepartment" vd ON vd."id"=p."vatDepartmentId" AND vd."companyId"=${companyId}
      LEFT JOIN "StoreProduct" sp ON sp."productId"=p."id"
      LEFT JOIN "Store" s ON s."id"=sp."storeId" AND s."companyId"=${companyId}
      WHERE p."companyId"=${companyId} AND (${q===""} OR p."name" ILIKE ${like} OR p."sku" ILIKE ${like} OR EXISTS(SELECT 1 FROM "ProductBarcode" pbx WHERE pbx."productId"=p."id" AND pbx."barcode" ILIKE ${like}))
      GROUP BY p."id",c."name",sc."name",vd."id",vd."description" ORDER BY p."name" LIMIT 500`;
    res.json(rows.map(row=>({...row,salePrice:Number(row.salePrice||0),costPrice:Number(row.costPrice||0),vatRate:Number(row.vatRate||0)})));
  }catch(error){next(error)}
});

router.get("/smart-entry/options",requireCompanyModule("INVENTORY"),async(req,res,next)=>{
  try{
    const companyId=req.user.companyId;await ensureSchema();
    const categories=await prisma.$queryRaw`SELECT "id","name","active" FROM "ProductCategory" WHERE "companyId"=${companyId} AND "active"=true ORDER BY "name"`;
    const subcategories=await prisma.$queryRaw`SELECT "id","categoryId","name","active" FROM "ProductSubcategory" WHERE "companyId"=${companyId} AND "active"=true ORDER BY "name"`;
    let vats=await prisma.$queryRaw`SELECT "id","description","vatRate","active" FROM "ManagementVatDepartment" WHERE "companyId"=${companyId} AND "active"=true ORDER BY "vatRate","description"`;
    if(!vats.length){
      const rates=await prisma.$queryRaw`SELECT DISTINCT "vatRate" FROM "Product" WHERE "companyId"=${companyId} ORDER BY "vatRate"`;
      vats=rates.map((r,i)=>({id:`rate:${i}`,description:`ΦΠΑ ${Number(r.vatRate||0)}%`,vatRate:Number(r.vatRate||0),active:true}));
    }
    res.json({nextSku:await nextSku(companyId),categories,subcategories,vats:vats.map(v=>({...v,vatRate:Number(v.vatRate||0)}))});
  }catch(error){next(error)}
});

router.get("/smart-entry/barcode/:barcode",requireCompanyModule("INVENTORY"),async(req,res,next)=>{
  try{
    const companyId=req.user.companyId,barcode=String(req.params.barcode||"").trim();
    if(!/^\d{6,18}$/.test(barcode))return res.status(400).json({error:"Μη έγκυρο barcode."});
    const local=await prisma.$queryRaw`SELECT p."id",p."sku",p."name",p."vatRate",c."name" AS "categoryName",sc."name" AS "subcategoryName" FROM "Product" p JOIN "ProductBarcode" pb ON pb."productId"=p."id" LEFT JOIN "ProductCategory" c ON c."id"=p."categoryId" LEFT JOIN "ProductSubcategory" sc ON sc."id"=p."subcategoryId" WHERE p."companyId"=${companyId} AND pb."barcode"=${barcode} LIMIT 1`;
    if(local[0])return res.json({found:true,source:"MYWORKSTATION",product:{...local[0],vatRate:Number(local[0].vatRate||0)}});
    const master=await prisma.$queryRaw`SELECT mp."sourceCode" AS "sku",mp."name",mp."categoryName",mp."subcategoryName",mp."vatRate" FROM "MasterProduct" mp JOIN "MasterProductBarcode" mb ON mb."masterProductId"=mp."id" WHERE mb."barcode"=${barcode} AND mp."active"=true LIMIT 1`;
    if(master[0])return res.json({found:true,source:"MASTER_CATALOG",product:{...master[0],vatRate:Number(master[0].vatRate||0)}});
    const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),4500);
    try{
      const response=await fetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}?fields=code,product_name,product_name_el,brands,categories,categories_tags`,{headers:{"User-Agent":"MyWorkStation/1.0 (https://myworkstation.gr)"},signal:controller.signal});
      if(response.ok){const data=await response.json();const p=data?.product;if(p&&data?.status!==0){return res.json({found:true,source:"OPEN_FOOD_FACTS",product:{name:p.product_name_el||p.product_name||"",brandName:p.brands||"",categoryName:Array.isArray(p.categories_tags)&&p.categories_tags.length?String(p.categories_tags[0]).replace(/^..:/,""):p.categories||"",subcategoryName:"",vatRate:null}})}}
    }catch{}finally{clearTimeout(timer)}
    res.json({found:false,source:null,product:null});
  }catch(error){next(error)}
});

router.post("/smart-entry",requireCompanyModule("INVENTORY"),async(req,res,next)=>{
  try{
    const companyId=req.user.companyId;await ensureSchema();
    const body=z.object({barcode:z.string().trim().min(6).max(80).optional().or(z.literal("")),name:z.string().trim().min(2).max(250),categoryId:z.string().min(1),subcategoryId:z.string().optional().nullable(),vatDepartmentId:z.string().optional().nullable(),vatRate:z.coerce.number().min(0).max(100),costPrice:z.coerce.number().min(0).default(0),salePrice:z.coerce.number().min(0),unit:z.enum(["PIECE","KG","LITER","PACKAGE"]).default("PIECE"),trackStock:z.boolean().default(true),active:z.boolean().default(true),initialStock:z.coerce.number().min(0).default(0),storeIds:z.array(z.string().min(1)).max(500)}).parse(req.body||{});
    const category=(await prisma.$queryRaw`SELECT "id" FROM "ProductCategory" WHERE "id"=${body.categoryId} AND "companyId"=${companyId} AND "active"=true LIMIT 1`)[0];if(!category)return res.status(400).json({error:"Η κατηγορία δεν είναι έγκυρη."});
    if(body.subcategoryId){const sub=(await prisma.$queryRaw`SELECT "id" FROM "ProductSubcategory" WHERE "id"=${body.subcategoryId} AND "companyId"=${companyId} AND "categoryId"=${body.categoryId} AND "active"=true LIMIT 1`)[0];if(!sub)return res.status(400).json({error:"Η υποκατηγορία δεν ανήκει στην επιλεγμένη κατηγορία."})}
    if(body.barcode){const duplicate=await prisma.$queryRaw`SELECT p."id" FROM "ProductBarcode" pb JOIN "Product" p ON p."id"=pb."productId" WHERE p."companyId"=${companyId} AND pb."barcode"=${body.barcode} LIMIT 1`;if(duplicate[0])return res.status(409).json({error:"Το barcode υπάρχει ήδη σε άλλο προϊόν."})}
    const validStores=await prisma.store.findMany({where:{companyId,id:{in:body.storeIds}},select:{id:true}});if(validStores.length!==new Set(body.storeIds).size)return res.status(400).json({error:"Υπάρχει μη έγκυρο κατάστημα."});
    const productId=uid();let sku="";
    await prisma.$transaction(async tx=>{
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${companyId+":product-sku"}))`;
      sku=await nextSku(companyId,tx);
      let vatDepartmentId=body.vatDepartmentId&&String(body.vatDepartmentId).startsWith("rate:")?null:body.vatDepartmentId||null,effectiveVatRate=Number(body.vatRate||0);
      if(vatDepartmentId){const dep=(await tx.$queryRaw`SELECT "id","vatRate" FROM "ManagementVatDepartment" WHERE "id"=${vatDepartmentId} AND "companyId"=${companyId} AND "active"=true LIMIT 1`)[0];if(!dep)vatDepartmentId=null;else effectiveVatRate=Number(dep.vatRate||0)}
      await tx.$executeRaw`INSERT INTO "Product" ("id","companyId","categoryId","subcategoryId","vatDepartmentId","sku","name","unit","vatRate","vatVerified","salePrice","costPrice","trackStock","active") VALUES (${productId},${companyId},${body.categoryId},${body.subcategoryId||null},${vatDepartmentId},${sku},${body.name},${body.unit},${effectiveVatRate},true,${body.salePrice},${body.costPrice},${body.trackStock},${body.active})`;
      if(body.barcode)await tx.$executeRaw`INSERT INTO "ProductBarcode" ("id","productId","barcode","unitMultiplier") VALUES (${uid()},${productId},${body.barcode},1)`;
      for(const storeId of body.storeIds)await tx.$executeRaw`INSERT INTO "StoreProduct" ("id","storeId","productId","salePrice","currentStock","active") VALUES (${uid()},${storeId},${productId},${body.salePrice},${body.initialStock},true) ON CONFLICT ("storeId","productId") DO UPDATE SET "salePrice"=EXCLUDED."salePrice","currentStock"=EXCLUDED."currentStock","active"=true,"updatedAt"=CURRENT_TIMESTAMP`;
    });
    res.status(201).json({id:productId,sku});
  }catch(error){next(error)}
});

export default router;
