import {Router} from "express";
import {prisma} from "../prisma.js";

const router=Router();
const roles=new Set(["SUPER_ADMIN","OWNER","ADMIN","MANAGER"]);
const n=value=>Number(value||0);

function requireAccess(req,res,next){
  if(req.user?.tokenType==="STORE_OPERATOR"||!roles.has(req.user?.role))return res.status(403).json({error:"Οι Αναφορές είναι διαθέσιμες μόνο σε Super Admin, Ιδιοκτήτη, Admin ή Manager."});
  next();
}
router.use(requireAccess);

const dayStart=value=>{const d=value?new Date(`${String(value).slice(0,10)}T00:00:00`):new Date(Date.now()-30*86400000);return Number.isNaN(d.getTime())?new Date(Date.now()-30*86400000):d};
const dayEndExclusive=value=>{const d=value?new Date(`${String(value).slice(0,10)}T00:00:00`):new Date();if(Number.isNaN(d.getTime()))return new Date(Date.now()+86400000);d.setDate(d.getDate()+1);return d};
const filters=req=>({companyId:req.user.companyId,from:dayStart(req.query.from),to:dayEndExclusive(req.query.to),storeId:String(req.query.storeId||"")||null,q:String(req.query.q||"").trim()||null});

router.get("/lookups",async(req,res,next)=>{try{
  const stores=await prisma.store.findMany({where:{companyId:req.user.companyId,active:true},select:{id:true,name:true},orderBy:{name:"asc"}});
  res.json({stores});
}catch(error){next(error)}});

router.get("/destructions",async(req,res,next)=>{try{
  const {companyId,from,to,storeId,q}=filters(req),text=q?`%${q}%`:null;
  const rows=await prisma.$queryRaw`
    SELECT sm."id",sm."createdAt",sm."note",sm."sourceType",sm."sourceId",ABS(sm."quantity") AS "quantity",
      p."id" AS "productId",p."sku",p."name",p."salePrice",p."vatRate",p."unit",
      c."name" AS "categoryName",mp."subcategoryName",s."id" AS "storeId",s."name" AS "storeName",
      u."fullName" AS "operatorName",
      COALESCE(sm."unitCost",lp."unitCost",p."costPrice",0) AS "purchasePrice",
      ABS(sm."quantity")*COALESCE(sm."unitCost",lp."unitCost",p."costPrice",0) AS "purchaseTotal",
      lp."supplierName",lp."documentDate" AS "purchaseDate"
    FROM "StockMovement" sm
    JOIN "Store" s ON s."id"=sm."storeId" AND s."companyId"=${companyId}
    JOIN "Product" p ON p."id"=sm."productId" AND p."companyId"=${companyId}
    LEFT JOIN "ProductCategory" c ON c."id"=p."categoryId"
    LEFT JOIN "MasterProduct" mp ON mp."id"=p."masterProductId"
    LEFT JOIN "User" u ON u."id"=sm."createdByUserId"
    LEFT JOIN LATERAL (
      SELECT CASE WHEN l."unit"='PACKAGE' THEN l."unitCost"/NULLIF(l."unitsPerPackage",0) ELSE l."unitCost" END AS "unitCost",
        d."documentDate",sup."name" AS "supplierName"
      FROM "PurchaseDocumentLine" l JOIN "PurchaseDocument" d ON d."id"=l."purchaseDocumentId"
      LEFT JOIN "Supplier" sup ON sup."id"=d."supplierId"
      WHERE d."companyId"=${companyId} AND d."status"='APPROVED' AND l."productId"=p."id" AND d."documentDate"<=sm."createdAt"
      ORDER BY d."documentDate" DESC,d."createdAt" DESC LIMIT 1
    ) lp ON true
    WHERE sm."movementType"='WASTE' AND sm."createdAt">=${from} AND sm."createdAt"<${to}
      AND (${storeId}::text IS NULL OR sm."storeId"=${storeId})
      AND (${text}::text IS NULL OR p."name" ILIKE ${text} OR COALESCE(p."sku",'') ILIKE ${text})
    ORDER BY sm."createdAt" DESC LIMIT 5000`;
  const items=rows.map(r=>({...r,quantity:n(r.quantity),salePrice:n(r.salePrice),vatRate:n(r.vatRate),purchasePrice:n(r.purchasePrice),purchaseTotal:n(r.purchaseTotal)}));
  res.json({items,count:items.length,totalQuantity:items.reduce((a,r)=>a+r.quantity,0),totalPurchase:items.reduce((a,r)=>a+r.purchaseTotal,0)});
}catch(error){next(error)}});

