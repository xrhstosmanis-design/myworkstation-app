import {Router} from "express";
import {prisma} from "../prisma.js";

const router=Router();
const roles=new Set(["SUPER_ADMIN","OWNER","ADMIN","MANAGER"]);
const n=value=>Number(value||0);

function requireAccess(req,res,next){
  if(req.user?.tokenType==="STORE_OPERATOR"||!roles.has(req.user?.role))return res.status(403).json({error:"Το Αρχείο ειδών είναι διαθέσιμο μόνο σε Super Admin, Ιδιοκτήτη, Admin ή Manager."});
  next();
}
router.use(requireAccess);

router.get("/",async(req,res,next)=>{
  try{
    const companyId=req.user.companyId;
    const storeId=String(req.query.storeId||"").trim();
    if(!storeId)return res.status(400).json({error:"Δεν επιλέχθηκε κατάστημα."});
    const store=await prisma.store.findFirst({where:{id:storeId,companyId,active:true},select:{id:true,name:true}});
    if(!store)return res.status(404).json({error:"Δεν βρέθηκε ενεργό κατάστημα."});

    const q=String(req.query.q||"").trim();
    const text=q?`%${q}%`:null;
    const category=String(req.query.category||"").trim()||null;
    const subcategory=String(req.query.subcategory||"").trim()||null;
    const status=["ALL","ACTIVE","INACTIVE"].includes(String(req.query.status||"ALL"))?String(req.query.status||"ALL"):"ALL";
    const page=Math.max(1,Number.parseInt(String(req.query.page||"1"),10)||1);
    const pageSize=Math.min(200,Math.max(25,Number.parseInt(String(req.query.pageSize||"100"),10)||100));
    const offset=(page-1)*pageSize;

    const countRows=await prisma.$queryRaw`
      SELECT COUNT(*)::int AS count
      FROM "StoreProduct" sp
      JOIN "Product" p ON p."id"=sp."productId" AND p."companyId"=${companyId}
      LEFT JOIN "ProductCategory" c ON c."id"=p."categoryId"
      LEFT JOIN "MasterProduct" mp ON mp."id"=p."masterProductId"
      WHERE sp."storeId"=${storeId}
        AND (${text}::text IS NULL OR p."name" ILIKE ${text} OR COALESCE(p."sku",'') ILIKE ${text}
          OR EXISTS (SELECT 1 FROM "ProductBarcode" pbx WHERE pbx."productId"=p."id" AND pbx."barcode" ILIKE ${text}))
        AND (${category}::text IS NULL OR COALESCE(c."name",'ΧΩΡΙΣ ΚΑΤΗΓΟΡΙΑ')=${category})
        AND (${subcategory}::text IS NULL OR COALESCE(mp."subcategoryName",'ΧΩΡΙΣ ΥΠΟΚΑΤΗΓΟΡΙΑ')=${subcategory})
        AND (${status}='ALL' OR (${status}='ACTIVE' AND p."active"=TRUE AND sp."active"=TRUE) OR (${status}='INACTIVE' AND (p."active"=FALSE OR sp."active"=FALSE)))
    `;
    const total=Number(countRows[0]?.count||0);

    const rows=await prisma.$queryRaw`
      SELECT p."id" AS "productId",p."sku",p."name",p."description",p."unit",p."vatRate",p."active" AS "productActive",
        p."createdAt",p."updatedAt",p."eDeliveryEnabled",p."efoodEnabled",p."woltEnabled",p."publishStock",p."publishPrices",p."efoodPrice",p."woltPrice",
        c."name" AS "categoryName",mp."subcategoryName",mp."brandName",
        sp."active" AS "storeActive",COALESCE(sp."salePrice",p."salePrice",0) AS "salePrice",COALESCE(sp."currentStock",0) AS "currentStock",sp."minStock",
        pb."barcode",lp."unitCost" AS "lastPurchasePrice",lp."documentDate" AS "lastPurchaseAt",lp."supplierName",lp."documentNumber" AS "lastPurchaseDocument",
        ap."averagePurchasePrice",COALESCE(sa."sales15Qty",0) AS "sales15Qty",sa."lastSaleAt"
      FROM "StoreProduct" sp
      JOIN "Product" p ON p."id"=sp."productId" AND p."companyId"=${companyId}
      LEFT JOIN "ProductCategory" c ON c."id"=p."categoryId"
      LEFT JOIN "MasterProduct" mp ON mp."id"=p."masterProductId"
      LEFT JOIN LATERAL (
        SELECT pb0."barcode" FROM "ProductBarcode" pb0 WHERE pb0."productId"=p."id" ORDER BY pb0."createdAt",pb0."barcode" LIMIT 1
      ) pb ON true
      LEFT JOIN LATERAL (
        SELECT CASE WHEN l."unit"='PACKAGE' THEN l."unitCost"/NULLIF(l."unitsPerPackage",0) ELSE l."unitCost" END AS "unitCost",
               d."documentDate",d."documentNumber",sup."name" AS "supplierName"
        FROM "PurchaseDocumentLine" l
        JOIN "PurchaseDocument" d ON d."id"=l."purchaseDocumentId"
        LEFT JOIN "Supplier" sup ON sup."id"=d."supplierId"
        WHERE d."companyId"=${companyId} AND d."storeId"=${storeId} AND d."status"='APPROVED' AND l."productId"=p."id"
        ORDER BY d."documentDate" DESC,d."createdAt" DESC LIMIT 1
      ) lp ON true
      LEFT JOIN LATERAL (
        SELECT AVG(CASE WHEN l2."unit"='PACKAGE' THEN l2."unitCost"/NULLIF(l2."unitsPerPackage",0) ELSE l2."unitCost" END) AS "averagePurchasePrice"
        FROM "PurchaseDocumentLine" l2 JOIN "PurchaseDocument" d2 ON d2."id"=l2."purchaseDocumentId"
        WHERE d2."companyId"=${companyId} AND d2."storeId"=${storeId} AND d2."status"='APPROVED' AND l2."productId"=p."id"
          AND d2."documentDate">=NOW()-INTERVAL '180 days'
      ) ap ON true
      LEFT JOIN LATERAL (
        SELECT COALESCE(SUM(sl."quantity"),0) AS "sales15Qty",MAX(s."occurredAt") AS "lastSaleAt"
        FROM "SaleLine" sl JOIN "Sale" s ON s."id"=sl."saleId"
        WHERE sl."productId"=p."id" AND s."companyId"=${companyId} AND s."storeId"=${storeId} AND s."status"='COMPLETED'
          AND s."occurredAt">=NOW()-INTERVAL '15 days'
      ) sa ON true
      WHERE sp."storeId"=${storeId}
        AND (${text}::text IS NULL OR p."name" ILIKE ${text} OR COALESCE(p."sku",'') ILIKE ${text}
          OR EXISTS (SELECT 1 FROM "ProductBarcode" pbx WHERE pbx."productId"=p."id" AND pbx."barcode" ILIKE ${text}))
        AND (${category}::text IS NULL OR COALESCE(c."name",'ΧΩΡΙΣ ΚΑΤΗΓΟΡΙΑ')=${category})
        AND (${subcategory}::text IS NULL OR COALESCE(mp."subcategoryName",'ΧΩΡΙΣ ΥΠΟΚΑΤΗΓΟΡΙΑ')=${subcategory})
        AND (${status}='ALL' OR (${status}='ACTIVE' AND p."active"=TRUE AND sp."active"=TRUE) OR (${status}='INACTIVE' AND (p."active"=FALSE OR sp."active"=FALSE)))
      ORDER BY p."name",p."sku" NULLS LAST
      LIMIT ${pageSize} OFFSET ${offset}
    `;

    const items=rows.map(row=>{
      const salePrice=n(row.salePrice),vatRate=n(row.vatRate),currentStock=n(row.currentStock),fallbackCost=n(row.lastPurchasePrice||0),baseCost=n(row.averagePurchasePrice||0),cost=fallbackCost||baseCost||0;
      const saleNet=salePrice/(1+vatRate/100);
      return {...row,
        salePrice,currentStock,minStock:row.minStock===null?null:n(row.minStock),vatRate,
        lastPurchasePrice:row.lastPurchasePrice===null?null:n(row.lastPurchasePrice),
        averagePurchasePrice:row.averagePurchasePrice===null?null:n(row.averagePurchasePrice),
        efoodPrice:row.efoodPrice===null?null:n(row.efoodPrice),woltPrice:row.woltPrice===null?null:n(row.woltPrice),sales15Qty:n(row.sales15Qty),
        margin:saleNet>0&&cost>0?((saleNet-cost)/saleNet)*100:null,
        markup:cost>0?((saleNet-cost)/cost)*100:null,
        retailStockValue:currentStock*salePrice,
        costStockValue:currentStock*cost,
        effectiveCost:cost||null,
        active:Boolean(row.productActive&&row.storeActive)
      };
    });

    const [categories,subcategories]=await Promise.all([
      prisma.$queryRaw`
        SELECT DISTINCT COALESCE(c."name",'ΧΩΡΙΣ ΚΑΤΗΓΟΡΙΑ') AS name
        FROM "StoreProduct" sp JOIN "Product" p ON p."id"=sp."productId" AND p."companyId"=${companyId}
        LEFT JOIN "ProductCategory" c ON c."id"=p."categoryId"
        WHERE sp."storeId"=${storeId} ORDER BY name`,
      prisma.$queryRaw`
        SELECT DISTINCT COALESCE(mp."subcategoryName",'ΧΩΡΙΣ ΥΠΟΚΑΤΗΓΟΡΙΑ') AS name
        FROM "StoreProduct" sp JOIN "Product" p ON p."id"=sp."productId" AND p."companyId"=${companyId}
        LEFT JOIN "MasterProduct" mp ON mp."id"=p."masterProductId"
        WHERE sp."storeId"=${storeId} ORDER BY name`
    ]);

    res.json({store,page,pageSize,total,pages:Math.max(1,Math.ceil(total/pageSize)),items,
      categories:categories.map(r=>r.name),subcategories:subcategories.map(r=>r.name),
      totals:{retailStockValue:items.reduce((a,r)=>a+r.retailStockValue,0),costStockValue:items.reduce((a,r)=>a+r.costStockValue,0),stock:items.reduce((a,r)=>a+r.currentStock,0)}});
  }catch(error){next(error)}
});

export default router;
