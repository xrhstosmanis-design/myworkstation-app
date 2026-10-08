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
