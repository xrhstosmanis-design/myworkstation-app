import crypto from "crypto";
import {prisma} from "./prisma.js";

let schemaPromise;
const uid=()=>crypto.randomUUID();

export async function ensurePosStockLedgerSchema(){
  if(!schemaPromise){schemaPromise=(async()=>{
    const statements=[
      `ALTER TABLE "StockMovement" ADD COLUMN IF NOT EXISTS "referenceKey" TEXT`,
      `ALTER TABLE "StockMovement" ADD COLUMN IF NOT EXISTS "reversalOfId" TEXT`,
      `ALTER TABLE "StockMovement" ADD COLUMN IF NOT EXISTS "beforeQuantity" NUMERIC(14,3)`,
      `ALTER TABLE "StockMovement" ADD COLUMN IF NOT EXISTS "afterQuantity" NUMERIC(14,3)`,
      `ALTER TABLE "StockMovement" ADD COLUMN IF NOT EXISTS "actorName" TEXT`,
      `ALTER TABLE "Sale" ADD COLUMN IF NOT EXISTS "returnToStock" BOOLEAN`,
      `CREATE UNIQUE INDEX IF NOT EXISTS "StockMovement_referenceKey_uq" ON "StockMovement"("referenceKey") WHERE "referenceKey" IS NOT NULL`,
      `CREATE INDEX IF NOT EXISTS "StockMovement_source_lookup_idx" ON "StockMovement"("storeId","sourceType","sourceId","movementType")`,
      `CREATE INDEX IF NOT EXISTS "StockMovement_reversalOf_idx" ON "StockMovement"("reversalOfId") WHERE "reversalOfId" IS NOT NULL`
    ];
    for(const sql of statements)await prisma.$executeRawUnsafe(sql);
    await prisma.$executeRawUnsafe(`
      CREATE OR REPLACE FUNCTION "_mws_apply_stock_delta"(
        p_store_id TEXT,p_product_id TEXT,p_delta NUMERIC,p_movement_type TEXT,p_source_type TEXT,
        p_source_id TEXT,p_reference_key TEXT,p_note TEXT,p_reversal_of TEXT DEFAULT NULL
      ) RETURNS TEXT AS $$
      DECLARE v_existing TEXT;v_before NUMERIC(14,3);v_after NUMERIC(14,3);v_id TEXT;
      BEGIN
        IF p_delta=0 THEN RETURN NULL; END IF;
        SELECT "id" INTO v_existing FROM "StockMovement" WHERE "referenceKey"=p_reference_key LIMIT 1;
        IF v_existing IS NOT NULL THEN RETURN v_existing; END IF;
        PERFORM pg_advisory_xact_lock(hashtext('stock:'||p_store_id||':'||p_product_id));
        SELECT "id" INTO v_existing FROM "StockMovement" WHERE "referenceKey"=p_reference_key LIMIT 1;
        IF v_existing IS NOT NULL THEN RETURN v_existing; END IF;
        INSERT INTO "StoreProduct"("id","storeId","productId","currentStock","active")
          VALUES ('sp_'||md5(random()::text||clock_timestamp()::text||p_store_id||p_product_id),p_store_id,p_product_id,0,false)
          ON CONFLICT ("storeId","productId") DO NOTHING;
        SELECT COALESCE("currentStock",0) INTO v_before FROM "StoreProduct" WHERE "storeId"=p_store_id AND "productId"=p_product_id FOR UPDATE;
        IF v_before IS NULL THEN RAISE EXCEPTION 'STORE_PRODUCT_NOT_AVAILABLE'; END IF;
        v_after:=v_before+p_delta;
        UPDATE "StoreProduct" SET "currentStock"=v_after,"updatedAt"=NOW() WHERE "storeId"=p_store_id AND "productId"=p_product_id;
        v_id:='sm_'||md5(random()::text||clock_timestamp()::text||p_reference_key);
        INSERT INTO "StockMovement"("id","storeId","productId","movementType","quantity","sourceType","sourceId","note","referenceKey","reversalOfId","beforeQuantity","afterQuantity")
          VALUES (v_id,p_store_id,p_product_id,p_movement_type,p_delta,p_source_type,p_source_id,p_note,p_reference_key,p_reversal_of,v_before,v_after);
        RETURN v_id;
      END;
      $$ LANGUAGE plpgsql
    `);
    await prisma.$executeRawUnsafe(`
      CREATE OR REPLACE FUNCTION "_mws_pos_sale_line_stock_trigger"() RETURNS trigger AS $$
      DECLARE v_company TEXT;v_store TEXT;v_source TEXT;v_client_tx TEXT;v_recipe TEXT;v_yield NUMERIC;v_product_track BOOLEAN;v_has_items BOOLEAN;v_actor TEXT;v_item RECORD;v_delta NUMERIC;
      BEGIN
        IF NEW."productId" IS NULL OR COALESCE(NEW."quantity",0)=0 THEN RETURN NEW; END IF;
        SELECT s."companyId",s."storeId",s."source",s."clientTransactionId",e."fullName"
          INTO v_company,v_store,v_source,v_client_tx,v_actor
          FROM "Sale" s LEFT JOIN "Employee" e ON e."id"=s."operatorEmployeeId"
          WHERE s."id"=NEW."saleId";
        IF v_source<>'POS' OR v_client_tx IS NULL THEN RETURN NEW; END IF;
        SELECT p."trackStock" INTO v_product_track FROM "Product" p WHERE p."id"=NEW."productId" AND p."companyId"=v_company AND p."active"=true;
        IF NOT FOUND THEN RETURN NEW; END IF;
        SELECT r."id",COALESCE(NULLIF(r."yieldQuantity",0),1) INTO v_recipe,v_yield FROM "Recipe" r WHERE r."companyId"=v_company AND r."productId"=NEW."productId" AND r."active"=true LIMIT 1;
        IF v_recipe IS NOT NULL THEN SELECT EXISTS(SELECT 1 FROM "RecipeItem" WHERE "recipeId"=v_recipe) INTO v_has_items; ELSE v_has_items:=false; END IF;
        IF v_recipe IS NOT NULL AND v_has_items THEN
          FOR v_item IN SELECT ri."ingredientProductId" AS product_id,ri."quantity" AS qty,p."trackStock" FROM "RecipeItem" ri JOIN "Product" p ON p."id"=ri."ingredientProductId" AND p."companyId"=v_company WHERE ri."recipeId"=v_recipe LOOP
            IF v_item."trackStock" THEN
              v_delta:=-(NEW."quantity"*v_item.qty/v_yield);
              PERFORM "_mws_apply_stock_delta"(v_store,v_item.product_id,v_delta,'SALE','RECIPE_SALE',NEW."saleId",'pos-sale:'||NEW."saleId"||':line:'||NEW."id"||':stock:'||v_item.product_id,'POS sale recipe consumption · '||COALESCE(NEW."description",'')||' · '||COALESCE(v_actor,''),NULL);
            END IF;
          END LOOP;
        ELSIF v_product_track THEN
          v_delta:=-NEW."quantity";
          PERFORM "_mws_apply_stock_delta"(v_store,NEW."productId",v_delta,'SALE','SALE',NEW."saleId",'pos-sale:'||NEW."saleId"||':line:'||NEW."id"||':stock:'||NEW."productId",'POS sale · '||COALESCE(NEW."description",'')||' · '||COALESCE(v_actor,''),NULL);
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);
    await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS "trg_mws_pos_sale_line_stock" ON "SaleLine"`);
    await prisma.$executeRawUnsafe(`CREATE TRIGGER "trg_mws_pos_sale_line_stock" AFTER INSERT ON "SaleLine" FOR EACH ROW EXECUTE FUNCTION "_mws_pos_sale_line_stock_trigger"()`);
  })().catch(error=>{schemaPromise=undefined;throw error})}
  return schemaPromise;
}

