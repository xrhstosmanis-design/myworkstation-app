import crypto from "crypto";
import {Router} from "express";
import {prisma} from "../prisma.js";
import {advancedOnlineProductSearch,advancedOnlineSearchEntitlement} from "../advanced-online-product-search.js";

const router=Router(),uid=()=>crypto.randomUUID();
const isPlatformSuper=req=>req.user?.isSuperAdmin===true||req.user?.platformRole==="SUPER_ADMIN"||req.user?.role==="SUPER_ADMIN";
const isOwner=req=>req.user?.role==="OWNER";
const nextSku=async(companyId,tx=prisma)=>String((await tx.$queryRaw`SELECT COALESCE(MAX(CASE WHEN "sku" ~ '^[0-9]+$' THEN "sku"::bigint END),10000)+1 AS next FROM "Product" WHERE "companyId"=${companyId}`)[0]?.next||10001);
async function requireAdvanced(req,res){if(isPlatformSuper(req))return true;if(!isOwner(req)){res.status(403).json({error:"Η αναζήτηση Internet επιτρέπεται μόνο σε ιδιοκτήτη ή Super Admin.",code:"OWNER_ONLY"});return false}const ok=await advancedOnlineSearchEntitlement(req.user.companyId);if(!ok){res.status(403).json({error:"Το module Advanced Online Product Search δεν είναι ενεργό για την εταιρεία.",code:"MODULE_DISABLED",moduleKey:"ADVANCED_ONLINE_PRODUCT_SEARCH"});return false}return true}

async function ensureSchema(){
  await prisma.$executeRawUnsafe(`ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "subcategoryId" TEXT`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "vatDepartmentId" TEXT`);
}

async function ensureMarketSchema(){
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "InternetProductSearch" (
    "id" TEXT PRIMARY KEY,"companyId" TEXT NOT NULL,"storeId" TEXT,"actorId" TEXT,
    "query" TEXT NOT NULL,"queryType" TEXT NOT NULL,"productId" TEXT,"resultCount" INTEGER NOT NULL DEFAULT 0,
    "results" JSONB NOT NULL DEFAULT '[]'::jsonb,"createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
  ); CREATE INDEX IF NOT EXISTS "InternetProductSearch_company_created_idx" ON "InternetProductSearch" ("companyId","createdAt" DESC);
  CREATE TABLE IF NOT EXISTS "InternetPriceProposal" (
    "id" TEXT PRIMARY KEY,"companyId" TEXT NOT NULL,"storeId" TEXT NOT NULL,"productId" TEXT NOT NULL,"searchId" TEXT,
    "currentPrice" NUMERIC(14,4) NOT NULL,"proposedPrice" NUMERIC(14,4) NOT NULL,"reason" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',"createdBy" TEXT,"reviewedBy" TEXT,"reviewedAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),"updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
  ); CREATE INDEX IF NOT EXISTS "InternetPriceProposal_company_status_idx" ON "InternetPriceProposal" ("companyId","status","createdAt" DESC);
  CREATE TABLE IF NOT EXISTS "InternetPriceProposalAudit" (
    "id" TEXT PRIMARY KEY,"proposalId" TEXT NOT NULL,"companyId" TEXT NOT NULL,"storeId" TEXT NOT NULL,"productId" TEXT NOT NULL,
    "action" TEXT NOT NULL,"oldPrice" NUMERIC(14,4),"newPrice" NUMERIC(14,4),"actorId" TEXT,"createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
  ); CREATE INDEX IF NOT EXISTS "InternetPriceProposalAudit_proposal_idx" ON "InternetPriceProposalAudit" ("proposalId","createdAt")`);
}

async function companyFor(req,res,{moduleRequired=true}={}){
  const platform=isPlatformSuper(req),platformPath=String(req.baseUrl||"").startsWith("/api/platform");
  if(platformPath&&!platform){res.status(403).json({error:"Απαιτείται πρόσβαση Super Admin."});return null}
  const companyId=platform?String(req.query.companyId||req.body?.companyId||"").trim():req.user.companyId;
  if(!companyId){res.status(400).json({error:"Επίλεξε εταιρεία."});return null}
  if(!platform&&moduleRequired&&!await advancedOnlineSearchEntitlement(companyId)){res.status(403).json({error:"Το module Advanced Online Product Search δεν είναι ενεργό για την εταιρεία.",code:"MODULE_DISABLED",moduleKey:"ADVANCED_ONLINE_PRODUCT_SEARCH"});return null}
  if(!platform&&!isOwner(req)){res.status(403).json({error:"Η αναζήτηση Internet επιτρέπεται μόνο σε ιδιοκτήτη ή Super Admin.",code:"OWNER_ONLY"});return null}
  return companyId;
}

