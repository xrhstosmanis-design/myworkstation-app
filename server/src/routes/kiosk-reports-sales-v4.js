import {greeceDateInput,greeceRangeDate} from "../../../shared/greece-time.mjs";
import {Router} from "express";
import {prisma} from "../prisma.js";

import {optionalSalesCalendar,salesReportCalendar} from "../services/sales-report-calendar.js";
import {readSalesReportComparison} from "../services/sales-report-comparison.js";
import {readRecordedPayrollExpenseReport} from "../services/recorded-payroll-expense-report.js";

const router=Router();
const roles=new Set(["SUPER_ADMIN","OWNER","ADMIN","MANAGER"]);
const n=value=>Number(value||0);
const dayStart=value=>greeceRangeDate(value?String(value).slice(0,10):greeceDateInput(new Date(Date.now()-30*86400000)));
const dayEndExclusive=value=>new Date(greeceRangeDate(value?String(value).slice(0,10):greeceDateInput(),true).getTime()+1);
export const salesAnalysisFilters=req=>{const calendar=optionalSalesCalendar(req.query);const hourly=req.query.includeHourly;if(hourly!==undefined&&hourly!=="1")throw Object.assign(new Error("Μη έγκυρη επιλογή ωριαίας κίνησης."),{status:400});if(hourly==="1"&&(!calendar||!String(req.query.storeId||"").trim()))throw Object.assign(new Error("Η ωριαία κίνηση απαιτεί συγκεκριμένο κατάστημα και Ώρα Ελλάδας."),{status:400});return {...(hourly==="1"?{includeHourly:true}:{}),companyId:req.user.companyId,from:calendar?.from||dayStart(req.query.from),to:calendar?.to||dayEndExclusive(req.query.to),storeId:String(req.query.storeId||"")||null,q:String(req.query.q||"").trim()||null,calendar}};
const filters=salesAnalysisFilters;

router.use((req,res,next)=>{
  if(req.user?.tokenType==="STORE_OPERATOR"||!roles.has(req.user?.role))return res.status(403).json({error:"Η αναφορά πωλήσεων είναι διαθέσιμη μόνο σε Super Admin, Ιδιοκτήτη, Admin ή Manager."});
  next();
});


