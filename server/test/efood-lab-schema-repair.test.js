import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const storeBootstrap=await readFile(
  new URL("../src/store-integration-bootstrap.js",import.meta.url),
  "utf8",
);
const efoodRoutes=await readFile(
  new URL("../src/routes/platform-efood-integrations.js",import.meta.url),
  "utf8",
);

test("legacy integration kind constraints are replaced before EFOOD is added",()=>{
  assert.match(storeBootstrap,/DROP CONSTRAINT IF EXISTS "StoreIntegrationCredential_kind_check"/);
  assert.match(storeBootstrap,/attname='kind'/);
  assert.match(storeBootstrap,/= ANY \(conkey\)/);
  assert.match(storeBootstrap,/DROP CONSTRAINT IF EXISTS %I/);
  assert.match(storeBootstrap,/CHECK \("kind" IN \('MYDATA','VAT_LOOKUP','EFOOD'\)\)/);
  assert.doesNotMatch(storeBootstrap,/pg_get_constraintdef\(oid\)\s+LIKE\s+'%"kind"%'/);
});

test("kind constraint repair executes against a legacy PostgreSQL table",{skip:!process.env.DATABASE_URL},async()=>{
  const [{prisma},{STORE_INTEGRATION_KIND_CONSTRAINT_SQL}]=await Promise.all([
    import("../src/prisma.js"),
    import("../src/store-integration-bootstrap.js"),
  ]);
  try{
    await prisma.$transaction(async tx=>{
      await tx.$executeRawUnsafe(`CREATE TEMP TABLE "StoreIntegrationCredential" (
        "kind" TEXT NOT NULL,
        CONSTRAINT "StoreIntegrationCredential_kind_check" CHECK ("kind" IN ('MYDATA','VAT_LOOKUP')),
        CONSTRAINT "legacy_kind_guard" CHECK ("kind" IN ('MYDATA','VAT_LOOKUP'))
      ) ON COMMIT DROP`);
      await tx.$executeRawUnsafe(STORE_INTEGRATION_KIND_CONSTRAINT_SQL);
      await tx.$executeRawUnsafe(`INSERT INTO "StoreIntegrationCredential" ("kind") VALUES ('MYDATA'),('EFOOD')`);
      const rows=await tx.$queryRawUnsafe(`SELECT "kind" FROM "StoreIntegrationCredential" ORDER BY "kind"`);
      assert.deepEqual(rows.map(row=>row.kind),["EFOOD","MYDATA"]);
      const constraints=await tx.$queryRawUnsafe(`SELECT conname,pg_get_constraintdef(oid) AS definition
        FROM pg_constraint
        WHERE conrelid='"StoreIntegrationCredential"'::regclass AND contype='c'`);
      assert.equal(constraints.length,1);
      assert.equal(constraints[0].conname,"StoreIntegrationCredential_kind_check");
      assert.match(constraints[0].definition,/EFOOD/);
    });
  }finally{
    await prisma.$disconnect();
  }
});

test("efood credentials remain LAB-only and fail closed",()=>{
  assert.match(efoodRoutes,/requireEfoodLabStore/);
  assert.match(efoodRoutes,/body\.environment!=="SANDBOX"/);
  assert.match(efoodRoutes,/"enabled"=false/);
  assert.match(efoodRoutes,/"externalCallsEnabled"=false/);
  assert.match(efoodRoutes,/orderPostingEnabled:false/);
  assert.match(efoodRoutes,/stockMutationEnabled:false/);
  assert.match(efoodRoutes,/paymentPostingEnabled:false/);
  assert.match(efoodRoutes,/fiscalExecutionEnabled:false/);
});
