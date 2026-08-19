import crypto from "crypto";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma.js";

const router = Router();
const money = (value) => Number(value || 0);
let preparationReady = false;

function assertStore(req, storeId) {
  if (req.user?.tokenType === "STORE_OPERATOR" && req.user.storeId !== storeId) {
    const error = new Error("Η πρόσβαση ισχύει μόνο για το δικό σου κατάστημα.");
    error.status = 403;
    throw error;
  }
}

async function storeFor(req, id) {
  const store = await prisma.store.findFirst({
    where: { id, companyId: req.user.companyId, active: true },
    select: { id: true, companyId: true },
  });
  if (!store) {
    const error = new Error("Δεν βρέθηκε ενεργό κατάστημα.");
    error.status = 404;
    throw error;
  }
  return store;
}

/*
 * CLEAN PREPARATION ENGINE
 * ------------------------
 * Kiosk Manager model:
 *   PRODUCT -> RECIPE -> MODIFIERS
 *
 * The recipe is the only source of base quantities.
 * A REPLACE modifier (alternative milk / DECAF) never has an independent
 * stock quantity. It only redirects the matching recipe ingredient and
 * inherits that recipe quantity.
 * ADD modifiers consume only their explicit add-on quantity.
 *
 * PreparationModifierConsumption is intentionally NOT used by this engine.
 * It remains only for backwards compatibility with old BackOffice data.
 */
