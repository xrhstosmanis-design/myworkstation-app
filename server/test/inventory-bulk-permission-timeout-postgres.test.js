import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {saveInventoryBulkCard} from '../src/lib/inventory-bulk-card.js';
import {saveInventoryBulkCard as beforeHelper} from './fixtures/inventory-bulk-card-before-timeout.mjs';
const isolated=()=>{try{const u=new URL(process.env.DATABASE_URL);return process.env.NODE_ENV==='test'&&['localhost','127.0.0.1','postgres'].includes(u.hostname)&&/test/i.test(u.pathname)}catch{return false}};
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r});return {promise,resolve}};
const user={id:'synthetic-owner',companyId:'synthetic-company',role:'OWNER'};
const request=()=>({storeId:'synthetic-store',requestId:randomUUID(),productIds:[],allProducts:true,allowPosPriceChange:true});
// Independent sessions distinguish SQL lock expiry from callback scheduling
// delay. Neither synthetic cause establishes the unknown historical blocker.
// No production credentials or business fixtures are used.
test('native diagnostic distinguishes row-lock expiry, callback delay at flag UPDATE and large uncontended permission save',{skip:!isolated(),timeout:45000},async()=>{
 const {PrismaClient}=await import('@prisma/client');
 const admin=new PrismaClient(),schema='bulk_timeout_'+randomUUID().replaceAll('-',''),url=new URL(process.env.DATABASE_URL);url.searchParams.set('schema',schema);
 const db=new PrismaClient({datasourceUrl:url.toString()}),blocker=new PrismaClient({datasourceUrl:url.toString()});
 try{
  await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
  for(const sql of [
   'CREATE TABLE "Store" ("id" text primary key,"companyId" text,"active" boolean)',
   'CREATE TABLE "Product" ("id" text primary key,"companyId" text,"categoryId" text,"subcategoryId" text,"vatDepartmentId" text,"vatRate" numeric default 13,"isSet" boolean default false,"allowPosPriceChange" boolean default false,"salePrice" numeric default 2,"updatedAt" timestamp default now())',
   'CREATE TABLE "StoreProduct" ("storeId" text,"productId" text,"salePrice" numeric default 3,"active" boolean default true,"currentStock" numeric default 12,"updatedAt" timestamp default now(),primary key("storeId","productId"))',
   'CREATE TABLE "StoreOperatorAudit" ("id" text primary key,"companyId" text,"storeId" text,"operatorId" text,"actorId" text,"eventType" text,"details" jsonb)'
  ])await db.$executeRawUnsafe(sql);
  await db.$executeRaw`INSERT INTO "Store" VALUES ('synthetic-store','synthetic-company',true),('control','foreign-company',true)`;
  await db.$executeRaw`INSERT INTO "Product" ("id","companyId") SELECT 'synthetic-'||lpad(n::text,6,'0'),'synthetic-company' FROM generate_series(1,110) n`;
  await db.$executeRaw`INSERT INTO "Product" ("id","companyId") VALUES ('control','foreign-company')`;
  await db.$executeRaw`INSERT INTO "StoreProduct" ("storeId","productId") SELECT 'synthetic-store',"id" FROM "Product" WHERE "companyId"='synthetic-company'`;
  await db.$executeRaw`INSERT INTO "StoreProduct" ("storeId","productId") VALUES ('control','control')`;
  const snapshot=async()=>JSON.stringify(await db.$queryRaw`SELECT (SELECT md5(string_agg(to_jsonb(p)::text,'' ORDER BY p."id")) FROM "Product" p) AS products,(SELECT md5(string_agg(to_jsonb(s)::text,'' ORDER BY s."storeId",s."productId")) FROM "StoreProduct" s) AS stores,(SELECT count(*)::int FROM "StoreOperatorAudit") AS audits`);
  const initial=await snapshot(),held=deferred(),release=deferred();
  const locking=blocker.$transaction(async tx=>{
   await tx.$queryRaw`SELECT "id" FROM "Product" WHERE "id"='synthetic-000001' FOR UPDATE`;
   held.resolve();await release.promise;
  },{timeout:20000});
  await held.promise;
  const phases=[];
  let stallAfterMembership=false;
  const measured={$transaction(work){return db.$transaction(tx=>work(new Proxy(tx,{get(target,key){
   const value=target[key];
   if(!['$queryRaw','$executeRaw'].includes(key))return typeof value==='function'?value.bind(target):value;
   return async(...args)=>{const sql=String(args[0]?.join?.('?')||args[0]),phase=sql.includes('FOR UPDATE OF p,sp')?'membership-lock':sql.includes('UPDATE "Product" SET "allowPosPriceChange"')?'permission-update':'other';const started=performance.now();try{const result=await value.apply(target,args);if(stallAfterMembership&&phase==='membership-lock'){const until=performance.now()+5500;while(performance.now()<until){/* Controlled event-loop stall in this isolated test process only. */}}return result}finally{phases.push({phase,ms:Math.round(performance.now()-started)})}};
  }})))}};
  // Release after the existing interactive budget has expired. Holding the row
  // until this explicit timer avoids relying on a racing application write.
  const timer=setTimeout(release.resolve,6000);
  let failure;
  try{await beforeHelper(measured,user,request())}catch(error){failure=error}finally{clearTimeout(timer);release.resolve();await locking;}
  assert.equal(failure?.code,'P2028','frozen helper must reproduce the actual Prisma expiry class');
  assert(phases.some(p=>p.phase==='membership-lock'&&p.ms>=5000));
  assert.equal(phases.at(-1).phase,'membership-lock','a long database row wait fails in the SELECT, unlike the historical UPDATE stack');
  assert.equal(await snapshot(),initial,'failed request leaves every product/store row and audit unchanged');
  console.log('BULK_PERMISSION_TIMEOUT_DIAGNOSTIC '+JSON.stringify({fixtureProducts:110,code:failure.code,phases,productionCause:'NOT_ESTABLISHED'}));
  // A separate new request with controlled callback scheduling delay reaches
  // the observed UPDATE boundary. This is a reproduction class, not an
  // attribution of the historical production delay to event-loop starvation.
  const warnings=[],originalWarn=console.warn;
  console.warn=(label,value)=>{if(label==='INVENTORY_BULK_PERMISSION_TIMEOUT')warnings.push(JSON.parse(value));else originalWarn(label,value)};
  stallAfterMembership=true;phases.length=0;
  try{await assert.rejects(saveInventoryBulkCard(measured,user,request()),{code:'P2028'})}finally{console.warn=originalWarn;stallAfterMembership=false;}
  assert.equal(phases.at(-1).phase,'permission-update');
  assert.equal(warnings.length,1);assert.equal(warnings[0].phase,'permission-update');
  assert.equal(warnings[0].selectedCount,110);assert(warnings[0].eventLoop.activeMs>=5000);
  assert(!JSON.stringify(warnings).includes('synthetic-'),'diagnostic contains no business identifiers');
  assert.equal(await snapshot(),initial,'callback-expired request also rolls back fully');
  console.log('BULK_PERMISSION_CALLBACK_DIAGNOSTIC '+JSON.stringify(warnings[0]));
  // Separate synthetic large-store action; the original request is never retried.
  await db.$executeRaw`INSERT INTO "Product" ("id","companyId") SELECT 'large-'||lpad(n::text,6,'0'),'synthetic-company' FROM generate_series(1,9890) n`;
  await db.$executeRaw`INSERT INTO "StoreProduct" ("storeId","productId") SELECT 'synthetic-store',"id" FROM "Product" WHERE "id" LIKE 'large-%'`;
  const large=request(),start=performance.now();
  const result=await saveInventoryBulkCard(db,user,large);
  assert.equal(result.changed,10000);
  const audit=(await db.$queryRaw`SELECT "details" FROM "StoreOperatorAudit" WHERE "details"->>'requestId'=${large.requestId}`)[0].details;
  assert.equal(audit.changes.length,10000);assert(audit.changes.every(c=>c.before.allowPosPriceChange===false&&c.after.allowPosPriceChange===true));
  assert.equal((await db.$queryRaw`SELECT "allowPosPriceChange" FROM "Product" WHERE "id"='control'`)[0].allowPosPriceChange,false);
  assert.equal(Number((await db.$queryRaw`SELECT count(*) AS n FROM "StoreProduct" WHERE "salePrice"<>3 OR "currentStock"<>12`)[0].n),0);
  console.log('BULK_PERMISSION_UNCONTENDED_DIAGNOSTIC '+JSON.stringify({fixtureProducts:10000,elapsedMs:Math.round(performance.now()-start),changed:result.changed,productionScaleAcceptance:'NOT_TESTED'}));
 }finally{await blocker.$disconnect();await db.$disconnect();await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await admin.$disconnect()}
});

