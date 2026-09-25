import crypto from "crypto";
import {Router} from "express";
import {prisma} from "../prisma.js";
import {validateExplicitStockRules,applyExplicitStockRules} from "../lib/invoice-explicit-stock-rules.js";
import {requireCompanyModule} from "../middleware/module-access.js";
import {COFFEE_UNION_PROFILE} from "../lib/invoice-learning-coffee-union-seed.js";
import {PREMIUM_BAKERY_PROFILE} from "../lib/invoice-learning-premium-bakery-seed.js";
import {FRESH_SNACK_PROFILE} from "../lib/invoice-learning-fresh-snack-seed.js";
import {FRESH_DELICACIES_PROFILE} from "../lib/invoice-learning-fresh-delicacies-seed.js";
import {syncProductKnowledgeFromProfiles} from "../lib/invoice-learning-product-knowledge.js";

const router=Router();
const SCOPE="PLATFORM_GLOBAL";
const isSuper=req=>req.user?.isSuperAdmin===true||req.user?.platformRole==="SUPER_ADMIN"||req.user?.role==="SUPER_ADMIN";
const isAuthenticated=req=>Boolean(req.user?.id||req.user?.userId||req.user?.sub||isSuper(req));
const cleanTaxId=v=>String(v||"").replace(/\D/g,"");
const normName=v=>String(v||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toUpperCase().replace(/[^A-ZΑ-Ω0-9]/g,"");
const ALFA_SEED_KEY="ALFA_AFOI_MANTOU";
const ALFA_SEED_PROFILE={supplierName:"ALFA / ΑΦΟΙ ΜΑΝΤΟΥ Α.Ε.",supplierTaxId:"",ruleKey:ALFA_SEED_KEY,central:true,source:"MANUAL_VERIFIED_INVOICE_LEARNING",mappings:{"U_ROLO_TYRI_120GR":{supplierItemCode:"",description:"U ΡΟΛΟ ΤΥΡΙ 120gr",invoiceUnit:"Κ.Β.",stockUnit:"ΤΜΧ",unitsPerPackage:75,packageUnitPrice:28.25,pieceNetCost:0.3767,discount1:0,discount2:0,discount3:0,vatRate:13,barcode:"",barcodeType:"MWS_INTERNAL_PENDING",verified:true}}};
const ALFA_TASTY_KEY="998862155";
const ALFA_TASTY_PROFILE={supplierName:"ALFA TASTY ΕΠΕ",supplierTaxId:"998862155",ruleKey:"ALFA_TASTY",central:true,source:"MANUAL_VERIFIED_INVOICE_LEARNING",mappings:{"010206":{supplierItemCode:"010206",description:"ΠΑΤΗΤΗ ΑΛΛΑΝΤΙΚΩΝ ΘΡΑΚΙΩΤΙΚΗ 32Τ",invoiceUnit:"ΤΜΧ",stockUnit:"ΤΜΧ",unitsPerPackage:1,quantityExample:32,unitPrice:1.10,netAmountExample:35.20,discount1:0,discount2:0,discount3:0,vatRate:13,grossAmountExample:39.78,barcode:"",barcodeType:"MWS_INTERNAL_PENDING",verified:true}}};
const STEFANIDIS_KEY="998878583";
const STEFANIDIS_PROFILE={supplierName:"ΣΤΕΦΑΝΙΔΗΣ Ι ΑΝΩΝΥΜΗ ΕΤΑΙΡΕΙΑ",supplierTaxId:STEFANIDIS_KEY,ruleKey:"STEFANIDIS_PRINTED_COLUMNS",central:true,source:"CHECKPOINT_VERIFIED_2612188",readingRule:{confirmedColumnLayouts:{"1,2,3,4,5,6,7,-1":{quantity:1,unitCost:2,retailPrice:-1}}}};
const uid=()=>crypto.randomUUID();
const asNumber=(value,{min=0,max=10000000}={})=>{const n=Number(value);return Number.isFinite(n)&&n>=min&&n<=max?n:null};

export async function ensureInvoiceLearningWorkspaceSchema(){
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "InvoiceLearningWorkspaceState" ("scopeKey" TEXT PRIMARY KEY,"state" JSONB NOT NULL DEFAULT '{"documents":[],"profiles":{},"master":[]}'::jsonb,"updatedByUserId" TEXT,"updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP)`);
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "InvoiceSupplierReadingProfile" ("supplierKey" TEXT PRIMARY KEY,"supplierTaxId" TEXT,"supplierName" TEXT,"commercialFamily" TEXT,"distributorName" TEXT,"normalizedName" TEXT,"ruleKey" TEXT,"profileVersion" INTEGER NOT NULL DEFAULT 1,"profile" JSONB NOT NULL DEFAULT '{}'::jsonb,"isActive" BOOLEAN NOT NULL DEFAULT TRUE,"updatedByUserId" TEXT,"updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP)`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "InvoiceSupplierReadingProfile" ADD COLUMN IF NOT EXISTS "commercialFamily" TEXT`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "InvoiceSupplierReadingProfile" ADD COLUMN IF NOT EXISTS "distributorName" TEXT`);
  await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "InvoiceSupplierReadingProfile_taxId_uq" ON "InvoiceSupplierReadingProfile" ("supplierTaxId") WHERE "supplierTaxId" IS NOT NULL AND "supplierTaxId"<>''`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "InvoiceSupplierReadingProfile_name_idx" ON "InvoiceSupplierReadingProfile" ("normalizedName")`);
  const seedProfiles=[[ALFA_SEED_KEY,ALFA_SEED_PROFILE],[ALFA_TASTY_KEY,ALFA_TASTY_PROFILE],[STEFANIDIS_KEY,STEFANIDIS_PROFILE],[COFFEE_UNION_PROFILE.supplierTaxId||COFFEE_UNION_PROFILE.ruleKey,COFFEE_UNION_PROFILE],[PREMIUM_BAKERY_PROFILE.supplierTaxId||PREMIUM_BAKERY_PROFILE.ruleKey,PREMIUM_BAKERY_PROFILE],[FRESH_SNACK_PROFILE.supplierTaxId||FRESH_SNACK_PROFILE.ruleKey,FRESH_SNACK_PROFILE],[FRESH_DELICACIES_PROFILE.supplierTaxId||FRESH_DELICACIES_PROFILE.ruleKey,FRESH_DELICACIES_PROFILE]];
  for(const [key,p] of seedProfiles){const name=normName(p.supplierName),tax=cleanTaxId(p.supplierTaxId);await prisma.$executeRawUnsafe(`INSERT INTO "InvoiceSupplierReadingProfile" ("supplierKey","supplierTaxId","supplierName","normalizedName","ruleKey","profileVersion","profile","isActive","updatedAt") VALUES ($1,$2,$3,$4,$5,1,$6::jsonb,TRUE,CURRENT_TIMESTAMP) ON CONFLICT ("supplierKey") DO UPDATE SET "supplierTaxId"=COALESCE(EXCLUDED."supplierTaxId","InvoiceSupplierReadingProfile"."supplierTaxId"),"supplierName"=EXCLUDED."supplierName","normalizedName"=EXCLUDED."normalizedName","profile"=EXCLUDED."profile" || COALESCE("InvoiceSupplierReadingProfile"."profile",'{}'::jsonb),"ruleKey"=EXCLUDED."ruleKey","isActive"=TRUE,"updatedAt"=CURRENT_TIMESTAMP`,key,tax||null,p.supplierName,name,p.ruleKey,JSON.stringify(p));}
  await syncProductKnowledgeFromProfiles();
  console.log("Invoice Learning central supplier profiles + product knowledge ready.");
}

async function upsertSupplierProfiles(profiles,userId=null){
  for(const [fallbackKey,p0] of Object.entries(profiles||{})){
    const p=p0&&typeof p0==="object"?p0:{};
    const taxId=cleanTaxId(p.supplierTaxId||(/^\d{9}$/.test(String(fallbackKey))?fallbackKey:""));
    const supplierName=String(p.supplierName||"").trim();
    if(!taxId&&!supplierName)continue;
    const normalizedName=normName(supplierName),supplierKey=taxId||normalizedName||String(fallbackKey),commercialFamily=normName(p.commercialFamily||p.formatFamily||""),distributorName=String(p.distributorName||p.distributor||"").trim();
    await prisma.$transaction(async tx=>{
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`invoice-profile:${taxId||supplierKey}`}))`;
    const existing=await tx.$queryRawUnsafe(`SELECT "profileVersion","profile" FROM "InvoiceSupplierReadingProfile" WHERE "supplierKey"=$1 LIMIT 1`,supplierKey);
    const version=Math.max(1,Number(existing?.[0]?.profileVersion||0)+1),builtInRule=taxId==="094095506"?"IFANTIS_FOOD_GROUP":null,ruleKey=String(p.ruleKey||p.readingRuleKey||builtInRule||"")||null,profile={...(existing?.[0]?.profile||{}),...p,supplierName,supplierTaxId:taxId,ruleKey,central:true,profileVersion:version,readingRule:{...(existing?.[0]?.profile?.readingRule||{}),...(p.readingRule||{}),confirmedColumnLayouts:{...(existing?.[0]?.profile?.readingRule?.confirmedColumnLayouts||{}),...(p.readingRule?.confirmedColumnLayouts||{})}},mappings:{...(existing?.[0]?.profile?.mappings||{}),...(p.mappings||{})}};
    for(const [key,mapping] of Object.entries(existing?.[0]?.profile?.mappings||{}))if(["SUPER_ADMIN_LINE_CORRECTION","SUPER_ADMIN_STOCK_RULE"].includes(mapping.source))profile.mappings[key]={...(profile.mappings[key]||{}),...mapping};
    await tx.$executeRawUnsafe(`INSERT INTO "InvoiceSupplierReadingProfile" ("supplierKey","supplierTaxId","supplierName","commercialFamily","distributorName","normalizedName","ruleKey","profileVersion","profile","isActive","updatedByUserId","updatedAt") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,TRUE,$10,CURRENT_TIMESTAMP) ON CONFLICT ("supplierKey") DO UPDATE SET "supplierTaxId"=EXCLUDED."supplierTaxId","supplierName"=EXCLUDED."supplierName","commercialFamily"=EXCLUDED."commercialFamily","distributorName"=EXCLUDED."distributorName","normalizedName"=EXCLUDED."normalizedName","ruleKey"=EXCLUDED."ruleKey","profileVersion"=EXCLUDED."profileVersion","profile"=EXCLUDED."profile","isActive"=TRUE,"updatedByUserId"=EXCLUDED."updatedByUserId","updatedAt"=CURRENT_TIMESTAMP`,supplierKey,taxId||null,supplierName||null,commercialFamily||null,distributorName||null,normalizedName||null,ruleKey,version,JSON.stringify(profile),userId);
    });
  }
  await syncProductKnowledgeFromProfiles();
}

router.get("/invoice-learning/supplier-profile/resolve",requireCompanyModule("AI_READER"),async(req,res,next)=>{try{
  if(!isAuthenticated(req))return res.status(401).json({error:"Απαιτείται σύνδεση."});
  const taxId=cleanTaxId(req.query?.taxId),normalizedName=normName(req.query?.name);if(!taxId&&!normalizedName)return res.status(400).json({error:"Δώσε ΑΦΜ ή επωνυμία προμηθευτή."});let rows=[];
  if(taxId)rows=await prisma.$queryRawUnsafe(`SELECT "supplierKey","supplierTaxId","supplierName","commercialFamily","distributorName","ruleKey","profileVersion","profile","updatedAt" FROM "InvoiceSupplierReadingProfile" WHERE "supplierTaxId"=$1 AND "isActive"=TRUE LIMIT 1`,taxId);
  if(!rows?.length&&!taxId&&normalizedName)rows=await prisma.$queryRawUnsafe(`SELECT "supplierKey","supplierTaxId","supplierName","commercialFamily","distributorName","ruleKey","profileVersion","profile","updatedAt" FROM "InvoiceSupplierReadingProfile" WHERE ("normalizedName"=$1 OR $1 LIKE '%'||"normalizedName"||'%' OR "normalizedName" LIKE '%'||$1||'%') AND "isActive"=TRUE ORDER BY "updatedAt" DESC LIMIT 1`,normalizedName);
  const row=rows?.[0];if(!row)return res.json({ok:true,found:false,profile:null});res.json({ok:true,found:true,profile:{supplierKey:row.supplierKey,supplierTaxId:row.supplierTaxId,supplierName:row.supplierName,commercialFamily:row.commercialFamily,distributorName:row.distributorName,ruleKey:row.ruleKey,profileVersion:row.profileVersion,...(row.profile||{}),updatedAt:row.updatedAt}});
}catch(error){next(error)}});

router.use((req,res,next)=>{if(!isSuper(req))return res.status(403).json({error:"Απαιτείται πρόσβαση Platform Super Admin."});next()});

router.get("/invoice-learning/product-knowledge",async(req,res,next)=>{try{
  await syncProductKnowledgeFromProfiles();
  const rows=await prisma.$queryRawUnsafe(`SELECT "id","supplierKey","supplierTaxId","supplierName","supplierItemCode","description","barcode","barcodeStatus","masterProductId","masterProductName","invoiceUnit","stockUnit","unitsPerPackage","conversionFactor","vatRate","knowledge","verified","updatedAt" FROM "InvoiceLearningProductKnowledge" ORDER BY CASE WHEN COALESCE("barcode",'')='' THEN 0 ELSE 1 END,"supplierName" NULLS LAST,"description"`);
  res.json({ok:true,products:rows});
}catch(error){next(error)}});

router.put("/invoice-learning/product-knowledge/:id",async(req,res,next)=>{try{
  const id=String(req.params?.id||"").trim();if(!id)return res.status(400).json({error:"Λείπει το προϊόν Learning."});
  const body=req.body&&typeof req.body==="object"?req.body:{};
  const barcode=String(body.barcode||"").replace(/\D/g,"");if(barcode&&(barcode.length<8||barcode.length>14))return res.status(400).json({error:"Το barcode πρέπει να έχει 8 έως 14 ψηφία."});
  const description=String(body.description||"").trim();if(!description)return res.status(400).json({error:"Η περιγραφή είναι υποχρεωτική."});
  const supplierItemCode=String(body.supplierItemCode||"").trim();
  const invoiceUnit=String(body.invoiceUnit||"").trim();const stockUnit=String(body.stockUnit||"").trim();
  const toNum=v=>v===""||v==null?null:Number(v);const unitsPerPackage=toNum(body.unitsPerPackage),conversionFactor=toNum(body.conversionFactor),vatRate=toNum(body.vatRate);
  if([unitsPerPackage,conversionFactor,vatRate].some(v=>v!==null&&!Number.isFinite(v)))return res.status(400).json({error:"Έλεγξε τα αριθμητικά πεδία του προϊόντος."});
  const knowledge={category:String(body.category||"").trim(),subcategory:String(body.subcategory||"").trim(),purchasePrice:toNum(body.purchasePrice),retailPrice:toNum(body.retailPrice),initialStock:toNum(body.initialStock),internalCode:String(body.internalCode||"").trim(),active:body.active!==false,trackStock:body.trackStock!==false,manualProductEdit:true,manualProductEditedAt:new Date().toISOString(),barcodeSource:barcode?"MANUAL_CONFIRMED":undefined};
  for(const k of ["purchasePrice","retailPrice","initialStock"])if(knowledge[k]!==null&&!Number.isFinite(knowledge[k]))return res.status(400).json({error:"Έλεγξε τιμές αγοράς/λιανικής/stock."});
  const rows=await prisma.$queryRawUnsafe(`UPDATE "InvoiceLearningProductKnowledge" SET "supplierItemCode"=$1,"description"=$2,"barcode"=$3,"barcodeStatus"=$4,"invoiceUnit"=$5,"stockUnit"=$6,"unitsPerPackage"=$7,"conversionFactor"=$8,"vatRate"=$9,"knowledge"=COALESCE("knowledge",'{}'::jsonb)||$10::jsonb,"verified"=TRUE,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=$11 RETURNING "id","supplierKey","supplierTaxId","supplierName","supplierItemCode","description","barcode","barcodeStatus","masterProductId","masterProductName","invoiceUnit","stockUnit","unitsPerPackage","conversionFactor","vatRate","knowledge","verified","updatedAt"`,supplierItemCode||null,description,barcode||null,barcode?"KNOWN":"PENDING",invoiceUnit||null,stockUnit||null,unitsPerPackage,conversionFactor,vatRate,JSON.stringify(knowledge),id);
  if(!rows?.length)return res.status(404).json({error:"Δεν βρέθηκε το προϊόν στο κεντρικό Learning."});
  res.json({ok:true,product:rows[0]});
}catch(error){next(error)}});

router.put("/invoice-learning/product-knowledge/:id/barcode",async(req,res,next)=>{try{
  const id=String(req.params?.id||"").trim(),barcode=String(req.body?.barcode||"").replace(/\D/g,"");
  if(!id)return res.status(400).json({error:"Λείπει το προϊόν Learning."});
  if(barcode.length<8||barcode.length>14)return res.status(400).json({error:"Το barcode πρέπει να έχει 8 έως 14 ψηφία."});
  const rows=await prisma.$queryRawUnsafe(`UPDATE "InvoiceLearningProductKnowledge" SET "barcode"=$1,"barcodeStatus"='KNOWN',"knowledge"=COALESCE("knowledge",'{}'::jsonb)||$2::jsonb,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=$3 RETURNING "id","supplierKey","supplierTaxId","supplierName","supplierItemCode","description","barcode","barcodeStatus","masterProductId","masterProductName","invoiceUnit","stockUnit","unitsPerPackage","conversionFactor","vatRate","knowledge","verified","updatedAt"`,barcode,JSON.stringify({barcodeSource:"MANUAL_CONFIRMED",barcodeConfirmedAt:new Date().toISOString()}),id);
  if(!rows?.length)return res.status(404).json({error:"Δεν βρέθηκε το προϊόν στο κεντρικό Learning."});
  res.json({ok:true,product:rows[0]});
}catch(error){next(error)}});


router.get("/invoice-learning/catalog-targets",async(req,res,next)=>{try{
  const companies=await prisma.company.findMany({where:{active:true},select:{id:true,name:true,stores:{where:{active:true},select:{id:true,name:true,city:true},orderBy:{name:"asc"}}},orderBy:{name:"asc"}});
  res.json({ok:true,companies});
}catch(error){next(error)}});

router.post("/invoice-learning/master-products",async(req,res,next)=>{try{
  const body=req.body&&typeof req.body==="object"?req.body:{},name=String(body.description||body.name||"").trim().replace(/\s+/g," "),supplierName=String(body.supplierName||"").trim().replace(/\s+/g," "),supplierCode=String(body.supplierItemCode||"").trim(),barcode=String(body.barcode||"").replace(/\D/g,""),vatRate=asNumber(body.vatRate,{min:0,max:100}),cost=asNumber(body.defaultCostPrice??body.unitCost,{min:0}),retail=asNumber(body.defaultRetailPrice,{min:0}),storeIds=[...new Set(Array.isArray(body.storeIds)?body.storeIds.map(String).filter(Boolean):[])];
  if(name.length<2||name.length>250)return res.status(400).json({error:"Συμπλήρωσε σωστή περιγραφή προϊόντος."});
  if(barcode&&(barcode.length<8||barcode.length>14))return res.status(400).json({error:"Το barcode πρέπει να έχει 8 έως 14 ψηφία."});
  if(body.vatRate!==undefined&&body.vatRate!==""&&vatRate===null)return res.status(400).json({error:"Έλεγξε τον ΦΠΑ."});
  if((body.defaultCostPrice!==undefined||body.unitCost!==undefined)&&cost===null)return res.status(400).json({error:"Έλεγξε την τιμή αγοράς."});
  if(body.defaultRetailPrice!==undefined&&body.defaultRetailPrice!==""&&retail===null)return res.status(400).json({error:"Έλεγξε τη λιανική τιμή."});
  if(storeIds.length>200)return res.status(400).json({error:"Επίλεξε έως 200 καταστήματα."});
  const stores=storeIds.length?await prisma.store.findMany({where:{id:{in:storeIds},active:true},select:{id:true,companyId:true}}):[];if(stores.length!==storeIds.length)return res.status(400).json({error:"Κάποιο επιλεγμένο κατάστημα δεν είναι ενεργό."});
  const sourceCode=`IL-${cleanTaxId(body.supplierTaxId)||normName(supplierName).slice(0,20)||"SUPPLIER"}-${supplierCode||barcode||normName(name).slice(0,60)||"ITEM"}`.replace(/[^A-ZΑ-Ω0-9_-]/g,"").slice(0,120);
  const exists=await prisma.$queryRawUnsafe(`SELECT mp."id",mp."sourceCode",mp."name" FROM "MasterProduct" mp WHERE mp."sourceCode"=$1 OR ($2<>'' AND EXISTS(SELECT 1 FROM "MasterProductBarcode" b WHERE b."masterProductId"=mp."id" AND b."barcode"=$2)) LIMIT 1`,sourceCode,barcode);
  let master=exists?.[0]||null,created=false,createdProducts=0,activatedMappings=0;
  await prisma.$transaction(async tx=>{
    if(!master){const id=uid();await tx.$executeRaw`INSERT INTO "MasterProduct" ("id","sourceCode","name","supplierName","defaultRetailPrice","defaultCostPrice","vatRate","vatVerified","active","reviewStatus","importVersion") VALUES (${id},${sourceCode},${name},${supplierName||null},${retail},${cost},${vatRate},${vatRate!==null},true,'LEARNING_CONFIRMED','INVOICE_LEARNING')`;if(barcode)await tx.$executeRaw`INSERT INTO "MasterProductBarcode" ("id","masterProductId","barcode","scanEnabled","duplicateBarcode") VALUES (${uid()},${id},${barcode},true,false)`;master={id,sourceCode,name};created=true}
    const byCompany=new Map();for(const store of stores){const xs=byCompany.get(store.companyId)||[];xs.push(store);byCompany.set(store.companyId,xs)}
    for(const [companyId,companyStores] of byCompany){let product=(await tx.$queryRaw`SELECT "id" FROM "Product" WHERE "companyId"=${companyId} AND "masterProductId"=${master.id} LIMIT 1`)[0];if(!product){const id=uid();await tx.$executeRaw`INSERT INTO "Product" ("id","companyId","masterProductId","sku","name","unit","vatRate","vatVerified","salePrice","costPrice","trackStock","active") VALUES (${id},${companyId},${master.id},${master.sourceCode},${master.name},'PIECE',${vatRate||0},${vatRate!==null},${retail||0},${cost||0},true,true)`;if(barcode)await tx.$executeRaw`INSERT INTO "ProductBarcode" ("id","productId","barcode","unitMultiplier") VALUES (${uid()},${id},${barcode},1) ON CONFLICT DO NOTHING`;product={id};createdProducts++}for(const store of companyStores){const before=await tx.$queryRaw`SELECT "id" FROM "StoreProduct" WHERE "storeId"=${store.id} AND "productId"=${product.id} LIMIT 1`;await tx.$executeRaw`INSERT INTO "StoreProduct" ("id","storeId","productId","salePrice","currentStock","active") VALUES (${uid()},${store.id},${product.id},${retail||0},0,true) ON CONFLICT ("storeId","productId") DO UPDATE SET "active"=true,"updatedAt"=CURRENT_TIMESTAMP`;if(!before[0])activatedMappings++}}
  });
  res.status(created?201:200).json({ok:true,master:{...master,created},stores:stores.length,createdProducts,activatedMappings});
}catch(error){next(error)}});

router.get("/invoice-learning/workspace",async(req,res,next)=>{try{const rows=await prisma.$queryRawUnsafe(`SELECT "state","updatedAt" FROM "InvoiceLearningWorkspaceState" WHERE "scopeKey"=$1 LIMIT 1`,SCOPE),row=rows?.[0];res.json({ok:true,state:row?.state||{documents:[],profiles:{},master:[]},updatedAt:row?.updatedAt||null})}catch(error){next(error)}});
const COLUMN_MAP_ROLES=new Set(["IGNORE","SUPPLIER_CODE","DESCRIPTION","RETAIL_PRICE","UNIT","QUANTITY","UNIT_PRICE","AMOUNT_BEFORE_DISCOUNT","DISCOUNT_1","DISCOUNT_2","DISCOUNT_3","AMOUNT_AFTER_DISCOUNT","VAT_RATE"]);
// Explicit Super Admin action; never infer this intent from workspace autosync.
router.put("/invoice-learning/supplier-profile/stock-rules",async(req,res,next)=>{try{
  const supplierTaxId=cleanTaxId(req.body?.supplierTaxId),supplierName=String(req.body?.supplierName||"").trim();
  if(!/^\d{9}$/.test(supplierTaxId))return res.status(400).json({error:"Συμπλήρωσε το ΑΦΜ προμηθευτή πριν αποθηκεύσεις κανόνα."});
  let rules;try{rules=validateExplicitStockRules(req.body?.rules)}catch(error){return res.status(400).json({error:error.message})}
  const userId=String(req.user?.id||req.user?.userId||req.user?.sub||"")||null;
  const saved=await prisma.$transaction(async tx=>{
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`invoice-profile:${supplierTaxId}`}))`;
    const rows=await tx.$queryRawUnsafe(`SELECT "supplierKey","profileVersion","profile" FROM "InvoiceSupplierReadingProfile" WHERE "supplierTaxId"=$1 LIMIT 1`,supplierTaxId);
    const existing=rows?.[0]||{},supplierKey=existing.supplierKey||supplierTaxId,profileVersion=Number(existing.profileVersion||0)+1;
    const profile={...applyExplicitStockRules(existing.profile||{},rules),supplierTaxId,supplierName:supplierName||existing.profile?.supplierName||"",central:true,profileVersion};
    await tx.$executeRawUnsafe(`INSERT INTO "InvoiceSupplierReadingProfile" ("supplierKey","supplierTaxId","supplierName","normalizedName","profileVersion","profile","isActive","updatedByUserId","updatedAt") VALUES ($1,$2,$3,$4,$5,$6::jsonb,TRUE,$7,CURRENT_TIMESTAMP) ON CONFLICT ("supplierKey") DO UPDATE SET "profile"=EXCLUDED."profile","profileVersion"=EXCLUDED."profileVersion","updatedByUserId"=EXCLUDED."updatedByUserId","updatedAt"=CURRENT_TIMESTAMP`,supplierKey,supplierTaxId,profile.supplierName,normName(profile.supplierName),profileVersion,JSON.stringify(profile),userId);
    return {supplierKey,profileVersion,profile};
  });
  res.json({ok:true,...saved,onlyTargetSupplierUpdated:true});
}catch(error){next(error)}});
router.put("/invoice-learning/supplier-profile/column-map",async(req,res,next)=>{try{
  const body=req.body&&typeof req.body==="object"?req.body:{},supplierTaxId=cleanTaxId(body.supplierTaxId),supplierName=String(body.supplierName||"").trim(),columns=body.columns&&typeof body.columns==="object"&&!Array.isArray(body.columns)?body.columns:null;
  if(!supplierTaxId&&!supplierName)return res.status(400).json({error:"Συμπλήρωσε προμηθευτή ή ΑΦΜ."});
  if(!columns)return res.status(400).json({error:"Λείπει ο χάρτης στηλών."});
  const normalizedColumns={};for(let n=1;n<=12;n++){const role=String(columns[n]||columns[String(n)]||"IGNORE");if(!COLUMN_MAP_ROLES.has(role))return res.status(400).json({error:`Μη έγκυρος ρόλος στη στήλη ${n}.`});normalizedColumns[n]=role}
  const used=Object.values(normalizedColumns).filter(role=>role!=="IGNORE");
  if(new Set(used).size!==used.length)return res.status(400).json({error:"Κάθε πεδίο μπορεί να αντιστοιχιστεί μόνο σε μία στήλη."});
  for(const role of ["SUPPLIER_CODE","DESCRIPTION","QUANTITY","UNIT_PRICE"])if(!used.includes(role))return res.status(400).json({error:"Χρειάζονται κωδικός, περιγραφή, ποσότητα και τιμή μονάδας."});
  const normalizedName=normName(supplierName),requestedSupplierKey=supplierTaxId||normalizedName,userId=String(req.user?.id||req.user?.userId||req.user?.sub||"")||null;
  let saved;
  await prisma.$transaction(async tx=>{
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`invoice-profile:${requestedSupplierKey}`}))`;
    const rows=await tx.$queryRawUnsafe(`SELECT "supplierKey","profileVersion","profile","commercialFamily","distributorName" FROM "InvoiceSupplierReadingProfile" WHERE ("supplierKey"=$1 OR ($2<>'' AND "supplierTaxId"=$2)) LIMIT 1`,requestedSupplierKey,supplierTaxId);
    const existing=rows?.[0]||{},supplierKey=existing.supplierKey||requestedSupplierKey,profileVersion=Math.max(1,Number(existing.profileVersion||0)+1),previous=existing.profile&&typeof existing.profile==="object"?existing.profile:{};
    const readingRule={...(previous.readingRule||{}),layoutMode:"DECLARED_COLUMNS",columns:normalizedColumns,defaultUnit:used.includes("UNIT")?null:"ΤΜΧ",quantityMode:"LINE_TOTAL_MATCH"};
    const profile={...previous,supplierName:supplierName||previous.supplierName||"",supplierTaxId:supplierTaxId||previous.supplierTaxId||"",central:true,profileVersion,ruleKey:"DECLARED_COLUMNS",readingRule,columnMap:{...(previous.columnMap||{}),columns:normalizedColumns},ruleDescription:"Χειροκίνητος χάρτης στηλών με μαθηματικό έλεγχο της τρέχουσας γραμμής."};
    await tx.$executeRawUnsafe(`INSERT INTO "InvoiceSupplierReadingProfile" ("supplierKey","supplierTaxId","supplierName","commercialFamily","distributorName","normalizedName","ruleKey","profileVersion","profile","isActive","updatedByUserId","updatedAt") VALUES ($1,$2,$3,$4,$5,$6,'DECLARED_COLUMNS',$7,$8::jsonb,TRUE,$9,CURRENT_TIMESTAMP) ON CONFLICT ("supplierKey") DO UPDATE SET "supplierTaxId"=EXCLUDED."supplierTaxId","supplierName"=EXCLUDED."supplierName","normalizedName"=EXCLUDED."normalizedName","ruleKey"=EXCLUDED."ruleKey","profileVersion"=EXCLUDED."profileVersion","profile"=EXCLUDED."profile","isActive"=TRUE,"updatedByUserId"=EXCLUDED."updatedByUserId","updatedAt"=CURRENT_TIMESTAMP`,supplierKey,supplierTaxId||null,supplierName||previous.supplierName||null,existing.commercialFamily||null,existing.distributorName||null,normalizedName||normName(previous.supplierName||""),profileVersion,JSON.stringify(profile),userId);
    saved={supplierKey,profileVersion};
  });
  res.json({ok:true,...saved,onlyTargetSupplierUpdated:true,existingLearningPreserved:true});
}catch(error){next(error)}});
router.put("/invoice-learning/workspace",async(req,res,next)=>{try{const state=req.body?.state;if(!state||typeof state!=="object"||Array.isArray(state))return res.status(400).json({error:"Μη έγκυρη κατάσταση Invoice Learning Lab."});const normalized={documents:Array.isArray(state.documents)?state.documents:[],profiles:state.profiles&&typeof state.profiles==="object"&&!Array.isArray(state.profiles)?state.profiles:{},master:Array.isArray(state.master)?state.master:[]},json=JSON.stringify(normalized);if(Buffer.byteLength(json,"utf8")>8*1024*1024)return res.status(413).json({error:"Τα δεδομένα του Learning Lab είναι πολύ μεγάλα για συγχρονισμό."});const userId=String(req.user?.id||req.user?.userId||req.user?.sub||"")||null;await prisma.$executeRawUnsafe(`INSERT INTO "InvoiceLearningWorkspaceState" ("scopeKey","state","updatedByUserId","updatedAt") VALUES ($1,$2::jsonb,$3,CURRENT_TIMESTAMP) ON CONFLICT ("scopeKey") DO UPDATE SET "state"=EXCLUDED."state","updatedByUserId"=EXCLUDED."updatedByUserId","updatedAt"=CURRENT_TIMESTAMP`,SCOPE,json,userId);const syncProfiles=req.body?.syncProfiles!==false;if(syncProfiles)await upsertSupplierProfiles(normalized.profiles,userId);res.json({ok:true,documents:normalized.documents.length,profiles:Object.keys(normalized.profiles).length,centralSupplierProfiles:syncProfiles?Object.keys(normalized.profiles).length:0,profilesSynced:syncProfiles,updatedAt:new Date().toISOString()})}catch(error){next(error)}});
router.get("/invoice-learning/supplier-profiles",async(req,res,next)=>{try{const rows=await prisma.$queryRawUnsafe(`SELECT "supplierKey","supplierTaxId","supplierName","commercialFamily","distributorName","ruleKey","profileVersion","profile","updatedAt" FROM "InvoiceSupplierReadingProfile" WHERE "isActive"=TRUE ORDER BY "supplierName" NULLS LAST,"updatedAt" DESC`);res.json({ok:true,profiles:rows.map(r=>({supplierKey:r.supplierKey,supplierTaxId:r.supplierTaxId,supplierName:r.supplierName,commercialFamily:r.commercialFamily,distributorName:r.distributorName,ruleKey:r.ruleKey,profileVersion:r.profileVersion,...(r.profile||{}),updatedAt:r.updatedAt}))})}catch(error){next(error)}});
export default router;
