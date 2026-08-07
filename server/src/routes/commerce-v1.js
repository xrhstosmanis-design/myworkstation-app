import crypto from "crypto";
import {Router} from "express";
import {z} from "zod";
import {prisma} from "../prisma.js";
import {requireCompanyModule} from "../middleware/module-access.js";

const router=Router();
const id=()=>crypto.randomUUID();
const num=value=>Number(value||0);
function imageAttachment(attachment){
  if(!attachment)return null;
  const match=/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(attachment.dataUrl);
  if(!match){const error=new Error("Το συνημμένο πρέπει να είναι εικόνα JPEG, PNG ή WEBP.");error.status=400;throw error}
  const bytes=Buffer.from(match[2],"base64");
  if(bytes.length<100||bytes.length>1200000){const error=new Error("Το συνημμένο πρέπει να είναι έως 1,2 MB.");error.status=400;throw error}
  return {dataUrl:attachment.dataUrl,mimeType:match[1],filename:attachment.filename,checksum:crypto.createHash("sha256").update(bytes).digest("hex")};
}

async function ownedStore(companyId,storeId){
  if(!storeId)return null;
  return prisma.store.findFirst({where:{id:String(storeId),companyId},select:{id:true,name:true}});
}

async function ownedProduct(companyId,productId){
  const rows=await prisma.$queryRaw`SELECT "id","name","trackStock" FROM "Product" WHERE "id"=${String(productId)} AND "companyId"=${companyId} LIMIT 1`;
  return rows[0]||null;
}

router.get("/overview",requireCompanyModule("INVENTORY"),async(req,res,next)=>{
  try{
    const companyId=req.user.companyId;
    const [products,suppliers,purchases,sales]=await Promise.all([
      prisma.$queryRaw`SELECT COUNT(*)::int AS count FROM "Product" WHERE "companyId"=${companyId} AND "active"=true`,
      prisma.$queryRaw`SELECT COUNT(*)::int AS count FROM "Supplier" WHERE "companyId"=${companyId} AND "active"=true`,
      prisma.$queryRaw`SELECT COUNT(*)::int AS count FROM "PurchaseDocument" WHERE "companyId"=${companyId}`,
      prisma.$queryRaw`SELECT COUNT(*)::int AS count, COALESCE(SUM("total"),0) AS total FROM "Sale" WHERE "companyId"=${companyId} AND "status"='COMPLETED'`
    ]);
    res.json({products:products[0]?.count||0,suppliers:suppliers[0]?.count||0,purchases:purchases[0]?.count||0,sales:sales[0]?.count||0,salesTotal:sales[0]?.total||0});
  }catch(error){next(error)}
});

router.get("/categories",requireCompanyModule("INVENTORY"),async(req,res,next)=>{
  try{
    const rows=await prisma.$queryRaw`SELECT "id","name","sortOrder","active" FROM "ProductCategory" WHERE "companyId"=${req.user.companyId} ORDER BY "sortOrder","name"`;
    res.json(rows);
  }catch(error){next(error)}
});

router.post("/categories",requireCompanyModule("INVENTORY"),async(req,res,next)=>{
  try{
    const body=z.object({name:z.string().trim().min(1).max(120),sortOrder:z.coerce.number().int().min(0).max(999).optional()}).parse(req.body||{});
    const rowId=id();
    await prisma.$executeRaw`INSERT INTO "ProductCategory" ("id","companyId","name","sortOrder") VALUES (${rowId},${req.user.companyId},${body.name},${body.sortOrder||0})`;
    res.status(201).json({id:rowId,name:body.name});
  }catch(error){next(error)}
});

router.get("/products",requireCompanyModule("INVENTORY"),async(req,res,next)=>{
  try{
    const q=String(req.query.q||"").trim();
    const companyId=req.user.companyId;
    const rows=q
      ? await prisma.$queryRaw`SELECT p."id",p."sku",p."name",p."unit",p."vatRate",p."salePrice",p."costPrice",p."trackStock",p."active",c."name" AS "categoryName",COALESCE(json_agg(b."barcode") FILTER (WHERE b."barcode" IS NOT NULL),'[]') AS barcodes FROM "Product" p LEFT JOIN "ProductCategory" c ON c."id"=p."categoryId" LEFT JOIN "ProductBarcode" b ON b."productId"=p."id" WHERE p."companyId"=${companyId} AND (p."name" ILIKE ${`%${q}%`} OR p."sku" ILIKE ${`%${q}%`} OR b."barcode" ILIKE ${`%${q}%`}) GROUP BY p."id",c."name" ORDER BY p."name" LIMIT 500`
      : await prisma.$queryRaw`SELECT p."id",p."sku",p."name",p."unit",p."vatRate",p."salePrice",p."costPrice",p."trackStock",p."active",c."name" AS "categoryName",COALESCE(json_agg(b."barcode") FILTER (WHERE b."barcode" IS NOT NULL),'[]') AS barcodes FROM "Product" p LEFT JOIN "ProductCategory" c ON c."id"=p."categoryId" LEFT JOIN "ProductBarcode" b ON b."productId"=p."id" WHERE p."companyId"=${companyId} GROUP BY p."id",c."name" ORDER BY p."name" LIMIT 500`;
    res.json(rows);
  }catch(error){next(error)}
});

