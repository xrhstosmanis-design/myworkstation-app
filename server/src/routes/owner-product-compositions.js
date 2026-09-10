import crypto from "crypto";
import {Router} from "express";
import {z} from "zod";
import {prisma} from "../prisma.js";

const router=Router();
const uid=()=>crypto.randomUUID();
const n=value=>Number(value||0);
let ready;

async function ensure(){
  if(ready)return ready;
  ready=(async()=>{
    await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "ProductSetItem" (
      "id" TEXT PRIMARY KEY,"companyId" TEXT NOT NULL,"productId" TEXT NOT NULL,"relatedProductId" TEXT NOT NULL,
      "quantity" NUMERIC(14,4) NOT NULL DEFAULT 1,"salePrice" NUMERIC(14,4),"updatedBy" TEXT,"updatedByName" TEXT,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),"updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
    await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "ProductSetItem_unique" ON "ProductSetItem"("companyId","productId","relatedProductId")`);
    await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "PreparationRecipeLine" ("id" TEXT PRIMARY KEY,"companyId" TEXT NOT NULL,"productId" TEXT NOT NULL,"ingredientProductId" TEXT NOT NULL,"quantity" NUMERIC(14,4) NOT NULL DEFAULT 0,"unit" TEXT NOT NULL DEFAULT 'PCS',"automatic" BOOLEAN NOT NULL DEFAULT true,"createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),"updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
    await prisma.$executeRawUnsafe(`ALTER TABLE "PreparationRecipeLine" ADD COLUMN IF NOT EXISTS "updatedBy" TEXT`);
    await prisma.$executeRawUnsafe(`ALTER TABLE "PreparationRecipeLine" ADD COLUMN IF NOT EXISTS "updatedByName" TEXT`);
    await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "StoreOperatorAudit" ("id" TEXT PRIMARY KEY,"companyId" TEXT NOT NULL,"storeId" TEXT NOT NULL,"operatorId" TEXT,"actorId" TEXT NOT NULL,"eventType" TEXT NOT NULL,"details" JSONB NOT NULL DEFAULT '{}'::jsonb,"createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
  })();return ready;
}
router.use(async(req,res,next)=>{try{await ensure();next()}catch(error){next(error)}});

async function product(req,id){return (await prisma.$queryRaw`SELECT "id","name","sku" FROM "Product" WHERE "id"=${id} AND "companyId"=${req.user.companyId} LIMIT 1`)[0]}
async function audit(req,productId,action,details){
  const stores=await prisma.$queryRaw`SELECT s."id" FROM "Store" s JOIN "StoreProduct" sp ON sp."storeId"=s."id" WHERE s."companyId"=${req.user.companyId} AND sp."productId"=${productId}`;
  for(const store of stores)await prisma.$executeRaw`INSERT INTO "StoreOperatorAudit" ("id","companyId","storeId","operatorId","actorId","eventType","details") VALUES (${uid()},${req.user.companyId},${store.id},${req.user.id},${req.user.id},'PRODUCT_COMPOSITION_UPDATED',${JSON.stringify({productId,action,...details,actorName:req.user.fullName||req.user.email||"BackOffice",terminalPos:"BACKOFFICE"})}::jsonb)`;
}

router.get("/:productId/composition",async(req,res,next)=>{try{
  const parent=await product(req,req.params.productId);if(!parent)return res.status(404).json({error:"Δεν βρέθηκε το προϊόν."});
  const [setItems,recipeItems,candidates]=await Promise.all([
    prisma.$queryRaw`SELECT i."id",i."relatedProductId",i."quantity",i."salePrice",i."updatedAt",i."updatedByName",p."name" AS "relatedName",p."sku" AS "relatedSku",p."unit",p."salePrice" AS "defaultSalePrice" FROM "ProductSetItem" i JOIN "Product" p ON p."id"=i."relatedProductId" WHERE i."companyId"=${req.user.companyId} AND i."productId"=${parent.id} ORDER BY i."updatedAt" DESC`,
    prisma.$queryRaw`SELECT r."id",r."ingredientProductId",r."quantity",r."unit",r."automatic",r."updatedAt",r."updatedByName",p."name" AS "ingredientName",p."sku" AS "ingredientSku" FROM "PreparationRecipeLine" r JOIN "Product" p ON p."id"=r."ingredientProductId" WHERE r."companyId"=${req.user.companyId} AND r."productId"=${parent.id} ORDER BY p."name"`,
    prisma.$queryRaw`SELECT "id","name","sku","unit","salePrice" FROM "Product" WHERE "companyId"=${req.user.companyId} AND "active"=true AND "id"<>${parent.id} ORDER BY "name" LIMIT 5000`
  ]);
  res.json({product:parent,setItems:setItems.map(x=>({...x,quantity:n(x.quantity),salePrice:x.salePrice==null?null:n(x.salePrice),defaultSalePrice:n(x.defaultSalePrice)})),recipeItems:recipeItems.map(x=>({...x,quantity:n(x.quantity)})),candidates:candidates.map(x=>({...x,salePrice:n(x.salePrice)}))});
}catch(error){next(error)}});

const setSchema=z.object({relatedProductId:z.string().min(1),quantity:z.coerce.number().positive().max(100000),salePrice:z.coerce.number().min(0).max(100000).nullable().optional()});
router.post("/:productId/set-items",async(req,res,next)=>{try{
  const parent=await product(req,req.params.productId),body=setSchema.parse(req.body||{});if(!parent)return res.status(404).json({error:"Δεν βρέθηκε το προϊόν."});if(body.relatedProductId===parent.id)return res.status(400).json({error:"Το SET δεν μπορεί να περιέχει το ίδιο προϊόν."});
  const related=await product(req,body.relatedProductId);if(!related)return res.status(400).json({error:"Το συσχετιζόμενο προϊόν δεν είναι έγκυρο."});
  await prisma.$executeRaw`INSERT INTO "ProductSetItem" ("id","companyId","productId","relatedProductId","quantity","salePrice","updatedBy","updatedByName") VALUES (${uid()},${req.user.companyId},${parent.id},${related.id},${body.quantity},${body.salePrice??null},${req.user.id},${req.user.fullName||req.user.email||"BackOffice"}) ON CONFLICT ("companyId","productId","relatedProductId") DO UPDATE SET "quantity"=EXCLUDED."quantity","salePrice"=EXCLUDED."salePrice","updatedBy"=EXCLUDED."updatedBy","updatedByName"=EXCLUDED."updatedByName","updatedAt"=NOW()`;
  await audit(req,parent.id,"SET_ITEM_SAVED",{relatedProductId:related.id,relatedName:related.name,quantity:body.quantity,salePrice:body.salePrice??null});res.json({ok:true});
}catch(error){next(error)}});
router.delete("/:productId/set-items/:id",async(req,res,next)=>{try{const parent=await product(req,req.params.productId);if(!parent)return res.status(404).json({error:"Δεν βρέθηκε το προϊόν."});await prisma.$executeRaw`DELETE FROM "ProductSetItem" WHERE "id"=${req.params.id} AND "companyId"=${req.user.companyId} AND "productId"=${parent.id}`;await audit(req,parent.id,"SET_ITEM_DELETED",{relationId:req.params.id});res.json({ok:true})}catch(error){next(error)}});

const recipeSchema=z.object({ingredientProductId:z.string().min(1),quantity:z.coerce.number().positive().max(100000),unit:z.enum(["PCS","GR","ML"]).default("PCS")});
router.post("/:productId/recipe-items",async(req,res,next)=>{try{const parent=await product(req,req.params.productId),body=recipeSchema.parse(req.body||{}),actor=req.user.fullName||req.user.email||"BackOffice";if(!parent)return res.status(404).json({error:"Δεν βρέθηκε το προϊόν."});if(body.ingredientProductId===parent.id)return res.status(400).json({error:"Η συνταγή δεν μπορεί να περιέχει το ίδιο προϊόν."});const ingredient=await product(req,body.ingredientProductId);if(!ingredient)return res.status(400).json({error:"Το υλικό δεν είναι έγκυρο."});const old=(await prisma.$queryRaw`SELECT "id" FROM "PreparationRecipeLine" WHERE "companyId"=${req.user.companyId} AND "productId"=${parent.id} AND "ingredientProductId"=${ingredient.id} LIMIT 1`)[0];if(old)await prisma.$executeRaw`UPDATE "PreparationRecipeLine" SET "quantity"=${body.quantity},"unit"=${body.unit},"automatic"=true,"updatedBy"=${req.user.id},"updatedByName"=${actor},"updatedAt"=NOW() WHERE "id"=${old.id}`;else await prisma.$executeRaw`INSERT INTO "PreparationRecipeLine" ("id","companyId","productId","ingredientProductId","quantity","unit","automatic","updatedBy","updatedByName") VALUES (${uid()},${req.user.companyId},${parent.id},${ingredient.id},${body.quantity},${body.unit},true,${req.user.id},${actor})`;await audit(req,parent.id,"RECIPE_ITEM_SAVED",{ingredientProductId:ingredient.id,ingredientName:ingredient.name,quantity:body.quantity,unit:body.unit});res.json({ok:true})}catch(error){next(error)}});
router.delete("/:productId/recipe-items/:id",async(req,res,next)=>{try{const parent=await product(req,req.params.productId);if(!parent)return res.status(404).json({error:"Δεν βρέθηκε το προϊόν."});await prisma.$executeRaw`DELETE FROM "PreparationRecipeLine" WHERE "id"=${req.params.id} AND "companyId"=${req.user.companyId} AND "productId"=${parent.id}`;await audit(req,parent.id,"RECIPE_ITEM_DELETED",{relationId:req.params.id});res.json({ok:true})}catch(error){next(error)}});

export default router;
