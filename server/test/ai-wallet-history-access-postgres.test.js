import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createAiOwnerWalletRepository} from '../src/services/ai-owner-wallet-repository.js';
import {createWalletAccess} from '../src/services/ai-owner-wallet-access.js';
import {createAiOwnerWalletRoutes} from '../src/routes/ai-owner-wallet.js';

// Synthetic-only proof for the two read-only history endpoints. The guard
// accepts only a local test database and the test drops its own schema.
function isolated(value=process.env.DATABASE_URL){try{
 const u=new URL(value);if(process.env.NODE_ENV!=='test'||!['postgres:','postgresql:'].includes(u.protocol)||!['localhost','127.0.0.1','postgres'].includes(u.hostname)||u.hash||!/^\/(?:test(?:[_-][a-z0-9_-]+)?|[a-z0-9_-]+[_-]test(?:[_-][a-z0-9_-]+)?)$/i.test(decodeURIComponent(u.pathname)))return false;
 const seen=new Set();for(const[k,v]of u.searchParams){if(seen.has(k))return false;seen.add(k);if(k==='schema'){if(!/^[a-z_][a-z0-9_]{0,62}$/i.test(v))return false}else if(!['connection_limit','pool_timeout','statement_cache_size'].includes(k)||!/^\d{1,6}$/.test(v))return false}return true;
}catch{return false}}

test('history access PostgreSQL proof is required in full CI',()=>{if(process.env.CI)assert.ok(isolated());assert.equal(isolated('postgresql://a:b@remote/production'),false)});

