import crypto from "crypto";
import {Router} from "express";
import {z} from "zod";
import {prisma} from "../prisma.js";
import {parsePromotionDate} from "../promotion-time.js";

const router=Router();
const roles=new Set(["SUPER_ADMIN","OWNER","ADMIN","MANAGER"]);
const id=()=>crypto.randomUUID();
const n=value=>Number(value||0);
const round4=value=>Number(Number(value||0).toFixed(4));

function requireAccess(req,res,next){if(req.user?.tokenType==="STORE_OPERATOR"||!roles.has(req.user?.role))return res.status(403).json({error:"Η διαχείριση προσφορών είναι διαθέσιμη μόνο σε Super Admin, Ιδιοκτήτη, Admin ή Manager."});next()}
router.use(requireAccess);

const storeIdsSchema=z.array(z.string().min(1)).max(200).default([]);
const commonFields={offerPrice:z.coerce.number().min(0).nullable().optional(),discountPercent:z.coerce.number().min(0).max(100).optional(),saleQuantity:z.coerce.number().positive().max(9999).optional(),bonusQuantity:z.coerce.number().min(0).max(9999).optional(),customerPoints:z.coerce.number().min(0).max(999999).optional(),validFrom:z.union([z.string(),z.date()]).optional(),validUntil:z.union([z.string(),z.date()]).nullable().optional(),active:z.boolean().optional(),storeIds:storeIdsSchema};
const createBody=z.object({productId:z.string().min(1),promotionType:z.enum(["LEAFLET","GIFT"]),...commonFields,validFrom:z.union([z.string(),z.date()]),active:z.boolean().default(true),discountPercent:z.coerce.number().min(0).max(100).default(0),saleQuantity:z.coerce.number().positive().max(9999).default(1),bonusQuantity:z.coerce.number().min(0).max(9999).default(0),customerPoints:z.coerce.number().min(0).max(999999).default(0)});
const patchBody=z.object(commonFields);
const scopeBody=z.object({storeIds:storeIdsSchema});
const asDate=(value,required=false)=>{if(value===null||value===undefined||value===""){if(required){const e=new Error("Λείπει η έναρξη ισχύος.");e.status=400;throw e}return null}const date=parsePromotionDate(value);if(!(date instanceof Date)||Number.isNaN(date.getTime())){const e=new Error("Μη έγκυρη ημερομηνία προσφοράς.");e.status=400;throw e}return date};

