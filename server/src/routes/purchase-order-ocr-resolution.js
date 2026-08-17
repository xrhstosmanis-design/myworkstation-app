import crypto from "crypto";
import {Router} from "express";
import {z} from "zod";
import {prisma} from "../prisma.js";

const router=Router();
const roles=new Set(["SUPER_ADMIN","OWNER","ADMIN","MANAGER"]);
const id=()=>crypto.randomUUID();

function requireManager(req,res,next){
  if(req.user?.tokenType==="STORE_OPERATOR"||!roles.has(req.user?.role))return res.status(403).json({error:"Η επίλυση γραμμών τιμολογίου γίνεται μόνο από Ιδιοκτήτη ή Διαχειριστή."});
  next();
}
router.use(requireManager);

async function ensureSchema(){
  await prisma.$executeRawUnsafe(`ALTER TABLE "PurchaseOrderLine" ADD COLUMN IF NOT EXISTS "ocrRawText" TEXT`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "PurchaseOrderLine" ADD COLUMN IF NOT EXISTS "ocrConfidence" NUMERIC(6,3)`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "PurchaseOrderLine" ADD COLUMN IF NOT EXISTS "resolutionStatus" TEXT NOT NULL DEFAULT 'MATCHED'`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "PurchaseOrderLine" ADD COLUMN IF NOT EXISTS "detectedBarcode" TEXT`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "PurchaseOrderLine" ADD COLUMN IF NOT EXISTS "ocrLineIndex" INTEGER`);
}
router.use(async(req,res,next)=>{try{await ensureSchema();next()}catch(error){next(error)}});

async function ownedOrder(companyId,orderId){
  const rows=await prisma.$queryRaw`SELECT "id","storeId","supplierId","status","sourceType" FROM "PurchaseOrder" WHERE "id"=${orderId} AND "companyId"=${companyId} LIMIT 1`;
  return rows[0]||null;
}
async function ownedLine(companyId,orderId,lineId){
  const rows=await prisma.$queryRaw`
    SELECT l.*,o."storeId",o."status",o."sourceType"
    FROM "PurchaseOrderLine" l JOIN "PurchaseOrder" o ON o."id"=l."orderId"
    WHERE l."id"=${lineId} AND l."orderId"=${orderId} AND o."companyId"=${companyId} LIMIT 1`;
  return rows[0]||null;
}

router.get("/:orderId/ocr-lines",async(req,res,next)=>{
  try{
    const order=await ownedOrder(req.user.companyId,req.params.orderId);
    if(!order)return res.status(404).json({error:"Δεν βρέθηκε η παραγγελία."});
    const rows=await prisma.$queryRaw`
      SELECT l."id",l."productId",l."description",l."quantity",l."unitCost",l."vatRate",l."grossAmount",
             l."ocrRawText",l."ocrConfidence",l."resolutionStatus",l."detectedBarcode",l."ocrLineIndex",
             p."name" AS "productName",p."sku",p."salePrice",p."costPrice",
             COALESCE((SELECT json_agg(pb."barcode" ORDER BY pb."barcode") FROM "ProductBarcode" pb WHERE pb."productId"=p."id"),'[]') AS "barcodes"
      FROM "PurchaseOrderLine" l
      LEFT JOIN "Product" p ON p."id"=l."productId" AND p."companyId"=${req.user.companyId}
      WHERE l."orderId"=${order.id}
      ORDER BY COALESCE(l."ocrLineIndex",2147483647),l."createdAt",l."id"`;
    const mapped=rows.map((r,index)=>{
      const quantity=Number(r.quantity||0),unitCost=Number(r.unitCost||0),grossAmount=Number(r.grossAmount||0);
      const economicProduct=Boolean(String(r.description||r.ocrRawText||"").trim())&&quantity>0&&(unitCost>0||grossAmount>0);
      return {...r,quantity,unitCost,vatRate:Number(r.vatRate||0),grossAmount,ocrConfidence:Number(r.ocrConfidence||0),ocrSequence:Number(r.ocrLineIndex||index+1),ocrLineType:economicProduct?"PRODUCT":"INFO"};
    });
    res.json({order,rows:mapped,unresolved:mapped.filter(r=>r.ocrLineType==="PRODUCT"&&r.resolutionStatus==='UNRESOLVED').length});
  }catch(error){next(error)}
});

