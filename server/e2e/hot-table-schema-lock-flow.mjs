import assert from "node:assert/strict";
import fs from "node:fs";
import crypto from "node:crypto";
import {PrismaClient} from "@prisma/client";
import {executeHotTableBootstrap} from "../src/hot-table-schema.js";

assert.equal(process.env.NODE_ENV,"test");
const database=new URL(process.env.DATABASE_URL);
assert.ok(["localhost","127.0.0.1"].includes(database.hostname),"Only an isolated localhost test database is allowed");
const stem=`mws_hot_${crypto.randomBytes(6).toString("hex")}`;
const schema=`${stem}_guard`,baselineSchema=`${stem}_old`;
const admin=new PrismaClient();
const clientFor=name=>{const url=new URL(database);url.searchParams.set("schema",name);url.searchParams.set("connection_limit","1");return new PrismaClient({datasourceUrl:url.href})};
const guarded=clientFor(schema),baseline=clientFor(baselineSchema),reader=clientFor(schema),observer=clientFor(schema),initializer=clientFor(schema);
const clients=[admin,guarded,baseline,reader,observer,initializer];
const callers=[
  "master-catalog-bootstrap.js","owner-product-bootstrap.js","product-delivery-bootstrap.js","kat-preparation-bootstrap.js","commerce-compatibility.js",
  "routes/owner-product-smart-entry.js","routes/management-categories.js","routes/management-vat-departments.js","routes/management-product-companies.js",
  "routes/platform-bulk-catalog.js","routes/commerce-advanced-online-search.js","routes/store-pos-sale-display.js","routes/purchase-order-ocr-resolution.js",
  "routes/purchase-orders.js","routes/supplier-product-catalog.js","routes/commerce-pos-invoice-intake.js","routes/commerce-pos-v244-core.js","routes/store-transactions.js"
];
const statements=callers.flatMap(path=>{
  const source=fs.readFileSync(new URL(`../src/${path}`,import.meta.url),"utf8");
  assert.match(source,/executeHotTableBootstrap/);
  return Array.from(source.matchAll(/`(ALTER TABLE "(?:Product|ProductBarcode|PurchaseDocument)" ADD COLUMN IF NOT EXISTS [^`]+)`/g),match=>match[1]);
});
assert.ok(statements.length>40,"Replay all audited initialization definitions, not one synthetic column");
const tables=["Product","ProductBarcode","PurchaseDocument"];
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r});return {promise,resolve}};
const columnDescription=client=>client.$queryRaw`
  SELECT c.relname,a.attname,pg_catalog.format_type(a.atttypid,a.atttypmod) AS type,a.attnotnull,
         pg_catalog.pg_get_expr(d.adbin,d.adrelid) AS "default"
  FROM pg_catalog.pg_attribute a JOIN pg_catalog.pg_class c ON c.oid=a.attrelid
  JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
  LEFT JOIN pg_catalog.pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
  WHERE n.nspname=current_schema() AND a.attnum>0 AND NOT a.attisdropped
  ORDER BY c.relname,a.attnum`;
const exists=(client,column)=>client.$queryRaw`SELECT EXISTS(SELECT 1 FROM pg_catalog.pg_attribute WHERE attrelid=pg_catalog.to_regclass('"Product"') AND attname=${column} AND NOT attisdropped) AS present`;

try{
  for(const name of [schema,baselineSchema])await admin.$executeRawUnsafe(`CREATE SCHEMA "${name}"`);
  for(const client of [guarded,baseline]){
    for(const table of tables){
      await client.$executeRawUnsafe(`CREATE TABLE "${table}" ("id" TEXT PRIMARY KEY)`);
      await client.$executeRawUnsafe(`INSERT INTO "${table}" ("id") VALUES ('retained')`);
    }
  }
  assert.equal((await guarded.$queryRaw`SELECT current_schema() AS name`)[0].name,schema);
  assert.equal((await baseline.$queryRaw`SELECT current_schema() AS name`)[0].name,baselineSchema);
  for(const statement of statements){await baseline.$executeRawUnsafe(statement);await executeHotTableBootstrap(guarded,statement)}
  assert.deepEqual(await columnDescription(guarded),await columnDescription(baseline),"Missing columns retain exact type/default/nullability/order");
  for(const table of tables){
    const before=await baseline.$queryRawUnsafe(`SELECT * FROM "${table}"`),after=await guarded.$queryRawUnsafe(`SELECT * FROM "${table}"`);
    // Timestamp defaults are installed at separate moments; all other values agree.
    const stable=rows=>rows.map(row=>Object.fromEntries(Object.entries(row).filter(([,value])=>!(value instanceof Date))));
    assert.deepEqual(stable(after),stable(before),"Retain existing records and default values");
  }

  const held=deferred(),releaseReader=deferred();
  const readerDone=reader.$transaction(async tx=>{
    for(const table of tables)await tx.$queryRawUnsafe(`SELECT * FROM "${table}"`);
    held.resolve();await releaseReader.promise;
  },{timeout:30000});
  await Promise.race([held.promise,readerDone.then(()=>assert.fail("Reader must remain open for the lock regression"))]);
  try{
    // Old IF NOT EXISTS still queues for AccessExclusiveLock on existing fields.
    await assert.rejects(guarded.$transaction(async tx=>{
      await tx.$executeRawUnsafe("SET LOCAL lock_timeout='400ms'");
      await tx.$executeRawUnsafe(statements[0]);
    }),error=>error?.meta?.code==="55P03","Old redundant ALTER must reproduce the reader lock conflict");

    const checked=deferred(),releaseGuard=deferred();
    const guardedDone=guarded.$transaction(async tx=>{
      await tx.$executeRawUnsafe("SET LOCAL lock_timeout='400ms'");
      for(const statement of statements)assert.equal(await executeHotTableBootstrap(tx,statement),0);
      checked.resolve();await releaseGuard.promise;
    },{timeout:30000});
    await Promise.race([checked.promise,guardedDone.then(()=>assert.fail("Guard must remain open for lock inspection"))]);
    try{
      const locks=await observer.$queryRaw`SELECT count(*)::integer AS count FROM pg_catalog.pg_locks l JOIN pg_catalog.pg_class c ON c.oid=l.relation JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=${schema} AND l.mode='AccessExclusiveLock'`;
      assert.equal(locks[0].count,0,"Repeated guarded schema checks request no exclusive table lock");
      await observer.$transaction(async tx=>{
        await tx.$executeRawUnsafe("SET LOCAL lock_timeout='400ms'");
        for(const table of tables)assert.equal((await tx.$queryRawUnsafe(`SELECT "id" FROM "${table}"`))[0].id,"retained");
      });
    }finally{releaseGuard.resolve();await guardedDone}
  }finally{releaseReader.resolve();await readerDone}

  const concurrent='ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "concurrentField" TEXT';
  await Promise.all([executeHotTableBootstrap(guarded,concurrent),executeHotTableBootstrap(initializer,concurrent)]);
  assert.equal((await exists(guarded,"concurrentField"))[0].present,true);

  await assert.rejects(guarded.$transaction(async tx=>{
    await executeHotTableBootstrap(tx,'ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "rolledBackField" TEXT');
    assert.equal((await exists(tx,"rolledBackField"))[0].present,true,"Read own transactional schema changes");
    throw new Error("intentional rollback");
  }),/intentional rollback/);
  assert.equal((await exists(guarded,"rolledBackField"))[0].present,false);
  await executeHotTableBootstrap(guarded,'ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "rolledBackField" TEXT');
  assert.equal((await exists(guarded,"rolledBackField"))[0].present,true,"No stale schema cache after rollback");

  await guarded.$executeRawUnsafe('ALTER TABLE "Product" ADD COLUMN "droppedField" TEXT');
  await guarded.$executeRawUnsafe('ALTER TABLE "Product" DROP COLUMN "droppedField"');
  await executeHotTableBootstrap(guarded,'ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "droppedField" TEXT');
  assert.equal((await exists(guarded,"droppedField"))[0].present,true,"Dropped attributes are not mistaken for present fields");

  await guarded.$transaction(async tx=>{
    await tx.$executeRawUnsafe('CREATE TEMP TABLE "Product" ("id" TEXT, "tempExisting" TEXT) ON COMMIT DROP');
    await executeHotTableBootstrap(tx,'ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "tempExisting" TEXT');
    await executeHotTableBootstrap(tx,'ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "tempMissing" TEXT');
    assert.equal((await exists(tx,"tempMissing"))[0].present,true,"Use the same transaction and temporary-table search path");
  });
  assert.equal((await exists(guarded,"tempMissing"))[0].present,false,"Do not alter the permanent table shadowed by a temp table");

  await baseline.$executeRawUnsafe('DROP TABLE "PurchaseDocument"');
  await assert.rejects(executeHotTableBootstrap(baseline,'ALTER TABLE "PurchaseDocument" ADD COLUMN IF NOT EXISTS "missingRelation" TEXT'),error=>error?.meta?.code==="42P01");
  console.log(`Hot-table isolated PostgreSQL PASS: ${statements.length} audited statements preserve missing-schema definitions/records; old ALTER blocks behind reader, guarded existing columns take no exclusive lock and concurrent reads succeed; concurrent initializers, rollback, dropped columns and transaction/search-path isolation verified. No production action or capacity claim.`);
}finally{
  for(const client of clients.slice(1))await client.$disconnect();
  for(const name of [schema,baselineSchema])await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${name}" CASCADE`);
  await admin.$disconnect();
}