router.post("/products",requireCompanyModule("INVENTORY"),async(req,res,next)=>{
  try{
    const body=z.object({
      name:z.string().trim().min(1).max(180),sku:z.string().trim().max(80).optional().nullable(),categoryId:z.string().optional().nullable(),
      unit:z.string().max(30).optional(),vatRate:z.coerce.number().min(0).max(100).optional(),salePrice:z.coerce.number().min(0).optional(),costPrice:z.coerce.number().min(0).optional(),
      trackStock:z.boolean().optional(),barcodes:z.array(z.string().trim().min(3).max(80)).max(20).optional(),storeId:z.string().optional().nullable(),openingStock:z.coerce.number().optional()
    }).parse(req.body||{});
    if(body.storeId&&!await ownedStore(req.user.companyId,body.storeId))return res.status(404).json({error:"Δεν βρέθηκε το κατάστημα."});
    const productId=id();
    await prisma.$transaction(async tx=>{
      await tx.$executeRaw`INSERT INTO "Product" ("id","companyId","categoryId","sku","name","unit","vatRate","salePrice","costPrice","trackStock") VALUES (${productId},${req.user.companyId},${body.categoryId||null},${body.sku||null},${body.name},${body.unit||"PIECE"},${body.vatRate??24},${body.salePrice??0},${body.costPrice??0},${body.trackStock??true})`;
      for(const barcode of [...new Set(body.barcodes||[])])await tx.$executeRaw`INSERT INTO "ProductBarcode" ("id","productId","barcode") VALUES (${id()},${productId},${barcode})`;
      if(body.storeId)await tx.$executeRaw`INSERT INTO "StoreProduct" ("id","storeId","productId","salePrice","currentStock") VALUES (${id()},${body.storeId},${productId},${body.salePrice??null},${body.openingStock??0}) ON CONFLICT ("storeId","productId") DO NOTHING`;
      if(body.storeId&&body.openingStock)await tx.$executeRaw`INSERT INTO "StockMovement" ("id","storeId","productId","movementType","quantity","unitCost","sourceType","note","createdByUserId") VALUES (${id()},${body.storeId},${productId},'OPENING',${body.openingStock},${body.costPrice??null},'PRODUCT_CREATE','Αρχικό απόθεμα',${req.user.id})`;
    });
    res.status(201).json({id:productId,name:body.name});
  }catch(error){next(error)}
});

router.patch("/products/:productId",requireCompanyModule("INVENTORY"),async(req,res,next)=>{
  try{
    const product=await ownedProduct(req.user.companyId,req.params.productId);
    if(!product)return res.status(404).json({error:"Δεν βρέθηκε το προϊόν."});
    const body=z.object({name:z.string().trim().min(1).max(180).optional(),salePrice:z.coerce.number().min(0).optional(),costPrice:z.coerce.number().min(0).optional(),vatRate:z.coerce.number().min(0).max(100).optional(),active:z.boolean().optional()}).parse(req.body||{});
    await prisma.$executeRaw`UPDATE "Product" SET "name"=COALESCE(${body.name??null},"name"),"salePrice"=COALESCE(${body.salePrice??null},"salePrice"),"costPrice"=COALESCE(${body.costPrice??null},"costPrice"),"vatRate"=COALESCE(${body.vatRate??null},"vatRate"),"active"=COALESCE(${body.active??null},"active"),"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${req.params.productId} AND "companyId"=${req.user.companyId}`;
    res.json({ok:true});
  }catch(error){next(error)}
});

router.get("/suppliers",requireCompanyModule("INVENTORY"),async(req,res,next)=>{
  try{res.json(await prisma.$queryRaw`SELECT "id","name","taxId","email","phone","city","active" FROM "Supplier" WHERE "companyId"=${req.user.companyId} ORDER BY "name"`)}catch(error){next(error)}
});

router.post("/suppliers",requireCompanyModule("INVENTORY"),async(req,res,next)=>{
  try{
    const body=z.object({name:z.string().trim().min(1).max(180),taxId:z.string().trim().max(30).optional().nullable(),email:z.string().email().optional().nullable(),phone:z.string().max(40).optional().nullable(),address:z.string().max(250).optional().nullable(),city:z.string().max(120).optional().nullable()}).parse(req.body||{});
    const supplierId=id();
    await prisma.$executeRaw`INSERT INTO "Supplier" ("id","companyId","name","taxId","email","phone","address","city") VALUES (${supplierId},${req.user.companyId},${body.name},${body.taxId||null},${body.email||null},${body.phone||null},${body.address||null},${body.city||null})`;
    res.status(201).json({id:supplierId,name:body.name});
  }catch(error){next(error)}
});

router.patch("/suppliers/:supplierId",requireCompanyModule("INVENTORY"),async(req,res,next)=>{
  try{const body=z.object({name:z.string().trim().min(1).max(180).optional(),taxId:z.string().trim().max(30).optional().nullable(),email:z.string().email().optional().nullable(),phone:z.string().max(40).optional().nullable(),address:z.string().max(250).optional().nullable(),city:z.string().max(120).optional().nullable(),active:z.boolean().optional()}).parse(req.body||{});const rows=await prisma.$queryRaw`UPDATE "Supplier" SET "name"=COALESCE(${body.name??null},"name"),"taxId"=COALESCE(${body.taxId??null},"taxId"),"email"=COALESCE(${body.email??null},"email"),"phone"=COALESCE(${body.phone??null},"phone"),"address"=COALESCE(${body.address??null},"address"),"city"=COALESCE(${body.city??null},"city"),"active"=COALESCE(${body.active??null},"active"),"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${req.params.supplierId} AND "companyId"=${req.user.companyId} RETURNING "id","name","taxId","email","phone","address","city","active"`;if(!rows[0])return res.status(404).json({error:"Δεν βρέθηκε ο προμηθευτής."});res.json(rows[0])}catch(error){next(error)}
});

