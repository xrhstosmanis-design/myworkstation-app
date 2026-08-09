import crypto from "crypto";
import {Router} from "express";
import {z} from "zod";
import {prisma} from "../prisma.js";

const router=Router();
const roles=new Set(["SUPER_ADMIN","OWNER","ADMIN","MANAGER"]);
const id=()=>crypto.randomUUID();
const n=value=>Number(value||0);
const strip=value=>String(value??"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9α-ω]/g,"");

let schemaPromise;
async function ensureSchema(){
  if(!schemaPromise){
    schemaPromise=(async()=>{
      await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "PurchaseOrder" (
        "id" TEXT PRIMARY KEY,
        "companyId" TEXT NOT NULL,
        "storeId" TEXT NOT NULL,
        "supplierId" TEXT,
        "status" TEXT NOT NULL DEFAULT 'NEW',
        "invoiceNumber" TEXT,
        "description" TEXT,
        "createdByUserId" TEXT,
        "createdByName" TEXT,
        "updatedByName" TEXT,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "finalizedAt" TIMESTAMPTZ,
        "invoicedAt" TIMESTAMPTZ
      )`);
      await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "PurchaseOrder_company_date_idx" ON "PurchaseOrder" ("companyId","createdAt" DESC)`);
      await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "PurchaseOrder_store_idx" ON "PurchaseOrder" ("storeId","createdAt" DESC)`);
      await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "PurchaseOrder_supplier_idx" ON "PurchaseOrder" ("supplierId","createdAt" DESC)`);
      await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "PurchaseOrderLine" (
        "id" TEXT PRIMARY KEY,
        "orderId" TEXT NOT NULL,
        "productId" TEXT,
        "supplierCode" TEXT,
        "description" TEXT NOT NULL,
        "quantity" NUMERIC(14,4) NOT NULL DEFAULT 1,
        "unitCost" NUMERIC(14,6) NOT NULL DEFAULT 0,
        "discount1" NUMERIC(8,4) NOT NULL DEFAULT 0,
        "discount2" NUMERIC(8,4) NOT NULL DEFAULT 0,
        "discount3" NUMERIC(8,4) NOT NULL DEFAULT 0,
        "exciseTotal" NUMERIC(14,6) NOT NULL DEFAULT 0,
        "vatRate" NUMERIC(8,4) NOT NULL DEFAULT 24,
        "gift" BOOLEAN NOT NULL DEFAULT false,
        "initialUnitCost" NUMERIC(14,6) NOT NULL DEFAULT 0,
        "markupPercent" NUMERIC(12,6) NOT NULL DEFAULT 0,
        "proposedSalePrice" NUMERIC(14,4) NOT NULL DEFAULT 0,
        "netAmount" NUMERIC(14,4) NOT NULL DEFAULT 0,
        "vatAmount" NUMERIC(14,4) NOT NULL DEFAULT 0,
        "grossAmount" NUMERIC(14,4) NOT NULL DEFAULT 0,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`);
      await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "PurchaseOrderLine_order_idx" ON "PurchaseOrderLine" ("orderId")`);
      await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "PurchaseOrderLine_product_idx" ON "PurchaseOrderLine" ("productId")`);
      await prisma.$executeRawUnsafe(`ALTER TABLE "ProductBarcode" ADD COLUMN IF NOT EXISTS "salePrice" NUMERIC(14,4)`);
      await prisma.$executeRawUnsafe(`ALTER TABLE "ProductBarcode" ADD COLUMN IF NOT EXISTS "name" TEXT`);
      await prisma.$executeRawUnsafe(`ALTER TABLE "ProductBarcode" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()`);
    })().catch(error=>{schemaPromise=undefined;throw error});
  }
  return schemaPromise;
}
function requireAccess(req,res,next){
  if(req.user?.tokenType==="STORE_OPERATOR"||!roles.has(req.user?.role))return res.status(403).json({error:"Οι Παραγγελίες & Αγορές είναι διαθέσιμες μόνο σε Super Admin, Ιδιοκτήτη, Admin ή Manager."});
  next();
}
router.use(requireAccess);
router.use(async(req,res,next)=>{try{await ensureSchema();next()}catch(error){next(error)}});

async function store(companyId,storeId){return prisma.store.findFirst({where:{id:String(storeId),companyId,active:true},select:{id:true,name:true}})}
async function supplier(companyId,supplierId){if(!supplierId)return null;const rows=await prisma.$queryRaw`SELECT "id","name","taxId" FROM "Supplier" WHERE "id"=${String(supplierId)} AND "companyId"=${companyId} AND "active"=true LIMIT 1`;return rows[0]||null}
async function product(companyId,productId){if(!productId)return null;const rows=await prisma.$queryRaw`SELECT p."id",p."name",p."sku",p."salePrice",p."vatRate",p."categoryId",c."name" AS "categoryName" FROM "Product" p LEFT JOIN "ProductCategory" c ON c."id"=p."categoryId" WHERE p."id"=${String(productId)} AND p."companyId"=${companyId} LIMIT 1`;return rows[0]||null}
async function order(companyId,orderId){const rows=await prisma.$queryRaw`SELECT o.*,s."name" AS "supplierName",st."name" AS "storeName" FROM "PurchaseOrder" o JOIN "Store" st ON st."id"=o."storeId" AND st."companyId"=o."companyId" LEFT JOIN "Supplier" s ON s."id"=o."supplierId" WHERE o."id"=${orderId} AND o."companyId"=${companyId} LIMIT 1`;return rows[0]||null}
async function line(companyId,lineId){const rows=await prisma.$queryRaw`SELECT l.*,o."companyId",o."status",o."storeId",o."supplierId" FROM "PurchaseOrderLine" l JOIN "PurchaseOrder" o ON o."id"=l."orderId" WHERE l."id"=${lineId} AND o."companyId"=${companyId} LIMIT 1`;return rows[0]||null}
function editable(found){if(found?.status==="INVOICED"){const error=new Error("Η τιμολογημένη παραγγελία είναι κλειδωμένη για αλλαγές.");error.status=409;throw error}}
function calc(input,current={}){
  const quantity=Math.max(0.0001,n(input.quantity??current.quantity??1));
  const unitCost=Math.max(0,n(input.unitCost??current.unitCost??0));
  const d1=Math.min(100,Math.max(-100,n(input.discount1??current.discount1??0)));
  const d2=Math.min(100,Math.max(-100,n(input.discount2??current.discount2??0)));
  const d3=Math.min(100,Math.max(-100,n(input.discount3??current.discount3??0)));
  const exciseTotal=Math.max(0,n(input.exciseTotal??current.exciseTotal??0));
  const vatRate=Math.min(100,Math.max(0,n(input.vatRate??current.vatRate??24)));
  const factor=(1-d1/100)*(1-d2/100)*(1-d3/100);
  const finalUnitNet=unitCost*factor;
  const netAmount=finalUnitNet*quantity;
  const vatBase=netAmount+exciseTotal;
  const vatAmount=vatBase*vatRate/100;
  const grossAmount=vatBase+vatAmount;
  const grossUnit=grossAmount/quantity;
  let markupPercent=n(input.markupPercent??current.markupPercent??0);
  let proposedSalePrice=n(input.proposedSalePrice??current.proposedSalePrice??grossUnit);
  if(input.calculateFrom==="MARKUP")proposedSalePrice=Math.max(0,grossUnit*(1+markupPercent/100));
  if(input.calculateFrom==="RETAIL")markupPercent=grossUnit>0?((proposedSalePrice/grossUnit)-1)*100:0;
  if(!Number.isFinite(markupPercent))markupPercent=0;if(!Number.isFinite(proposedSalePrice))proposedSalePrice=0;
  return {quantity,unitCost,discount1:d1,discount2:d2,discount3:d3,exciseTotal,vatRate,finalUnitNet,netAmount,vatAmount,grossAmount,grossUnit,markupPercent,proposedSalePrice};
}
const lineSchema=z.object({productId:z.string().optional().nullable(),supplierCode:z.string().trim().max(100).optional().nullable(),description:z.string().trim().min(1).max(250),quantity:z.coerce.number().positive().max(1000000).optional(),unitCost:z.coerce.number().min(0).max(1000000).optional(),discount1:z.coerce.number().min(-100).max(100).optional(),discount2:z.coerce.number().min(-100).max(100).optional(),discount3:z.coerce.number().min(-100).max(100).optional(),exciseTotal:z.coerce.number().min(0).max(1000000).optional(),vatRate:z.coerce.number().min(0).max(100).optional(),gift:z.boolean().optional(),markupPercent:z.coerce.number().min(-100).max(10000).optional(),proposedSalePrice:z.coerce.number().min(0).max(1000000).optional(),calculateFrom:z.enum(["MARKUP","RETAIL","NONE"]).optional()});

router.get("/report",async(req,res,next)=>{try{
  const q=z.object({from:z.string().optional(),to:z.string().optional(),supplierId:z.string().optional(),storeId:z.string().optional(),status:z.enum(["ALL","NEW","FINAL","INVOICED"]).optional().default("ALL"),q:z.string().max(160).optional()}).parse(req.query||{});const companyId=req.user.companyId;
  const to=q.to?new Date(q.to):new Date(),from=q.from?new Date(q.from):new Date(to.getFullYear(),to.getMonth(),1);if(!Number.isFinite(from.getTime())||!Number.isFinite(to.getTime())||from>to)return res.status(400).json({error:"Μη έγκυρο διάστημα ημερομηνιών."});
  const stores=await prisma.store.findMany({where:{companyId,active:true},select:{id:true,name:true},orderBy:{name:"asc"}});const suppliers=await prisma.$queryRaw`SELECT "id","name","taxId" FROM "Supplier" WHERE "companyId"=${companyId} AND "active"=true ORDER BY "name"`;
  const text=q.q?`%${q.q}%`:null,storeId=q.storeId||null,supplierId=q.supplierId||null,status=q.status;
  const rows=await prisma.$queryRaw`SELECT o."id",o."status",o."invoiceNumber",o."description",o."createdAt",o."updatedAt",o."createdByName",o."updatedByName",s."name" AS "supplierName",st."name" AS "storeName",COUNT(l."id")::int AS "lineCount",COALESCE(SUM(l."netAmount"),0) AS "totalNet",COALESCE(SUM(l."vatAmount"),0) AS "totalVat",COALESCE(SUM(l."grossAmount"),0) AS "totalGross" FROM "PurchaseOrder" o JOIN "Store" st ON st."id"=o."storeId" AND st."companyId"=o."companyId" LEFT JOIN "Supplier" s ON s."id"=o."supplierId" LEFT JOIN "PurchaseOrderLine" l ON l."orderId"=o."id" WHERE o."companyId"=${companyId} AND o."createdAt">=${from} AND o."createdAt"<=${to} AND (${storeId}::text IS NULL OR o."storeId"=${storeId}) AND (${supplierId}::text IS NULL OR o."supplierId"=${supplierId}) AND (${status}='ALL' OR o."status"=${status}) AND (${text}::text IS NULL OR COALESCE(o."invoiceNumber",'') ILIKE ${text} OR COALESCE(o."description",'') ILIKE ${text} OR COALESCE(s."name",'') ILIKE ${text}) GROUP BY o."id",s."name",st."name" ORDER BY o."updatedAt" DESC LIMIT 800`;
  const orders=rows.map(r=>({...r,lineCount:n(r.lineCount),totalNet:n(r.totalNet),totalVat:n(r.totalVat),totalGross:n(r.totalGross)}));const summary=orders.reduce((a,r)=>{a.count++;a.net+=r.totalNet;a.gross+=r.totalGross;a[r.status]=(a[r.status]||0)+1;return a},{count:0,net:0,gross:0,NEW:0,FINAL:0,INVOICED:0});res.json({from,to,stores,suppliers,orders,summary});
}catch(error){next(error)}});

router.post("/",async(req,res,next)=>{try{
  const body=z.object({storeId:z.string(),supplierId:z.string().optional().nullable(),invoiceNumber:z.string().trim().max(100).optional().nullable(),description:z.string().trim().max(300).optional().nullable()}).parse(req.body||{}),companyId=req.user.companyId;
  if(!await store(companyId,body.storeId))return res.status(404).json({error:"Δεν βρέθηκε το κατάστημα."});if(body.supplierId&&!await supplier(companyId,body.supplierId))return res.status(404).json({error:"Δεν βρέθηκε ο προμηθευτής."});const orderId=id(),actor=req.user.fullName||"Χρήστης";
  await prisma.$executeRaw`INSERT INTO "PurchaseOrder" ("id","companyId","storeId","supplierId","invoiceNumber","description","createdByUserId","createdByName","updatedByName") VALUES (${orderId},${companyId},${body.storeId},${body.supplierId||null},${body.invoiceNumber||null},${body.description||null},${req.user.id},${actor},${actor})`;res.status(201).json({id:orderId,status:"NEW"});
}catch(error){next(error)}});

router.patch("/:orderId",async(req,res,next)=>{try{
  const companyId=req.user.companyId,found=await order(companyId,req.params.orderId);if(!found)return res.status(404).json({error:"Δεν βρέθηκε η παραγγελία."});editable(found);
  const body=z.object({supplierId:z.string().optional().nullable(),invoiceNumber:z.string().trim().max(100).optional().nullable(),description:z.string().trim().max(300).optional().nullable(),status:z.enum(["NEW","FINAL","INVOICED"]).optional()}).parse(req.body||{});if(body.supplierId&&!await supplier(companyId,body.supplierId))return res.status(404).json({error:"Δεν βρέθηκε ο προμηθευτής."});
  if(body.status==="INVOICED"&&found.status!=="FINAL")return res.status(409).json({error:"Η παραγγελία πρέπει πρώτα να οριστικοποιηθεί."});const actor=req.user.fullName||"Χρήστης";
  await prisma.$executeRaw`UPDATE "PurchaseOrder" SET "supplierId"=COALESCE(${body.supplierId??null},"supplierId"),"invoiceNumber"=COALESCE(${body.invoiceNumber??null},"invoiceNumber"),"description"=COALESCE(${body.description??null},"description"),"status"=COALESCE(${body.status??null},"status"),"updatedByName"=${actor},"finalizedAt"=CASE WHEN ${body.status||null}='FINAL' THEN NOW() ELSE "finalizedAt" END,"invoicedAt"=CASE WHEN ${body.status||null}='INVOICED' THEN NOW() ELSE "invoicedAt" END,"updatedAt"=NOW() WHERE "id"=${found.id} AND "companyId"=${companyId}`;res.json({ok:true});
}catch(error){next(error)}});

router.get("/:orderId/detail",async(req,res,next)=>{try{
  const companyId=req.user.companyId,found=await order(companyId,req.params.orderId);if(!found)return res.status(404).json({error:"Δεν βρέθηκε η παραγγελία."});
  const rows=await prisma.$queryRaw`SELECT l.*,p."name" AS "productName",p."sku",p."salePrice" AS "currentSalePrice",p."vatRate" AS "productVatRate",c."name" AS "categoryName",sp."currentStock",(SELECT b."barcode" FROM "ProductBarcode" b WHERE b."productId"=p."id" ORDER BY b."createdAt" LIMIT 1) AS "primaryBarcode" FROM "PurchaseOrderLine" l LEFT JOIN "Product" p ON p."id"=l."productId" AND p."companyId"=${companyId} LEFT JOIN "ProductCategory" c ON c."id"=p."categoryId" LEFT JOIN "StoreProduct" sp ON sp."productId"=p."id" AND sp."storeId"=${found.storeId} WHERE l."orderId"=${found.id} ORDER BY l."createdAt",l."id"`;
  const lines=rows.map(r=>({...r,quantity:n(r.quantity),unitCost:n(r.unitCost),discount1:n(r.discount1),discount2:n(r.discount2),discount3:n(r.discount3),exciseTotal:n(r.exciseTotal),vatRate:n(r.vatRate),initialUnitCost:n(r.initialUnitCost),markupPercent:n(r.markupPercent),proposedSalePrice:n(r.proposedSalePrice),netAmount:n(r.netAmount),vatAmount:n(r.vatAmount),grossAmount:n(r.grossAmount),currentSalePrice:n(r.currentSalePrice),currentStock:n(r.currentStock),gift:Boolean(r.gift)}));const totals=lines.reduce((a,r)=>{a.quantity+=r.quantity;a.net+=r.netAmount;a.vat+=r.vatAmount;a.gross+=r.grossAmount;return a},{quantity:0,net:0,vat:0,gross:0});res.json({order:found,lines,totals});
}catch(error){next(error)}});

router.post("/:orderId/lines",async(req,res,next)=>{try{
  const companyId=req.user.companyId,found=await order(companyId,req.params.orderId);if(!found)return res.status(404).json({error:"Δεν βρέθηκε η παραγγελία."});editable(found);const body=lineSchema.parse(req.body||{});const p=body.productId?await product(companyId,body.productId):null;if(body.productId&&!p)return res.status(404).json({error:"Δεν βρέθηκε το προϊόν."});const c=calc({...body,vatRate:body.vatRate??p?.vatRate??24,proposedSalePrice:body.proposedSalePrice??p?.salePrice??0,calculateFrom:body.calculateFrom||"NONE"});const lineId=id();
  await prisma.$executeRaw`INSERT INTO "PurchaseOrderLine" ("id","orderId","productId","supplierCode","description","quantity","unitCost","discount1","discount2","discount3","exciseTotal","vatRate","gift","initialUnitCost","markupPercent","proposedSalePrice","netAmount","vatAmount","grossAmount") VALUES (${lineId},${found.id},${body.productId||null},${body.supplierCode||null},${body.description||p?.name||"Είδος"},${c.quantity},${c.unitCost},${c.discount1},${c.discount2},${c.discount3},${c.exciseTotal},${c.vatRate},${body.gift||false},${c.unitCost},${c.markupPercent},${c.proposedSalePrice},${c.netAmount},${c.vatAmount},${c.grossAmount})`;res.status(201).json({id:lineId,...c});
}catch(error){next(error)}});

router.patch("/:orderId/lines/:lineId",async(req,res,next)=>{try{
  const companyId=req.user.companyId,found=await order(companyId,req.params.orderId),current=await line(companyId,req.params.lineId);if(!found||!current||current.orderId!==found.id)return res.status(404).json({error:"Δεν βρέθηκε η γραμμή παραγγελίας."});editable(found);const body=lineSchema.partial().parse(req.body||{});if(body.productId&&!await product(companyId,body.productId))return res.status(404).json({error:"Δεν βρέθηκε το προϊόν."});const c=calc(body,current);
  await prisma.$executeRaw`UPDATE "PurchaseOrderLine" SET "productId"=COALESCE(${body.productId??null},"productId"),"supplierCode"=COALESCE(${body.supplierCode??null},"supplierCode"),"description"=COALESCE(${body.description??null},"description"),"quantity"=${c.quantity},"unitCost"=${c.unitCost},"discount1"=${c.discount1},"discount2"=${c.discount2},"discount3"=${c.discount3},"exciseTotal"=${c.exciseTotal},"vatRate"=${c.vatRate},"gift"=COALESCE(${body.gift??null},"gift"),"markupPercent"=${c.markupPercent},"proposedSalePrice"=${c.proposedSalePrice},"netAmount"=${c.netAmount},"vatAmount"=${c.vatAmount},"grossAmount"=${c.grossAmount},"updatedAt"=NOW() WHERE "id"=${current.id}`;res.json({ok:true,...c});
}catch(error){next(error)}});

router.delete("/:orderId/lines/:lineId",async(req,res,next)=>{try{const companyId=req.user.companyId,found=await order(companyId,req.params.orderId),current=await line(companyId,req.params.lineId);if(!found||!current||current.orderId!==found.id)return res.status(404).json({error:"Δεν βρέθηκε η γραμμή."});editable(found);await prisma.$executeRaw`DELETE FROM "PurchaseOrderLine" WHERE "id"=${current.id}`;res.json({ok:true})}catch(error){next(error)}});

router.patch("/:orderId/lines/:lineId/product-card",async(req,res,next)=>{try{
  const companyId=req.user.companyId,found=await order(companyId,req.params.orderId),current=await line(companyId,req.params.lineId);if(!found||!current||current.orderId!==found.id)return res.status(404).json({error:"Δεν βρέθηκε η γραμμή."});editable(found);const body=z.object({supplierCode:z.string().trim().max(100).optional().nullable(),description:z.string().trim().min(1).max(250).optional(),productName:z.string().trim().min(1).max(180).optional(),salePrice:z.coerce.number().min(0).max(1000000).optional(),primaryBarcode:z.string().trim().min(3).max(80).optional()}).parse(req.body||{});
  await prisma.$transaction(async tx=>{await tx.$executeRaw`UPDATE "PurchaseOrderLine" SET "supplierCode"=COALESCE(${body.supplierCode??null},"supplierCode"),"description"=COALESCE(${body.description??null},"description"),"updatedAt"=NOW() WHERE "id"=${current.id}`;if(current.productId){await tx.$executeRaw`UPDATE "Product" SET "name"=COALESCE(${body.productName??body.description??null},"name"),"salePrice"=COALESCE(${body.salePrice??null},"salePrice"),"updatedAt"=NOW() WHERE "id"=${current.productId} AND "companyId"=${companyId}`;if(body.primaryBarcode){const conflict=await tx.$queryRaw`SELECT b."productId" FROM "ProductBarcode" b JOIN "Product" p ON p."id"=b."productId" WHERE b."barcode"=${body.primaryBarcode} AND p."companyId"=${companyId} AND b."productId"<>${current.productId} LIMIT 1`;if(conflict[0]){const error=new Error("Το barcode χρησιμοποιείται ήδη από άλλο προϊόν.");error.status=409;throw error}const existing=await tx.$queryRaw`SELECT "id" FROM "ProductBarcode" WHERE "productId"=${current.productId} ORDER BY "createdAt" LIMIT 1`;if(existing[0])await tx.$executeRaw`UPDATE "ProductBarcode" SET "barcode"=${body.primaryBarcode},"salePrice"=COALESCE(${body.salePrice??null},"salePrice"),"updatedAt"=NOW() WHERE "id"=${existing[0].id}`;else await tx.$executeRaw`INSERT INTO "ProductBarcode" ("id","productId","barcode","salePrice","unitMultiplier") VALUES (${id()},${current.productId},${body.primaryBarcode},${body.salePrice??null},1)`;}}});res.json({ok:true});
}catch(error){next(error)}});

router.get("/products/:productId/barcodes",async(req,res,next)=>{try{const companyId=req.user.companyId,p=await product(companyId,req.params.productId);if(!p)return res.status(404).json({error:"Δεν βρέθηκε το προϊόν."});const rows=await prisma.$queryRaw`SELECT "id","barcode","unitMultiplier","salePrice","name","createdAt","updatedAt" FROM "ProductBarcode" WHERE "productId"=${p.id} ORDER BY "createdAt"`;res.json({product:p,barcodes:rows.map(r=>({...r,unitMultiplier:n(r.unitMultiplier),salePrice:r.salePrice==null?null:n(r.salePrice)}))})}catch(error){next(error)}});
router.post("/products/:productId/barcodes",async(req,res,next)=>{try{const companyId=req.user.companyId,p=await product(companyId,req.params.productId);if(!p)return res.status(404).json({error:"Δεν βρέθηκε το προϊόν."});const body=z.object({barcode:z.string().trim().min(3).max(80),unitMultiplier:z.coerce.number().positive().max(100000).optional(),salePrice:z.coerce.number().min(0).max(1000000).optional().nullable(),name:z.string().trim().max(120).optional().nullable()}).parse(req.body||{});const conflict=await prisma.$queryRaw`SELECT b."productId" FROM "ProductBarcode" b JOIN "Product" x ON x."id"=b."productId" WHERE b."barcode"=${body.barcode} AND x."companyId"=${companyId} LIMIT 1`;if(conflict[0])return res.status(409).json({error:"Το barcode υπάρχει ήδη."});const barcodeId=id();await prisma.$executeRaw`INSERT INTO "ProductBarcode" ("id","productId","barcode","unitMultiplier","salePrice","name") VALUES (${barcodeId},${p.id},${body.barcode},${body.unitMultiplier||1},${body.salePrice??null},${body.name||null})`;res.status(201).json({id:barcodeId})}catch(error){next(error)}});
router.patch("/products/:productId/barcodes/:barcodeId",async(req,res,next)=>{try{const companyId=req.user.companyId,p=await product(companyId,req.params.productId);if(!p)return res.status(404).json({error:"Δεν βρέθηκε το προϊόν."});const body=z.object({barcode:z.string().trim().min(3).max(80).optional(),unitMultiplier:z.coerce.number().positive().max(100000).optional(),salePrice:z.coerce.number().min(0).max(1000000).optional().nullable(),name:z.string().trim().max(120).optional().nullable()}).parse(req.body||{});const owned=await prisma.$queryRaw`SELECT "id" FROM "ProductBarcode" WHERE "id"=${req.params.barcodeId} AND "productId"=${p.id} LIMIT 1`;if(!owned[0])return res.status(404).json({error:"Δεν βρέθηκε το barcode."});if(body.barcode){const conflict=await prisma.$queryRaw`SELECT b."id" FROM "ProductBarcode" b JOIN "Product" x ON x."id"=b."productId" WHERE b."barcode"=${body.barcode} AND x."companyId"=${companyId} AND b."id"<>${req.params.barcodeId} LIMIT 1`;if(conflict[0])return res.status(409).json({error:"Το barcode χρησιμοποιείται ήδη."})}await prisma.$executeRaw`UPDATE "ProductBarcode" SET "barcode"=COALESCE(${body.barcode??null},"barcode"),"unitMultiplier"=COALESCE(${body.unitMultiplier??null},"unitMultiplier"),"salePrice"=COALESCE(${body.salePrice??null},"salePrice"),"name"=COALESCE(${body.name??null},"name"),"updatedAt"=NOW() WHERE "id"=${req.params.barcodeId}`;res.json({ok:true})}catch(error){next(error)}});
router.delete("/products/:productId/barcodes/:barcodeId",async(req,res,next)=>{try{const companyId=req.user.companyId,p=await product(companyId,req.params.productId);if(!p)return res.status(404).json({error:"Δεν βρέθηκε το προϊόν."});const result=await prisma.$executeRaw`DELETE FROM "ProductBarcode" WHERE "id"=${req.params.barcodeId} AND "productId"=${p.id}`;if(!result)return res.status(404).json({error:"Δεν βρέθηκε το barcode."});res.json({ok:true})}catch(error){next(error)}});

router.get("/stock-proposal",async(req,res,next)=>{try{const companyId=req.user.companyId,storeId=String(req.query.storeId||"");if(!await store(companyId,storeId))return res.status(404).json({error:"Δεν βρέθηκε το κατάστημα."});const rows=await prisma.$queryRaw`SELECT p."id" AS "productId",p."name",p."sku",sp."currentStock",sp."minStock",GREATEST(COALESCE(sp."minStock",0)-COALESCE(sp."currentStock",0),0) AS "suggestedQuantity",hist."supplierId",hist."supplierName",hist."lastCost" FROM "StoreProduct" sp JOIN "Product" p ON p."id"=sp."productId" AND p."companyId"=${companyId} LEFT JOIN LATERAL (SELECT d."supplierId",s."name" AS "supplierName",l."unitCost" AS "lastCost" FROM "PurchaseDocumentLine" l JOIN "PurchaseDocument" d ON d."id"=l."purchaseDocumentId" LEFT JOIN "Supplier" s ON s."id"=d."supplierId" WHERE d."companyId"=${companyId} AND d."storeId"=${storeId} AND l."productId"=p."id" ORDER BY d."documentDate" DESC LIMIT 1) hist ON true WHERE sp."storeId"=${storeId} AND COALESCE(sp."minStock",0)>0 AND COALESCE(sp."currentStock",0)<COALESCE(sp."minStock",0) ORDER BY (COALESCE(sp."minStock",0)-COALESCE(sp."currentStock",0)) DESC,p."name"`;res.json(rows.map(r=>({...r,currentStock:n(r.currentStock),minStock:n(r.minStock),suggestedQuantity:n(r.suggestedQuantity),lastCost:r.lastCost==null?null:n(r.lastCost)})))}catch(error){next(error)}});

export default router;
