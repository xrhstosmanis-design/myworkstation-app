import crypto from "crypto";
import {Router} from "express";
import {z} from "zod";
import {prisma} from "../prisma.js";
import {requireCompanyModule} from "../middleware/module-access.js";

const router=Router();
const id=()=>crypto.randomUUID();
const num=value=>Number(value||0);

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
  try{const store=await ownedStore(req.user.companyId,req.query.storeId);if(!store)return res.status(404).json({error:"Δεν βρέθηκε το κατάστημα."});res.json(await prisma.$queryRaw`SELECT h."id",h."priority",h."message",h."status",h."acknowledgedAt",h."createdAt",f."fullName" AS "fromName",t."fullName" AS "toName" FROM "ShiftHandover" h LEFT JOIN "Employee" f ON f."id"=h."fromEmployeeId" LEFT JOIN "Employee" t ON t."id"=h."toEmployeeId" WHERE h."storeId"=${store.id} ORDER BY CASE WHEN h."status"='OPEN' THEN 0 ELSE 1 END,h."createdAt" DESC LIMIT 200`)}catch(error){next(error)}
});

router.post("/handover",requireCompanyModule("SHIFT_HANDOVER"),async(req,res,next)=>{
  try{const body=z.object({storeId:z.string(),fromEmployeeId:z.string().optional().nullable(),toEmployeeId:z.string().optional().nullable(),priority:z.enum(["LOW","NORMAL","HIGH","SOS"]).optional(),message:z.string().trim().min(1).max(1000)}).parse(req.body||{});if(!await ownedStore(req.user.companyId,body.storeId))return res.status(404).json({error:"Δεν βρέθηκε το κατάστημα."});const rowId=id();await prisma.$executeRaw`INSERT INTO "ShiftHandover" ("id","storeId","fromEmployeeId","toEmployeeId","priority","message") VALUES (${rowId},${body.storeId},${body.fromEmployeeId||null},${body.toEmployeeId||null},${body.priority||"NORMAL"},${body.message})`;res.status(201).json({id:rowId,status:"OPEN"})}catch(error){next(error)}
});

router.post("/handover/:handoverId/ack",requireCompanyModule("SHIFT_HANDOVER"),async(req,res,next)=>{
  try{await prisma.$executeRaw`UPDATE "ShiftHandover" SET "status"='ACKNOWLEDGED',"acknowledgedAt"=CURRENT_TIMESTAMP WHERE "id"=${req.params.handoverId} AND "storeId" IN (SELECT "id" FROM "Store" WHERE "companyId"=${req.user.companyId})`;res.json({ok:true})}catch(error){next(error)}
});

router.get("/ai-reader/status",requireCompanyModule("AI_READER"),async(req,res,next)=>{
  try{const rows=await prisma.$queryRaw`SELECT COUNT(*)::int AS drafts FROM "PurchaseDocument" WHERE "companyId"=${req.user.companyId} AND "sourceType" IN ('OCR_DRAFT','AI_DRAFT') AND "status"='DRAFT'`;res.json({twoStageReader:true,drafts:rows[0]?.drafts||0,localConfidenceThreshold:65,aiAutomatic:false,aiProviderConnected:false,message:"Η βάση και το workflow δύο σταδίων είναι έτοιμα. Η πραγματική κλήση AI θα ενεργοποιηθεί μόνο μετά τη σύνδεση provider/API και χειροκίνητη επιλογή «Επανέλεγχος με AI»."})}catch(error){next(error)}
});

export default router;
