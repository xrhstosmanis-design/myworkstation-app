import crypto from "crypto";
import {Router} from "express";
import {z} from "zod";
import XLSX from "xlsx";
import {prisma} from "../prisma.js";
import {requireCompanyModule} from "../middleware/module-access.js";

const router=Router();
const uid=()=>crypto.randomUUID();
const money=value=>value===null||value===undefined?null:Number(value);

function companyId(req){return req.user?.companyId||null;}
async function ownedStore(company,storeId){
  if(!company||!storeId)return null;
  return prisma.store.findFirst({where:{id:String(storeId),companyId:company},select:{id:true,name:true}});
}
async function ownedProduct(company,productId){
  const rows=await prisma.$queryRaw`SELECT p.*,c."name" AS "categoryName",sc."name" AS "subcategoryName" FROM "Product" p LEFT JOIN "ProductCategory" c ON c."id"=p."categoryId" LEFT JOIN "ProductSubcategory" sc ON sc."id"=p."subcategoryId" WHERE p."id"=${String(productId)} AND p."companyId"=${company} LIMIT 1`;
  return rows[0]||null;
}
async function productByBarcode(company,barcode){
  const rows=await prisma.$queryRaw`SELECT p."id",p."name" FROM "Product" p JOIN "ProductBarcode" b ON b."productId"=p."id" WHERE p."companyId"=${company} AND b."barcode"=${String(barcode)} AND p."active"=true LIMIT 1`;
  return rows[0]||null;
}

router.get("/stores",requireCompanyModule("INVENTORY"),async(req,res,next)=>{
  try{
    const company=companyId(req);
    if(!company)return res.status(403).json({error:"Δεν υπάρχει ενεργή εταιρεία."});
    const rows=await prisma.store.findMany({where:{companyId:company},select:{id:true,name:true,city:true,active:true},orderBy:{name:"asc"}});
    res.json(rows);
  }catch(error){next(error)}
});

router.get("/master",requireCompanyModule("INVENTORY"),async(req,res,next)=>{
  try{
    const company=companyId(req);
    const q=String(req.query.q||"").trim();
    if(q.length<2)return res.json([]);
    const like=`%${q}%`;
    const rows=await prisma.$queryRaw`
      SELECT mp."id",mp."sourceCode",mp."name",mp."categoryName",mp."subcategoryName",mp."supplierName",mp."brandName",
             mp."defaultRetailPrice",mp."defaultCostPrice",mp."vatRate",mp."vatVerified",
             COALESCE(json_agg(mb."barcode") FILTER (WHERE mb."barcode" IS NOT NULL AND mb."scanEnabled"=true),'[]') AS "safeBarcodes",
             COUNT(mb."barcode") FILTER (WHERE mb."duplicateBarcode"=true)::int AS "duplicateBarcodeCount",
             p."id" AS "companyProductId"
      FROM "MasterProduct" mp
      LEFT JOIN "MasterProductBarcode" mb ON mb."masterProductId"=mp."id"
      LEFT JOIN "Product" p ON p."companyId"=${company} AND p."masterProductId"=mp."id"
      WHERE mp."active"=true AND (mp."name" ILIKE ${like} OR mp."sourceCode" ILIKE ${like} OR mb."barcode" ILIKE ${like})
      GROUP BY mp."id",p."id"
      ORDER BY mp."name" LIMIT 100`;
    res.setHeader("Cache-Control","no-store, no-cache, must-revalidate, private");
    res.setHeader("Pragma","no-cache");
    res.setHeader("Expires","0");
    res.json(rows);
  }catch(error){next(error)}
});

router.post("/activate",requireCompanyModule("INVENTORY"),async(req,res,next)=>{
  try{
    const company=companyId(req);
    const body=z.object({
      masterProductId:z.string().min(1),
      basePrice:z.coerce.number().min(0).nullable().optional(),
      storeConfigs:z.array(z.object({storeId:z.string().min(1),active:z.boolean().default(true),salePrice:z.coerce.number().min(0).nullable().optional()})).max(500)
    }).parse(req.body||{});
    const masterRows=await prisma.$queryRaw`SELECT "id","sourceCode","name","categoryName","defaultRetailPrice","defaultCostPrice","vatRate","vatVerified" FROM "MasterProduct" WHERE "id"=${body.masterProductId} AND "active"=true LIMIT 1`;
    const master=masterRows[0];
    if(!master)return res.status(404).json({error:"Δεν βρέθηκε το προϊόν στον Master Catalog."});
    const storeIds=[...new Set(body.storeConfigs.map(x=>x.storeId))];
    const stores=await prisma.store.findMany({where:{companyId:company,id:{in:storeIds}},select:{id:true,name:true}});
    if(stores.length!==storeIds.length)return res.status(400).json({error:"Υπάρχει μη έγκυρο κατάστημα στην επιλογή."});

    const existing=await prisma.$queryRaw`SELECT "id" FROM "Product" WHERE "companyId"=${company} AND "masterProductId"=${master.id} LIMIT 1`;
    const productId=existing[0]?.id||uid();
    const requestedBase=body.basePrice===undefined||body.basePrice===null?money(master.defaultRetailPrice):body.basePrice;
    const basePrice=requestedBase??0;
    const cost=money(master.defaultCostPrice)??0;
    const vatVerified=master.vatVerified===true;
    const vat=vatVerified?(money(master.vatRate)??0):0;

    await prisma.$transaction(async tx=>{
      let categoryId=null;
      if(master.categoryName){
        const categoryRows=await tx.$queryRaw`SELECT "id" FROM "ProductCategory" WHERE "companyId"=${company} AND "name"=${master.categoryName} LIMIT 1`;
        categoryId=categoryRows[0]?.id||uid();
        if(!categoryRows[0])await tx.$executeRaw`INSERT INTO "ProductCategory" ("id","companyId","name") VALUES (${categoryId},${company},${master.categoryName})`;
      }
      if(!existing[0]){
        await tx.$executeRaw`INSERT INTO "Product" ("id","companyId","categoryId","sku","name","unit","vatRate","vatVerified","salePrice","costPrice","trackStock","active","masterProductId") VALUES (${productId},${company},${categoryId},${master.sourceCode},${master.name},'PIECE',${vat},${vatVerified},${basePrice},${cost},true,true,${master.id})`;
        const barcodes=await tx.$queryRaw`SELECT "barcode" FROM "MasterProductBarcode" WHERE "masterProductId"=${master.id} AND "scanEnabled"=true ORDER BY "barcode"`;
        for(const row of barcodes){
          const companyDuplicate=await tx.$queryRaw`SELECT pb."id" FROM "ProductBarcode" pb JOIN "Product" p ON p."id"=pb."productId" WHERE p."companyId"=${company} AND pb."barcode"=${row.barcode} LIMIT 1`;
          if(!companyDuplicate[0])await tx.$executeRaw`INSERT INTO "ProductBarcode" ("id","productId","barcode") VALUES (${uid()},${productId},${row.barcode})`;
        }
      }else{
        await tx.$executeRaw`UPDATE "Product" SET "active"=true,"salePrice"=${basePrice},"costPrice"=${cost},"vatRate"=${vat},"vatVerified"=${vatVerified},"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${productId}`;
      }
      for(const config of body.storeConfigs){
        await tx.$executeRaw`INSERT INTO "StoreProduct" ("id","storeId","productId","salePrice","active") VALUES (${uid()},${config.storeId},${productId},${config.salePrice??basePrice},${config.active}) ON CONFLICT ("storeId","productId") DO UPDATE SET "salePrice"=EXCLUDED."salePrice","active"=EXCLUDED."active","updatedAt"=CURRENT_TIMESTAMP`;
      }
    });
    res.status(existing[0]?200:201).json({id:productId,name:master.name,vatVerified});
  }catch(error){next(error)}
});