async function ensurePreparationEngine() {
  if (preparationReady) return;

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "StorePreparationBatch" (
      "id" TEXT PRIMARY KEY,
      "companyId" TEXT NOT NULL,
      "storeId" TEXT NOT NULL,
      "operatorId" TEXT,
      "operatorName" TEXT,
      "productionStation" TEXT NOT NULL DEFAULT 'ΠΑΡΑΓΩΓΗ',
      "priority" TEXT NOT NULL DEFAULT 'NORMAL',
      "note" TEXT,
      "itemsJson" JSONB NOT NULL DEFAULT '[]'::jsonb,
      "status" TEXT NOT NULL DEFAULT 'SENT',
      "saleId" TEXT,
      "consumedAt" TIMESTAMPTZ,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await prisma.$executeRawUnsafe(`ALTER TABLE "StorePreparationBatch" ADD COLUMN IF NOT EXISTS "saleId" TEXT`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "StorePreparationBatch" ADD COLUMN IF NOT EXISTS "consumedAt" TIMESTAMPTZ`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "StorePreparationBatch_store_created_idx" ON "StorePreparationBatch"("storeId","createdAt" DESC)`);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "PreparationStockConsumption" (
      "id" TEXT PRIMARY KEY,
      "companyId" TEXT NOT NULL,
      "storeId" TEXT NOT NULL,
      "saleId" TEXT NOT NULL,
      "batchId" TEXT NOT NULL,
      "sourceProductId" TEXT NOT NULL,
      "ingredientProductId" TEXT NOT NULL,
      "modifierId" TEXT,
      "quantity" NUMERIC(14,4) NOT NULL,
      "unit" TEXT NOT NULL DEFAULT 'PCS',
      "kind" TEXT NOT NULL,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "PreparationStockConsumption_sale_idx" ON "PreparationStockConsumption"("companyId","storeId","saleId")`);

  // Remove every previous preparation-stock trigger/function and install one clean owner.
  const legacyTriggers = await prisma.$queryRawUnsafe(`
    SELECT t.tgname AS "triggerName"
    FROM pg_trigger t
    JOIN pg_class c ON c.oid=t.tgrelid
    JOIN pg_proc p ON p.oid=t.tgfoid
    WHERE c.relname='StoreOperatorAudit'
      AND NOT t.tgisinternal
      AND (
        LOWER(t.tgname) LIKE '%preparation%stock%'
        OR LOWER(p.proname) LIKE '%preparation%stock%'
        OR LOWER(pg_get_functiondef(p.oid)) LIKE '%preparationstockconsumption%'
      )
  `);
  for (const row of legacyTriggers) {
    const safe = String(row.triggerName || "").replaceAll('"', '""');
    if (safe) await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS "${safe}" ON "StoreOperatorAudit"`);
  }

  await prisma.$executeRawUnsafe(`DROP FUNCTION IF EXISTS mws_consume_preparation_stock_from_pos_audit() CASCADE`);

  await prisma.$executeRawUnsafe(`
    CREATE FUNCTION mws_consume_preparation_stock_from_pos_audit() RETURNS trigger AS $$
    DECLARE
      sale_id TEXT;
      sale_item JSONB;
      batch_id TEXT;
      batch_row RECORD;
      prep_item JSONB;
      recipe_row RECORD;
      modifier_row RECORD;
      product_qty NUMERIC;
      consume_qty NUMERIC;
      resolved_ingredient_id TEXT;
      resolved_sku TEXT;
      replacement_modifier_id TEXT;
      milk_modifier_id TEXT;
      milk_target_sku TEXT;
      decaf_modifier_id TEXT;
      mismatch BOOLEAN;
      add_target_sku TEXT;
      add_qty NUMERIC;
      add_unit TEXT;
      add_ingredient_id TEXT;
    BEGIN
      IF NEW."eventType" <> 'POS_SALE_COMPLETED' THEN RETURN NEW; END IF;
      sale_id := COALESCE(NEW."details"->>'saleId','');
      IF sale_id = '' THEN RETURN NEW; END IF;

      FOR sale_item IN
        SELECT value FROM jsonb_array_elements(COALESCE(NEW."details"->'items','[]'::jsonb))
      LOOP
        IF COALESCE(sale_item->>'overrideReason','') NOT LIKE 'PREPARATION:%' THEN CONTINUE; END IF;
        batch_id := split_part(sale_item->>'overrideReason',':',2);
        IF batch_id = '' THEN CONTINUE; END IF;

        SELECT * INTO batch_row
        FROM "StorePreparationBatch"
        WHERE "id"=batch_id
          AND "companyId"=NEW."companyId"
          AND "storeId"=NEW."storeId"
          AND "status"='SENT'
        FOR UPDATE;
        IF NOT FOUND THEN CONTINUE; END IF;

        SELECT EXISTS(
          SELECT 1 FROM (
            SELECT x->>'productId' AS product_id,
                   SUM(GREATEST(0,COALESCE((x->>'quantity')::numeric,0))) AS qty
            FROM jsonb_array_elements(COALESCE(batch_row."itemsJson",'[]'::jsonb)) x
            GROUP BY x->>'productId'
          ) b
          FULL OUTER JOIN (
            SELECT x->>'productId' AS product_id,
                   SUM(GREATEST(0,COALESCE((x->>'quantity')::numeric,0))) AS qty
            FROM jsonb_array_elements(COALESCE(NEW."details"->'items','[]'::jsonb)) x
            WHERE COALESCE(x->>'overrideReason','')='PREPARATION:'||batch_id
            GROUP BY x->>'productId'
          ) s USING(product_id)
          WHERE b.product_id IS NULL OR s.product_id IS NULL OR b.qty IS DISTINCT FROM s.qty
        ) INTO mismatch;
        IF mismatch THEN
          RAISE EXCEPTION 'Η παραγγελία παρασκευής δεν συμφωνεί με τα προϊόντα/ποσότητες της πώλησης.' USING ERRCODE='P0001';
        END IF;

        FOR prep_item IN
          SELECT value FROM jsonb_array_elements(COALESCE(batch_row."itemsJson",'[]'::jsonb))
        LOOP
          product_qty := GREATEST(0,COALESCE((prep_item->>'quantity')::numeric,0));
          IF product_qty <= 0 THEN CONTINUE; END IF;

          -- REPLACE: alternative milk. No quantity here: quantity comes from recipe.
          milk_modifier_id := NULL;
          milk_target_sku := NULL;
          SELECT m."id",
                 CASE UPPER(TRIM(m."description"))
                   WHEN 'ΓΑΛΑ ΕΒΑΠΟΡΕ' THEN 'MWS-PREP-MILK-EVAP'
                   WHEN 'ΕΒΑΠΟΡΕ' THEN 'MWS-PREP-MILK-EVAP'
                   WHEN 'ΧΩΡΙΣ ΛΑΚΤΟΖΗ' THEN 'MWS-PREP-MILK-LF'
                   WHEN 'ΓΑΛΑ ΧΩΡΙΣ ΛΑΚΤΟΖΗ' THEN 'MWS-PREP-MILK-LF'
                   WHEN 'ΓΑΛΑ ΑΜΥΓΔΑΛΟΥ' THEN 'MWS-PREP-MILK-ALMOND'
                   WHEN 'ΓΑΛΑ ΒΡΩΜΗΣ' THEN 'MWS-PREP-MILK-OAT'
                   WHEN 'ΓΑΛΑ ΣΟΓΙΑΣ' THEN 'MWS-PREP-MILK-SOY'
                 END
          INTO milk_modifier_id,milk_target_sku
          FROM jsonb_array_elements(COALESCE(prep_item->'modifiers','[]'::jsonb)) j
          JOIN "ManagementModifier" m ON m."id"=j->>'id' AND m."companyId"=NEW."companyId" AND m."active"=TRUE
          JOIN "ManagementModifierGroup" g ON g."id"=m."groupId" AND g."companyId"=m."companyId" AND g."active"=TRUE
          WHERE UPPER(TRIM(g."description"))='ΓΑΛΑ'
            AND UPPER(TRIM(m."description")) NOT IN ('ΦΡΕΣΚΟ','ΦΡΕΣΚΟ ΓΑΛΑ','ΓΑΛΑ ΦΡΕΣΚΟ')
          LIMIT 1;

          -- REPLACE: DECAF redirects the coffee recipe ingredient and inherits its grams.
          decaf_modifier_id := NULL;
          SELECT m."id" INTO decaf_modifier_id
          FROM jsonb_array_elements(COALESCE(prep_item->'modifiers','[]'::jsonb)) j
          JOIN "ManagementModifier" m ON m."id"=j->>'id' AND m."companyId"=NEW."companyId" AND m."active"=TRUE
          WHERE UPPER(TRIM(m."description"))='DECAF'
          LIMIT 1;

          -- Base recipe: exactly one stock write per resolved recipe line.
          FOR recipe_row IN
            SELECT r."ingredientProductId",r."quantity",r."unit",p."sku" AS ingredient_sku
            FROM "PreparationRecipeLine" r
            JOIN "Product" p ON p."id"=r."ingredientProductId" AND p."companyId"=r."companyId" AND p."active"=TRUE
            WHERE r."companyId"=NEW."companyId"
              AND r."productId"=prep_item->>'productId'
              AND r."automatic"=TRUE
          LOOP
            -- Ice is intentionally ignored by stock control; it remains a POS modifier/recipe choice.
            IF recipe_row.ingredient_sku='MWS-PREP-ICE' THEN CONTINUE; END IF;

            resolved_ingredient_id := recipe_row."ingredientProductId";
            resolved_sku := recipe_row.ingredient_sku;
            replacement_modifier_id := NULL;

            IF recipe_row.ingredient_sku='MWS-PREP-MILK' AND milk_target_sku IS NOT NULL THEN
              SELECT p."id" INTO resolved_ingredient_id
              FROM "Product" p
              WHERE p."companyId"=NEW."companyId" AND p."sku"=milk_target_sku AND p."active"=TRUE
              LIMIT 1;
              IF resolved_ingredient_id IS NULL THEN
                RAISE EXCEPTION 'Δεν βρέθηκε ενεργό υλικό για το επιλεγμένο γάλα (%).',milk_target_sku USING ERRCODE='P0001';
              END IF;
              resolved_sku := milk_target_sku;
              replacement_modifier_id := milk_modifier_id;
            ELSIF recipe_row.ingredient_sku='MWS-PREP-COFFEE-BEANS' AND decaf_modifier_id IS NOT NULL THEN
              SELECT p."id" INTO resolved_ingredient_id
              FROM "Product" p
              WHERE p."companyId"=NEW."companyId" AND p."sku"='MWS-PREP-DECAF' AND p."active"=TRUE
              LIMIT 1;
              IF resolved_ingredient_id IS NULL THEN
                RAISE EXCEPTION 'Δεν βρέθηκε ενεργό υλικό DECAF.' USING ERRCODE='P0001';
              END IF;
              resolved_sku := 'MWS-PREP-DECAF';
              replacement_modifier_id := decaf_modifier_id;
            END IF;

            consume_qty := product_qty * recipe_row."quantity";
            IF consume_qty <= 0 THEN CONTINUE; END IF;

            UPDATE "StoreProduct" sp
            SET "currentStock"=COALESCE(sp."currentStock",0)-consume_qty
            FROM "Product" p
            WHERE sp."storeId"=NEW."storeId"
              AND sp."productId"=resolved_ingredient_id
              AND sp."active"=TRUE
              AND p."id"=sp."productId"
              AND p."companyId"=NEW."companyId"
              AND p."trackStock"=TRUE;

            INSERT INTO "PreparationStockConsumption"
              ("id","companyId","storeId","saleId","batchId","sourceProductId","ingredientProductId","modifierId","quantity","unit","kind")
            VALUES
              (gen_random_uuid()::text,NEW."companyId",NEW."storeId",sale_id,batch_id,prep_item->>'productId',resolved_ingredient_id,replacement_modifier_id,consume_qty,recipe_row."unit",CASE WHEN replacement_modifier_id IS NULL THEN 'RECIPE' ELSE 'REPLACE' END);
          END LOOP;

          -- ADD modifiers. Only explicit additions live here; REPLACE modifiers never enter this loop.
          FOR modifier_row IN
            SELECT m."id",UPPER(TRIM(m."description")) AS description,UPPER(TRIM(g."description")) AS group_name
            FROM jsonb_array_elements(COALESCE(prep_item->'modifiers','[]'::jsonb)) j
            JOIN "ManagementModifier" m ON m."id"=j->>'id' AND m."companyId"=NEW."companyId" AND m."active"=TRUE
            JOIN "ManagementModifierGroup" g ON g."id"=m."groupId" AND g."companyId"=m."companyId" AND g."active"=TRUE
          LOOP
            add_target_sku := NULL;
            add_qty := NULL;
            add_unit := NULL;

            IF modifier_row.group_name='ΖΑΧΑΡΗ' THEN
              IF modifier_row.description='ΜΕΤΡΙΟΣ' THEN add_target_sku:='MWS-PREP-SUGAR-WHITE';add_qty:=8;add_unit:='GR';
              ELSIF modifier_row.description='ΓΛΥΚΟΣ' THEN add_target_sku:='MWS-PREP-SUGAR-WHITE';add_qty:=16;add_unit:='GR';
              ELSIF modifier_row.description IN ('ΚΑΣΤΑΝΗ ΖΑΧΑΡΗ','ΜΕ ΚΑΣΤΑΝΗ ΖΑΧΑΡΗ') THEN add_target_sku:='MWS-PREP-SUGAR-BROWN';add_qty:=8;add_unit:='GR';
              ELSIF modifier_row.description IN ('ΣΤΕΒΙΑ','ΜΕ ΣΤΕΒΙΑ','ΖΑΧΑΡΙΝΗ','ΜΕ ΖΑΧΑΡΙΝΗ') THEN add_target_sku:='MWS-PREP-SWEETENER';add_qty:=1;add_unit:='PCS';
              END IF;
            ELSIF modifier_row.group_name='ΣΙΡΟΠΙ' THEN
              IF modifier_row.description='ΣΟΚΟΛΑΤΑ' THEN add_target_sku:='MWS-PREP-SYRUP-CHOC';
              ELSIF modifier_row.description='ΚΑΡΑΜΕΛΑ' THEN add_target_sku:='MWS-PREP-SYRUP-CARAMEL';
              ELSIF modifier_row.description='ΒΑΝΙΛΙΑ' THEN add_target_sku:='MWS-PREP-SYRUP-VANILLA';
              ELSIF modifier_row.description='ΦΟΥΝΤΟΥΚΙ' THEN add_target_sku:='MWS-PREP-SYRUP-HAZELNUT';
              END IF;
              IF add_target_sku IS NOT NULL THEN add_qty:=15;add_unit:='ML'; END IF;
            ELSIF modifier_row.group_name='EXTRA' THEN
              IF modifier_row.description='EXTRA ΔΟΣΗ' THEN
                add_target_sku:=CASE WHEN decaf_modifier_id IS NULL THEN 'MWS-PREP-COFFEE-BEANS' ELSE 'MWS-PREP-DECAF' END;
                add_qty:=9;add_unit:='GR';
              ELSIF modifier_row.description='ΚΑΝΕΛΑ' THEN add_target_sku:='MWS-PREP-CINNAMON';add_qty:=1;add_unit:='GR';
              ELSIF modifier_row.description='ΣΑΝΤΙΓΙ' THEN add_target_sku:='MWS-PREP-WHIP';add_qty:=20;add_unit:='GR';
              END IF;
            END IF;

            IF add_target_sku IS NULL OR add_qty IS NULL OR add_qty<=0 THEN CONTINUE; END IF;

            SELECT p."id" INTO add_ingredient_id
            FROM "Product" p
            WHERE p."companyId"=NEW."companyId" AND p."sku"=add_target_sku AND p."active"=TRUE
            LIMIT 1;
            IF add_ingredient_id IS NULL THEN CONTINUE; END IF;

            consume_qty := product_qty * add_qty;
            UPDATE "StoreProduct" sp
            SET "currentStock"=COALESCE(sp."currentStock",0)-consume_qty
            FROM "Product" p
            WHERE sp."storeId"=NEW."storeId"
              AND sp."productId"=add_ingredient_id
              AND sp."active"=TRUE
              AND p."id"=sp."productId"
              AND p."companyId"=NEW."companyId"
              AND p."trackStock"=TRUE;

            INSERT INTO "PreparationStockConsumption"
              ("id","companyId","storeId","saleId","batchId","sourceProductId","ingredientProductId","modifierId","quantity","unit","kind")
            VALUES
              (gen_random_uuid()::text,NEW."companyId",NEW."storeId",sale_id,batch_id,prep_item->>'productId',add_ingredient_id,modifier_row."id",consume_qty,add_unit,'ADD');
          END LOOP;
        END LOOP;

        UPDATE "StorePreparationBatch"
        SET "status"='CONSUMED',"saleId"=sale_id,"consumedAt"=NOW()
        WHERE "id"=batch_id AND "status"='SENT';
      END LOOP;

      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TRIGGER "mws_consume_preparation_stock_after_pos_sale"
    AFTER INSERT ON "StoreOperatorAudit"
    FOR EACH ROW EXECUTE FUNCTION mws_consume_preparation_stock_from_pos_audit()
  `);

  preparationReady = true;
  console.log("[preparation] clean Kiosk-style recipe/modifier engine ready");
}

