import {Router} from "express";
import crypto from "crypto";
import {prisma} from "../prisma.js";

const router=Router();
const money=value=>Number(value||0);
const uid=()=>crypto.randomUUID();

function assertStore(req,storeId){
  if(req.user?.tokenType==="STORE_OPERATOR"&&req.user.storeId!==storeId){
    const error=new Error("Η πρόσβαση ισχύει μόνο για το δικό σου κατάστημα.");
    error.status=403;
    throw error;
  }
}

async function ownedStore(req,storeId){
  assertStore(req,storeId);
  const store=await prisma.store.findFirst({where:{id:storeId,companyId:req.user.companyId,active:true},select:{id:true,name:true}});
  if(!store){const error=new Error("Δεν βρέθηκε ενεργό κατάστημα.");error.status=404;throw error}
  return store;
}

async function canOnlineCreate(req,storeId){
  if(req.user?.tokenType!=="STORE_OPERATOR")return true;
  const rows=await prisma.$queryRaw`
    SELECT COALESCE(p."permissions",'{}'::jsonb) AS "permissions",COALESCE(p."posAccess",TRUE) AS "posAccess"
    FROM "StoreOperatorCredential" c
    LEFT JOIN "StoreOperatorProfile" p ON p."storeId"=c."storeId" AND p."employeeId"=c."employeeId"
    WHERE c."id"=${req.user.operatorId||req.user.id} AND c."storeId"=${storeId} AND c."companyId"=${req.user.companyId} AND c."active"=TRUE LIMIT 1`;
  const row=rows[0];if(!row||row.posAccess===false)return false;
  const permissions=row.permissions&&typeof row.permissions==="object"?row.permissions:{};
  return Boolean(permissions.onlineBarcode);
}

async function nextSku(companyId,tx=prisma){
  const rows=await tx.$queryRaw`SELECT COALESCE(MAX(CASE WHEN "sku" ~ '^[0-9]+$' THEN "sku"::bigint END),10000)+1 AS next FROM "Product" WHERE "companyId"=${companyId}`;
  return String(rows[0]?.next||10001);
}