router.get("/catalog",requireCompanyModule("INVENTORY"),async(req,res,next)=>{
  try{
    const company=companyId(req);
    const q=String(req.query.q||"").trim();
    const like=`%${q}%`;
    const rows=await prisma.$queryRaw`
      SELECT p."id",p."sku",p."name",p."description",p."unit",p."salePrice",p."costPrice",p."vatRate",p."vatVerified",p."trackStock",p."active",p."masterProductId",p."categoryId",p."subcategoryId",
             p."staffPrice",p."deliveryPrice",p."minOrderQuantity",p."capacity",p."allowDiscount",p."allowPosPriceChange",p."freeSalePrice",p."negativeStockWarning",p."isSet",p."isRecipe",p."discountA",p."discountB",p."discountC",
             c."name" AS "categoryName",sc."name" AS "subcategoryName",COALESCE(pc."name",mp."brandName") AS "productCompanyName",lp."supplierName",
             (EXISTS(SELECT 1 FROM "SupplierProductLink" spl WHERE spl."companyId"=${company} AND spl."productId"=p."id" AND spl."active"=true) OR lp."supplierName" IS NOT NULL) AS "hasSupplier",
             COALESCE((SELECT json_agg(jsonb_build_object('id',pb."id",'barcode',pb."barcode",'unitMultiplier',pb."unitMultiplier",'salePrice',pb."salePrice",'name',pb."name",'updatedAt',pb."updatedAt") ORDER BY pb."barcode") FROM "ProductBarcode" pb WHERE pb."productId"=p."id"),'[]') AS barcodes,
             COALESCE(json_agg(DISTINCT jsonb_build_object('storeId',s."id",'storeName',s."name",'salePrice',sp."salePrice",'active',sp."active",'currentStock',sp."currentStock",'minStock',sp."minStock")) FILTER (WHERE s."id" IS NOT NULL),'[]') AS stores
      FROM "Product" p
      LEFT JOIN "ProductCategory" c ON c."id"=p."categoryId"
      LEFT JOIN "ProductSubcategory" sc ON sc."id"=p."subcategoryId"
      LEFT JOIN "ManagementProductCompany" pc ON pc."id"=p."productCompanyId"
      LEFT JOIN "MasterProduct" mp ON mp."id"=p."masterProductId"
      LEFT JOIN LATERAL (
        SELECT history."supplierName" FROM (
          SELECT sup."name" AS "supplierName",0 AS priority,spl."updatedAt" AS at
          FROM "SupplierProductLink" spl JOIN "Supplier" sup ON sup."id"=spl."supplierId" AND sup."companyId"=${company}
          WHERE spl."companyId"=${company} AND spl."productId"=p."id" AND spl."active"=true
          UNION ALL
          SELECT sup."name" AS "supplierName",1 AS priority,mapping."lastSeenAt" AS at
          FROM "SupplierProductMapping" mapping JOIN "Supplier" sup ON sup."id"=mapping."supplierId" AND sup."companyId"=${company}
          WHERE mapping."companyId"=${company} AND mapping."productId"=p."id"
          UNION ALL
          SELECT sup."name" AS "supplierName",2 AS priority,doc."createdAt" AS at
          FROM "PurchaseDocumentLine" line JOIN "PurchaseDocument" doc ON doc."id"=line."purchaseDocumentId" AND doc."companyId"=${company} LEFT JOIN "Supplier" sup ON sup."id"=doc."supplierId"
          WHERE line."productId"=p."id" AND doc."status"='APPROVED'
          UNION ALL
          SELECT sup."name" AS "supplierName",3 AS priority,ord."createdAt" AS at
          FROM "PurchaseOrderLine" line JOIN "PurchaseOrder" ord ON ord."id"=line."orderId" AND ord."companyId"=${company} LEFT JOIN "Supplier" sup ON sup."id"=ord."supplierId"
          WHERE line."productId"=p."id" AND ord."status" IN ('FINAL','INVOICED')
        ) history WHERE history."supplierName" IS NOT NULL ORDER BY history.priority,history.at DESC LIMIT 1
      ) lp ON true
      LEFT JOIN "StoreProduct" sp ON sp."productId"=p."id"
      LEFT JOIN "Store" s ON s."id"=sp."storeId" AND s."companyId"=${company}
      WHERE p."companyId"=${company} AND (${q===""} OR p."name" ILIKE ${like} OR p."sku" ILIKE ${like})
      GROUP BY p."id",c."name",sc."name",pc."name",mp."brandName",lp."supplierName" ORDER BY p."name" LIMIT 500`;
    res.setHeader("Cache-Control","no-store, no-cache, must-revalidate, private");
    res.setHeader("Pragma","no-cache");
    res.setHeader("Expires","0");
    res.json(rows);
  }catch(error){next(error)}
});

