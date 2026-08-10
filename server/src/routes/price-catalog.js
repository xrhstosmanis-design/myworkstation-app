import crypto from "crypto";
import {Router} from "express";
import {z} from "zod";
import {prisma} from "../prisma.js";

const router=Router();
const roles=new Set(["SUPER_ADMIN","OWNER","ADMIN","MANAGER"]);
const id=()=>crypto.randomUUID();
const n=value=>Number(value||0);
let schemaPromise;

async function ensureSchema(){
  if(!schemaPromise){
    schemaPromise=(async()=>{
      await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "PriceCatalogPromotion" (
        "id" TEXT PRIMARY KEY,
        "companyId" TEXT NOT NULL,
        "productId" TEXT NOT NULL,
        "promotionType" TEXT NOT NULL,
        "originalPrice" NUMERIC(14,4) NOT NULL DEFAULT 0,
        "offerPrice" NUMERIC(14,4),
        "discountPercent" NUMERIC(8,4) NOT NULL DEFAULT 0,
        "saleQuantity" NUMERIC(14,4) NOT NULL DEFAULT 1,
        "bonusQuantity" NUMERIC(14,4) NOT NULL DEFAULT 0,
        "customerPoints" NUMERIC(14,2) NOT NULL DEFAULT 0,
        "validFrom" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "validUntil" TIMESTAMPTZ,
        "active" BOOLEAN NOT NULL DEFAULT true,
        "createdByUserId" TEXT,
        "createdByName" TEXT,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`);
      await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "PriceCatalogPromotion_company_type_idx" ON "PriceCatalogPromotion"("companyId","promotionType","active","validFrom")`);
      await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "PriceCatalogPromotion_product_idx" ON "PriceCatalogPromotion"("productId")`);
      await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "CustomerWholesalePrice" (
        "id" TEXT PRIMARY KEY,
        "companyId" TEXT NOT NULL,
        "customerId" TEXT NOT NULL,
        "productId" TEXT NOT NULL,
        "wholesalePrice" NUMERIC(14,4) NOT NULL,
        "active" BOOLEAN NOT NULL DEFAULT true,
        "createdByUserId" TEXT,
        "createdByName" TEXT,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE("companyId","customerId","productId")
      )`);
      await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "CustomerWholesalePrice_customer_idx" ON "CustomerWholesalePrice"("customerId","active")`);
      await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "ProductPriceHistory" (
        "id" TEXT PRIMARY KEY,
        "companyId" TEXT NOT NULL,
        "productId" TEXT NOT NULL,
        "storeId" TEXT,
        "oldPrice" NUMERIC(14,4),
        "newPrice" NUMERIC(14,4) NOT NULL,
        "changeType" TEXT NOT NULL,
        "createdByUserId" TEXT,
        "createdByName" TEXT,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`);
      await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "ProductPriceHistory_company_product_idx" ON "ProductPriceHistory"("companyId","productId","createdAt" DESC)`);
    })().catch(error=>{schemaPromise=undefined;throw error});
  }
  return schemaPromise;
}

function requireAccess(req,res,next){
  if(req.user?.tokenType==="STORE_OPERATOR"||!roles.has(req.user?.role))return res.status(403).json({error:"Η διαχείριση Τιμοκαταλόγου είναι διαθέσιμη μόνο σε Super Admin, Ιδιοκτήτη, Admin ή Manager."});
  next();
}
router.use(requireAccess);
router.use(async(req,res,next)=>{try{await ensureSchema();next()}catch(error){next(error)}});

async function ownedProduct(companyId,productId){const rows=await prisma.$queryRaw`SELECT "id","name","salePrice","vatRate" FROM "Product" WHERE "companyId"=${companyId} AND "id"=${productId} LIMIT 1`;return rows[0]||null}
async function ownedCustomer(companyId,customerId){const rows=await prisma.$queryRaw`SELECT "id","name" FROM "Customer" WHERE "companyId"=${companyId} AND "id"=${customerId} LIMIT 1`;return rows[0]||null}
async function ownedStore(companyId,storeId){if(!storeId)return null;return prisma.store.findFirst({where:{id:storeId,companyId},select:{id:true,name:true}})}

router.get("/lookups",async(req,res,next)=>{try{
  const companyId=req.user.companyId;
  const [stores,customers]=await Promise.all([
    prisma.store.findMany({where:{companyId,active:true},select:{id:true,name:true},orderBy:{name:"asc"}}),
    prisma.$queryRaw`SELECT "id","name","taxId" FROM "Customer" WHERE "companyId"=${companyId} AND "active"=true ORDER BY "name" LIMIT 3000`
  ]);
  res.json({stores,customers});
}catch(error){next(error)}});

router.get("/products",async(req,res,next)=>{try{
  const companyId=req.user.companyId,q=String(req.query.q||"").trim(),storeId=String(req.query.storeId||"")||null,text=q?`%${q}%`:null;
  if(storeId&&!await ownedStore(companyId,storeId))return res.status(404).json({error:"Δεν βρέθηκε το κατάστημα."});
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
    ORDER BY p."name" LIMIT 5000`;
  const items=rows.map(r=>{
    const salePrice=n(r.salePrice),vatRate=n(r.vatRate),lastCost=n(r.lastCost),saleNet=vatRate>=0?salePrice/(1+vatRate/100):salePrice;
    const margin=saleNet>0?((saleNet-lastCost)/saleNet)*100:0,markup=lastCost>0?((saleNet-lastCost)/lastCost)*100:0;
    return {...r,salePrice,vatRate,lastCost,saleNet,margin,markup};
  });
  res.json({items,count:items.length,storeId});
}catch(error){next(error)}});