router.get("/price-changes",async(req,res,next)=>{try{
  const {companyId,from,to,storeId,q}=filters(req),text=q?`%${q}%`:null;
  const rows=await prisma.$queryRaw`
    SELECT h."id",h."createdAt",h."oldPrice",h."newPrice",h."changeType",h."storeId",p."id" AS "productId",p."sku",p."name",
      c."name" AS "categoryName",mp."subcategoryName",COALESCE(h."createdByName",u."fullName") AS "operatorName",s."name" AS "storeName",
      COALESCE((SELECT pb."barcode" FROM "ProductBarcode" pb WHERE pb."productId"=p."id" ORDER BY pb."createdAt" LIMIT 1),'') AS "barcode"
    FROM "ProductPriceHistory" h JOIN "Product" p ON p."id"=h."productId" AND p."companyId"=h."companyId"
    LEFT JOIN "ProductCategory" c ON c."id"=p."categoryId" LEFT JOIN "MasterProduct" mp ON mp."id"=p."masterProductId"
    LEFT JOIN "User" u ON u."id"=h."createdByUserId" LEFT JOIN "Store" s ON s."id"=h."storeId"
    WHERE h."companyId"=${companyId} AND h."createdAt">=${from} AND h."createdAt"<${to}
      AND (${storeId}::text IS NULL OR h."storeId"=${storeId} OR h."storeId" IS NULL)
      AND (${text}::text IS NULL OR p."name" ILIKE ${text} OR COALESCE(p."sku",'') ILIKE ${text})
    ORDER BY h."createdAt" DESC LIMIT 5000`;
  res.json({items:rows.map(r=>({...r,oldPrice:n(r.oldPrice),newPrice:n(r.newPrice)})),purchasePriceChangesAvailable:false});
}catch(error){next(error)}});

router.get("/movements",async(req,res,next)=>{try{
  const {companyId,from,to,storeId,q}=filters(req),text=q?`%${q}%`:null;
  const rows=await prisma.$queryRaw`
    SELECT sm."id",sm."createdAt",sm."movementType",sm."quantity",sm."unitCost",sm."sourceType",sm."sourceId",sm."note",
      p."id" AS "productId",p."sku",p."name",p."salePrice",p."unit",c."name" AS "categoryName",mp."subcategoryName",
      s."name" AS "storeName",u."fullName" AS "operatorName"
    FROM "StockMovement" sm JOIN "Store" s ON s."id"=sm."storeId" AND s."companyId"=${companyId}
    JOIN "Product" p ON p."id"=sm."productId" AND p."companyId"=${companyId}
    LEFT JOIN "ProductCategory" c ON c."id"=p."categoryId" LEFT JOIN "MasterProduct" mp ON mp."id"=p."masterProductId"
    LEFT JOIN "User" u ON u."id"=sm."createdByUserId"
    WHERE sm."createdAt">=${from} AND sm."createdAt"<${to} AND (${storeId}::text IS NULL OR sm."storeId"=${storeId})
      AND (${text}::text IS NULL OR p."name" ILIKE ${text} OR COALESCE(p."sku",'') ILIKE ${text})
    ORDER BY sm."createdAt" DESC LIMIT 10000`;
  res.json({items:rows.map(r=>({...r,quantity:n(r.quantity),unitCost:n(r.unitCost),salePrice:n(r.salePrice),inQty:n(r.quantity)>0?n(r.quantity):0,outQty:n(r.quantity)<0?Math.abs(n(r.quantity)):0}))});
}catch(error){next(error)}});

