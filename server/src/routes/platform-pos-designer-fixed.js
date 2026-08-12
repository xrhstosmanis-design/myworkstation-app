import {Router} from "express";
import {z} from "zod";
import {prisma} from "../prisma.js";
import {auth} from "../middleware/auth.js";

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
const palette=["#1597a5","#287e9e","#4f8fbe","#dc7a27","#3978b8","#9aa82f","#9a5353","#76558e"];
const fixedButtons=[
  {id:"cancel",label:"ΑΚΥΡΩΣΗ",action:"CLEAR_CART",color:"#ef4444",visible:true},
  {id:"hold",label:"ΑΝΑΜΟΝΗ",action:"HOLD",color:"#edf2f1",visible:true},
  {id:"payments",label:"ΠΛΗΡΩΜΕΣ",action:"PAYMENTS",color:"#edf2f1",visible:true},
  {id:"preparation",label:"ΠΑΡΑΣΚΕΥΗ",action:"PRINT",color:"#edf2f1",visible:true},
  {id:"waste",label:"ΦΥΡΑ",action:"WASTE",color:"#edf2f1",visible:true},
  {id:"mixed",label:"ΜΙΚΤΗ",action:"MIXED",color:"#7c3aed",visible:true},
  {id:"card",label:"ΚΑΡΤΑ",action:"CARD",color:"#3378cf",visible:true},
  {id:"cash",label:"ΜΕΤΡΗΤΑ",action:"CASH",color:"#0b8f5a",visible:true}
];

const colorSchema=z.string().regex(/^#[0-9a-fA-F]{6}$/);
const quickSchema=z.object({id:z.string().min(1).max(60),label:z.string().max(80),productQuery:z.string().max(160).default(""),productCodes:z.array(z.string().min(1).max(160)).max(1).default([]),color:colorSchema,visible:z.boolean().default(true)});
const categorySchema=z.object({id:z.string().min(1).max(60),label:z.string().max(80),categoryName:z.string().max(120).default(""),productCodes:z.array(z.string().min(1).max(160)).max(MAX_CATEGORY_PRODUCTS).default([]),color:colorSchema,visible:z.boolean().default(true)});
const layoutSchema=z.object({title:z.string().trim().min(1).max(80).default("OPERATOR POS"),productColumns:z.coerce.number().int().min(4).max(8).default(6),showSku:z.boolean().default(true),buttonFontScale:z.coerce.number().min(.8).max(1.7).default(1),theme:z.object({headerColor:colorSchema,accentColor:colorSchema,surfaceColor:colorSchema}).default({headerColor:"#033d2f",accentColor:"#087a52",surfaceColor:"#ffffff"}),quickKeys:z.array(quickSchema).max(QUICK_COUNT),categories:z.array(categorySchema).max(CATEGORY_COUNT),buttons:z.array(z.any()).optional().default([])});

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
  return {title,productColumns:Number(source.productColumns||6),showSku:source.showSku!==false,buttonFontScale:Number(source.buttonFontScale||legacyFont||1),theme:{headerColor:"#033d2f",accentColor:"#087a52",surfaceColor:"#ffffff",...(source.theme||{})},quickKeys,categories,buttons:fixedButtons};
}
router.get("/",async(req,res,next)=>{try{const drafts=await prisma.$queryRaw`SELECT "layoutJson","version","updatedAt" FROM "PlatformPosDraft" WHERE "id"='GLOBAL' LIMIT 1`;const companies=await prisma.company.findMany({select:{id:true,name:true,stores:{where:{active:true},select:{id:true,name:true,city:true},orderBy:{name:"asc"}}},orderBy:{name:"asc"}});const published=await prisma.$queryRaw`SELECT "storeId","version","publishedAt" FROM "StorePosLayout"`;res.json({draft:normalizeLayout(drafts[0]?.layoutJson||{}),draftVersion:Number(drafts[0]?.version||0),updatedAt:drafts[0]?.updatedAt||null,companies,published,limits:{quickKeys:QUICK_COUNT,categories:CATEGORY_COUNT,productsPerCategory:MAX_CATEGORY_PRODUCTS}})}catch(error){next(error)}});
router.put("/draft",async(req,res,next)=>{try{const incoming=layoutSchema.parse(req.body||{});const layout=normalizeLayout(incoming);const rows=await prisma.$queryRaw`INSERT INTO "PlatformPosDraft" ("id","layoutJson","version","updatedBy","updatedAt") VALUES ('GLOBAL',${JSON.stringify(layout)}::jsonb,1,${req.user.id},CURRENT_TIMESTAMP) ON CONFLICT ("id") DO UPDATE SET "layoutJson"=EXCLUDED."layoutJson","version"="PlatformPosDraft"."version"+1,"updatedBy"=EXCLUDED."updatedBy","updatedAt"=CURRENT_TIMESTAMP RETURNING "version","updatedAt","layoutJson"`;res.json({ok:true,draftVersion:Number(rows[0].version),updatedAt:rows[0].updatedAt,draft:normalizeLayout(rows[0].layoutJson)})}catch(error){next(error)}});
router.post("/publish",async(req,res,next)=>{try{const body=z.object({storeIds:z.array(z.string()).min(1).max(1000)}).parse(req.body||{});const storeIds=[...new Set(body.storeIds)];const stores=await prisma.store.findMany({where:{id:{in:storeIds},active:true},select:{id:true,companyId:true}});if(stores.length!==storeIds.length)return res.status(404).json({error:"Ένα ή περισσότερα καταστήματα δεν βρέθηκαν."});const drafts=await prisma.$queryRaw`SELECT "layoutJson" FROM "PlatformPosDraft" WHERE "id"='GLOBAL' LIMIT 1`;const layout=normalizeLayout(drafts[0]?.layoutJson||{});await prisma.$transaction(async tx=>{for(const store of stores)await tx.$executeRaw`INSERT INTO "StorePosLayout" ("storeId","companyId","layoutJson","version","publishedBy","publishedAt") VALUES (${store.id},${store.companyId},${JSON.stringify(layout)}::jsonb,1,${req.user.id},CURRENT_TIMESTAMP) ON CONFLICT ("storeId") DO UPDATE SET "layoutJson"=EXCLUDED."layoutJson","version"="StorePosLayout"."version"+1,"publishedBy"=EXCLUDED."publishedBy","publishedAt"=CURRENT_TIMESTAMP`});res.json({ok:true,publishedStores:stores.length})}catch(error){next(error)}});
router.get("/products",async(req,res,next)=>{try{const raw=String(req.query.codes||"").trim();const codes=uniqueCodes(raw.split(",").map(code=>{try{return decodeURIComponent(code)}catch{return code}}),MAX_CATEGORY_PRODUCTS);if(!codes.length)return res.json({rows:[]});const rows=await prisma.$queryRaw`SELECT p."id",p."sourceCode",p."name",p."categoryName",p."subcategoryName",p."defaultRetailPrice",COALESCE(array_agg(b."barcode") FILTER (WHERE b."barcode" IS NOT NULL),'{}') AS "barcodes" FROM "MasterProduct" p LEFT JOIN "MasterProductBarcode" b ON b."masterProductId"=p."id" WHERE p."sourceCode" = ANY(${codes}::text[]) GROUP BY p."id",p."sourceCode",p."name",p."categoryName",p."subcategoryName",p."defaultRetailPrice" ORDER BY array_position(${codes}::text[],p."sourceCode")`;res.json({rows:rows.map(row=>({...row,defaultRetailPrice:row.defaultRetailPrice===null?null:Number(row.defaultRetailPrice)}))})}catch(error){next(error)}});
export default router;
