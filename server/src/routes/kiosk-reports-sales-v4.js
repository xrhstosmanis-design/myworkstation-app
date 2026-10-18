import {greeceDateInput,greeceRangeDate} from "../../../shared/greece-time.mjs";
import {Router} from "express";
import {prisma} from "../prisma.js";

import {optionalSalesCalendar} from "../services/sales-report-calendar.js";

const router=Router();
const roles=new Set(["SUPER_ADMIN","OWNER","ADMIN","MANAGER"]);
const n=value=>Number(value||0);
const dayStart=value=>greeceRangeDate(value?String(value).slice(0,10):greeceDateInput(new Date(Date.now()-30*86400000)));
const dayEndExclusive=value=>new Date(greeceRangeDate(value?String(value).slice(0,10):greeceDateInput(),true).getTime()+1);
export const salesAnalysisFilters=req=>{const calendar=optionalSalesCalendar(req.query);return {companyId:req.user.companyId,from:calendar?.from||dayStart(req.query.from),to:calendar?.to||dayEndExclusive(req.query.to),storeId:String(req.query.storeId||"")||null,q:String(req.query.q||"").trim()||null,calendar}};
const filters=salesAnalysisFilters;

router.use((req,res,next)=>{
  if(req.user?.tokenType==="STORE_OPERATOR"||!roles.has(req.user?.role))return res.status(403).json({error:"Η αναφορά πωλήσεων είναι διαθέσιμη μόνο σε Super Admin, Ιδιοκτήτη, Admin ή Manager."});
  next();
});

