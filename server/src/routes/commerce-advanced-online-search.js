import crypto from "crypto";
import {Router} from "express";
import {prisma} from "../prisma.js";
import {advancedOnlineProductSearch,advancedOnlineSearchEntitlement} from "../advanced-online-product-search.js";

const router=Router(),uid=()=>crypto.randomUUID();
const isPlatformSuper=req=>req.user?.isSuperAdmin===true||req.user?.platformRole==="SUPER_ADMIN"||req.user?.role==="SUPER_ADMIN";
const nextSku=async(companyId,tx=prisma)=>String((await tx.$queryRaw`SELECT COALESCE(MAX(CASE WHEN "sku" ~ '^[0-9]+$' THEN "sku"::bigint END),10000)+1 AS next FROM "Product" WHERE "companyId"=${companyId}`)[0]?.next||10001);
async function requireAdvanced(req,res){if(isPlatformSuper(req))return true;const ok=await advancedOnlineSearchEntitlement(req.user.companyId);if(!ok){res.status(403).json({error:"Το module Advanced Online Product Search δεν είναι ενεργό για την εταιρεία.",code:"MODULE_DISABLED",moduleKey:"ADVANCED_ONLINE_PRODUCT_SEARCH"});return false}return true}

async function ensureSchema(){
  await prisma.$executeRawUnsafe(`ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "subcategoryId" TEXT`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "vatDepartmentId" TEXT`);
}

router.get("/options",async(req,res,next)=>{try{
  if(!await requireAdvanced(req,res))return;await ensureSchema();const companyId=req.user.companyId;
  const [categories,subcategories,vats,stores]=await Promise.all([
    prisma.$queryRaw`SELECT "id","name" FROM "ProductCategory" WHERE "companyId"=${companyId} AND "active"=true ORDER BY "name"`,
    prisma.$queryRaw`SELECT "id","categoryId","name" FROM "ProductSubcategory" WHERE "companyId"=${companyId} AND "active"=true ORDER BY "name"`,
    prisma.$queryRaw`SELECT "id","description","vatRate" FROM "ManagementVatDepartment" WHERE "companyId"=${companyId} AND "active"=true ORDER BY "vatRate","description"`.catch(()=>[]),
    prisma.store.findMany({where:{companyId,active:true},select:{id:true,name:true},orderBy:{name:"asc"}})
  ]);
  res.json({categories,subcategories,vats:vats.map(v=>({...v,vatRate:Number(v.vatRate||0)})),stores});
}catch(error){next(error)}});

router.get("/search",async(req,res,next)=>{try{
  if(!await requireAdvanced(req,res))return;const companyId=req.user.companyId,q=String(req.query.q||"").trim();if(!/^\d{6,18}$/.test(q))return res.status(400).json({error:"Η Advanced Online Search γίνεται με barcode 6–18 ψηφίων."});
  const local=(await prisma.$queryRaw`SELECT p."id",p."sku",p."name",p."vatRate",p."categoryId",p."subcategoryId",c."name" AS "categoryName",sc."name" AS "subcategoryName",COALESCE((SELECT json_agg(pb."barcode") FROM "ProductBarcode" pb WHERE pb."productId"=p."id"),'[]') AS "barcodes" FROM "Product" p LEFT JOIN "ProductCategory" c ON c."id"=p."categoryId" LEFT JOIN "ProductSubcategory" sc ON sc."id"=p."subcategoryId" WHERE p."companyId"=${companyId} AND p."active"=true AND EXISTS(SELECT 1 FROM "ProductBarcode" pb WHERE pb."productId"=p."id" AND pb."barcode"=${q}) LIMIT 1`)[0];
  if(local)return res.json({source:"MYWORKSTATION",rows:[local],advanced:{reason:"FOUND_LOCAL"}});
  const master=(await prisma.$queryRaw`SELECT mp."id" AS "masterProductId",mp."sourceCode",mp."name",mp."categoryName",mp."subcategoryName",mp."vatRate",mp."defaultRetailPrice",mp."defaultCostPrice",mp."brandName",COALESCE((SELECT json_agg(mb."barcode") FROM "MasterProductBarcode" mb WHERE mb."masterProductId"=mp."id"),'[]') AS "barcodes" FROM "MasterProduct" mp WHERE mp."active"=true AND EXISTS(SELECT 1 FROM "MasterProductBarcode" mb WHERE mb."masterProductId"=mp."id" AND mb."barcode"=${q}) LIMIT 1`)[0];
  if(master)return res.json({source:"MASTER_CATALOG",rows:[{...master,vatRate:master.vatRate==null?null:Number(master.vatRate),salePrice:master.defaultRetailPrice==null?0:Number(master.defaultRetailPrice),costPrice:master.defaultCostPrice==null?0:Number(master.defaultCostPrice)}],advanced:{reason:"FOUND_MASTER"}});
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),4000);try{const response=await fetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(q)}?fields=code,product_name,product_name_el,brands,categories,categories_tags`,{headers:{"User-Agent":"MyWorkStation/1.0 (https://myworkstation.gr)"},signal:controller.signal});if(response.ok){const data=await response.json(),p=data?.product;if(p&&data?.status!==0){return res.json({source:"OPEN_FOOD_FACTS",rows:[{name:String(p.product_name_el||p.product_name||"").trim()||`Barcode ${q}`,barcodes:[q],brandName:String(p.brands||"").trim(),categoryName:"",subcategoryName:"",vatRate:null,salePrice:0,costPrice:0,source:"OPEN_FOOD_FACTS"}],advanced:{reason:"FOUND_OPEN_FOOD_FACTS"}})}}}catch{}finally{clearTimeout(timer)}
  const advanced=await advancedOnlineProductSearch({companyId,storeId:String(req.query.storeId||"INVOICE"),actorId:req.user.id,barcode:q,bypassEntitlement:isPlatformSuper(req),usageContext:"INVOICE_PRODUCT_SEARCH"});
  res.json({source:advanced.rows?.length?"GOOGLE_SEARCH":"NONE",rows:advanced.rows||[],advanced});
}catch(error){next(error)}});

