import crypto from "crypto";
import {Router} from "express";
import {z} from "zod";
import {prisma} from "../prisma.js";
import {advancedOnlineSearchEntitlement,advancedProviderConfigured} from "../advanced-online-product-search.js";

const router=Router();
const roles=new Set(["SUPER_ADMIN","OWNER","ADMIN","MANAGER"]);
const id=()=>crypto.randomUUID();
const normCode=value=>String(value||"").trim().toLocaleUpperCase("el-GR").replace(/\s+/g,"");
const isPlatformSuper=req=>req.user?.isSuperAdmin===true||req.user?.platformRole==="SUPER_ADMIN"||req.user?.role==="SUPER_ADMIN";

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
  await prisma.$executeRawUnsafe(`ALTER TABLE "PurchaseOrderLine" ADD COLUMN IF NOT EXISTS "invoiceUnit" TEXT`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "PurchaseOrderLine" ADD COLUMN IF NOT EXISTS "stockUnitsPerInvoiceUnit" NUMERIC(14,4)`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "subcategoryId" TEXT`);
}
router.use(async(req,res,next)=>{try{await ensureSchema();next()}catch(error){next(error)}});

async function ownedOrder(companyId,orderId){
  const rows=await prisma.$queryRaw`SELECT "id","storeId","supplierId","status","sourceType" FROM "PurchaseOrder" WHERE "id"=${orderId} AND "companyId"=${companyId} LIMIT 1`;
  return rows[0]||null;
}
async function ownedLine(companyId,orderId,lineId){
  const rows=await prisma.$queryRaw`
    SELECT l.*,o."storeId",o."supplierId",o."status",o."sourceType"
    FROM "PurchaseOrderLine" l JOIN "PurchaseOrder" o ON o."id"=l."orderId"
    WHERE l."id"=${lineId} AND l."orderId"=${orderId} AND o."companyId"=${companyId} LIMIT 1`;
  return rows[0]||null;
}

async function learnSupplierMapping(tx,{companyId,supplierId,supplierCode,productId,barcode,description,userId,unitCost,unitsPerPackage}){
  const code=String(supplierCode||"").trim();
  if(!supplierId||!code||!productId)return;
  await tx.$executeRaw`
    INSERT INTO "SupplierProductMapping" (
      "id","companyId","supplierId","supplierItemCode","productId","supplierBarcode","lastDescription","unitsPerPackage","lastUnitCost","usageCount","confirmedByUserId","confirmedAt","lastSeenAt","createdAt","updatedAt"
    ) VALUES (
      ${id()},${companyId},${supplierId},${code},${productId},${barcode||null},${description||null},${Number(unitsPerPackage||0)>1?Number(unitsPerPackage):null},${Number(unitCost||0)},1,${userId||null},NOW(),NOW(),NOW(),NOW()
    )
    ON CONFLICT ("companyId","supplierId","supplierItemCode") DO UPDATE SET
      "productId"=EXCLUDED."productId",
      "supplierBarcode"=COALESCE(EXCLUDED."supplierBarcode","SupplierProductMapping"."supplierBarcode"),
      "lastDescription"=COALESCE(EXCLUDED."lastDescription","SupplierProductMapping"."lastDescription"),
      "unitsPerPackage"=COALESCE(EXCLUDED."unitsPerPackage","SupplierProductMapping"."unitsPerPackage"),
      "lastUnitCost"=EXCLUDED."lastUnitCost",
      "usageCount"="SupplierProductMapping"."usageCount"+1,
      "confirmedByUserId"=EXCLUDED."confirmedByUserId",
      "confirmedAt"=NOW(),"lastSeenAt"=NOW(),"updatedAt"=NOW()`;
}

