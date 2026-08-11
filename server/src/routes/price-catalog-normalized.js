import {Router} from "express";
import {prisma} from "../prisma.js";
import priceCatalogRoutes from "./price-catalog.js";

const router=Router();
const roles=new Set(["SUPER_ADMIN","OWNER","ADMIN","MANAGER"]);
let compatibilityPromise;

async function ensureCompatibility(){
  if(!compatibilityPromise){
    compatibilityPromise=(async()=>{
      const alters=[
        `ALTER TABLE "ProductPriceHistory" ADD COLUMN IF NOT EXISTS "companyId" TEXT`,
        `ALTER TABLE "ProductPriceHistory" ADD COLUMN IF NOT EXISTS "productId" TEXT`,
        `ALTER TABLE "ProductPriceHistory" ADD COLUMN IF NOT EXISTS "storeId" TEXT`,
        `ALTER TABLE "ProductPriceHistory" ADD COLUMN IF NOT EXISTS "oldPrice" NUMERIC(14,4)`,
        `ALTER TABLE "ProductPriceHistory" ADD COLUMN IF NOT EXISTS "newPrice" NUMERIC(14,4)`,
        `ALTER TABLE "ProductPriceHistory" ADD COLUMN IF NOT EXISTS "changeType" TEXT`,
        `ALTER TABLE "ProductPriceHistory" ADD COLUMN IF NOT EXISTS "createdByUserId" TEXT`,
        `ALTER TABLE "ProductPriceHistory" ADD COLUMN IF NOT EXISTS "createdByName" TEXT`,
        `ALTER TABLE "ProductPriceHistory" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()`
      ];
      for(const sql of alters)await prisma.$executeRawUnsafe(sql);
      await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "ProductPriceHistory_company_product_idx" ON "ProductPriceHistory"("companyId","productId","createdAt" DESC)`);
      await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "PriceCatalogPromotionStore" (
        "promotionId" TEXT NOT NULL,
        "companyId" TEXT NOT NULL,
        "storeId" TEXT NOT NULL,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY("promotionId","storeId")
      )`);
      await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "PriceCatalogPromotionStore_company_store_idx" ON "PriceCatalogPromotionStore"("companyId","storeId","promotionId")`);
    })().catch(error=>{compatibilityPromise=undefined;throw error});
  }
  return compatibilityPromise;
}

function requireAccess(req,res,next){
  if(req.user?.tokenType==="STORE_OPERATOR"||!roles.has(req.user?.role))return res.status(403).json({error:"Η διαχείριση Τιμοκαταλόγου είναι διαθέσιμη μόνο σε Super Admin, Ιδιοκτήτη, Admin ή Manager."});
  next();
}
router.use(requireAccess);
router.use(async(req,res,next)=>{try{await ensureCompatibility();next()}catch(error){next(error)}});

router.get("/products",async(req,res,next)=>{
  try{
    const companyId=req.user.companyId;
    const q=String(req.query.q||"").trim();
    const storeId=String(req.query.storeId||"")||null;
    const page=Math.max(1,Number.parseInt(String(req.query.page||"1"),10)||1);
    const pageSize=Math.min(500,Math.max(25,Number.parseInt(String(req.query.pageSize||"100"),10)||100));
    const offset=(page-1)*pageSize;
    const text=q?`%${q}%`:null;
    if(storeId){const store=await prisma.store.findFirst({where:{id:storeId,companyId,active:true},select:{id:true}});if(!store)return res.status(404).json({error:"Δεν βρέθηκε το κατάστημα."})}
    const countRows=await prisma.$queryRaw`
      SELECT COUNT(*)::int AS count FROM "Product" p
      WHERE p."companyId"=${companyId} AND p."active"=true
        AND (${text}::text IS NULL OR p."name" ILIKE ${text} OR COALESCE(p."sku",'') ILIKE ${text} OR EXISTS(SELECT 1 FROM "ProductBarcode" bx WHERE bx."productId"=p."id" AND bx."barcode" ILIKE ${text}))`;
    const rows=await prisma.$queryRaw`
      WITH latest_purchase AS (
        SELECT DISTINCT ON (l."productId") l."productId",d."supplierId",d."documentDate",
          CASE WHEN l."unit"='PACKAGE' THEN l."unitCost"/NULLIF(l."unitsPerPackage",0) ELSE l."unitCost" END AS "lastCost"
        FROM "PurchaseDocumentLine" l JOIN "PurchaseDocument" d ON d."id"=l."purchaseDocumentId"
        WHERE d."companyId"=${companyId} AND d."status"='APPROVED' AND l."productId" IS NOT NULL
        ORDER BY l."productId",d."documentDate" DESC,d."createdAt" DESC
      )
      SELECT p."id",p."sku",p."name",p."vatRate",p."active",c."name" AS "categoryName",mp."subcategoryName",
        COALESCE(sp."salePrice",p."salePrice",0) AS "salePrice",
        COALESCE(lp."lastCost",p."costPrice",0) AS "lastCost",
        lp."documentDate" AS "lastPurchaseAt",s."name" AS "lastSupplierName",
        COALESCE((SELECT pb."barcode" FROM "ProductBarcode" pb WHERE pb."productId"=p."id" ORDER BY pb."createdAt" LIMIT 1),'') AS "barcode"
      FROM "Product" p
      LEFT JOIN "ProductCategory" c ON c."id"=p."categoryId"
      LEFT JOIN "MasterProduct" mp ON mp."id"=p."masterProductId"
      LEFT JOIN latest_purchase lp ON lp."productId"=p."id"
      LEFT JOIN "Supplier" s ON s."id"=lp."supplierId"
      LEFT JOIN "StoreProduct" sp ON ${storeId}::text IS NOT NULL AND sp."storeId"=${storeId} AND sp."productId"=p."id"
      WHERE p."companyId"=${companyId} AND p."active"=true
        AND (${text}::text IS NULL OR p."name" ILIKE ${text} OR COALESCE(p."sku",'') ILIKE ${text} OR EXISTS(SELECT 1 FROM "ProductBarcode" bx WHERE bx."productId"=p."id" AND bx."barcode" ILIKE ${text}))
      ORDER BY p."name" LIMIT ${pageSize} OFFSET ${offset}`;
    const items=rows.map(r=>{
      const salePrice=Number(r.salePrice||0),vatRate=Number(r.vatRate||0),lastCost=Number(r.lastCost||0),saleNet=vatRate>=0?salePrice/(1+vatRate/100):salePrice;
      return {...r,salePrice,vatRate,lastCost,saleNet,margin:saleNet>0?((saleNet-lastCost)/saleNet)*100:0,markup:lastCost>0?((saleNet-lastCost)/lastCost)*100:0};
    });
    const total=Number(countRows[0]?.count||0);
    res.json({items,count:items.length,total,page,pageSize,pages:Math.max(1,Math.ceil(total/pageSize)),storeId});
  }catch(error){next(error)}
});

async function ownedPromotion(companyId,promotionId){
  const rows=await prisma.$queryRaw`SELECT "id","promotionType","productId","active" FROM "PriceCatalogPromotion" WHERE "id"=${promotionId} AND "companyId"=${companyId} LIMIT 1`;
  return rows[0]||null;
}

router.get("/promotions/:promotionId/stores",async(req,res,next)=>{
  try{
    const companyId=req.user.companyId,promotion=await ownedPromotion(companyId,req.params.promotionId);
    if(!promotion)return res.status(404).json({error:"Δεν βρέθηκε η προσφορά."});
    const [stores,assigned]=await Promise.all([
      prisma.store.findMany({where:{companyId,active:true},select:{id:true,name:true},orderBy:{name:"asc"}}),
      prisma.$queryRaw`SELECT "storeId" FROM "PriceCatalogPromotionStore" WHERE "companyId"=${companyId} AND "promotionId"=${promotion.id} ORDER BY "storeId"`
    ]);
    const selected=new Set(assigned.map(row=>row.storeId));
    res.json({promotion,stores:stores.map(store=>({...store,selected:selected.has(store.id)})),storeIds:[...selected]});
  }catch(error){next(error)}
});

router.put("/promotions/:promotionId/stores",async(req,res,next)=>{
  try{
    const companyId=req.user.companyId,promotion=await ownedPromotion(companyId,req.params.promotionId);
    if(!promotion)return res.status(404).json({error:"Δεν βρέθηκε η προσφορά."});
    const storeIds=[...new Set(Array.isArray(req.body?.storeIds)?req.body.storeIds.map(value=>String(value||"").trim()).filter(Boolean):[])];
    if(storeIds.length>200)return res.status(400).json({error:"Υπερβολικά πολλά καταστήματα για μία προσφορά."});
    if(storeIds.length){
      const count=await prisma.store.count({where:{companyId,active:true,id:{in:storeIds}}});
      if(count!==storeIds.length)return res.status(400).json({error:"Ένα ή περισσότερα καταστήματα δεν ανήκουν στην εταιρεία ή δεν είναι ενεργά."});
    }
    await prisma.$transaction(async tx=>{
      await tx.$executeRaw`DELETE FROM "PriceCatalogPromotionStore" WHERE "companyId"=${companyId} AND "promotionId"=${promotion.id}`;
      for(const storeId of storeIds)await tx.$executeRaw`INSERT INTO "PriceCatalogPromotionStore" ("promotionId","companyId","storeId") VALUES (${promotion.id},${companyId},${storeId}) ON CONFLICT ("promotionId","storeId") DO NOTHING`;
    });
    res.json({ok:true,storeIds,posActive:storeIds.length>0});
  }catch(error){next(error)}
});

router.use(priceCatalogRoutes);
export default router;
