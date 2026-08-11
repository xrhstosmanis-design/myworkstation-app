import crypto from "crypto";
import {Router} from "express";
import {z} from "zod";
import {prisma} from "../prisma.js";

const router=Router();
const MAX_PRODUCTS=500;
const MAX_STORES=200;
const MAX_COMBINATIONS=10000;
const MAX_SAMPLE_ROWS=500;
const uid=()=>crypto.randomUUID();
const norm=value=>String(value??"").trim().toLocaleLowerCase("el-GR");
const round2=value=>Math.round((Number(value||0)+Number.EPSILON)*100)/100;
let schemaPromise;

async function ensureSchema(){
  if(!schemaPromise){schemaPromise=(async()=>{
    await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "BulkPriceBatchAudit" (
      "id" TEXT PRIMARY KEY,"companyId" TEXT NOT NULL,"mode" TEXT NOT NULL,"value" NUMERIC(14,4) NOT NULL,
      "productIdsJson" JSONB NOT NULL DEFAULT '[]'::jsonb,"storeIdsJson" JSONB NOT NULL DEFAULT '[]'::jsonb,
      "previewHash" TEXT NOT NULL,"changedCount" INTEGER NOT NULL DEFAULT 0,"unchangedCount" INTEGER NOT NULL DEFAULT 0,
      "skippedCount" INTEGER NOT NULL DEFAULT 0,"actorId" TEXT,"actorName" TEXT,"createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "BulkPriceBatchAudit_company_created_idx" ON "BulkPriceBatchAudit"("companyId","createdAt" DESC)`);
  })().catch(error=>{schemaPromise=undefined;throw error})}
  return schemaPromise;
}
router.use(async(req,res,next)=>{try{await ensureSchema();next()}catch(error){next(error)}});

const productRef=z.object({name:z.string().trim().min(1).max(250),sku:z.string().trim().max(80).optional().nullable()});
const baseObject=z.object({
  productRefs:z.array(productRef).min(1).max(MAX_PRODUCTS),
  storeNames:z.array(z.string().trim().min(1).max(180)).min(1).max(MAX_STORES),
  mode:z.enum(["SET","INCREASE_PERCENT","DECREASE_PERCENT"]),
  value:z.coerce.number().finite().min(0).max(100000)
});
const validateSelection=(body,ctx)=>{if(body.mode==="DECREASE_PERCENT"&&body.value>100)ctx.addIssue({code:z.ZodIssueCode.custom,path:["value"],message:"Η μείωση δεν μπορεί να ξεπερνά το 100%."});if(body.productRefs.length*body.storeNames.length>MAX_COMBINATIONS)ctx.addIssue({code:z.ZodIssueCode.custom,path:["productRefs"],message:`Η προεπισκόπηση επιτρέπει έως ${MAX_COMBINATIONS} συνδυασμούς προϊόν × κατάστημα.`})};
const baseSchema=baseObject.superRefine(validateSelection);
const commitSchema=baseObject.extend({previewHash:z.string().length(64),confirm:z.literal(true),acceptSkipped:z.boolean().default(false)}).superRefine(validateSelection);

function resolveUnique(rows,keyFn,label){
  const map=new Map();for(const row of rows){const key=keyFn(row);if(!key)continue;const bucket=map.get(key)||[];bucket.push(row);map.set(key,bucket)}
  return {get:key=>{const bucket=map.get(key)||[];if(bucket.length===1)return {row:bucket[0]};if(bucket.length>1)return {error:`Αμφίσημη ${label}.`};return {error:`Δεν βρέθηκε ${label}.`}}};
}
async function resolveProducts(db,companyId,refs){
  const skus=[...new Set(refs.map(ref=>String(ref.sku||"").trim()).filter(Boolean))],names=[...new Set(refs.map(ref=>String(ref.name||"").trim()).filter(Boolean))];
  const rows=await db.$queryRaw`SELECT "id","name","sku","salePrice","active" FROM "Product" WHERE "companyId"=${companyId} AND "active"=true AND (COALESCE("sku",'')=ANY(${skus}::text[]) OR "name"=ANY(${names}::text[])) ORDER BY "name","id"`;
  const bySku=resolveUnique(rows,row=>norm(row.sku),"SKU προϊόντος"),byName=resolveUnique(rows,row=>norm(row.name),"περιγραφή προϊόντος"),resolved=[],errors=[];
  for(const ref of refs){const sku=norm(ref.sku),key=sku?bySku.get(sku):byName.get(norm(ref.name));if(key.row){if(!resolved.some(row=>row.id===key.row.id))resolved.push(key.row)}else errors.push({name:ref.name,sku:ref.sku||null,error:key.error})}
  return {resolved,errors};
}
async function resolveStores(db,companyId,names){
  const unique=[...new Set(names.map(norm))],rows=await db.store.findMany({where:{companyId,active:true},select:{id:true,name:true},orderBy:{name:"asc"}}),byName=resolveUnique(rows,row=>norm(row.name),"κατάστημα"),resolved=[],errors=[];
  for(const name of unique){const result=byName.get(name);if(result.row){if(!resolved.some(row=>row.id===result.row.id))resolved.push(result.row)}else errors.push({name,error:result.error})}
  return {resolved,errors};
}
function nextPrice(oldPrice,mode,value){if(mode==="SET")return round2(value);if(mode==="INCREASE_PERCENT")return round2(oldPrice*(1+value/100));return round2(oldPrice*(1-value/100))}
async function buildPreview(db,companyId,body){
  const [productsResult,storesResult]=await Promise.all([resolveProducts(db,companyId,body.productRefs),resolveStores(db,companyId,body.storeNames)]),products=productsResult.resolved,stores=storesResult.resolved;
  if(productsResult.errors.length||storesResult.errors.length)return {resolutionErrors:[...productsResult.errors,...storesResult.errors],canCommit:false,rows:[],counts:{total:0,changed:0,unchanged:0,skipped:0,inactive:0},products,stores};
  if(products.length*stores.length>MAX_COMBINATIONS){const e=new Error(`Η προεπισκόπηση ξεπερνά τους ${MAX_COMBINATIONS} συνδυασμούς.`);e.status=400;throw e}
  const productIds=products.map(row=>row.id),storeIds=stores.map(row=>row.id);
  const mappings=await db.$queryRaw`SELECT "storeId","productId","salePrice","active" FROM "StoreProduct" WHERE "storeId"=ANY(${storeIds}::text[]) AND "productId"=ANY(${productIds}::text[])`;
  const map=new Map(mappings.map(row=>[`${row.storeId}:${row.productId}`,row])),rows=[];
  for(const product of products){for(const store of stores){const mapping=map.get(`${store.id}:${product.id}`);if(!mapping){rows.push({productId:product.id,productName:product.name,sku:product.sku||null,storeId:store.id,storeName:store.name,status:"NOT_IN_STORE",oldPrice:null,newPrice:null,active:false});continue}const oldPrice=round2(mapping.salePrice??product.salePrice??0),newPrice=nextPrice(oldPrice,body.mode,body.value),status=Math.abs(newPrice-oldPrice)<0.005?"UNCHANGED":mapping.active?"CHANGE":"CHANGE_INACTIVE";rows.push({productId:product.id,productName:product.name,sku:product.sku||null,storeId:store.id,storeName:store.name,status,oldPrice,newPrice,active:Boolean(mapping.active)})}}
  const counts=rows.reduce((a,row)=>{a.total++;if(row.status==="NOT_IN_STORE")a.skipped++;else if(row.status==="UNCHANGED")a.unchanged++;else{a.changed++;if(row.status==="CHANGE_INACTIVE")a.inactive++}return a},{total:0,changed:0,unchanged:0,skipped:0,inactive:0});
  const hashBasis=rows.map(row=>[row.productId,row.storeId,row.status,row.oldPrice,row.newPrice,row.active]).sort((a,b)=>`${a[0]}:${a[1]}`.localeCompare(`${b[0]}:${b[1]}`));
  const previewHash=crypto.createHash("sha256").update(JSON.stringify({companyId,mode:body.mode,value:Number(body.value),hashBasis})).digest("hex");
  return {previewHash,canCommit:counts.changed>0,counts,products:products.map(row=>({id:row.id,name:row.name,sku:row.sku||null})),stores,rows:rows.slice(0,MAX_SAMPLE_ROWS),sampleTruncated:rows.length>MAX_SAMPLE_ROWS,resolutionErrors:[]};
}

router.post("/prices/bulk/preview",async(req,res,next)=>{try{const companyId=req.user.companyId,body=baseSchema.parse(req.body||{}),preview=await buildPreview(prisma,companyId,body);if(preview.resolutionErrors.length)return res.status(409).json({error:"Δεν μπόρεσαν να αντιστοιχιστούν μοναδικά όλα τα επιλεγμένα προϊόντα ή καταστήματα.",code:"BULK_SELECTION_RESOLUTION_FAILED",...preview});res.json(preview)}catch(error){if(error?.name==="ZodError")return res.status(400).json({error:"Ελέγξτε προϊόντα, καταστήματα και τιμή της μαζικής αλλαγής.",details:error.issues});next(error)}});

router.post("/prices/bulk/commit",async(req,res,next)=>{try{
  const companyId=req.user.companyId,body=commitSchema.parse(req.body||{}),actorName=req.user.fullName||req.user.email||"Χρήστης";
  const result=await prisma.$transaction(async tx=>{
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`bulk-price:${companyId}`})) AS locked`;
    const preview=await buildPreview(tx,companyId,body);if(preview.resolutionErrors.length){const e=new Error("Η επιλογή προϊόντων/καταστημάτων άλλαξε.");e.status=409;e.code="BULK_PREVIEW_STALE";throw e}if(preview.previewHash!==body.previewHash){const e=new Error("Οι πραγματικές τιμές ή η επιλογή άλλαξαν μετά την προεπισκόπηση. Κάνε νέα προεπισκόπηση.");e.status=409;e.code="BULK_PREVIEW_STALE";throw e}if(preview.counts.skipped>0&&!body.acceptSkipped){const e=new Error(`Υπάρχουν ${preview.counts.skipped} συνδυασμοί χωρίς προϊόν στο κατάστημα. Επιβεβαίωσε ρητά ότι θα παραλειφθούν.`);e.status=409;e.code="BULK_SKIPPED_CONFIRMATION_REQUIRED";throw e}
    const productIds=preview.products.map(row=>row.id),storeIds=preview.stores.map(row=>row.id),currentRows=await tx.$queryRaw`SELECT sp."storeId",sp."productId",sp."salePrice",sp."active",p."salePrice" AS "basePrice" FROM "StoreProduct" sp JOIN "Product" p ON p."id"=sp."productId" AND p."companyId"=${companyId} WHERE sp."storeId"=ANY(${storeIds}::text[]) AND sp."productId"=ANY(${productIds}::text[]) FOR UPDATE OF sp`;
    const current=new Map(currentRows.map(row=>[`${row.storeId}:${row.productId}`,row])),changes=[];
    for(const product of preview.products){for(const store of preview.stores){const row=current.get(`${store.id}:${product.id}`);if(!row)continue;const oldPrice=round2(row.salePrice??row.basePrice??0),newPrice=nextPrice(oldPrice,body.mode,body.value);if(Math.abs(newPrice-oldPrice)<0.005)continue;changes.push({productId:product.id,storeId:store.id,oldPrice,newPrice,active:Boolean(row.active)})}}
    const freshBasis=[...changes.map(row=>[row.productId,row.storeId,row.active?"CHANGE":"CHANGE_INACTIVE",row.oldPrice,row.newPrice,row.active])];for(const product of preview.products){for(const store of preview.stores){if(!current.has(`${store.id}:${product.id}`))freshBasis.push([product.id,store.id,"NOT_IN_STORE",null,null,false]);else{const row=current.get(`${store.id}:${product.id}`),oldPrice=round2(row.salePrice??row.basePrice??0),newPrice=nextPrice(oldPrice,body.mode,body.value);if(Math.abs(newPrice-oldPrice)<0.005)freshBasis.push([product.id,store.id,"UNCHANGED",oldPrice,newPrice,Boolean(row.active)])}}}freshBasis.sort((a,b)=>`${a[0]}:${a[1]}`.localeCompare(`${b[0]}:${b[1]}`));const lockedHash=crypto.createHash("sha256").update(JSON.stringify({companyId,mode:body.mode,value:Number(body.value),hashBasis:freshBasis})).digest("hex");if(lockedHash!==body.previewHash){const e=new Error("Κάποια τιμή άλλαξε ενώ γινόταν η επιβεβαίωση. Κάνε νέα προεπισκόπηση.");e.status=409;e.code="BULK_PREVIEW_STALE";throw e}
    for(const change of changes){await tx.$executeRaw`INSERT INTO "ProductPriceHistory" ("id","companyId","productId","storeId","oldPrice","newPrice","changeType","createdByUserId") VALUES (${uid()},${companyId},${change.productId},${change.storeId},${change.oldPrice},${change.newPrice},'BULK_STORE_PRICE',${req.user.id})`;await tx.$executeRaw`UPDATE "StoreProduct" SET "salePrice"=${change.newPrice},"updatedAt"=CURRENT_TIMESTAMP WHERE "storeId"=${change.storeId} AND "productId"=${change.productId}`}
    await tx.$executeRaw`INSERT INTO "BulkPriceBatchAudit" ("id","companyId","mode","value","productIdsJson","storeIdsJson","previewHash","changedCount","unchangedCount","skippedCount","actorId","actorName") VALUES (${uid()},${companyId},${body.mode},${body.value},${JSON.stringify(productIds)}::jsonb,${JSON.stringify(storeIds)}::jsonb,${body.previewHash},${changes.length},${preview.counts.unchanged},${preview.counts.skipped},${req.user.id},${actorName})`;
    return {changed:changes.length,unchanged:preview.counts.unchanged,skipped:preview.counts.skipped,products:productIds.length,stores:storeIds.length};
  },{isolationLevel:"Serializable"});
  res.json({ok:true,...result});
}catch(error){if(error?.name==="ZodError")return res.status(400).json({error:"Η τελική εφαρμογή δεν είναι έγκυρη ή δεν έχει επιβεβαιωθεί.",details:error.issues});if(error?.code==="P2034")return res.status(409).json({error:"Οι τιμές άλλαξαν ταυτόχρονα από άλλη ενέργεια. Κάνε νέα προεπισκόπηση.",code:"BULK_PREVIEW_STALE"});next(error)}});

router.post("/prices/bulk",(req,res)=>res.status(409).json({error:"Η μαζική αλλαγή τιμών απαιτεί πρώτα Προεπισκόπηση και μετά Τελική εφαρμογή.",code:"BULK_PREVIEW_REQUIRED"}));

export {nextPrice};
export default router;