router.patch("/products/:productId/price",async(req,res,next)=>{try{
  const companyId=req.user.companyId,product=await ownedProduct(companyId,req.params.productId);if(!product)return res.status(404).json({error:"Δεν βρέθηκε το προϊόν."});
  const body=z.object({salePrice:z.coerce.number().min(0).max(999999999),storeId:z.string().optional().nullable(),syncAllStores:z.boolean().optional().default(false)}).parse(req.body||{});
  let oldPrice=n(product.salePrice),store=null;
  if(body.storeId){store=await ownedStore(companyId,body.storeId);if(!store)return res.status(404).json({error:"Δεν βρέθηκε το κατάστημα."});const old=await prisma.$queryRaw`SELECT "salePrice" FROM "StoreProduct" WHERE "storeId"=${store.id} AND "productId"=${product.id} LIMIT 1`;oldPrice=n(old[0]?.salePrice??product.salePrice)}
  await prisma.$transaction(async tx=>{
    if(body.storeId){await tx.$executeRaw`INSERT INTO "StoreProduct" ("id","storeId","productId","salePrice","active") VALUES (${id()},${body.storeId},${product.id},${body.salePrice},true) ON CONFLICT ("storeId","productId") DO UPDATE SET "salePrice"=EXCLUDED."salePrice","updatedAt"=CURRENT_TIMESTAMP`}
    else await tx.$executeRaw`UPDATE "Product" SET "salePrice"=${body.salePrice},"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${product.id} AND "companyId"=${companyId}`;
    if(body.syncAllStores)await tx.$executeRaw`UPDATE "StoreProduct" sp SET "salePrice"=${body.salePrice},"updatedAt"=CURRENT_TIMESTAMP FROM "Store" s WHERE sp."storeId"=s."id" AND s."companyId"=${companyId} AND sp."productId"=${product.id}`;
    await tx.$executeRaw`INSERT INTO "ProductPriceHistory" ("id","companyId","productId","storeId","oldPrice","newPrice","changeType","createdByUserId","createdByName") VALUES (${id()},${companyId},${product.id},${body.storeId||null},${oldPrice},${body.salePrice},'PRICE_CATALOG',${req.user.id},${req.user.fullName||"Χρήστης"})`;
  });
  res.json({ok:true,oldPrice,newPrice:body.salePrice,store});
}catch(error){next(error)}});

const promotionSchema=z.object({
  productId:z.string().min(1),promotionType:z.enum(["LEAFLET","GIFT"]),offerPrice:z.coerce.number().min(0).nullable().optional(),discountPercent:z.coerce.number().min(0).max(100).default(0),saleQuantity:z.coerce.number().positive().max(9999).default(1),bonusQuantity:z.coerce.number().min(0).max(9999).default(0),customerPoints:z.coerce.number().min(0).max(999999).default(0),validFrom:z.coerce.date(),validUntil:z.coerce.date().nullable().optional(),active:z.boolean().default(true)
});