router.get("/stocktakes",async(req,res,next)=>{try{
  const {companyId,from,to,storeId,q}=filters(req),text=q?`%${q}%`:null;
  const rows=await prisma.$queryRaw`
    SELECT st."id" AS "stocktakeId",st."name" AS "stocktakeName",st."status",st."startedAt",st."finalizedAt",sl."id",sl."expectedQuantity",sl."countedQuantity",sl."unitCost",sl."countedAt",
      p."id" AS "productId",p."sku",p."name",p."salePrice",p."unit",c."name" AS "categoryName",mp."subcategoryName",s."name" AS "storeName",u."fullName" AS "operatorName"
    FROM "StocktakeLine" sl JOIN "Stocktake" st ON st."id"=sl."stocktakeId" AND st."companyId"=${companyId}
    JOIN "Store" s ON s."id"=st."storeId" JOIN "Product" p ON p."id"=sl."productId" AND p."companyId"=${companyId}
    LEFT JOIN "ProductCategory" c ON c."id"=p."categoryId" LEFT JOIN "MasterProduct" mp ON mp."id"=p."masterProductId" LEFT JOIN "User" u ON u."id"=sl."countedByUserId"
    WHERE st."startedAt">=${from} AND st."startedAt"<${to} AND (${storeId}::text IS NULL OR st."storeId"=${storeId})
      AND (${text}::text IS NULL OR p."name" ILIKE ${text} OR COALESCE(p."sku",'') ILIKE ${text})
    ORDER BY st."startedAt" DESC,p."name" LIMIT 10000`;
  const items=rows.map(r=>{const expected=n(r.expectedQuantity),counted=r.countedQuantity===null?null:n(r.countedQuantity),unitCost=n(r.unitCost),difference=counted===null?null:counted-expected;return {...r,expectedQuantity:expected,countedQuantity:counted,unitCost,difference,differenceValue:difference===null?null:difference*unitCost}});
  res.json({items,count:items.length,totalDifferenceValue:items.reduce((a,r)=>a+n(r.differenceValue),0)});
}catch(error){next(error)}});

router.get("/stock-snapshot",async(req,res,next)=>{try{
  const {companyId,to,storeId,q}=filters(req),text=q?`%${q}%`:null;
  const snapshotAt=new Date(to.getTime()-1);
  const rows=await prisma.$queryRaw`
    WITH qty AS (
      SELECT sm."storeId",sm."productId",SUM(sm."quantity") AS "quantity"
      FROM "StockMovement" sm JOIN "Store" sx ON sx."id"=sm."storeId" AND sx."companyId"=${companyId}
      WHERE sm."createdAt"<=${snapshotAt} AND (${storeId}::text IS NULL OR sm."storeId"=${storeId}) GROUP BY sm."storeId",sm."productId"
    )
    SELECT p."id" AS "productId",p."sku",p."name",p."salePrice",p."vatRate",p."unit",p."costPrice",c."name" AS "categoryName",mp."subcategoryName",
      s."id" AS "storeId",s."name" AS "storeName",COALESCE(qty."quantity",0) AS "quantity",
      COALESCE(lp."unitCost",p."costPrice",0) AS "purchasePrice",lp."supplierName",lp."documentDate" AS "lastPurchaseAt"
    FROM "Product" p CROSS JOIN "Store" s
    LEFT JOIN qty ON qty."productId"=p."id" AND qty."storeId"=s."id"
    LEFT JOIN "ProductCategory" c ON c."id"=p."categoryId" LEFT JOIN "MasterProduct" mp ON mp."id"=p."masterProductId"
    LEFT JOIN LATERAL (
      SELECT CASE WHEN l."unit"='PACKAGE' THEN l."unitCost"/NULLIF(l."unitsPerPackage",0) ELSE l."unitCost" END AS "unitCost",d."documentDate",sup."name" AS "supplierName"
      FROM "PurchaseDocumentLine" l JOIN "PurchaseDocument" d ON d."id"=l."purchaseDocumentId" LEFT JOIN "Supplier" sup ON sup."id"=d."supplierId"
      WHERE d."companyId"=${companyId} AND d."status"='APPROVED' AND l."productId"=p."id" AND d."documentDate"<=${snapshotAt}
      ORDER BY d."documentDate" DESC,d."createdAt" DESC LIMIT 1
    ) lp ON true
    WHERE p."companyId"=${companyId} AND s."companyId"=${companyId} AND (${storeId}::text IS NULL OR s."id"=${storeId})
      AND (${text}::text IS NULL OR p."name" ILIKE ${text} OR COALESCE(p."sku",'') ILIKE ${text})
    ORDER BY p."name",s."name" LIMIT 10000`;
  const items=rows.map(r=>{const quantity=n(r.quantity),salePrice=n(r.salePrice),purchasePrice=n(r.purchasePrice),vatRate=n(r.vatRate),saleNet=salePrice/(1+vatRate/100);return {...r,quantity,salePrice,purchasePrice,saleValue:quantity*salePrice,costValue:quantity*purchasePrice,marginNet:saleNet?((saleNet-purchasePrice)/saleNet)*100:0}});
  res.json({snapshotAt,items,count:items.length,totalSaleValue:items.reduce((a,r)=>a+r.saleValue,0),totalCostValue:items.reduce((a,r)=>a+r.costValue,0),ledgerBased:true});
}catch(error){next(error)}});