test('history endpoints enforce Super Admin, OWNER, company and store scope without writes',{skip:!isolated(),timeout:120000},async()=>{
 const {PrismaClient}=await import('@prisma/client'),admin=new PrismaClient(),schema='wallet_history_access_'+randomUUID().replaceAll('-',''),url=new URL(process.env.DATABASE_URL);url.searchParams.set('schema',schema);
 const db=new PrismaClient({datasourceUrl:url.toString()});let created=false,server;
 try{
  await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);created=true;
  for(const sql of [
   `CREATE TYPE "UserRole" AS ENUM ('SUPER_ADMIN','OWNER','ADMIN','MANAGER','EMPLOYEE')`,
   'CREATE TABLE "Company"("id" text PRIMARY KEY,"name" text,"active" boolean)',
   'CREATE TABLE "Store"("id" text PRIMARY KEY,"name" text,"companyId" text,"active" boolean)',
   'CREATE TABLE "User"("id" text PRIMARY KEY,"email" text,"fullName" text,"role" "UserRole","companyId" text,"sessionVersion" integer,"mustChangePassword" boolean)',
   'CREATE TABLE "UserSession"("id" text PRIMARY KEY,"userId" text,"deviceName" text,"userAgent" text,"ipAddress" text,"createdAt" timestamp,"lastSeenAt" timestamp,"expiresAt" timestamp,"revokedAt" timestamp)',
   'CREATE TABLE "OwnerCompanyAccess"("ownerId" text,"companyId" text)',
   'CREATE TABLE "BusinessControl"("id" text PRIMARY KEY,"sales" integer,"cash" numeric,"stock" integer)'
  ])await db.$executeRawUnsafe(sql);
  await db.$executeRaw`INSERT INTO "Company" VALUES('c','Synthetic company',true),('x','Synthetic foreign company',true),('closed','Synthetic inactive company',false)`;
  await db.$executeRaw`INSERT INTO "Store" VALUES('s','Store 1','c',true),('s2','Store 2','c',true),('inactive','Inactive','c',false),('foreign','Foreign','x',true)`;
  const users=[['owner','OWNER','c'],['admin','SUPER_ADMIN','c'],['employee','EMPLOYEE','c'],['manager','MANAGER','c'],['foreign-owner','OWNER','x']];
  for(const [id,role,company] of users){
   await db.$executeRawUnsafe(`INSERT INTO "User" VALUES($1,$2,$3,$4::"UserRole",$5,1,false)`,id,id+'@example.invalid',id,role,company);
   await db.$executeRaw`INSERT INTO "UserSession" VALUES(${id+'-session'},${id},null,null,null,NOW(),NOW(),NOW()+INTERVAL '1 day',null)`;
  }
  await db.$executeRaw`INSERT INTO "BusinessControl" VALUES('control',12,123.45,25)`;
  const repository=createAiOwnerWalletRepository(db);await repository.ensure();
  await db.$executeRaw`INSERT INTO "AiOwnerWallet" ("companyId","cycleId") VALUES('c','synthetic-cycle-c'),('x','synthetic-cycle-x')`;
  // 105 selected-store rows force a second page; sibling, foreign and a company credit are controls.
  await db.$executeRaw`INSERT INTO "AiOwnerWalletEntry" ("id","companyId","storeId","kind","reference","status","reservedMicros","chargedMicros","feature","createdAt") SELECT 'own-'||lpad(n::text,3,'0'),'c','s','USAGE','own-'||n,'SETTLED',1,1,'INVOICE_OPENAI','2026-11-03T12:00:00.000001Z'::timestamptz+n*INTERVAL '1 second' FROM generate_series(1,105) n`;
  await db.$executeRaw`INSERT INTO "AiOwnerWalletEntry" ("id","companyId","storeId","kind","reference","status","reservedMicros","chargedMicros","feature") VALUES('sibling-usage','c','s2','USAGE','sibling-usage','SETTLED',1,1,'INVOICE_OPENAI'),('foreign-usage','x','foreign','USAGE','foreign-usage','SETTLED',1,1,'INVOICE_OPENAI')`;
  await db.$executeRaw`INSERT INTO "AiOwnerWalletEntry" ("id","companyId","storeId","kind","reference","status","creditedMicros") VALUES('company-credit','c','s2','CREDIT','company-credit','CREDITED',5000)`;
  const snapshot=async()=>JSON.stringify(await db.$queryRaw`SELECT (SELECT md5(string_agg(row_to_json(e)::text,',' ORDER BY "id")) FROM "AiOwnerWalletEntry" e) AS entries,(SELECT md5(string_agg(row_to_json(w)::text,',' ORDER BY "companyId")) FROM "AiOwnerWallet" w) AS wallets,(SELECT md5(string_agg(row_to_json(b)::text,',' ORDER BY "id")) FROM "BusinessControl" b) AS controls`);
  const before=await snapshot();

  const express=(await import('express')).default,app=express();
  const authenticate=(req,res,next)=>{const id=req.headers['x-test-actor'];if(!id)return res.sendStatus(401);const [,role,company]=users.find(u=>u[0]===id)||[];
   req.user={id,sessionId:id+'-session',sessionVersion:1,companyId:company,tokenType:'BACKOFFICE_USER',role:role==='SUPER_ADMIN'?'OWNER':role,...(role==='SUPER_ADMIN'?{isSuperAdmin:true,platformRole:'SUPER_ADMIN'}:{})};next()};
  app.use('/wallet',createAiOwnerWalletRoutes({db,repository,authenticate,access:createWalletAccess(db),enabled:()=>true,env:{}}));
  server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base=`http://127.0.0.1:${server.address().port}/wallet`;
  const get=async(path,actor)=>{const r=await fetch(base+path,{headers:actor?{'x-test-actor':actor}:{}});const text=await r.text();return {status:r.status,cache:r.headers.get('cache-control'),body:text&&r.headers.get('content-type')?.includes('json')?JSON.parse(text):null}};
  const ids=page=>page.body.entries.map(e=>e.id);
  const storePath=store=>'/stores/'+store+'/history',platformPath=company=>'/platform/companies/'+company+'/history';

  // Unauthenticated requests stop at authentication.
  for(const path of [storePath('s'),platformPath('c')])assert.equal((await get(path,null)).status,401);

  // OWNER: selected store plus company credits, two pages, never sibling/foreign usage.
  const first=await get(storePath('s'),'owner');
  assert.equal(first.status,200);assert.equal(first.cache,'no-store');assert.equal(first.body.runtimeEnabled,true);
  assert.equal(first.body.companyId,'c');assert.equal(first.body.storeId,'s');assert.equal(first.body.entries.length,100);assert.ok(first.body.nextCursor);
  const second=await get(storePath('s')+'?cursor='+encodeURIComponent(first.body.nextCursor),'owner');
  assert.equal(second.status,200);assert.equal(second.body.nextCursor,null);
  const ownerIds=[...ids(first),...ids(second)];
  assert.equal(ownerIds.length,106);assert.equal(new Set(ownerIds).size,106);assert.ok(ownerIds.includes('company-credit'));
  assert.equal(ownerIds.includes('sibling-usage'),false);assert.equal(ownerIds.includes('foreign-usage'),false);

  // OWNER is denied the platform route, foreign/inactive/missing stores and cross-scope cursors.
  const ownerPlatform=await get(platformPath('c'),'owner');assert.equal(ownerPlatform.status,403);assert.equal(ownerPlatform.body.code,'AI_WALLET_ROLE_DENIED');assert.equal(ownerPlatform.cache,'no-store');
  for(const store of ['foreign','inactive','missing']){const r=await get(storePath(store),'owner');assert.equal(r.status,404,store);assert.equal(r.body.code,'AI_WALLET_SCOPE_DENIED');assert.equal(r.body.entries,undefined)}
  const crossStore=await get(storePath('s2')+'?cursor='+encodeURIComponent(first.body.nextCursor),'owner');assert.equal(crossStore.status,400);assert.equal(crossStore.body.code,'AI_WALLET_INVALID_INPUT');

  // An owner of another company cannot read this company's store.
  const foreignOwner=await get(storePath('s'),'foreign-owner');assert.equal(foreignOwner.status,404);assert.equal(foreignOwner.body.entries,undefined);
  const foreignOwnPlatform=await get(platformPath('c'),'foreign-owner');assert.equal(foreignOwnPlatform.status,403);

  // Non-owner backoffice roles are denied both routes.
  for(const actor of ['employee','manager']){
   const store=await get(storePath('s'),actor);assert.equal(store.status,403,actor);assert.equal(store.body.code,'AI_WALLET_ROLE_DENIED');assert.equal(store.body.entries,undefined);
   const platform=await get(platformPath('c'),actor);assert.equal(platform.status,403,actor);assert.equal(platform.body.entries,undefined);
  }

  // Super Admin: company-wide platform history, separate company scope, refused store route.
  const companyPage=await get(platformPath('c'),'admin');
  assert.equal(companyPage.status,200);assert.equal(companyPage.cache,'no-store');assert.equal(companyPage.body.companyId,'c');assert.equal(companyPage.body.storeId,null);
  let adminIds=ids(companyPage);const adminNext=await get(platformPath('c')+'?cursor='+encodeURIComponent(companyPage.body.nextCursor),'admin');assert.equal(adminNext.status,200);adminIds=[...adminIds,...ids(adminNext)];
  assert.equal(adminIds.length,107);assert.ok(adminIds.includes('sibling-usage'));assert.ok(adminIds.includes('company-credit'));assert.equal(adminIds.includes('foreign-usage'),false);
  const foreignCompany=await get(platformPath('x'),'admin');assert.equal(foreignCompany.status,200);assert.deepEqual(ids(foreignCompany),['foreign-usage']);
  for(const company of ['missing','closed']){const r=await get(platformPath(company),'admin');assert.equal(r.status,404,company);assert.equal(r.body.code,'AI_WALLET_SCOPE_DENIED')}
  const adminStore=await get(storePath('s'),'admin');assert.equal(adminStore.status,403);assert.equal(adminStore.body.code,'AI_WALLET_ROLE_DENIED');assert.equal(adminStore.body.entries,undefined);
  // A company cursor cannot be replayed on another company or on the store route.
  const otherCompany=await get(platformPath('x')+'?cursor='+encodeURIComponent(companyPage.body.nextCursor),'admin');assert.equal(otherCompany.status,400);
  const companyCursorOnStore=await get(storePath('s')+'?cursor='+encodeURIComponent(companyPage.body.nextCursor),'owner');assert.equal(companyCursorOnStore.status,400);
  const unknownQuery=await get(storePath('s')+'?limit=500','owner');assert.equal(unknownQuery.status,400);

  // Revoked sessions are refused on both routes.
  await db.$executeRaw`UPDATE "UserSession" SET "revokedAt"=NOW() WHERE "id" IN ('owner-session','admin-session')`;
  const revokedOwner=await get(storePath('s'),'owner');assert.equal(revokedOwner.status,401);assert.equal(revokedOwner.body.code,'AI_WALLET_SESSION_REQUIRED');
  const revokedAdmin=await get(platformPath('c'),'admin');assert.equal(revokedAdmin.status,401);assert.equal(revokedAdmin.body.code,'AI_WALLET_SESSION_REQUIRED');

  assert.equal(await snapshot(),before);
 }finally{if(server)await new Promise(r=>server.close(r));await db.$disconnect();if(created)await admin.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);await admin.$disconnect();}
});