router.get("/promotions",async(req,res,next)=>{try{
  const companyId=req.user.companyId,type=String(req.query.type||"LEAFLET");if(!["LEAFLET","GIFT"].includes(type))return res.status(400).json({error:"Μη έγκυρος τύπος προσφοράς."});
  const rows=await prisma.$queryRaw`
    SELECT pr.*,p."name",p."salePrice",p."vatRate",c."name" AS "categoryName",mp."subcategoryName",
      COALESCE((SELECT pb."barcode" FROM "ProductBarcode" pb WHERE pb."productId"=p."id" ORDER BY pb."createdAt" LIMIT 1),'') AS "barcode",
      COALESCE((SELECT SUM(sp."currentStock") FROM "StoreProduct" sp WHERE sp."productId"=p."id"),0) AS "currentStock"
    FROM "PriceCatalogPromotion" pr JOIN "Product" p ON p."id"=pr."productId" AND p."companyId"=pr."companyId"
    LEFT JOIN "ProductCategory" c ON c."id"=p."categoryId" LEFT JOIN "MasterProduct" mp ON mp."id"=p."masterProductId"
    WHERE pr."companyId"=${companyId} AND pr."promotionType"=${type} ORDER BY pr."active" DESC,pr."validUntil" DESC NULLS FIRST,p."name"`;
  res.json({items:rows.map(r=>({...r,originalPrice:n(r.originalPrice),offerPrice:r.offerPrice===null?null:n(r.offerPrice),discountPercent:n(r.discountPercent),saleQuantity:n(r.saleQuantity),bonusQuantity:n(r.bonusQuantity),customerPoints:n(r.customerPoints),salePrice:n(r.salePrice),vatRate:n(r.vatRate),currentStock:n(r.currentStock)}))});
}catch(error){next(error)}});

router.post("/promotions",async(req,res,next)=>{try{
  const companyId=req.user.companyId,b=promotionSchema.parse(req.body||{}),product=await ownedProduct(companyId,b.productId);if(!product)return res.status(404).json({error:"Δεν βρέθηκε το προϊόν."});if(b.validUntil&&b.validUntil<b.validFrom)return res.status(400).json({error:"Η λήξη προσφοράς δεν μπορεί να είναι πριν από την έναρξη."});
  const originalPrice=n(product.salePrice),offerPrice=b.promotionType==="LEAFLET"?(b.offerPrice??Math.max(0,originalPrice*(1-b.discountPercent/100))):null,discount=b.promotionType==="LEAFLET"&&originalPrice>0?((originalPrice-n(offerPrice))/originalPrice)*100:b.discountPercent,promoId=id();
  await prisma.$executeRaw`INSERT INTO "PriceCatalogPromotion" ("id","companyId","productId","promotionType","originalPrice","offerPrice","discountPercent","saleQuantity","bonusQuantity","customerPoints","validFrom","validUntil","active","createdByUserId","createdByName") VALUES (${promoId},${companyId},${product.id},${b.promotionType},${originalPrice},${offerPrice},${discount},${b.saleQuantity},${b.bonusQuantity},${b.customerPoints},${b.validFrom},${b.validUntil||null},${b.active},${req.user.id},${req.user.fullName||"Χρήστης"})`;
  res.status(201).json({id:promoId});
}catch(error){next(error)}});

router.patch("/promotions/:promotionId",async(req,res,next)=>{try{
  const companyId=req.user.companyId,b=promotionSchema.partial({productId:true,promotionType:true}).parse(req.body||{}),rows=await prisma.$queryRaw`SELECT pr.*,p."salePrice" FROM "PriceCatalogPromotion" pr JOIN "Product" p ON p."id"=pr."productId" WHERE pr."id"=${req.params.promotionId} AND pr."companyId"=${companyId} LIMIT 1`;const old=rows[0];if(!old)return res.status(404).json({error:"Δεν βρέθηκε η προσφορά."});
  const validFrom=b.validFrom||old.validFrom,validUntil=b.validUntil===undefined?old.validUntil:b.validUntil;if(validUntil&&new Date(validUntil)<new Date(validFrom))return res.status(400).json({error:"Η λήξη προσφοράς δεν μπορεί να είναι πριν από την έναρξη."});
  const type=old.promotionType,originalPrice=n(old.originalPrice||old.salePrice),offerPrice=type==="LEAFLET"?(b.offerPrice===undefined?(old.offerPrice===null?null:n(old.offerPrice)):b.offerPrice):null,discount=type==="LEAFLET"&&offerPrice!==null&&originalPrice>0?((originalPrice-n(offerPrice))/originalPrice)*100:(b.discountPercent===undefined?n(old.discountPercent):b.discountPercent);
  await prisma.$executeRaw`UPDATE "PriceCatalogPromotion" SET "offerPrice"=${offerPrice},"discountPercent"=${discount},"saleQuantity"=${b.saleQuantity===undefined?n(old.saleQuantity):b.saleQuantity},"bonusQuantity"=${b.bonusQuantity===undefined?n(old.bonusQuantity):b.bonusQuantity},"customerPoints"=${b.customerPoints===undefined?n(old.customerPoints):b.customerPoints},"validFrom"=${validFrom},"validUntil"=${validUntil||null},"active"=${b.active===undefined?Boolean(old.active):b.active},"updatedAt"=NOW() WHERE "id"=${old.id} AND "companyId"=${companyId}`;res.json({ok:true});
}catch(error){next(error)}});

