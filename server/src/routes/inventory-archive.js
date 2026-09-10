import {Router} from "express";
import {prisma} from "../prisma.js";
import {z} from "zod";
import crypto from "crypto";

const router=Router();
const roles=new Set(["SUPER_ADMIN","OWNER","ADMIN","MANAGER"]);
const n=value=>Number(value||0);

function requireAccess(req,res,next){
  if(req.user?.tokenType==="STORE_OPERATOR"||!roles.has(req.user?.role))return res.status(403).json({error:"Το Αρχείο ειδών είναι διαθέσιμο μόνο σε Super Admin, Ιδιοκτήτη, Admin ή Manager."});
  next();
}
router.use(requireAccess);

router.post("/stock-transfer",async(req,res,next)=>{
  try{
    const body=z.object({sourceStoreId:z.string().min(1),destinationStoreId:z.string().min(1),productId:z.string().min(1),quantity:z.coerce.number().positive().max(1000000),reason:z.string().trim().min(3).max(300),idempotencyKey:z.string().min(8).max(160)}).parse(req.body||{});
    if(body.sourceStoreId===body.destinationStoreId)return res.status(400).json({error:"Το κατάστημα προορισμού πρέπει να είναι διαφορετικό."});
    const stores=await prisma.store.findMany({where:{companyId:req.user.companyId,id:{in:[body.sourceStoreId,body.destinationStoreId]},active:true},select:{id:true,name:true}});
    if(stores.length!==2)return res.status(404).json({error:"Η μεταφορά επιτρέπεται μόνο μεταξύ ενεργών καταστημάτων της ίδιας εταιρείας."});
    const product=await prisma.product.findFirst({where:{id:body.productId,companyId:req.user.companyId,active:true},select:{id:true,name:true,costPrice:true,salePrice:true}});
    if(!product)return res.status(404).json({error:"Δεν βρέθηκε ενεργό προϊόν της εταιρείας."});
    const transferId=`inventory-transfer:${body.idempotencyKey}`;
    const result=await prisma.$transaction(async tx=>{
      const duplicate=await tx.$queryRaw`SELECT "id" FROM "StockMovement" WHERE "sourceType"='INVENTORY_TRANSFER' AND "sourceId"=${transferId} LIMIT 1`;
      if(duplicate[0])return {duplicate:true};
      const sourceRows=await tx.$queryRaw`SELECT "currentStock" FROM "StoreProduct" WHERE "storeId"=${body.sourceStoreId} AND "productId"=${body.productId} FOR UPDATE`;
      const sourceStock=n(sourceRows[0]?.currentStock);
      if(!sourceRows[0]||sourceStock<body.quantity)throw Object.assign(new Error(`Μη επαρκές απόθεμα. Διαθέσιμο: ${sourceStock}.`),{statusCode:409});
      const updated=await tx.$queryRaw`UPDATE "StoreProduct" SET "currentStock"="currentStock"-${body.quantity},"updatedAt"=CURRENT_TIMESTAMP WHERE "storeId"=${body.sourceStoreId} AND "productId"=${body.productId} AND "currentStock">=${body.quantity} RETURNING "currentStock"`;
      if(!updated[0])throw Object.assign(new Error("Το απόθεμα άλλαξε. Κάνε ανανέωση και προσπάθησε ξανά."),{statusCode:409});
      await tx.$executeRaw`INSERT INTO "StoreProduct" ("id","storeId","productId","salePrice","currentStock","active") VALUES (${crypto.randomUUID()},${body.destinationStoreId},${body.productId},${product.salePrice??null},${body.quantity},true) ON CONFLICT ("storeId","productId") DO UPDATE SET "currentStock"="StoreProduct"."currentStock"+${body.quantity},"updatedAt"=CURRENT_TIMESTAMP`;
      await tx.$executeRaw`INSERT INTO "StockMovement" ("id","storeId","productId","movementType","quantity","unitCost","sourceType","sourceId","note","createdByUserId","idempotencyKey") VALUES (${crypto.randomUUID()},${body.sourceStoreId},${body.productId},'TRANSFER_OUT',${-body.quantity},${product.costPrice??null},'INVENTORY_TRANSFER',${transferId},${body.reason},${req.user.id},${`${transferId}:out`})`;
      await tx.$executeRaw`INSERT INTO "StockMovement" ("id","storeId","productId","movementType","quantity","unitCost","sourceType","sourceId","note","createdByUserId","idempotencyKey") VALUES (${crypto.randomUUID()},${body.destinationStoreId},${body.productId},'TRANSFER_IN',${body.quantity},${product.costPrice??null},'INVENTORY_TRANSFER',${transferId},${body.reason},${req.user.id},${`${transferId}:in`})`;
      return {duplicate:false,sourceStock:n(updated[0].currentStock)};
    });
    if(result.duplicate)return res.json({ok:true,duplicate:true,message:"Η μεταφορά είχε ήδη καταχωριστεί και δεν επαναλήφθηκε."});
    const destination=await prisma.$queryRaw`SELECT "currentStock" FROM "StoreProduct" WHERE "storeId"=${body.destinationStoreId} AND "productId"=${body.productId} LIMIT 1`;
    res.status(201).json({ok:true,transferId,sourceStock:result.sourceStock,destinationStock:n(destination[0]?.currentStock),message:"Η μεταφορά ολοκληρώθηκε και γράφτηκε μία φορά και στα δύο καταστήματα."});
  }catch(error){if(error?.statusCode)return res.status(error.statusCode).json({error:error.message});next(error)}
});

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
      LEFT JOIN "ProductSubcategory" sc ON sc."id"=p."subcategoryId"
      LEFT JOIN "MasterProduct" mp ON mp."id"=p."masterProductId"
      WHERE sp."storeId"=${storeId}
        AND (${text}::text IS NULL OR p."name" ILIKE ${text} OR COALESCE(p."sku",'') ILIKE ${text}
          OR EXISTS (SELECT 1 FROM "ProductBarcode" pbx WHERE pbx."productId"=p."id" AND pbx."barcode" ILIKE ${text}))
        AND (${category}::text IS NULL OR COALESCE(c."name",'ΧΩΡΙΣ ΚΑΤΗΓΟΡΙΑ')=${category})
        AND (${subcategory}::text IS NULL OR COALESCE(sc."name",mp."subcategoryName",'ΧΩΡΙΣ ΥΠΟΚΑΤΗΓΟΡΙΑ')=${subcategory})
        AND (${status}='ALL' OR (${status}='ACTIVE' AND p."active"=TRUE AND sp."active"=TRUE) OR (${status}='INACTIVE' AND (p."active"=FALSE OR sp."active"=FALSE)))
    `;
    const total=Number(countRows[0]?.count||0);

    const rows=await prisma.$queryRaw`
      SELECT p."id" AS "productId",p."sku",p."name",p."description",p."unit",p."vatRate",p."costPrice",p."active" AS "productActive",
        p."createdAt",p."updatedAt",p."eDeliveryEnabled",p."efoodEnabled",p."woltEnabled",p."publishStock",p."publishPrices",p."efoodPrice",p."woltPrice",
        c."name" AS "categoryName",COALESCE(sc."name",mp."subcategoryName") AS "subcategoryName",mp."brandName",
        sp."active" AS "storeActive",COALESCE(sp."salePrice",p."salePrice",0) AS "salePrice",COALESCE(sp."currentStock",0) AS "currentStock",sp."minStock",
        pb."barcode",lp."unitCost" AS "lastPurchasePrice",lp."documentDate" AS "lastPurchaseAt",lp."supplierName",lp."documentNumber" AS "lastPurchaseDocument",
        ap."averagePurchasePrice",COALESCE(sa."sales15Qty",0) AS "sales15Qty",sa."lastSaleAt"
      FROM "StoreProduct" sp
      JOIN "Product" p ON p."id"=sp."productId" AND p."companyId"=${companyId}
      LEFT JOIN "ProductCategory" c ON c."id"=p."categoryId"
      LEFT JOIN "ProductSubcategory" sc ON sc."id"=p."subcategoryId"
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
        AND (${subcategory}::text IS NULL OR COALESCE(sc."name",mp."subcategoryName",'ΧΩΡΙΣ ΥΠΟΚΑΤΗΓΟΡΙΑ')=${subcategory})
        AND (${status}='ALL' OR (${status}='ACTIVE' AND p."active"=TRUE AND sp."active"=TRUE) OR (${status}='INACTIVE' AND (p."active"=FALSE OR sp."active"=FALSE)))
      ORDER BY p."name",p."sku" NULLS LAST
      LIMIT ${pageSize} OFFSET ${offset}
    `;

    const items=rows.map(row=>{
      const salePrice=n(row.salePrice),vatRate=n(row.vatRate),currentStock=n(row.currentStock),latest=n(row.lastPurchasePrice||0),average=n(row.averagePurchasePrice||0),stored=n(row.costPrice||0),cost=latest||average||stored||0;
      const saleNet=salePrice/(1+vatRate/100);
      return {...row,
        salePrice,currentStock,minStock:row.minStock===null?null:n(row.minStock),vatRate,costPrice:n(row.costPrice),
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

    const [categories,subcategories,taxonomyCategories,taxonomySubcategories]=await Promise.all([
      prisma.$queryRaw`
        SELECT DISTINCT COALESCE(c."name",'ΧΩΡΙΣ ΚΑΤΗΓΟΡΙΑ') AS name
        FROM "StoreProduct" sp JOIN "Product" p ON p."id"=sp."productId" AND p."companyId"=${companyId}
        LEFT JOIN "ProductCategory" c ON c."id"=p."categoryId"
        WHERE sp."storeId"=${storeId} ORDER BY name`,
      prisma.$queryRaw`
        SELECT DISTINCT COALESCE(sc."name",mp."subcategoryName",'ΧΩΡΙΣ ΥΠΟΚΑΤΗΓΟΡΙΑ') AS name
        FROM "StoreProduct" sp JOIN "Product" p ON p."id"=sp."productId" AND p."companyId"=${companyId}
        LEFT JOIN "ProductSubcategory" sc ON sc."id"=p."subcategoryId"
        LEFT JOIN "MasterProduct" mp ON mp."id"=p."masterProductId"
        WHERE sp."storeId"=${storeId} ORDER BY name`,
      prisma.$queryRaw`SELECT "id","name" FROM "ProductCategory" WHERE "companyId"=${companyId} AND "active"=true ORDER BY "name"`,
      prisma.$queryRaw`SELECT "id","categoryId","name" FROM "ProductSubcategory" WHERE "companyId"=${companyId} AND "active"=true ORDER BY "name"`
    ]);

    res.json({store,page,pageSize,total,pages:Math.max(1,Math.ceil(total/pageSize)),items,
      categories:categories.map(r=>r.name),subcategories:subcategories.map(r=>r.name),
      taxonomy:{categories:taxonomyCategories,subcategories:taxonomySubcategories},
      totals:{retailStockValue:items.reduce((a,r)=>a+r.retailStockValue,0),costStockValue:items.reduce((a,r)=>a+r.costStockValue,0),stock:items.reduce((a,r)=>a+r.currentStock,0)}});
  }catch(error){next(error)}
});

export default router;
