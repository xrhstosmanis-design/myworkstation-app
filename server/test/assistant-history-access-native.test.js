import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createAssistantHistoryAccess} from '../src/services/assistant-history-access.js';
import {authorizeOwnerAssistant} from '../src/services/owner-assistant-access.js';
const isolated=()=>{try{const u=new URL(process.env.DATABASE_URL);return process.env.NODE_ENV==='test'&&['localhost','127.0.0.1','postgres'].includes(u.hostname)&&/test/i.test(u.pathname)}catch{return false}};
test('native history adapter uses real personal sessions/roles, selected stores, paid overrides and personnel resolver',{skip:!isolated()},async()=>{
 const {PrismaClient}=await import('@prisma/client'),admin=new PrismaClient(),schema='history_access_'+randomUUID().replaceAll('-','');const u=new URL(process.env.DATABASE_URL);u.searchParams.set('schema',schema);const db=new PrismaClient({datasourceUrl:u.toString()});
 const r={user:{id:'owner',role:'OWNER',companyId:'company',tokenType:'BACKOFFICE_USER',sessionId:'owner-session',sessionVersion:1},params:{storeId:'store'},body:{readScope:'selected_store'}};
 // Controlled company-license fixture. The actual native personal-session,
 // role/store and paid-override SQL is executed; no hosted license PASS.
 const owner=(req,options)=>authorizeOwnerAssistant(req,{...options,getState:async()=>({name:'Isolated company',licenseAllowed:true,activeModules:['AI_OWNER_ASSISTANT','CASH_CONTROL','INVENTORY']})});
 const access=createAssistantHistoryAccess({db,mode:'owner',owner});
 try{
  await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
  for(const sql of [
   'CREATE TABLE "Company"("id" text PRIMARY KEY,"name" text,"active" boolean)',
   'CREATE TABLE "Store"("id" text PRIMARY KEY,"name" text,"companyId" text,"active" boolean)',
   'CREATE TABLE "User"("id" text PRIMARY KEY,"role" text,"companyId" text,"sessionVersion" integer,"mustChangePassword" boolean)',
   'CREATE TABLE "UserSession"("id" text PRIMARY KEY,"userId" text,"deviceName" text,"userAgent" text,"ipAddress" text,"createdAt" timestamp,"lastSeenAt" timestamp,"expiresAt" timestamp,"revokedAt" timestamp)',
   'CREATE TABLE "StorePaidModule"("companyId" text,"storeId" text,"moduleKey" text,"active" boolean,"startsAt" timestamptz,"endsAt" timestamptz)',
   'CREATE TABLE "StoreLifecycleFence"("storeId" text PRIMARY KEY,"companyId" text,"generation" bigint,"maintenance" boolean,"retired" boolean)'
  ])await db.$executeRawUnsafe(sql);
  await db.$executeRaw`INSERT INTO "Company" VALUES('company','Company',true),('foreign','Other',true)`;
  await db.$executeRaw`INSERT INTO "Store" VALUES('store','Store','company',true),('foreign-store','Other','foreign',true)`;
  await db.$executeRaw`INSERT INTO "User" VALUES('owner','OWNER','company',1,false),('admin','SUPER_ADMIN','company',2,false)`;
  await db.$executeRaw`INSERT INTO "UserSession" VALUES('owner-session','owner',null,null,null,NOW(),NOW(),NOW()+INTERVAL '1 day',null),('admin-session','admin',null,null,null,NOW(),NOW(),NOW()+INTERVAL '1 day',null)`;
  await db.$executeRaw`INSERT INTO "StoreLifecycleFence" VALUES('store','company',9007199254740993,false,false)`;
  const first=await access(r);assert.equal(first.generation,'9007199254740993');assert.ok(first.capabilities.includes('business_records:PAYMENTS'));assert.ok(!first.capabilities.includes('business_records:STAFF'));
  await db.$executeRaw`INSERT INTO "StorePaidModule" VALUES('company','store','CASH_CONTROL',false,null,null),('company','store','PERSONNEL_PRO',true,null,null)`;
  const limited=await access(r);assert.ok(!limited.capabilities.includes('cash_details'));assert.ok(!limited.capabilities.includes('business_records:PAYMENTS'));assert.ok(limited.capabilities.includes('business_records:STAFF'));assert.ok(limited.capabilities.includes('business_records:INVOICES'));
  await db.$executeRaw`UPDATE "StorePaidModule" SET "endsAt"=NOW()-INTERVAL '1 second' WHERE "moduleKey"='PERSONNEL_PRO'`;
  assert.ok(!(await access(r)).capabilities.includes('business_records:STAFF'));
  await db.$executeRaw`UPDATE "UserSession" SET "revokedAt"=NOW() WHERE "id"='owner-session'`;await assert.rejects(access(r),e=>e.code==='OWNER_ASSISTANT_SESSION_REVOKED');
  await db.$executeRaw`UPDATE "UserSession" SET "revokedAt"=null WHERE "id"='owner-session'`;await db.$executeRaw`UPDATE "User" SET "role"='EMPLOYEE' WHERE "id"='owner'`;await assert.rejects(access(r),e=>e.code==='OWNER_ASSISTANT_ROLE_REVOKED');
  await db.$executeRaw`UPDATE "User" SET "role"='OWNER' WHERE "id"='owner'`;
  await assert.rejects(access({...r,params:{storeId:'foreign-store'}}),e=>e.code==='OWNER_ASSISTANT_STORE_DENIED');
  const platform=createAssistantHistoryAccess({db,mode:'platform',selection:()=>({companyId:'company',storeId:'store'})});
  await assert.rejects(platform({...r,user:{...r.user,isSuperAdmin:true,platformRole:'SUPER_ADMIN'}}),e=>e.code==='PLATFORM_ASSISTANT_SESSION_REVOKED');
  const adminRequest={user:{id:'admin',role:'SUPER_ADMIN',isSuperAdmin:true,sessionId:'admin-session',sessionVersion:2},body:{readScope:'selected_store'}};
  assert.ok((await platform(adminRequest)).capabilities.includes('business_records:STAFF'));
  await db.$executeRaw`UPDATE "Store" SET "active"=false WHERE "id"='store'`;await assert.rejects(platform(adminRequest),e=>e.code==='PLATFORM_ASSISTANT_STORE_DENIED');
 }finally{await db.$disconnect();await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await admin.$disconnect()}
});
