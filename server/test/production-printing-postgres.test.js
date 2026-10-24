import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {createProductionPrinting} from '../src/services/production-printing.js';
import {reviewedFreshStoreManifest} from '../src/services/store-lifecycle-manifest.js';
function isolated(){try{const u=new URL(process.env.DATABASE_URL);return process.env.NODE_ENV==='test'&&['localhost','127.0.0.1','postgres'].includes(u.hostname)&&/test/i.test(decodeURIComponent(u.pathname))}catch{return false}}
test('native production printing: two POS concurrent replay, rollback, one consumer, foreign scope, lost replies and no physical replay',{skip:!isolated(),timeout:90000},async()=>{
 const {PrismaClient}=await import('@prisma/client'),admin=new PrismaClient(),schema='production_print_'+randomBytes(10).toString('hex'),url=new URL(process.env.DATABASE_URL);url.searchParams.set('schema',schema);const a=new PrismaClient({datasourceUrl:url.toString()}),b=new PrismaClient({datasourceUrl:url.toString()});let created=false,licensed=true;
 try{
  await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);created=true;
  for(const sql of [
   'CREATE TABLE "Store" ("id" TEXT PRIMARY KEY,"name" TEXT,"companyId" TEXT,"active" BOOLEAN)',
   'CREATE TABLE "Product" ("id" TEXT PRIMARY KEY,"name" TEXT,"companyId" TEXT,"active" BOOLEAN)',
   'CREATE TABLE "StoreProduct" ("productId" TEXT,"storeId" TEXT,"active" BOOLEAN)',
   'CREATE TABLE "PreparationProductSettings" ("companyId" TEXT,"productId" TEXT,"preparationEnabled" BOOLEAN)',
   'CREATE TABLE "StorePreparationBatch" ("id" TEXT PRIMARY KEY,"companyId" TEXT,"storeId" TEXT,"operatorId" TEXT,"operatorName" TEXT,"productionStation" TEXT,"priority" TEXT,"note" TEXT,"itemsJson" JSONB,"status" TEXT)',
  ])await a.$executeRawUnsafe(sql);
  await a.$executeRaw`INSERT INTO "Store" VALUES ('kat','KAT','c',true),('control','Control','other',true)`;
  await a.$executeRaw`INSERT INTO "Product" VALUES ('coffee','Καφές','c',true),('water','Νερό','c',true),('foreign','Foreign','other',true)`;
  await a.$executeRaw`INSERT INTO "StoreProduct" VALUES ('coffee','kat',true),('water','kat',true),('foreign','control',true)`;
  await a.$executeRaw`INSERT INTO "PreparationProductSettings" VALUES ('c','coffee',true),('c','water',true),('other','foreign',true)`;
  const make=db=>createProductionPrinting({db,moduleState:async()=>({licenseAllowed:licensed,activeModules:['STORE_MODE']})});const first=make(a),second=make(b);await first.ensure();await second.ensure();
  // Compare the actual idempotent bootstrap output to the backup catalogue,
  // including physical column order, SQL types and nullability.
  const manifest=reviewedFreshStoreManifest();
  const native=await a.$queryRawUnsafe(`SELECT c.relname AS "table",a.attname AS name,format_type(a.atttypid,a.atttypmod) AS type,a.attnotnull AS "notNull" FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=$1 AND a.attnum>0 AND NOT a.attisdropped ORDER BY c.relname,a.attnum`,schema);
  for(const name of ['ProductionPrinter','ProductionPrintRequest','ProductionPrintJob','ProductionPrintResolution'])assert.deepEqual(native.filter(c=>c.table===name).map(c=>[c.name,c.type,c.notNull]),manifest.knownColumns[name],name);
  const settings={enabled:true,name:'Coffee',transport:'NETWORK',host:'192.168.1.87',productIds:['coffee']};
  await assert.rejects(first.configure('c','control',settings),e=>e.status===404);
  await assert.rejects(first.configure('c','kat',{...settings,productIds:['foreign']}),e=>e.status===400);
  await first.configure('c','kat',settings);const pair=await first.pairing('c','kat');const paired=await Promise.allSettled([first.pair(pair.code),second.pair(pair.code)]);assert.equal(paired.filter(r=>r.status==='fulfilled').length,1);const token=paired.find(r=>r.status==='fulfilled').value.token;
  const body={items:[{productId:'coffee',quantity:2,modifiers:[{description:'σκέτος'}],note:'ζεστό',allergens:['ΓΑΛΑ']},{productId:'water',quantity:1}],productionStation:'ΠΑΡΑΓΩΓΗ',priority:'NORMAL'};
  const requestId=randomUUID(),input={companyId:'c',storeId:'kat',requestId,body,products:[{id:'coffee',name:'Καφές'},{id:'water',name:'Νερό'}],operatorName:'Fixture',operatorId:null,validate:async()=>{}};
  const results=await Promise.all([first.dispatch(input),second.dispatch(input)]);assert.equal(results[0].batchId,results[1].batchId);assert.equal(results.filter(r=>r.replayed).length,1);
  assert.equal(Number((await a.$queryRaw`SELECT COUNT(*) AS n FROM "StorePreparationBatch"`)[0].n),1);
  assert.equal(Number((await a.$queryRaw`SELECT COUNT(*) AS n FROM "ProductionPrintJob"`)[0].n),1);
  assert.equal((await first.dispatch(input)).batchId,results[0].batchId);
  await assert.rejects(first.dispatch({...input,body:{...body,priority:'STAFF'}}),e=>e.status===409);
  await assert.rejects(first.dispatch({...input,requestId:randomUUID(),validate:async()=>{throw Error('price changed')}}),/price changed/);
  assert.equal(Number((await a.$queryRaw`SELECT COUNT(*) AS n FROM "StorePreparationBatch"`)[0].n),1);
  await assert.rejects(first.configure('c','kat',settings),e=>e.status===409);
  const claims=await Promise.all([first.claim(token),second.claim(token)]);assert.equal(claims.filter(r=>r.job).length,1);const job=claims.find(r=>r.job).job;
  assert.equal(job.ticket.items.length,1);assert.equal(job.ticket.items[0].productId,'coffee');assert.deepEqual(job.ticket.items[0].allergens,['ΓΑΛΑ']);
  assert.equal((await second.claim(token)).job,null); // lost delivery reply cannot cause physical replay
  await assert.rejects(first.acknowledge(token,job.id,randomUUID(),'WRITTEN'),e=>e.status===409);
  await first.acknowledge(token,job.id,job.claimId,'UNKNOWN');await second.acknowledge(token,job.id,job.claimId,'UNKNOWN');
  assert.equal((await first.claim(token)).job,null);
  licensed=false;await assert.rejects(first.claim(token),e=>e.status===403);licensed=true;
  assert.equal(Number((await a.$queryRaw`SELECT COUNT(*) AS n FROM "StorePreparationBatch" WHERE "companyId"='other'`)[0].n),0);
  assert.equal(Number((await a.$queryRaw`SELECT COUNT(*) AS n FROM "ProductionPrintRequest"`)[0].n),1);
 }finally{await Promise.all([a.$disconnect(),b.$disconnect()]);try{if(created)await admin.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`)}finally{await admin.$disconnect()}}
});
