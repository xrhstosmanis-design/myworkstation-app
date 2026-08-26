import crypto from "crypto";
import {Router} from "express";
import {z} from "zod";
import {prisma} from "../prisma.js";
import {requireCompanyModule} from "../middleware/module-access.js";

const router=Router();
const uid=()=>crypto.randomUUID();
const companyId=req=>req.user?.companyId||null;
const normalizeAudienceCard=value=>String(value||"").trim().toUpperCase().replace(/[^A-Z0-9]/g,"");
const audienceCardHash=value=>crypto.createHash("sha256").update(normalizeAudienceCard(value)).digest("hex");
let audienceDiscountTablesReady=false;
async function ensureAudienceDiscountTables(){if(audienceDiscountTablesReady)return;await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "StoreProductAudienceDiscount" ("id" TEXT PRIMARY KEY,"companyId" TEXT NOT NULL,"storeId" TEXT NOT NULL,"productId" TEXT NOT NULL,"audience" TEXT NOT NULL,"discountPercent" NUMERIC(6,2) NOT NULL,"active" BOOLEAN NOT NULL DEFAULT TRUE,"createdByUserId" TEXT,"createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),"updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),UNIQUE("storeId","productId","audience"),CHECK ("audience" IN ('DOCTOR','NURSE','STAFF','CUSTOMER')),CHECK ("discountPercent">=0 AND "discountPercent"<=100))`);await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "StoreProductAudienceDiscount_lookup_idx" ON "StoreProductAudienceDiscount"("companyId","storeId","audience","productId")`);await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "StoreProductAudienceDiscountAudit" ("id" TEXT PRIMARY KEY,"companyId" TEXT NOT NULL,"storeId" TEXT NOT NULL,"audience" TEXT NOT NULL,"discountPercent" NUMERIC(6,2) NOT NULL,"productIds" JSONB NOT NULL,"actorId" TEXT,"createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW())`);audienceDiscountTablesReady=true}

router.post("/new",requireCompanyModule("INVENTORY"),async(req,res,next)=>{
  try{
    const company=companyId(req);if(!company)return res.status(403).json({error:"Δεν υπάρχει ενεργή εταιρεία."});
    const body=z.object({name:z.string().trim().min(2).max(250),sku:z.string().trim().max(80).optional().or(z.literal("")),categoryName:z.string().trim().max(160).optional().or(z.literal("")),unit:z.enum(["PIECE","KG","LITER","PACKAGE"]).default("PIECE"),salePrice:z.coerce.number().min(0).default(0),costPrice:z.coerce.number().min(0).default(0),vatRate:z.coerce.number().min(0).max(100).default(0),vatVerified:z.boolean().default(false),trackStock:z.boolean().default(true),active:z.boolean().default(true),barcode:z.string().trim().max(80).optional().or(z.literal("")),storeIds:z.array(z.string().min(1)).max(500).default([])}).parse(req.body||{});
    if(body.sku){const d=await prisma.$queryRaw`SELECT "id" FROM "Product" WHERE "companyId"=${company} AND "sku"=${body.sku} LIMIT 1`;if(d[0])return res.status(409).json({error:"Ο κωδικός/SKU χρησιμοποιείται ήδη."})}
    if(body.barcode){const d=await prisma.$queryRaw`SELECT pb."id" FROM "ProductBarcode" pb JOIN "Product" p ON p."id"=pb."productId" WHERE p."companyId"=${company} AND pb."barcode"=${body.barcode} LIMIT 1`;if(d[0])return res.status(409).json({error:"Το barcode χρησιμοποιείται ήδη."})}
    const validStores=body.storeIds.length?await prisma.store.findMany({where:{companyId:company,id:{in:body.storeIds}},select:{id:true}}):await prisma.store.findMany({where:{companyId:company,active:true},select:{id:true}});
    if(body.storeIds.length&&validStores.length!==new Set(body.storeIds).size)return res.status(400).json({error:"Υπάρχει μη έγκυρο κατάστημα."});
    const productId=uid();
    await prisma.$transaction(async tx=>{
      let categoryId=null;if(body.categoryName){const c=await tx.$queryRaw`SELECT "id" FROM "ProductCategory" WHERE "companyId"=${company} AND "name"=${body.categoryName} LIMIT 1`;categoryId=c[0]?.id||uid();if(!c[0])await tx.$executeRaw`INSERT INTO "ProductCategory" ("id","companyId","name") VALUES (${categoryId},${company},${body.categoryName})`}
      await tx.$executeRaw`INSERT INTO "Product" ("id","companyId","categoryId","sku","name","unit","vatRate","vatVerified","salePrice","costPrice","trackStock","active") VALUES (${productId},${company},${categoryId},${body.sku||null},${body.name},${body.unit},${body.vatRate},${body.vatVerified},${body.salePrice},${body.costPrice},${body.trackStock},${body.active})`;
      if(body.barcode)await tx.$executeRaw`INSERT INTO "ProductBarcode" ("id","productId","barcode","unitMultiplier") VALUES (${uid()},${productId},${body.barcode},1)`;
      for(const store of validStores)await tx.$executeRaw`INSERT INTO "StoreProduct" ("id","storeId","productId","salePrice","active") VALUES (${uid()},${store.id},${productId},${body.salePrice},${body.active}) ON CONFLICT ("storeId","productId") DO NOTHING`;
    });
    res.status(201).json({id:productId});
  }catch(error){next(error)}
});

router.patch("/bulk-card",requireCompanyModule("INVENTORY"),async(req,res,next)=>{
  try{
    const company=companyId(req);if(!company)return res.status(403).json({error:"Δεν υπάρχει ενεργή εταιρεία."});
    const body=z.object({productIds:z.array(z.string().min(1)).min(1).max(500),categoryName:z.string().trim().max(160).optional(),vatRate:z.coerce.number().min(0).max(100).optional(),salePrice:z.coerce.number().min(0).optional(),active:z.boolean().optional(),trackStock:z.boolean().optional()}).parse(req.body||{});
    const ids=[...new Set(body.productIds)];const found=await prisma.$queryRaw`SELECT "id" FROM "Product" WHERE "companyId"=${company} AND "id"=ANY(${ids}::text[])`;if(found.length!==ids.length)return res.status(400).json({error:"Υπάρχει μη έγκυρο προϊόν στην επιλογή."});
    await prisma.$transaction(async tx=>{
      let categoryId;if(body.categoryName!==undefined){categoryId=null;if(body.categoryName){const c=await tx.$queryRaw`SELECT "id" FROM "ProductCategory" WHERE "companyId"=${company} AND "name"=${body.categoryName} LIMIT 1`;categoryId=c[0]?.id||uid();if(!c[0])await tx.$executeRaw`INSERT INTO "ProductCategory" ("id","companyId","name") VALUES (${categoryId},${company},${body.categoryName})`}}
      for(const id of ids){
        if(body.categoryName!==undefined)await tx.$executeRaw`UPDATE "Product" SET "categoryId"=${categoryId},"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${id}`;
        if(body.vatRate!==undefined)await tx.$executeRaw`UPDATE "Product" SET "vatRate"=${body.vatRate},"vatVerified"=true,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${id}`;
        if(body.salePrice!==undefined){await tx.$executeRaw`UPDATE "Product" SET "salePrice"=${body.salePrice},"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${id}`;await tx.$executeRaw`UPDATE "StoreProduct" SET "salePrice"=${body.salePrice},"updatedAt"=CURRENT_TIMESTAMP WHERE "productId"=${id}`}
        if(body.active!==undefined)await tx.$executeRaw`UPDATE "Product" SET "active"=${body.active},"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${id}`;
        if(body.trackStock!==undefined)await tx.$executeRaw`UPDATE "Product" SET "trackStock"=${body.trackStock},"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${id}`;
      }
    });res.json({ok:true,changed:ids.length});
  }catch(error){next(error)}
});

router.put("/bulk-audience-discount",requireCompanyModule("INVENTORY"),async(req,res,next)=>{
  try{
    const company=companyId(req);if(!company)return res.status(403).json({error:"Δεν υπάρχει ενεργή εταιρεία."});await ensureAudienceDiscountTables();
    const body=z.object({storeId:z.string().min(1),productIds:z.array(z.string().min(1)).min(1).max(500),audience:z.enum(["DOCTOR","NURSE","STAFF","CUSTOMER"]),discountPercent:z.coerce.number().min(0).max(100)}).parse(req.body||{}),ids=[...new Set(body.productIds)];
    const [store,products]=await Promise.all([prisma.store.findFirst({where:{id:body.storeId,companyId:company},select:{id:true}}),prisma.$queryRaw`SELECT p."id" FROM "Product" p JOIN "StoreProduct" sp ON sp."productId"=p."id" AND sp."storeId"=${body.storeId} WHERE p."companyId"=${company} AND p."id"=ANY(${ids}::text[])`]);
    if(!store||products.length!==ids.length)return res.status(400).json({error:"Υπάρχει μη έγκυρο κατάστημα ή προϊόν στην επιλογή."});
    await prisma.$transaction(async tx=>{for(const productId of ids)await tx.$executeRaw`INSERT INTO "StoreProductAudienceDiscount" ("id","companyId","storeId","productId","audience","discountPercent","active","createdByUserId") VALUES (${uid()},${company},${body.storeId},${productId},${body.audience},${body.discountPercent},${body.discountPercent>0},${req.user.id||null}) ON CONFLICT ("storeId","productId","audience") DO UPDATE SET "discountPercent"=EXCLUDED."discountPercent","active"=EXCLUDED."active","createdByUserId"=EXCLUDED."createdByUserId","updatedAt"=NOW()`;await tx.$executeRaw`INSERT INTO "StoreProductAudienceDiscountAudit" ("id","companyId","storeId","audience","discountPercent","productIds","actorId") VALUES (${uid()},${company},${body.storeId},${body.audience},${body.discountPercent},${JSON.stringify(ids)}::jsonb,${req.user.id||null})`});
    res.json({ok:true,changed:ids.length,storeId:body.storeId,audience:body.audience,discountPercent:body.discountPercent});
  }catch(error){next(error)}
});

router.put("/audience-discount-card",requireCompanyModule("INVENTORY"),async(req,res,next)=>{try{const company=companyId(req);if(!company)return res.status(403).json({error:"Δεν υπάρχει ενεργή εταιρεία."});await ensureAudienceDiscountTables();await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "AudienceDiscountCard" ("id" TEXT PRIMARY KEY,"companyId" TEXT NOT NULL,"storeId" TEXT NOT NULL,"cardHash" TEXT NOT NULL,"cardLast4" TEXT NOT NULL,"label" TEXT NOT NULL,"audience" TEXT NOT NULL,"active" BOOLEAN NOT NULL DEFAULT TRUE,"createdByUserId" TEXT,"createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),"updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),UNIQUE("companyId","storeId","cardHash"),CHECK ("audience" IN ('DOCTOR','NURSE','STAFF','CUSTOMER')))`);const body=z.object({storeId:z.string().min(1),cardCode:z.string().trim().min(3).max(120),label:z.string().trim().min(2).max(160),audience:z.enum(["DOCTOR","NURSE","STAFF","CUSTOMER"])}).parse(req.body||{}),store=await prisma.store.findFirst({where:{id:body.storeId,companyId:company},select:{id:true}});if(!store)return res.status(400).json({error:"Μη έγκυρο κατάστημα."});const normalized=normalizeAudienceCard(body.cardCode);if(normalized.length<3)return res.status(400).json({error:"Η κάρτα δεν είναι έγκυρη."});const hash=audienceCardHash(normalized),last4=normalized.slice(-4);await prisma.$executeRaw`INSERT INTO "AudienceDiscountCard" ("id","companyId","storeId","cardHash","cardLast4","label","audience","createdByUserId") VALUES (${uid()},${company},${body.storeId},${hash},${last4},${body.label},${body.audience},${req.user.id||null}) ON CONFLICT ("companyId","storeId","cardHash") DO UPDATE SET "label"=EXCLUDED."label","audience"=EXCLUDED."audience","active"=true,"createdByUserId"=EXCLUDED."createdByUserId","updatedAt"=NOW()`;res.json({ok:true,label:body.label,audience:body.audience,cardLast4:last4})}catch(error){next(error)}});

router.get("/:productId/delivery",requireCompanyModule("INVENTORY"),async(req,res,next)=>{
  try{
    const company=companyId(req);if(!company)return res.status(403).json({error:"Δεν υπάρχει ενεργή εταιρεία."});
    const rows=await prisma.$queryRaw`SELECT "id","name","isModifier","modifierGroup","isService","eDeliveryEnabled","efoodEnabled","woltEnabled","publishStock","publishPrices","efoodPrice","woltPrice" FROM "Product" WHERE "companyId"=${company} AND "id"=${req.params.productId} LIMIT 1`;
    if(!rows[0])return res.status(404).json({error:"Δεν βρέθηκε το προϊόν."});
    res.json(rows[0]);
  }catch(error){next(error)}
});

router.patch("/:productId/delivery",requireCompanyModule("INVENTORY"),async(req,res,next)=>{
  try{
    const company=companyId(req);if(!company)return res.status(403).json({error:"Δεν υπάρχει ενεργή εταιρεία."});
    const body=z.object({isModifier:z.boolean().default(false),modifierGroup:z.string().trim().max(160).nullable().optional(),isService:z.boolean().default(false),eDeliveryEnabled:z.boolean().default(false),efoodEnabled:z.boolean().default(false),woltEnabled:z.boolean().default(false),publishStock:z.boolean().default(false),publishPrices:z.boolean().default(false),efoodPrice:z.coerce.number().min(0).nullable().optional(),woltPrice:z.coerce.number().min(0).nullable().optional()}).parse(req.body||{});
    const exists=await prisma.$queryRaw`SELECT "id" FROM "Product" WHERE "companyId"=${company} AND "id"=${req.params.productId} LIMIT 1`;if(!exists[0])return res.status(404).json({error:"Δεν βρέθηκε το προϊόν."});
    await prisma.$executeRaw`UPDATE "Product" SET "isModifier"=${body.isModifier},"modifierGroup"=${body.modifierGroup||null},"isService"=${body.isService},"eDeliveryEnabled"=${body.eDeliveryEnabled},"efoodEnabled"=${body.efoodEnabled},"woltEnabled"=${body.woltEnabled},"publishStock"=${body.publishStock},"publishPrices"=${body.publishPrices},"efoodPrice"=${body.efoodPrice??null},"woltPrice"=${body.woltPrice??null},"updatedAt"=CURRENT_TIMESTAMP WHERE "companyId"=${company} AND "id"=${req.params.productId}`;
    res.json({ok:true});
  }catch(error){next(error)}
});

router.post("/:productId/stock-adjustment",requireCompanyModule("INVENTORY"),async(req,res,next)=>{
  try{
    const company=companyId(req);if(!company)return res.status(403).json({error:"Δεν υπάρχει ενεργή εταιρεία."});
    const body=z.object({storeId:z.string().min(1),mode:z.enum(["SET","ADD","SUBTRACT"]),quantity:z.coerce.number().min(0).max(100000000),logMovement:z.boolean().default(true)}).parse(req.body||{});
    const rows=await prisma.$queryRaw`SELECT sp."currentStock",p."id" AS "productId",p."name",p."costPrice" FROM "StoreProduct" sp JOIN "Product" p ON p."id"=sp."productId" JOIN "Store" s ON s."id"=sp."storeId" WHERE p."companyId"=${company} AND s."companyId"=${company} AND p."id"=${req.params.productId} AND s."id"=${body.storeId} LIMIT 1`;
    const row=rows[0];if(!row)return res.status(404).json({error:"Δεν βρέθηκε το προϊόν στο συγκεκριμένο κατάστημα."});
    const current=Number(row.currentStock||0);const next=body.mode==="SET"?body.quantity:body.mode==="ADD"?current+body.quantity:current-body.quantity;
    if(next<0)return res.status(400).json({error:"Η διόρθωση θα δημιουργούσε αρνητικό stock."});
    const delta=next-current;
    await prisma.$transaction(async tx=>{
      await tx.$executeRaw`UPDATE "StoreProduct" SET "currentStock"=${next},"updatedAt"=CURRENT_TIMESTAMP WHERE "storeId"=${body.storeId} AND "productId"=${req.params.productId}`;
      if(body.logMovement&&delta!==0)await tx.$executeRaw`INSERT INTO "StockMovement" ("id","storeId","productId","movementType","quantity","unitCost","sourceType","sourceId","note","createdByUserId") VALUES (${uid()},${body.storeId},${req.params.productId},'MANUAL_ADJUSTMENT',${delta},${Number(row.costPrice||0)},'PRODUCT_CARD',${req.params.productId},${body.mode==="SET"?'Χειροκίνητη ακριβής διόρθωση stock':body.mode==="ADD"?'Χειροκίνητη αύξηση stock':'Χειροκίνητη μείωση stock'},${req.user.id})`;
    });
    res.json({ok:true,previousStock:current,currentStock:next,delta});
  }catch(error){next(error)}
});

router.post("/:productId/destruction",requireCompanyModule("INVENTORY"),async(req,res,next)=>{
  try{
    const company=companyId(req);if(!company)return res.status(403).json({error:"Δεν υπάρχει ενεργή εταιρεία."});
    const body=z.object({storeId:z.string().min(1),quantity:z.coerce.number().positive().max(100000000),reason:z.string().trim().max(300).optional().default("Καταστροφή / φύρα")}).parse(req.body||{});
    const rows=await prisma.$queryRaw`SELECT sp."currentStock",p."costPrice",p."name" FROM "StoreProduct" sp JOIN "Product" p ON p."id"=sp."productId" JOIN "Store" s ON s."id"=sp."storeId" WHERE p."companyId"=${company} AND s."companyId"=${company} AND p."id"=${req.params.productId} AND s."id"=${body.storeId} LIMIT 1`;
    const row=rows[0];if(!row)return res.status(404).json({error:"Δεν βρέθηκε το προϊόν στο συγκεκριμένο κατάστημα."});
    const current=Number(row.currentStock||0);if(current<0||body.quantity>current)return res.status(400).json({error:"Η καταστροφή δεν μπορεί να ξεπερνά το διαθέσιμο stock."});
    const nextStock=current-body.quantity;
    await prisma.$transaction(async tx=>{
      await tx.$executeRaw`UPDATE "StoreProduct" SET "currentStock"=${nextStock},"updatedAt"=CURRENT_TIMESTAMP WHERE "storeId"=${body.storeId} AND "productId"=${req.params.productId}`;
      await tx.$executeRaw`INSERT INTO "StockMovement" ("id","storeId","productId","movementType","quantity","unitCost","sourceType","sourceId","note","createdByUserId") VALUES (${uid()},${body.storeId},${req.params.productId},'WASTE',${-body.quantity},${Number(row.costPrice||0)},'PRODUCT_CARD',${req.params.productId},${body.reason},${req.user.id})`;
    });
    res.json({ok:true,previousStock:current,currentStock:nextStock,destroyed:body.quantity});
  }catch(error){next(error)}
});

router.get("/:productId/movements",requireCompanyModule("INVENTORY"),async(req,res,next)=>{
  try{
    const company=companyId(req);if(!company)return res.status(403).json({error:"Δεν υπάρχει ενεργή εταιρεία."});
    const q=z.object({storeId:z.string().min(1),from:z.string().optional(),to:z.string().optional()}).parse(req.query||{});
    const productRows=await prisma.$queryRaw`SELECT p."id",p."name",p."salePrice",p."costPrice",sp."currentStock" FROM "Product" p JOIN "StoreProduct" sp ON sp."productId"=p."id" JOIN "Store" s ON s."id"=sp."storeId" WHERE p."companyId"=${company} AND s."companyId"=${company} AND p."id"=${req.params.productId} AND sp."storeId"=${q.storeId} LIMIT 1`;
    const product=productRows[0];if(!product)return res.status(404).json({error:"Δεν βρέθηκε το προϊόν στο συγκεκριμένο κατάστημα."});
    const from=q.from?new Date(`${q.from}T00:00:00`):new Date(Date.now()-30*86400000),to=q.to?new Date(`${q.to}T23:59:59.999`):new Date();
    if(!Number.isFinite(from.getTime())||!Number.isFinite(to.getTime())||from>to)return res.status(400).json({error:"Μη έγκυρο διάστημα ημερομηνιών."});
    const rows=await prisma.$queryRaw`SELECT m."id",m."movementType",m."quantity",m."unitCost",m."sourceType",m."sourceId",m."note",m."createdAt",u."fullName" AS "actorName" FROM "StockMovement" m JOIN "Store" s ON s."id"=m."storeId" LEFT JOIN "User" u ON u."id"=m."createdByUserId" WHERE s."companyId"=${company} AND m."storeId"=${q.storeId} AND m."productId"=${req.params.productId} AND m."createdAt">=${from} AND m."createdAt"<=${to} ORDER BY m."createdAt" DESC LIMIT 1000`;
    let running=Number(product.currentStock||0);const movements=rows.map(row=>{const quantity=Number(row.quantity||0),stockAfter=running;running-=quantity;return {...row,quantity,unitCost:Number(row.unitCost||0),inQty:quantity>0?quantity:0,outQty:quantity<0?Math.abs(quantity):0,stockAfter}});
    res.json({product:{id:product.id,name:product.name,currentStock:Number(product.currentStock||0),salePrice:Number(product.salePrice||0),costPrice:Number(product.costPrice||0)},from,to,movements});
  }catch(error){next(error)}
});

router.get("/:productId/purchases",requireCompanyModule("INVENTORY"),async(req,res,next)=>{
  try{
    const company=companyId(req);if(!company)return res.status(403).json({error:"Δεν υπάρχει ενεργή εταιρεία."});
    const q=z.object({storeId:z.string().min(1),from:z.string().optional(),to:z.string().optional()}).parse(req.query||{});
    const exists=await prisma.$queryRaw`SELECT p."id",p."name" FROM "Product" p JOIN "StoreProduct" sp ON sp."productId"=p."id" JOIN "Store" s ON s."id"=sp."storeId" WHERE p."companyId"=${company} AND s."companyId"=${company} AND p."id"=${req.params.productId} AND sp."storeId"=${q.storeId} LIMIT 1`;if(!exists[0])return res.status(404).json({error:"Δεν βρέθηκε το προϊόν στο συγκεκριμένο κατάστημα."});
    const from=q.from?new Date(`${q.from}T00:00:00`):new Date(Date.now()-365*86400000),to=q.to?new Date(`${q.to}T23:59:59.999`):new Date();if(!Number.isFinite(from.getTime())||!Number.isFinite(to.getTime())||from>to)return res.status(400).json({error:"Μη έγκυρο διάστημα ημερομηνιών."});
    const rows=await prisma.$queryRaw`SELECT l."id",o."id" AS "orderId",o."status",o."invoiceNumber",o."createdAt",o."invoicedAt",COALESCE(sup."name",'Χωρίς προμηθευτή') AS "supplierName",l."quantity",l."unitCost",l."initialUnitCost",l."discount1",l."discount2",l."discount3",l."exciseTotal",l."vatRate",l."netAmount",l."vatAmount",l."grossAmount" FROM "PurchaseOrderLine" l JOIN "PurchaseOrder" o ON o."id"=l."orderId" LEFT JOIN "Supplier" sup ON sup."id"=o."supplierId" WHERE o."companyId"=${company} AND o."storeId"=${q.storeId} AND l."productId"=${req.params.productId} AND o."createdAt">=${from} AND o."createdAt"<=${to} ORDER BY o."createdAt" DESC LIMIT 1000`;
    res.json({product:exists[0],from,to,purchases:rows.map(r=>({...r,quantity:Number(r.quantity||0),unitCost:Number(r.unitCost||0),initialUnitCost:Number(r.initialUnitCost||0),discount1:Number(r.discount1||0),discount2:Number(r.discount2||0),discount3:Number(r.discount3||0),exciseTotal:Number(r.exciseTotal||0),vatRate:Number(r.vatRate||0),netAmount:Number(r.netAmount||0),vatAmount:Number(r.vatAmount||0),grossAmount:Number(r.grossAmount||0)}))});
  }catch(error){next(error)}
});

export default router;