router.post("/create-product",async(req,res,next)=>{try{
  if(!await requireAdvanced(req,res))return;await ensureSchema();const companyId=req.user.companyId,body=req.body||{};
  const barcode=String(body.barcode||"").trim(),name=String(body.name||"").trim().replace(/\s+/g," "),categoryId=String(body.categoryId||"").trim(),subcategoryId=String(body.subcategoryId||"").trim()||null,vatDepartmentId=String(body.vatDepartmentId||"").trim()||null,masterProductId=String(body.masterProductId||"").trim()||null;
  const vatRate=Number(body.vatRate),salePrice=Number(body.salePrice||0),costPrice=Number(body.costPrice||0),unit=["PIECE","KG","LITER","PACKAGE"].includes(body.unit)?body.unit:"PIECE";
  if(!/^\d{6,18}$/.test(barcode)||name.length<2)return res.status(400).json({error:"Έλεγξε barcode και περιγραφή."});if(!categoryId)return res.status(400).json({error:"Επίλεξε Κατηγορία."});if(!Number.isFinite(vatRate)||vatRate<0||vatRate>100||!Number.isFinite(salePrice)||salePrice<0||!Number.isFinite(costPrice)||costPrice<0)return res.status(400).json({error:"Έλεγξε ΦΠΑ και τιμές."});
  const category=(await prisma.$queryRaw`SELECT "id" FROM "ProductCategory" WHERE "id"=${categoryId} AND "companyId"=${companyId} AND "active"=true LIMIT 1`)[0];if(!category)return res.status(400).json({error:"Η Κατηγορία δεν είναι έγκυρη."});if(subcategoryId){const sub=(await prisma.$queryRaw`SELECT "id" FROM "ProductSubcategory" WHERE "id"=${subcategoryId} AND "categoryId"=${categoryId} AND "companyId"=${companyId} AND "active"=true LIMIT 1`)[0];if(!sub)return res.status(400).json({error:"Η Υποκατηγορία δεν ανήκει στην Κατηγορία."})}
  const duplicate=(await prisma.$queryRaw`SELECT p."id",p."name" FROM "ProductBarcode" pb JOIN "Product" p ON p."id"=pb."productId" WHERE p."companyId"=${companyId} AND pb."barcode"=${barcode} LIMIT 1`)[0];if(duplicate)return res.status(409).json({error:`Το barcode υπάρχει ήδη στο «${duplicate.name}».`,existing:duplicate});
  const stores=await prisma.store.findMany({where:{companyId,active:true},select:{id:true}}),productId=uid();let sku="";
  await prisma.$transaction(async tx=>{await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${companyId+":product-sku"}))`;sku=await nextSku(companyId,tx);let depId=vatDepartmentId;if(depId){const dep=(await tx.$queryRaw`SELECT "id" FROM "ManagementVatDepartment" WHERE "id"=${depId} AND "companyId"=${companyId} AND "active"=true LIMIT 1`)[0];if(!dep)depId=null}let masterId=masterProductId;if(masterId){const m=(await tx.$queryRaw`SELECT "id" FROM "MasterProduct" WHERE "id"=${masterId} AND "active"=true LIMIT 1`)[0];if(!m)masterId=null}
    await tx.$executeRaw`INSERT INTO "Product" ("id","companyId","categoryId","subcategoryId","vatDepartmentId","masterProductId","sku","name","unit","vatRate","vatVerified","salePrice","costPrice","trackStock","active") VALUES (${productId},${companyId},${categoryId},${subcategoryId},${depId},${masterId},${sku},${name},${unit},${vatRate},true,${salePrice},${costPrice},true,true)`;await tx.$executeRaw`INSERT INTO "ProductBarcode" ("id","productId","barcode","unitMultiplier") VALUES (${uid()},${productId},${barcode},1)`;for(const store of stores)await tx.$executeRaw`INSERT INTO "StoreProduct" ("id","storeId","productId","salePrice","currentStock","active") VALUES (${uid()},${store.id},${productId},${salePrice},0,true) ON CONFLICT ("storeId","productId") DO NOTHING`;
  });res.status(201).json({ok:true,id:productId,sku,name,barcode});
}catch(error){next(error)}});

export default router;