async function validStore(companyId,storeId){return storeId?prisma.store.findFirst({where:{id:storeId,companyId,active:true},select:{id:true,name:true}}):null}

const euroValues=value=>[...String(value||"").matchAll(/(?:€\s*|EUR\s*)(\d{1,4}(?:[.,]\d{1,2})?)|(\d{1,4}(?:[.,]\d{1,2})?)\s*(?:€|EUR)/gi)]
  .map(match=>Number(String(match[1]||match[2]).replace(",","."))).filter(value=>Number.isFinite(value)&&value>0&&value<100000);
const offerText=value=>String(value||"").match(/(?:1\s*\+\s*1|2\s*\+\s*1|-?\s*\d{1,2}\s*%|έκπτωση[^.·|]{0,50}|προσφορά[^.·|]{0,50})/iu)?.[0]?.trim()||null;
const sourceType=domain=>/skroutz|bestprice|shopflix/i.test(domain)?"ONLINE_STORE":/market|supermarket|sklavenitis|ab\.gr|mymarket|masoutis|kritikos/i.test(domain)?"SUPERMARKET":/cash|carry|wholesale|χονδρ/i.test(domain)?"WHOLESALER":"PUBLIC_INTERNET";
const domainOf=url=>{try{return new URL(url).hostname.replace(/^www\./,"")}catch{return ""}};

async function internetMarketSearch(query){
  const key=String(process.env.SERPER_API_KEY||"").trim();
  if(!key)return {configured:false,rows:[]};
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),6500);
  try{
    const response=await fetch("https://google.serper.dev/search",{method:"POST",headers:{"X-API-KEY":key,"Content-Type":"application/json"},body:JSON.stringify({q:`${query} τιμή προσφορά αγορά Ελλάδα`,gl:"gr",hl:"el",num:10}),signal:controller.signal});
    if(!response.ok)throw new Error(`SERPER_${response.status}`);
    const data=await response.json();
    return {configured:true,rows:(data.organic||[]).slice(0,10).map((item,index)=>{const domain=domainOf(item.link),prices=euroValues(`${item.title||""} ${item.snippet||""}`);return {id:`internet:${index}`,productName:String(item.title||query).trim().slice(0,240),barcode:/^\d{6,18}$/.test(query)?query:null,sourceDomain:domain,sourceUrl:item.link||null,sourceType:sourceType(domain),price:prices[0]??null,offer:offerText(`${item.title||""} ${item.snippet||""}`),offerDate:null,snippet:String(item.snippet||"").trim().slice(0,500)}})};
  }finally{clearTimeout(timer)}
}