router.get("/:orderId/ocr-lines/:lineId/search",async(req,res,next)=>{
  try{
    const order=await ownedOrder(req.user.companyId,req.params.orderId);if(!order)return res.status(404).json({error:"Δεν βρέθηκε η παραγγελία."});
    const q=String(req.query.q||"").trim();if(q.length<2)return res.status(400).json({error:"Γράψε τουλάχιστον 2 χαρακτήρες ή barcode."});
    const like=`%${q}%`;
    const local=await prisma.$queryRaw`
      SELECT p."id",p."name",p."sku",p."vatRate",p."salePrice",p."costPrice",'LOCAL' AS "source",
        COALESCE((SELECT json_agg(pb."barcode" ORDER BY pb."barcode") FROM "ProductBarcode" pb WHERE pb."productId"=p."id"),'[]') AS "barcodes"
      FROM "Product" p WHERE p."companyId"=${req.user.companyId} AND p."active"=true AND (
        p."name" ILIKE ${like} OR p."sku" ILIKE ${like} OR EXISTS(SELECT 1 FROM "ProductBarcode" pb WHERE pb."productId"=p."id" AND pb."barcode" ILIKE ${like})
      ) ORDER BY CASE WHEN p."sku"=${q} OR EXISTS(SELECT 1 FROM "ProductBarcode" pb WHERE pb."productId"=p."id" AND pb."barcode"=${q}) THEN 0 ELSE 1 END,p."name" LIMIT 30`;
    const master=await prisma.$queryRaw`
      SELECT mp."id",mp."name",mp."sourceCode" AS "sku",mp."vatRate",0::numeric AS "salePrice",0::numeric AS "costPrice",'MASTER_CATALOG' AS "source",
        COALESCE((SELECT json_agg(mb."barcode" ORDER BY mb."barcode") FROM "MasterProductBarcode" mb WHERE mb."masterProductId"=mp."id"),'[]') AS "barcodes"
      FROM "MasterProduct" mp WHERE mp."active"=true AND (
        mp."name" ILIKE ${like} OR mp."sourceCode" ILIKE ${like} OR EXISTS(SELECT 1 FROM "MasterProductBarcode" mb WHERE mb."masterProductId"=mp."id" AND mb."barcode" ILIKE ${like})
      ) ORDER BY mp."name" LIMIT 20`;
    res.json({query:q,rows:[...local,...master].map(r=>({...r,vatRate:Number(r.vatRate||0),salePrice:Number(r.salePrice||0),costPrice:Number(r.costPrice||0)}))});
  }catch(error){next(error)}
});

router.post("/:orderId/ocr-lines/:lineId/resolve-existing",async(req,res,next)=>{
  try{
    const body=z.object({productId:z.string().min(1),addBarcode:z.boolean().optional().default(false),barcode:z.string().trim().max(80).optional().nullable()}).parse(req.body||{});
    const line=await ownedLine(req.user.companyId,req.params.orderId,req.params.lineId);if(!line)return res.status(404).json({error:"Δεν βρέθηκε η γραμμή."});
    if(line.status!=="NEW")return res.status(409).json({error:"Αλλαγές αντιστοίχισης επιτρέπονται μόνο σε Νέα παραγγελία."});
    const products=await prisma.$queryRaw`SELECT "id","name","vatRate","salePrice","costPrice" FROM "Product" WHERE "id"=${body.productId} AND "companyId"=${req.user.companyId} AND "active"=true LIMIT 1`;
    const product=products[0];if(!product)return res.status(404).json({error:"Δεν βρέθηκε το προϊόν."});
    const barcode=String(body.barcode||line.detectedBarcode||"").trim();
    await prisma.$transaction(async tx=>{
      if(body.addBarcode&&barcode){
        const duplicate=await tx.$queryRaw`SELECT p."id",p."name" FROM "ProductBarcode" pb JOIN "Product" p ON p."id"=pb."productId" WHERE p."companyId"=${req.user.companyId} AND pb."barcode"=${barcode} LIMIT 1`;
        if(duplicate[0]&&duplicate[0].id!==product.id){const error=new Error(`Το barcode ${barcode} ανήκει ήδη στο προϊόν «${duplicate[0].name}».`);error.status=409;throw error;}
        if(!duplicate[0])await tx.$executeRaw`INSERT INTO "ProductBarcode" ("id","productId","barcode","unitMultiplier") VALUES (${id()},${product.id},${barcode},1)`;
      }
      const quantity=Math.max(0.0001,Number(line.quantity||1)),unitCost=Math.max(0,Number(line.unitCost||0)),vatRate=Number(product.vatRate||0),net=quantity*unitCost,vat=net*vatRate/100;
      await tx.$executeRaw`UPDATE "PurchaseOrderLine" SET "productId"=${product.id},"vatRate"=${vatRate},"netAmount"=${net},"vatAmount"=${vat},"grossAmount"=${net+vat},"proposedSalePrice"=${Number(product.salePrice||0)},"resolutionStatus"='MATCHED',"updatedAt"=NOW() WHERE "id"=${line.id}`;
    });
    res.json({ok:true,product:{id:product.id,name:product.name},barcodeAdded:Boolean(body.addBarcode&&barcode)});
  }catch(error){next(error)}
});

