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

  // In every beverage recipe the milk line is now a quantity slot, not a physical milk SKU.
  // The sale engine resolves that slot to the selected milk material.
  s = s.replaceAll("ingredientSku.milk,", "ingredientSku.milkSlot,");
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
      "          -- No alternative selected means fresh milk. The recipe itself contains only a milk slot.\n          milk_target_sku := COALESCE(milk_target_sku,'MWS-PREP-MILK');\n\n" + marker
    );
  }
  return s;
}

async function ensureMilkSlotProduct() {
  const companies = await prisma.company.findMany({ select: { id: true } });
  for (const company of companies) {
    let product = await prisma.product.findFirst({
      where: { companyId: company.id, sku: "MWS-PREP-MILK-SLOT" },
      select: { id: true },
    });
    if (!product) {
      product = await prisma.product.create({
        data: {
          id: crypto.randomUUID(),
          companyId: company.id,
          sku: "MWS-PREP-MILK-SLOT",
          name: "ΘΕΣΗ ΓΑΛΑΚΤΟΣ (ΜΗ ΑΠΟΘΕΜΑΤΙΚΟ)",
          category: "ΡΟΦΗΜΑΤΑ",
          vatRate: 13,
          retailPrice: 0,
          active: true,
          trackStock: false,
        },
        select: { id: true },
      });
    } else {
      await prisma.product.update({
        where: { id: product.id },
        data: { active: true, trackStock: false, name: "ΘΕΣΗ ΓΑΛΑΚΤΟΣ (ΜΗ ΑΠΟΘΕΜΑΤΙΚΟ)" },
      });
    }

    const fresh = await prisma.product.findFirst({
      where: { companyId: company.id, sku: "MWS-PREP-MILK" },
      select: { id: true },
    });
    if (!fresh) continue;

    // Convert existing automatic recipe milk lines to the non-stock milk slot, preserving ML exactly.
    await prisma.$executeRaw`
      UPDATE "PreparationRecipeLine"
      SET "ingredientProductId"=${product.id}, "updatedAt"=NOW()
      WHERE "companyId"=${company.id}
        AND "ingredientProductId"=${fresh.id}
        AND "automatic"=TRUE
    `;

    // Force the canonical recipe profile to be regenerated once from the new slot definitions.
    await prisma.$executeRaw`
      UPDATE "PreparationProductSettings"
      SET "recipeProfileVersion"=0, "updatedAt"=NOW()
      WHERE "companyId"=${company.id}
    `;
  }
}

async function main() {
  patchFile(defaultsPath, patchDefaults);
  patchFile(enginePath, patchEngine);
  await ensureMilkSlotProduct();
  console.log("Canonical milk-slot preparation model activated.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