router.get("/:productId/details",requireCompanyModule("INVENTORY"),async(req,res,next)=>{
  try{
    const company=companyId(req),productId=String(req.params.productId);
    if(!await ownedProduct(company,productId))return res.status(404).json({error:"Δεν βρέθηκε το προϊόν."});
    const [supplierCodes,purchases,stats,lastEvents,suppliers]=await Promise.all([
      prisma.$queryRaw`WITH links AS (
        SELECT spl."id",spl."supplierId",spl."supplierCode",spl."updatedAt",0 AS priority FROM "SupplierProductLink" spl
        WHERE spl."companyId"=${company} AND spl."productId"=${productId} AND spl."active"=true
        UNION ALL
        SELECT m."id",m."supplierId",m."supplierItemCode" AS "supplierCode",m."updatedAt",1 AS priority FROM "SupplierProductMapping" m
        WHERE m."companyId"=${company} AND m."productId"=${productId} AND NOT EXISTS (SELECT 1 FROM "SupplierProductLink" spl WHERE spl."companyId"=${company} AND spl."productId"=${productId} AND spl."supplierId"=m."supplierId" AND spl."active"=true)
      ) SELECT DISTINCT ON (links."supplierId") links."id",links."supplierId",s."name" AS "supplierName",links."supplierCode",links."updatedAt",
        COALESCE(lp."unitCost",pm."lastUnitCost",0) AS "lastCost",COALESCE(lp."documentDate",pm."lastSeenAt") AS "lastPurchaseAt"
        FROM links JOIN "Supplier" s ON s."id"=links."supplierId" AND s."companyId"=${company}
        LEFT JOIN "SupplierProductMapping" pm ON pm."companyId"=${company} AND pm."supplierId"=links."supplierId" AND pm."productId"=${productId}
        LEFT JOIN LATERAL (SELECT history."unitCost",history."documentDate" FROM (
          SELECT l."unitCost",d."documentDate",d."createdAt" FROM "PurchaseDocumentLine" l JOIN "PurchaseDocument" d ON d."id"=l."purchaseDocumentId" WHERE l."productId"=${productId} AND d."supplierId"=links."supplierId" AND d."companyId"=${company} AND d."status"='APPROVED'
          UNION ALL SELECT l."unitCost",o."createdAt",o."createdAt" FROM "PurchaseOrderLine" l JOIN "PurchaseOrder" o ON o."id"=l."orderId" WHERE l."productId"=${productId} AND o."supplierId"=links."supplierId" AND o."companyId"=${company} AND o."status" IN ('FINAL','INVOICED')
        ) history ORDER BY history."documentDate" DESC,history."createdAt" DESC LIMIT 1) lp ON true
        ORDER BY links."supplierId",links.priority,s."name"`,
      prisma.$queryRaw`SELECT * FROM (
        SELECT d."id",d."documentNumber",d."documentDate",s."name" AS "supplierName",l."quantity",l."unit",l."unitsPerPackage",l."unitCost",l."netAmount",l."vatRate",l."vatAmount",l."grossAmount",d."createdAt"
        FROM "PurchaseDocumentLine" l JOIN "PurchaseDocument" d ON d."id"=l."purchaseDocumentId" AND d."companyId"=${company} LEFT JOIN "Supplier" s ON s."id"=d."supplierId" WHERE l."productId"=${productId} AND d."status"='APPROVED'
        UNION ALL
        SELECT o."id",o."invoiceNumber",o."createdAt",s."name",l."quantity",COALESCE(l."invoiceUnit",'PIECE'),l."stockUnitsPerInvoiceUnit",l."unitCost",l."netAmount",l."vatRate",l."vatAmount",l."grossAmount",o."createdAt"
        FROM "PurchaseOrderLine" l JOIN "PurchaseOrder" o ON o."id"=l."orderId" AND o."companyId"=${company} LEFT JOIN "Supplier" s ON s."id"=o."supplierId"
        WHERE l."productId"=${productId} AND o."status" IN ('FINAL','INVOICED') AND NOT EXISTS (
          SELECT 1 FROM "PurchaseDocumentLine" document_line JOIN "PurchaseDocument" document ON document."id"=document_line."purchaseDocumentId"
          WHERE document."companyId"=${company} AND document."status"='APPROVED' AND document_line."productId"=${productId}
            AND (document_line."purchaseOrderLineId"=l."id" OR (document."supplierId"=o."supplierId" AND NULLIF(TRIM(document."documentNumber"),'')=NULLIF(TRIM(o."invoiceNumber"),'')))
        )
      ) purchase_history ORDER BY "documentDate" DESC,"createdAt" DESC LIMIT 250`,
      prisma.$queryRaw`SELECT
        COALESCE(SUM(sl."quantity") FILTER (WHERE sale."status"='COMPLETED'),0) AS "soldQuantity",
        COALESCE(SUM(sl."lineTotal") FILTER (WHERE sale."status"='COMPLETED'),0) AS "salesGross",
        COALESCE(SUM(sl."lineTotal"/(1+sl."vatRate"/100)) FILTER (WHERE sale."status"='COMPLETED'),0) AS "salesNet",
        MAX(sale."occurredAt") FILTER (WHERE sale."status"='COMPLETED') AS "lastSaleAt"
        FROM "SaleLine" sl JOIN "Sale" sale ON sale."id"=sl."saleId" AND sale."companyId"=${company} WHERE sl."productId"=${productId}`,
      prisma.$queryRaw`SELECT
        (SELECT MAX(st."finalizedAt") FROM "StocktakeLine" line JOIN "Stocktake" st ON st."id"=line."stocktakeId" WHERE line."productId"=${productId} AND st."companyId"=${company} AND st."status"='FINALIZED') AS "lastStocktakeAt",
        (SELECT MAX(h."createdAt") FROM "ProductPriceHistory" h WHERE h."productId"=${productId} AND h."companyId"=${company}) AS "lastPriceChangeAt",
        (SELECT COALESCE(SUM(sp."currentStock"),0) FROM "StoreProduct" sp JOIN "Store" s ON s."id"=sp."storeId" WHERE sp."productId"=${productId} AND s."companyId"=${company}) AS "currentStock"`,
      prisma.$queryRaw`SELECT "id","name" FROM "Supplier" WHERE "companyId"=${company} AND "active"=true ORDER BY "name"`
    ]);
    const purchaseSummary=purchases.reduce((a,row)=>{a.quantity+=Number(row.quantity||0)*(row.unit==='PACKAGE'?Number(row.unitsPerPackage||1):1);a.net+=Number(row.netAmount||0);a.gross+=Number(row.grossAmount||0);return a},{quantity:0,net:0,gross:0});
    res.json({supplierCodes,purchases,suppliers,statistics:{...stats[0],...lastEvents[0],purchaseQuantity:purchaseSummary.quantity,purchasesNet:purchaseSummary.net,purchasesGross:purchaseSummary.gross}});
  }catch(error){next(error)}
});