router.get("/market-search",async(req,res,next)=>{try{
  const companyId=await companyFor(req,res);if(!companyId)return;await ensureMarketSchema();
  const query=String(req.query.q||"").trim().replace(/\s+/g," "),storeId=String(req.query.storeId||"").trim()||null,productId=String(req.query.productId||"").trim()||null;
  if(query.length<2||query.length>180)return res.status(400).json({error:"Γράψε όνομα, barcode, προμηθευτή ή κατηγορία."});
  if(storeId&&!await validStore(companyId,storeId))return res.status(404).json({error:"Δεν βρέθηκε ενεργό κατάστημα."});
  let own=null;
  if(productId||/^\d{6,18}$/.test(query))own=(await prisma.$queryRaw`SELECT p."id",p."name",p."sku",p."costPrice",COALESCE(sp."salePrice",p."salePrice") AS "salePrice",COALESCE(sup."name",'Βασικός προμηθευτής') AS "supplierName",COALESCE((SELECT pb."barcode" FROM "ProductBarcode" pb WHERE pb."productId"=p."id" ORDER BY pb."barcode" LIMIT 1),'') AS "barcode" FROM "Product" p LEFT JOIN "StoreProduct" sp ON sp."productId"=p."id" AND (${storeId}::text IS NULL OR sp."storeId"=${storeId}) LEFT JOIN LATERAL (SELECT spl."supplierId" FROM "SupplierProductLink" spl WHERE spl."companyId"=${companyId} AND spl."productId"=p."id" AND spl."active"=true ORDER BY spl."updatedAt" DESC LIMIT 1) link ON true LEFT JOIN "Supplier" sup ON sup."id"=link."supplierId" AND sup."companyId"=${companyId} WHERE p."companyId"=${companyId} AND p."active"=true AND (p."id"=${productId} OR p."sku"=${query} OR EXISTS(SELECT 1 FROM "ProductBarcode" pb WHERE pb."productId"=p."id" AND pb."barcode"=${query})) LIMIT 1`)[0]||null;
  const internet=await internetMarketSearch(query),priced=internet.rows.filter(row=>row.price!=null),cheapest=priced.sort((a,b)=>a.price-b.price)[0]||null;
  const cost=Number(own?.costPrice||0),sale=Number(own?.salePrice||0),margin=sale>0?((sale-cost)/sale)*100:null,marketPrice=cheapest?.price??null;
  const recommendation=!own?"Σύνδεσε το αποτέλεσμα με προϊόν του καταλόγου για σύγκριση.":margin!==null&&margin<15?"Προειδοποίηση: χαμηλό περιθώριο κέρδους.":marketPrice&&sale>marketPrice*1.15?"Η τιμή μας είναι αισθητά υψηλότερη από τη φθηνότερη δημόσια τιμή.":marketPrice&&sale<marketPrice*.85?"Η τιμή μας είναι αισθητά χαμηλότερη από την αγορά — έλεγξε πιθανή απώλεια κέρδους.":"Η τιμή μας βρίσκεται κοντά στις τιμές που εντοπίστηκαν.";
  const results=internet.rows.map(row=>({...row,differenceFromOurSale:row.price!=null&&sale?Number((row.price-sale).toFixed(2)):null}));
  const id=uid();await prisma.$executeRaw`INSERT INTO "InternetProductSearch" ("id","companyId","storeId","actorId","query","queryType","productId","resultCount","results") VALUES (${id},${companyId},${storeId},${req.user.id||null},${query},${/^\d{6,18}$/.test(query)?"BARCODE":"TEXT"},${own?.id||productId},${results.length},${JSON.stringify(results)}::jsonb)`;
  res.json({id,query,configured:internet.configured,own:own?{...own,costPrice:cost,salePrice:sale,marginPercent:margin==null?null:Number(margin.toFixed(2))}:null,rows:results,cheapest,recommendation,warning:"Οι τιμές Internet είναι ενδείξεις από δημόσια αποτελέσματα και δεν εφαρμόζονται αυτόματα."});
}catch(error){next(error)}});

router.get("/products",async(req,res,next)=>{try{
  const companyId=await companyFor(req,res);if(!companyId)return;
  const q=String(req.query.q||"").trim(),storeId=String(req.query.storeId||"").trim()||null;if(q.length<2)return res.json({rows:[]});
  if(storeId&&!await validStore(companyId,storeId))return res.status(404).json({error:"Δεν βρέθηκε ενεργό κατάστημα."});const like=`%${q}%`;const rows=await prisma.$queryRaw`SELECT p."id",p."name",p."sku",p."costPrice",COALESCE(sp."salePrice",p."salePrice") AS "salePrice",COALESCE((SELECT pb."barcode" FROM "ProductBarcode" pb WHERE pb."productId"=p."id" ORDER BY pb."barcode" LIMIT 1),'') AS "barcode" FROM "Product" p LEFT JOIN "StoreProduct" sp ON sp."productId"=p."id" AND (${storeId}::text IS NULL OR sp."storeId"=${storeId}) WHERE p."companyId"=${companyId} AND p."active"=true AND (p."name" ILIKE ${like} OR p."sku" ILIKE ${like} OR EXISTS(SELECT 1 FROM "ProductBarcode" pb WHERE pb."productId"=p."id" AND pb."barcode" ILIKE ${like})) ORDER BY p."name" LIMIT 20`;
  res.json({rows:rows.map(row=>({...row,costPrice:Number(row.costPrice||0),salePrice:Number(row.salePrice||0)}))});
}catch(error){next(error)}});

router.get("/history",async(req,res,next)=>{try{const companyId=await companyFor(req,res);if(!companyId)return;await ensureMarketSchema();const rows=await prisma.$queryRaw`SELECT "id","storeId","query","queryType","productId","resultCount","createdAt" FROM "InternetProductSearch" WHERE "companyId"=${companyId} ORDER BY "createdAt" DESC LIMIT 50`;res.json({rows})}catch(error){next(error)}});

router.get("/price-proposals",async(req,res,next)=>{try{const companyId=await companyFor(req,res);if(!companyId)return;await ensureMarketSchema();const rows=await prisma.$queryRaw`SELECT pp.*,p."name" AS "productName",p."sku",s."name" AS "storeName" FROM "InternetPriceProposal" pp JOIN "Product" p ON p."id"=pp."productId" AND p."companyId"=pp."companyId" JOIN "Store" s ON s."id"=pp."storeId" AND s."companyId"=pp."companyId" WHERE pp."companyId"=${companyId} ORDER BY (pp."status"='PENDING') DESC,pp."createdAt" DESC LIMIT 100`;res.json({rows:rows.map(row=>({...row,currentPrice:Number(row.currentPrice),proposedPrice:Number(row.proposedPrice)}))})}catch(error){next(error)}});