router.get("/stock-stats",async(req,res,next)=>{try{
  const {companyId,from,to,storeId,q}=filters(req),text=q?`%${q}%`:null;
  const rows=await prisma.$queryRaw`
    SELECT p."id" AS "productId",p."sku",p."name",p."salePrice",p."unit",c."name" AS "categoryName",mp."subcategoryName",s."name" AS "storeName",sp."currentStock",
      COALESCE(SUM(CASE WHEN sa."occurredAt">=${from} AND sa."occurredAt"<${to} AND sa."status"='COMPLETED' THEN sl."quantity" ELSE 0 END),0) AS "salesQuantity",
      MAX(CASE WHEN sa."status"='COMPLETED' THEN sa."occurredAt" END) AS "lastSaleAt",
      lp."documentDate" AS "lastPurchaseAt",COALESCE(lp."unitCost",p."costPrice",0) AS "purchasePrice",lp."supplierName"
    FROM "StoreProduct" sp JOIN "Store" s ON s."id"=sp."storeId" AND s."companyId"=${companyId}
    JOIN "Product" p ON p."id"=sp."productId" AND p."companyId"=${companyId}
    LEFT JOIN "ProductCategory" c ON c."id"=p."categoryId" LEFT JOIN "MasterProduct" mp ON mp."id"=p."masterProductId"
    LEFT JOIN "SaleLine" sl ON sl."productId"=p."id" LEFT JOIN "Sale" sa ON sa."id"=sl."saleId" AND sa."storeId"=sp."storeId"
    LEFT JOIN LATERAL (
      SELECT CASE WHEN l."unit"='PACKAGE' THEN l."unitCost"/NULLIF(l."unitsPerPackage",0) ELSE l."unitCost" END AS "unitCost",d."documentDate",sup."name" AS "supplierName"
      FROM "PurchaseDocumentLine" l JOIN "PurchaseDocument" d ON d."id"=l."purchaseDocumentId" LEFT JOIN "Supplier" sup ON sup."id"=d."supplierId"
      WHERE d."companyId"=${companyId} AND d."status"='APPROVED' AND d."storeId"=sp."storeId" AND l."productId"=p."id"
      ORDER BY d."documentDate" DESC,d."createdAt" DESC LIMIT 1
    ) lp ON true
    WHERE sp."active"=true AND p."active"=true AND (${storeId}::text IS NULL OR sp."storeId"=${storeId})
      AND (${text}::text IS NULL OR p."name" ILIKE ${text} OR COALESCE(p."sku",'') ILIKE ${text})
    GROUP BY p."id",p."sku",p."name",p."salePrice",p."unit",c."name",mp."subcategoryName",s."name",sp."currentStock",lp."documentDate",lp."unitCost",lp."supplierName",p."costPrice"
    ORDER BY "salesQuantity" ASC,ABS(sp."currentStock") DESC,p."name" LIMIT 10000`;
  const items=rows.map(r=>({...r,currentStock:n(r.currentStock),salesQuantity:n(r.salesQuantity),salePrice:n(r.salePrice),purchasePrice:n(r.purchasePrice),currentSaleValue:n(r.currentStock)*n(r.salePrice),currentCostValue:n(r.currentStock)*n(r.purchasePrice)}));
  res.json({items,count:items.length});
}catch(error){next(error)}});

router.get("/departments",async(req,res,next)=>{try{
  const {companyId,from,to,storeId}=filters(req);
  const rows=await prisma.$queryRaw`
    SELECT sl."vatRate",COALESCE(c."name",'ΧΩΡΙΣ ΚΑΤΗΓΟΡΙΑ') AS "categoryName",SUM(sl."lineTotal") AS "grossValue",SUM(sl."lineTotal"/(1+sl."vatRate"/100)) AS "netValue",
      SUM(sl."lineTotal"-sl."lineTotal"/(1+sl."vatRate"/100)) AS "vatValue",SUM(sl."quantity") AS "quantity"
    FROM "SaleLine" sl JOIN "Sale" sa ON sa."id"=sl."saleId" AND sa."companyId"=${companyId} JOIN "Store" s ON s."id"=sa."storeId"
    LEFT JOIN "Product" p ON p."id"=sl."productId" LEFT JOIN "ProductCategory" c ON c."id"=p."categoryId"
    WHERE sa."status"='COMPLETED' AND sa."occurredAt">=${from} AND sa."occurredAt"<${to} AND (${storeId}::text IS NULL OR sa."storeId"=${storeId})
    GROUP BY sl."vatRate",c."name" ORDER BY sl."vatRate",c."name"`;
  res.json({items:rows.map(r=>({...r,vatRate:n(r.vatRate),grossValue:n(r.grossValue),netValue:n(r.netValue),vatValue:n(r.vatValue),quantity:n(r.quantity)})),fiscal:false,note:"Διοικητική αναφορά από τις πραγματικές πωλήσεις MyWorkStation. Δεν αποτελεί φορολογικό Ζ."});
}catch(error){next(error)}});