router.patch("/:productId/card",requireCompanyModule("INVENTORY"),async(req,res,next)=>{
  try{
    const company=companyId(req);
    const product=await ownedProduct(company,req.params.productId);
    if(!product)return res.status(404).json({error:"Δεν βρέθηκε το προϊόν."});
    const body=z.object({
      name:z.string().trim().min(2).max(250),sku:z.string().trim().max(80).optional().or(z.literal("")),description:z.string().trim().max(1000).optional().or(z.literal("")),supplierName:z.string().trim().max(250).optional().or(z.literal("")),
      categoryId:z.string().min(1).nullable().optional(),subcategoryId:z.string().min(1).nullable().optional(),categoryName:z.string().trim().max(160).optional().or(z.literal("")),unit:z.enum(["PIECE","KG","LITER","PACKAGE"]),salePrice:z.coerce.number().min(0),costPrice:z.coerce.number().min(0),
      vatRate:z.coerce.number().min(0).max(100),vatVerified:z.boolean(),trackStock:z.boolean(),active:z.boolean(),
      staffPrice:z.coerce.number().min(0).nullable().optional(),deliveryPrice:z.coerce.number().min(0).nullable().optional(),minOrderQuantity:z.coerce.number().min(0).nullable().optional(),capacity:z.coerce.number().min(0).nullable().optional(),
      allowDiscount:z.boolean().default(true),allowPosPriceChange:z.boolean().default(false),freeSalePrice:z.boolean().default(false),negativeStockWarning:z.boolean().default(false),isSet:z.boolean().default(false),isRecipe:z.boolean().default(false),
      discountA:z.coerce.number().min(0).max(100).default(0),discountB:z.coerce.number().min(0).max(100).default(0),discountC:z.coerce.number().min(0).max(100).default(0),
      supplierCodes:z.array(z.object({supplierId:z.string().min(1),supplierCode:z.string().trim().max(120).default("")})).max(100).default([]),
      barcodes:z.array(z.object({barcode:z.string().trim().min(3).max(80),unitMultiplier:z.coerce.number().positive().max(100000),salePrice:z.coerce.number().min(0).nullable().optional(),name:z.string().trim().max(120).nullable().optional()})).max(30),
      stores:z.array(z.object({storeId:z.string().min(1),active:z.boolean(),salePrice:z.coerce.number().min(0),minStock:z.coerce.number().min(0).nullable()})).max(500)
    }).parse(req.body||{});
    const storeIds=[...new Set(body.stores.map(row=>row.storeId))];
    const validStores=await prisma.store.findMany({where:{companyId:company,id:{in:storeIds}},select:{id:true}});
    if(validStores.length!==storeIds.length)return res.status(400).json({error:"Υπάρχει μη έγκυρο κατάστημα."});
    let selectedCategoryId=body.categoryId||null,selectedSubcategoryId=body.subcategoryId||null;
    if(selectedCategoryId){const category=await prisma.$queryRaw`SELECT "id" FROM "ProductCategory" WHERE "id"=${selectedCategoryId} AND "companyId"=${company} AND "active"=true LIMIT 1`;if(!category[0])return res.status(400).json({error:"Η κατηγορία δεν είναι έγκυρη."})}
    if(selectedSubcategoryId){const subcategory=await prisma.$queryRaw`SELECT "id" FROM "ProductSubcategory" WHERE "id"=${selectedSubcategoryId} AND "categoryId"=${selectedCategoryId||''} AND "companyId"=${company} AND "active"=true LIMIT 1`;if(!subcategory[0])return res.status(400).json({error:"Η υποκατηγορία δεν ανήκει στην επιλεγμένη κατηγορία."})}
    if(!body.supplierCodes.length&&body.supplierName){
      const inferred=await prisma.$queryRaw`SELECT "id" FROM "Supplier" WHERE "companyId"=${company} AND "active"=true AND LOWER(REGEXP_REPLACE(TRIM("name"),'[[:space:]]+',' ','g'))=LOWER(REGEXP_REPLACE(TRIM(${body.supplierName}),'[[:space:]]+',' ','g')) LIMIT 2`;
      if(inferred.length===1)body.supplierCodes=[{supplierId:inferred[0].id,supplierCode:""}];
    }
    const supplierIds=[...new Set(body.supplierCodes.map(row=>row.supplierId))];
    if(supplierIds.length!==body.supplierCodes.length)return res.status(400).json({error:"Ο ίδιος προμηθευτής έχει επιλεγεί περισσότερες από μία φορές."});
    if(supplierIds.length){const validSuppliers=await prisma.$queryRaw`SELECT "id" FROM "Supplier" WHERE "companyId"=${company} AND "active"=true AND "id"=ANY(${supplierIds}::text[])`;if(validSuppliers.length!==supplierIds.length)return res.status(400).json({error:"Υπάρχει μη έγκυρος προμηθευτής."})}
    if(body.sku){const duplicate=await prisma.$queryRaw`SELECT "id" FROM "Product" WHERE "companyId"=${company} AND "sku"=${body.sku} AND "id"<>${product.id} LIMIT 1`;if(duplicate[0])return res.status(409).json({error:"Ο κωδικός/SKU χρησιμοποιείται ήδη σε άλλο προϊόν."})}
    const barcodeValues=[...new Set(body.barcodes.map(row=>row.barcode))];
    if(barcodeValues.length!==body.barcodes.length)return res.status(400).json({error:"Το ίδιο barcode έχει καταχωριστεί περισσότερες από μία φορές."});
    if(barcodeValues.length){const duplicate=await prisma.$queryRaw`SELECT pb."barcode" FROM "ProductBarcode" pb JOIN "Product" p ON p."id"=pb."productId" WHERE p."companyId"=${company} AND pb."productId"<>${product.id} AND pb."barcode"=ANY(${barcodeValues}::text[]) LIMIT 1`;if(duplicate[0])return res.status(409).json({error:`Το barcode ${duplicate[0].barcode} ανήκει ήδη σε άλλο προϊόν.`})}
    const [selectedCategory,selectedSubcategory,oldBarcodes,oldSupplierCodes,oldStores]=await Promise.all([
      selectedCategoryId?prisma.$queryRaw`SELECT "name" FROM "ProductCategory" WHERE "id"=${selectedCategoryId} AND "companyId"=${company} LIMIT 1`:[],
      selectedSubcategoryId?prisma.$queryRaw`SELECT "name" FROM "ProductSubcategory" WHERE "id"=${selectedSubcategoryId} AND "companyId"=${company} LIMIT 1`:[],
      prisma.$queryRaw`SELECT "barcode","unitMultiplier","salePrice","name" FROM "ProductBarcode" WHERE "productId"=${product.id} ORDER BY "barcode"`,
      prisma.$queryRaw`SELECT "supplierId","supplierCode" FROM "SupplierProductLink" WHERE "companyId"=${company} AND "productId"=${product.id} AND "active"=true ORDER BY "supplierId"`,
      prisma.$queryRaw`SELECT sp."storeId",sp."active",sp."salePrice",sp."minStock" FROM "StoreProduct" sp JOIN "Store" s ON s."id"=sp."storeId" WHERE sp."productId"=${product.id} AND s."companyId"=${company} ORDER BY sp."storeId"`
    ]);
    const comparable=value=>value===null||value===undefined||value===""?null:value;
    const changes=[];
    const changed=(field,label,before,after)=>{const oldValue=comparable(before),newValue=comparable(after);if(JSON.stringify(oldValue)!==JSON.stringify(newValue))changes.push({field,label,before:oldValue,after:newValue})};
    changed("name","Περιγραφή",product.name,body.name);
    changed("sku","Κωδικός / SKU",product.sku,body.sku);
    changed("category","Κατηγορία",product.categoryName,selectedCategory[0]?.name||body.categoryName||null);
    changed("subcategory","Υποκατηγορία",product.subcategoryName,selectedSubcategory[0]?.name||null);
    changed("unit","Μονάδα",product.unit,body.unit);
    changed("costPrice","Τιμή αγοράς",money(product.costPrice),body.costPrice);
    changed("vatRate","ΦΠΑ",money(product.vatRate),body.vatRate);
    for(const [field,label] of [["vatVerified","ΦΠΑ επιβεβαιωμένος"],["trackStock","Παρακολούθηση stock"],["active","Ενεργό"],["allowDiscount","Επιτρέπεται έκπτωση"],["allowPosPriceChange","Αλλαγή τιμής στο POS"],["freeSalePrice","Ελεύθερη τιμή στο POS"],["negativeStockWarning","Ειδοποίηση αρνητικού stock"],["isSet","SET"],["isRecipe","Συνταγή"]])changed(field,label,Boolean(product[field]),Boolean(body[field]));
    const normalizeRows=(rows,keys)=>rows.map(row=>Object.fromEntries(keys.map(key=>[key,comparable(key==="salePrice"||key==="minStock"||key==="unitMultiplier"?money(row[key]):row[key])]))).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
    changed("barcodes","Barcodes",normalizeRows(oldBarcodes,["barcode","unitMultiplier","salePrice","name"]),normalizeRows(body.barcodes,["barcode","unitMultiplier","salePrice","name"]));
    changed("supplierCodes","Κωδικοί προμηθευτών",normalizeRows(oldSupplierCodes,["supplierId","supplierCode"]),normalizeRows(body.supplierCodes,["supplierId","supplierCode"]));
    /* MWS_STORE_PRICE_SYNC_V1 */
    // If a store followed the old base retail price, keep it aligned with the new
    // base retail price. Deliberate store-specific overrides stay untouched.
    const previousBasePrice=money(product.salePrice)??0;
    if(Math.abs(previousBasePrice-body.salePrice)>0.000001){
      for(const row of body.stores){
        const currentStorePrice=money(row.salePrice);
        if(currentStorePrice===null||Math.abs(currentStorePrice-previousBasePrice)<=0.000001){
          row.salePrice=body.salePrice;
        }
      }
    }
    const auditChangesByStore=new Map(body.stores.map(row=>{
      const storeChanges=[...changes],oldRow=oldStores.find(item=>item.storeId===row.storeId);
      const storeChanged=(field,label,before,after)=>{const oldValue=comparable(before),newValue=comparable(after);if(JSON.stringify(oldValue)!==JSON.stringify(newValue))storeChanges.push({field,label,before:oldValue,after:newValue})};
      storeChanged("storeSalePrice","Λιανική καταστήματος",money(oldRow?.salePrice??product.salePrice),money(row.salePrice));
      storeChanged("storeActive","Ενεργό στο κατάστημα",Boolean(oldRow?.active),Boolean(row.active));
      storeChanged("minStock","Alarm stock",money(oldRow?.minStock),money(row.minStock));
      return [row.storeId,storeChanges];
    }));
    await prisma.$transaction(async tx=>{
      let categoryId=selectedCategoryId;
      if(!categoryId&&body.categoryName){const rows=await tx.$queryRaw`SELECT "id" FROM "ProductCategory" WHERE "companyId"=${company} AND "name"=${body.categoryName} LIMIT 1`;categoryId=rows[0]?.id||uid();if(!rows[0])await tx.$executeRaw`INSERT INTO "ProductCategory" ("id","companyId","name") VALUES (${categoryId},${company},${body.categoryName})`}
      if(money(product.salePrice)!==body.salePrice)await tx.$executeRaw`INSERT INTO "ProductPriceHistory" ("id","companyId","productId","oldPrice","newPrice","changeType","createdByUserId") VALUES (${uid()},${company},${product.id},${money(product.salePrice)},${body.salePrice},'PRODUCT_CARD',${req.user.id})`;
      await tx.$executeRaw`UPDATE "Product" SET "name"=${body.name},"sku"=${body.sku||null},"description"=${body.description||null},"categoryId"=${categoryId},"subcategoryId"=${selectedSubcategoryId},"unit"=${body.unit},"salePrice"=${body.salePrice},"costPrice"=${body.costPrice},"vatRate"=${body.vatRate},"vatVerified"=${body.vatVerified},"trackStock"=${body.trackStock},"active"=${body.active},"staffPrice"=${body.staffPrice??null},"deliveryPrice"=${body.deliveryPrice??null},"minOrderQuantity"=${body.minOrderQuantity??null},"capacity"=${body.capacity??null},"allowDiscount"=${body.allowDiscount},"allowPosPriceChange"=${body.allowPosPriceChange},"freeSalePrice"=${body.freeSalePrice},"negativeStockWarning"=${body.negativeStockWarning},"isSet"=${body.isSet},"isRecipe"=${body.isRecipe},"discountA"=${body.discountA},"discountB"=${body.discountB},"discountC"=${body.discountC},"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${product.id}`;
      await tx.$executeRaw`DELETE FROM "ProductBarcode" WHERE "productId"=${product.id}`;
      for(const row of body.barcodes)await tx.$executeRaw`INSERT INTO "ProductBarcode" ("id","productId","barcode","unitMultiplier","salePrice","name","updatedAt") VALUES (${uid()},${product.id},${row.barcode},${row.unitMultiplier},${row.salePrice??null},${row.name||null},CURRENT_TIMESTAMP)`;
      await tx.$executeRaw`UPDATE "SupplierProductLink" SET "active"=false,"updatedBy"=${req.user.id},"updatedAt"=NOW() WHERE "companyId"=${company} AND "productId"=${product.id} AND NOT ("supplierId"=ANY(${supplierIds}::text[]))`;
      for(const row of body.supplierCodes)await tx.$executeRaw`INSERT INTO "SupplierProductLink" ("id","companyId","supplierId","productId","supplierCode","active","source","updatedBy","updatedByName") VALUES (${uid()},${company},${row.supplierId},${product.id},${row.supplierCode||null},true,'PRODUCT_CARD',${req.user.id},${req.user.fullName||req.user.email||'BackOffice'}) ON CONFLICT ("companyId","supplierId","productId") DO UPDATE SET "supplierCode"=COALESCE(NULLIF(EXCLUDED."supplierCode",''),"SupplierProductLink"."supplierCode"),"active"=true,"source"='PRODUCT_CARD',"updatedBy"=EXCLUDED."updatedBy","updatedByName"=EXCLUDED."updatedByName","updatedAt"=NOW()`;
      for(const row of body.stores)await tx.$executeRaw`INSERT INTO "StoreProduct" ("id","storeId","productId","salePrice","minStock","active") VALUES (${uid()},${row.storeId},${product.id},${row.salePrice},${row.minStock},${row.active}) ON CONFLICT ("storeId","productId") DO UPDATE SET "salePrice"=EXCLUDED."salePrice","minStock"=EXCLUDED."minStock","active"=EXCLUDED."active","updatedAt"=CURRENT_TIMESTAMP`;
      for(const storeId of storeIds){const storeChanges=auditChangesByStore.get(storeId)||[];if(storeChanges.length)await tx.$executeRaw`INSERT INTO "StoreOperatorAudit" ("id","companyId","storeId","operatorId","actorId","eventType","details") VALUES (${uid()},${company},${storeId},${req.user.operatorId||req.user.id},${req.user.id},'PRODUCT_CARD_UPDATED',${JSON.stringify({productId:product.id,productName:body.name,sku:body.sku||product.sku||null,changes:storeChanges,actorName:req.user.fullName||req.user.name||req.user.email||'BackOffice',terminalPos:'BACKOFFICE'})}::jsonb)`}
    });
    res.json({ok:true,id:product.id});
  }catch(error){next(error)}
});