router.get("/suppliers/:supplierId/detail",requireCompanyModule("INVENTORY"),async(req,res,next)=>{
  try{
    const rows=await prisma.$queryRaw`SELECT "id","name","taxId","email","phone","address","city","active","createdAt","updatedAt" FROM "Supplier" WHERE "id"=${req.params.supplierId} AND "companyId"=${req.user.companyId} LIMIT 1`;const supplier=rows[0];if(!supplier)return res.status(404).json({error:"Δεν βρέθηκε ο προμηθευτής."});
    const purchases=await prisma.$queryRaw`SELECT d."id",d."documentNumber",d."documentDate",d."totalNet",d."totalVat",d."totalGross",d."sourceType",d."status",s."name" AS "storeName" FROM "PurchaseDocument" d JOIN "Store" s ON s."id"=d."storeId" WHERE d."companyId"=${req.user.companyId} AND d."supplierId"=${supplier.id} ORDER BY d."documentDate" DESC LIMIT 200`;
    const productCosts=await prisma.$queryRaw`SELECT p."id",p."name",p."sku",COUNT(*)::int AS "purchaseCount",MAX(d."documentDate") AS "lastPurchaseAt",SUM(CASE WHEN l."unit"='PACKAGE' THEN l."quantity"*COALESCE(l."unitsPerPackage",1) ELSE l."quantity" END) AS "totalPieces",SUM(l."netAmount")/NULLIF(SUM(CASE WHEN l."unit"='PACKAGE' THEN l."quantity"*COALESCE(l."unitsPerPackage",1) ELSE l."quantity" END),0) AS "averagePieceCost",(array_agg(CASE WHEN l."unit"='PACKAGE' THEN l."unitCost"/NULLIF(l."unitsPerPackage",0) ELSE l."unitCost" END ORDER BY d."documentDate" DESC))[1] AS "lastPieceCost" FROM "PurchaseDocumentLine" l JOIN "PurchaseDocument" d ON d."id"=l."purchaseDocumentId" JOIN "Product" p ON p."id"=l."productId" WHERE d."companyId"=${req.user.companyId} AND d."supplierId"=${supplier.id} GROUP BY p."id",p."name",p."sku" ORDER BY p."name"`;
    const table=await prisma.$queryRaw`SELECT to_regclass('public."StoreTransaction"') IS NOT NULL AS exists`;let payments=[];
    if(table[0]?.exists){const columns=await prisma.$queryRaw`SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='StoreTransaction' AND column_name='supplierId' LIMIT 1`;payments=columns[0]?await prisma.$queryRaw`SELECT "id","storeId","amount","description","actorName","occurredAt","supplierName" FROM "StoreTransaction" WHERE "companyId"=${req.user.companyId} AND "type"='SUPPLIER_PAYMENT' AND "reversedAt" IS NULL AND ("supplierId"=${supplier.id} OR ("supplierId" IS NULL AND LOWER("supplierName")=LOWER(${supplier.name}))) ORDER BY "occurredAt" DESC LIMIT 200`:await prisma.$queryRaw`SELECT "id","storeId","amount","description","actorName","occurredAt","supplierName" FROM "StoreTransaction" WHERE "companyId"=${req.user.companyId} AND "type"='SUPPLIER_PAYMENT' AND "reversedAt" IS NULL AND LOWER("supplierName")=LOWER(${supplier.name}) ORDER BY "occurredAt" DESC LIMIT 200`}
    const purchaseTotal=purchases.reduce((sum,row)=>sum+Number(row.totalGross||0),0),paymentTotal=payments.reduce((sum,row)=>sum+Number(row.amount||0),0);res.json({supplier,purchases,payments,productCosts,summary:{purchaseTotal,paymentTotal,estimatedBalance:purchaseTotal-paymentTotal,purchaseCount:purchases.length,paymentCount:payments.length}});
  }catch(error){next(error)}
});

router.get("/inventory",requireCompanyModule("INVENTORY"),async(req,res,next)=>{
  try{
    const store=await ownedStore(req.user.companyId,req.query.storeId);
    if(!store)return res.status(404).json({error:"Δεν βρέθηκε το κατάστημα."});
    const rows=await prisma.$queryRaw`SELECT p."id",p."sku",p."name",p."unit",p."costPrice",COALESCE(sp."salePrice",p."salePrice") AS "salePrice",COALESCE(sp."currentStock",0) AS "currentStock",sp."minStock",p."trackStock",c."name" AS "categoryName" FROM "Product" p LEFT JOIN "StoreProduct" sp ON sp."productId"=p."id" AND sp."storeId"=${store.id} LEFT JOIN "ProductCategory" c ON c."id"=p."categoryId" WHERE p."companyId"=${req.user.companyId} AND p."active"=true ORDER BY p."name"`;
    res.json({store,rows});
  }catch(error){next(error)}
});

router.post("/stock/movement",requireCompanyModule("INVENTORY"),async(req,res,next)=>{
  try{
    const body=z.object({storeId:z.string(),productId:z.string(),movementType:z.enum(["PURCHASE","SALE","ADJUSTMENT","WASTE","TRANSFER_IN","TRANSFER_OUT","OPENING"]),quantity:z.coerce.number(),unitCost:z.coerce.number().optional().nullable(),note:z.string().max(300).optional().nullable()}).parse(req.body||{});
    if(!await ownedStore(req.user.companyId,body.storeId)||!await ownedProduct(req.user.companyId,body.productId))return res.status(404).json({error:"Δεν βρέθηκε κατάστημα ή προϊόν."});
    const delta=["SALE","WASTE","TRANSFER_OUT"].includes(body.movementType)?-Math.abs(body.quantity):body.quantity;
    await prisma.$transaction(async tx=>{
      await tx.$executeRaw`INSERT INTO "StoreProduct" ("id","storeId","productId","currentStock") VALUES (${id()},${body.storeId},${body.productId},${delta}) ON CONFLICT ("storeId","productId") DO UPDATE SET "currentStock"="StoreProduct"."currentStock"+${delta},"updatedAt"=CURRENT_TIMESTAMP`;
      await tx.$executeRaw`INSERT INTO "StockMovement" ("id","storeId","productId","movementType","quantity","unitCost","note","createdByUserId") VALUES (${id()},${body.storeId},${body.productId},${body.movementType},${delta},${body.unitCost??null},${body.note||null},${req.user.id})`;
    });
    res.status(201).json({ok:true,quantityDelta:delta});
  }catch(error){next(error)}
});

router.get("/purchases",requireCompanyModule("INVENTORY"),async(req,res,next)=>{
  try{
    const rows=await prisma.$queryRaw`SELECT d."id",d."documentType",d."documentNumber",d."documentDate",d."totalGross",d."sourceType",d."status",d."aiConfidence",s."name" AS "supplierName",st."name" AS "storeName" FROM "PurchaseDocument" d LEFT JOIN "Supplier" s ON s."id"=d."supplierId" JOIN "Store" st ON st."id"=d."storeId" WHERE d."companyId"=${req.user.companyId} ORDER BY d."documentDate" DESC LIMIT 300`;
    res.json(rows);
  }catch(error){next(error)}
});