async function autoResolveExact(companyId,order,userId){
  if(!order||order.status!=="NEW")return 0;
  const unresolved=await prisma.$queryRaw`
    SELECT "id","supplierCode","detectedBarcode","description","unitCost"
    FROM "PurchaseOrderLine"
    WHERE "orderId"=${order.id} AND "productId" IS NULL AND COALESCE("resolutionStatus",'MATCHED')='UNRESOLVED'
    ORDER BY "createdAt","id"`;
  let resolved=0;
  for(const line of unresolved){
    const code=normCode(line.supplierCode);
    const barcode=String(line.detectedBarcode||"").trim();
    let productId=null;
    if(order.supplierId&&code){
      const mapped=await prisma.$queryRaw`
        SELECT m."productId" FROM "SupplierProductMapping" m
        JOIN "Product" p ON p."id"=m."productId" AND p."companyId"=${companyId} AND p."active"=true
        WHERE m."companyId"=${companyId} AND m."supplierId"=${order.supplierId}
          AND UPPER(REGEXP_REPLACE(TRIM(m."supplierItemCode"),'\\s+','','g'))=${code} LIMIT 1`;
      productId=mapped[0]?.productId||null;
    }
    if(!productId&&code){
      const exactSku=await prisma.$queryRaw`SELECT p."id" FROM "Product" p WHERE p."companyId"=${companyId} AND p."active"=true AND UPPER(REGEXP_REPLACE(TRIM(p."sku"),'\\s+','','g'))=${code} LIMIT 2`;
      if(exactSku.length===1)productId=exactSku[0].id;
    }
    if(!productId&&barcode){
      const exactBarcode=await prisma.$queryRaw`SELECT DISTINCT p."id" FROM "ProductBarcode" b JOIN "Product" p ON p."id"=b."productId" WHERE p."companyId"=${companyId} AND p."active"=true AND b."barcode"=${barcode} LIMIT 2`;
      if(exactBarcode.length===1)productId=exactBarcode[0].id;
    }
    if(!productId)continue;
    await prisma.$transaction(async tx=>{
      await tx.$executeRaw`UPDATE "PurchaseOrderLine" SET "productId"=${productId},"resolutionStatus"='MATCHED',"updatedAt"=NOW() WHERE "id"=${line.id} AND "orderId"=${order.id} AND "productId" IS NULL`;
      await learnSupplierMapping(tx,{companyId,supplierId:order.supplierId,supplierCode:line.supplierCode,productId,barcode,description:line.description,userId,unitCost:line.unitCost});
    });
    resolved++;
  }
  return resolved;
}