const hourlyFailure=()=>Object.assign(new Error("Δεν επιβεβαιώθηκε η πληρότητα της ωριαίας κίνησης."),{status:502});
const athensHourFormat=new Intl.DateTimeFormat("en-GB",{timeZone:"Europe/Athens",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit",hour12:false});
function validatedHourlyActivity(rows,{from,to,normalSaleCount,reversalCount}){
  // Equal product sort keys may be reordered by PostgreSQL. Exactly one row
  // carries the large payload; its position is not part of the contract.
  const carriers=rows.filter(r=>r._hourlyMetadata!=null),m=carriers[0]?._hourlyMetadata,integer=v=>Number.isSafeInteger(v)&&v>=0;
  if(m?.storeValid===false)throw Object.assign(new Error("Δεν βρέθηκε ενεργό κατάστημα."),{status:404});
  if(carriers.length!==1||!m||m.storeValid!==true||!integer(m.bucketCount)||m.bucketCount>8785||!integer(m.maxUnitCount)||m.maxUnitCount>32||!Array.isArray(m.hours)||m.hours.length!==m.bucketCount)throw hourlyFailure();
  let previous=-Infinity,normal=0,reversals=0,maxUnits=0;
  for(const h of m.hours){
    const start=Date.parse(h?.from),end=Date.parse(h?.toExclusive);
    if(!Number.isFinite(start)||new Date(start).toISOString()!==h.from||!Number.isFinite(end)||new Date(end).toISOString()!==h.toExclusive||start%3600000!==0||end!==start+3600000||start<from.getTime()||end>to.getTime()||start<=previous||!integer(h.normalSaleCount)||!integer(h.reversalCount)||h.normalSaleCount+h.reversalCount===0||!Array.isArray(h.quantities)||h.quantities.length===0||h.quantities.length>32)throw hourlyFailure();
    previous=start;normal+=h.normalSaleCount;reversals+=h.reversalCount;if(!integer(normal)||!integer(reversals))throw hourlyFailure();
    const parts=Object.fromEntries(athensHourFormat.formatToParts(new Date(start)).filter(p=>p.type!=="literal").map(p=>[p.type,p.value]));
    const local=`${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`;
    if(h.localStart!==local||!Number.isInteger(h.utcOffsetSeconds)||h.utcOffsetSeconds!==(Date.parse(local+"Z")-start)/1000)throw hourlyFailure();
    const units=new Set();maxUnits=Math.max(maxUnits,h.quantities.length);
    for(const quantity of h.quantities){
      if(!quantity||!(quantity.unit===null||(typeof quantity.unit==="string"&&quantity.unit.length<=128))||units.has(quantity.unit))throw hourlyFailure();
      units.add(quantity.unit);
      for(const key of ["normalQuantity","reversalQuantity","netQuantity"])if(typeof quantity[key]!=="number"||!Number.isFinite(quantity[key])||Math.abs(quantity[key])>Number.MAX_SAFE_INTEGER)throw hourlyFailure();
      const sum=quantity.normalQuantity+quantity.reversalQuantity;
      if(!Number.isFinite(sum)||Math.abs(sum-quantity.netQuantity)>1e-9*Math.max(1,Math.abs(sum),Math.abs(quantity.netQuantity)))throw hourlyFailure();
    }
  }
  if(normal!==normalSaleCount||reversals!==reversalCount||maxUnits!==m.maxUnitCount)throw hourlyFailure();
  return {complete:true,totalsScope:"COMPLETE_FILTERED_SOURCE",bucketBasis:"UTC_HOUR",timeZone:"Europe/Athens",from:from.toISOString(),toExclusive:to.toISOString(),normalSaleCount,reversalCount,hours:m.hours};
}

// One calculation serves the normal report and the separately authorized assistants.
export async function readSalesAnalysisReport({companyId,from,to,storeId,q,calendar,productIds=null,promotionsOnly=false,observedThrough=null,includeHourly=false},{db=prisma}={}){
  if(includeHourly){
    if(includeHourly!==true||!storeId||typeof storeId!=="string"||!storeId.trim()||calendar?.timeZone!=="Europe/Athens")throw Object.assign(new Error("Η ωριαία κίνηση απαιτεί συγκεκριμένο κατάστημα και Ώρα Ελλάδας."),{status:400});
    const checked=salesReportCalendar(calendar.calendarFrom,calendar.calendarTo);
    if(!(from instanceof Date)||!(to instanceof Date)||from.getTime()!==checked.from.getTime()||to.getTime()!==checked.to.getTime())throw Object.assign(new Error("Δεν συμφωνούν τα όρια της ωριαίας αναφοράς."),{status:400});
  }
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
    ), hourly_units AS (
      SELECT date_trunc('hour',"occurredAt") AS bucket,"unit",
        COALESCE(SUM("quantity") FILTER(WHERE COALESCE("source",'')<>'POS_REVERSAL'),0) AS "normalQuantity",
        COALESCE(SUM("quantity") FILTER(WHERE "source"='POS_REVERSAL'),0) AS "reversalQuantity",SUM("quantity") AS "netQuantity"
      FROM base WHERE ${includeHourly} GROUP BY bucket,"unit"
    ), hourly_unit_sized AS (
      SELECT *,COUNT(*) OVER(PARTITION BY bucket)::int AS "unitCount" FROM hourly_units
    ), hourly_unit_groups AS (
      SELECT bucket,MAX("unitCount")::int AS "unitCount",jsonb_agg(jsonb_build_object(
        'unit',"unit",'normalQuantity',"normalQuantity",'reversalQuantity',"reversalQuantity",'netQuantity',"netQuantity") ORDER BY "unit" NULLS FIRST) FILTER(WHERE "unitCount"<=32) AS quantities
      FROM hourly_unit_sized GROUP BY bucket
    ), hourly_counts AS (
      SELECT date_trunc('hour',"occurredAt") AS bucket,
        COUNT(DISTINCT "saleId") FILTER(WHERE COALESCE("source",'')<>'POS_REVERSAL')::int AS "normalSaleCount",
        COUNT(DISTINCT "saleId") FILTER(WHERE "source"='POS_REVERSAL')::int AS "reversalCount"
      FROM base WHERE ${includeHourly} GROUP BY bucket
    ), hourly_sized AS (
      SELECT h.*,u.quantities,u."unitCount",COUNT(*) OVER()::int AS "bucketCount",MAX(u."unitCount") OVER()::int AS "maxUnitCount"
      FROM hourly_counts h JOIN hourly_unit_groups u USING(bucket)
    ), hourly_meta AS (
      SELECT COUNT(*)::int AS "_hourlyBucketCount",COALESCE(MAX(h."unitCount"),0)::int AS "_hourlyMaxUnitCount",
        COALESCE(jsonb_agg(jsonb_build_object(
          'from',to_char(h.bucket,'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
          'toExclusive',to_char(h.bucket+interval '1 hour','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
          'localStart',to_char((h.bucket AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Athens','YYYY-MM-DD"T"HH24:MI:SS'),
          'utcOffsetSeconds',EXTRACT(EPOCH FROM (((h.bucket AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Athens')-h.bucket))::int,
          'normalSaleCount',h."normalSaleCount",'reversalCount',h."reversalCount",'quantities',h.quantities) ORDER BY h.bucket) FILTER(WHERE h."bucketCount"<=8785 AND h."maxUnitCount"<=32),'[]'::jsonb) AS "_hourlyHours",
        CASE WHEN ${includeHourly} THEN EXISTS(SELECT 1 FROM "Store" owned WHERE owned."id"=${storeId} AND owned."companyId"=${companyId} AND to_jsonb(owned)->>'active'='true') END AS "_hourlyStoreValid"
      FROM hourly_sized h
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
    SELECT limited.*,source_counts.*,group_counts."_totalGroupCount",
      CASE WHEN ${includeHourly} AND ROW_NUMBER() OVER(ORDER BY limited."grossSales" DESC,limited."name" ASC)=1 THEN
        jsonb_build_object('storeValid',hourly_meta."_hourlyStoreValid",'bucketCount',hourly_meta."_hourlyBucketCount",'maxUnitCount',hourly_meta."_hourlyMaxUnitCount",'hours',hourly_meta."_hourlyHours") END AS "_hourlyMetadata"
    FROM source_counts CROSS JOIN (SELECT COUNT(*)::int AS "_totalGroupCount" FROM grouped) group_counts CROSS JOIN hourly_meta
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
  const hourlyActivity=includeHourly?validatedHourlyActivity(rows,{from,to,normalSaleCount:metadata._overallNormalSaleCount,reversalCount:metadata._overallReversalCount}):null;
  const items=groups.map(({_hourlyMetadata,_hasGroup,_totalGroupCount,_overallNormalSaleCount,_overallReversalCount,...r})=>{
    const grossSales=n(r.grossSales),netSales=n(r.netSales),vatValue=n(r.vatValue),costValue=n(r.costValue),profit=netSales-costValue,salesQuantity=n(r.salesQuantity);
    return {...r,currentStock:n(r.currentStock),salesQuantity,grossSales,netSales,vatValue,costValue,profit,margin:netSales?profit/netSales*100:0,averageGrossPrice:salesQuantity?grossSales/salesQuantity:0,discountValue:n(r.discountValue),normalSaleCount:n(r.normalSaleCount),reversalCount:n(r.reversalCount),returnGrossValue:n(r.returnGrossValue)};
  });
  return {...(includeHourly?{hourlyActivity}:{}),unattributedPromotionReversal,sourceCoverage,...(calendar?{companyId,storeId,period:{calendarFrom:calendar.calendarFrom,calendarTo:calendar.calendarTo,timeZone:calendar.timeZone,from:from.toISOString(),toExclusive:to.toISOString()}}:{}),items,count:items.length,totalQuantity:items.reduce((a,r)=>a+r.salesQuantity,0),totalGross:items.reduce((a,r)=>a+r.grossSales,0),totalNet:items.reduce((a,r)=>a+r.netSales,0),totalVat:items.reduce((a,r)=>a+r.vatValue,0),totalCost:items.reduce((a,r)=>a+r.costValue,0),totalProfit:items.reduce((a,r)=>a+r.profit,0),normalSaleCount:metadata._overallNormalSaleCount,reversalCount:metadata._overallReversalCount,returnGrossValue:items.reduce((a,r)=>a+r.returnGrossValue,0),reversalAware:true};
}
// The existing inventory mount still applies. Payroll adds a narrower role and
// personnel-package boundary inside its read-only snapshot; no writer is used.
router.get("/recorded-payroll-expenses",async(req,res,next)=>{try{
  res.set("Cache-Control","no-store");
  if(Object.keys(req.query).some(key=>!["storeId","from","to","timeZone"].includes(key)))throw Object.assign(new Error("Μη έγκυρα φίλτρα αναφοράς εξόδων."),{status:400});
  res.json(await readRecordedPayrollExpenseReport({user:req.user,storeId:req.query.storeId,from:req.query.from,to:req.query.to,timeZone:req.query.timeZone},{db:prisma}));
}catch(error){next(error)}});

router.get("/sales-analysis",async(req,res,next)=>{try{
  const selected=filters(req),comparison=req.query.compareFrom!==undefined||req.query.compareTo!==undefined;
  res.json(comparison?await readSalesReportComparison({...selected,compareFrom:req.query.compareFrom,compareTo:req.query.compareTo},{db:prisma,readReport:readSalesAnalysisReport}):await readSalesAnalysisReport(selected));
}catch(error){next(error)}});

router.get("/sales-analysis/:productId",async(req,res,next)=>{try{
  if(req.query.compareFrom!==undefined||req.query.compareTo!==undefined)throw Object.assign(new Error("Η σύγκριση περιόδων διατίθεται μόνο στη συνολική αναφορά πωλήσεων."),{status:400});
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

