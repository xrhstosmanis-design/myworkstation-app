import {Router} from "express";
import {prisma} from "../prisma.js";

const router=Router();
const roles=new Set(["SUPER_ADMIN","OWNER","ADMIN","MANAGER"]);
const n=value=>Number(value||0);
const dayStart=value=>{const d=value?new Date(`${String(value).slice(0,10)}T00:00:00`):new Date(Date.now()-30*86400000);return Number.isNaN(d.getTime())?new Date(Date.now()-30*86400000):d};
const dayEndExclusive=value=>{const d=value?new Date(`${String(value).slice(0,10)}T00:00:00`):new Date();if(Number.isNaN(d.getTime()))return new Date(Date.now()+86400000);d.setDate(d.getDate()+1);return d};

function requireAccess(req,res,next){
  if(req.user?.tokenType==="STORE_OPERATOR"||!roles.has(req.user?.role))return res.status(403).json({error:"Η Ανάλυση αποθήκης είναι διαθέσιμη μόνο σε Super Admin, Ιδιοκτήτη, Admin ή Manager."});
  next();
}
router.use(requireAccess);

router.get("/stock-analysis",async(req,res,next)=>{
  try{
    const companyId=req.user.companyId;
    const from=dayStart(req.query.from),to=dayEndExclusive(req.query.to);
    const storeId=String(req.query.storeId||"")||null,q=String(req.query.q||"").trim()||null,text=q?`%${q}%`:null;
    if(storeId){const store=await prisma.store.findFirst({where:{id:storeId,companyId,active:true},select:{id:true}});if(!store)return res.status(404).json({error:"Δεν βρέθηκε το κατάστημα."})}
    const rows=await prisma.$queryRaw`
      SELECT p."id" AS "productId",p."sku",p."name",p."vatRate",p."unit",
        c."name" AS "categoryName",mp."subcategoryName",s."id" AS "storeId",s."name" AS "storeName",
        COALESCE(sp."salePrice",p."salePrice",0) AS "salePrice",COALESCE(sp."currentStock",0) AS "currentStock",
        COALESCE(sa."salesQuantity",0) AS "salesQuantity",sa."lastSaleAt",
        COALESCE(lp."unitCost",p."costPrice",0) AS "purchasePrice",lp."documentDate" AS "lastPurchaseAt",lp."supplierName"
      FROM "StoreProduct" sp
      JOIN "Store" s ON s."id"=sp."storeId" AND s."companyId"=${companyId}
      JOIN "Product" p ON p."id"=sp."productId" AND p."companyId"=${companyId}
      LEFT JOIN "ProductCategory" c ON c."id"=p."categoryId"
      LEFT JOIN "MasterProduct" mp ON mp."id"=p."masterProductId"
      LEFT JOIN LATERAL (
        SELECT COALESCE(SUM(sl."quantity"),0) AS "salesQuantity",MAX(sale."occurredAt") AS "lastSaleAt"
        FROM "SaleLine" sl JOIN "Sale" sale ON sale."id"=sl."saleId"
        WHERE sl."productId"=p."id" AND sale."companyId"=${companyId} AND sale."storeId"=sp."storeId"
          AND sale."status"='COMPLETED' AND sale."occurredAt">=${from} AND sale."occurredAt"<${to}
      ) sa ON true
      LEFT JOIN LATERAL (
        SELECT CASE WHEN l."unit"='PACKAGE' THEN l."unitCost"/NULLIF(l."unitsPerPackage",0) ELSE l."unitCost" END AS "unitCost",
          d."documentDate",sup."name" AS "supplierName"
        FROM "PurchaseDocumentLine" l JOIN "PurchaseDocument" d ON d."id"=l."purchaseDocumentId"
        LEFT JOIN "Supplier" sup ON sup."id"=d."supplierId"
        WHERE d."companyId"=${companyId} AND d."status"='APPROVED' AND d."storeId"=sp."storeId" AND l."productId"=p."id"
        ORDER BY d."documentDate" DESC,d."createdAt" DESC LIMIT 1
      ) lp ON true
      WHERE sp."active"=true AND p."active"=true AND (${storeId}::text IS NULL OR sp."storeId"=${storeId})
        AND (${text}::text IS NULL OR p."name" ILIKE ${text} OR COALESCE(p."sku",'') ILIKE ${text})
      ORDER BY p."name",s."name" LIMIT 10000`;
    const items=rows.map(r=>{
      const currentStock=n(r.currentStock),salePrice=n(r.salePrice),purchasePrice=n(r.purchasePrice),vatRate=n(r.vatRate),salesQuantity=n(r.salesQuantity);
      const saleNet=salePrice/(1+vatRate/100),retailValue=currentStock*salePrice,purchaseValue=currentStock*purchasePrice;
      return {...r,currentStock,salePrice,purchasePrice,vatRate,salesQuantity,retailValue,purchaseValue,margin:saleNet>0?((saleNet-purchasePrice)/saleNet)*100:0};
    });
    res.json({items,count:items.length,totalStockQuantity:items.reduce((a,r)=>a+r.currentStock,0),totalRetailValue:items.reduce((a,r)=>a+r.retailValue,0),totalPurchaseValue:items.reduce((a,r)=>a+r.purchaseValue,0),totalSalesQuantity:items.reduce((a,r)=>a+r.salesQuantity,0),from,to});
  }catch(error){next(error)}
});

router.get("/stock-analysis/:productId/movements",async(req,res,next)=>{
  try{
    const companyId=req.user.companyId,productId=String(req.params.productId),from=dayStart(req.query.from),to=dayEndExclusive(req.query.to),storeId=String(req.query.storeId||"")||null;
    const product=await prisma.$queryRaw`SELECT "id","name","sku" FROM "Product" WHERE "id"=${productId} AND "companyId"=${companyId} LIMIT 1`;
    if(!product[0])return res.status(404).json({error:"Δεν βρέθηκε το είδος."});
    const rows=await prisma.$queryRaw`
      SELECT sm."id",sm."createdAt",sm."movementType",sm."quantity",sm."unitCost",sm."sourceType",sm."sourceId",sm."note",s."name" AS "storeName",u."fullName" AS "operatorName"
      FROM "StockMovement" sm JOIN "Store" s ON s."id"=sm."storeId" AND s."companyId"=${companyId}
      LEFT JOIN "User" u ON u."id"=sm."createdByUserId"
      WHERE sm."productId"=${productId} AND sm."createdAt">=${from} AND sm."createdAt"<${to}
        AND (${storeId}::text IS NULL OR sm."storeId"=${storeId})
      ORDER BY sm."createdAt" DESC LIMIT 2000`;
    res.json({product:product[0],items:rows.map(r=>({...r,quantity:n(r.quantity),unitCost:n(r.unitCost),value:Math.abs(n(r.quantity))*n(r.unitCost)})),count:rows.length});
  }catch(error){next(error)}
});

export default router;