function validGtin(value){
  const s=String(value||"").replace(/\D/g,"");if(![8,12,13,14].includes(s.length))return false;
  let sum=0;for(let i=s.length-2,pos=0;i>=0;i--,pos++)sum+=Number(s[i])*(pos%2===0?3:1);
  return (10-(sum%10))%10===Number(s[s.length-1]);
}
function extractBarcodes(text){
  const seen=new Set(),out=[];for(const m of String(text||"").matchAll(/(?<!\d)(\d{8}|\d{12,14})(?!\d)/g)){const code=m[1];if(validGtin(code)&&!seen.has(code)){seen.add(code);out.push(code)}}return out.slice(0,8);
}
async function canAdvanced(req){return isPlatformSuper(req)||await advancedOnlineSearchEntitlement(req.user.companyId)}
async function googleDescriptionSearch(req,q){
  if(!await canAdvanced(req))return {enabled:false,reason:"MODULE_DISABLED",rows:[]};
  if(!advancedProviderConfigured())return {enabled:true,reason:"PROVIDER_NOT_CONFIGURED",rows:[]};
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),5500);try{
    const serperKey=String(process.env.SERPER_API_KEY||"").trim();let items=[],provider="";
    if(serperKey){const r=await fetch("https://google.serper.dev/search",{method:"POST",headers:{"X-API-KEY":serperKey,"Content-Type":"application/json"},body:JSON.stringify({q:`${q} barcode EAN`,gl:"gr",hl:"el",num:10}),signal:controller.signal});if(!r.ok)throw new Error(`SERPER_${r.status}`);const d=await r.json();items=d.organic||[];provider="SERPER_GOOGLE"}
    else{const key=String(process.env.GOOGLE_CSE_API_KEY||"").trim(),cx=String(process.env.GOOGLE_CSE_CX||"").trim();const url=new URL("https://www.googleapis.com/customsearch/v1");url.searchParams.set("key",key);url.searchParams.set("cx",cx);url.searchParams.set("q",`${q} barcode EAN`);url.searchParams.set("gl","gr");url.searchParams.set("hl","el");url.searchParams.set("num","10");const r=await fetch(url,{signal:controller.signal});if(!r.ok)throw new Error(`GOOGLE_CSE_${r.status}`);const d=await r.json();items=d.items||[];provider="GOOGLE_CSE"}
    const rows=[];for(const item of items){const barcodes=extractBarcodes(`${item.title||""} ${item.snippet||""} ${item.link||""}`);if(!barcodes.length)continue;rows.push({name:String(item.title||q).replace(/\s+[|\-–—]\s+[^|\-–—]{2,60}$/u,"").trim().slice(0,240),barcodes,source:"GOOGLE_SEARCH",provider,sourceUrl:item.link||null,snippet:String(item.snippet||"").slice(0,500)});if(rows.length>=6)break}
    await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "AdvancedOnlineSearchUsage" ("id" TEXT PRIMARY KEY,"companyId" TEXT NOT NULL,"storeId" TEXT NOT NULL,"actorId" TEXT,"query" TEXT NOT NULL,"provider" TEXT NOT NULL,"status" TEXT NOT NULL,"resultCount" INTEGER NOT NULL DEFAULT 0,"durationMs" INTEGER NOT NULL DEFAULT 0,"estimatedCostUsd" NUMERIC(12,6) NOT NULL DEFAULT 0,"details" JSONB NOT NULL DEFAULT '{}'::jsonb,"createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW())`).catch(()=>{});
    await prisma.$executeRaw`INSERT INTO "AdvancedOnlineSearchUsage" ("id","companyId","storeId","actorId","query","provider","status","resultCount","details") VALUES (${id()},${req.user.companyId},'INVOICE',${req.user.id||null},${q},${provider},${rows.length?'FOUND':'NOT_FOUND'},${rows.length},${JSON.stringify({usageContext:'INVOICE_DESCRIPTION_TO_BARCODE',bypassEntitlement:isPlatformSuper(req)})}::jsonb)`.catch(()=>{});
    return {enabled:true,reason:rows.length?"FOUND":"NOT_FOUND",provider,rows};
  }catch(error){return {enabled:true,reason:error?.name==="AbortError"?"TIMEOUT":"PROVIDER_ERROR",rows:[]}}finally{clearTimeout(timer)}
}

router.get("/:orderId/ocr-lines",async(req,res,next)=>{
  try{
    const order=await ownedOrder(req.user.companyId,req.params.orderId);if(!order)return res.status(404).json({error:"Δεν βρέθηκε η παραγγελία."});
    await autoResolveExact(req.user.companyId,order,req.user.id);
    const rows=await prisma.$queryRaw`
      SELECT l."id",l."productId",l."supplierCode",l."description",l."quantity",l."unitCost",l."discount1",l."discount2",l."discount3",l."exciseTotal",l."vatRate",l."netAmount",l."vatAmount",l."grossAmount",l."invoiceUnit",l."stockUnitsPerInvoiceUnit",l."ocrRawText",l."ocrConfidence",l."resolutionStatus",l."detectedBarcode",l."ocrLineIndex",p."name" AS "productName",p."sku",p."salePrice",p."costPrice",COALESCE((SELECT json_agg(pb."barcode" ORDER BY pb."barcode") FROM "ProductBarcode" pb WHERE pb."productId"=p."id"),'[]') AS "barcodes" FROM "PurchaseOrderLine" l LEFT JOIN "Product" p ON p."id"=l."productId" AND p."companyId"=${req.user.companyId} WHERE l."orderId"=${order.id} ORDER BY COALESCE(l."ocrLineIndex",2147483647),l."createdAt",l."id"`;
    const mapped=rows.map((r,index)=>{const quantity=Number(r.quantity||0),unitCost=Number(r.unitCost||0),grossAmount=Number(r.grossAmount||0);const economicProduct=Boolean(String(r.description||r.ocrRawText||"").trim())&&quantity>0&&(unitCost>0||grossAmount>0);return {...r,quantity,unitCost,discount1:Number(r.discount1||0),discount2:Number(r.discount2||0),discount3:Number(r.discount3||0),exciseTotal:Number(r.exciseTotal||0),vatRate:Number(r.vatRate||0),netAmount:Number(r.netAmount||0),vatAmount:Number(r.vatAmount||0),grossAmount,ocrConfidence:Number(r.ocrConfidence||0),ocrSequence:Number(r.ocrLineIndex||index+1),ocrLineType:economicProduct?"PRODUCT":"INFO"}});
    res.json({order,rows:mapped,unresolved:mapped.filter(r=>r.ocrLineType==="PRODUCT"&&r.resolutionStatus==='UNRESOLVED').length});
  }catch(error){next(error)}
});