router.post("/price-proposals",async(req,res,next)=>{try{const companyId=await companyFor(req,res);if(!companyId)return;await ensureMarketSchema();const {storeId,productId,searchId}=req.body||{},proposedPrice=Number(req.body?.proposedPrice),reason=String(req.body?.reason||"").trim().slice(0,500)||null;if(!storeId||!productId||!Number.isFinite(proposedPrice)||proposedPrice<0)return res.status(400).json({error:"Επίλεξε προϊόν, κατάστημα και έγκυρη προτεινόμενη τιμή."});if(!await validStore(companyId,storeId))return res.status(404).json({error:"Δεν βρέθηκε ενεργό κατάστημα."});const product=(await prisma.$queryRaw`SELECT p."id",COALESCE(sp."salePrice",p."salePrice") AS "salePrice" FROM "Product" p JOIN "StoreProduct" sp ON sp."productId"=p."id" AND sp."storeId"=${storeId} WHERE p."id"=${productId} AND p."companyId"=${companyId} AND p."active"=true AND sp."active"=true LIMIT 1`)[0];if(!product)return res.status(404).json({error:"Το προϊόν δεν είναι ενεργό στο κατάστημα."});const id=uid(),currentPrice=Number(product.salePrice||0);await prisma.$transaction(async tx=>{await tx.$executeRaw`INSERT INTO "InternetPriceProposal" ("id","companyId","storeId","productId","searchId","currentPrice","proposedPrice","reason","createdBy") VALUES (${id},${companyId},${storeId},${productId},${searchId||null},${currentPrice},${proposedPrice},${reason},${req.user.id||null})`;await tx.$executeRaw`INSERT INTO "InternetPriceProposalAudit" ("id","proposalId","companyId","storeId","productId","action","oldPrice","newPrice","actorId") VALUES (${uid()},${id},${companyId},${storeId},${productId},'PROPOSED',${currentPrice},${proposedPrice},${req.user.id||null})`});res.status(201).json({ok:true,id,status:"PENDING"})}catch(error){next(error)}});

router.post("/price-proposals/:id/decision",async(req,res,next)=>{try{const companyId=await companyFor(req,res);if(!companyId)return;await ensureMarketSchema();const decision=String(req.body?.decision||"").toUpperCase();if(!["APPROVE","REJECT"].includes(decision))return res.status(400).json({error:"Επίλεξε έγκριση ή απόρριψη."});const result=await prisma.$transaction(async tx=>{const proposal=(await tx.$queryRaw`SELECT * FROM "InternetPriceProposal" WHERE "id"=${req.params.id} AND "companyId"=${companyId} FOR UPDATE`)[0];if(!proposal){const error=new Error("Η πρόταση δεν βρέθηκε.");error.status=404;throw error}if(proposal.status!=="PENDING"){const error=new Error("Η πρόταση έχει ήδη εξεταστεί.");error.status=409;throw error}if(decision==="APPROVE"){const updated=await tx.$executeRaw`UPDATE "StoreProduct" sp SET "salePrice"=${proposal.proposedPrice} FROM "Product" p WHERE sp."storeId"=${proposal.storeId} AND sp."productId"=${proposal.productId} AND p."id"=sp."productId" AND p."companyId"=${companyId} AND sp."active"=true`;if(updated!==1){const error=new Error("Δεν ήταν δυνατή η ασφαλής ενημέρωση της τιμής.");error.status=409;throw error}}const status=decision==="APPROVE"?"APPROVED":"REJECTED";await tx.$executeRaw`UPDATE "InternetPriceProposal" SET "status"=${status},"reviewedBy"=${req.user.id||null},"reviewedAt"=NOW(),"updatedAt"=NOW() WHERE "id"=${proposal.id}`;await tx.$executeRaw`INSERT INTO "InternetPriceProposalAudit" ("id","proposalId","companyId","storeId","productId","action","oldPrice","newPrice","actorId") VALUES (${uid()},${proposal.id},${companyId},${proposal.storeId},${proposal.productId},${status},${proposal.currentPrice},${proposal.proposedPrice},${req.user.id||null})`;return {status}});res.json({ok:true,...result})}catch(error){next(error)}});

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