async function ownedProduct(companyId,productId){const rows=await prisma.$queryRaw`SELECT "id","name","salePrice" FROM "Product" WHERE "companyId"=${companyId} AND "id"=${productId} AND "active"=true LIMIT 1`;return rows[0]||null}
async function ownedPromotion(companyId,promotionId){const rows=await prisma.$queryRaw`SELECT * FROM "PriceCatalogPromotion" WHERE "companyId"=${companyId} AND "id"=${promotionId} LIMIT 1`;return rows[0]||null}
async function storesFor(companyId,values){const ids=[...new Set((values||[]).map(v=>String(v||"").trim()).filter(Boolean))];if(!ids.length)return [];const stores=await prisma.store.findMany({where:{companyId,active:true,id:{in:ids}},select:{id:true,name:true},orderBy:{name:"asc"}});if(stores.length!==ids.length){const e=new Error("Ένα ή περισσότερα καταστήματα δεν ανήκουν στην εταιρεία ή δεν είναι ενεργά.");e.status=400;throw e}return stores}
function overlapSqlDateEnd(value){return value||new Date("9999-12-31T23:59:59.999Z")}
async function findOverlap(db,{companyId,productId,promotionType,validFrom,validUntil,storeIds,excludePromotionId=null}){
  if(!storeIds.length)return [];
  return db.$queryRaw`SELECT DISTINCT pr."id",pr."productId",pr."promotionType",pr."validFrom",pr."validUntil",ps."storeId" FROM "PriceCatalogPromotion" pr JOIN "PriceCatalogPromotionStore" ps ON ps."promotionId"=pr."id" AND ps."companyId"=pr."companyId" WHERE pr."companyId"=${companyId} AND pr."productId"=${productId} AND pr."promotionType"=${promotionType} AND pr."active"=true AND (${excludePromotionId}::text IS NULL OR pr."id"<>${excludePromotionId}) AND ps."storeId"=ANY(${storeIds}::text[]) AND pr."validFrom"<=${overlapSqlDateEnd(validUntil)} AND COALESCE(pr."validUntil",'infinity'::timestamptz)>=${validFrom}`;
}
async function lockScope(tx,{companyId,productId,promotionType,storeIds}){for(const storeId of [...new Set(storeIds)].sort()){const key=`promo:${companyId}:${productId}:${promotionType}:${storeId}`;await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${key})) AS locked`}}
function overlapError(rows){const error=new Error("PROMOTION_STORE_OVERLAP");error.status=409;error.code="PROMOTION_STORE_OVERLAP";error.rows=rows;return error}
function overlapResponse(res,rows){const storeIds=[...new Set(rows.map(r=>r.storeId))],promotionIds=[...new Set(rows.map(r=>r.id))];return res.status(409).json({error:`Υπάρχει ήδη ενεργή προσφορά ίδιου τύπου που επικαλύπτεται σε ${storeIds.length} κατάστημα/τα. Απενεργοποίησε ή άλλαξε το διάστημα της προηγούμενης προσφοράς.`,code:"PROMOTION_STORE_OVERLAP",storeIds,promotionIds})}
async function replaceStores(tx,companyId,promotionId,stores){await tx.$executeRaw`DELETE FROM "PriceCatalogPromotionStore" WHERE "companyId"=${companyId} AND "promotionId"=${promotionId}`;for(const store of stores)await tx.$executeRaw`INSERT INTO "PriceCatalogPromotionStore" ("promotionId","companyId","storeId") VALUES (${promotionId},${companyId},${store.id}) ON CONFLICT ("promotionId","storeId") DO NOTHING`}
function routeError(res,next,error,message){if(error?.code==="PROMOTION_STORE_OVERLAP")return overlapResponse(res,error.rows||[]);if(error?.name==="ZodError")return res.status(400).json({error:message,details:error.issues});next(error)}

router.post("/promotions/scoped",async(req,res,next)=>{try{
  const companyId=req.user.companyId,b=createBody.parse(req.body||{}),product=await ownedProduct(companyId,b.productId);if(!product)return res.status(404).json({error:"Δεν βρέθηκε ενεργό προϊόν."});const stores=await storesFor(companyId,b.storeIds);if(b.active&&!stores.length)return res.status(400).json({error:"Επίλεξε τουλάχιστον ένα κατάστημα POS για ενεργή προσφορά."});const validFrom=asDate(b.validFrom,true),validUntil=asDate(b.validUntil,false);if(validUntil&&validUntil<validFrom)return res.status(400).json({error:"Η λήξη προσφοράς δεν μπορεί να είναι πριν από την έναρξη."});
  const originalPrice=n(product.salePrice),offerPrice=b.promotionType==="LEAFLET"?round4(b.offerPrice??Math.max(0,originalPrice*(1-b.discountPercent/100))):null,discount=b.promotionType==="LEAFLET"&&originalPrice>0?round4(((originalPrice-n(offerPrice))/originalPrice)*100):b.discountPercent,promotionId=id(),actor=req.user.fullName||req.user.email||"Χρήστης",storeIds=stores.map(s=>s.id);
  await prisma.$transaction(async tx=>{await lockScope(tx,{companyId,productId:product.id,promotionType:b.promotionType,storeIds});const overlaps=b.active?await findOverlap(tx,{companyId,productId:product.id,promotionType:b.promotionType,validFrom,validUntil,storeIds}):[];if(overlaps.length)throw overlapError(overlaps);await tx.$executeRaw`INSERT INTO "PriceCatalogPromotion" ("id","companyId","productId","promotionType","originalPrice","offerPrice","discountPercent","saleQuantity","bonusQuantity","customerPoints","validFrom","validUntil","active","createdByUserId","createdByName") VALUES (${promotionId},${companyId},${product.id},${b.promotionType},${originalPrice},${offerPrice},${discount},${b.saleQuantity},${b.bonusQuantity},${b.customerPoints},${validFrom},${validUntil},${b.active},${req.user.id},${actor})`;await replaceStores(tx,companyId,promotionId,stores)});
  res.status(201).json({id:promotionId,storeIds,posActive:b.active&&stores.length>0});
}catch(error){routeError(res,next,error,"Ελέγξτε τα στοιχεία και τα καταστήματα της προσφοράς.")}});

router.patch("/promotions/:promotionId/scoped",async(req,res,next)=>{try{
  const companyId=req.user.companyId,old=await ownedPromotion(companyId,req.params.promotionId);if(!old)return res.status(404).json({error:"Δεν βρέθηκε η προσφορά."});const b=patchBody.parse(req.body||{}),stores=await storesFor(companyId,b.storeIds),active=b.active===undefined?old.active:b.active;if(active&&!stores.length)return res.status(400).json({error:"Επίλεξε τουλάχιστον ένα κατάστημα POS για ενεργή προσφορά."});const validFrom=b.validFrom===undefined?new Date(old.validFrom):asDate(b.validFrom,true),validUntil=b.validUntil===undefined?(old.validUntil?new Date(old.validUntil):null):asDate(b.validUntil,false);if(validUntil&&validUntil<validFrom)return res.status(400).json({error:"Η λήξη προσφοράς δεν μπορεί να είναι πριν από την έναρξη."});const product=await ownedProduct(companyId,old.productId);if(!product)return res.status(404).json({error:"Δεν βρέθηκε το προϊόν της προσφοράς."});
  const originalPrice=n(old.originalPrice||product.salePrice),offerPrice=old.promotionType==="LEAFLET"?(b.offerPrice===undefined?(old.offerPrice===null?null:n(old.offerPrice)):round4(b.offerPrice)):null,discount=old.promotionType==="LEAFLET"&&offerPrice!==null&&originalPrice>0?round4(((originalPrice-n(offerPrice))/originalPrice)*100):(b.discountPercent===undefined?n(old.discountPercent):b.discountPercent),storeIds=stores.map(s=>s.id);
  await prisma.$transaction(async tx=>{await lockScope(tx,{companyId,productId:old.productId,promotionType:old.promotionType,storeIds});const overlaps=active?await findOverlap(tx,{companyId,productId:old.productId,promotionType:old.promotionType,validFrom,validUntil,storeIds,excludePromotionId:old.id}):[];if(overlaps.length)throw overlapError(overlaps);await tx.$executeRaw`UPDATE "PriceCatalogPromotion" SET "offerPrice"=${offerPrice},"discountPercent"=${discount},"saleQuantity"=${b.saleQuantity===undefined?n(old.saleQuantity):b.saleQuantity},"bonusQuantity"=${b.bonusQuantity===undefined?n(old.bonusQuantity):b.bonusQuantity},"customerPoints"=${b.customerPoints===undefined?n(old.customerPoints):b.customerPoints},"validFrom"=${validFrom},"validUntil"=${validUntil},"active"=${active},"updatedAt"=NOW() WHERE "id"=${old.id} AND "companyId"=${companyId}`;await replaceStores(tx,companyId,old.id,stores)});
  res.json({ok:true,id:old.id,storeIds,posActive:active&&stores.length>0});
}catch(error){routeError(res,next,error,"Ελέγξτε τα στοιχεία και τα καταστήματα της προσφοράς.")}});

router.put("/promotions/:promotionId/stores",async(req,res,next)=>{try{
  const companyId=req.user.companyId,promotion=await ownedPromotion(companyId,req.params.promotionId);if(!promotion)return res.status(404).json({error:"Δεν βρέθηκε η προσφορά."});const b=scopeBody.parse(req.body||{}),stores=await storesFor(companyId,b.storeIds),validFrom=new Date(promotion.validFrom),validUntil=promotion.validUntil?new Date(promotion.validUntil):null,storeIds=stores.map(s=>s.id);
  await prisma.$transaction(async tx=>{await lockScope(tx,{companyId,productId:promotion.productId,promotionType:promotion.promotionType,storeIds});const overlaps=promotion.active?await findOverlap(tx,{companyId,productId:promotion.productId,promotionType:promotion.promotionType,validFrom,validUntil,storeIds,excludePromotionId:promotion.id}):[];if(overlaps.length)throw overlapError(overlaps);await replaceStores(tx,companyId,promotion.id,stores)});
  res.json({ok:true,storeIds,posActive:promotion.active&&stores.length>0});
}catch(error){routeError(res,next,error,"Μη έγκυρη επιλογή καταστημάτων.")}});

router.get("/promotions/scoped",async(req,res,next)=>{try{
  const companyId=req.user.companyId;
  const rows=await prisma.$queryRaw\`SELECT pr."id",pr."productId",p."name" AS "productName",p."sku",pr."promotionType",pr."originalPrice",pr."offerPrice",pr."discountPercent",pr."saleQuantity",pr."bonusQuantity",pr."validFrom",pr."validUntil",pr."active",pr."createdAt",pr."createdByName",COALESCE(json_agg(json_build_object('id',s."id",'name',s."name")) FILTER (WHERE s."id" IS NOT NULL),'[]'::json) AS "stores"
    FROM "PriceCatalogPromotion" pr
    JOIN "Product" p ON p."id"=pr."productId" AND p."companyId"=pr."companyId"
    LEFT JOIN "PriceCatalogPromotionStore" ps ON ps."promotionId"=pr."id" AND ps."companyId"=pr."companyId"
    LEFT JOIN "Store" s ON s."id"=ps."storeId" AND s."companyId"=pr."companyId"
    WHERE pr."companyId"=\${companyId}
    GROUP BY pr."id",p."name",p."sku"
    ORDER BY pr."validFrom" DESC,pr."createdAt" DESC LIMIT 1000\`;
  res.json({items:rows,count:rows.length});
}catch(error){next(error)}});

export default router;