router.post("/purchases",requireCompanyModule("INVENTORY"),async(req,res,next)=>{
  try{
    const body=z.object({storeId:z.string(),supplierId:z.string().optional().nullable(),documentType:z.string().max(30).optional(),documentNumber:z.string().max(80).optional().nullable(),documentDate:z.coerce.date().optional(),sourceType:z.enum(["MANUAL","OCR_DRAFT","AI_DRAFT"]).optional(),status:z.enum(["DRAFT","APPROVED"]).optional(),lines:z.array(z.object({productId:z.string().optional().nullable(),description:z.string().min(1).max(250),quantity:z.coerce.number().positive(),unit:z.string().max(30).optional(),unitsPerPackage:z.coerce.number().positive().optional().nullable(),unitCost:z.coerce.number().min(0),vatRate:z.coerce.number().min(0).max(100).optional()})).min(1).max(500)}).parse(req.body||{});
    if(!await ownedStore(req.user.companyId,body.storeId))return res.status(404).json({error:"Δεν βρέθηκε το κατάστημα."});
    const docId=id();
    const totals=body.lines.reduce((a,line)=>{const net=line.quantity*line.unitCost;const vat=net*(line.vatRate??24)/100;a.net+=net;a.vat+=vat;a.gross+=net+vat;return a},{net:0,vat:0,gross:0});
    await prisma.$transaction(async tx=>{
      await tx.$executeRaw`INSERT INTO "PurchaseDocument" ("id","companyId","storeId","supplierId","documentType","documentNumber","documentDate","totalNet","totalVat","totalGross","sourceType","status","createdByUserId") VALUES (${docId},${req.user.companyId},${body.storeId},${body.supplierId||null},${body.documentType||"INVOICE"},${body.documentNumber||null},${body.documentDate||new Date()},${totals.net},${totals.vat},${totals.gross},${body.sourceType||"MANUAL"},${body.status||"DRAFT"},${req.user.id})`;
      for(const line of body.lines){const net=line.quantity*line.unitCost;const vat=net*(line.vatRate??24)/100;await tx.$executeRaw`INSERT INTO "PurchaseDocumentLine" ("id","purchaseDocumentId","productId","description","quantity","unit","unitsPerPackage","unitCost","netAmount","vatRate","vatAmount","grossAmount") VALUES (${id()},${docId},${line.productId||null},${line.description},${line.quantity},${line.unit||"PIECE"},${line.unitsPerPackage??null},${line.unitCost},${net},${line.vatRate??24},${vat},${net+vat})`;}
    });
    res.status(201).json({id:docId,...totals,status:body.status||"DRAFT"});
  }catch(error){next(error)}
});

router.get("/customers",requireCompanyModule("POS"),async(req,res,next)=>{
  try{res.json(await prisma.$queryRaw`SELECT "id","name","phone","email","discountPercent","creditLimit","balance","active" FROM "Customer" WHERE "companyId"=${req.user.companyId} ORDER BY "name"`)}catch(error){next(error)}
});

router.post("/customers",requireCompanyModule("POS"),async(req,res,next)=>{
  try{
    const body=z.object({name:z.string().min(1).max(180),phone:z.string().max(40).optional().nullable(),email:z.string().email().optional().nullable(),discountPercent:z.coerce.number().min(0).max(100).optional(),creditLimit:z.coerce.number().min(0).optional()}).parse(req.body||{});
    const customerId=id();
    await prisma.$executeRaw`INSERT INTO "Customer" ("id","companyId","name","phone","email","discountPercent","creditLimit") VALUES (${customerId},${req.user.companyId},${body.name},${body.phone||null},${body.email||null},${body.discountPercent||0},${body.creditLimit||0})`;
    res.status(201).json({id:customerId,name:body.name});
  }catch(error){next(error)}
});