router.patch("/:productId/prices",requireCompanyModule("INVENTORY"),async(req,res,next)=>{
  try{
    const company=companyId(req);
    const product=await ownedProduct(company,req.params.productId);
    if(!product)return res.status(404).json({error:"Δεν βρέθηκε το προϊόν."});
    const body=z.object({
      basePrice:z.coerce.number().min(0),
      vatRate:z.coerce.number().min(0).max(100).optional(),
      vatVerified:z.boolean().optional(),
      stores:z.array(z.object({storeId:z.string().min(1),active:z.boolean(),salePrice:z.coerce.number().min(0).nullable()})).max(500)
    }).parse(req.body||{});
    const ids=[...new Set(body.stores.map(x=>x.storeId))];
    const valid=await prisma.store.findMany({where:{companyId:company,id:{in:ids}},select:{id:true}});
    if(valid.length!==ids.length)return res.status(400).json({error:"Υπάρχει μη έγκυρο κατάστημα."});
    await prisma.$transaction(async tx=>{
      const oldBase=money(product.salePrice);
      if(oldBase!==body.basePrice){
        await tx.$executeRaw`INSERT INTO "ProductPriceHistory" ("id","companyId","productId","oldPrice","newPrice","changeType","createdByUserId") VALUES (${uid()},${company},${product.id},${oldBase},${body.basePrice},'BASE_PRICE',${req.user.id})`;
      }
      await tx.$executeRaw`UPDATE "Product" SET "salePrice"=${body.basePrice},"vatRate"=${body.vatRate??money(product.vatRate)??0},"vatVerified"=${body.vatVerified??product.vatVerified},"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${product.id}`;
      for(const config of body.stores){
        const oldRows=await tx.$queryRaw`SELECT "salePrice","active" FROM "StoreProduct" WHERE "storeId"=${config.storeId} AND "productId"=${product.id} LIMIT 1`;
        const old=oldRows[0];
        const newPrice=config.salePrice===null?body.basePrice:config.salePrice;
        if(!old||money(old.salePrice)!==newPrice){
          await tx.$executeRaw`INSERT INTO "ProductPriceHistory" ("id","companyId","productId","storeId","oldPrice","newPrice","changeType","createdByUserId") VALUES (${uid()},${company},${product.id},${config.storeId},${old?money(old.salePrice):null},${newPrice},'STORE_PRICE',${req.user.id})`;
        }
        await tx.$executeRaw`INSERT INTO "StoreProduct" ("id","storeId","productId","salePrice","active") VALUES (${uid()},${config.storeId},${product.id},${newPrice},${config.active}) ON CONFLICT ("storeId","productId") DO UPDATE SET "salePrice"=EXCLUDED."salePrice","active"=EXCLUDED."active","updatedAt"=CURRENT_TIMESTAMP`;
      }
    });
    res.json({ok:true});
  }catch(error){next(error)}
});

