import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {runLifecycleDemoSeed} from '../src/services/store-lifecycle-demo-seed.js';
const scope={companyId:'company',storeId:'target'};
test('maintenance, retired or reset generations never invoke startup example writes; an ordinary first installation still can',async()=>{
 for(const row of [null,{companyId:'company',generation:'0',maintenance:false,retired:false},{companyId:'company',generation:'1',maintenance:false,retired:false},{companyId:'company',generation:'900719925474099312345',maintenance:false,retired:false},{companyId:'company',generation:'0',maintenance:true,retired:false},{companyId:'company',generation:'0',maintenance:false,retired:true}]){
  const calls=[],tx={$executeRawUnsafe:async sql=>{assert.match(sql,/^SET /)},$queryRawUnsafe:async(sql,...args)=>{calls.push({sql,args});return sql.includes('current_schema')?[{name:'isolated'}]:sql.includes('to_regclass')?[{name:'StoreLifecycleFence'}]:row?[row]:[]}},db={$transaction:fn=>fn(tx)};
  let writes=0;const result=await runLifecycleDemoSeed(db,scope,async()=>{writes++;return 'seeded'});
  const expected=Boolean(row&&(BigInt(row.generation)>0n||row.maintenance||row.retired));assert.equal(result.skipped,expected);assert.equal(writes,expected?0:1);assert.ok(calls.some(c=>c.args[0]==='target'));
 }
});
test('wrong company, invalid generation and missing scope fail before any example write',async()=>{
 for(const row of [{companyId:'foreign',generation:'0'},{companyId:'company',generation:'-1'},{companyId:'company',generation:'not-an-integer'},{companyId:'company',generation:'0',maintenance:null,retired:false}]){
  const tx={$executeRawUnsafe:async()=>{},$queryRawUnsafe:async sql=>sql.includes('current_schema')?[{name:'s'}]:sql.includes('to_regclass')?[{name:'f'}]:[row]},db={$transaction:fn=>fn(tx)};
  await assert.rejects(runLifecycleDemoSeed(db,scope,async()=>{throw Error('MUST NOT SEED')}),/scope or generation/);
 }
 await assert.rejects(runLifecycleDemoSeed({}, {companyId:'company'},async()=>{}),/Explicit/);
});
const isolated=(()=>{try{const u=new URL(process.env.DATABASE_URL);return process.env.NODE_ENV==='test'&&['localhost','127.0.0.1','postgres'].includes(u.hostname)&&/test/i.test(u.pathname)}catch{return false}})();
test('native restart seed cannot resurrect cleared target examples while unrelated store examples remain intact',{skip:!isolated},async()=>{
 const {PrismaClient}=await import('@prisma/client'),admin=new PrismaClient(),schema='lifecycle_seed_'+randomUUID().replaceAll('-','');await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
 const url=new URL(process.env.DATABASE_URL);url.searchParams.set('schema',schema);const db=new PrismaClient({datasourceUrl:url.toString()});
 try{
  await db.$executeRawUnsafe(`CREATE TABLE "StoreLifecycleFence"("storeId" text PRIMARY KEY,"companyId" text,"generation" bigint,"maintenance" boolean,"retired" boolean)`);
  await db.$executeRawUnsafe(`CREATE TABLE "Example"("storeId" text,"value" text)`);
  await db.$executeRawUnsafe(`INSERT INTO "Example" VALUES('sibling','UNCHANGED CONTROL')`);
  await db.$executeRawUnsafe(`INSERT INTO "StoreLifecycleFence" VALUES('target','company',1,false,false)`);
  const seed=()=>db.$executeRawUnsafe(`INSERT INTO "Example" VALUES('target','OLD EMPLOYEE AND DEFAULT SHIFTS')`);
  assert.equal((await runLifecycleDemoSeed(db,scope,seed)).skipped,true);
  assert.deepEqual(await db.$queryRawUnsafe(`SELECT * FROM "Example"`),[{storeId:'sibling',value:'UNCHANGED CONTROL'}]);
  await db.$executeRawUnsafe(`UPDATE "StoreLifecycleFence" SET "generation"=0,"maintenance"=true WHERE "storeId"='target'`);
  assert.equal((await runLifecycleDemoSeed(db,scope,seed)).skipped,true);
  assert.equal((await runLifecycleDemoSeed(db,{...scope,storeId:'fresh'},()=>db.$executeRawUnsafe(`INSERT INTO "Example" VALUES('fresh','FIRST INSTALLATION')`))).skipped,false);
  assert.equal((await db.$queryRawUnsafe(`SELECT COUNT(*)::int AS count FROM "Example" WHERE "storeId"='target'`))[0].count,0);
  await assert.rejects(runLifecycleDemoSeed(db,{...scope,companyId:'foreign'},seed),/scope or generation/);
 }finally{await db.$disconnect();await admin.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);await admin.$disconnect()}
});
