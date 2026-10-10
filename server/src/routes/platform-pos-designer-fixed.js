import {Router} from "express";
import {z} from "zod";
import {prisma} from "../prisma.js";
import {auth} from "../middleware/auth.js";
import {AUDIENCE_KEYS, normalizeAudienceSettings} from "../../../shared/pos-audience-settings.mjs";

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

const DAILY_BITE_PRESET=[
  {label:"ΣΦΟΛΙΑΤΕΣ",products:["ΚΡΟΥΑΣΑΝ ΒΟΥΤΥΡΟΥ","ΚΡΟΥΑΣΑΝ ΣΟΚΟΛΑΤΑΣ","ΜΠΟΥΓΑΤΣΑ ΚΡΕΜΑ","ΤΥΡΟΠΙΤΑ ΤΡΙΓΩΝΗ ΗΠ.","ΜΠΡΙΖΟΛΑ ΣΦΟΛΙΑΤΑ","ΠΙΤΣΑ","ΚΡΟΥΑΣΑΝ ΖΑΜΠΟΝ ΤΥΡΙ ΣΠΕΣΙΑΛ","ΣΤΑΜΝΑΓΚΑΘΙ ΜΥΖΗΘΡΑ","ΠΕΤΑΛΟ ΤΥΡΙ U","ΛΟΥΚΑΝΙΚΟΠΙΤΑ","ΦΛΟΓΕΡΑ ΤΥΡΙ ΚΡΕΜΑ","ΦΛΟΓΕΡΑ ΟΛΙΚΗΣ ΤΥΡΙ ΚΡΕΜΑ","ΠΑΤΑΤΟΠΙΤΑ ΝΗΣΤΙΣΙΜΗ","ΚΑΣΕΡΟΠΙΤΑ ΠΑΤΗΤΗ","ΤΥΡΟΠΙΤΑ ΣΦΟΛΙΑΤΑ ΔΙΑΤ.","ΚΟΥΛΟΥΡΙ ΓΑΛΟΠΟΥΛΑ ΦΙΛΑΔΕΛΦΕΙΑ","ΚΟΤΟΠΙΤΑ ΤΑΨΙΟΥ Δ.","ΠΡΑΣΟΠΙΤΑ ΤΑΨΙΟΥ Δ.","ΜΠΟΥΓΑΤΣΑ ΖΑΜΠΟΝ-ΤΥΡΙ","ΣΠΑΝΑΚΟΠΙΤΑ ΤΑΨΙΟΥ Δ.","ΤΥΡΟΠΙΤΑ ΤΑΨΙΟΥ Δ.","ΠΡΑΣΟΠΙΤΑ ΤΑΨΙΟΥ ΝΗΣΤΙΣΙΜΗ Δ.","ΚΟΥΛΟΥΡΙ ΝΤΟΜΑΤΑ ΕΛΙΑ","ΜΠΟΥΓΑΤΣΑ ΚΙΜΑΣ","ΚΡΟΥΑΣΑΝ SPECULOOS","ΝΤΟΝΑΤΣ MIDI COOKIES","ΝΤΟΝΑΤΣ ΜΠΙΦΤΕΚΙ","ΚΟΥΛΟΥΡΙ ΦΕΤΑ","ΝΤΟΝΑΤΣ ΦΡΑΟΥΛΑ","ΝΤΟΝΑΤΣ ΒΑΝΙΛΙΑ","ΝΤΟΝΑΤΣ ΚΑΝΕΛΑ","ΛΟΥΚΟΥΜΑΣ","ΠΙΡΟΣΚΙ ΖΑΜΠΟΝ - ΤΥΡΙ","ΠΙΡΟΣΚΙ ΛΟΥΚΑΝΙΚΟ"]},
  {label:"ΜΠΑΡΕΣ ΓΚΡΑΝΟΛΑ",products:["ΜΠΑΡΑ ΓΚΡΑΝΟΛΑ","DARK CRUNCH CUP","BOUBOUKI CHOCO CUP","ΜΑΝΤΟΛΑΤΟ ΦΡΟΥΤΩΝ 60ΓΡ","ΚΟΡΩΝΑ ΠΟΤΗΡΑΚΙ ΣΟΚΟΛΑΤΑ","ΓΛΥΚΟΣΟΦΙΕΣ ΝΤΑΚΟΠΑΣΤΕΛΟ ΦΥΣΤΙΚΙ 60ΓΡ"]},
  {label:"ΧΩΡΙΣ BARCODE",products:["SLIME CRYSTAL MUD","ΓΛΥΦΙΤΖΟΥΡΙ CHUPA CHUPS","MENTOS NANO BOTTLE SPEARMINT","MONSTER","ΛΟΥΤΡΙΝΑ ΖΩΑΚΙΑ","WATER GAME","ΜΕΛΙ ΜΕΡΙΔΑ STICK ΠΑΡΑΓΩΓΗΣ","ΑΥΓΑ OSCAR","BUBBLE BAR","ΚΡΟΥΑΣΑΝ COOKIES","ΠΟΤΗΡΙ ΜΕ ΠΑΓΟ","JELLYFISH","ΛΟΥΤΡΙΝΑ ΣΥΝΝΕΦΑΚΙΑ","ΛΟΥΤΡΙΝΑ KEY CHAINS","ΚΡΙ ΚΡΙ MASTER ΠΑΓΩΤΟΓΕΜΙΣΤΑ ΚΑΚΑΟ 75g","ΔΕΛΤΑ SMART ΦΡΑΟΥΛΑ 140GR","ΤΣΟΥΡΕΚΙ ΠΟΡΤΟΚΑΛΙ","ΛΟΥΤΡΙΝΟ JUNGLE","UNO","SQUISHY CAPYBARA","ΔΕΛΤΑ SMART ΜΠΑΝΑΝΑ 140GR","ΔΕΛΤΑ SMART ΜΠΙΣΚΟΤΟ 140GR","SQUISHY DUMPLING","SQUEEZE ΠΑΤΟΥΣΑ","ΡΟΛΟΙ","BOUNCE BALL","ΜΠΡΕΛΟΚ ΜΠΑΛΑ","PINCH FAMILY","ΔΕΛΤΑ ADVANCE 140GR","DINOSAUR BUBBLE STICK","KEY CHAIN","PINCH FAMILY ΜΠΙΣΚΟΤΟ","PINCH FAMILY ΚΑΡΔΙΑ","ΜΠΑΛΑ ΠΛΑΣΤΙΚΗ 2.5€","ΜΠΑΛΑ ΠΟΔΟΣΦΑΙΡΟΥ ΜΙΚΡΗ"]},
  {label:"ΚΙΣΣΑΣ",products:["ΖΕΛΕ ΚΕΡΑΣΙ ΚΙΣΣΑΣ 200GR","ΖΕΛΕ ΠΟΡΤΟΚΑΛΙ ΚΙΣΣΑΣ 200GR","ΖΕΛΕ ΦΡΑΟΥΛΑ ΚΙΣΣΑΣ 200GR"]},
  {label:"ΤΑΡΤΕΣ - ΓΛΥΚΑ",products:["ΠΕΡΕΚΟΠΙΤΑ ΚΙΜΑΣ","ΤΡΙΓΩΝΗ ΜΠΟΥΓΑΤΣΑ ΜΕ ΚΑΤΣΙΚΙΣΙΟ ΤΥΡΙ","ΚΟΥΡΟΥ ΟΛΙΚΗΣ ΦΙΛΑΔΕΛΦΕΙΑ ΣΧΟΙΝΟΠΡΑΣΟ","ΚΟΥΡΟΥ ΑΛΛΑΝΤΙΚΩΝ","ΠΙΤΑ ΠΙΤΣΑ","ΠΕΡΕΚΟΠΙΤΑ ΤΥΡΙ","FOCACCIA ΚΟΤΟΠΟΥΛΟ","ΜΑΝΙΤΑΡΟΠΙΤΑ","ΚΟΥΛΟΥΡΙ ΣΟΚΟΛΑΤΑ ΤΑΧΙΝΙ","DANISH ΒΟΥΤΥΡΟΥ ΚΕΡΑΣΙ","ΚΡΟΥΑΣΑΝ SPECULOOS","ΚΟΥΡΟΥ ΚΑΣΕΡΙ","ΛΟΥΚΑΝΙΚΟΠΙΤΑ ΚΟΥΡΟΥ","ΚΙΜΑΔΟΠΙΤΑ","ΦΛΟΓΕΡΑ ΜΠΕΙΚΟΝ ΠΑΡΜΕΖΑΝΑ","ΤΥΡΟΠΙΤΑ ΚΟΥΡΟΥ","FOCACCIA ΓΑΛΟΠΟΥΛΑ ΜΑΝΙΤΑΡΙ 4 ΤΥΡΙΑ","ΤΡΙΓΩΝΗ ΣΠΑΝΑΚΙ","ΛΟΥΚΑΝΙΚΟΠΙΤΑ ΔΙΠΛΟ ΛΟΥΚ.","LAURA ΜΠΙΣΚΟΤΑ ΣΟΚΟΛΑΤΑ","ΜΕΣΟΓΕΙΑΚΟ","FOCACCIA ΤΥΡΙ ΤΟΜΑΤΑ ΕΛΙΑ","ΧΩΡΙΑΤΙΚΗ ΠΙΤΑ ΚΑΣΕΡΙ","ΜΠΟΥΓΑΤΣΑ ΤΥΡΙ","BOMBOLONI","ΚΡΟΥΑΣΑΝ COOKIES","ΠΕΙΝΙΡΛΙ","BURRITO ΚΟΤΟΠΟΥΛΟ","ΜΑΦΙΝ ΚΑΡΑΜΕΛΑ","COOKIES ΓΕΜΙΣΤΑ ΣΟΚΟΛΑΤΑ","ΚΟΥΛΟΥΡΙ ΣΟΚΟΛΑΤΑ","BURRITO ΚΙΜΑ","ΚΟΛΟΚΥΘΟΠΙΤΑ ΓΛΥΚΙΑ","LAURA ΔΙΑΦΟΡΑ ΜΠΙΣΚΟΤΑ ΖΑΧΑΡΟΠΑΣΤΑΣ"]},
  {label:"DELISNACKS",products:["ΜΠΑΓΚΕΤΑ ΖΑΜΠΟΝ","ΑΡΑΒΙΚΗ ΖΑΜΠΟΝ","ΚΟΥΛΟΥΡΙ ΜΑΡΓΑΡΙΤΑ ΓΑΛΟΠΟΥΛΑ","NUGGETS","ΒΡΑΣΤΑ ΛΑΧΑΝΙΚΑ","ΜΠΑΓΚΕΤΑ ΓΑΛΟΠΟΥΛΑ","ΑΡΑΒΙΚΗ ΓΑΛΟΠΟΥΛΑ","CLUB ΖΑΜΠΟΝ","ΤΣΙΑΠΑΤΑ ΦΕΤΑ ΝΤΟΜΑΤΑ ΑΓΓΟΥΡΙ","ΤΑΜΠΟΥΛΕ","ΜΠΑΓΚΕΤΑ ΚΑΛΑΜΠΟΚΙΟΥ NUGGETS","ΑΡΑΒΙΚΗ ΜΠΙΦΤΕΚΙ ΛΑΧΑΝΙΚΩΝ","ΜΠΑΓΚΕΤΑ ΤΟΝΟΣΑΛΑΤΑ","CLUB ΚΟΤΟΠΟΥΛΟ ΜΠΕΙΚΟΝ","ΚΑΙΣΑΡΑ","ΣΤΟΥΤΓΚΑΡΔΗΣ ΑΥΓΟ","ΑΡΑΒΙΚΗ ΓΑΛΟΠΟΥΛΑ COTTAGE","BAGEL ΜΟΤΣΑΡΕΛΑ PESTO","ΤΣΙΑΠΑΤΑ ΚΟΤΟΠΟΥΛΟ ΚΑΤΙΚΙ","ΣΑΛΑΤΑ ΣΕΦ","ΜΠΑΓΚΕΤΑ ΟΛΙΚΗΣ ΓΑΛΟΠΟΥΛΑ","ΚΛΑΜΠ ΓΑΛΟΠΟΥΛΑ","FOCACCIA ΜΟΤΣΑΡΕΛΑ","ΚΛΑΜΠ ΜΑΥΡΟ ΤΟΝΟΣΑΛΑΤΑ","ΣΑΛΑΤΑ ΖΥΜΑΡΙΚΩΝ ΓΑΛΟΠΟΥΛΑ","ΜΠΑΓΚΕΤΑ BRETZEL ΑΛΜ./ΚΩΝ","ΜΠΑΓΚΕΤΑ ΚΟΤΟΠΟΥΛΟ","ΝΤΟΝΑΤΣ ΓΑΛΟΠΟΥΛΑ","ΣΑΛΑΤΑ ΝΤΑΚΟΣ ΦΕΤΑ","ΣΑΛΑΤΑ ΤΟΝΟΣ","ΜΠΑΓΚΕΤΑ ΜΟΡΤΑΔΕΛΑ","ΜΠΑΓΚΕΤΑ ΖΑΜΠΟΝ ΛΟΥΚΑΝΙΚΟ","CHEESEBURGER","ΑΡΑΒΙΚΗ ΠΙΤΑ ΛΑΧΑΝΙΚΩΝ","ΣΑΛΑΤΑ ΡΙΖΟΤΟ ΛΑΧΑΝΙΚΩΝ"]},
  {label:"ΜΠΑΛΕΣ",products:["ΜΠΑΛΑ ΠΟΔΟΣΦΑΙΡΟΥ","ΜΠΑΛΑ ΒΟΛΕΥ","ΜΠΑΛΑ ΜΙΚΡΗ"]},
  {label:"ΜΑΓΑΚΗΣ",products:["ΤΟΣΤ ΓΑΛΟΠΟΥΛΑ ΜΑΓ.","ΑΡΑΒΙΚΗ ΚΑΙΣΑΡΑ","ΤΟΣΤ ΜΕ ΔΙΠΛΟ ΤΥΡΙ ΜΑΓΑΚΗΣ","ΑΡΑΒΙΚΗ ΑΛΛΑΝΤΙΚΩΝ","ΑΡΑΒΙΚΗ ΓΑΛΟΠΟΥΛΑ ΣΩΣ","ΜΠΑΓΚΕΤΑ ΧΟΙΡ. ΩΜΟΠΛΑΤΗ GOUDA","ΣΑΛΑΤΑ ΜΕ ΡΟΚΑ ΜΑΓΑΚΗΣ","ΣΑΛΑΤΑ ΝΤΑΚΟΣ","ΑΡΑΒΙΚΗ ΓΑΛΟΠΟΥΛΑ ΝΤΟΜΑΤΑ","ΑΡΑΒΙΚΗ ΓΑΛΟΠΟΥΛΑ ΦΑΡΜΑ","ΜΑΓΑΚΗΣ ΣΑΛΑΤΑ ΣΟΛΟΜΟΥ","ΤΟΣΤ ΧΟΙΡΙΝΗ ΩΜΟΠΛΑΤΗ","ΤΟΣΤ ΓΑΛΟΠΟΥΛΑ ΤΥΡΙ ΜΑΓΙΟΝΕΖΑ"]},
  {label:"ΚΕΙΚ",products:["ΚΕΙΚ ΑΝΑΜΕΙΚΤΟ ΣΤΡΟΓΓΥΛΟ","ΜΗΛΟΠΙΤΑΚΙ","ΜΙΚΡΗ ΛΑΓΑΝΑ","ΤΣΟΥΡΕΚΙ ΠΡΩΙΝΑ ΜΑΣΤΟΡΑΣ","BROOKIES DUBAI CHOCOLATE 150GR","ΤΣΟΥΡΕΚΙ","COOKIES ΑΜΥΓΔΑΛΟΥ","ΣΤΑΦΙΔΟΨΩΜΟ","ΤΣΟΥΡΕΚΙ ΜΑΣΤΟΡΑΣ","ΤΣΟΥΡΕΚΙ ΣΤΑΦΙΔΑ 80GR","ΒΑΤΟΜΟΥΡΟΠΙΤΑΚΙ","COOKIES ΚΑΡΥΔΑΣ ΜΕ ΣΟΚ.","ΤΑΧΙΝΟΠΙΤΑ","ΣΤΑΦΙΔΟΚΕΙΚ","ΚΕΙΚ ΦΕΤΑ 80ΓΡ. ΠΟΡΤ. ΚΑΙ ΑΝΑΜ. ΜΑΓ.","COOKIES ΚΑΝΕΛΑΣ","COOKIES ΒΑΝΙΛΙΑΣ ΜΕ ΣΟΚ.","ΣΟΚΟΛΑΤΟΨΩΜΟ","SOFT COOKIES ΔΙΑΦΟΡΑ","AHA DOUBLE CHOCO COOKIES 80 GR","COFFEE RING ΜΕ ΣΟΚΟΛΑΤΑ","SOFT CHOCO ROLLS","ΕΛΙΟΨΩΜΟ","AHA COOKIES CINNAMON CARAMEL 80GR","ΚΕΙΚ ΒΑΝΙΛΙΑ MINI"]},
  {label:"ΠΑΙΧΝΙΔΙΑ",products:["SQUISHY BUN MINI","CANDY GANGS BUILD BOX FLOWERS","FINGER GUESSING GAME","SHERMAN","ΟΠΛΟ ΑΕΡΟΠΛΑΝΟ"]}
];
const dailyBiteNameKey=value=>String(value||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLocaleUpperCase("el-GR").replace(/[^0-9A-ZΑ-Ω€]+/g," ").trim().replace(/\s+/g," ");

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
