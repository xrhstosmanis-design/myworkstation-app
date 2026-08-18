import crypto from "crypto";
import {Router} from "express";
import {z} from "zod";
import {prisma} from "../prisma.js";

const router=Router();
const money=v=>Number(v||0);
let preparationBatchReady=false;
function assertStore(req,storeId){if(req.user?.tokenType==="STORE_OPERATOR"&&req.user.storeId!==storeId){const e=new Error("Η πρόσβαση ισχύει μόνο για το δικό σου κατάστημα.");e.status=403;throw e}}
async function storeFor(req,id){const store=await prisma.store.findFirst({where:{id,companyId:req.user.companyId,active:true},select:{id:true,companyId:true}});if(!store){const e=new Error("Δεν βρέθηκε ενεργό κατάστημα.");e.status=404;throw e}return store}
async function ensurePreparationBatchTable(){if(preparationBatchReady)return;await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "StorePreparationBatch" ("id" TEXT PRIMARY KEY,"companyId" TEXT NOT NULL,"storeId" TEXT NOT NULL,"operatorId" TEXT,"operatorName" TEXT,"productionStation" TEXT NOT NULL DEFAULT 'ΠΑΡΑΓΩΓΗ',"priority" TEXT NOT NULL DEFAULT 'NORMAL',"note" TEXT,"itemsJson" JSONB NOT NULL DEFAULT '[]'::jsonb,"status" TEXT NOT NULL DEFAULT 'SENT',"createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW())`);await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "StorePreparationBatch_store_created_idx" ON "StorePreparationBatch"("storeId","createdAt" DESC)`);preparationBatchReady=true}

router.get("/stores/:storeId/modifiers",async(req,res,next)=>{try{assertStore(req,req.params.storeId);await storeFor(req,req.params.storeId);const productId=String(req.query.productId||"").trim();let groups=[];if(productId){groups=await prisma.$queryRaw`
 SELECT g."id",g."description",pg."required",pg."minSelections",pg."maxSelections",pg."sequence",
 COALESCE(json_agg(json_build_object('id',m."id",'description',m."description",'price',m."price") ORDER BY m."sequence",m."description") FILTER (WHERE m."id" IS NOT NULL AND m."active"=true),'[]') AS "items"
 FROM "PreparationProductModifierGroup" pg
 JOIN "ManagementModifierGroup" g ON g."id"=pg."groupId" AND g."companyId"=pg."companyId" AND g."active"=true
 LEFT JOIN "ManagementModifier" m ON m."groupId"=g."id" AND m."companyId"=g."companyId" AND m."active"=true
 WHERE pg."companyId"=${req.user.companyId} AND pg."productId"=${productId}
 GROUP BY g."id",g."description",pg."required",pg."minSelections",pg."maxSelections",pg."sequence"
 ORDER BY pg."sequence",g."description"`;}else{groups=await prisma.$queryRaw`
 SELECT g."id",g."description",false AS "required",0 AS "minSelections",1 AS "maxSelections",0 AS "sequence",
 COALESCE(json_agg(json_build_object('id',m."id",'description',m."description",'price',m."price") ORDER BY m."sequence",m."description") FILTER (WHERE m."id" IS NOT NULL AND m."active"=true),'[]') AS "items"
 FROM "ManagementModifierGroup" g LEFT JOIN "ManagementModifier" m ON m."groupId"=g."id" AND m."companyId"=g."companyId" AND m."active"=true
 WHERE g."companyId"=${req.user.companyId} AND g."active"=true GROUP BY g."id",g."description" ORDER BY g."description"`;}
 const settings=productId?(await prisma.$queryRaw`SELECT "preparationEnabled","environmentalFee","productionStation","autoPrint" FROM "PreparationProductSettings" WHERE "companyId"=${req.user.companyId} AND "productId"=${productId} LIMIT 1`)[0]:null;
 res.json({productId:productId||null,settings:settings?{...settings,environmentalFee:money(settings.environmentalFee)}:null,groups:groups.map(g=>({...g,minSelections:Number(g.minSelections||0),maxSelections:Number(g.maxSelections||1),sequence:Number(g.sequence||0),items:(g.items||[]).map(x=>({...x,price:money(x.price)}))}))});
 }catch(e){next(e)}});

const preparationSchema=z.object({
 items:z.array(z.object({
  productId:z.string().min(1),
  quantity:z.coerce.number().positive().max(999),
  modifiers:z.array(z.object({id:z.string().min(1),description:z.string().trim().max(200).optional().default(""),price:z.coerce.number().min(-9999).max(9999).optional().default(0)})).max(30).optional().default([])
 })).min(1).max(100),
 note:z.string().trim().max(1000).optional().nullable(),
 priority:z.enum(["NORMAL","DOCTOR","NURSE","STAFF"]).optional().default("NORMAL"),
 productionStation:z.string().trim().min(1).max(120).optional().default("ΠΑΡΑΓΩΓΗ")
});

router.post("/stores/:storeId/preparation",async(req,res,next)=>{try{
 assertStore(req,req.params.storeId);const store=await storeFor(req,req.params.storeId),body=preparationSchema.parse(req.body||{});await ensurePreparationBatchTable();
 const productIds=[...new Set(body.items.map(x=>x.productId))];
 const products=await prisma.$queryRaw`SELECT p."id",p."name",p."sku" FROM "Product" p JOIN "StoreProduct" sp ON sp."productId"=p."id" AND sp."storeId"=${store.id} AND sp."active"=true JOIN "PreparationProductSettings" ps ON ps."companyId"=p."companyId" AND ps."productId"=p."id" AND ps."preparationEnabled"=true WHERE p."companyId"=${req.user.companyId} AND p."active"=true AND p."id"=ANY(${productIds}::text[])`;
 if(products.length!==productIds.length)return res.status(400).json({error:"Ένα ή περισσότερα προϊόντα δεν είναι ενεργά για παρασκευή στο κατάστημα."});
 const realModifierIds=[...new Set(body.items.flatMap(x=>x.modifiers||[]).map(x=>x.id).filter(id=>!id.startsWith("synthetic-")))];
 if(realModifierIds.length){const valid=await prisma.$queryRaw`SELECT "id" FROM "ManagementModifier" WHERE "companyId"=${req.user.companyId} AND "active"=true AND "id"=ANY(${realModifierIds}::text[])`;if(valid.length!==realModifierIds.length)return res.status(400).json({error:"Ένα ή περισσότερα Modifiers δεν είναι ενεργά στην εταιρεία."});}
 const id=crypto.randomUUID(),operatorName=req.user.fullName||req.user.name||"Πωλητής";
 await prisma.$executeRaw`INSERT INTO "StorePreparationBatch" ("id","companyId","storeId","operatorId","operatorName","productionStation","priority","note","itemsJson","status") VALUES (${id},${req.user.companyId},${store.id},${req.user.id||null},${operatorName},${body.productionStation},${body.priority},${body.note||null},${JSON.stringify(body.items)}::jsonb,'SENT')`;
 res.status(201).json({ok:true,id,batchId:id,status:"SENT",itemCount:body.items.reduce((sum,x)=>sum+Number(x.quantity||0),0),productionStation:body.productionStation,priority:body.priority});
 }catch(e){if(e?.name==="ZodError")return res.status(400).json({error:"Έλεγξε τα προϊόντα και τις επιλογές παρασκευής.",details:e.issues});next(e)}});

export default router;
