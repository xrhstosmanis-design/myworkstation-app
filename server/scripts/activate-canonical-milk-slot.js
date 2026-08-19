import fs from "node:fs";
import crypto from "node:crypto";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const root = new URL("../", import.meta.url);
const defaultsPath = new URL("src/kat-preparation-defaults.js", root);
const enginePath = new URL("src/routes/store-preparation.js", root);

function patchFile(url, transform) {
  const path = url.pathname;
  const before = fs.readFileSync(path, "utf8");
  const after = transform(before);
  if (after !== before) fs.writeFileSync(path, after, "utf8");
}

function patchDefaults(source) {
  let s = source;
  s = s.replace("const RECIPE_PROFILE_VERSION=4;", "const RECIPE_PROFILE_VERSION=5;");
  if (!s.includes('milkSlot:"MWS-PREP-MILK-SLOT"')) {
    s = s.replace(
      'milk:"MWS-PREP-MILK",milkEvap:',
      'milk:"MWS-PREP-MILK",milkSlot:"MWS-PREP-MILK-SLOT",milkEvap:'
    );
  }

  // Milk recipes keep only ML quantity. They no longer point at a physical milk SKU.
  s = s.replaceAll("ingredientSku.milk,", "ingredientSku.milkSlot,");

  // Legacy fixed milk mappings must never be recreated. The selected milk inherits
  // the exact ML from the recipe slot (70, 100, 120, 180, etc.).
  s = s.replace(/\n await set\("ΓΑΛΑ","ΓΑΛΑ ΕΒΑΠΟΡΕ"[\s\S]*?await set\("ΓΑΛΑ","ΓΑΛΑ ΣΟΓΙΑΣ",ingredientSku\.soy,80,"ML"\);/m, "");
  return s;
}

function patchEngine(source) {
  let s = source;
  s = s.replace(
    "IF recipe_row.ingredient_sku='MWS-PREP-MILK' AND milk_target_sku IS NOT NULL THEN",
    "IF recipe_row.ingredient_sku='MWS-PREP-MILK-SLOT' THEN"
  );

  const marker = "          -- REPLACE: DECAF redirects the coffee recipe ingredient and inherits its grams.";
  if (!s.includes("milk_target_sku := COALESCE(milk_target_sku,'MWS-PREP-MILK');")) {
    s = s.replace(
      marker,
      "          -- The recipe contains only a milk quantity slot. No alternative selected = fresh milk.\n          milk_target_sku := COALESCE(milk_target_sku,'MWS-PREP-MILK');\n\n" + marker
    );
  }
  return s;
}

async function removeLegacyMilkConsumption(companyId) {
  // Delete all old fixed milk modifier quantities. These were the source of the fixed -80 ML.
  await prisma.$executeRawUnsafe(
    `DELETE FROM "PreparationModifierConsumption" c
     USING "ManagementModifier" m, "ManagementModifierGroup" g
     WHERE c."companyId"=$1
       AND m."id"=c."modifierId"
       AND g."id"=m."groupId"
       AND m."companyId"=$1
       AND g."companyId"=$1
       AND UPPER(TRIM(g."description"))='ΓΑΛΑ'`,
    companyId
  );

  // Remove any remaining legacy POS-audit trigger whose body still reads the old
  // modifier-consumption table. The clean engine owns preparation stock now.
  const triggers = await prisma.$queryRawUnsafe(
    `SELECT t.tgname AS "triggerName"
     FROM pg_trigger t
     JOIN pg_class c ON c.oid=t.tgrelid
     JOIN pg_proc p ON p.oid=t.tgfoid
     WHERE c.relname='StoreOperatorAudit'
       AND NOT t.tgisinternal
       AND LOWER(pg_get_functiondef(p.oid)) LIKE '%preparationmodifierconsumption%'`
  );
  for (const row of triggers) {
    const safe = String(row.triggerName || "").replaceAll('"','""');
    if (safe) await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS "${safe}" ON "StoreOperatorAudit"`);
  }
}

async function ensureMilkSlotProduct() {
  const companies = await prisma.$queryRawUnsafe(`SELECT "id" FROM "Company"`);

  for (const company of companies) {
    const [fresh] = await prisma.$queryRawUnsafe(
      `SELECT "id","categoryId","subcategoryId" FROM "Product" WHERE "companyId"=$1 AND "sku"='MWS-PREP-MILK' LIMIT 1`,
      company.id
    );
    if (!fresh) continue;

    let [slot] = await prisma.$queryRawUnsafe(
      `SELECT "id" FROM "Product" WHERE "companyId"=$1 AND "sku"='MWS-PREP-MILK-SLOT' LIMIT 1`,
      company.id
    );

    if (!slot) {
      slot = { id: crypto.randomUUID() };
      await prisma.$executeRawUnsafe(
        `INSERT INTO "Product" ("id","companyId","categoryId","subcategoryId","sku","name","description","unit","vatRate","salePrice","costPrice","trackStock","active")
         VALUES ($1,$2,$3,$4,'MWS-PREP-MILK-SLOT','ΘΕΣΗ ΓΑΛΑΚΤΟΣ (ΜΗ ΑΠΟΘΕΜΑΤΙΚΟ)','Εσωτερική θέση ποσότητας γάλακτος για συνταγές','ML',13,0,0,false,true)`,
        slot.id, company.id, fresh.categoryId, fresh.subcategoryId
      );
    } else {
      await prisma.$executeRawUnsafe(
        `UPDATE "Product" SET "name"='ΘΕΣΗ ΓΑΛΑΚΤΟΣ (ΜΗ ΑΠΟΘΕΜΑΤΙΚΟ)',"unit"='ML',"trackStock"=false,"active"=true,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=$1`,
        slot.id
      );
    }

    // Existing recipes: replace physical fresh milk with the neutral milk slot, preserving the exact ML.
    await prisma.$executeRawUnsafe(
      `UPDATE "PreparationRecipeLine"
       SET "ingredientProductId"=$1,"updatedAt"=NOW()
       WHERE "companyId"=$2 AND "ingredientProductId"=$3 AND "automatic"=TRUE`,
      slot.id, company.id, fresh.id
    );

    // The actual milk products must be active stock rows so the resolved recipe can decrement them.
    await prisma.$executeRawUnsafe(
      `UPDATE "StoreProduct" sp
       SET "active"=TRUE,"updatedAt"=CURRENT_TIMESTAMP
       FROM "Product" p
       WHERE sp."productId"=p."id"
         AND p."companyId"=$1
         AND p."sku" IN ('MWS-PREP-MILK','MWS-PREP-MILK-EVAP','MWS-PREP-MILK-LF','MWS-PREP-MILK-ALMOND','MWS-PREP-MILK-OAT','MWS-PREP-MILK-SOY')`,
      company.id
    );

    await removeLegacyMilkConsumption(company.id);

    // Regenerate all automatic KAT beverage recipes once with the slot model.
    await prisma.$executeRawUnsafe(
      `UPDATE "PreparationProductSettings" s
       SET "recipeProfileVersion"=0,"updatedAt"=NOW()
       FROM "Product" p
       WHERE s."companyId"=$1 AND p."id"=s."productId" AND p."companyId"=s."companyId" AND p."sku" LIKE 'MWS-KAT-BEV-%'`,
      company.id
    );
  }
}

async function main() {
  patchFile(defaultsPath, patchDefaults);
  patchFile(enginePath, patchEngine);
  await ensureMilkSlotProduct();
  console.log("Canonical milk-slot preparation model activated; legacy fixed milk consumption removed.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
