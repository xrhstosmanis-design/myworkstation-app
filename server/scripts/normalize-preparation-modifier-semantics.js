import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const BEHAVIORS = [
  // REPLACE: quantity always comes from the product recipe, never from the modifier.
  ['ΓΑΛΑ','ΓΑΛΑ ΕΒΑΠΟΡΕ','REPLACE','MWS-PREP-MILK','MWS-PREP-MILK-EVAP',null,null],
  ['ΓΑΛΑ','ΧΩΡΙΣ ΛΑΚΤΟΖΗ','REPLACE','MWS-PREP-MILK','MWS-PREP-MILK-LF',null,null],
  ['ΓΑΛΑ','ΓΑΛΑ ΑΜΥΓΔΑΛΟΥ','REPLACE','MWS-PREP-MILK','MWS-PREP-MILK-ALMOND',null,null],
  ['ΓΑΛΑ','ΓΑΛΑ ΒΡΩΜΗΣ','REPLACE','MWS-PREP-MILK','MWS-PREP-MILK-OAT',null,null],
  ['ΓΑΛΑ','ΓΑΛΑ ΣΟΓΙΑΣ','REPLACE','MWS-PREP-MILK','MWS-PREP-MILK-SOY',null,null],
  ['EXTRA','DECAF','REPLACE','MWS-PREP-COFFEE-BEANS','MWS-PREP-DECAF',null,null],

  // ADD: explicit extra consumption independent from the base recipe.
  ['EXTRA','EXTRA ΔΟΣΗ','ADD',null,'MWS-PREP-COFFEE-BEANS',9,'GR'],
  ['EXTRA','ΚΑΝΕΛΑ','ADD',null,'MWS-PREP-CINNAMON',1,'GR'],
  ['EXTRA','ΣΑΝΤΙΓΙ','ADD',null,'MWS-PREP-WHIP',20,'GR'],
  ['ΖΑΧΑΡΗ','ΜΕΤΡΙΟΣ','ADD',null,'MWS-PREP-SUGAR-WHITE',8,'GR'],
  ['ΖΑΧΑΡΗ','ΓΛΥΚΟΣ','ADD',null,'MWS-PREP-SUGAR-WHITE',16,'GR'],
  ['ΖΑΧΑΡΗ','ΚΑΣΤΑΝΗ ΖΑΧΑΡΗ','ADD',null,'MWS-PREP-SUGAR-BROWN',8,'GR'],
  ['ΖΑΧΑΡΗ','ΣΤΕΒΙΑ','ADD',null,'MWS-PREP-SWEETENER',1,'PCS'],
  ['ΖΑΧΑΡΗ','ΖΑΧΑΡΙΝΗ','ADD',null,'MWS-PREP-SWEETENER',1,'PCS'],
  ['ΣΙΡΟΠΙ','ΣΟΚΟΛΑΤΑ','ADD',null,'MWS-PREP-SYRUP-CHOC',15,'ML'],
  ['ΣΙΡΟΠΙ','ΚΑΡΑΜΕΛΑ','ADD',null,'MWS-PREP-SYRUP-CARAMEL',15,'ML'],
  ['ΣΙΡΟΠΙ','ΒΑΝΙΛΙΑ','ADD',null,'MWS-PREP-SYRUP-VANILLA',15,'ML'],
  ['ΣΙΡΟΠΙ','ΦΟΥΝΤΟΥΚΙ','ADD',null,'MWS-PREP-SYRUP-HAZELNUT',15,'ML'],
];

try {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "PreparationModifierBehavior" (
      "id" TEXT PRIMARY KEY,
      "companyId" TEXT NOT NULL,
      "modifierId" TEXT NOT NULL,
      "mode" TEXT NOT NULL,
      "sourceIngredientSku" TEXT,
      "targetIngredientSku" TEXT,
      "quantity" NUMERIC(14,4),
      "unit" TEXT,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "PreparationModifierBehavior_key" ON "PreparationModifierBehavior"("companyId","modifierId")`);

  for (const [groupName, modifierName, mode, sourceSku, targetSku, quantity, unit] of BEHAVIORS) {
    const rows = await prisma.$queryRawUnsafe(
      `SELECT m."id" AS "modifierId",m."companyId"
       FROM "ManagementModifier" m
       JOIN "ManagementModifierGroup" g ON g."id"=m."groupId" AND g."companyId"=m."companyId"
       WHERE m."active"=true AND g."active"=true
         AND UPPER(g."description")=UPPER($1)
         AND UPPER(m."description")=UPPER($2)`,
      groupName,
      modifierName,
    );

    for (const row of rows) {
      const existing = await prisma.$queryRawUnsafe(
        `SELECT "id" FROM "PreparationModifierBehavior" WHERE "companyId"=$1 AND "modifierId"=$2 LIMIT 1`,
        row.companyId,
        row.modifierId,
      );
      if (existing[0]) {
        await prisma.$executeRawUnsafe(
          `UPDATE "PreparationModifierBehavior"
             SET "mode"=$3,"sourceIngredientSku"=$4,"targetIngredientSku"=$5,"quantity"=$6,"unit"=$7,"updatedAt"=NOW()
           WHERE "id"=$8`,
          row.companyId,row.modifierId,mode,sourceSku,targetSku,quantity,unit,existing[0].id,
        );
      } else {
        await prisma.$executeRawUnsafe(
          `INSERT INTO "PreparationModifierBehavior"
             ("id","companyId","modifierId","mode","sourceIngredientSku","targetIngredientSku","quantity","unit")
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          crypto.randomUUID(),row.companyId,row.modifierId,mode,sourceSku,targetSku,quantity,unit,
        );
      }

      if (mode === 'REPLACE') {
        // Critical rule: REPLACE modifiers MUST NOT have independent fixed consumption.
        // Their quantity is inherited from the recipe line they replace.
        await prisma.$executeRawUnsafe(
          `DELETE FROM "PreparationModifierConsumption" WHERE "companyId"=$1 AND "modifierId"=$2`,
          row.companyId,
          row.modifierId,
        );
      }
    }
  }

  console.log('[startup] preparation modifier semantics normalized (REPLACE inherits recipe quantity; ADD consumes explicitly)');
} finally {
  await prisma.$disconnect();
}
