import {Router} from "express";
import {z} from "zod";
import {prisma} from "../prisma.js";
import {auth} from "../middleware/auth.js";
import {AUDIENCE_KEYS, normalizeAudienceSettings} from "../../../shared/pos-audience-settings.mjs";
import {DAILY_BITE_PRESET,dailyBiteNameKey} from "../daily-bite-pos-preset.js";

const router=Router();
router.use(auth);
router.use((req,res,next)=>{
  const allowed=req.user?.isSuperAdmin===true||req.user?.platformRole==="SUPER_ADMIN";
  if(!allowed)return res.status(403).json({error:"Απαιτείται πρόσβαση Platform Super Admin."});
  next();
});

const QUICK_COUNT=20;
const CATEGORY_COUNT=14;
const MAX_CATEGORY_PRODUCTS=40;
const audienceSettingsSchema=z.object({enabled:z.boolean(),labels:z.object(Object.fromEntries(AUDIENCE_KEYS.map(key=>[key,z.string().trim().min(1).max(60)]))).strict()}).strict();
router.get("/audience-settings/:storeId",async(req,res,next)=>{
  try{
    const store=await prisma.store.findUnique({where:{id:String(req.params.storeId)},select:{id:true,companyId:true,active:true}});
    if(!store?.active)return res.status(404).json({error:"Το κατάστημα δεν βρέθηκε."});
    const rows=await prisma.$queryRaw`SELECT "layoutJson"->'audienceSettings' AS "settings" FROM "StorePosLayout" WHERE "storeId"=${store.id} AND "companyId"=${store.companyId} LIMIT 1`;
    if(!rows.length)return res.status(404).json({error:"Δημοσίευσε πρώτα τη διάταξη POS του καταστήματος."});
    res.json({storeId:store.id,settings:normalizeAudienceSettings(rows[0].settings)});
  }catch(error){next(error)}
});
router.put("/audience-settings/:storeId",async(req,res,next)=>{
  try{
    const settings=audienceSettingsSchema.parse(req.body||{});
    const store=await prisma.store.findUnique({where:{id:String(req.params.storeId)},select:{id:true,companyId:true,active:true}});
    if(!store?.active)return res.status(404).json({error:"Το κατάστημα δεν βρέθηκε."});
    const rows=await prisma.$queryRaw`UPDATE "StorePosLayout" SET "layoutJson"=jsonb_set(COALESCE("layoutJson",'{}'::jsonb),'{audienceSettings}',${JSON.stringify(settings)}::jsonb,true),"version"="version"+1,"publishedBy"=${req.user.id},"publishedAt"=CURRENT_TIMESTAMP WHERE "storeId"=${store.id} AND "companyId"=${store.companyId} RETURNING "version"`;
    if(!rows.length)return res.status(404).json({error:"Δημοσίευσε πρώτα τη διάταξη POS του καταστήματος."});
    res.json({ok:true,storeId:store.id,settings,version:Number(rows[0].version)});
  }catch(error){if(error?.name==="ZodError")return res.status(400).json({error:"Συμπλήρωσε κάθε ονομασία δικαιούχου με 1–60 χαρακτήρες."});next(error)}
});
const palette=["#1597a5","#287e9e","#4f8fbe","#dc7a27","#3978b8","#9aa82f","#9a5353","#76558e"];

const fixedButtons=[
  {id:"cancel",label:"ΑΚΥΡΩΣΗ",action:"CLEAR_CART",color:"#ef4444",visible:true},
  {id:"hold",label:"ΑΝΑΜΟΝΗ",action:"HOLD",color:"#edf2f1",visible:true},
  {id:"payments",label:"ΠΛΗΡΩΜΕΣ",action:"PAYMENTS",color:"#edf2f1",visible:true},
  {id:"preparation",label:"ΠΑΡΑΣΚΕΥΗ",action:"PRINT",color:"#edf2f1",visible:true},
  {id:"waste",label:"Κλείσιμο χωρίς Εκτύπωση",action:"WASTE",color:"#edf2f1",visible:true},
  {id:"mixed",label:"ΜΙΚΤΗ",action:"MIXED",color:"#7c3aed",visible:true},
  {id:"card",label:"ΚΑΡΤΑ",action:"CARD",color:"#3378cf",visible:true},
  {id:"cash",label:"ΜΕΤΡΗΤΑ",action:"CASH",color:"#0b8f5a",visible:true}
];

