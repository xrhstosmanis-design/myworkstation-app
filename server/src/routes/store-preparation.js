import crypto from "crypto";
import {Router} from "express";
import {z} from "zod";
import {prisma} from "../prisma.js";

const router=Router();
const money=v=>Number(v||0);
let preparationBatchReady=false;
function assertStore(req,storeId){if(req.user?.tokenType==="STORE_OPERATOR"&&req.user.storeId!==storeId){const e=new Error("Η πρόσβαση ισχύει μόνο για το δικό σου κατάστημα.");e.status=403;throw e}}
async function storeFor(req,id){const store=await prisma.store.findFirst({where:{id,companyId:req.user.companyId,active:true},select:{id:true,companyId:true}});if(!store){const e=new Error("Δεν βρέθηκε ενεργό κατάστημα.");e.status=404;throw e}return store}
async function ensurePreparationBatchTable(){
 if(preparationBatchReady)return;
 await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "StorePreparationBatch" ("id" TEXT PRIMARY KEY,"companyId" TEXT NOT NULL,"storeId" TEXT NOT NULL,"operatorId" TEXT,"operatorName" TEXT,"productionStation" TEXT NOT NULL DEFAULT 'ΠΑΡΑΓΩΓΗ',"priority" TEXT NOT NULL DEFAULT 'NORMAL',"note" TEXT,"itemsJson" JSONB NOT NULL DEFAULT '[]'::jsonb,"status" TEXT NOT NULL DEFAULT 'SENT',"saleId" TEXT,"consumedAt" TIMESTAMPTZ,"createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
 await prisma.$executeRawUnsafe(`ALTER TABLE "StorePreparationBatch" ADD COLUMN IF NOT EXISTS "saleId" TEXT`);
 await prisma.$executeRawUnsafe(`ALTER TABLE "StorePreparationBatch" ADD COLUMN IF NOT EXISTS "consumedAt" TIMESTAMPTZ`);
 await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "StorePreparationBatch_store_created_idx" ON "StorePreparationBatch"("storeId","createdAt" DESC)`);
 await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "PreparationStockConsumption" ("id" TEXT PRIMARY KEY,"companyId" TEXT NOT NULL,"storeId" TEXT NOT NULL,"saleId" TEXT NOT NULL,"batchId" TEXT NOT NULL,"sourceProductId" TEXT NOT NULL,"ingredientProductId" TEXT NOT NULL,"modifierId" TEXT,"quantity" NUMERIC(14,4) NOT NULL,"unit" TEXT NOT NULL DEFAULT 'PCS',"kind" TEXT NOT NULL,"createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
 await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "PreparationStockConsumption_sale_idx" ON "PreparationStockConsumption"("companyId","storeId","saleId")`);
 await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "PreparationStockConsumption_once_idx" ON "PreparationStockConsumption"("batchId","sourceProductId","ingredientProductId",COALESCE("modifierId",''),"kind")`);
 await prisma.$executeRawUnsafe(`
 CREATE OR REPLACE FUNCTION mws_consume_preparation_stock_from_pos_audit() RETURNS trigger AS $$
 DECLARE
   sale_id TEXT;
   sale_item JSONB;
   batch_id TEXT;
   batch_row RECORD;
   prep_item JSONB;
   recipe_row RECORD;
   modifier_json JSONB;
   modifier_row RECORD;
   product_qty NUMERIC;
   consume_qty NUMERIC;
   mismatch BOOLEAN;
   milk_modifier_id TEXT;
   milk_target_ingredient_id TEXT;
   milk_target_unit TEXT;
   milk_fallback_qty NUMERIC;
   milk_base_qty NUMERIC;
   ice_modifier_id TEXT;
   ice_target_ingredient_id TEXT;
   ice_base_qty NUMERIC;
   ice_target_qty NUMERIC;
   ice_description TEXT;
   decaf_modifier_id TEXT;
   decaf_ingredient_id TEXT;
   coffee_base_qty NUMERIC;
   coffee_base_ingredient_id TEXT;
   extra_modifier_id TEXT;
 BEGIN
   IF NEW."eventType" <> 'POS_SALE_COMPLETED' THEN RETURN NEW; END IF;
   sale_id := COALESCE(NEW."details"->>'saleId','');
   IF sale_id = '' THEN RETURN NEW; END IF;

   FOR sale_item IN SELECT value FROM jsonb_array_elements(COALESCE(NEW."details"->'items','[]'::jsonb)) LOOP
     IF COALESCE(sale_item->>'overrideReason','') LIKE 'PREPARATION:%' THEN
       batch_id := split_part(sale_item->>'overrideReason',':',2);
       IF batch_id = '' THEN CONTINUE; END IF;

       SELECT * INTO batch_row FROM "StorePreparationBatch"
       WHERE "id"=batch_id AND "companyId"=NEW."companyId" AND "storeId"=NEW."storeId" AND "status"='SENT'
       FOR UPDATE;
       IF NOT FOUND THEN CONTINUE; END IF;

       SELECT EXISTS(
         SELECT 1 FROM (
           SELECT x->>'productId' AS product_id,SUM(GREATEST(0,COALESCE((x->>'quantity')::numeric,0))) AS qty
           FROM jsonb_array_elements(COALESCE(batch_row."itemsJson",'[]'::jsonb)) x GROUP BY x->>'productId'
         ) b
         FULL OUTER JOIN (
           SELECT x->>'productId' AS product_id,SUM(GREATEST(0,COALESCE((x->>'quantity')::numeric,0))) AS qty
           FROM jsonb_array_elements(COALESCE(NEW."details"->'items','[]'::jsonb)) x
           WHERE COALESCE(x->>'overrideReason','')='PREPARATION:'||batch_id GROUP BY x->>'productId'
         ) s USING(product_id)
         WHERE b.product_id IS NULL OR s.product_id IS NULL OR b.qty IS DISTINCT FROM s.qty
       ) INTO mismatch;
       IF mismatch THEN RAISE EXCEPTION 'Η παραγγελία παρασκευής δεν συμφωνεί με τα προϊόντα/ποσότητες της πώλησης.' USING ERRCODE='P0001'; END IF;

       FOR prep_item IN SELECT value FROM jsonb_array_elements(COALESCE(batch_row."itemsJson",'[]'::jsonb)) LOOP
         product_qty := GREATEST(0,COALESCE((prep_item->>'quantity')::numeric,0));
         IF product_qty <= 0 THEN CONTINUE; END IF;

         milk_modifier_id:=NULL;milk_target_ingredient_id:=NULL;milk_target_unit:=NULL;milk_fallback_qty:=NULL;milk_base_qty:=0;
         SELECT m."id",c."ingredientProductId",c."unit",c."quantity" INTO milk_modifier_id,milk_target_ingredient_id,milk_target_unit,milk_fallback_qty
         FROM jsonb_array_elements(COALESCE(prep_item->'modifiers','[]'::jsonb)) j
         JOIN "ManagementModifier" m ON m."id"=j->>'id' AND m."companyId"=NEW."companyId" AND m."active"=TRUE
         JOIN "ManagementModifierGroup" g ON g."id"=m."groupId" AND g."companyId"=m."companyId" AND g."active"=TRUE
         JOIN "PreparationModifierConsumption" c ON c."companyId"=m."companyId" AND c."modifierId"=m."id"
         WHERE UPPER(g."description")='ΓΑΛΑ' LIMIT 1;

         ice_modifier_id:=NULL;ice_description:=NULL;ice_target_qty:=NULL;ice_base_qty:=0;ice_target_ingredient_id:=NULL;
         SELECT UPPER(j->>'description') INTO ice_description FROM jsonb_array_elements(COALESCE(prep_item->'modifiers','[]'::jsonb)) j
         WHERE COALESCE(j->>'id','') LIKE 'synthetic-ΠΑΓΟΣ ΠΟΣΟΤΗΤΑ-%' LIMIT 1;
         IF ice_description IS NULL THEN
           SELECT m."id",UPPER(m."description") INTO ice_modifier_id,ice_description
           FROM jsonb_array_elements(COALESCE(prep_item->'modifiers','[]'::jsonb)) j
           JOIN "ManagementModifier" m ON m."id"=j->>'id' AND m."companyId"=NEW."companyId" AND m."active"=TRUE
           JOIN "ManagementModifierGroup" g ON g."id"=m."groupId" AND g."companyId"=m."companyId" AND g."active"=TRUE
           WHERE UPPER(g."description")='ΠΑΓΟΣ' LIMIT 1;
         END IF;
         IF ice_description LIKE '%ΧΩΡΙΣ ΠΑΓΟ%' OR ice_description LIKE '%ΠΟΣΟΤΗΤΑ 0%' THEN ice_target_qty:=0;
         ELSIF ice_description LIKE '%ΛΙΓΟΣ ΠΑΓΟΣ%' OR ice_description LIKE '%ΠΟΣΟΤΗΤΑ 1%' THEN ice_target_qty:=50;
         ELSIF ice_description LIKE '%ΚΑΝΟΝΙΚΟΣ ΠΑΓΟΣ%' OR ice_description LIKE '%ΠΟΣΟΤΗΤΑ 2%' THEN ice_target_qty:=100;
         ELSIF ice_description LIKE '%ΠΟΛΥΣ ΠΑΓΟΣ%' OR ice_description LIKE '%ΠΟΣΟΤΗΤΑ 3%' THEN ice_target_qty:=150; END IF;

         decaf_modifier_id:=NULL;decaf_ingredient_id:=NULL;coffee_base_qty:=0;coffee_base_ingredient_id:=NULL;extra_modifier_id:=NULL;
         SELECT m."id" INTO decaf_modifier_id FROM jsonb_array_elements(COALESCE(prep_item->'modifiers','[]'::jsonb)) j JOIN "ManagementModifier" m ON m."id"=j->>'id' AND m."companyId"=NEW."companyId" AND m."active"=TRUE WHERE UPPER(m."description") LIKE '%DECAF%' LIMIT 1;
         SELECT m."id" INTO extra_modifier_id FROM jsonb_array_elements(COALESCE(prep_item->'modifiers','[]'::jsonb)) j JOIN "ManagementModifier" m ON m."id"=j->>'id' AND m."companyId"=NEW."companyId" AND m."active"=TRUE JOIN "ManagementModifierGroup" g ON g."id"=m."groupId" AND g."companyId"=m."companyId" WHERE UPPER(g."description")='EXTRA' AND UPPER(m."description")='EXTRA ΔΟΣΗ' LIMIT 1;
         SELECT p."id" INTO decaf_ingredient_id FROM "Product" p WHERE p."companyId"=NEW."companyId" AND p."sku"='MWS-PREP-DECAF' AND p."active"=TRUE LIMIT 1;

         FOR recipe_row IN
           SELECT r."ingredientProductId",r."quantity",r."unit",p."sku" AS ingredient_sku
           FROM "PreparationRecipeLine" r JOIN "Product" p ON p."id"=r."ingredientProductId" AND p."companyId"=r."companyId"
           WHERE r."companyId"=NEW."companyId" AND r."productId"=prep_item->>'productId' AND r."automatic"=TRUE
         LOOP
           IF milk_modifier_id IS NOT NULL AND recipe_row.ingredient_sku LIKE 'MWS-PREP-MILK%' THEN milk_base_qty:=milk_base_qty+recipe_row."quantity";CONTINUE; END IF;
           IF ice_target_qty IS NOT NULL AND recipe_row.ingredient_sku='MWS-PREP-ICE' THEN ice_base_qty:=ice_base_qty+recipe_row."quantity";ice_target_ingredient_id:=recipe_row."ingredientProductId";CONTINUE; END IF;
           IF recipe_row.ingredient_sku IN ('MWS-PREP-COFFEE-BEANS','MWS-PREP-DECAF') THEN
             coffee_base_qty:=coffee_base_qty+recipe_row."quantity";
             IF recipe_row.ingredient_sku='MWS-PREP-DECAF' OR decaf_modifier_id IS NOT NULL THEN coffee_base_ingredient_id:=decaf_ingredient_id; ELSE coffee_base_ingredient_id:=recipe_row."ingredientProductId"; END IF;
             CONTINUE;
           END IF;
           consume_qty := product_qty * recipe_row."quantity";
           UPDATE "StoreProduct" sp SET "currentStock"=COALESCE(sp."currentStock",0)-consume_qty FROM "Product" p
           WHERE sp."storeId"=NEW."storeId" AND sp."productId"=recipe_row."ingredientProductId" AND sp."active"=TRUE AND p."id"=sp."productId" AND p."companyId"=NEW."companyId" AND p."trackStock"=TRUE;
           INSERT INTO "PreparationStockConsumption" ("id","companyId","storeId","saleId","batchId","sourceProductId","ingredientProductId","modifierId","quantity","unit","kind") VALUES (gen_random_uuid()::text,NEW."companyId",NEW."storeId",sale_id,batch_id,prep_item->>'productId',recipe_row."ingredientProductId",NULL,consume_qty,recipe_row."unit",'RECIPE') ON CONFLICT DO NOTHING;
         END LOOP;

         IF coffee_base_qty>0 AND coffee_base_ingredient_id IS NOT NULL THEN
           consume_qty:=product_qty*coffee_base_qty;
           UPDATE "StoreProduct" sp SET "currentStock"=COALESCE(sp."currentStock",0)-consume_qty FROM "Product" p WHERE sp."storeId"=NEW."storeId" AND sp."productId"=coffee_base_ingredient_id AND sp."active"=TRUE AND p."id"=sp."productId" AND p."companyId"=NEW."companyId" AND p."trackStock"=TRUE;
           INSERT INTO "PreparationStockConsumption" ("id","companyId","storeId","saleId","batchId","sourceProductId","ingredientProductId","modifierId","quantity","unit","kind") VALUES (gen_random_uuid()::text,NEW."companyId",NEW."storeId",sale_id,batch_id,prep_item->>'productId',coffee_base_ingredient_id,decaf_modifier_id,consume_qty,'GR',CASE WHEN decaf_modifier_id IS NULL THEN 'RECIPE' ELSE 'MODIFIER_SUBSTITUTION' END) ON CONFLICT DO NOTHING;
         END IF;
         IF extra_modifier_id IS NOT NULL AND coffee_base_ingredient_id IS NOT NULL THEN
           consume_qty:=product_qty*9;
           UPDATE "StoreProduct" sp SET "currentStock"=COALESCE(sp."currentStock",0)-consume_qty FROM "Product" p WHERE sp."storeId"=NEW."storeId" AND sp."productId"=coffee_base_ingredient_id AND sp."active"=TRUE AND p."id"=sp."productId" AND p."companyId"=NEW."companyId" AND p."trackStock"=TRUE;
           INSERT INTO "PreparationStockConsumption" ("id","companyId","storeId","saleId","batchId","sourceProductId","ingredientProductId","modifierId","quantity","unit","kind") VALUES (gen_random_uuid()::text,NEW."companyId",NEW."storeId",sale_id,batch_id,prep_item->>'productId',coffee_base_ingredient_id,extra_modifier_id,consume_qty,'GR','MODIFIER') ON CONFLICT DO NOTHING;
         END IF;
         IF milk_modifier_id IS NOT NULL AND milk_target_ingredient_id IS NOT NULL THEN
           consume_qty:=product_qty*CASE WHEN milk_base_qty>0 THEN milk_base_qty ELSE COALESCE(milk_fallback_qty,0) END;
           IF consume_qty>0 THEN UPDATE "StoreProduct" sp SET "currentStock"=COALESCE(sp."currentStock",0)-consume_qty FROM "Product" p WHERE sp."storeId"=NEW."storeId" AND sp."productId"=milk_target_ingredient_id AND sp."active"=TRUE AND p."id"=sp."productId" AND p."companyId"=NEW."companyId" AND p."trackStock"=TRUE;
             INSERT INTO "PreparationStockConsumption" ("id","companyId","storeId","saleId","batchId","sourceProductId","ingredientProductId","modifierId","quantity","unit","kind") VALUES (gen_random_uuid()::text,NEW."companyId",NEW."storeId",sale_id,batch_id,prep_item->>'productId',milk_target_ingredient_id,milk_modifier_id,consume_qty,COALESCE(milk_target_unit,'ML'),'MODIFIER_SUBSTITUTION') ON CONFLICT DO NOTHING; END IF;
         END IF;
         IF ice_target_qty IS NOT NULL AND ice_target_ingredient_id IS NOT NULL AND ice_target_qty>0 THEN
           consume_qty:=product_qty*ice_target_qty;
           UPDATE "StoreProduct" sp SET "currentStock"=COALESCE(sp."currentStock",0)-consume_qty FROM "Product" p WHERE sp."storeId"=NEW."storeId" AND sp."productId"=ice_target_ingredient_id AND sp."active"=TRUE AND p."id"=sp."productId" AND p."companyId"=NEW."companyId" AND p."trackStock"=TRUE;
           INSERT INTO "PreparationStockConsumption" ("id","companyId","storeId","saleId","batchId","sourceProductId","ingredientProductId","modifierId","quantity","unit","kind") VALUES (gen_random_uuid()::text,NEW."companyId",NEW."storeId",sale_id,batch_id,prep_item->>'productId',ice_target_ingredient_id,ice_modifier_id,consume_qty,'GR','MODIFIER_SUBSTITUTION') ON CONFLICT DO NOTHING;
         END IF;

         FOR modifier_json IN SELECT value FROM jsonb_array_elements(COALESCE(prep_item->'modifiers','[]'::jsonb)) LOOP
           IF COALESCE(modifier_json->>'id','') = '' OR COALESCE(modifier_json->>'id','') LIKE 'synthetic-%' THEN CONTINUE; END IF;
           FOR modifier_row IN SELECT c."modifierId",c."ingredientProductId",c."quantity",c."unit",c."multiplierMode",g."description" AS group_name,m."description" AS modifier_name FROM "PreparationModifierConsumption" c JOIN "ManagementModifier" m ON m."id"=c."modifierId" AND m."companyId"=c."companyId" JOIN "ManagementModifierGroup" g ON g."id"=m."groupId" AND g."companyId"=m."companyId" WHERE c."companyId"=NEW."companyId" AND c."modifierId"=modifier_json->>'id' LOOP
             IF UPPER(modifier_row.group_name) IN ('ΓΑΛΑ','ΠΑΓΟΣ') THEN CONTINUE; END IF;
             IF UPPER(modifier_row.modifier_name) LIKE '%DECAF%' OR (UPPER(modifier_row.group_name)='EXTRA' AND UPPER(modifier_row.modifier_name)='EXTRA ΔΟΣΗ') THEN CONTINUE; END IF;
             consume_qty := product_qty * modifier_row."quantity";
             UPDATE "StoreProduct" sp SET "currentStock"=COALESCE(sp."currentStock",0)-consume_qty FROM "Product" p WHERE sp."storeId"=NEW."storeId" AND sp."productId"=modifier_row."ingredientProductId" AND sp."active"=TRUE AND p."id"=sp."productId" AND p."companyId"=NEW."companyId" AND p."trackStock"=TRUE;
             INSERT INTO "PreparationStockConsumption" ("id","companyId","storeId","saleId","batchId","sourceProductId","ingredientProductId","modifierId","quantity","unit","kind") VALUES (gen_random_uuid()::text,NEW."companyId",NEW."storeId",sale_id,batch_id,prep_item->>'productId',modifier_row."ingredientProductId",modifier_row."modifierId",consume_qty,modifier_row."unit",'MODIFIER') ON CONFLICT DO NOTHING;
           END LOOP;
         END LOOP;
       END LOOP;

       UPDATE "StorePreparationBatch" SET "status"='CONSUMED',"saleId"=sale_id,"consumedAt"=NOW() WHERE "id"=batch_id AND "status"='SENT';
     END IF;
   END LOOP;
   RETURN NEW;
 END;
 $$ LANGUAGE plpgsql;
 `);
 await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS "mws_consume_preparation_stock_after_pos_sale" ON "StoreOperatorAudit"`);
 await prisma.$executeRawUnsafe(`CREATE TRIGGER "mws_consume_preparation_stock_after_pos_sale" AFTER INSERT ON "StoreOperatorAudit" FOR EACH ROW EXECUTE FUNCTION mws_consume_preparation_stock_from_pos_audit()`);
 preparationBatchReady=true;
}

