import {Router} from "express";
import {prisma} from "../prisma.js";

const router=Router();
const roles=new Set(["SUPER_ADMIN","OWNER","ADMIN","MANAGER"]);
const n=value=>Number(value||0);

const dayStart=value=>{const d=value?new Date(`${String(value).slice(0,10)}T00:00:00`):new Date(Date.now()-30*86400000);return Number.isNaN(d.getTime())?new Date(Date.now()-30*86400000):d};
const dayEndExclusive=value=>{const d=value?new Date(`${String(value).slice(0,10)}T00:00:00`):new Date();if(Number.isNaN(d.getTime()))return new Date(Date.now()+86400000);d.setDate(d.getDate()+1);return d};

router.get("/destructions",async(req,res,next)=>{
  try{
    if(req.user?.tokenType==="STORE_OPERATOR"||!roles.has(req.user?.role))return res.status(403).json({error:"Οι Αναφορές είναι διαθέσιμες μόνο σε Super Admin, Ιδιοκτήτη, Admin ή Manager."});
    const companyId=req.user.companyId;
    const from=dayStart(req.query.from),to=dayEndExclusive(req.query.to);
    const storeId=String(req.query.storeId||"")||null;
    const q=String(req.query.q||"").trim();
    const text=q?`%${q}%`:null;

    const rows=await prisma.$queryRaw`
      SELECT sl."id",sa."occurredAt" AS "createdAt",audit."reason" AS "note",
        'PRODUCT_DESTRUCTION'::text AS "sourceType",sa."id" AS "sourceId",ABS(sl."quantity") AS "quantity",
        p."id" AS "productId",p."sku",p."name",ABS(sl."unitPrice") AS "salePrice",p."vatRate",p."unit",
        c."name" AS "categoryName",mp."subcategoryName",st."id" AS "storeId",st."name" AS "storeName",
        COALESCE(audit."actorName",e."fullName",'—') AS "operatorName",
        COALESCE(lp."unitCost",p."costPrice",0) AS "purchasePrice",
        ABS(sl."quantity")*COALESCE(lp."unitCost",p."costPrice",0) AS "purchaseTotal",
        lp."supplierName",lp."documentDate" AS "purchaseDate"
      FROM "SaleLine" sl
      JOIN "Sale" sa ON sa."id"=sl."saleId" AND sa."companyId"=${companyId} AND sa."status"='COMPLETED' AND sa."source"='PRODUCT_DESTRUCTION'
      JOIN "Store" st ON st."id"=sa."storeId" AND st."companyId"=${companyId}
      JOIN "Product" p ON p."id"=sl."productId" AND p."companyId"=${companyId}
      LEFT JOIN "ProductCategory" c ON c."id"=p."categoryId"
      LEFT JOIN "MasterProduct" mp ON mp."id"=p."masterProductId"
      LEFT JOIN "Employee" e ON e."id"=sa."operatorEmployeeId"
      LEFT JOIN LATERAL (
        SELECT a."actorName",a."reason"
        FROM "PosSaleActionAudit" a
        WHERE a."companyId"=${companyId} AND a."saleId"=sa."id" AND a."actionType"='PRODUCT_DESTRUCTION'
        ORDER BY a."createdAt" DESC LIMIT 1
      ) audit ON true
      LEFT JOIN LATERAL (
        SELECT CASE WHEN l."unit"='PACKAGE' THEN l."unitCost"/NULLIF(l."unitsPerPackage",0) ELSE l."unitCost" END AS "unitCost",
          d."documentDate",sup."name" AS "supplierName"
        FROM "PurchaseDocumentLine" l
        JOIN "PurchaseDocument" d ON d."id"=l."purchaseDocumentId"
        LEFT JOIN "Supplier" sup ON sup."id"=d."supplierId"
        WHERE d."companyId"=${companyId} AND d."storeId"=sa."storeId" AND d."status"='APPROVED'
          AND l."productId"=p."id" AND d."documentDate"<=sa."occurredAt"
        ORDER BY d."documentDate" DESC,d."createdAt" DESC LIMIT 1
      ) lp ON true
      WHERE sa."occurredAt">=${from} AND sa."occurredAt"<${to}
        AND (${storeId}::text IS NULL OR sa."storeId"=${storeId})
        AND (${text}::text IS NULL OR p."name" ILIKE ${text} OR COALESCE(p."sku",'') ILIKE ${text})
      ORDER BY sa."occurredAt" DESC LIMIT 5000`;

    const items=rows.map(r=>({...r,quantity:n(r.quantity),salePrice:n(r.salePrice),vatRate:n(r.vatRate),purchasePrice:n(r.purchasePrice),purchaseTotal:n(r.purchaseTotal)}));
    res.json({items,count:items.length,totalQuantity:items.reduce((a,r)=>a+r.quantity,0),totalPurchase:items.reduce((a,r)=>a+r.purchaseTotal,0),source:"POS_PRODUCT_DESTRUCTION"});
  }catch(error){next(error)}
});

export default router;