const colorSchema=z.string().regex(/^#[0-9a-fA-F]{6}$/);
const quickSchema=z.object({id:z.string().min(1).max(60),label:z.string().max(80),productQuery:z.string().max(160).default(""),productCodes:z.array(z.string().min(1).max(160)).max(1).default([]),color:colorSchema,visible:z.boolean().default(true)});
const categorySchema=z.object({id:z.string().min(1).max(60),label:z.string().max(80),categoryName:z.string().max(120).default(""),productCodes:z.array(z.string().min(1).max(160)).max(MAX_CATEGORY_PRODUCTS).default([]),color:colorSchema,visible:z.boolean().default(true)});
const layoutSchema=z.object({catalogCompanyId:z.string().min(1).max(120).nullable().optional(),title:z.string().trim().min(1).max(80).default("OPERATOR POS"),productColumns:z.coerce.number().int().min(4).max(8).default(6),showSku:z.boolean().default(true),buttonFontScale:z.coerce.number().min(.8).max(1.7).default(1),theme:z.object({headerColor:colorSchema,accentColor:colorSchema,surfaceColor:colorSchema}).default({headerColor:"#033d2f",accentColor:"#087a52",surfaceColor:"#ffffff"}),quickKeys:z.array(quickSchema).max(QUICK_COUNT),categories:z.array(categorySchema).max(CATEGORY_COUNT),buttons:z.array(z.any()).optional().default([])});

const blankQuick=index=>({id:`quick-fixed-${index+1}`,label:"ΚΕΝΟ",productQuery:"",productCodes:[],color:palette[index%palette.length],visible:true});
const blankCategory=index=>({id:`category-fixed-${index+1}`,label:`ΚΑΤΗΓΟΡΙΑ ${index+1}`,categoryName:`ΚΑΤΗΓΟΡΙΑ ${index+1}`,productCodes:[],color:palette[index%palette.length],visible:true});
function stripLegacyMeta(value){return String(value||"").split("::MWSMETA::")[0].split("::MWSFONT::")[0]}
function legacyCodes(value){const raw=String(value||"");const meta=raw.split("::MWSMETA::")[1]||"";return meta.split(",").filter(Boolean).map(code=>{try{return decodeURIComponent(code)}catch{return code}})}
function uniqueCodes(values,max){return [...new Set((values||[]).map(v=>String(v).trim()).filter(Boolean))].slice(0,max)}
function normalizeLayout(input={}){
  const source=input&&typeof input==="object"?input:{};
  const quickSource=Array.isArray(source.quickKeys)?source.quickKeys:[];
  const categorySource=Array.isArray(source.categories)?source.categories:[];
  const quickKeys=Array.from({length:QUICK_COUNT},(_,index)=>{const old=quickSource[index]||{};const productQuery=stripLegacyMeta(old.productQuery||"");const code=String(old.productCodes?.[0]||productQuery||"").trim();return {...blankQuick(index),...old,id:`quick-fixed-${index+1}`,productQuery:code,productCodes:code?[code]:[],label:String(code?(old.label||code):"ΚΕΝΟ").trim(),visible:true,color:old.color||palette[index%palette.length]}});
  const categories=Array.from({length:CATEGORY_COUNT},(_,index)=>{const old=categorySource[index]||{};const categoryName=stripLegacyMeta(old.categoryName||old.label||`ΚΑΤΗΓΟΡΙΑ ${index+1}`);const codes=uniqueCodes((Array.isArray(old.productCodes)&&old.productCodes.length?old.productCodes:legacyCodes(old.categoryName)),MAX_CATEGORY_PRODUCTS);return {...blankCategory(index),...old,id:`category-fixed-${index+1}`,label:String(old.label||categoryName||`ΚΑΤΗΓΟΡΙΑ ${index+1}`).trim(),categoryName:String(categoryName||`ΚΑΤΗΓΟΡΙΑ ${index+1}`).trim(),productCodes:codes,visible:true,color:old.color||palette[index%palette.length]}});
  const title=stripLegacyMeta(source.title||"OPERATOR POS");const legacyFont=String(source.title||"").includes("::MWSFONT::")?Number(String(source.title).split("::MWSFONT::").pop()):null;
  return {catalogCompanyId:source.catalogCompanyId||null,title,productColumns:Number(source.productColumns||6),showSku:source.showSku!==false,buttonFontScale:Number(source.buttonFontScale||legacyFont||1),theme:{headerColor:"#033d2f",accentColor:"#087a52",surfaceColor:"#ffffff",...(source.theme||{})},quickKeys,categories,buttons:fixedButtons};
}
router.get("/",async(req,res,next)=>{try{const drafts=await prisma.$queryRaw`SELECT "layoutJson","version","updatedAt" FROM "PlatformPosDraft" WHERE "id"='GLOBAL' LIMIT 1`;const companies=await prisma.company.findMany({select:{id:true,name:true,stores:{where:{active:true},select:{id:true,name:true,city:true},orderBy:{name:"asc"}}},orderBy:{name:"asc"}});const published=await prisma.$queryRaw`SELECT "storeId","version","publishedAt" FROM "StorePosLayout"`;res.json({draft:normalizeLayout(drafts[0]?.layoutJson||{}),draftVersion:Number(drafts[0]?.version||0),updatedAt:drafts[0]?.updatedAt||null,companies,published,limits:{quickKeys:QUICK_COUNT,categories:CATEGORY_COUNT,productsPerCategory:MAX_CATEGORY_PRODUCTS}})}catch(error){next(error)}});
router.put("/draft",async(req,res,next)=>{try{const incoming=layoutSchema.parse(req.body||{});const layout=normalizeLayout(incoming);await validateCompanyLayout(layout);const rows=await prisma.$queryRaw`INSERT INTO "PlatformPosDraft" ("id","layoutJson","version","updatedBy","updatedAt") VALUES ('GLOBAL',${JSON.stringify(layout)}::jsonb,1,${req.user.id},CURRENT_TIMESTAMP) ON CONFLICT ("id") DO UPDATE SET "layoutJson"=EXCLUDED."layoutJson","version"="PlatformPosDraft"."version"+1,"updatedBy"=EXCLUDED."updatedBy","updatedAt"=CURRENT_TIMESTAMP RETURNING "version","updatedAt","layoutJson"`;res.json({ok:true,draftVersion:Number(rows[0].version),updatedAt:rows[0].updatedAt,draft:normalizeLayout(rows[0].layoutJson)})}catch(error){next(error)}});
router.post("/publish",async(req,res,next)=>{try{const body=z.object({storeIds:z.array(z.string()).min(1).max(1000)}).parse(req.body||{});const storeIds=[...new Set(body.storeIds)];const stores=await prisma.store.findMany({where:{id:{in:storeIds},active:true},select:{id:true,companyId:true}});if(stores.length!==storeIds.length)return res.status(404).json({error:"Ένα ή περισσότερα καταστήματα δεν βρέθηκαν."});const drafts=await prisma.$queryRaw`SELECT "layoutJson" FROM "PlatformPosDraft" WHERE "id"='GLOBAL' LIMIT 1`;const layout=normalizeLayout(drafts[0]?.layoutJson||{});await validateCompanyLayout(layout,stores);await prisma.$transaction(async tx=>{for(const store of stores)await tx.$executeRaw`INSERT INTO "StorePosLayout" ("storeId","companyId","layoutJson","version","publishedBy","publishedAt") VALUES (${store.id},${store.companyId},${JSON.stringify(layout)}::jsonb,1,${req.user.id},CURRENT_TIMESTAMP) ON CONFLICT ("storeId") DO UPDATE SET "layoutJson"=EXCLUDED."layoutJson" || jsonb_build_object('audienceSettings',COALESCE("StorePosLayout"."layoutJson"->'audienceSettings','{}'::jsonb)),"version"="StorePosLayout"."version"+1,"publishedBy"=EXCLUDED."publishedBy","publishedAt"=CURRENT_TIMESTAMP`});res.json({ok:true,publishedStores:stores.length})}catch(error){next(error)}});

router.get("/store/:storeId",async(req,res,next)=>{try{const store=await prisma.store.findUnique({where:{id:String(req.params.storeId)},select:{id:true,name:true,companyId:true,active:true}});if(!store||!store.active)return res.status(404).json({error:"Το κατάστημα δεν βρέθηκε."});const rows=await prisma.$queryRaw`SELECT "layoutJson","version","publishedAt" FROM "StorePosLayout" WHERE "storeId"=${store.id} LIMIT 1`;if(!rows[0])return res.status(404).json({error:"Το κατάστημα δεν έχει δημοσιευμένη διάταξη."});res.json({store,version:Number(rows[0].version||0),publishedAt:rows[0].publishedAt,layout:normalizeLayout(rows[0].layoutJson||{})})}catch(error){next(error)}});
router.post("/clone",async(req,res,next)=>{try{const body=z.object({sourceStoreId:z.string().min(1),targetStoreIds:z.array(z.string().min(1)).min(1).max(1000)}).parse(req.body||{});const targetIds=[...new Set(body.targetStoreIds)];const [source,targets]=await Promise.all([prisma.store.findUnique({where:{id:body.sourceStoreId},select:{id:true,active:true}}),prisma.store.findMany({where:{id:{in:targetIds},active:true},select:{id:true,companyId:true}})]);if(!source?.active)return res.status(404).json({error:"Το πρότυπο δεν βρέθηκε."});if(targets.length!==targetIds.length)return res.status(404).json({error:"Ένα ή περισσότερα καταστήματα δεν βρέθηκαν."});const rows=await prisma.$queryRaw`SELECT "layoutJson","version" FROM "StorePosLayout" WHERE "storeId"=${source.id} LIMIT 1`;if(!rows[0])return res.status(404).json({error:"Το πρότυπο δεν έχει δημοσιευμένη διάταξη."});const layout=normalizeLayout(rows[0].layoutJson||{});await validateCompanyLayout(layout,targets);await prisma.$transaction(async tx=>{for(const store of targets)await tx.$executeRaw`INSERT INTO "StorePosLayout" ("storeId","companyId","layoutJson","version","publishedBy","publishedAt") VALUES (${store.id},${store.companyId},${JSON.stringify(layout)}::jsonb,1,${req.user.id},CURRENT_TIMESTAMP) ON CONFLICT ("storeId") DO UPDATE SET "layoutJson"=EXCLUDED."layoutJson" || jsonb_build_object('audienceSettings',COALESCE("StorePosLayout"."layoutJson"->'audienceSettings','{}'::jsonb)),"version"="StorePosLayout"."version"+1,"publishedBy"=EXCLUDED."publishedBy","publishedAt"=CURRENT_TIMESTAMP`});res.json({ok:true,sourceStoreId:source.id,clonedStores:targets.length,sourceVersion:Number(rows[0].version||0)})}catch(error){next(error)}});
router.get("/products",async(req,res,next)=>{try{const raw=String(req.query.codes||"").trim();const codes=uniqueCodes(raw.split(",").map(code=>{try{return decodeURIComponent(code)}catch{return code}}),MAX_CATEGORY_PRODUCTS);if(!codes.length)return res.json({rows:[]});const rows=await prisma.$queryRaw`SELECT p."id",p."sourceCode",p."name",p."categoryName",p."subcategoryName",p."defaultRetailPrice",COALESCE(array_agg(b."barcode") FILTER (WHERE b."barcode" IS NOT NULL),'{}') AS "barcodes" FROM "MasterProduct" p LEFT JOIN "MasterProductBarcode" b ON b."masterProductId"=p."id" WHERE p."sourceCode" = ANY(${codes}::text[]) GROUP BY p."id",p."sourceCode",p."name",p."categoryName",p."subcategoryName",p."defaultRetailPrice" ORDER BY array_position(${codes}::text[],p."sourceCode")`;res.json({rows:rows.map(row=>({...row,defaultRetailPrice:row.defaultRetailPrice===null?null:Number(row.defaultRetailPrice)}))})}catch(error){next(error)}});

function assignedIds(layout){return [...new Set([...layout.quickKeys.flatMap(x=>x.productCodes||[]),...layout.categories.flatMap(x=>x.productCodes||[])])]}
async function validateCompanyLayout(layout,stores=[]){
 if(!layout.catalogCompanyId)return;
 if(stores.some(store=>store.companyId!==layout.catalogCompanyId))throw Object.assign(new Error("Η διάταξη χρησιμοποιεί προϊόντα άλλης εταιρείας."),{status:400,statusCode:400});
 const ids=assignedIds(layout);
 const rows=ids.length?await prisma.$queryRaw`SELECT "id" FROM "Product" WHERE "companyId"=${layout.catalogCompanyId} AND "active"=true AND "id"=ANY(${ids}::text[])`:[];
 if(rows.length!==ids.length)throw Object.assign(new Error("Υπάρχουν προϊόντα που δεν ανήκουν στον ενεργό κατάλογο της εταιρείας."),{status:400,statusCode:400});
}
router.get("/company-products",async(req,res,next)=>{try{
 const body=z.object({companyId:z.string().min(1).max(120),q:z.string().max(160).optional(),codes:z.string().max(8000).optional()}).parse(req.query);
 const ids=uniqueCodes((body.codes||"").split(","),40),q=(body.q||"").trim();
 if(!q&&!ids.length)return res.json({rows:[]});
 const rows=await prisma.$queryRaw`SELECT p."id",p."id" AS "sourceCode",p."sku" AS "displayCode",p."name",p."salePrice" AS "defaultRetailPrice",c."name" AS "categoryName",ARRAY[]::text[] AS "barcodes" FROM "Product" p LEFT JOIN "ProductCategory" c ON c."id"=p."categoryId" WHERE p."companyId"=${body.companyId} AND p."active"=true AND ((cardinality(${ids}::text[])>0 AND p."id"=ANY(${ids}::text[])) OR (${q}<>'' AND (p."name" ILIKE ${'%'+q+'%'} OR p."sku" ILIKE ${'%'+q+'%'} OR EXISTS(SELECT 1 FROM "ProductBarcode" b WHERE b."productId"=p."id" AND b."barcode"=${q})))) ORDER BY p."name",p."id" LIMIT 100`;
 res.json({rows});
}catch(error){next(error)}});

router.post("/prepare-daily-bite-layout",async(req,res,next)=>{try{
 const body=z.object({companyId:z.string().min(1).max(120)}).parse(req.body||{});
 const companies=await prisma.$queryRaw`SELECT "id","name" FROM "Company" WHERE "id"=${body.companyId} LIMIT 1`;
 const company=companies[0];
 if(!company||!dailyBiteNameKey(company.name).includes("DAILY BITE"))return res.status(400).json({error:"Η προετοιμασία αυτή επιτρέπεται μόνο για την εταιρεία DAILY BITE."});
 const rows=await prisma.$queryRaw`SELECT "id","name" FROM "Product" WHERE "companyId"=${body.companyId} AND "active"=true ORDER BY "name","id"`;
 const byKey=new Map();for(const row of rows){const key=dailyBiteNameKey(row.name);if(!byKey.has(key))byKey.set(key,[]);byKey.get(key).push(row)}
 const missing=[],ambiguous=[];
 const categories=DAILY_BITE_PRESET.map((group,index)=>{
   const ids=[];
   for(const wanted of group.products){const found=byKey.get(dailyBiteNameKey(wanted))||[];if(found.length===1)ids.push(found[0].id);else if(found.length===0)missing.push({category:group.label,name:wanted});else ambiguous.push({category:group.label,name:wanted,matches:found.map(x=>({id:x.id,name:x.name}))})}
   return {...blankCategory(index),label:group.label,categoryName:group.label,productCodes:uniqueCodes(ids,MAX_CATEGORY_PRODUCTS),color:index%2===0?"#dfeee9":"#cfe5dc"};
 });
 while(categories.length<CATEGORY_COUNT)categories.push({...blankCategory(categories.length),color:"#edf5f2"});
 const layout=normalizeLayout({catalogCompanyId:body.companyId,title:"DAILY BITE POS",productColumns:5,showSku:false,buttonFontScale:1.15,theme:{headerColor:"#033d2f",accentColor:"#087a52",surfaceColor:"#ffffff"},categories});
 res.json({layout,matchedProducts:categories.reduce((sum,row)=>sum+row.productCodes.length,0),missingProducts:missing,ambiguousProducts:ambiguous,source:"USER_SCREENSHOTS_2026-10-10"});
}catch(error){next(error)}});


router.get("/daily-bite-coffee-preview",async(req,res,next)=>{try{
 const companyId=String(req.query.companyId||"").trim();
 if(!companyId)return res.status(400).json({error:"Επίλεξε εταιρεία DAILY BITE."});
 const company=(await prisma.$queryRaw`SELECT "id","name" FROM "Company" WHERE "id"=${companyId} LIMIT 1`)[0];
 if(!company||!dailyBiteNameKey(company.name).includes("DAILY BITE"))return res.status(400).json({error:"Ο έλεγχος καφέ επιτρέπεται μόνο για DAILY BITE."});
 const katStore=(await prisma.$queryRaw`SELECT s."id",s."companyId",s."name" FROM "Store" s WHERE s."active"=true AND (UPPER(s."name") LIKE '%ΚΑΤ%' OR UPPER(s."name") LIKE '%KAT%') ORDER BY s."createdAt" LIMIT 1`)[0];
 if(!katStore)return res.status(409).json({error:"Δεν βρέθηκε ενεργό κατάστημα ΚΑΤ ως πρότυπο συμπεριφοράς."});
 const [katProducts,dailyProducts,katGroups,dailyGroups]=await Promise.all([
   prisma.$queryRaw`SELECT "id","sku","name" FROM "Product" WHERE "companyId"=${katStore.companyId} AND "active"=true AND "sku" LIKE 'MWS-KAT-BEV-%' ORDER BY "name","id"`,
   prisma.$queryRaw`SELECT "id","sku","name" FROM "Product" WHERE "companyId"=${companyId} AND "active"=true ORDER BY "name","id"`,
   prisma.$queryRaw`SELECT g."description",g."legacyId",m."sequence",m."description" AS "modifierDescription",m."price" FROM "ManagementModifierGroup" g LEFT JOIN "ManagementModifier" m ON m."groupId"=g."id" AND m."companyId"=g."companyId" AND m."active"=true WHERE g."companyId"=${katStore.companyId} AND g."active"=true ORDER BY COALESCE(g."legacyId",2147483647),g."description",m."sequence",m."description"`,
   prisma.$queryRaw`SELECT g."description",COUNT(m."id")::int AS "modifierCount" FROM "ManagementModifierGroup" g LEFT JOIN "ManagementModifier" m ON m."groupId"=g."id" AND m."companyId"=g."companyId" AND m."active"=true WHERE g."companyId"=${companyId} AND g."active"=true GROUP BY g."id",g."description" ORDER BY g."description"`
 ]);
 const sourceBySig=new Map();for(const row of katProducts){const sig=coffeeSignature(row.name);if(!sig)continue;if(!sourceBySig.has(sig))sourceBySig.set(sig,[]);sourceBySig.get(sig).push(row)}
 const targetBySig=new Map();for(const row of dailyProducts.filter(row=>coffeeLikeName(row.name))){const sig=coffeeSignature(row.name);if(!sig)continue;if(!targetBySig.has(sig))targetBySig.set(sig,[]);targetBySig.get(sig).push(row)}
 const signatures=[...new Set([...sourceBySig.keys(),...targetBySig.keys()])].sort();
 const matches=[],unresolved=[],ambiguous=[];
 for(const signature of signatures){
   const source=sourceBySig.get(signature)||[],target=targetBySig.get(signature)||[];
   if(source.length===1&&target.length===1){
     const src=source[0],dst=target[0];matches.push({signature,kat:{id:src.id,sku:src.sku,name:src.name},daily:{id:dst.id,sku:dst.sku,name:dst.name},renameSuggested:dailyBiteNameKey(src.name)!==dailyBiteNameKey(dst.name),suggestedName:src.name});
   }else if(source.length>1||target.length>1)ambiguous.push({signature,kat:source.map(x=>({id:x.id,sku:x.sku,name:x.name})),daily:target.map(x=>({id:x.id,sku:x.sku,name:x.name}))});
   else unresolved.push({signature,kat:source.map(x=>({id:x.id,sku:x.sku,name:x.name})),daily:target.map(x=>({id:x.id,sku:x.sku,name:x.name}))});
 }
 const grouped=new Map();for(const row of katGroups){if(!grouped.has(row.description))grouped.set(row.description,{description:row.description,legacyId:row.legacyId,items:[]});if(row.modifierDescription)grouped.get(row.description).items.push({sequence:Number(row.sequence||0),description:row.modifierDescription,price:Number(row.price||0)})}
 res.json({company:{id:company.id,name:company.name},katTemplate:{storeId:katStore.id,companyId:katStore.companyId,name:katStore.name},matched:matches,unresolved,ambiguous,katModifierGroups:[...grouped.values()],dailyModifierGroups:dailyGroups.map(x=>({description:x.description,modifierCount:Number(x.modifierCount||0)})),safeForBehaviorApply:matches.length>0&&ambiguous.length===0&&grouped.size>0,mutated:false});
}catch(error){next(error)}});


router.post("/daily-bite-coffee-apply",async(req,res,next)=>{try{
 const body=z.object({companyId:z.string().min(1).max(120),confirm:z.literal("DAILY_BITE_COFFEE"),renameProducts:z.boolean().default(true)}).parse(req.body||{});
 const company=(await prisma.$queryRaw`SELECT "id","name" FROM "Company" WHERE "id"=${body.companyId} LIMIT 1`)[0];
 if(!company||!dailyBiteNameKey(company.name).includes("DAILY BITE"))return res.status(400).json({error:"Η εφαρμογή καφέ επιτρέπεται μόνο για DAILY BITE."});
 const katStore=(await prisma.$queryRaw`SELECT s."id",s."companyId",s."name" FROM "Store" s WHERE s."active"=true AND (UPPER(s."name") LIKE '%ΚΑΤ%' OR UPPER(s."name") LIKE '%KAT%') ORDER BY s."createdAt" LIMIT 1`)[0];
 if(!katStore)return res.status(409).json({error:"Δεν βρέθηκε ενεργό κατάστημα ΚΑΤ ως πρότυπο συμπεριφοράς."});
 const [katProducts,dailyProducts]=await Promise.all([
   prisma.$queryRaw`SELECT "id","sku","name" FROM "Product" WHERE "companyId"=${katStore.companyId} AND "active"=true AND "sku" LIKE 'MWS-KAT-BEV-%' ORDER BY "name","id"`,
   prisma.$queryRaw`SELECT "id","sku","name" FROM "Product" WHERE "companyId"=${body.companyId} AND "active"=true ORDER BY "name","id"`
 ]);
 const sourceBySig=new Map();for(const row of katProducts){const sig=coffeeSignature(row.name);if(!sig)continue;if(!sourceBySig.has(sig))sourceBySig.set(sig,[]);sourceBySig.get(sig).push(row)}
 const targetBySig=new Map();for(const row of dailyProducts.filter(row=>coffeeLikeName(row.name))){const sig=coffeeSignature(row.name);if(!sig)continue;if(!targetBySig.has(sig))targetBySig.set(sig,[]);targetBySig.get(sig).push(row)}
 const signatures=[...new Set([...sourceBySig.keys(),...targetBySig.keys()])];
 const pairs=[],problems=[];
 for(const signature of signatures){const source=sourceBySig.get(signature)||[],target=targetBySig.get(signature)||[];if(source.length===1&&target.length===1)pairs.push({signature,kat:source[0],daily:target[0]});else if(source.length||target.length)problems.push({signature,katCount:source.length,dailyCount:target.length})}
 if(problems.length)return res.status(409).json({error:"Υπάρχουν αμφίσημες ή ελλιπείς αντιστοιχίσεις καφέ. Δεν έγινε καμία αλλαγή.",problems});
 if(!pairs.length)return res.status(409).json({error:"Δεν βρέθηκαν ασφαλείς αντιστοιχίσεις καφέ. Δεν έγινε καμία αλλαγή."});
 const katProductIds=pairs.map(x=>x.kat.id);
 const katLinks=await prisma.$queryRaw`
   SELECT pg."productId",pg."required",pg."minSelections",pg."maxSelections",pg."sequence",
          g."id" AS "groupId",g."legacyId",g."description" AS "groupDescription",
          m."id" AS "modifierId",m."sequence" AS "modifierSequence",m."description" AS "modifierDescription",m."price",m."costNet"
   FROM "PreparationProductModifierGroup" pg
   JOIN "ManagementModifierGroup" g ON g."id"=pg."groupId" AND g."companyId"=pg."companyId" AND g."active"=true
   LEFT JOIN "ManagementModifier" m ON m."groupId"=g."id" AND m."companyId"=g."companyId" AND m."active"=true
   WHERE pg."companyId"=${katStore.companyId} AND pg."productId"=ANY(${katProductIds}::text[])
   ORDER BY pg."productId",pg."sequence",g."description",m."sequence",m."description"`;
 const byKatProduct=new Map();for(const row of katLinks){if(!byKatProduct.has(row.productId))byKatProduct.set(row.productId,new Map());const groups=byKatProduct.get(row.productId);if(!groups.has(row.groupId))groups.set(row.groupId,{legacyId:row.legacyId,description:row.groupDescription,required:Boolean(row.required),minSelections:Number(row.minSelections||0),maxSelections:Number(row.maxSelections||1),sequence:Number(row.sequence||0),items:[]});if(row.modifierId)groups.get(row.groupId).items.push({sequence:Number(row.modifierSequence||0),description:row.modifierDescription,price:Number(row.price||0),costNet:Number(row.costNet||0)})}
 const result=await prisma.$transaction(async tx=>{
   const groupIds=new Map(),modifierCounts=new Map();
   const allGroups=new Map();for(const groups of byKatProduct.values())for(const group of groups.values())if(!allGroups.has(group.description))allGroups.set(group.description,group);
   for(const group of allGroups.values()){
     let existing=(await tx.$queryRaw`SELECT "id" FROM "ManagementModifierGroup" WHERE "companyId"=${body.companyId} AND LOWER("description")=LOWER(${group.description}) LIMIT 1`)[0];
     if(!existing){existing={id:crypto.randomUUID()};await tx.$executeRaw`INSERT INTO "ManagementModifierGroup" ("id","companyId","legacyId","description","active") VALUES (${existing.id},${body.companyId},${group.legacyId??null},${group.description},true)`}
     else await tx.$executeRaw`UPDATE "ManagementModifierGroup" SET "active"=true,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${existing.id} AND "companyId"=${body.companyId}`;
     groupIds.set(group.description,existing.id);
     let count=0;
     for(const item of group.items){
       let mod=(await tx.$queryRaw`SELECT "id" FROM "ManagementModifier" WHERE "companyId"=${body.companyId} AND "groupId"=${existing.id} AND LOWER("description")=LOWER(${item.description}) LIMIT 1`)[0];
       if(!mod){mod={id:crypto.randomUUID()};await tx.$executeRaw`INSERT INTO "ManagementModifier" ("id","companyId","groupId","sequence","description","price","costNet","active") VALUES (${mod.id},${body.companyId},${existing.id},${item.sequence},${item.description},${item.price},${item.costNet},true)`}
       else await tx.$executeRaw`UPDATE "ManagementModifier" SET "sequence"=${item.sequence},"price"=${item.price},"costNet"=${item.costNet},"active"=true,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${mod.id} AND "companyId"=${body.companyId}`;
       count++;
     }
     modifierCounts.set(group.description,count);
   }
   let linkedProducts=0,renamedProducts=0;
   const renameLog=[];
   for(const pair of pairs){
     const groups=[...(byKatProduct.get(pair.kat.id)?.values()||[])];
     const wanted=[];
     for(const group of groups){const groupId=groupIds.get(group.description);if(!groupId)continue;wanted.push(groupId);await tx.$executeRaw`INSERT INTO "PreparationProductModifierGroup" ("id","companyId","productId","groupId","required","minSelections","maxSelections","sequence") VALUES (${crypto.randomUUID()},${body.companyId},${pair.daily.id},${groupId},${group.required},${group.minSelections},${group.maxSelections},${group.sequence}) ON CONFLICT ("companyId","productId","groupId") DO UPDATE SET "required"=EXCLUDED."required","minSelections"=EXCLUDED."minSelections","maxSelections"=EXCLUDED."maxSelections","sequence"=EXCLUDED."sequence"`}
     if(wanted.length)await tx.$executeRaw`DELETE FROM "PreparationProductModifierGroup" WHERE "companyId"=${body.companyId} AND "productId"=${pair.daily.id} AND NOT ("groupId"=ANY(${wanted}::text[]))`;
     await tx.$executeRaw`INSERT INTO "PreparationProductSettings" ("companyId","productId","preparationEnabled","environmentalFee","productionStation","autoPrint","recipeProfileVersion") VALUES (${body.companyId},${pair.daily.id},true,0,'ΠΑΡΑΓΩΓΗ',true,0) ON CONFLICT ("companyId","productId") DO UPDATE SET "preparationEnabled"=true,"environmentalFee"=0,"productionStation"='ΠΑΡΑΓΩΓΗ',"autoPrint"=true,"updatedAt"=NOW()`;
     linkedProducts++;
     if(body.renameProducts&&dailyBiteNameKey(pair.daily.name)!==dailyBiteNameKey(pair.kat.name)){await tx.$executeRaw`UPDATE "Product" SET "name"=${pair.kat.name},"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${pair.daily.id} AND "companyId"=${body.companyId}`;renamedProducts++;renameLog.push({productId:pair.daily.id,from:pair.daily.name,to:pair.kat.name})}
   }
   return{linkedProducts,renamedProducts,renameLog,groupCount:groupIds.size,modifierCount:[...modifierCounts.values()].reduce((a,b)=>a+b,0)};
 });
 res.json({ok:true,...result,recipeStockConsumptionConfigured:false,note:"Εφαρμόστηκαν μόνο modifiers/παρασκευή UI και προαιρετικά ονόματα. Δεν αντιγράφηκαν συνταγές ή ingredient stock consumption του ΚΑΤ."});
}catch(error){if(error?.name==="ZodError")return res.status(400).json({error:"Απαιτείται ρητή επιβεβαίωση DAILY_BITE_COFFEE."});next(error)}});

const importSchema=z.object({companyId:z.string().min(1).max(120),quickKeys:z.array(z.object({productId:z.string().min(1).max(120)})).max(20),categories:z.array(z.object({label:z.string().trim().min(1).max(80),productIds:z.array(z.string().min(1).max(120)).max(40)})).length(14)});
router.post("/prepare-company-layout",async(req,res,next)=>{try{
 const body=importSchema.parse(req.body||{}),ids=[...new Set([...body.quickKeys.map(x=>x.productId),...body.categories.flatMap(x=>x.productIds)])];
 const products=await prisma.$queryRaw`SELECT "id","name" FROM "Product" WHERE "companyId"=${body.companyId} AND "active"=true AND "id"=ANY(${ids}::text[])`;
 if(products.length!==ids.length)return res.status(400).json({error:"Η λίστα περιέχει ανενεργό προϊόν ή προϊόν άλλης εταιρείας."});
 const names=new Map(products.map(p=>[p.id,p.name]));
 const layout=normalizeLayout({catalogCompanyId:body.companyId,quickKeys:body.quickKeys.map((x,i)=>({...blankQuick(i),label:names.get(x.productId),productQuery:x.productId,productCodes:[x.productId]})),categories:body.categories.map((x,i)=>({...blankCategory(i),label:x.label,categoryName:x.label,productCodes:uniqueCodes(x.productIds,40)}))});
 res.json({layout});
}catch(error){next(error)}});

export default router;