export async function reverseSaleStock(tx,{companyId,storeId,originalSaleId,reversalSaleId,kind,returnToStock,actorName=null}){
  if(kind==="RETURN"&&!returnToStock)return {requested:false,restoredMovements:0,quantityRestored:0,legacyWithoutMovements:false};
  const original=await tx.$queryRaw`
    SELECT sm."id",sm."productId",sm."quantity",sm."sourceType",p."name" AS "productName"
    FROM "StockMovement" sm JOIN "Product" p ON p."id"=sm."productId" AND p."companyId"=${companyId}
    WHERE sm."storeId"=${storeId} AND sm."sourceId"=${originalSaleId} AND sm."movementType"='SALE' AND sm."quantity"<0
    ORDER BY sm."createdAt",sm."id"`;
  if(!original.length)return {requested:true,restoredMovements:0,quantityRestored:0,legacyWithoutMovements:true};
  let restoredMovements=0,quantityRestored=0;
  for(const movement of original){
    const delta=Math.abs(Number(movement.quantity||0)),referenceKey=`pos-reversal:${reversalSaleId}:movement:${movement.id}`;
    const existing=await tx.$queryRaw`SELECT "id" FROM "StockMovement" WHERE "referenceKey"=${referenceKey} LIMIT 1`;
    if(existing[0])continue;
    await tx.$queryRaw`SELECT "_mws_apply_stock_delta"(${storeId},${movement.productId},${delta},${kind==="CANCEL"?"SALE_CANCEL":"SALE_RETURN"},${kind==="CANCEL"?"SALE_CANCELLATION":"SALE_RETURN"},${reversalSaleId},${referenceKey},${`${kind==="CANCEL"?"Ακύρωση":"Επιστροφή"} αρχικής πώλησης ${originalSaleId} · ${movement.productName||""} · ${actorName||""}`},${movement.id}) AS id`;
    restoredMovements++;quantityRestored+=delta;
  }
  return {requested:true,restoredMovements,quantityRestored:Number(quantityRestored.toFixed(3)),legacyWithoutMovements:false};
}

export {uid};