router.post("/sales",requireCompanyModule("POS"),async(req,res,next)=>{
  try{
    const body=z.object({storeId:z.string(),operatorEmployeeId:z.string().optional().nullable(),customerId:z.string().optional().nullable(),discount:z.coerce.number().min(0).optional(),lines:z.array(z.object({productId:z.string().optional().nullable(),description:z.string().min(1).max(250),quantity:z.coerce.number().positive(),unitPrice:z.coerce.number().min(0),vatRate:z.coerce.number().min(0).max(100).optional(),discount:z.coerce.number().min(0).optional()})).min(1).max(200),payments:z.array(z.object({method:z.enum(["CASH","CARD","CREDIT","OTHER"]),amount:z.coerce.number().positive(),terminalRef:z.string().max(100).optional().nullable()})).min(1).max(10)}).parse(req.body||{});
    if(!await ownedStore(req.user.companyId,body.storeId))return res.status(404).json({error:"Δεν βρέθηκε το κατάστημα."});
    const subtotal=body.lines.reduce((sum,line)=>sum+line.quantity*line.unitPrice-(line.discount||0),0);const discount=body.discount||0;const total=Math.max(0,subtotal-discount);const paid=body.payments.reduce((s,p)=>s+p.amount,0);
    if(Math.abs(paid-total)>0.01)return res.status(400).json({error:"Το σύνολο πληρωμών δεν συμφωνεί με το σύνολο πώλησης."});
    const saleId=id();
    await prisma.$transaction(async tx=>{
      await tx.$executeRaw`INSERT INTO "Sale" ("id","companyId","storeId","operatorEmployeeId","customerId","fiscalStatus","subtotal","discount","total","status","source") VALUES (${saleId},${req.user.companyId},${body.storeId},${body.operatorEmployeeId||null},${body.customerId||null},'NON_FISCAL',${subtotal},${discount},${total},'COMPLETED','POS')`;
      for(const line of body.lines){const lineTotal=line.quantity*line.unitPrice-(line.discount||0);await tx.$executeRaw`INSERT INTO "SaleLine" ("id","saleId","productId","description","quantity","unitPrice","discount","vatRate","lineTotal") VALUES (${id()},${saleId},${line.productId||null},${line.description},${line.quantity},${line.unitPrice},${line.discount||0},${line.vatRate??24},${lineTotal})`;if(line.productId){const product=await ownedProduct(req.user.companyId,line.productId);if(product?.trackStock){const delta=-Math.abs(line.quantity);await tx.$executeRaw`INSERT INTO "StoreProduct" ("id","storeId","productId","currentStock") VALUES (${id()},${body.storeId},${line.productId},${delta}) ON CONFLICT ("storeId","productId") DO UPDATE SET "currentStock"="StoreProduct"."currentStock"+${delta},"updatedAt"=CURRENT_TIMESTAMP`;await tx.$executeRaw`INSERT INTO "StockMovement" ("id","storeId","productId","movementType","quantity","sourceType","sourceId","createdByUserId") VALUES (${id()},${body.storeId},${line.productId},'SALE',${delta},'SALE',${saleId},${req.user.id})`;}}}
      for(const payment of body.payments)await tx.$executeRaw`INSERT INTO "Payment" ("id","saleId","method","amount","terminalRef") VALUES (${id()},${saleId},${payment.method},${payment.amount},${payment.terminalRef||null})`;
      if(body.customerId&&body.payments.some(p=>p.method==='CREDIT')){const credit=body.payments.filter(p=>p.method==='CREDIT').reduce((s,p)=>s+p.amount,0);await tx.$executeRaw`UPDATE "Customer" SET "balance"="balance"+${credit},"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${body.customerId} AND "companyId"=${req.user.companyId}`;await tx.$executeRaw`INSERT INTO "CustomerLedger" ("id","customerId","storeId","entryType","amount","referenceType","referenceId","note") VALUES (${id()},${body.customerId},${body.storeId},'SALE_CREDIT',${credit},'SALE',${saleId},'Πίστωση από πώληση')`;}
    });
    res.status(201).json({id:saleId,subtotal,discount,total,fiscalStatus:"NON_FISCAL",message:"Η πώληση καταγράφηκε μη φορολογικά. Η φορολογική απόδειξη παραμένει στον Kiosk Manager/RBS μέχρι την ενεργοποίηση του Connector."});
  }catch(error){next(error)}
});

router.get("/sales/report",requireCompanyModule("SALES_ANALYTICS"),async(req,res,next)=>{
  try{
    const store=await ownedStore(req.user.companyId,req.query.storeId);if(!store)return res.status(404).json({error:"Δεν βρέθηκε το κατάστημα."});
    const from=req.query.from?new Date(String(req.query.from)):new Date(Date.now()-30*86400000);const to=req.query.to?new Date(String(req.query.to)):new Date();
    const [summary,daily,methods,topProducts]=await Promise.all([
      prisma.$queryRaw`SELECT COUNT(*)::int AS sales,COALESCE(SUM("total"),0) AS total,COALESCE(AVG("total"),0) AS average FROM "Sale" WHERE "companyId"=${req.user.companyId} AND "storeId"=${store.id} AND "status"='COMPLETED' AND "occurredAt">=${from} AND "occurredAt"<=${to}`,
      prisma.$queryRaw`SELECT DATE("occurredAt") AS day,COUNT(*)::int AS sales,SUM("total") AS total FROM "Sale" WHERE "companyId"=${req.user.companyId} AND "storeId"=${store.id} AND "status"='COMPLETED' AND "occurredAt">=${from} AND "occurredAt"<=${to} GROUP BY DATE("occurredAt") ORDER BY day`,
      prisma.$queryRaw`SELECT p."method",SUM(p."amount") AS total FROM "Payment" p JOIN "Sale" s ON s."id"=p."saleId" WHERE s."companyId"=${req.user.companyId} AND s."storeId"=${store.id} AND s."occurredAt">=${from} AND s."occurredAt"<=${to} GROUP BY p."method" ORDER BY total DESC`,
      prisma.$queryRaw`SELECT l."description",SUM(l."quantity") AS quantity,SUM(l."lineTotal") AS total FROM "SaleLine" l JOIN "Sale" s ON s."id"=l."saleId" WHERE s."companyId"=${req.user.companyId} AND s."storeId"=${store.id} AND s."occurredAt">=${from} AND s."occurredAt"<=${to} GROUP BY l."description" ORDER BY total DESC LIMIT 20`
    ]);
    res.json({store,from,to,summary:summary[0]||{sales:0,total:0,average:0},daily,methods,topProducts});
  }catch(error){next(error)}
});

router.get("/handover",requireCompanyModule("SHIFT_HANDOVER"),async(req,res,next)=>{
  try{const store=await ownedStore(req.user.companyId,req.query.storeId);if(!store)return res.status(404).json({error:"Δεν βρέθηκε το κατάστημα."});res.json(await prisma.$queryRaw`SELECT h."id",h."priority",h."message",h."status",h."acknowledgedAt",h."acknowledgedByName",h."createdAt",COALESCE(h."fromName",f."fullName") AS "fromName",t."fullName" AS "toName",(h."attachmentData" IS NOT NULL) AS "hasAttachment",h."attachmentFilename" FROM "ShiftHandover" h LEFT JOIN "Employee" f ON f."id"=h."fromEmployeeId" LEFT JOIN "Employee" t ON t."id"=h."toEmployeeId" WHERE h."storeId"=${store.id} ORDER BY CASE WHEN h."status"='OPEN' THEN 0 ELSE 1 END,h."createdAt" DESC LIMIT 200`)}catch(error){next(error)}
});

