import crypto from "crypto";
import {Router} from "express";
import {z} from "zod";
import XLSX from "xlsx";
import {prisma} from "../prisma.js";
import {parsePromotionDate} from "../promotion-time.js";

const router=Router();
const roles=new Set(["SUPER_ADMIN","OWNER","ADMIN","MANAGER"]);
const MAX_FILE_BYTES=8*1024*1024;
const MAX_ROWS=5000;
const norm=value=>String(value??"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLocaleLowerCase("el-GR").replace(/[^a-zα-ω0-9]/g,"");
const text=value=>String(value??"").trim();
const num=value=>{if(value===null||value===undefined||value==="")return null;const parsed=Number(String(value).replace(/\s/g,"").replace("%","").replace(",","."));return Number.isFinite(parsed)?parsed:null};
const round2=value=>Number(Number(value||0).toFixed(2));
const id=()=>crypto.randomUUID();
let auditSchemaPromise;

const aliases={
  barcode:["barcode","ean","ean13","ean8","γραμμωτοςκωδικας"],
  sku:["sku","εσωτκωδικος","εσωτερικοςκωδικος","κωδικοςειδους","κωδικος"],
  description:["περιγραφη","ειδος","προιον","ονομασια","description","name","product"],
  originalPrice:["αρχικητιμη","λιανικη","λιανικητιμη","originalprice","retailprice","currentprice"],
  offerPrice:["νεατιμη","τιμηπροσφορας","offerprice","newprice","promoprice"],
  discountPercent:["εκπτωση","εκπτωσηpct","εκπτωσηpercent","discount","discountpercent"],
  validFrom:["ισχυειαπο","απο","validfrom","start","startdate","ημερομηνιαεναρξης"],
  validUntil:["ισχυειεωςκαι","ισχυειεως","εως","validuntil","end","enddate","ημερομηνιαληξης"],
  customerPoints:["ποντοιπελατη","ποντοι","customerpoints","points"]
};
const aliasLookup=new Map(Object.entries(aliases).flatMap(([field,list])=>list.map(alias=>[norm(alias),field])));

async function ensureAuditSchema(){
  if(!auditSchemaPromise){auditSchemaPromise=(async()=>{
    await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "PriceCatalogPromotionImportAudit" (
      "id" TEXT PRIMARY KEY,"companyId" TEXT NOT NULL,"filename" TEXT NOT NULL,"fileHash" TEXT NOT NULL,
      "previewHash" TEXT NOT NULL,"storeIdsJson" JSONB NOT NULL DEFAULT '[]'::jsonb,"countsJson" JSONB NOT NULL DEFAULT '{}'::jsonb,
      "importedCount" INTEGER NOT NULL DEFAULT 0,"skippedCount" INTEGER NOT NULL DEFAULT 0,
      "actorId" TEXT,"actorName" TEXT,"createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "PriceCatalogPromotionImportAudit_company_created_idx" ON "PriceCatalogPromotionImportAudit"("companyId","createdAt" DESC)`);
  })().catch(error=>{auditSchemaPromise=undefined;throw error})}
  return auditSchemaPromise;
}
function requireAccess(req,res,next){
  if(req.user?.tokenType==="STORE_OPERATOR"||!roles.has(req.user?.role))return res.status(403).json({error:"Η εισαγωγή προσφορών είναι διαθέσιμη μόνο σε Super Admin, Ιδιοκτήτη, Admin ή Manager."});
  next();
}
router.use(requireAccess);
router.use(async(req,res,next)=>{try{await ensureAuditSchema();next()}catch(error){next(error)}});

function decodeFile(body){
  const filename=text(body.filename),match=/\.([^.]+)$/.exec(filename),ext=String(match?.[1]||"").toLowerCase();
  if(!["xlsx","xls","csv"].includes(ext)){const e=new Error("Επιτρέπονται μόνο αρχεία XLSX, XLS ή CSV.");e.status=400;throw e}
  let buffer;try{buffer=Buffer.from(String(body.base64||""),"base64")}catch{buffer=null}
  if(!buffer?.length||buffer.length>MAX_FILE_BYTES){const e=new Error("Το αρχείο πρέπει να είναι έως 8 MB.");e.status=400;throw e}
  return {filename,ext,buffer,fileHash:crypto.createHash("sha256").update(buffer).digest("hex")};
}
function sheetRows(buffer){
  const workbook=XLSX.read(buffer,{type:"buffer",cellDates:true});
  const first=workbook.SheetNames[0];
  if(!first){const e=new Error("Το αρχείο δεν έχει φύλλο δεδομένων.");e.status=400;throw e}
  const raw=XLSX.utils.sheet_to_json(workbook.Sheets[first],{defval:null,raw:true});
  if(!raw.length){const e=new Error("Το πρώτο φύλλο δεν έχει γραμμές δεδομένων.");e.status=400;throw e}
  if(raw.length>MAX_ROWS){const e=new Error(`Το αρχείο έχει πάνω από ${MAX_ROWS} γραμμές. Χώρισέ το σε μικρότερα αρχεία.`);e.status=400;throw e}
  return raw.map((row,index)=>({rowNumber:index+2,raw:row}));
}
function canonicalRow(entry){
  const out={rowNumber:entry.rowNumber};
  for(const [header,value] of Object.entries(entry.raw||{})){const field=aliasLookup.get(norm(header));if(field&&out[field]===undefined)out[field]=value}
  return out;
}
const pad=value=>String(value).padStart(2,"0");
function wallClockDate(year,month,day,hour=0,minute=0,second=0){return parsePromotionDate(`${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}:${pad(second)}`)}
function localDate(value,isEnd=false){
  if(value===null||value===undefined||value==="")return null;
  if(value instanceof Date&&!Number.isNaN(value.getTime()))return wallClockDate(value.getUTCFullYear(),value.getUTCMonth()+1,value.getUTCDate(),value.getUTCHours(),value.getUTCMinutes(),value.getUTCSeconds());
  if(typeof value==="number"){
    const p=XLSX.SSF.parse_date_code(value);if(!p)return null;
    return wallClockDate(p.y,p.m,p.d,p.H||0,p.M||0,p.S||0);
  }
  const raw=text(value);let match=raw.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if(match){const hasTime=match[4]!==undefined;return wallClockDate(+match[3],+match[2],+match[1],hasTime?+match[4]:(isEnd?23:0),hasTime?+match[5]:(isEnd?59:0),hasTime?+(match[6]||0):(isEnd?59:0))}
  match=raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);if(match)return wallClockDate(+match[1],+match[2],+match[3],isEnd?23:0,isEnd?59:0,isEnd?59:0);
  const parsed=parsePromotionDate(raw);return parsed instanceof Date&&!Number.isNaN(parsed.getTime())?parsed:null;
}

function pushMap(map,key,value){if(!key)return;const bucket=map.get(key)||[];if(!bucket.some(item=>item.id===value.id))bucket.push(value);map.set(key,bucket)}
async function productIndex(companyId){
  const rows=await prisma.$queryRaw`SELECT p."id",p."sku",p."name",p."salePrice",p."vatRate",pb."barcode" FROM "Product" p LEFT JOIN "ProductBarcode" pb ON pb."productId"=p."id" WHERE p."companyId"=${companyId} AND p."active"=true`;
  const products=new Map(),barcodes=new Map(),skus=new Map(),names=new Map();
  for(const row of rows){let product=products.get(row.id);if(!product){product={id:row.id,sku:row.sku||null,name:row.name,salePrice:Number(row.salePrice||0),vatRate:Number(row.vatRate||0)};products.set(row.id,product);pushMap(skus,norm(row.sku),product);pushMap(names,norm(row.name),product)}pushMap(barcodes,text(row.barcode),product)}
  return {barcodes,skus,names};
}
function uniqueMatch(map,key){const list=map.get(key)||[];return list.length===1?{product:list[0],ambiguous:false}:list.length>1?{product:null,ambiguous:true}:{product:null,ambiguous:false}}
function matchProduct(row,index){
  const barcode=text(row.barcode),sku=norm(row.sku),name=norm(row.description);
  if(barcode){const m=uniqueMatch(index.barcodes,barcode);if(m.ambiguous)return {product:null,error:"Το Barcode αντιστοιχεί σε περισσότερα από ένα προϊόντα."};if(m.product)return {product:m.product,matchedBy:"BARCODE"}}
  if(sku){const m=uniqueMatch(index.skus,sku);if(m.ambiguous)return {product:null,error:"Ο εσωτερικός κωδικός αντιστοιχεί σε περισσότερα από ένα προϊόντα."};if(m.product)return {product:m.product,matchedBy:"SKU"}}
  if(name){const m=uniqueMatch(index.names,name);if(m.ambiguous)return {product:null,error:"Η ακριβής περιγραφή αντιστοιχεί σε περισσότερα από ένα προϊόντα."};if(m.product)return {product:m.product,matchedBy:"DESCRIPTION"}}
  return {product:null,error:"Δεν βρέθηκε προϊόν με Barcode, SKU ή ακριβή περιγραφή."};
}
async function validateStores(companyId,storeIds){
  const ids=[...new Set(storeIds.map(v=>text(v)).filter(Boolean))];if(!ids.length){const e=new Error("Επίλεξε τουλάχιστον ένα κατάστημα για την προσφορά.");e.status=400;throw e}if(ids.length>200){const e=new Error("Υπερβολικά πολλά καταστήματα.");e.status=400;throw e}
  const stores=await prisma.store.findMany({where:{companyId,active:true,id:{in:ids}},select:{id:true,name:true},orderBy:{name:"asc"}});if(stores.length!==ids.length){const e=new Error("Ένα ή περισσότερα καταστήματα δεν ανήκουν στην εταιρεία ή δεν είναι ενεργά.");e.status=400;throw e}return stores;
}
async function existingOverlaps(companyId,productIds,storeIds){if(!productIds.length)return [];return prisma.$queryRaw`SELECT pr."id",pr."productId",pr."validFrom",pr."validUntil",ps."storeId" FROM "PriceCatalogPromotion" pr JOIN "PriceCatalogPromotionStore" ps ON ps."promotionId"=pr."id" AND ps."companyId"=pr."companyId" WHERE pr."companyId"=${companyId} AND pr."promotionType"='LEAFLET' AND pr."active"=true AND pr."productId"=ANY(${productIds}::text[]) AND ps."storeId"=ANY(${storeIds}::text[])`}
function intervalsOverlap(aStart,aEnd,bStart,bEnd){const ae=aEnd?new Date(aEnd).getTime():Infinity,be=bEnd?new Date(bEnd).getTime():Infinity;return new Date(aStart).getTime()<=be&&new Date(bStart).getTime()<=ae}

async function buildPreview(req,body){
  const companyId=req.user.companyId,{filename,buffer,fileHash}=decodeFile(body),stores=await validateStores(companyId,body.storeIds),rawRows=sheetRows(buffer),index=await productIndex(companyId),staged=[];
  for(const entry of rawRows){
    const row=canonicalRow(entry),match=matchProduct(row,index),warnings=[];
    if(!match.product){staged.push({...row,status:"UNRESOLVED",error:match.error,warnings});continue}
    const product=match.product,validFrom=localDate(row.validFrom,false),validUntil=localDate(row.validUntil,true);
    if(!validFrom){staged.push({...row,product,matchedBy:match.matchedBy,status:"INVALID",error:"Λείπει ή δεν διαβάζεται το Ισχύει από.",warnings});continue}
    if(row.validUntil!==null&&row.validUntil!==undefined&&row.validUntil!==""&&!validUntil){staged.push({...row,product,matchedBy:match.matchedBy,status:"INVALID",error:"Δεν διαβάζεται το Ισχύει έως.",warnings});continue}
    if(validUntil&&validUntil<validFrom){staged.push({...row,product,matchedBy:match.matchedBy,status:"INVALID",error:"Η λήξη είναι πριν από την έναρξη.",warnings});continue}
    const fileOriginal=num(row.originalPrice),realOriginal=round2(product.salePrice),offerInput=num(row.offerPrice),discountInput=num(row.discountPercent),points=num(row.customerPoints)??0;
    if(points<0){staged.push({...row,product,matchedBy:match.matchedBy,status:"INVALID",error:"Οι πόντοι δεν μπορεί να είναι αρνητικοί.",warnings});continue}
    if(offerInput===null&&discountInput===null){staged.push({...row,product,matchedBy:match.matchedBy,status:"INVALID",error:"Χρειάζεται Νέα τιμή ή Έκπτωση (%).",warnings});continue}
    if(discountInput!==null&&(discountInput<0||discountInput>100)){staged.push({...row,product,matchedBy:match.matchedBy,status:"INVALID",error:"Η Έκπτωση (%) πρέπει να είναι 0–100.",warnings});continue}
    const offerPrice=offerInput!==null?round2(offerInput):round2(realOriginal*(1-discountInput/100));if(offerPrice<0){staged.push({...row,product,matchedBy:match.matchedBy,status:"INVALID",error:"Η νέα τιμή δεν μπορεί να είναι αρνητική.",warnings});continue}
    const computedDiscount=realOriginal>0?round2(((realOriginal-offerPrice)/realOriginal)*100):0;
    if(offerInput!==null&&discountInput!==null){const expected=round2(realOriginal*(1-discountInput/100));if(Math.abs(expected-offerPrice)>0.02){staged.push({...row,product,matchedBy:match.matchedBy,status:"INVALID",error:`Η Νέα τιμή (${offerPrice.toFixed(2)}) δεν συμφωνεί με την Έκπτωση (${discountInput.toFixed(2)}%).`,warnings});continue}}
    if(fileOriginal!==null&&Math.abs(fileOriginal-realOriginal)>0.02)warnings.push(`Η αρχική τιμή αρχείου ${fileOriginal.toFixed(2)} € διαφέρει από την πραγματική βασική τιμή ${realOriginal.toFixed(2)} €· θα χρησιμοποιηθεί η πραγματική.`);
    if(offerPrice>=realOriginal)warnings.push("Η νέα τιμή δεν είναι χαμηλότερη από τη βασική λιανική· στο POS θα εφαρμοστεί μόνο όπου δίνει πραγματικό όφελος.");
    staged.push({...row,product,matchedBy:match.matchedBy,status:"READY",error:null,warnings,originalPrice:realOriginal,offerPrice,discountPercent:computedDiscount,customerPoints:round2(points),validFrom:validFrom.toISOString(),validUntil:validUntil?validUntil.toISOString():null});
  }
  const readyIds=[...new Set(staged.filter(r=>r.status==="READY").map(r=>r.product.id))],storeIds=stores.map(s=>s.id),existing=await existingOverlaps(companyId,readyIds,storeIds);
  for(const row of staged.filter(r=>r.status==="READY")){const hits=existing.filter(ex=>ex.productId===row.product.id&&intervalsOverlap(row.validFrom,row.validUntil,ex.validFrom,ex.validUntil)),hitStores=[...new Set(hits.map(h=>h.storeId))];if(hitStores.length){row.status="OVERLAP";row.error=`Υπάρχει ήδη ενεργή προσφορά που επικαλύπτεται σε ${hitStores.length} επιλεγμένο/α κατάστημα/τα.`;row.overlapStoreIds=hitStores}}
  const counts=staged.reduce((a,r)=>(a.total++,a[r.status.toLowerCase()]=(a[r.status.toLowerCase()]||0)+1,a),{total:0,ready:0,unresolved:0,invalid:0,overlap:0});
  const previewBasis=staged.map(row=>[row.rowNumber,row.status,row.product?.id||null,row.offerPrice??null,row.discountPercent??null,row.validFrom??null,row.validUntil??null,row.overlapStoreIds||[],row.error||null]);
  const previewHash=crypto.createHash("sha256").update(JSON.stringify({companyId,fileHash,storeIds:[...storeIds].sort(),previewBasis})).digest("hex");
  return {filename,fileHash,previewHash,stores,rows:staged,counts,canCommit:counts.ready>0,skipped:counts.total-counts.ready};
}

const requestSchema=z.object({filename:z.string().trim().min(1).max(255),base64:z.string().min(4),storeIds:z.array(z.string().min(1)).min(1).max(200)});
router.post("/promotions/import/preview",async(req,res,next)=>{try{res.json(await buildPreview(req,requestSchema.parse(req.body||{})))}catch(error){if(error?.name==="ZodError")return res.status(400).json({error:"Επίλεξε αρχείο και τουλάχιστον ένα κατάστημα.",details:error.issues});next(error)}});
const commitSchema=requestSchema.extend({previewHash:z.string().length(64),confirm:z.literal(true),acceptSkipped:z.boolean().default(false)});
router.post("/promotions/import/commit",async(req,res,next)=>{
  try{
    const body=commitSchema.parse(req.body||{}),preview=await buildPreview(req,body);if(preview.previewHash!==body.previewHash)return res.status(409).json({error:"Το αρχείο, τα καταστήματα ή τα πραγματικά δεδομένα άλλαξαν μετά την προεπισκόπηση. Κάνε νέα προεπισκόπηση."});if(!preview.counts.ready)return res.status(409).json({error:"Δεν υπάρχει καμία έγκυρη γραμμή για εισαγωγή."});if(preview.skipped>0&&!body.acceptSkipped)return res.status(409).json({error:`Υπάρχουν ${preview.skipped} γραμμές που θα παραλειφθούν. Επιβεβαίωσε ρητά ότι αποδέχεσαι την παράλειψή τους.`,code:"SKIPPED_ROWS_CONFIRMATION_REQUIRED",counts:preview.counts});
    const actor=req.user.fullName||req.user.email||"Χρήστης",created=[];
    await prisma.$transaction(async tx=>{
      for(const row of preview.rows.filter(r=>r.status==="READY")){const promoId=id();await tx.$executeRaw`INSERT INTO "PriceCatalogPromotion" ("id","companyId","productId","promotionType","originalPrice","offerPrice","discountPercent","saleQuantity","bonusQuantity","customerPoints","validFrom","validUntil","active","createdByUserId","createdByName") VALUES (${promoId},${req.user.companyId},${row.product.id},'LEAFLET',${row.originalPrice},${row.offerPrice},${row.discountPercent},1,0,${row.customerPoints},${new Date(row.validFrom)},${row.validUntil?new Date(row.validUntil):null},true,${req.user.id},${actor})`;for(const store of preview.stores)await tx.$executeRaw`INSERT INTO "PriceCatalogPromotionStore" ("promotionId","companyId","storeId") VALUES (${promoId},${req.user.companyId},${store.id}) ON CONFLICT ("promotionId","storeId") DO NOTHING`;created.push({promotionId:promoId,productId:row.product.id,productName:row.product.name})}
      await tx.$executeRaw`INSERT INTO "PriceCatalogPromotionImportAudit" ("id","companyId","filename","fileHash","previewHash","storeIdsJson","countsJson","importedCount","skippedCount","actorId","actorName") VALUES (${id()},${req.user.companyId},${preview.filename},${preview.fileHash},${preview.previewHash},${JSON.stringify(preview.stores.map(s=>s.id))}::jsonb,${JSON.stringify(preview.counts)}::jsonb,${created.length},${preview.skipped},${req.user.id},${actor})`;
    });
    res.status(201).json({ok:true,imported:created.length,skipped:preview.skipped,counts:preview.counts,created});
  }catch(error){if(error?.name==="ZodError")return res.status(400).json({error:"Η τελική εισαγωγή δεν είναι έγκυρη ή δεν έχει επιβεβαιωθεί.",details:error.issues});next(error)}
});

export {canonicalRow,localDate,intervalsOverlap};
export default router;