async function ensureCategorySchema(){
  await prisma.$executeRawUnsafe(`ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "subcategoryId" TEXT`);
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "ProductSubcategory" ("id" TEXT NOT NULL PRIMARY KEY,"companyId" TEXT NOT NULL,"categoryId" TEXT NOT NULL,"legacyCode" TEXT,"name" TEXT NOT NULL,"property" TEXT NOT NULL DEFAULT 'STOCK_ITEM',"points" DECIMAL(14,4) NOT NULL DEFAULT 0,"pluGroup" INTEGER NOT NULL DEFAULT 0,"classification" TEXT NOT NULL DEFAULT 'MERCHANDISE',"eshopCode" TEXT,"active" BOOLEAN NOT NULL DEFAULT true,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP)`);
}

const methodLabel=method=>method==="CASH"?"ΜΕΤΡΗΤΑ":method==="CARD"?"ΚΑΡΤΑ":method==="IRIS"?"IRIS":String(method||"ΠΛΗΡΩΜΗ");
const euroPlain=value=>`${Number(value||0).toFixed(2).replace(".",",")} €`;

function normalizeSale(row){
  const payments=(row.payments||[]).map(payment=>({...payment,amount:money(payment.amount)}));
  const lines=(row.lines||[]).map(line=>({...line,quantity:money(line.quantity),unitPrice:money(line.unitPrice),lineTotal:money(line.lineTotal)}));
  const paymentSummary=payments.length>1
    ?`ΜΙΚΤΗ · ${payments.map(payment=>`${methodLabel(payment.method)} ${euroPlain(payment.amount)}`).join(" + ")}`
    :(payments[0]?`${methodLabel(payments[0].method)} ${euroPlain(payments[0].amount)}`:"ΧΩΡΙΣ ΠΛΗΡΩΜΗ");
  const productSummary=lines.length?lines.map(line=>`${Math.abs(Number(line.quantity||0))}× ${line.description}`).join(" · "):"Χωρίς προϊόντα";
  const movementType=row.source==="POS_REVERSAL"?(row.reversalKind==="RETURN"?"RETURN":"CANCEL"):row.source==="EXCHANGE"?"EXCHANGE":row.source==="WASTE"?"WASTE":"SALE";
  return {...row,total:money(row.total),subtotal:money(row.subtotal),discount:money(row.discount),payments,lines,paymentSummary,paymentMethod:`${productSummary} · ${paymentSummary}`,productSummary,movementType};
}

router.get("/stores/:storeId/online-product-options",async(req,res,next)=>{
  try{
    const store=await ownedStore(req,req.params.storeId);
    if(!await canOnlineCreate(req,store.id))return res.status(403).json({error:"Δεν έχεις δικαίωμα «Online αναζήτηση barcode (PoS)» από το BackOffice."});
    await ensureCategorySchema();
    const categories=await prisma.$queryRaw`SELECT "id","name" FROM "ProductCategory" WHERE "companyId"=${req.user.companyId} AND "active"=true ORDER BY "name"`;
    const subcategories=await prisma.$queryRaw`SELECT "id","categoryId","name" FROM "ProductSubcategory" WHERE "companyId"=${req.user.companyId} AND "active"=true ORDER BY "name"`;
    res.json({categories,subcategories});
  }catch(error){next(error)}
});

router.post("/stores/:storeId/online-product-create",async(req,res,next)=>{
  try{
    const store=await ownedStore(req,req.params.storeId);
    if(!await canOnlineCreate(req,store.id))return res.status(403).json({error:"Δεν έχεις δικαίωμα «Online αναζήτηση barcode (PoS)» από το BackOffice."});
    await ensureCategorySchema();
    const body=req.body&&typeof req.body==="object"?req.body:{};
    const barcode=String(body.barcode||"").trim(),name=String(body.name||"").trim().replace(/\s+/g," "),categoryId=String(body.categoryId||"").trim()||null,subcategoryId=String(body.subcategoryId||"").trim()||null;
    const salePrice=Number(body.salePrice||0),costPrice=Number(body.costPrice||0),vatRate=Number(body.vatRate),openingStock=Number(body.openingStock||0),unit=["PIECE","KG","LITER","PACKAGE"].includes(body.unit)?body.unit:"PIECE";
    if(!/^\d{6,18}$/.test(barcode))return res.status(400).json({error:"Βάλε έγκυρο barcode."});
    if(name.length<2||name.length>250)return res.status(400).json({error:"Βάλε έγκυρη περιγραφή είδους."});
    if(!categoryId)return res.status(400).json({error:"Επίλεξε κατηγορία."});
    if(!Number.isFinite(vatRate)||vatRate<0||vatRate>100)return res.status(400).json({error:"Επίλεξε σωστό ΦΠΑ."});
    if(!Number.isFinite(salePrice)||salePrice<=0)return res.status(400).json({error:"Η λιανική τιμή πρέπει να είναι μεγαλύτερη από 0 €."});
    if(!Number.isFinite(costPrice)||costPrice<0||!Number.isFinite(openingStock)||openingStock<0)return res.status(400).json({error:"Έλεγξε τιμή αγοράς και αρχικό stock."});
    const category=(await prisma.$queryRaw`SELECT "id","name" FROM "ProductCategory" WHERE "id"=${categoryId} AND "companyId"=${req.user.companyId} AND "active"=true LIMIT 1`)[0];
    if(!category)return res.status(400).json({error:"Η κατηγορία δεν είναι έγκυρη."});
    let subcategory=null;
    if(subcategoryId){subcategory=(await prisma.$queryRaw`SELECT "id","name" FROM "ProductSubcategory" WHERE "id"=${subcategoryId} AND "categoryId"=${categoryId} AND "companyId"=${req.user.companyId} AND "active"=true LIMIT 1`)[0];if(!subcategory)return res.status(400).json({error:"Η υποκατηγορία δεν ανήκει στην επιλεγμένη κατηγορία."})}
    const duplicate=await prisma.$queryRaw`SELECT p."id",p."name" FROM "ProductBarcode" pb JOIN "Product" p ON p."id"=pb."productId" WHERE p."companyId"=${req.user.companyId} AND pb."barcode"=${barcode} LIMIT 1`;
    if(duplicate[0])return res.status(409).json({error:`Το barcode υπάρχει ήδη στο «${duplicate[0].name}».`});
    const productId=uid();let sku="";
    await prisma.$transaction(async tx=>{
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${req.user.companyId+":product-sku"}))`;
      sku=await nextSku(req.user.companyId,tx);
      await tx.$executeRaw`INSERT INTO "Product" ("id","companyId","categoryId","subcategoryId","sku","name","unit","vatRate","vatVerified","salePrice","costPrice","trackStock","active") VALUES (${productId},${req.user.companyId},${categoryId},${subcategoryId},${sku},${name},${unit},${vatRate},true,${salePrice},${costPrice},true,true)`;
      await tx.$executeRaw`INSERT INTO "ProductBarcode" ("id","productId","barcode","unitMultiplier") VALUES (${uid()},${productId},${barcode},1)`;
      await tx.$executeRaw`INSERT INTO "StoreProduct" ("id","storeId","productId","salePrice","currentStock","active") VALUES (${uid()},${store.id},${productId},${salePrice},${openingStock},true)`;
      if(openingStock>0)await tx.$executeRaw`INSERT INTO "StockMovement" ("id","storeId","productId","movementType","quantity","unitCost","sourceType","sourceId","note","createdByUserId") VALUES (${uid()},${store.id},${productId},'MANUAL_ADJUSTMENT',${openingStock},${costPrice},'POS_ONLINE_NEW_PRODUCT',${productId},'Αρχικό stock από νέο είδος μέσω Online αναζήτησης POS',${req.user.id})`;
      await tx.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "StoreOperatorAudit" ("id" TEXT PRIMARY KEY,"companyId" TEXT NOT NULL,"storeId" TEXT NOT NULL,"operatorId" TEXT,"actorId" TEXT NOT NULL,"eventType" TEXT NOT NULL,"details" JSONB NOT NULL DEFAULT '{}'::jsonb,"createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
      await tx.$executeRaw`INSERT INTO "StoreOperatorAudit" ("id","companyId","storeId","operatorId","actorId","eventType","details") VALUES (${uid()},${req.user.companyId},${store.id},${req.user.operatorId||req.user.id},${req.user.id},'POS_ONLINE_PRODUCT_CREATE',${JSON.stringify({productId,sku,barcode,name,categoryId,subcategoryId,salePrice,costPrice,vatRate,openingStock,inventoryLinked:true})}::jsonb)`;
    });
    res.status(201).json({ok:true,id:productId,sku,barcode,name,salePrice,costPrice,currentStock:openingStock,vatRate,categoryId,categoryName:category.name,subcategoryId,subcategoryName:subcategory?.name||null,unit,inventoryLinked:true});
  }catch(error){next(error)}
});