router.get("/stores/:storeId/modifiers", async (req, res, next) => {
  try {
    assertStore(req, req.params.storeId);
    await storeFor(req, req.params.storeId);
    await ensurePreparationEngine();
    const productId = String(req.query.productId || "").trim();
    let groups = [];

    if (productId) {
      groups = await prisma.$queryRaw`
        SELECT g."id",g."description",pg."required",pg."minSelections",pg."maxSelections",pg."sequence",
        COALESCE(json_agg(json_build_object('id',m."id",'description',m."description",'price',m."price") ORDER BY m."sequence",m."description") FILTER (WHERE m."id" IS NOT NULL AND m."active"=true),'[]') AS "items"
        FROM "PreparationProductModifierGroup" pg
        JOIN "ManagementModifierGroup" g ON g."id"=pg."groupId" AND g."companyId"=pg."companyId" AND g."active"=true
        LEFT JOIN "ManagementModifier" m ON m."groupId"=g."id" AND m."companyId"=g."companyId" AND m."active"=true
        WHERE pg."companyId"=${req.user.companyId} AND pg."productId"=${productId}
        GROUP BY g."id",g."description",pg."required",pg."minSelections",pg."maxSelections",pg."sequence"
        ORDER BY pg."sequence",g."description"`;
    } else {
      groups = await prisma.$queryRaw`
        SELECT g."id",g."description",false AS "required",0 AS "minSelections",1 AS "maxSelections",0 AS "sequence",
        COALESCE(json_agg(json_build_object('id',m."id",'description',m."description",'price',m."price") ORDER BY m."sequence",m."description") FILTER (WHERE m."id" IS NOT NULL AND m."active"=true),'[]') AS "items"
        FROM "ManagementModifierGroup" g
        LEFT JOIN "ManagementModifier" m ON m."groupId"=g."id" AND m."companyId"=g."companyId" AND m."active"=true
        WHERE g."companyId"=${req.user.companyId} AND g."active"=true
        GROUP BY g."id",g."description"
        ORDER BY g."description"`;
    }

    const settings = productId ? (await prisma.$queryRaw`
      SELECT "preparationEnabled","environmentalFee","productionStation","autoPrint"
      FROM "PreparationProductSettings"
      WHERE "companyId"=${req.user.companyId} AND "productId"=${productId}
      LIMIT 1`)[0] : null;

    res.json({
      productId: productId || null,
      settings: settings ? { ...settings, environmentalFee: money(settings.environmentalFee) } : null,
      groups: groups.map((g) => ({
        ...g,
        minSelections: Number(g.minSelections || 0),
        maxSelections: Number(g.maxSelections || 1),
        sequence: Number(g.sequence || 0),
        items: (g.items || []).map((x) => ({ ...x, price: money(x.price) })),
      })),
    });
  } catch (error) {
    next(error);
  }
});