router.get("/documents",async(req,res,next)=>{try{
  const {companyId,from,to,storeId,q}=filters(req),text=q?`%${q}%`:null;
  const purchases=await prisma.$queryRaw`
    SELECT d."id",'PURCHASE' AS "kind",d."documentType" AS "documentType",d."documentNumber",d."documentDate" AS "date",d."totalNet",d."totalVat",d."totalGross",d."status",d."sourceType",s."name" AS "storeName",sup."name" AS "partyName",sup."taxId" AS "taxId"
    FROM "PurchaseDocument" d JOIN "Store" s ON s."id"=d."storeId" LEFT JOIN "Supplier" sup ON sup."id"=d."supplierId"
    WHERE d."companyId"=${companyId} AND d."documentDate">=${from} AND d."documentDate"<${to} AND (${storeId}::text IS NULL OR d."storeId"=${storeId})
      AND (${text}::text IS NULL OR COALESCE(d."documentNumber",'') ILIKE ${text} OR COALESCE(sup."name",'') ILIKE ${text}) ORDER BY d."documentDate" DESC LIMIT 5000`;
  const sales=await prisma.$queryRaw`
    SELECT sa."id",'SALE' AS "kind",'NON_FISCAL_SALE' AS "documentType",sa."receiptNumber" AS "documentNumber",sa."occurredAt" AS "date",sa."subtotal" AS "totalNet",0::numeric AS "totalVat",sa."total" AS "totalGross",sa."status",sa."source" AS "sourceType",s."name" AS "storeName",c."name" AS "partyName",c."taxId"
    FROM "Sale" sa JOIN "Store" s ON s."id"=sa."storeId" LEFT JOIN "Customer" c ON c."id"=sa."customerId"
    WHERE sa."companyId"=${companyId} AND sa."occurredAt">=${from} AND sa."occurredAt"<${to} AND (${storeId}::text IS NULL OR sa."storeId"=${storeId})
      AND (${text}::text IS NULL OR COALESCE(sa."receiptNumber",'') ILIKE ${text} OR COALESCE(c."name",'') ILIKE ${text}) ORDER BY sa."occurredAt" DESC LIMIT 5000`;
  res.json({items:[...purchases,...sales].sort((a,b)=>new Date(b.date)-new Date(a.date)).slice(0,10000),fiscalSales:false});
}catch(error){next(error)}});

router.get("/logins",async(req,res,next)=>{try{
  const {companyId,from,to,q}=filters(req),text=q?`%${q}%`:null;
  const rows=await prisma.$queryRaw`
    SELECT a."id",a."createdAt",a."email",a."event",a."success",a."deviceName",a."ipAddress",u."fullName",u."role"
    FROM "AuthAudit" a LEFT JOIN "User" u ON u."id"=a."userId"
    WHERE u."companyId"=${companyId} AND a."createdAt">=${from} AND a."createdAt"<${to}
      AND (${text}::text IS NULL OR a."email" ILIKE ${text} OR COALESCE(u."fullName",'') ILIKE ${text})
    ORDER BY a."createdAt" DESC LIMIT 10000`;
  res.json({items:rows});
}catch(error){next(error)}});

router.get("/availability",async(req,res)=>{
  res.json({
    saleListDeletions:{available:false,reason:"Δεν υπάρχει ακόμη audit ledger για διαγραφές γραμμών πριν την ολοκλήρωση πώλησης."},
    productDeactivations:{available:false,reason:"Υπάρχει τρέχουσα κατάσταση προϊόντος αλλά όχι πλήρες ιστορικό ενεργό/ανενεργό για παλιές εγγραφές."},
    fiscalZ:{available:false,reason:"Το φορολογικό Ζ παραμένει στο Kiosk Manager/RBS μέχρι πραγματική σύνδεση Connector."}
  });
});

export default router;