router.post("/prices/bulk",requireCompanyModule("INVENTORY"),async(req,res,next)=>{
  try{
    const company=companyId(req);
    const body=z.object({productIds:z.array(z.string().min(1)).min(1).max(500),storeIds:z.array(z.string().min(1)).min(1).max(500),mode:z.enum(["SET","INCREASE_PERCENT","DECREASE_PERCENT"]),value:z.coerce.number().min(0).max(100000)}).parse(req.body||{});
    const productIds=[...new Set(body.productIds)],storeIds=[...new Set(body.storeIds)];
    const [products,stores]=await Promise.all([prisma.$queryRaw`SELECT "id","salePrice" FROM "Product" WHERE "companyId"=${company} AND "id"=ANY(${productIds}::text[])`,prisma.store.findMany({where:{companyId:company,id:{in:storeIds}},select:{id:true}})]);
    if(products.length!==productIds.length||stores.length!==storeIds.length)return res.status(400).json({error:"Υπάρχει μη έγκυρο προϊόν ή κατάστημα."});
    let changed=0;
    await prisma.$transaction(async tx=>{for(const product of products){for(const storeId of storeIds){const oldRows=await tx.$queryRaw`SELECT "salePrice" FROM "StoreProduct" WHERE "storeId"=${storeId} AND "productId"=${product.id} LIMIT 1`;const old=money(oldRows[0]?.salePrice??product.salePrice)??0;const nextPrice=Number((body.mode==="SET"?body.value:body.mode==="INCREASE_PERCENT"?old*(1+body.value/100):old*(1-body.value/100)).toFixed(2));if(nextPrice<0)throw Object.assign(new Error("Η νέα τιμή δεν μπορεί να είναι αρνητική."),{status:400});await tx.$executeRaw`INSERT INTO "ProductPriceHistory" ("id","companyId","productId","storeId","oldPrice","newPrice","changeType","createdByUserId") VALUES (${uid()},${company},${product.id},${storeId},${old},${nextPrice},'BULK_STORE_PRICE',${req.user.id})`;await tx.$executeRaw`INSERT INTO "StoreProduct" ("id","storeId","productId","salePrice","active") VALUES (${uid()},${storeId},${product.id},${nextPrice},true) ON CONFLICT ("storeId","productId") DO UPDATE SET "salePrice"=EXCLUDED."salePrice","updatedAt"=CURRENT_TIMESTAMP`;changed++}}});
    res.json({ok:true,changed,products:productIds.length,stores:storeIds.length});
  }catch(error){next(error)}
});

router.get("/:productId/price-history",requireCompanyModule("INVENTORY"),async(req,res,next)=>{
  try{
    const company=companyId(req);
    if(!await ownedProduct(company,req.params.productId))return res.status(404).json({error:"Δεν βρέθηκε το προϊόν."});
    const rows=await prisma.$queryRaw`SELECT h."id",h."oldPrice",h."newPrice",h."changeType",h."createdAt",s."name" AS "storeName" FROM "ProductPriceHistory" h LEFT JOIN "Store" s ON s."id"=h."storeId" WHERE h."companyId"=${company} AND h."productId"=${req.params.productId} ORDER BY h."createdAt" DESC LIMIT 100`;
    res.json(rows);
  }catch(error){next(error)}
});

router.get("/promotions/list",requireCompanyModule("INVENTORY"),async(req,res,next)=>{
  try{
    const company=companyId(req);
    const rows=await prisma.$queryRaw`
      SELECT pr."id",pr."name",pr."promotionType",pr."percentOff",pr."buyQuantity",pr."freeQuantity",pr."fixedPrice",pr."startsAt",pr."endsAt",pr."priority",pr."active",p."id" AS "productId",p."name" AS "productName",
             COALESCE(json_agg(jsonb_build_object('storeId',s."id",'storeName',s."name")) FILTER (WHERE s."id" IS NOT NULL),'[]') AS stores
      FROM "Promotion" pr JOIN "Product" p ON p."id"=pr."productId"
      LEFT JOIN "PromotionStore" ps ON ps."promotionId"=pr."id" LEFT JOIN "Store" s ON s."id"=ps."storeId"
      WHERE pr."companyId"=${company} GROUP BY pr."id",p."id" ORDER BY pr."startsAt" DESC LIMIT 500`;
    res.json(rows);
  }catch(error){next(error)}
});