router.post("/handover",requireCompanyModule("SHIFT_HANDOVER"),async(req,res,next)=>{
  try{const body=z.object({storeId:z.string(),fromEmployeeId:z.string().optional().nullable(),toEmployeeId:z.string().optional().nullable(),priority:z.enum(["LOW","NORMAL","HIGH","SOS"]).optional(),message:z.string().trim().min(1).max(1000),attachment:z.object({dataUrl:z.string().max(1800000),filename:z.string().trim().min(1).max(180)}).optional().nullable()}).parse(req.body||{});if(!await ownedStore(req.user.companyId,body.storeId))return res.status(404).json({error:"Δεν βρέθηκε το κατάστημα."});if(req.user.tokenType==="STORE_OPERATOR"&&req.user.storeId!==body.storeId)return res.status(403).json({error:"Η παράδοση ισχύει μόνο για το δικό σου κατάστημα."});const attachment=imageAttachment(body.attachment);const fromEmployeeId=req.user.tokenType==="STORE_OPERATOR"?req.user.employeeId:(body.fromEmployeeId||null);const fromName=req.user.fullName||null;const rowId=id();await prisma.$executeRaw`INSERT INTO "ShiftHandover" ("id","storeId","fromEmployeeId","toEmployeeId","priority","message","fromName","attachmentData","attachmentMimeType","attachmentFilename","attachmentChecksum") VALUES (${rowId},${body.storeId},${fromEmployeeId},${body.toEmployeeId||null},${body.priority||"NORMAL"},${body.message},${fromName},${attachment?.dataUrl||null},${attachment?.mimeType||null},${attachment?.filename||null},${attachment?.checksum||null})`;res.status(201).json({id:rowId,status:"OPEN"})}catch(error){next(error)}
});

router.post("/handover/:handoverId/ack",requireCompanyModule("SHIFT_HANDOVER"),async(req,res,next)=>{
  try{const rows=await prisma.$queryRaw`UPDATE "ShiftHandover" SET "status"='ACKNOWLEDGED',"acknowledgedAt"=CURRENT_TIMESTAMP,"acknowledgedById"=${req.user.id},"acknowledgedByName"=${req.user.fullName||"Χρήστης"} WHERE "id"=${req.params.handoverId} AND "status"='OPEN' AND "storeId" IN (SELECT "id" FROM "Store" WHERE "companyId"=${req.user.companyId}) AND (${req.user.tokenType!=="STORE_OPERATOR"} OR "storeId"=${req.user.storeId}) RETURNING "id"`;if(!rows[0])return res.status(404).json({error:"Δεν βρέθηκε ανοιχτή παράδοση βάρδιας."});res.json({ok:true,acknowledgedByName:req.user.fullName||"Χρήστης"})}catch(error){next(error)}
});

router.get("/handover/:handoverId/attachment",requireCompanyModule("SHIFT_HANDOVER"),async(req,res,next)=>{
  try{const rows=await prisma.$queryRaw`SELECT h."storeId",h."attachmentData",h."attachmentMimeType",h."attachmentFilename" FROM "ShiftHandover" h JOIN "Store" s ON s."id"=h."storeId" WHERE h."id"=${req.params.handoverId} AND s."companyId"=${req.user.companyId} LIMIT 1`;const row=rows[0];if(!row||!row.attachmentData)return res.status(404).json({error:"Δεν υπάρχει συνημμένο."});if(req.user.tokenType==="STORE_OPERATOR"&&req.user.storeId!==row.storeId)return res.status(403).json({error:"Δεν έχεις πρόσβαση σε αυτό το συνημμένο."});res.json({dataUrl:row.attachmentData,mimeType:row.attachmentMimeType,filename:row.attachmentFilename})}catch(error){next(error)}
});

router.get("/documents/inbox",requireCompanyModule("DOCUMENTS"),async(req,res,next)=>{
  try{const store=await ownedStore(req.user.companyId,req.query.storeId);if(!store)return res.status(404).json({error:"Δεν βρέθηκε το κατάστημα."});const rows=await prisma.$queryRaw`SELECT i."id",i."status",i."receivedAt",i."processedAt",i."note",i."responsibleName",i."updatedAt",s."name" AS "supplierName",a."filename",a."mimeType",(a."contentData" IS NOT NULL) AS "hasAttachment" FROM "DocumentInbox" i LEFT JOIN "Supplier" s ON s."id"=i."supplierId" LEFT JOIN "DocumentAttachment" a ON a."id"=i."attachmentId" WHERE i."companyId"=${req.user.companyId} AND i."storeId"=${store.id} ORDER BY CASE WHEN i."status"='PROCESSED' THEN 1 ELSE 0 END,i."receivedAt" DESC LIMIT 300`;res.json(rows)}catch(error){next(error)}
});