// Unit checks run without a database; error messages and identifiers must never
// enter the diagnostic, and logging failure must not change the original error.
test('permission timeout evidence is bounded, private and cannot mask the original error',async()=>{
 const failure=Object.assign(new Error('PRIVATE_REQUEST_AND_ERROR_CONTENT'),{code:'P2028'}),messages=[],original=console.warn;
 const db={$transaction:async()=>{throw failure}};
 try{
  console.warn=(...args)=>messages.push(args);
  await assert.rejects(saveInventoryBulkCard(db,user,request()),error=>error===failure);
  assert.equal(messages.length,1);assert.equal(messages[0][0],'INVENTORY_BULK_PERMISSION_TIMEOUT');
  const receipt=JSON.parse(messages[0][1]);assert.equal(receipt.phase,'transaction-start');assert.equal(receipt.selectedCount,null);
  assert(!JSON.stringify(messages).includes('PRIVATE'));assert(!JSON.stringify(messages).includes('synthetic-'));
  messages.length=0;await assert.rejects(saveInventoryBulkCard(db,user,{...request(),allowPosPriceChange:undefined,allProducts:undefined,productIds:['PRIVATE_PRODUCT'],active:false}),error=>error===failure);assert.equal(messages.length,0,'non-permission operation retains previous logging behavior');
  console.warn=()=>{throw Error('log sink failed')};await assert.rejects(saveInventoryBulkCard(db,user,request()),error=>error===failure);
 }finally{console.warn=original}
});