router.delete("/promotions/:promotionId",async(req,res,next)=>{try{const changed=await prisma.$executeRaw`UPDATE "PriceCatalogPromotion" SET "active"=false,"updatedAt"=NOW() WHERE "id"=${req.params.promotionId} AND "companyId"=${req.user.companyId}`;if(!changed)return res.status(404).json({error:"Δεν βρέθηκε η προσφορά."});res.json({ok:true})}catch(error){next(error)}});

router.get("/wholesale",async(req,res,next)=>{try{
  const companyId=req.user.companyId,q=String(req.query.q||"").trim(),customerId=String(req.query.customerId||"")||null,text=q?`%${q}%`:null;
  const rows=await prisma.$queryRaw`
    WITH latest_purchase AS (
      SELECT DISTINCT ON (l."productId") l."productId",d."documentDate",CASE WHEN l."unit"='PACKAGE' THEN l."unitCost"/NULLIF(l."unitsPerPackage",0) ELSE l."unitCost" END AS "lastCost"
      FROM "PurchaseDocumentLine" l JOIN "PurchaseDocument" d ON d."id"=l."purchaseDocumentId"
      WHERE d."companyId"=${companyId} AND d."status"='APPROVED' AND l."productId" IS NOT NULL ORDER BY l."productId",d."documentDate" DESC,d."createdAt" DESC
    )
    SELECT w."id",w."customerId",w."productId",w."wholesalePrice",w."active",cu."name" AS "customerName",p."sku",p."name" AS "productName",p."salePrice",p."vatRate",COALESCE(lp."lastCost",p."costPrice",0) AS "lastCost",lp."documentDate" AS "lastPurchaseAt"
    FROM "CustomerWholesalePrice" w JOIN "Customer" cu ON cu."id"=w."customerId" AND cu."companyId"=w."companyId" JOIN "Product" p ON p."id"=w."productId" AND p."companyId"=w."companyId" LEFT JOIN latest_purchase lp ON lp."productId"=p."id"
    WHERE w."companyId"=${companyId} AND w."active"=true AND (${customerId}::text IS NULL OR w."customerId"=${customerId}) AND (${text}::text IS NULL OR p."name" ILIKE ${text} OR COALESCE(p."sku",'') ILIKE ${text} OR cu."name" ILIKE ${text}) ORDER BY cu."name",p."name"`;
  const items=rows.map(r=>{const wholesale=n(r.wholesalePrice),retail=n(r.salePrice),vat=n(r.vatRate),last=n(r.lastCost),wholesaleNet=wholesale/(1+vat/100),retailNet=retail/(1+vat/100);return {...r,wholesalePrice:wholesale,salePrice:retail,vatRate:vat,lastCost:last,wholesaleNet,retailNet,customerMargin:wholesaleNet>0?((wholesaleNet-last)/wholesaleNet)*100:0,productMargin:retailNet>0?((retailNet-last)/retailNet)*100:0}});res.json({items});
}catch(error){next(error)}});

router.post("/wholesale",async(req,res,next)=>{try{
  const companyId=req.user.companyId,b=z.object({customerId:z.string().min(1),productId:z.string().min(1),wholesalePrice:z.coerce.number().min(0).max(999999999)}).parse(req.body||{});const [customer,product]=await Promise.all([ownedCustomer(companyId,b.customerId),ownedProduct(companyId,b.productId)]);if(!customer||!product)return res.status(404).json({error:"Δεν βρέθηκε πελάτης ή προϊόν."});const rowId=id();await prisma.$executeRaw`INSERT INTO "CustomerWholesalePrice" ("id","companyId","customerId","productId","wholesalePrice","createdByUserId","createdByName") VALUES (${rowId},${companyId},${customer.id},${product.id},${b.wholesalePrice},${req.user.id},${req.user.fullName||"Χρήστης"}) ON CONFLICT ("companyId","customerId","productId") DO UPDATE SET "wholesalePrice"=EXCLUDED."wholesalePrice","active"=true,"updatedAt"=NOW()`;res.status(201).json({id:rowId})
}catch(error){next(error)}});

router.delete("/wholesale/:id",async(req,res,next)=>{try{const changed=await prisma.$executeRaw`UPDATE "CustomerWholesalePrice" SET "active"=false,"updatedAt"=NOW() WHERE "id"=${req.params.id} AND "companyId"=${req.user.companyId}`;if(!changed)return res.status(404).json({error:"Δεν βρέθηκε η χονδρική τιμή."});res.json({ok:true})}catch(error){next(error)}});

export default router;