router.get("/stores/:storeId/modifiers",async(req,res,next)=>{try{assertStore(req,req.params.storeId);await storeFor(req,req.params.storeId);await ensurePreparationBatchTable();const productId=String(req.query.productId||"").trim();let groups=[];if(productId){groups=await prisma.$queryRaw`
 SELECT g."id",g."description",pg."required",pg."minSelections",pg."maxSelections",pg."sequence",
 COALESCE(json_agg(json_build_object('id',m."id",'description',m."description",'price',m."price") ORDER BY m."sequence",m."description") FILTER (WHERE m."id" IS NOT NULL AND m."active"=true),'[]') AS "items"
 FROM "PreparationProductModifierGroup" pg JOIN "ManagementModifierGroup" g ON g."id"=pg."groupId" AND g."companyId"=pg."companyId" AND g."active"=true LEFT JOIN "ManagementModifier" m ON m."groupId"=g."id" AND m."companyId"=g."companyId" AND m."active"=true
 WHERE pg."companyId"=${req.user.companyId} AND pg."productId"=${productId} GROUP BY g."id",g."description",pg."required",pg."minSelections",pg."maxSelections",pg."sequence" ORDER BY pg."sequence",g."description"`;}else{groups=await prisma.$queryRaw`
 SELECT g."id",g."description",false AS "required",0 AS "minSelections",1 AS "maxSelections",0 AS "sequence",COALESCE(json_agg(json_build_object('id',m."id",'description',m."description",'price',m."price") ORDER BY m."sequence",m."description") FILTER (WHERE m."id" IS NOT NULL AND m."active"=true),'[]') AS "items" FROM "ManagementModifierGroup" g LEFT JOIN "ManagementModifier" m ON m."groupId"=g."id" AND m."companyId"=g."companyId" AND m."active"=true WHERE g."companyId"=${req.user.companyId} AND g."active"=true GROUP BY g."id",g."description" ORDER BY g."description"`;}
 const settings=productId?(await prisma.$queryRaw`SELECT "preparationEnabled","environmentalFee","productionStation","autoPrint" FROM "PreparationProductSettings" WHERE "companyId"=${req.user.companyId} AND "productId"=${productId} LIMIT 1`)[0]:null;
 res.json({productId:productId||null,settings:settings?{...settings,environmentalFee:money(settings.environmentalFee)}:null,groups:groups.map(g=>({...g,minSelections:Number(g.minSelections||0),maxSelections:Number(g.maxSelections||1),sequence:Number(g.sequence||0),items:(g.items||[]).map(x=>({...x,price:money(x.price)}))}))});
 }catch(e){next(e)}});