router.post("/documents/inbox",requireCompanyModule("DOCUMENTS"),async(req,res,next)=>{
  try{const body=z.object({storeId:z.string(),supplierId:z.string().optional().nullable(),responsibleName:z.string().trim().max(180).optional().nullable(),note:z.string().trim().max(1000).optional().nullable(),file:z.object({dataUrl:z.string().max(4600000),filename:z.string().trim().min(1).max(180)})}).parse(req.body||{});const store=await ownedStore(req.user.companyId,body.storeId);if(!store)return res.status(404).json({error:"Δεν βρέθηκε το κατάστημα."});const match=/^data:(application\/pdf|image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(body.file.dataUrl);if(!match)return res.status(400).json({error:"Το αρχείο πρέπει να είναι PDF, JPEG, PNG ή WEBP."});const bytes=Buffer.from(match[2],"base64");if(bytes.length<100||bytes.length>3400000)return res.status(400).json({error:"Το αρχείο πρέπει να είναι έως 3,4 MB."});const attachmentId=id(),inboxId=id(),checksum=crypto.createHash("sha256").update(bytes).digest("hex");await prisma.$transaction(async tx=>{await tx.$executeRaw`INSERT INTO "DocumentAttachment" ("id","companyId","storeId","documentType","filename","mimeType","storageKey","checksum","contentData") VALUES (${attachmentId},${req.user.companyId},${store.id},'INVOICE_INBOX',${body.file.filename},${match[1]},${`DATABASE:${checksum}`},${checksum},${body.file.dataUrl})`;await tx.$executeRaw`INSERT INTO "DocumentInbox" ("id","companyId","storeId","supplierId","attachmentId","status","note","responsibleName","createdByUserId") VALUES (${inboxId},${req.user.companyId},${store.id},${body.supplierId||null},${attachmentId},'RECEIVED',${body.note||null},${body.responsibleName||null},${req.user.id})`});res.status(201).json({id:inboxId,status:"RECEIVED"})}catch(error){next(error)}
});

router.patch("/documents/inbox/:inboxId",requireCompanyModule("DOCUMENTS"),async(req,res,next)=>{
  try{const body=z.object({status:z.enum(["RECEIVED","IN_REVIEW","PROCESSED"]),responsibleName:z.string().trim().max(180).optional().nullable(),note:z.string().trim().max(1000).optional().nullable()}).parse(req.body||{});const rows=await prisma.$queryRaw`UPDATE "DocumentInbox" SET "status"=${body.status},"responsibleName"=COALESCE(${body.responsibleName||null},"responsibleName"),"note"=COALESCE(${body.note||null},"note"),"processedAt"=CASE WHEN ${body.status}='PROCESSED' THEN CURRENT_TIMESTAMP ELSE NULL END,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${req.params.inboxId} AND "companyId"=${req.user.companyId} RETURNING "id"`;if(!rows[0])return res.status(404).json({error:"Δεν βρέθηκε το παραστατικό."});res.json({ok:true,status:body.status})}catch(error){next(error)}
});

router.get("/documents/inbox/:inboxId/file",requireCompanyModule("DOCUMENTS"),async(req,res,next)=>{
  try{const rows=await prisma.$queryRaw`SELECT a."contentData",a."filename",a."mimeType" FROM "DocumentInbox" i JOIN "DocumentAttachment" a ON a."id"=i."attachmentId" WHERE i."id"=${req.params.inboxId} AND i."companyId"=${req.user.companyId} LIMIT 1`;const row=rows[0];if(!row?.contentData)return res.status(404).json({error:"Δεν βρέθηκε το αρχείο."});res.json({dataUrl:row.contentData,filename:row.filename,mimeType:row.mimeType})}catch(error){next(error)}
});

router.get("/ai-reader/status",requireCompanyModule("AI_READER"),async(req,res,next)=>{
  try{const rows=await prisma.$queryRaw`SELECT COUNT(*)::int AS drafts FROM "PurchaseDocument" WHERE "companyId"=${req.user.companyId} AND "sourceType" IN ('OCR_DRAFT','AI_DRAFT') AND "status"='DRAFT'`;res.json({twoStageReader:true,drafts:rows[0]?.drafts||0,localConfidenceThreshold:65,aiAutomatic:false,aiProviderConnected:false,message:"Η βάση και το workflow δύο σταδίων είναι έτοιμα. Η πραγματική κλήση AI θα ενεργοποιηθεί μόνο μετά τη σύνδεση provider/API και χειροκίνητη επιλογή «Επανέλεγχος με AI»."})}catch(error){next(error)}
});

router.get("/ai-reader/jobs",requireCompanyModule("AI_READER"),async(req,res,next)=>{
  try{const store=await ownedStore(req.user.companyId,req.query.storeId);if(!store)return res.status(404).json({error:"Δεν βρέθηκε το κατάστημα."});const rows=await prisma.$queryRaw`SELECT j."id",j."stage",j."status",j."localConfidence",j."aiConfidence",j."resultJson" AS "result",j."createdAt",a."filename",a."mimeType" FROM "AiReaderJob" j LEFT JOIN "DocumentAttachment" a ON a."id"=j."attachmentId" WHERE j."companyId"=${req.user.companyId} AND j."storeId"=${store.id} ORDER BY j."createdAt" DESC LIMIT 100`;res.json(rows)}catch(error){next(error)}
});

router.post("/ai-reader/jobs",requireCompanyModule("AI_READER"),async(req,res,next)=>{
  try{const line=z.object({text:z.string().max(1000),confidence:z.number().min(0).max(100)});const body=z.object({storeId:z.string(),filename:z.string().trim().min(1).max(180),mimeType:z.enum(["image/jpeg","image/png","image/webp","application/pdf"]),dataUrl:z.string().max(9000000),localConfidence:z.number().min(0).max(100),result:z.object({rawText:z.string().max(100000),lines:z.array(line).max(1000),pageCount:z.number().int().positive().nullable().optional(),pdfNote:z.string().max(300).nullable().optional()})}).parse(req.body||{});const store=await ownedStore(req.user.companyId,body.storeId);if(!store)return res.status(404).json({error:"Δεν βρέθηκε το κατάστημα."});const escaped=body.mimeType.replace("/","\\/");const match=new RegExp(`^data:${escaped};base64,([A-Za-z0-9+/=]+)$`).exec(body.dataUrl);if(!match)return res.status(400).json({error:"Μη έγκυρο αρχείο OCR."});const bytes=Buffer.from(match[1],"base64");if(bytes.length<100||bytes.length>6500000)return res.status(400).json({error:"Το αρχείο OCR πρέπει να είναι έως 6,5 MB."});const attachmentId=id(),jobId=id(),checksum=crypto.createHash("sha256").update(bytes).digest("hex");await prisma.$transaction(async tx=>{await tx.$executeRaw`INSERT INTO "DocumentAttachment" ("id","companyId","storeId","documentType","filename","mimeType","storageKey","checksum","contentData") VALUES (${attachmentId},${req.user.companyId},${store.id},'AI_READER_SOURCE',${body.filename},${body.mimeType},${`DATABASE:${checksum}`},${checksum},${body.dataUrl})`;await tx.$executeRaw`INSERT INTO "AiReaderJob" ("id","companyId","storeId","attachmentId","stage","status","localConfidence","resultJson","requestedByUserId") VALUES (${jobId},${req.user.companyId},${store.id},${attachmentId},'LOCAL','LOCAL_COMPLETE',${body.localConfidence},${JSON.stringify(body.result)}::jsonb,${req.user.id})`});res.status(201).json({id:jobId,status:"LOCAL_COMPLETE",aiCalled:false})}catch(error){next(error)}
});

router.post("/ai-reader/jobs/:jobId/ai-recheck",requireCompanyModule("AI_READER"),async(req,res,next)=>{
  try{const rows=await prisma.$queryRaw`SELECT "id" FROM "AiReaderJob" WHERE "id"=${req.params.jobId} AND "companyId"=${req.user.companyId} LIMIT 1`;if(!rows[0])return res.status(404).json({error:"Δεν βρέθηκε η ανάγνωση."});res.status(409).json({error:"Ο AI provider δεν έχει συνδεθεί ακόμη. Δεν έγινε καμία χρέωση ούτε αυτόματη κλήση AI."})}catch(error){next(error)}
});

router.post("/ai-reader/jobs/:jobId/confirm",requireCompanyModule("AI_READER"),requireCompanyModule("INVENTORY"),async(req,res,next)=>{
  try{
    const line=z.object({productId:z.string(),description:z.string().trim().min(1).max(250),quantity:z.coerce.number().positive(),unit:z.enum(["PIECE","PACKAGE"]),unitsPerPackage:z.coerce.number().positive().max(100000),unitCost:z.coerce.number().min(0),vatRate:z.coerce.number().min(0).max(100)});
    const body=z.object({supplierId:z.string(),documentNumber:z.string().trim().max(80).optional().nullable(),documentDate:z.coerce.date().optional(),lines:z.array(line).min(1).max(500)}).parse(req.body||{});
    const jobs=await prisma.$queryRaw`SELECT "id","storeId","status" FROM "AiReaderJob" WHERE "id"=${req.params.jobId} AND "companyId"=${req.user.companyId} LIMIT 1`;
    const job=jobs[0];if(!job)return res.status(404).json({error:"Δεν βρέθηκε η ανάγνωση."});if(job.status==="CONFIRMED")return res.status(409).json({error:"Η ανάγνωση έχει ήδη επιβεβαιωθεί και δεν θα ξαναενημερώσει την αποθήκη."});
    const supplier=await prisma.$queryRaw`SELECT "id" FROM "Supplier" WHERE "id"=${body.supplierId} AND "companyId"=${req.user.companyId} AND "active"=true LIMIT 1`;if(!supplier[0])return res.status(404).json({error:"Δεν βρέθηκε ο προμηθευτής."});
    const productIds=[...new Set(body.lines.map(item=>item.productId))];const products=await prisma.$queryRaw`SELECT "id","trackStock" FROM "Product" WHERE "companyId"=${req.user.companyId} AND "active"=true AND "id"=ANY(${productIds}::text[])`;if(products.length!==productIds.length)return res.status(404).json({error:"Ένα ή περισσότερα προϊόντα δεν ανήκουν στην εταιρεία."});
    const tracked=new Map(products.map(product=>[product.id,product.trackStock]));const docId=id();
    const totals=body.lines.reduce((sum,item)=>{const net=item.quantity*item.unitCost;const vat=net*item.vatRate/100;return {net:sum.net+net,vat:sum.vat+vat,gross:sum.gross+net+vat}},{net:0,vat:0,gross:0});
    await prisma.$transaction(async tx=>{
      const locked=await tx.$queryRaw`SELECT "status" FROM "AiReaderJob" WHERE "id"=${job.id} AND "companyId"=${req.user.companyId} FOR UPDATE`;if(locked[0]?.status==="CONFIRMED"){const error=new Error("Η ανάγνωση έχει ήδη επιβεβαιωθεί.");error.status=409;throw error}
      await tx.$executeRaw`INSERT INTO "PurchaseDocument" ("id","companyId","storeId","supplierId","documentType","documentNumber","documentDate","totalNet","totalVat","totalGross","sourceType","status","createdByUserId") VALUES (${docId},${req.user.companyId},${job.storeId},${body.supplierId},'INVOICE',${body.documentNumber||null},${body.documentDate||new Date()},${totals.net},${totals.vat},${totals.gross},'OCR_DRAFT','APPROVED',${req.user.id})`;
      for(const item of body.lines){const net=item.quantity*item.unitCost,vat=net*item.vatRate/100,stockQuantity=item.unit==="PACKAGE"?item.quantity*item.unitsPerPackage:item.quantity;await tx.$executeRaw`INSERT INTO "PurchaseDocumentLine" ("id","purchaseDocumentId","productId","description","quantity","unit","unitsPerPackage","unitCost","netAmount","vatRate","vatAmount","grossAmount") VALUES (${id()},${docId},${item.productId},${item.description},${item.quantity},${item.unit},${item.unit==="PACKAGE"?item.unitsPerPackage:null},${item.unitCost},${net},${item.vatRate},${vat},${net+vat})`;if(tracked.get(item.productId)){const perPieceCost=item.unit==="PACKAGE"?item.unitCost/item.unitsPerPackage:item.unitCost;await tx.$executeRaw`INSERT INTO "StoreProduct" ("id","storeId","productId","currentStock") VALUES (${id()},${job.storeId},${item.productId},${stockQuantity}) ON CONFLICT ("storeId","productId") DO UPDATE SET "currentStock"="StoreProduct"."currentStock"+${stockQuantity},"updatedAt"=CURRENT_TIMESTAMP`;await tx.$executeRaw`INSERT INTO "StockMovement" ("id","storeId","productId","movementType","quantity","unitCost","sourceType","sourceId","note","createdByUserId") VALUES (${id()},${job.storeId},${item.productId},'PURCHASE',${stockQuantity},${perPieceCost},'AI_READER_CONFIRM',${docId},'Επιβεβαιωμένη παραλαβή από τοπικό OCR',${req.user.id})`;}}
      await tx.$executeRaw`UPDATE "AiReaderJob" SET "status"='CONFIRMED',"purchaseDocumentId"=${docId},"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${job.id}`;
    });
    res.status(201).json({id:docId,status:"APPROVED",stockUpdated:true,...totals});
  }catch(error){next(error)}
});

export default router;
