import {Router} from "express";
import {prisma} from "../prisma.js";

const router=Router();
const roles=new Set(["SUPER_ADMIN","OWNER","ADMIN","MANAGER"]);
const n=value=>Number(value||0);
const dayStart=value=>{const d=value?new Date(`${String(value).slice(0,10)}T00:00:00`):new Date(Date.now()-30*86400000);return Number.isNaN(d.getTime())?new Date(Date.now()-30*86400000):d};
const dayEndExclusive=value=>{const d=value?new Date(`${String(value).slice(0,10)}T00:00:00`):new Date();if(Number.isNaN(d.getTime()))return new Date(Date.now()+86400000);d.setDate(d.getDate()+1);return d};
const filters=req=>({companyId:req.user.companyId,from:dayStart(req.query.from),to:dayEndExclusive(req.query.to),storeId:String(req.query.storeId||"")||null,q:String(req.query.q||"").trim()||null});

router.use((req,res,next)=>{
  if(req.user?.tokenType==="STORE_OPERATOR"||!roles.has(req.user?.role))return res.status(403).json({error:"Η αναφορά πωλήσεων είναι διαθέσιμη μόνο σε Super Admin, Ιδιοκτήτη, Admin ή Manager."});
  next();
});

router.get("/sales-analysis",async(req,res,next)=>{try{
  const {companyId,from,to,storeId,q}=filters(req),text=q?`%${q}%`:null;
  const rows=await prisma.$queryRaw`
    WITH base AS (
      SELECT sa."id" AS "saleId",sa."storeId",sa."occurredAt",sa."source",sl."productId",sl."description",sl."quantity",sl."unitPrice",sl."discount",sl."vatRate",sl."lineTotal",
        p."sku",COALESCE(p."name",sl."description") AS "name",c."name" AS "categoryName",mp."subcategoryName",s."name" AS "storeName",
        COALESCE(sp."currentStock",0) AS "currentStock",
        COALESCE(pc."unitCost",p."costPrice",0) AS "unitCost",
        pc."supplierName"
      FROM "SaleLine" sl
      JOIN "Sale" sa ON sa."id"=sl."saleId" AND sa."companyId"=${companyId} AND sa."status"='COMPLETED'
      JOIN "Store" s ON s."id"=sa."storeId" AND s."companyId"=${companyId}
      LEFT JOIN "Product" p ON p."id"=sl."productId" AND p."companyId"=${companyId}
      LEFT JOIN "ProductCategory" c ON c."id"=p."categoryId"
      LEFT JOIN "MasterProduct" mp ON mp."id"=p."masterProductId"
      LEFT JOIN "StoreProduct" sp ON sp."storeId"=sa."storeId" AND sp."productId"=sl."productId"
      LEFT JOIN LATERAL (
        SELECT CASE WHEN pl."unit"='PACKAGE' THEN pl."unitCost"/NULLIF(pl."unitsPerPackage",0) ELSE pl."unitCost" END AS "unitCost",sup."name" AS "supplierName"
        FROM "PurchaseDocumentLine" pl
        JOIN "PurchaseDocument" pd ON pd."id"=pl."purchaseDocumentId"
        LEFT JOIN "Supplier" sup ON sup."id"=pd."supplierId"
        WHERE pd."companyId"=${companyId} AND pd."storeId"=sa."storeId" AND pd."status"='APPROVED' AND pl."productId"=sl."productId" AND pd."documentDate"<=sa."occurredAt"
        ORDER BY pd."documentDate" DESC,pd."createdAt" DESC LIMIT 1
      ) pc ON true
      WHERE sa."occurredAt">=${from} AND sa."occurredAt"<${to}
        AND (${storeId}::text IS NULL OR sa."storeId"=${storeId})
        AND (${text}::text IS NULL OR COALESCE(p."name",sl."description") ILIKE ${text} OR COALESCE(p."sku",'') ILIKE ${text})
    )
    SELECT "productId","sku","name","categoryName","subcategoryName","storeId","storeName",MAX("currentStock") AS "currentStock",
      SUM("quantity") AS "salesQuantity",SUM("lineTotal") AS "grossSales",
      SUM(CASE WHEN "vatRate"=0 THEN "lineTotal" ELSE "lineTotal"/(1+"vatRate"/100) END) AS "netSales",
      SUM("lineTotal"-CASE WHEN "vatRate"=0 THEN "lineTotal" ELSE "lineTotal"/(1+"vatRate"/100) END) AS "vatValue",
      SUM("quantity"*"unitCost") AS "costValue",
      MAX("occurredAt") FILTER (WHERE COALESCE("source",'')<>'POS_REVERSAL') AS "lastSaleAt",
      SUM("discount") AS "discountValue",
      COUNT(DISTINCT "saleId") FILTER (WHERE COALESCE("source",'')<>'POS_REVERSAL')::int AS "normalSaleCount",
      COUNT(DISTINCT "saleId") FILTER (WHERE "source"='POS_REVERSAL')::int AS "reversalCount",
      ABS(COALESCE(SUM("lineTotal") FILTER (WHERE "source"='POS_REVERSAL'),0)) AS "returnGrossValue",
      (array_agg("supplierName" ORDER BY "occurredAt" DESC) FILTER (WHERE "supplierName" IS NOT NULL))[1] AS "supplierName"
    FROM base
    GROUP BY "productId","sku","name","categoryName","subcategoryName","storeId","storeName"
    ORDER BY SUM("lineTotal") DESC,"name" ASC LIMIT 10000`;
  const items=rows.map(r=>{
    const grossSales=n(r.grossSales),netSales=n(r.netSales),vatValue=n(r.vatValue),costValue=n(r.costValue),profit=netSales-costValue,salesQuantity=n(r.salesQuantity);
    return {...r,currentStock:n(r.currentStock),salesQuantity,grossSales,netSales,vatValue,costValue,profit,margin:netSales?profit/netSales*100:0,averageGrossPrice:salesQuantity?grossSales/salesQuantity:0,discountValue:n(r.discountValue),normalSaleCount:n(r.normalSaleCount),reversalCount:n(r.reversalCount),returnGrossValue:n(r.returnGrossValue)};
  });
  res.json({items,count:items.length,totalQuantity:items.reduce((a,r)=>a+r.salesQuantity,0),totalGross:items.reduce((a,r)=>a+r.grossSales,0),totalNet:items.reduce((a,r)=>a+r.netSales,0),totalVat:items.reduce((a,r)=>a+r.vatValue,0),totalCost:items.reduce((a,r)=>a+r.costValue,0),totalProfit:items.reduce((a,r)=>a+r.profit,0),normalSaleCount:items.reduce((a,r)=>a+r.normalSaleCount,0),reversalCount:items.reduce((a,r)=>a+r.reversalCount,0),returnGrossValue:items.reduce((a,r)=>a+r.returnGrossValue,0),reversalAware:true});
}catch(error){next(error)}});