router.get("/stores/:storeId/sales/recent",async(req,res,next)=>{
  try{
    const store=await ownedStore(req,req.params.storeId);
    const rows=await prisma.$queryRaw`
      SELECT s."id",s."receiptNumber",s."total",s."subtotal",s."discount",s."occurredAt",s."createdAt",
             s."transactionMode",s."delayedReason",s."reversalState",s."reversalKind",s."originalSaleId",s."fiscalStatus",s."source",c."name" AS "customerName",
             COALESCE((SELECT st."sessionId" FROM "StoreTransaction" st WHERE st."companyId"=s."companyId" AND st."storeId"=s."storeId" AND COALESCE(st."description",'') LIKE ('%'||s."id"||'%') ORDER BY st."occurredAt" ASC LIMIT 1),NULL) AS "sessionId",
             COALESCE((SELECT st."actorName" FROM "StoreTransaction" st WHERE st."companyId"=s."companyId" AND st."storeId"=s."storeId" AND COALESCE(st."description",'') LIKE ('%'||s."id"||'%') ORDER BY st."occurredAt" ASC LIMIT 1),'Πωλητής') AS "actorName",
             COALESCE((SELECT json_agg(json_build_object('method',p."method",'amount',p."amount") ORDER BY p."createdAt",p."id") FROM "Payment" p WHERE p."saleId"=s."id"),'[]'::json) AS "payments",
             COALESCE((SELECT json_agg(json_build_object('id',l."id",'productId',l."productId",'description',l."description",'quantity',l."quantity",'unitPrice',l."unitPrice",'lineTotal',l."lineTotal") ORDER BY l."createdAt",l."id") FROM "SaleLine" l WHERE l."saleId"=s."id"),'[]'::json) AS "lines"
      FROM "Sale" s
      LEFT JOIN "Customer" c ON c."id"=s."customerId" AND c."companyId"=s."companyId"
      WHERE s."companyId"=${req.user.companyId} AND s."storeId"=${store.id}
        AND s."source" IN ('POS','EXCHANGE','POS_REVERSAL','WASTE') AND s."status"='COMPLETED'
      ORDER BY s."createdAt" DESC LIMIT 50`;
    res.json({store,rows:rows.map(normalizeSale)});
  }catch(error){next(error)}
});