router.post("/promotions",requireCompanyModule("INVENTORY"),async(req,res,next)=>{
  try{
    const company=companyId(req);
    const body=z.object({
      productId:z.string().min(1).optional(),barcode:z.string().trim().min(3).max(80).optional(),name:z.string().trim().min(1).max(180),promotionType:z.enum(["PERCENT","BUY_X_GET_Y","FIXED_PRICE"]),
      percentOff:z.coerce.number().gt(0).lte(100).nullable().optional(),buyQuantity:z.coerce.number().gt(0).nullable().optional(),freeQuantity:z.coerce.number().gt(0).nullable().optional(),fixedPrice:z.coerce.number().min(0).nullable().optional(),
      startsAt:z.coerce.date(),endsAt:z.coerce.date(),priority:z.coerce.number().int().min(0).max(9999).default(100),storeIds:z.array(z.string().min(1)).min(1).max(500)
    }).parse(req.body||{});
    if(body.endsAt<=body.startsAt)return res.status(400).json({error:"Η λήξη της προσφοράς πρέπει να είναι μετά την έναρξη."});
    if(body.promotionType==="PERCENT"&&!body.percentOff)return res.status(400).json({error:"Χρειάζεται ποσοστό έκπτωσης."});
    if(body.promotionType==="BUY_X_GET_Y"&&(!body.buyQuantity||!body.freeQuantity))return res.status(400).json({error:"Χρειάζονται ποσότητες αγοράς και δωρεάν τεμαχίων."});
    if(body.promotionType==="FIXED_PRICE"&&body.fixedPrice===null)return res.status(400).json({error:"Χρειάζεται τελική τιμή προσφοράς."});
    const product=body.productId?await ownedProduct(company,body.productId):body.barcode?await productByBarcode(company,body.barcode):null;
    if(!product)return res.status(404).json({error:"Δεν βρέθηκε ενεργό προϊόν με την επιλογή ή το barcode."});
    const ids=[...new Set(body.storeIds)];
    const valid=await prisma.store.findMany({where:{companyId:company,id:{in:ids}},select:{id:true}});
    if(valid.length!==ids.length)return res.status(400).json({error:"Υπάρχει μη έγκυρο κατάστημα στην προσφορά."});
    const promotionId=uid();
    await prisma.$transaction(async tx=>{
      await tx.$executeRaw`INSERT INTO "Promotion" ("id","companyId","productId","name","promotionType","percentOff","buyQuantity","freeQuantity","fixedPrice","startsAt","endsAt","priority","createdByUserId") VALUES (${promotionId},${company},${product.id},${body.name},${body.promotionType},${body.percentOff??null},${body.buyQuantity??null},${body.freeQuantity??null},${body.fixedPrice??null},${body.startsAt},${body.endsAt},${body.priority},${req.user.id})`;
      for(const storeId of ids)await tx.$executeRaw`INSERT INTO "PromotionStore" ("id","promotionId","storeId") VALUES (${uid()},${promotionId},${storeId})`;
    });
    res.status(201).json({id:promotionId});
  }catch(error){next(error)}
});

router.post("/promotions/import-excel",requireCompanyModule("INVENTORY"),async(req,res,next)=>{
  try{
    const company=companyId(req);
    const body=z.object({dataUrl:z.string().max(4200000),sourceStoreId:z.string().min(1),targetStoreIds:z.array(z.string().min(1)).max(500).default([])}).parse(req.body||{});
    const match=/^data:application\/(?:vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet|vnd\.ms-excel);base64,([A-Za-z0-9+/=]+)$/.exec(body.dataUrl);if(!match)return res.status(400).json({error:"Απαιτείται αρχείο Excel .xlsx ή .xls."});
    const storeIds=[...new Set([body.sourceStoreId,...body.targetStoreIds])];const valid=await prisma.store.findMany({where:{companyId:company,id:{in:storeIds}},select:{id:true}});if(valid.length!==storeIds.length)return res.status(400).json({error:"Υπάρχει μη έγκυρο κατάστημα."});
    const workbook=XLSX.read(Buffer.from(match[1],"base64"),{type:"buffer",cellDates:true}),sheet=workbook.Sheets[workbook.SheetNames[0]],rows=XLSX.utils.sheet_to_json(sheet,{defval:""});
    if(!rows.length||rows.length>1000)return res.status(400).json({error:"Το Excel πρέπει να περιέχει 1 έως 1.000 γραμμές."});
    const parsed=[];for(let i=0;i<rows.length;i++){const r=rows[i],barcode=String(r.Barcode||r.BARCODE||r.barcode||"").trim(),name=String(r["Όνομα προσφοράς"]||r.Name||r.name||"").trim(),type=String(r["Τύπος"]||r.Type||r.type||"").trim().toUpperCase();const product=await productByBarcode(company,barcode);if(!product)return res.status(400).json({error:`Γραμμή ${i+2}: δεν βρέθηκε προϊόν για barcode ${barcode||"(κενό)"}.`});const startsAt=new Date(r["Από"]||r.StartsAt||r.startsAt),endsAt=new Date(r["Έως"]||r.EndsAt||r.endsAt);if(!name||!["PERCENT","BUY_X_GET_Y","FIXED_PRICE"].includes(type)||Number.isNaN(startsAt.getTime())||Number.isNaN(endsAt.getTime())||endsAt<=startsAt)return res.status(400).json({error:`Γραμμή ${i+2}: ελέγξτε όνομα, τύπο και ημερομηνίες.`});parsed.push({product,name,type,startsAt,endsAt,percentOff:Number(r["Έκπτωση %"]||r.PercentOff||0)||null,buyQuantity:Number(r["Αγορά X"]||r.BuyX||0)||null,freeQuantity:Number(r["Δωρεάν Y"]||r.FreeY||0)||null,fixedPrice:Number(r["Τελική τιμή"]||r.FixedPrice||0)||null,priority:Number(r["Προτεραιότητα"]||r.Priority||100)})}
    await prisma.$transaction(async tx=>{for(const row of parsed){const promotionId=uid();await tx.$executeRaw`INSERT INTO "Promotion" ("id","companyId","productId","name","promotionType","percentOff","buyQuantity","freeQuantity","fixedPrice","startsAt","endsAt","priority","createdByUserId") VALUES (${promotionId},${company},${row.product.id},${row.name},${row.type},${row.percentOff},${row.buyQuantity},${row.freeQuantity},${row.fixedPrice},${row.startsAt},${row.endsAt},${row.priority},${req.user.id})`;for(const storeId of storeIds)await tx.$executeRaw`INSERT INTO "PromotionStore" ("id","promotionId","storeId") VALUES (${uid()},${promotionId},${storeId})`}});
    res.status(201).json({ok:true,created:parsed.length,stores:storeIds.length});
  }catch(error){next(error)}
});

router.patch("/promotions/:promotionId",requireCompanyModule("INVENTORY"),async(req,res,next)=>{
  try{
    const company=companyId(req);
    const body=z.object({active:z.boolean()}).parse(req.body||{});
    const count=await prisma.$executeRaw`UPDATE "Promotion" SET "active"=${body.active},"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${req.params.promotionId} AND "companyId"=${company}`;
    if(!count)return res.status(404).json({error:"Δεν βρέθηκε η προσφορά."});
    res.json({ok:true});
  }catch(error){next(error)}
});