router.get("/sales-analysis/:productId",async(req,res,next)=>{try{
  const {companyId,from,to,storeId}=filters(req),productId=String(req.params.productId||"");
  const owned=await prisma.$queryRaw`SELECT "id","name" FROM "Product" WHERE "companyId"=${companyId} AND "id"=${productId} LIMIT 1`;
  if(!owned[0])return res.status(404).json({error:"Δεν βρέθηκε το είδος."});
  const rows=await prisma.$queryRaw`
    SELECT sa."id" AS "saleId",sa."occurredAt",sa."createdAt",sa."receiptNumber",sa."source",sa."transactionMode",sa."reversalKind",sa."originalSaleId",sl."quantity",sl."unitPrice",sl."discount",sl."vatRate",sl."lineTotal",
      s."name" AS "storeName",e."fullName" AS "operatorName",cu."name" AS "customerName",
      COALESCE(pc."unitCost",p."costPrice",0) AS "unitCost",pc."supplierName",
      COALESCE(pay."methods",'') AS "paymentMethods"
    FROM "SaleLine" sl
    JOIN "Sale" sa ON sa."id"=sl."saleId" AND sa."companyId"=${companyId} AND sa."status"='COMPLETED'
    JOIN "Product" p ON p."id"=sl."productId" AND p."companyId"=${companyId}
    JOIN "Store" s ON s."id"=sa."storeId" AND s."companyId"=${companyId}
    LEFT JOIN "Employee" e ON e."id"=sa."operatorEmployeeId"
    LEFT JOIN "Customer" cu ON cu."id"=sa."customerId"
    LEFT JOIN LATERAL (
      SELECT CASE WHEN pl."unit"='PACKAGE' THEN pl."unitCost"/NULLIF(pl."unitsPerPackage",0) ELSE pl."unitCost" END AS "unitCost",sup."name" AS "supplierName"
      FROM "PurchaseDocumentLine" pl JOIN "PurchaseDocument" pd ON pd."id"=pl."purchaseDocumentId" LEFT JOIN "Supplier" sup ON sup."id"=pd."supplierId"
      WHERE pd."companyId"=${companyId} AND pd."storeId"=sa."storeId" AND pd."status"='APPROVED' AND pl."productId"=p."id" AND pd."documentDate"<=sa."occurredAt"
      ORDER BY pd."documentDate" DESC,pd."createdAt" DESC LIMIT 1
    ) pc ON true
    LEFT JOIN LATERAL (
      SELECT string_agg(DISTINCT py."method",', ' ORDER BY py."method") AS "methods" FROM "Payment" py WHERE py."saleId"=sa."id"
    ) pay ON true
    WHERE sl."productId"=${productId} AND sa."occurredAt">=${from} AND sa."occurredAt"<${to} AND (${storeId}::text IS NULL OR sa."storeId"=${storeId})
    ORDER BY sa."occurredAt" DESC LIMIT 5000`;
  const items=rows.map(r=>{const quantity=n(r.quantity),lineTotal=n(r.lineTotal),vatRate=n(r.vatRate),netValue=vatRate?lineTotal/(1+vatRate/100):lineTotal,vatValue=lineTotal-netValue,unitCost=n(r.unitCost),costValue=quantity*unitCost,profit=netValue-costValue;return {...r,quantity,unitPrice:n(r.unitPrice),discount:n(r.discount),vatRate,lineTotal,netValue,vatValue,unitCost,costValue,profit,margin:netValue?profit/netValue*100:0,isReversal:r.source==="POS_REVERSAL"}});
  res.json({product:owned[0],items,count:items.length,reversalAware:true});
}catch(error){next(error)}});

export default router;