router.get("/sales/journal",async(req,res,next)=>{
  try{
    const storeId=req.query.storeId?String(req.query.storeId):null;
    if(req.user?.tokenType==="STORE_OPERATOR"){
      if(storeId&&req.user.storeId!==storeId)return res.status(403).json({error:"Η πρόσβαση ισχύει μόνο για το δικό σου κατάστημα."});
    }
    if(storeId){const store=await prisma.store.findFirst({where:{id:storeId,companyId:req.user.companyId,active:true},select:{id:true}});if(!store)return res.status(404).json({error:"Δεν βρέθηκε ενεργό κατάστημα."})}
    const to=req.query.to?new Date(String(req.query.to)):new Date();
    const from=req.query.from?new Date(String(req.query.from)):new Date(to.getTime()-30*86400000);
    if(!Number.isFinite(from.getTime())||!Number.isFinite(to.getTime())||from>to)return res.status(400).json({error:"Μη έγκυρο διάστημα ημερομηνιών."});
    const operatorStoreId=req.user?.tokenType==="STORE_OPERATOR"?req.user.storeId:null;
    const rows=await prisma.$queryRaw`
      SELECT s."id",s."receiptNumber",s."total",s."subtotal",s."discount",s."occurredAt",s."createdAt",s."status",
             s."transactionMode",s."delayedReason",s."reversalState",s."reversalKind",s."originalSaleId",s."fiscalStatus",s."source",st."name" AS "storeName",c."name" AS "customerName",
             COALESCE((SELECT tx."actorName" FROM "StoreTransaction" tx WHERE tx."companyId"=s."companyId" AND tx."storeId"=s."storeId" AND COALESCE(tx."description",'') LIKE ('%'||s."id"||'%') ORDER BY tx."occurredAt" ASC LIMIT 1),'Πωλητής') AS "actorName",
             COALESCE((SELECT json_agg(json_build_object('method',p."method",'amount',p."amount") ORDER BY p."createdAt",p."id") FROM "Payment" p WHERE p."saleId"=s."id"),'[]'::json) AS "payments",
             COALESCE((SELECT json_agg(json_build_object('id',l."id",'productId',l."productId",'description',l."description",'quantity',l."quantity",'unitPrice',l."unitPrice",'lineTotal',l."lineTotal") ORDER BY l."createdAt",l."id") FROM "SaleLine" l WHERE l."saleId"=s."id"),'[]'::json) AS "lines"
      FROM "Sale" s
      JOIN "Store" st ON st."id"=s."storeId" AND st."companyId"=s."companyId"
      LEFT JOIN "Customer" c ON c."id"=s."customerId" AND c."companyId"=s."companyId"
      WHERE s."companyId"=${req.user.companyId}
        AND (${storeId}::text IS NULL OR s."storeId"=${storeId})
        AND (${operatorStoreId}::text IS NULL OR s."storeId"=${operatorStoreId})
        AND s."occurredAt">=${from} AND s."occurredAt"<=${to}
        AND s."source" IN ('POS','EXCHANGE','POS_REVERSAL')
      ORDER BY s."occurredAt" DESC LIMIT 500`;
    res.json({from,to,rows:rows.map(normalizeSale)});
  }catch(error){next(error)}
});

export default router;
