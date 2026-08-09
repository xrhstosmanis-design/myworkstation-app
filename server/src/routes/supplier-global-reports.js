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
function requireAccess(req,res,next){if(req.user?.tokenType==="STORE_OPERATOR"||!roles.has(req.user?.role))return res.status(403).json({error:"Οι αναφορές προμηθευτών είναι διαθέσιμες μόνο σε Super Admin, Ιδιοκτήτη, Admin ή Manager."});next()}
router.use(requireAccess);
router.use(async(req,res,next)=>{try{await ensureSchema();next()}catch(error){next(error)}});
const querySchema=z.object({from:z.string().optional(),to:z.string().optional(),supplierId:z.string().optional(),q:z.string().trim().max(200).optional()});
function parseQuery(raw){const q=querySchema.parse(raw||{}),now=new Date(),to=q.to?new Date(q.to):now,from=q.from?new Date(q.from):new Date(to.getFullYear(),to.getMonth(),1);if(!Number.isFinite(from.getTime())||!Number.isFinite(to.getTime())||from>to){const error=new Error("Μη έγκυρο διάστημα ημερομηνιών.");error.status=400;throw error}return{...q,from,to,supplierId:q.supplierId||null,text:q.q?`%${q.q}%`:null}}
async function supplierOptions(companyId){return prisma.$queryRaw`SELECT "id","name","taxId" FROM "Supplier" WHERE "companyId"=${companyId} AND "active"=true ORDER BY "name"`}

router.get("/reports/invoices",async(req,res,next)=>{try{
  const companyId=req.user.companyId,{from,to,supplierId,text}=parseQuery(req.query),suppliers=await supplierOptions(companyId);
  const rows=await prisma.$queryRaw`SELECT d."id",d."documentType",d."documentNumber",d."documentDate",d."totalNet",d."totalVat",d."totalGross",d."status",d."sourceType",s."id" AS "supplierId",s."name" AS "supplierName",s."supplierCategory",st."name" AS "storeName" FROM "PurchaseDocument" d LEFT JOIN "Supplier" s ON s."id"=d."supplierId" AND s."companyId"=d."companyId" JOIN "Store" st ON st."id"=d."storeId" WHERE d."companyId"=${companyId} AND d."documentDate">=${from} AND d."documentDate"<=${to} AND (${supplierId}::text IS NULL OR d."supplierId"=${supplierId}) AND (${text}::text IS NULL OR COALESCE(d."documentNumber",'') ILIKE ${text} OR COALESCE(s."name",'') ILIKE ${text}) ORDER BY d."documentDate" DESC LIMIT 3000`;
  const items=rows.map(r=>({...r,totalNet:n(r.totalNet),totalVat:n(r.totalVat),totalGross:n(r.totalGross)})),summary=items.reduce((a,r)=>{a.count++;a.net+=r.totalNet;a.vat+=r.totalVat;a.gross+=r.totalGross;return a},{count:0,net:0,vat:0,gross:0});res.json({from,to,suppliers,items,summary});
}catch(error){next(error)}});

router.get("/reports/payments",async(req,res,next)=>{try{
  const companyId=req.user.companyId,{from,to,supplierId,text}=parseQuery(req.query),suppliers=await supplierOptions(companyId);
  const rows=await prisma.$queryRaw`SELECT t."id",t."occurredAt",t."amount",t."description",t."actorName",t."reversedAt",t."attachmentFilename",s."id" AS "supplierId",COALESCE(s."name",t."supplierName") AS "supplierName",s."taxId",st."name" AS "storeName" FROM "StoreTransaction" t JOIN "Store" st ON st."id"=t."storeId" LEFT JOIN "Supplier" s ON s."id"=t."supplierId" AND s."companyId"=t."companyId" WHERE t."companyId"=${companyId} AND t."type"='SUPPLIER_PAYMENT' AND t."occurredAt">=${from} AND t."occurredAt"<=${to} AND (${supplierId}::text IS NULL OR t."supplierId"=${supplierId}) AND (${text}::text IS NULL OR COALESCE(t."description",'') ILIKE ${text} OR COALESCE(s."name",t."supplierName",'') ILIKE ${text}) ORDER BY t."occurredAt" DESC LIMIT 3000`;
  const items=rows.map(r=>({...r,amount:n(r.amount)})),summary=items.reduce((a,r)=>{a.count++;if(!r.reversedAt)a.total+=r.amount;else a.reversed++;return a},{count:0,total:0,reversed:0});res.json({from,to,suppliers,items,summary});
}catch(error){next(error)}});