// One calculation serves the normal report and the separately authorized assistants.
export async function readSalesAnalysisReport({companyId,from,to,storeId,q,calendar,productIds=null,promotionsOnly=false,observedThrough=null},{db=prisma}={}){
  const text=q?`%${q}%`:null;
  let unattributedPromotionReversal=false;
  if(promotionsOnly){
    const missing=await db.$queryRaw`SELECT COUNT(*)::int AS "missingCount" FROM "Sale" sa JOIN "SaleLine" sl ON sl."saleId"=sa."id"
      WHERE sa."companyId"=${companyId} AND sa."storeId"=${storeId} AND sa."status"='COMPLETED' AND sa."source"='POS_REVERSAL'
        AND sa."occurredAt">=${from} AND sa."occurredAt"<${to} AND (${observedThrough}::timestamp IS NULL OR sa."occurredAt"<=${observedThrough})
        AND sl."promotionId" IS NULL AND EXISTS(SELECT 1 FROM "SaleLine" original WHERE original."saleId"=sa."originalSaleId" AND original."promotionId" IS NOT NULL
          AND (original."productId"=sl."productId" OR original."productId" IS NULL OR sl."productId" IS NULL))`;
    if(!Number.isInteger(missing[0]?.missingCount)||missing[0].missingCount<0)throw Object.assign(new Error("Δεν επιβεβαιώθηκε η σύνδεση επιστροφών προσφοράς."),{status:502});
    unattributedPromotionReversal=missing[0].missingCount>0;
  }
  const rows=await db.$queryRaw`
    WITH base AS (
      SELECT sa."id" AS "saleId",sa."storeId",sa."occurredAt",sa."source",sl."productId",sl."description",sl."quantity",sl."unitPrice",sl."discount",sl."vatRate",sl."lineTotal",
        p."sku",p."unit",COALESCE(p."name",sl."description") AS "name",c."name" AS "categoryName",mp."subcategoryName",s."name" AS "storeName",
        CASE WHEN ${promotionsOnly} THEN sl."promotionId" END AS "promotionId",
        CASE WHEN ${promotionsOnly} THEN sl."promotionType" END AS "promotionType",
        CASE WHEN ${promotionsOnly} THEN to_jsonb(promo)->>'name' END AS "promotionName",
        COALESCE(sp."currentStock",0) AS "currentStock",
        COALESCE(pc."unitCost",p."costPrice",0) AS "unitCost",
        pc."supplierName"
      FROM "SaleLine" sl
      JOIN "Sale" sa ON sa."id"=sl."saleId" AND sa."companyId"=${companyId} AND sa."status"='COMPLETED' AND COALESCE(sa."transactionMode",'NORMAL')<>'CREDIT'
      JOIN "Store" s ON s."id"=sa."storeId" AND s."companyId"=${companyId}
      LEFT JOIN "Product" p ON p."id"=sl."productId" AND p."companyId"=${companyId}
      LEFT JOIN "ProductCategory" c ON c."id"=p."categoryId"
      LEFT JOIN "MasterProduct" mp ON mp."id"=p."masterProductId"
      LEFT JOIN "PriceCatalogPromotion" promo ON ${promotionsOnly} AND promo."id"=sl."promotionId" AND promo."companyId"=sa."companyId"
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
        AND (${observedThrough}::timestamp IS NULL OR sa."occurredAt"<=${observedThrough})
        AND (${storeId}::text IS NULL OR sa."storeId"=${storeId})
        AND (${productIds}::text[] IS NULL OR sl."productId"=ANY(${productIds}::text[]))
        AND (${promotionsOnly}=FALSE OR sl."promotionId" IS NOT NULL)
        AND (${text}::text IS NULL OR COALESCE(p."name",sl."description") ILIKE ${text} OR COALESCE(p."sku",'') ILIKE ${text})
    ), source_counts AS (
      SELECT COUNT(DISTINCT "saleId") FILTER (WHERE COALESCE("source",'')<>'POS_REVERSAL')::int AS "_overallNormalSaleCount",
        COUNT(DISTINCT "saleId") FILTER (WHERE "source"='POS_REVERSAL')::int AS "_overallReversalCount" FROM base
    ), grouped AS (
    SELECT "productId","sku","name","unit","categoryName","subcategoryName","storeId","storeName","promotionId","promotionType","promotionName",MAX("currentStock") AS "currentStock",
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
    GROUP BY "productId","sku","name","unit","categoryName","subcategoryName","storeId","storeName","promotionId","promotionType","promotionName"
    ), limited AS (
      SELECT *,true AS "_hasGroup" FROM grouped ORDER BY "grossSales" DESC,"name" ASC LIMIT 10000
    )
    SELECT limited.*,source_counts.*,group_counts."_totalGroupCount"
    FROM source_counts CROSS JOIN (SELECT COUNT(*)::int AS "_totalGroupCount" FROM grouped) group_counts
    LEFT JOIN limited ON true ORDER BY limited."grossSales" DESC,limited."name" ASC`;
  // Counts and coverage belong to the same filtered SQL snapshot, including
  // the empty-source sentinel. Never reconstruct unique baskets by summing groups.
  const metadata=rows[0],integers=["_totalGroupCount","_overallNormalSaleCount","_overallReversalCount"];
  const invalidSource=()=>Object.assign(new Error("Δεν επιβεβαιώθηκε η πληρότητα της αναφοράς πωλήσεων."),{status:502});
  if(!metadata||integers.some(key=>!Number.isSafeInteger(metadata[key])||metadata[key]<0))throw invalidSource();
  if(rows.some(row=>integers.some(key=>row[key]!==metadata[key])))throw invalidSource();
  const groups=rows.filter(row=>row._hasGroup===true),totalGroupCount=metadata._totalGroupCount,limit=10000;
  if(groups.length!==Math.min(totalGroupCount,limit)||rows.length!==(groups.length||1)||
    (totalGroupCount===0&&(metadata._hasGroup!=null||metadata._overallNormalSaleCount!==0||metadata._overallReversalCount!==0)))throw invalidSource();
  const complete=groups.length===totalGroupCount;
  const sourceCoverage={complete,returnedGroupCount:groups.length,totalGroupCount,limit,totalsScope:complete?"COMPLETE_SOURCE":"RETURNED_GROUPS"};
  const items=groups.map(({_hasGroup,_totalGroupCount,_overallNormalSaleCount,_overallReversalCount,...r})=>{
    const grossSales=n(r.grossSales),netSales=n(r.netSales),vatValue=n(r.vatValue),costValue=n(r.costValue),profit=netSales-costValue,salesQuantity=n(r.salesQuantity);
    return {...r,currentStock:n(r.currentStock),salesQuantity,grossSales,netSales,vatValue,costValue,profit,margin:netSales?profit/netSales*100:0,averageGrossPrice:salesQuantity?grossSales/salesQuantity:0,discountValue:n(r.discountValue),normalSaleCount:n(r.normalSaleCount),reversalCount:n(r.reversalCount),returnGrossValue:n(r.returnGrossValue)};
  });
  return {unattributedPromotionReversal,sourceCoverage,...(calendar?{companyId,storeId,period:{calendarFrom:calendar.calendarFrom,calendarTo:calendar.calendarTo,timeZone:calendar.timeZone,from:from.toISOString(),toExclusive:to.toISOString()}}:{}),items,count:items.length,totalQuantity:items.reduce((a,r)=>a+r.salesQuantity,0),totalGross:items.reduce((a,r)=>a+r.grossSales,0),totalNet:items.reduce((a,r)=>a+r.netSales,0),totalVat:items.reduce((a,r)=>a+r.vatValue,0),totalCost:items.reduce((a,r)=>a+r.costValue,0),totalProfit:items.reduce((a,r)=>a+r.profit,0),normalSaleCount:metadata._overallNormalSaleCount,reversalCount:metadata._overallReversalCount,returnGrossValue:items.reduce((a,r)=>a+r.returnGrossValue,0),reversalAware:true};
}
router.get("/sales-analysis",async(req,res,next)=>{try{res.json(await readSalesAnalysisReport(filters(req)))}catch(error){next(error)}});

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
    JOIN "Sale" sa ON sa."id"=sl."saleId" AND sa."companyId"=${companyId} AND sa."status"='COMPLETED' AND COALESCE(sa."transactionMode",'NORMAL')<>'CREDIT'
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