router.get("/stocktakes/list",requireCompanyModule("INVENTORY"),async(req,res,next)=>{
  try{
    const company=companyId(req);
    const rows=await prisma.$queryRaw`SELECT st."id",st."name",st."status",st."startedAt",st."finalizedAt",s."name" AS "storeName",COUNT(sl."id")::int AS "lineCount",COUNT(sl."id") FILTER (WHERE sl."countedQuantity" IS NOT NULL)::int AS "countedCount" FROM "Stocktake" st JOIN "Store" s ON s."id"=st."storeId" LEFT JOIN "StocktakeLine" sl ON sl."stocktakeId"=st."id" WHERE st."companyId"=${company} GROUP BY st."id",s."name" ORDER BY st."startedAt" DESC LIMIT 100`;
    res.json(rows);
  }catch(error){next(error)}
});

router.post("/stocktakes",requireCompanyModule("INVENTORY"),async(req,res,next)=>{
  try{
    const company=companyId(req);
    const body=z.object({storeId:z.string().min(1),name:z.string().trim().min(1).max(180)}).parse(req.body||{});
    if(!await ownedStore(company,body.storeId))return res.status(404).json({error:"Δεν βρέθηκε το κατάστημα."});
    const stocktakeId=uid();
    await prisma.$transaction(async tx=>{
      await tx.$executeRaw`INSERT INTO "Stocktake" ("id","companyId","storeId","name","createdByUserId") VALUES (${stocktakeId},${company},${body.storeId},${body.name},${req.user.id})`;
      const products=await tx.$queryRaw`SELECT p."id",sp."currentStock",p."costPrice" FROM "StoreProduct" sp JOIN "Product" p ON p."id"=sp."productId" WHERE sp."storeId"=${body.storeId} AND sp."active"=true AND p."companyId"=${company} AND p."active"=true ORDER BY p."name"`;
      for(const row of products)await tx.$executeRaw`INSERT INTO "StocktakeLine" ("id","stocktakeId","productId","expectedQuantity","unitCost") VALUES (${uid()},${stocktakeId},${row.id},${money(row.currentStock)??0},${money(row.costPrice)??0})`;
    });
    res.status(201).json({id:stocktakeId});
  }catch(error){next(error)}
});

router.get("/stocktakes/:stocktakeId",requireCompanyModule("INVENTORY"),async(req,res,next)=>{
  try{
    const company=companyId(req);
    const header=await prisma.$queryRaw`SELECT st."id",st."name",st."status",st."storeId",st."startedAt",st."finalizedAt",s."name" AS "storeName" FROM "Stocktake" st JOIN "Store" s ON s."id"=st."storeId" WHERE st."id"=${req.params.stocktakeId} AND st."companyId"=${company} LIMIT 1`;
    if(!header[0])return res.status(404).json({error:"Δεν βρέθηκε η απογραφή."});
    const lines=await prisma.$queryRaw`SELECT sl."id",sl."productId",p."name",p."sku",sl."expectedQuantity",sl."countedQuantity",sl."unitCost",(COALESCE(sl."countedQuantity",sl."expectedQuantity")-sl."expectedQuantity") AS difference,((COALESCE(sl."countedQuantity",sl."expectedQuantity")-sl."expectedQuantity")*COALESCE(sl."unitCost",0)) AS "differenceValue" FROM "StocktakeLine" sl JOIN "Product" p ON p."id"=sl."productId" WHERE sl."stocktakeId"=${req.params.stocktakeId} ORDER BY p."name"`;
    res.json({...header[0],lines});
  }catch(error){next(error)}
});

router.patch("/stocktakes/:stocktakeId/lines/:lineId",requireCompanyModule("INVENTORY"),async(req,res,next)=>{
  try{
    const company=companyId(req);
    const body=z.object({countedQuantity:z.coerce.number().min(0)}).parse(req.body||{});
    const rows=await prisma.$queryRaw`SELECT sl."id" FROM "StocktakeLine" sl JOIN "Stocktake" st ON st."id"=sl."stocktakeId" WHERE sl."id"=${req.params.lineId} AND st."id"=${req.params.stocktakeId} AND st."companyId"=${company} AND st."status"='DRAFT' LIMIT 1`;
    if(!rows[0])return res.status(404).json({error:"Δεν βρέθηκε ανοιχτή γραμμή απογραφής."});
    await prisma.$executeRaw`UPDATE "StocktakeLine" SET "countedQuantity"=${body.countedQuantity},"countedByUserId"=${req.user.id},"countedAt"=CURRENT_TIMESTAMP,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${req.params.lineId}`;
    res.json({ok:true});
  }catch(error){next(error)}
});

router.post("/stocktakes/:stocktakeId/finalize",requireCompanyModule("INVENTORY"),async(req,res,next)=>{
  try{
    const company=companyId(req);
    const headers=await prisma.$queryRaw`SELECT "id","storeId","status" FROM "Stocktake" WHERE "id"=${req.params.stocktakeId} AND "companyId"=${company} LIMIT 1`;
    const stocktake=headers[0];
    if(!stocktake)return res.status(404).json({error:"Δεν βρέθηκε η απογραφή."});
    if(stocktake.status!=="DRAFT")return res.status(409).json({error:"Η απογραφή έχει ήδη οριστικοποιηθεί."});
    const missing=await prisma.$queryRaw`SELECT COUNT(*)::int AS count FROM "StocktakeLine" WHERE "stocktakeId"=${stocktake.id} AND "countedQuantity" IS NULL`;
    if((missing[0]?.count||0)>0)return res.status(409).json({error:`Υπάρχουν ${missing[0].count} προϊόντα χωρίς φυσική καταμέτρηση.`});
    await prisma.$transaction(async tx=>{
      const lines=await tx.$queryRaw`SELECT "productId","expectedQuantity","countedQuantity","unitCost" FROM "StocktakeLine" WHERE "stocktakeId"=${stocktake.id}`;
      for(const line of lines){
        const expected=money(line.expectedQuantity)??0,counted=money(line.countedQuantity)??0,diff=counted-expected;
        await tx.$executeRaw`UPDATE "StoreProduct" SET "currentStock"=${counted},"updatedAt"=CURRENT_TIMESTAMP WHERE "storeId"=${stocktake.storeId} AND "productId"=${line.productId}`;
        if(diff!==0)await tx.$executeRaw`INSERT INTO "StockMovement" ("id","storeId","productId","movementType","quantity","unitCost","sourceType","sourceId","note","createdByUserId") VALUES (${uid()},${stocktake.storeId},${line.productId},'STOCKTAKE_ADJUSTMENT',${diff},${money(line.unitCost)},'STOCKTAKE',${stocktake.id},'Οριστικοποίηση απογραφής',${req.user.id})`;
      }
      await tx.$executeRaw`UPDATE "Stocktake" SET "status"='FINALIZED',"finalizedAt"=CURRENT_TIMESTAMP,"finalizedByUserId"=${req.user.id},"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${stocktake.id}`;
    });
    res.json({ok:true});
  }catch(error){next(error)}
});

export default router;