router.get("/reports/purchases",async(req,res,next)=>{try{
  const companyId=req.user.companyId,{from,to,supplierId}=parseQuery(req.query),suppliers=await supplierOptions(companyId);
  const rows=await prisma.$queryRaw`SELECT s."id" AS "supplierId",s."name" AS "supplierName",COUNT(d."id")::int AS documents,COALESCE(SUM(d."totalNet"),0) AS net,COALESCE(SUM(d."totalVat"),0) AS vat,COALESCE(SUM(d."totalGross"),0) AS gross FROM "PurchaseDocument" d JOIN "Supplier" s ON s."id"=d."supplierId" AND s."companyId"=d."companyId" WHERE d."companyId"=${companyId} AND d."status"='APPROVED' AND d."documentDate">=${from} AND d."documentDate"<=${to} AND (${supplierId}::text IS NULL OR d."supplierId"=${supplierId}) GROUP BY s."id",s."name" ORDER BY gross DESC`;
  const items=rows.map(r=>({...r,documents:n(r.documents),net:n(r.net),vat:n(r.vat),gross:n(r.gross)})),summary=items.reduce((a,r)=>{a.documents+=r.documents;a.net+=r.net;a.vat+=r.vat;a.gross+=r.gross;return a},{documents:0,net:0,vat:0,gross:0});items.forEach(r=>r.percentOfTotal=summary.gross?r.gross/summary.gross*100:0);res.json({from,to,suppliers,items,summary});
}catch(error){next(error)}});

router.get("/reports/sales",async(req,res,next)=>{try{
  const companyId=req.user.companyId,{from,to,supplierId}=parseQuery(req.query),suppliers=await supplierOptions(companyId);
  const rows=await prisma.$queryRaw`
    WITH latest_purchase AS (
      SELECT DISTINCT ON (l."productId") l."productId",d."supplierId"
      FROM "PurchaseDocumentLine" l JOIN "PurchaseDocument" d ON d."id"=l."purchaseDocumentId"
      WHERE d."companyId"=${companyId} AND d."status"='APPROVED' AND l."productId" IS NOT NULL
      ORDER BY l."productId",d."documentDate" DESC,d."createdAt" DESC
    ), product_supplier AS (
      SELECT p."id" AS "productId",COALESCE(link."supplierId",lp."supplierId") AS "supplierId"
      FROM "Product" p
      LEFT JOIN LATERAL (SELECT spl."supplierId" FROM "SupplierProductLink" spl WHERE spl."companyId"=${companyId} AND spl."productId"=p."id" AND spl."active"=true ORDER BY spl."updatedAt" DESC LIMIT 1) link ON true
      LEFT JOIN latest_purchase lp ON lp."productId"=p."id"
      WHERE p."companyId"=${companyId}
    ), product_cost AS (
      SELECT l."productId",d."supplierId",SUM(l."netAmount")/NULLIF(SUM(CASE WHEN l."unit"='PACKAGE' THEN l."quantity"*COALESCE(l."unitsPerPackage",1) ELSE l."quantity" END),0) AS "avgCost"
      FROM "PurchaseDocumentLine" l JOIN "PurchaseDocument" d ON d."id"=l."purchaseDocumentId"
      WHERE d."companyId"=${companyId} AND d."status"='APPROVED' AND l."productId" IS NOT NULL AND d."supplierId" IS NOT NULL
      GROUP BY l."productId",d."supplierId"
    )
    SELECT s."id" AS "supplierId",s."name" AS "supplierName",COUNT(DISTINCT sa."id")::int AS transactions,COUNT(DISTINCT sl."productId")::int AS items,
      COALESCE(SUM(sl."lineTotal"),0) AS sales,
      COALESCE(SUM(sl."quantity"*COALESCE(pc."avgCost",0)),0) AS cost,
      COALESCE(SUM(sl."lineTotal"*(sl."vatRate"/(100+sl."vatRate"))),0) AS "vatSales"
    FROM "SaleLine" sl JOIN "Sale" sa ON sa."id"=sl."saleId" JOIN product_supplier ps ON ps."productId"=sl."productId" JOIN "Supplier" s ON s."id"=ps."supplierId" AND s."companyId"=${companyId} LEFT JOIN product_cost pc ON pc."productId"=sl."productId" AND pc."supplierId"=s."id"
    WHERE sa."companyId"=${companyId} AND sa."status"='COMPLETED' AND sa."occurredAt">=${from} AND sa."occurredAt"<=${to} AND (${supplierId}::text IS NULL OR s."id"=${supplierId})
    GROUP BY s."id",s."name" ORDER BY sales DESC`;
  const items=rows.map(r=>{const sales=n(r.sales),cost=n(r.cost),profit=sales-cost;return{...r,transactions:n(r.transactions),items:n(r.items),sales,cost,profit,vatSales:n(r.vatSales),margin:sales?profit/sales*100:0}}),summary=items.reduce((a,r)=>{a.suppliers++;a.sales+=r.sales;a.cost+=r.cost;a.profit+=r.profit;a.vatSales+=r.vatSales;a.items+=r.items;return a},{suppliers:0,sales:0,cost:0,profit:0,vatSales:0,items:0});summary.margin=summary.sales?summary.profit/summary.sales*100:0;items.forEach(r=>r.percentOfSales=summary.sales?r.sales/summary.sales*100:0);res.json({from,to,suppliers,items,summary});
}catch(error){next(error)}});

