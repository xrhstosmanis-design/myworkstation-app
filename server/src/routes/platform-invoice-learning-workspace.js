import {Router} from "express";
import {prisma} from "../prisma.js";
import {requireCompanyModule} from "../middleware/module-access.js";
import {COFFEE_UNION_PROFILE} from "../lib/invoice-learning-coffee-union-seed.js";
import {PREMIUM_BAKERY_PROFILE} from "../lib/invoice-learning-premium-bakery-seed.js";
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

export async function ensureInvoiceLearningWorkspaceSchema(){
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "InvoiceLearningWorkspaceState" ("scopeKey" TEXT PRIMARY KEY,"state" JSONB NOT NULL DEFAULT '{"documents":[],"profiles":{},"master":[]}'::jsonb,"updatedByUserId" TEXT,"updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP)`);
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "InvoiceSupplierReadingProfile" ("supplierKey" TEXT PRIMARY KEY,"supplierTaxId" TEXT,"supplierName" TEXT,"normalizedName" TEXT,"ruleKey" TEXT,"profileVersion" INTEGER NOT NULL DEFAULT 1,"profile" JSONB NOT NULL DEFAULT '{}'::jsonb,"isActive" BOOLEAN NOT NULL DEFAULT TRUE,"updatedByUserId" TEXT,"updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP)`);
  await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "InvoiceSupplierReadingProfile_taxId_uq" ON "InvoiceSupplierReadingProfile" ("supplierTaxId") WHERE "supplierTaxId" IS NOT NULL AND "supplierTaxId"<>''`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "InvoiceSupplierReadingProfile_name_idx" ON "InvoiceSupplierReadingProfile" ("normalizedName")`);
  const seedProfiles=[[ALFA_SEED_KEY,ALFA_SEED_PROFILE],[ALFA_TASTY_KEY,ALFA_TASTY_PROFILE],[COFFEE_UNION_PROFILE.supplierTaxId||COFFEE_UNION_PROFILE.ruleKey,COFFEE_UNION_PROFILE],[PREMIUM_BAKERY_PROFILE.supplierTaxId||PREMIUM_BAKERY_PROFILE.ruleKey,PREMIUM_BAKERY_PROFILE]];
  for(const [key,p] of seedProfiles){const name=normName(p.supplierName),tax=cleanTaxId(p.supplierTaxId);await prisma.$executeRawUnsafe(`INSERT INTO "InvoiceSupplierReadingProfile" ("supplierKey","supplierTaxId","supplierName","normalizedName","ruleKey","profileVersion","profile","isActive","updatedAt") VALUES ($1,$2,$3,$4,$5,1,$6::jsonb,TRUE,CURRENT_TIMESTAMP) ON CONFLICT ("supplierKey") DO UPDATE SET "supplierTaxId"=COALESCE(EXCLUDED."supplierTaxId","InvoiceSupplierReadingProfile"."supplierTaxId"),"supplierName"=EXCLUDED."supplierName","normalizedName"=EXCLUDED."normalizedName","profile"=COALESCE("InvoiceSupplierReadingProfile"."profile",'{}'::jsonb) || EXCLUDED."profile","ruleKey"=EXCLUDED."ruleKey","isActive"=TRUE,"updatedAt"=CURRENT_TIMESTAMP`,key,tax||null,p.supplierName,name,p.ruleKey,JSON.stringify(p));}
  await syncProductKnowledgeFromProfiles();
  console.log("Invoice Learning central supplier profiles + product knowledge ready.");
}

async function upsertSupplierProfiles(profiles,userId=null){
  for(const [fallbackKey,p0] of Object.entries(profiles||{})){
    const p=p0&&typeof p0==="object"?p0:{};
    const taxId=cleanTaxId(p.supplierTaxId||(/^\d{9}$/.test(String(fallbackKey))?fallbackKey:""));
    const supplierName=String(p.supplierName||"").trim();
    if(!taxId&&!supplierName)continue;
    const normalizedName=normName(supplierName),supplierKey=taxId||normalizedName||String(fallbackKey);
    const existing=await prisma.$queryRawUnsafe(`SELECT "profileVersion" FROM "InvoiceSupplierReadingProfile" WHERE "supplierKey"=$1 LIMIT 1`,supplierKey);
    const version=Math.max(1,Number(existing?.[0]?.profileVersion||0)+1),builtInRule=taxId==="094095506"?"IFANTIS_FOOD_GROUP":null,ruleKey=String(p.ruleKey||p.readingRuleKey||builtInRule||"")||null,profile={...p,supplierName,supplierTaxId:taxId,ruleKey,central:true,profileVersion:version};
    await prisma.$executeRawUnsafe(`INSERT INTO "InvoiceSupplierReadingProfile" ("supplierKey","supplierTaxId","supplierName","normalizedName","ruleKey","profileVersion","profile","isActive","updatedByUserId","updatedAt") VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,TRUE,$8,CURRENT_TIMESTAMP) ON CONFLICT ("supplierKey") DO UPDATE SET "supplierTaxId"=EXCLUDED."supplierTaxId","supplierName"=EXCLUDED."supplierName","normalizedName"=EXCLUDED."normalizedName","ruleKey"=EXCLUDED."ruleKey","profileVersion"=EXCLUDED."profileVersion","profile"=EXCLUDED."profile","isActive"=TRUE,"updatedByUserId"=EXCLUDED."updatedByUserId","updatedAt"=CURRENT_TIMESTAMP`,supplierKey,taxId||null,supplierName||null,normalizedName||null,ruleKey,version,JSON.stringify(profile),userId);
  }
  await syncProductKnowledgeFromProfiles();
}

router.get("/invoice-learning/supplier-profile/resolve",requireCompanyModule("AI_READER"),async(req,res,next)=>{try{
  if(!isAuthenticated(req))return res.status(401).json({error:"Απαιτείται σύνδεση."});
  const taxId=cleanTaxId(req.query?.taxId),normalizedName=normName(req.query?.name);if(!taxId&&!normalizedName)return res.status(400).json({error:"Δώσε ΑΦΜ ή επωνυμία προμηθευτή."});let rows=[];
  if(taxId)rows=await prisma.$queryRawUnsafe(`SELECT "supplierKey","supplierTaxId","supplierName","ruleKey","profileVersion","profile","updatedAt" FROM "InvoiceSupplierReadingProfile" WHERE "supplierTaxId"=$1 AND "isActive"=TRUE LIMIT 1`,taxId);
  if(!rows?.length&&normalizedName)rows=await prisma.$queryRawUnsafe(`SELECT "supplierKey","supplierTaxId","supplierName","ruleKey","profileVersion","profile","updatedAt" FROM "InvoiceSupplierReadingProfile" WHERE ("normalizedName"=$1 OR $1 LIKE '%'||"normalizedName"||'%' OR "normalizedName" LIKE '%'||$1||'%') AND "isActive"=TRUE ORDER BY "updatedAt" DESC LIMIT 1`,normalizedName);
  const row=rows?.[0];if(!row)return res.json({ok:true,found:false,profile:null});res.json({ok:true,found:true,profile:{supplierKey:row.supplierKey,supplierTaxId:row.supplierTaxId,supplierName:row.supplierName,ruleKey:row.ruleKey,profileVersion:row.profileVersion,...(row.profile||{}),updatedAt:row.updatedAt}});
}catch(error){next(error)}});

router.use((req,res,next)=>{if(!isSuper(req))return res.status(403).json({error:"Απαιτείται πρόσβαση Platform Super Admin."});next()});

router.get("/invoice-learning/product-knowledge",async(req,res,next)=>{try{
  await syncProductKnowledgeFromProfiles();
  const rows=await prisma.$queryRawUnsafe(`SELECT "id","supplierKey","supplierTaxId","supplierName","supplierItemCode","description","barcode","barcodeStatus","masterProductId","masterProductName","invoiceUnit","stockUnit","unitsPerPackage","conversionFactor","vatRate","knowledge","verified","updatedAt" FROM "InvoiceLearningProductKnowledge" ORDER BY CASE WHEN COALESCE("barcode",'')='' THEN 0 ELSE 1 END,"supplierName" NULLS LAST,"description"`);
  res.json({ok:true,products:rows});
}catch(error){next(error)}});

router.put("/invoice-learning/product-knowledge/:id/barcode",async(req,res,next)=>{try{
  const id=String(req.params?.id||"").trim(),barcode=String(req.body?.barcode||"").replace(/\D/g,"");
  if(!id)return res.status(400).json({error:"Λείπει το προϊόν Learning."});
  if(barcode.length<8||barcode.length>14)return res.status(400).json({error:"Το barcode πρέπει να έχει 8 έως 14 ψηφία."});
  const rows=await prisma.$queryRawUnsafe(`UPDATE "InvoiceLearningProductKnowledge" SET "barcode"=$1,"barcodeStatus"='KNOWN',"knowledge"=COALESCE("knowledge",'{}'::jsonb)||$2::jsonb,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=$3 RETURNING "id","supplierKey","supplierTaxId","supplierName","supplierItemCode","description","barcode","barcodeStatus","masterProductId","masterProductName","invoiceUnit","stockUnit","unitsPerPackage","conversionFactor","vatRate","knowledge","verified","updatedAt"`,barcode,JSON.stringify({barcodeSource:"MANUAL_CONFIRMED",barcodeConfirmedAt:new Date().toISOString()}),id);
  if(!rows?.length)return res.status(404).json({error:"Δεν βρέθηκε το προϊόν στο κεντρικό Learning."});
  res.json({ok:true,product:rows[0]});
}catch(error){next(error)}});

router.get("/invoice-learning/workspace",async(req,res,next)=>{try{const rows=await prisma.$queryRawUnsafe(`SELECT "state","updatedAt" FROM "InvoiceLearningWorkspaceState" WHERE "scopeKey"=$1 LIMIT 1`,SCOPE),row=rows?.[0];res.json({ok:true,state:row?.state||{documents:[],profiles:{},master:[]},updatedAt:row?.updatedAt||null})}catch(error){next(error)}});
router.put("/invoice-learning/workspace",async(req,res,next)=>{try{const state=req.body?.state;if(!state||typeof state!=="object"||Array.isArray(state))return res.status(400).json({error:"Μη έγκυρη κατάσταση Invoice Learning Lab."});const normalized={documents:Array.isArray(state.documents)?state.documents:[],profiles:state.profiles&&typeof state.profiles==="object"&&!Array.isArray(state.profiles)?state.profiles:{},master:Array.isArray(state.master)?state.master:[]},json=JSON.stringify(normalized);if(Buffer.byteLength(json,"utf8")>8*1024*1024)return res.status(413).json({error:"Τα δεδομένα του Learning Lab είναι πολύ μεγάλα για συγχρονισμό."});const userId=String(req.user?.id||req.user?.userId||req.user?.sub||"")||null;await prisma.$executeRawUnsafe(`INSERT INTO "InvoiceLearningWorkspaceState" ("scopeKey","state","updatedByUserId","updatedAt") VALUES ($1,$2::jsonb,$3,CURRENT_TIMESTAMP) ON CONFLICT ("scopeKey") DO UPDATE SET "state"=EXCLUDED."state","updatedByUserId"=EXCLUDED."updatedByUserId","updatedAt"=CURRENT_TIMESTAMP`,SCOPE,json,userId);await upsertSupplierProfiles(normalized.profiles,userId);res.json({ok:true,documents:normalized.documents.length,profiles:Object.keys(normalized.profiles).length,centralSupplierProfiles:Object.keys(normalized.profiles).length,updatedAt:new Date().toISOString()})}catch(error){next(error)}});
router.get("/invoice-learning/supplier-profiles",async(req,res,next)=>{try{const rows=await prisma.$queryRawUnsafe(`SELECT "supplierKey","supplierTaxId","supplierName","ruleKey","profileVersion","profile","updatedAt" FROM "InvoiceSupplierReadingProfile" WHERE "isActive"=TRUE ORDER BY "supplierName" NULLS LAST,"updatedAt" DESC`);res.json({ok:true,profiles:rows.map(r=>({supplierKey:r.supplierKey,supplierTaxId:r.supplierTaxId,supplierName:r.supplierName,ruleKey:r.ruleKey,profileVersion:r.profileVersion,...(r.profile||{}),updatedAt:r.updatedAt}))})}catch(error){next(error)}});
export default router;
