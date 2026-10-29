import test from "node:test";
import assert from "node:assert/strict";
import {executeHotTableBootstrap} from "../src/hot-table-schema.js";

test("unrelated financial SQL and multi-action DDL retain their exact execution path",async()=>{
  const statements=[
    'UPDATE "Sale" SET "status"=\'ISSUED\' WHERE "id"=\'fixture\'',
    'ALTER TABLE "Sale" ADD COLUMN IF NOT EXISTS "audience" TEXT',
    'ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "fixture" TEXT, ADD COLUMN "other" TEXT',
    'ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "fixture" TEXT; SELECT 1',
    'ALTER TABLE public."Product" ADD COLUMN IF NOT EXISTS "fixture" TEXT',
    'ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "fixture" JSONB'
  ];
  const calls=[];
  const client={$queryRaw:()=>assert.fail("Unrelated SQL must not use the column probe"),$executeRawUnsafe:async sql=>{calls.push(sql);return 7}};
  for(const statement of statements)assert.equal(await executeHotTableBootstrap(client,statement),7);
  assert.deepEqual(calls,statements);
});

test("metadata errors propagate without assuming schema readiness or executing DDL",async()=>{
  const error=new Error("Connection unavailable");
  const client={$queryRaw:async()=>{throw error},$executeRawUnsafe:()=>assert.fail("Do not mask a failed existence check")};
  await assert.rejects(executeHotTableBootstrap(client,'ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "staffPrice" DECIMAL(14,4)'),e=>e===error);
});

test("a missing column delegates its full original definition and errors",async()=>{
  const statement='ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "allowDiscount" BOOLEAN NOT NULL DEFAULT true';
  const error=new Error("DDL unavailable");
  const client={$queryRaw:async()=>[{present:false}],$executeRawUnsafe:async sql=>{assert.equal(sql,statement);throw error}};
  await assert.rejects(executeHotTableBootstrap(client,statement),e=>e===error);
});

test("audited StoreTransaction columns skip redundant DDL only when present",async()=>{
  const definitions={attachmentData:"TEXT",attachmentMimeType:"TEXT",attachmentFilename:"TEXT",attachmentChecksum:"TEXT",paymentMethod:"TEXT",subtractFromShift:"BOOLEAN NOT NULL DEFAULT false",supplierId:"TEXT",invoiceDocumentNumber:"TEXT",invoicePaymentKey:"TEXT"};
  for(const [name,definition] of Object.entries(definitions)){
    const statement=`ALTER TABLE "StoreTransaction" ADD COLUMN IF NOT EXISTS "${name}" ${definition}`;
    let present=true,probes=0,executions=0;
    const client={$queryRaw:async(strings,...values)=>{probes++;assert.deepEqual(values,['"StoreTransaction"',name]);return [{present}]},$executeRawUnsafe:async sql=>{executions++;assert.equal(sql,statement);return 0}};
    assert.equal(await executeHotTableBootstrap(client,statement),0);
    assert.equal(executions,0);
    present=false;
    await executeHotTableBootstrap(client,statement);
    assert.equal(executions,1);
    present=true;
    await executeHotTableBootstrap(client,statement);
    assert.equal(executions,1);
    assert.equal(probes,3,"Every call uses its current client; no readiness cache");
  }
});

test("unknown ledger columns, changed definitions and multi-action DDL remain untouched",async()=>{
  const statements=[
    'ALTER TABLE "StoreTransaction" ADD COLUMN IF NOT EXISTS "unknownField" TEXT',
    'ALTER TABLE "StoreTransaction" ADD COLUMN IF NOT EXISTS "invoiceDocumentNumber" INTEGER',
    'ALTER TABLE "StoreTransaction" ADD COLUMN IF NOT EXISTS "subtractFromShift" BOOLEAN NOT NULL DEFAULT true',
    'ALTER TABLE "StoreTransaction" ADD COLUMN IF NOT EXISTS "invoiceDocumentNumber" TEXT, ADD COLUMN "other" TEXT'
  ];
  for(const statement of statements){
    const client={$queryRaw:()=>assert.fail("Non-audited ledger definitions must pass through"),$executeRawUnsafe:async sql=>{assert.equal(sql,statement);return 9}};
    assert.equal(await executeHotTableBootstrap(client,statement),9);
  }
});
