import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {claimTerminalRbsRequest} from '../src/services/rbs-terminal-binding.js';
const isolated=(()=>{try{const u=new URL(process.env.DATABASE_URL);return process.env.NODE_ENV==='test'&&['localhost','127.0.0.1','postgres'].includes(u.hostname)&&/test/i.test(u.pathname)}catch{return false}})();

test('native Writer claims only stored requests from the current locked epoch and never promotes old physical commands',{skip:!isolated},async()=>{
 const {PrismaClient}=await import('@prisma/client'),admin=new PrismaClient(),schema='lifecycle_worker_'+randomUUID().replaceAll('-','');
 await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);const url=new URL(process.env.DATABASE_URL);url.searchParams.set('schema',schema);const db=new PrismaClient({datasourceUrl:url.toString()});
 const device={id:'writer',companyId:'company',storeId:'target'},terminal={terminalPos:'POS1'};
 try{
  await db.$executeRawUnsafe(`CREATE TABLE "StoreLifecycleFence"("storeId" text PRIMARY KEY,"companyId" text,"generation" bigint,"maintenance" boolean,"retired" boolean)`);
  await db.$executeRawUnsafe(`INSERT INTO "StoreLifecycleFence" VALUES('target','company',1,false,false),('sibling','company',0,false,false)`);
  await db.$executeRawUnsafe(`CREATE TABLE "RbsCapDriverV1Request"("id" text PRIMARY KEY,"companyId" text,"storeId" text,"terminalPos" text,"status" text,"checkoutJson" jsonb,"paymentMethod" text,"total" numeric,"commandText" text,"commandHash" text,"createdAt" timestamptz,"claimedByDeviceId" text,"claimedAt" timestamptz,"updatedAt" timestamptz)`);
  for(const [id,storeId,epoch,time] of [['old','target',{},1],['fresh','target',{lifecycleGeneration:'1'},2],['sibling','sibling',{},3]])await db.$executeRawUnsafe(`INSERT INTO "RbsCapDriverV1Request"("id","companyId","storeId","terminalPos","status","checkoutJson","paymentMethod","total","commandText","commandHash","createdAt") VALUES($1,'company',$2,'POS1','PREPARED',$3::jsonb,'CASH',2.7,'ORIGINAL COMMAND','HASH',to_timestamp($4::int))`,id,storeId,JSON.stringify(epoch),time);
  await db.$executeRawUnsafe(`CREATE FUNCTION guard_epoch() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF COALESCE(NULLIF(current_setting('mws.lifecycle_generations',true),'')::jsonb->>NEW."storeId",'0')<>(SELECT "generation"::text FROM "StoreLifecycleFence" WHERE "storeId"=NEW."storeId") THEN RAISE EXCEPTION 'STALE WORKER' USING ERRCODE='55000'; END IF; RETURN NEW; END $$`);
  await db.$executeRawUnsafe(`CREATE TRIGGER epoch_guard BEFORE UPDATE ON "RbsCapDriverV1Request" FOR EACH ROW EXECUTE FUNCTION guard_epoch()`);
  const claimed=await db.$transaction(tx=>claimTerminalRbsRequest(tx,device,terminal));assert.equal(claimed.id,'fresh');assert.equal(claimed.commandText,'ORIGINAL COMMAND');
  assert.equal(await db.$transaction(tx=>claimTerminalRbsRequest(tx,device,terminal)),null);
  const sibling=await db.$transaction(tx=>claimTerminalRbsRequest(tx,{...device,id:'sibling-writer',storeId:'sibling'},terminal));assert.equal(sibling.id,'sibling');
  assert.deepEqual(await db.$queryRawUnsafe(`SELECT "id","status" FROM "RbsCapDriverV1Request" ORDER BY "id"`),[{id:'fresh',status:'CLAIMED'},{id:'old',status:'PREPARED'},{id:'sibling',status:'CLAIMED'}]);
  await db.$executeRawUnsafe(`UPDATE "StoreLifecycleFence" SET "maintenance"=true WHERE "storeId"='target'`);
  await assert.rejects(db.$transaction(tx=>claimTerminalRbsRequest(tx,device,terminal)),error=>error.code==='STORE_LIFECYCLE_MAINTENANCE');
  for(let i=0;i<4;i++)assert.deepEqual((await db.$queryRawUnsafe(`SELECT COALESCE(NULLIF(current_setting('mws.lifecycle_generations',true),''),'{}')::jsonb AS context`))[0].context,{});
 }finally{await db.$disconnect();await admin.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);await admin.$disconnect()}
});