router.get("/:orderId/ocr-lines/:lineId/options",async(req,res,next)=>{try{
  const line=await ownedLine(req.user.companyId,req.params.orderId,req.params.lineId);if(!line)return res.status(404).json({error:"Δεν βρέθηκε η γραμμή."});
  const [categories,subcategories]=await Promise.all([prisma.$queryRaw`SELECT "id","name" FROM "ProductCategory" WHERE "companyId"=${req.user.companyId} AND "active"=true ORDER BY "name"`,prisma.$queryRaw`SELECT "id","categoryId","name" FROM "ProductSubcategory" WHERE "companyId"=${req.user.companyId} AND "active"=true ORDER BY "name"`]);
  res.json({categories,subcategories});
}catch(error){next(error)}});

router.get("/:orderId/ocr-lines/:lineId/search",async(req,res,next)=>{
  try{
    const order=await ownedOrder(req.user.companyId,req.params.orderId);if(!order)return res.status(404).json({error:"Δεν βρέθηκε η παραγγελία."});
    const q=String(req.query.q||"").trim();if(q.length<2)return res.status(400).json({error:"Γράψε τουλάχιστον 2 χαρακτήρες ή barcode."});const like=`%${q}%`;
    const local=await prisma.$queryRaw`SELECT p."id",p."name",p."sku",p."vatRate",p."salePrice",p."costPrice",'LOCAL' AS "source",COALESCE((SELECT json_agg(pb."barcode" ORDER BY pb."barcode") FROM "ProductBarcode" pb WHERE pb."productId"=p."id"),'[]') AS "barcodes" FROM "Product" p WHERE p."companyId"=${req.user.companyId} AND p."active"=true AND (p."name" ILIKE ${like} OR p."sku" ILIKE ${like} OR EXISTS(SELECT 1 FROM "ProductBarcode" pb WHERE pb."productId"=p."id" AND pb."barcode" ILIKE ${like})) ORDER BY CASE WHEN p."sku"=${q} OR EXISTS(SELECT 1 FROM "ProductBarcode" pb WHERE pb."productId"=p."id" AND pb."barcode"=${q}) THEN 0 ELSE 1 END,p."name" LIMIT 30`;
    const master=await prisma.$queryRaw`SELECT mp."id",mp."name",mp."sourceCode" AS "sku",mp."vatRate",COALESCE(mp."defaultRetailPrice",0) AS "salePrice",COALESCE(mp."defaultCostPrice",0) AS "costPrice",mp."categoryName",mp."subcategoryName",'MASTER_CATALOG' AS "source",COALESCE((SELECT json_agg(mb."barcode" ORDER BY mb."barcode") FROM "MasterProductBarcode" mb WHERE mb."masterProductId"=mp."id"),'[]') AS "barcodes" FROM "MasterProduct" mp WHERE mp."active"=true AND (mp."name" ILIKE ${like} OR mp."sourceCode" ILIKE ${like} OR EXISTS(SELECT 1 FROM "MasterProductBarcode" mb WHERE mb."masterProductId"=mp."id" AND mb."barcode" ILIKE ${like})) ORDER BY mp."name" LIMIT 20`;
    res.json({query:q,rows:[...local,...master].map(r=>({...r,vatRate:Number(r.vatRate||0),salePrice:Number(r.salePrice||0),costPrice:Number(r.costPrice||0)}))});
  }catch(error){next(error)}
});

