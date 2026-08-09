import {Router} from "express";
import {z} from "zod";
import {prisma} from "../prisma.js";

const router=Router();
const roles=new Set(["SUPER_ADMIN","OWNER","ADMIN","MANAGER"]);
const n=value=>Number(value||0);
let schemaPromise;

async function ensureSchema(){
  if(!schemaPromise){
    schemaPromise=prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "SupplierProductLink" (
      "id" TEXT PRIMARY KEY,"companyId" TEXT NOT NULL,"supplierId" TEXT NOT NULL,"productId" TEXT NOT NULL,
      "supplierCode" TEXT,"active" BOOLEAN NOT NULL DEFAULT true,"source" TEXT NOT NULL DEFAULT 'MANUAL',
      "updatedBy" TEXT,"updatedByName" TEXT,"createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),"updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE("companyId","supplierId","productId"))`).catch(error=>{schemaPromise=undefined;throw error});
  }
  return schemaPromise;
}
function requireAccess(req,res,next){if(req.user?.tokenType==="STORE_OPERATOR"||!roles.has(req.user?.role))return res.status(403).json({error:"Η προβολή ειδών προμηθευτή είναι διαθέσιμη μόνο σε Super Admin, Ιδιοκτήτη, Admin ή Manager."});next()}
router.use(requireAccess);
router.use(async(req,res,next)=>{try{await ensureSchema();next()}catch(error){next(error)}});

router.get("/:supplierId/products",async(req,res,next)=>{
  try{
    const companyId=req.user.companyId,supplierId=req.params.supplierId;
    const query=z.object({q:z.string().trim().max(180).optional()}).parse(req.query||{}),text=query.q?`%${query.q}%`:null;
    const supplier=(await prisma.$queryRaw`SELECT "id","name","taxId","active" FROM "Supplier" WHERE "id"=${supplierId} AND "companyId"=${companyId} LIMIT 1`)[0];
    if(!supplier)return res.status(404).json({error:"Δεν βρέθηκε ο προμηθευτής."});
    const rows=await prisma.$queryRaw`
      WITH latest_purchase AS (
        SELECT DISTINCT ON (l."productId") l."productId",d."supplierId",d."documentDate",l."unitCost"
        FROM "PurchaseDocumentLine" l
        JOIN "PurchaseDocument" d ON d."id"=l."purchaseDocumentId"
        WHERE d."companyId"=${companyId} AND d."status"='APPROVED' AND l."productId" IS NOT NULL
        ORDER BY l."productId",d."documentDate" DESC,d."createdAt" DESC
      ), current_map AS (
        SELECT p."id" AS "productId",COALESCE(link."supplierId",lp."supplierId") AS "supplierId"
        FROM "Product" p
        LEFT JOIN LATERAL (
          SELECT spl."supplierId" FROM "SupplierProductLink" spl
          WHERE spl."companyId"=${companyId} AND spl."productId"=p."id" AND spl."active"=true
          ORDER BY spl."updatedAt" DESC LIMIT 1
        ) link ON true
        LEFT JOIN latest_purchase lp ON lp."productId"=p."id"
        WHERE p."companyId"=${companyId}
      ), supplier_costs AS (
        SELECT l."productId",
          SUM(l."netAmount")/NULLIF(SUM(CASE WHEN l."unit"='PACKAGE' THEN l."quantity"*COALESCE(l."unitsPerPackage",1) ELSE l."quantity" END),0) AS "avgCost",
          (array_agg(CASE WHEN l."unit"='PACKAGE' THEN l."unitCost"/NULLIF(l."unitsPerPackage",0) ELSE l."unitCost" END ORDER BY d."documentDate" DESC,d."createdAt" DESC))[1] AS "lastCost",
          MAX(d."documentDate") AS "lastPurchaseAt",
          COUNT(DISTINCT d."id")::int AS "purchaseCount"
        FROM "PurchaseDocumentLine" l
        JOIN "PurchaseDocument" d ON d."id"=l."purchaseDocumentId"
        WHERE d."companyId"=${companyId} AND d."supplierId"=${supplierId} AND d."status"='APPROVED' AND l."productId" IS NOT NULL
        GROUP BY l."productId"
      )
      SELECT p."id",p."sku",p."name",p."unit",p."vatRate",p."salePrice",p."active",c."name" AS "categoryName",
        link."supplierCode",link."source" AS "linkSource",link."updatedAt" AS "linkUpdatedAt",
        COALESCE(costs."avgCost",0) AS "avgCost",COALESCE(costs."lastCost",0) AS "lastCost",costs."lastPurchaseAt",COALESCE(costs."purchaseCount",0)::int AS "purchaseCount",
        COALESCE(stock."currentStock",0) AS "currentStock",
        COALESCE(json_agg(DISTINCT jsonb_build_object('id',b."id",'barcode',b."barcode",'salePrice',b."salePrice",'name',b."name")) FILTER (WHERE b."id" IS NOT NULL),'[]') AS barcodes
      FROM current_map map
      JOIN "Product" p ON p."id"=map."productId" AND p."companyId"=${companyId}
      LEFT JOIN "ProductCategory" c ON c."id"=p."categoryId"
      LEFT JOIN "SupplierProductLink" link ON link."companyId"=${companyId} AND link."supplierId"=${supplierId} AND link."productId"=p."id" AND link."active"=true
      LEFT JOIN supplier_costs costs ON costs."productId"=p."id"
      LEFT JOIN LATERAL (SELECT COALESCE(SUM(sp."currentStock"),0) AS "currentStock" FROM "StoreProduct" sp WHERE sp."productId"=p."id") stock ON true
      LEFT JOIN "ProductBarcode" b ON b."productId"=p."id"
      WHERE map."supplierId"=${supplierId}
        AND (${text}::text IS NULL OR p."name" ILIKE ${text} OR COALESCE(p."sku",'') ILIKE ${text} OR COALESCE(link."supplierCode",'') ILIKE ${text} OR EXISTS(SELECT 1 FROM "ProductBarcode" bx WHERE bx."productId"=p."id" AND bx."barcode" ILIKE ${text}))
      GROUP BY p."id",p."sku",p."name",p."unit",p."vatRate",p."salePrice",p."active",c."name",link."supplierCode",link."source",link."updatedAt",costs."avgCost",costs."lastCost",costs."lastPurchaseAt",costs."purchaseCount",stock."currentStock"
      ORDER BY p."active" DESC,p."name"`;
    const items=rows.map(row=>({...row,vatRate:n(row.vatRate),salePrice:n(row.salePrice),avgCost:n(row.avgCost),lastCost:n(row.lastCost),purchaseCount:n(row.purchaseCount),currentStock:n(row.currentStock),active:Boolean(row.active),barcodes:Array.isArray(row.barcodes)?row.barcodes:[]}));
    const summary=items.reduce((a,row)=>{a.items++;if(row.active)a.active++;a.stock+=row.currentStock;a.stockValue+=row.currentStock*row.avgCost;a.purchaseDocs+=row.purchaseCount;return a},{items:0,active:0,stock:0,stockValue:0,purchaseDocs:0});
    res.json({supplier,items,summary,sourceNote:"Η τρέχουσα αντιστοίχιση χρησιμοποιεί ενεργό SupplierProductLink και, όπου δεν υπάρχει, τον προμηθευτή της πιο πρόσφατης εγκεκριμένης αγοράς."});
  }catch(error){next(error)}
});

export default router;