const preparationSchema = z.object({
  items: z.array(z.object({
    productId: z.string().min(1),
    quantity: z.coerce.number().positive().max(999),
    modifiers: z.array(z.object({
      id: z.string().min(1),
      description: z.string().trim().max(200).optional().default(""),
      price: z.coerce.number().min(-9999).max(9999).optional().default(0),
    })).max(30).optional().default([]),
  })).min(1).max(100),
  note: z.string().trim().max(1000).optional().nullable(),
  priority: z.enum(["NORMAL","DOCTOR","NURSE","STAFF"]).optional().default("NORMAL"),
  productionStation: z.string().trim().min(1).max(120).optional().default("ΠΑΡΑΓΩΓΗ"),
});

router.post("/stores/:storeId/preparation", async (req, res, next) => {
  try {
    assertStore(req, req.params.storeId);
    const store = await storeFor(req, req.params.storeId);
    const body = preparationSchema.parse(req.body || {});
    await ensurePreparationEngine();

    const productIds = [...new Set(body.items.map((x) => x.productId))];
    const products = await prisma.$queryRaw`
      SELECT p."id",p."name",p."sku"
      FROM "Product" p
      JOIN "StoreProduct" sp ON sp."productId"=p."id" AND sp."storeId"=${store.id} AND sp."active"=true
      JOIN "PreparationProductSettings" ps ON ps."companyId"=p."companyId" AND ps."productId"=p."id" AND ps."preparationEnabled"=true
      WHERE p."companyId"=${req.user.companyId} AND p."active"=true AND p."id"=ANY(${productIds}::text[])`;
    if (products.length !== productIds.length) {
      return res.status(400).json({ error: "Ένα ή περισσότερα προϊόντα δεν είναι ενεργά για παρασκευή στο κατάστημα." });
    }

    const realModifierIds = [...new Set(body.items.flatMap((x) => x.modifiers || []).map((x) => x.id).filter((id) => !id.startsWith("synthetic-")))];
    if (realModifierIds.length) {
      const valid = await prisma.$queryRaw`
        SELECT "id" FROM "ManagementModifier"
        WHERE "companyId"=${req.user.companyId} AND "active"=true AND "id"=ANY(${realModifierIds}::text[])`;
      if (valid.length !== realModifierIds.length) {
        return res.status(400).json({ error: "Ένα ή περισσότερα Modifiers δεν είναι ενεργά στην εταιρεία." });
      }
    }

    const id = crypto.randomUUID();
    const operatorName = req.user.fullName || req.user.name || "Πωλητής";
    await prisma.$executeRaw`
      INSERT INTO "StorePreparationBatch"
        ("id","companyId","storeId","operatorId","operatorName","productionStation","priority","note","itemsJson","status")
      VALUES
        (${id},${req.user.companyId},${store.id},${req.user.id || null},${operatorName},${body.productionStation},${body.priority},${body.note || null},${JSON.stringify(body.items)}::jsonb,'SENT')`;

    res.status(201).json({
      ok: true,
      id,
      batchId: id,
      status: "SENT",
      itemCount: body.items.reduce((sum, x) => sum + Number(x.quantity || 0), 0),
      productionStation: body.productionStation,
      priority: body.priority,
    });
  } catch (error) {
    if (error?.name === "ZodError") {
      return res.status(400).json({ error: "Έλεγξε τα προϊόντα και τις επιλογές παρασκευής.", details: error.issues });
    }
    next(error);
  }
});

export default router;