router.get("/:orderId/ocr-lines/:lineId/google-barcode-search",async(req,res,next)=>{try{
  const line=await ownedLine(req.user.companyId,req.params.orderId,req.params.lineId);if(!line)return res.status(404).json({error:"Δεν βρέθηκε η γραμμή."});const q=String(req.query.q||line.description||line.ocrRawText||"").trim();if(q.length<3)return res.status(400).json({error:"Χρειάζεται περιγραφή προϊόντος για Google αναζήτηση."});res.json(await googleDescriptionSearch(req,q));
}catch(error){next(error)}});

router.post("/:orderId/ocr-lines/:lineId/resolve-existing",async(req,res,next)=>{
  try{
    const body=z.object({productId:z.string().min(1),addBarcode:z.boolean().optional().default(false),barcode:z.string().trim().max(80).optional().nullable()}).parse(req.body||{});
    const line=await ownedLine(req.user.companyId,req.params.orderId,req.params.lineId);if(!line)return res.status(404).json({error:"Δεν βρέθηκε η γραμμή."});if(line.status!=="NEW")return res.status(409).json({error:"Αλλαγές αντιστοίχισης επιτρέπονται μόνο σε Νέα παραγγελία."});
    const products=await prisma.$queryRaw`SELECT "id","name","vatRate","salePrice","costPrice" FROM "Product" WHERE "id"=${body.productId} AND "companyId"=${req.user.companyId} AND "active"=true LIMIT 1`;const product=products[0];if(!product)return res.status(404).json({error:"Δεν βρέθηκε το προϊόν."});const barcode=String(body.barcode||line.detectedBarcode||"").trim();
    await prisma.$transaction(async tx=>{if(body.addBarcode&&barcode){const duplicate=await tx.$queryRaw`SELECT p."id",p."name" FROM "ProductBarcode" pb JOIN "Product" p ON p."id"=pb."productId" WHERE p."companyId"=${req.user.companyId} AND pb."barcode"=${barcode} LIMIT 1`;if(duplicate[0]&&duplicate[0].id!==product.id){const error=new Error(`Το barcode ${barcode} ανήκει ήδη στο προϊόν «${duplicate[0].name}».`);error.status=409;throw error}if(!duplicate[0])await tx.$executeRaw`INSERT INTO "ProductBarcode" ("id","productId","barcode","unitMultiplier") VALUES (${id()},${product.id},${barcode},1)`}await tx.$executeRaw`UPDATE "PurchaseOrderLine" SET "productId"=${product.id},"resolutionStatus"='MATCHED',"updatedAt"=NOW() WHERE "id"=${line.id}`;await learnSupplierMapping(tx,{companyId:req.user.companyId,supplierId:line.supplierId,supplierCode:line.supplierCode,productId:product.id,barcode,description:line.description,userId:req.user.id,unitCost:line.unitCost})});
    res.json({ok:true,product:{id:product.id,name:product.name},barcodeAdded:Boolean(body.addBarcode&&barcode),mappingLearned:Boolean(line.supplierId&&String(line.supplierCode||"").trim())});
  }catch(error){next(error)}
});