router.post("/:orderId/ocr-lines/:lineId/create-product",async(req,res,next)=>{
  try{
    const body=z.object({name:z.string().trim().min(2).max(250),barcode:z.string().trim().max(80).optional().nullable(),vatRate:z.coerce.number().min(0).max(100).default(24),salePrice:z.coerce.number().min(0).default(0),categoryId:z.string().optional().nullable()}).parse(req.body||{});
    const line=await ownedLine(req.user.companyId,req.params.orderId,req.params.lineId);if(!line)return res.status(404).json({error:"Δεν βρέθηκε η γραμμή."});
    if(line.status!=="NEW")return res.status(409).json({error:"Νέο προϊόν από τιμολόγιο δημιουργείται μόνο πριν την Οριστικοποίηση."});
    const barcode=String(body.barcode||line.detectedBarcode||"").trim();
    if(barcode){const d=await prisma.$queryRaw`SELECT p."id",p."name" FROM "ProductBarcode" pb JOIN "Product" p ON p."id"=pb."productId" WHERE p."companyId"=${req.user.companyId} AND pb."barcode"=${barcode} LIMIT 1`;if(d[0])return res.status(409).json({error:`Το barcode υπάρχει ήδη στο «${d[0].name}». Χρησιμοποίησε Συγχώνευση/Αντιστοίχιση.`})}
    const productId=id();
    await prisma.$transaction(async tx=>{
      const nextSkuRows=await tx.$queryRaw`SELECT COALESCE(MAX(CASE WHEN "sku" ~ '^[0-9]+$' THEN "sku"::bigint END),10000)+1 AS "next" FROM "Product" WHERE "companyId"=${req.user.companyId}`;
      const sku=String(nextSkuRows[0]?.next||10001);
      await tx.$executeRaw`INSERT INTO "Product" ("id","companyId","categoryId","sku","name","unit","vatRate","vatVerified","salePrice","costPrice","trackStock","active") VALUES (${productId},${req.user.companyId},${body.categoryId||null},${sku},${body.name},'PIECE',${body.vatRate},true,${body.salePrice},${Number(line.unitCost||0)},true,true)`;
      if(barcode)await tx.$executeRaw`INSERT INTO "ProductBarcode" ("id","productId","barcode","unitMultiplier") VALUES (${id()},${productId},${barcode},1)`;
      await tx.$executeRaw`INSERT INTO "StoreProduct" ("id","storeId","productId","salePrice","currentStock","active") VALUES (${id()},${line.storeId},${productId},${body.salePrice},0,true) ON CONFLICT ("storeId","productId") DO NOTHING`;
      const quantity=Math.max(0.0001,Number(line.quantity||1)),unitCost=Math.max(0,Number(line.unitCost||0)),net=quantity*unitCost,vat=net*body.vatRate/100;
      await tx.$executeRaw`UPDATE "PurchaseOrderLine" SET "productId"=${productId},"description"=${body.name},"vatRate"=${body.vatRate},"netAmount"=${net},"vatAmount"=${vat},"grossAmount"=${net+vat},"proposedSalePrice"=${body.salePrice},"resolutionStatus"='MATCHED',"updatedAt"=NOW() WHERE "id"=${line.id}`;
    });
    res.status(201).json({ok:true,productId});
  }catch(error){next(error)}
});

export default router;
