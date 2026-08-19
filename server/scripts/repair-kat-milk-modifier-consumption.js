import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const mappings = [
  ["ΓΑΛΑ ΕΒΑΠΟΡΕ", "MWS-PREP-MILK-EVAP"],
  ["ΧΩΡΙΣ ΛΑΚΤΟΖΗ", "MWS-PREP-MILK-LF"],
  ["ΓΑΛΑ ΑΜΥΓΔΑΛΟΥ", "MWS-PREP-MILK-ALMOND"],
  ["ΓΑΛΑ ΒΡΩΜΗΣ", "MWS-PREP-MILK-OAT"],
  ["ΓΑΛΑ ΣΟΓΙΑΣ", "MWS-PREP-MILK-SOY"],
];

try {
  await prisma.$executeRawUnsafe(`UPDATE "Product" SET "active"=true,"updatedAt"=CURRENT_TIMESTAMP WHERE "sku" LIKE 'MWS-PREP-MILK%'`);

  for (const [modifierName, sku] of mappings) {
    const rows = await prisma.$queryRawUnsafe(
      `SELECT m."id" AS "modifierId", m."companyId", p."id" AS "ingredientProductId"
       FROM "ManagementModifier" m
       JOIN "ManagementModifierGroup" g ON g."id"=m."groupId" AND g."companyId"=m."companyId"
       JOIN "Product" p ON p."companyId"=m."companyId" AND p."sku"=$2
       WHERE UPPER(g."description")='ΓΑΛΑ' AND UPPER(m."description")=UPPER($1) AND m."active"=true`,
      modifierName,
      sku,
    );

    for (const row of rows) {
      await prisma.$executeRawUnsafe(
        `DELETE FROM "PreparationModifierConsumption" WHERE "companyId"=$1 AND "modifierId"=$2`,
        row.companyId,
        row.modifierId,
      );
      await prisma.$executeRawUnsafe(
        `INSERT INTO "PreparationModifierConsumption" ("id","companyId","modifierId","ingredientProductId","quantity","unit","multiplierMode","createdAt","updatedAt")
         VALUES (gen_random_uuid()::text,$1,$2,$3,80,'ML','FIXED',NOW(),NOW())`,
        row.companyId,
        row.modifierId,
        row.ingredientProductId,
      );
    }
  }

  console.log('[startup] KAT milk modifier consumption mappings repaired');
} finally {
  await prisma.$disconnect();
}