router.post("/:orderId/ocr-lines/:lineId/create-product",async(req,res,next)=>{
  try{
    const body=z.object({name:z.string().trim().min(2).max(250),supplierCode:z.string().trim().max(100).optional().nullable(),barcode:z.string().trim().max(80).optional().nullable(),unitCost:z.coerce.number().min(0).max(1000000).optional(),invoiceUnit:z.enum(["PIECE","PACKAGE"]).optional().default("PIECE"),unitsPerPackage:z.coerce.number().min(1).max(100000).optional().default(1),vatRate:z.coerce.number().min(0).max(100).default(24),salePrice:z.coerce.number().min(0).default(0),categoryId:z.string().optional().nullable(),subcategoryId:z.string().optional().nullable()}).parse(req.body||{});
    const line=await ownedLine(req.user.companyId,req.params.orderId,req.params.lineId);if(!line)return res.status(404).json({error:"Δεν βρέθηκε η γραμμή."});if(line.status!=="NEW")return res.status(409).json({error:"Νέο προϊόν από τιμολόγιο δημιουργείται μόνο πριν την Οριστικοποίηση."});const barcode=String(body.barcode||line.detectedBarcode||"").trim();
    if(body.categoryId){const c=(await prisma.$queryRaw`SELECT "id" FROM "ProductCategory" WHERE "id"=${body.categoryId} AND "companyId"=${req.user.companyId} AND "active"=true LIMIT 1`)[0];if(!c)return res.status(400).json({error:"Η Κατηγορία δεν είναι έγκυρη."})}if(body.subcategoryId){const s=(await prisma.$queryRaw`SELECT "id" FROM "ProductSubcategory" WHERE "id"=${body.subcategoryId} AND "categoryId"=${body.categoryId||''} AND "companyId"=${req.user.companyId} AND "active"=true LIMIT 1`)[0];if(!s)return res.status(400).json({error:"Η Υποκατηγορία δεν ανήκει στην Κατηγορία."})}
    if(barcode){const d=await prisma.$queryRaw`SELECT p."id",p."name" FROM "ProductBarcode" pb JOIN "Product" p ON p."id"=pb."productId" WHERE p."companyId"=${req.user.companyId} AND pb."barcode"=${barcode} LIMIT 1`;if(d[0])return res.status(409).json({error:`Το barcode υπάρχει ήδη στο «${d[0].name}». Χρησιμοποίησε Συγχώνευση/Αντιστοίχιση.`})}
    const supplierCode=body.supplierCode!==undefined?body.supplierCode:line.supplierCode,unitCost=Math.max(0,Number(body.unitCost??line.unitCost??0)),packSize=body.invoiceUnit==="PACKAGE"?Math.max(1,Number(body.unitsPerPackage||1)):1,quantity=Math.max(0.0001,Number(line.quantity||1)),factor=(1-Number(line.discount1||0)/100)*(1-Number(line.discount2||0)/100)*(1-Number(line.discount3||0)/100),excise=Math.max(0,Number(line.exciseTotal||0)),net=quantity*unitCost*factor,pieceCost=(net+excise)/(quantity*packSize);
    const productId=id();await prisma.$transaction(async tx=>{const nextSkuRows=await tx.$queryRaw`SELECT COALESCE(MAX(CASE WHEN "sku" ~ '^[0-9]+$' THEN "sku"::bigint END),10000)+1 AS "next" FROM "Product" WHERE "companyId"=${req.user.companyId}`;const sku=String(nextSkuRows[0]?.next||10001);await tx.$executeRaw`INSERT INTO "Product" ("id","companyId","categoryId","subcategoryId","sku","name","unit","vatRate","vatVerified","salePrice","costPrice","trackStock","active") VALUES (${productId},${req.user.companyId},${body.categoryId||null},${body.subcategoryId||null},${sku},${body.name},'PIECE',${body.vatRate},true,${body.salePrice},${pieceCost},true,true)`;if(barcode)await tx.$executeRaw`INSERT INTO "ProductBarcode" ("id","productId","barcode","unitMultiplier") VALUES (${id()},${productId},${barcode},1)`;await tx.$executeRaw`INSERT INTO "StoreProduct" ("id","storeId","productId","salePrice","currentStock","active") VALUES (${id()},${line.storeId},${productId},${body.salePrice},0,true) ON CONFLICT ("storeId","productId") DO NOTHING`;const vat=(net+excise)*body.vatRate/100;await tx.$executeRaw`UPDATE "PurchaseOrderLine" SET "productId"=${productId},"supplierCode"=${supplierCode||null},"description"=${body.name},"unitCost"=${unitCost},"invoiceUnit"=${body.invoiceUnit},"stockUnitsPerInvoiceUnit"=${packSize},"vatRate"=${body.vatRate},"netAmount"=${net},"vatAmount"=${vat},"grossAmount"=${net+excise+vat},"proposedSalePrice"=${body.salePrice},"resolutionStatus"='MATCHED',"updatedAt"=NOW() WHERE "id"=${line.id}`;await learnSupplierMapping(tx,{companyId:req.user.companyId,supplierId:line.supplierId,supplierCode,productId,barcode,description:body.name,userId:req.user.id,unitCost:pieceCost,unitsPerPackage:packSize})});
    res.status(201).json({ok:true,productId,mappingLearned:Boolean(line.supplierId&&String(supplierCode||"").trim())});
  }catch(error){next(error)}
});

export default router;