const preparationSchema=z.object({items:z.array(z.object({productId:z.string().min(1),quantity:z.coerce.number().positive().max(999),modifiers:z.array(z.object({id:z.string().min(1),description:z.string().trim().max(200).optional().default(""),price:z.coerce.number().min(-9999).max(9999).optional().default(0)})).max(30).optional().default([])})).min(1).max(100),note:z.string().trim().max(1000).optional().nullable(),priority:z.enum(["NORMAL","DOCTOR","NURSE","STAFF"]).optional().default("NORMAL"),productionStation:z.string().trim().min(1).max(120).optional().default("ΠΑΡΑΓΩΓΗ")});
router.post("/stores/:storeId/preparation",async(req,res,next)=>{try{assertStore(req,req.params.storeId);const store=await storeFor(req,req.params.storeId),body=preparationSchema.parse(req.body||{});await ensurePreparationBatchTable();const productIds=[...new Set(body.items.map(x=>x.productId))];const products=await prisma.$queryRaw`SELECT p."id",p."name",p."sku" FROM "Product" p JOIN "StoreProduct" sp ON sp."productId"=p."id" AND sp."storeId"=${store.id} AND sp."active"=true JOIN "PreparationProductSettings" ps ON ps."companyId"=p."companyId" AND ps."productId"=p."id" AND ps."preparationEnabled"=true WHERE p."companyId"=${req.user.companyId} AND p."active"=true AND p."id"=ANY(${productIds}::text[])`;if(products.length!==productIds.length)return res.status(400).json({error:"Ένα ή περισσότερα προϊόντα δεν είναι ενεργά για παρασκευή στο κατάστημα."});const realModifierIds=[...new Set(body.items.flatMap(x=>x.modifiers||[]).map(x=>x.id).filter(id=>!id.startsWith("synthetic-")))];if(realModifierIds.length){const valid=await prisma.$queryRaw`SELECT "id" FROM "ManagementModifier" WHERE "companyId"=${req.user.companyId} AND "active"=true AND "id"=ANY(${realModifierIds}::text[])`;if(valid.length!==realModifierIds.length)return res.status(400).json({error:"Ένα ή περισσότερα Modifiers δεν είναι ενεργά στην εταιρεία."});}const id=crypto.randomUUID(),operatorName=req.user.fullName||req.user.name||"Πωλητής";await prisma.$executeRaw`INSERT INTO "StorePreparationBatch" ("id","companyId","storeId","operatorId","operatorName","productionStation","priority","note","itemsJson","status") VALUES (${id},${req.user.companyId},${store.id},${req.user.id||null},${operatorName},${body.productionStation},${body.priority},${body.note||null},${JSON.stringify(body.items)}::jsonb,'SENT')`;res.status(201).json({ok:true,id,batchId:id,status:"SENT",itemCount:body.items.reduce((sum,x)=>sum+Number(x.quantity||0),0),productionStation:body.productionStation,priority:body.priority});}catch(e){if(e?.name==="ZodError")return res.status(400).json({error:"Έλεγξε τα προϊόντα και τις επιλογές παρασκευής.",details:e.issues});next(e)}});

export default router;