router.get("/reports/sales/:supplierId/items",async(req,res,next)=>{try{
  const companyId=req.user.companyId,{from,to}=parseQuery(req.query),supplierId=req.params.supplierId;
  const exists=(await prisma.$queryRaw`SELECT "id" FROM "Supplier" WHERE "id"=${supplierId} AND "companyId"=${companyId} LIMIT 1`)[0];if(!exists)return res.status(404).json({error:"Δεν βρέθηκε ο προμηθευτής."});
  const rows=await prisma.$queryRaw`
    WITH assigned AS (
      SELECT p."id" AS "productId"
      FROM "Product" p
      LEFT JOIN LATERAL (SELECT spl."supplierId" FROM "SupplierProductLink" spl WHERE spl."companyId"=${companyId} AND spl."productId"=p."id" AND spl."active"=true ORDER BY spl."updatedAt" DESC LIMIT 1) link ON true
      LEFT JOIN LATERAL (SELECT d."supplierId" FROM "PurchaseDocumentLine" l JOIN "PurchaseDocument" d ON d."id"=l."purchaseDocumentId" WHERE d."companyId"=${companyId} AND d."status"='APPROVED' AND l."productId"=p."id" ORDER BY d."documentDate" DESC,d."createdAt" DESC LIMIT 1) hist ON true
      WHERE p."companyId"=${companyId} AND COALESCE(link."supplierId",hist."supplierId")=${supplierId}
    ), costs AS (
      SELECT l."productId",SUM(l."netAmount")/NULLIF(SUM(CASE WHEN l."unit"='PACKAGE' THEN l."quantity"*COALESCE(l."unitsPerPackage",1) ELSE l."quantity" END),0) AS "avgCost",
        (array_agg(CASE WHEN l."unit"='PACKAGE' THEN l."unitCost"/NULLIF(l."unitsPerPackage",0) ELSE l."unitCost" END ORDER BY d."documentDate" DESC))[1] AS "lastCost"
      FROM "PurchaseDocumentLine" l JOIN "PurchaseDocument" d ON d."id"=l."purchaseDocumentId"
      WHERE d."companyId"=${companyId} AND d."supplierId"=${supplierId} AND l."productId" IN (SELECT "productId" FROM assigned) GROUP BY l."productId"
    )
    SELECT p."id" AS "productId",p."sku",p."name",COALESCE(link."supplierCode",pol."supplierCode") AS "supplierCode",SUM(sl."quantity") AS quantity,SUM(sl."lineTotal") AS sales,
      SUM(sl."lineTotal"*(sl."vatRate"/(100+sl."vatRate"))) AS "vatSales",COALESCE(stock."currentStock",0) AS "currentStock",COALESCE(c."lastCost",0) AS "lastCost",COALESCE(c."avgCost",0) AS "avgCost"
    FROM assigned a JOIN "Product" p ON p."id"=a."productId" JOIN "SaleLine" sl ON sl."productId"=p."id" JOIN "Sale" sa ON sa."id"=sl."saleId" AND sa."companyId"=${companyId}
    LEFT JOIN costs c ON c."productId"=p."id"
    LEFT JOIN LATERAL (SELECT COALESCE(SUM(sp."currentStock"),0) AS "currentStock" FROM "StoreProduct" sp WHERE sp."productId"=p."id") stock ON true
    LEFT JOIN "SupplierProductLink" link ON link."companyId"=${companyId} AND link."supplierId"=${supplierId} AND link."productId"=p."id" AND link."active"=true
    LEFT JOIN LATERAL (SELECT l2."supplierCode" FROM "PurchaseOrderLine" l2 JOIN "PurchaseOrder" o2 ON o2."id"=l2."orderId" WHERE o2."companyId"=${companyId} AND o2."supplierId"=${supplierId} AND l2."productId"=p."id" AND l2."supplierCode" IS NOT NULL ORDER BY l2."updatedAt" DESC NULLS LAST,l2."createdAt" DESC LIMIT 1) pol ON true
    WHERE sa."status"='COMPLETED' AND sa."occurredAt">=${from} AND sa."occurredAt"<=${to}
    GROUP BY p."id",p."sku",p."name",link."supplierCode",pol."supplierCode",c."lastCost",c."avgCost",stock."currentStock" ORDER BY sales DESC`;
  const items=rows.map(r=>{const quantity=n(r.quantity),sales=n(r.sales),avgCost=n(r.avgCost),lastCost=n(r.lastCost),costAvg=quantity*avgCost,costLast=quantity*lastCost;return{...r,quantity,sales,vatSales:n(r.vatSales),currentStock:n(r.currentStock),avgCost,lastCost,averageSale:quantity?sales/quantity:0,profitWithAverage:sales-costAvg,profitWithLast:sales-costLast,margin:sales?(sales-costAvg)/sales*100:0}});res.json({supplierId,from,to,items});
}catch(error){next(error)}});

export default router;
