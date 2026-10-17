import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import express from 'express';
import {companyIdentitySchema,saveCompanyIdentity,archiveInstallationTerminal,registerPlatformMaintenanceRoutes} from '../src/services/platform-company-terminal-maintenance.js';
const source=readFileSync(new URL('../src/routes/platform-admin.js',import.meta.url),'utf8');
const actor={id:'sa',email:'synthetic@example.invalid',isSuperAdmin:true};
const body={name:'Synthetic company',taxId:'001234567',expectedName:'Synthetic company',expectedTaxId:''};
const isolated=(()=>{try{const u=new URL(process.env.DATABASE_URL);return process.env.NODE_ENV==='test'&&['localhost','127.0.0.1','postgres'].includes(u.hostname)&&/test/i.test(u.pathname)}catch{return false}})();
test('maintenance validates AFM and explicit current identity; non-platform actors never access the DB',async()=>{
 for(const taxId of ['','123','000000000','12345678A','1234567890'])assert.equal(companyIdentitySchema.safeParse({...body,taxId}).success,false);
 assert.equal(companyIdentitySchema.parse(body).taxId,'001234567');assert.equal(companyIdentitySchema.safeParse({...body,plan:'ACTIVE'}).success,false);
 const db={$transaction(){throw Error('unexpected DB access')}};
 for(const user of [null,{id:'owner',role:'OWNER'},{id:'op',tokenType:'STORE_OPERATOR'},{id:'wrong',role:'SUPER_ADMIN'}]){
  await assert.rejects(()=>saveCompanyIdentity(db,user,'c',body),e=>e.status===403);
  await assert.rejects(()=>archiveInstallationTerminal(db,user,{companyId:'c',storeId:'s',terminalId:'t'}),e=>e.status===403);
 }
 assert.ok(source.indexOf('registerPlatformMaintenanceRoutes(router,')>source.indexOf('Απαιτείται πρόσβαση Platform Super Admin.'));
 assert.match(source,/"deletedAt" IS NULL\s+ORDER BY/);
 assert.match(source,/WHERE "id"=\$\{existing\[0\]\.id\} AND "active"=TRUE AND "deletedAt" IS NULL/);
 assert.match(source,/"companyId"=\$\{store\.companyId\} AND "deletedAt" IS NULL RETURNING/);
});
async function fixture(){
 const {PrismaClient}=await import('@prisma/client'),admin=new PrismaClient(),schema='platform_maintenance_'+randomUUID().replaceAll('-','');await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
 const url=new URL(process.env.DATABASE_URL);url.searchParams.set('schema',schema);const db=new PrismaClient({datasourceUrl:url.toString()});
 for(const sql of [
  'CREATE TABLE "Company"("id" text primary key,"name" text,"taxId" text,"updatedAt" timestamptz default NOW())',
  'CREATE TABLE "Store"("id" text primary key,"companyId" text)',
  'CREATE TABLE "CashShiftSession"("id" text primary key,"companyId" text,"storeId" text,"terminalPos" text,"status" text,"cash" numeric)',
  'CREATE TABLE "AuthAudit"("id" text primary key,"userId" text,"email" text,"event" text,"success" bool,"deviceName" text,"createdAt" timestamptz default NOW())',
  'CREATE TABLE "HistoricalInvoice"("id" text primary key,"companyId" text,"taxIdSnapshot" text,"amount" numeric)'
 ])await db.$executeRawUnsafe(sql);
 const ddl=source.slice(source.indexOf('let installationTablesPromise;'),source.indexOf('async function installationStore('));const ensure=new Function('prisma',ddl+';return ensureInstallationTables;')(db);await ensure();
 await db.$executeRawUnsafe(`INSERT INTO "Company"("id","name","taxId") VALUES('c','Synthetic company',NULL),('control','Control company','987654321'),('second','Second company',NULL)`);
 await db.$executeRawUnsafe(`INSERT INTO "Store" VALUES('s','c'),('control','control')`);
 await db.$executeRawUnsafe(`INSERT INTO "StoreInstallationTerminal"("id","companyId","storeId","terminalPos","displayName","active","tokenHash","tokenExpiresAt","createdBy") VALUES('t','c','s','SYNTHETIC-POS','Synthetic PC',false,'synthetic-secret',NOW()+INTERVAL '1 day','sa'),('control','control','control','CONTROL','Control PC',true,NULL,NULL,'sa')`);
 await db.$executeRawUnsafe(`INSERT INTO "CashShiftSession" VALUES('old','c','s','SYNTHETIC-POS','CLOSED',17),('control','control','control','CONTROL','OPEN',31)`);
 await db.$executeRawUnsafe(`INSERT INTO "HistoricalInvoice" VALUES('old','c','snapshot-old',11),('control','control','control-old',19)`);
 return {db,ensure,close:async()=>{await db.$disconnect();await admin.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);await admin.$disconnect()}};
}
async function snapshot(db){const result={};for(const name of ['Company','Store','StoreInstallationTerminal','CashShiftSession','HistoricalInvoice','StoreFiscalDevice','StoreEftposDevice','AuthAudit'])result[name]=await db.$queryRawUnsafe(`SELECT row_to_json(t) AS row FROM "${name}" t ORDER BY row_to_json(t)::text`);return result}
test('native identity editor preserves IDs, stores, historical documents and controls; stale/duplicate/existing-AFM replacement refuse and audit failure rolls back',{skip:!isolated},async()=>{
 const f=await fixture();try{
  const before=await snapshot(f.db),saved=await saveCompanyIdentity(f.db,actor,'c',body);assert.equal(saved.company.id,'c');assert.equal(saved.company.taxId,body.taxId);
  const after=await snapshot(f.db);for(const table of ['Store','StoreInstallationTerminal','CashShiftSession','HistoricalInvoice','StoreFiscalDevice','StoreEftposDevice'])assert.deepEqual(after[table],before[table],table);
  assert.deepEqual(after.Company.find(x=>x.row.id==='control'),before.Company.find(x=>x.row.id==='control'));assert.equal(after.AuthAudit.length,1);const event=after.AuthAudit[0].row.event;assert.match(event,/COMPANY_IDENTITY_UPDATED:/);assert.match(event,/"before":\{"id":"c","name":"Synthetic company","taxId":null\}/);
  assert.equal((await saveCompanyIdentity(f.db,actor,'c',{...body,expectedTaxId:body.taxId})).unchanged,true);assert.deepEqual(await snapshot(f.db),after);
  for(const input of [body,{...body,taxId:'123456789',expectedTaxId:body.taxId}]){await assert.rejects(()=>saveCompanyIdentity(f.db,actor,'c',input),e=>e.status===409);assert.deepEqual(await snapshot(f.db),after)}
  await assert.rejects(()=>saveCompanyIdentity(f.db,actor,'second',{...body,name:'Second company',expectedName:'Second company'}),/ήδη σε άλλη εταιρεία/);
  await f.db.$executeRawUnsafe(`ALTER TABLE "AuthAudit" ADD CONSTRAINT reject_audit CHECK("event" NOT LIKE 'COMPANY_IDENTITY_UPDATED%') NOT VALID`);
  const auditBefore=await snapshot(f.db);await assert.rejects(()=>saveCompanyIdentity(f.db,actor,'second',{...body,name:'Second renamed',expectedName:'Second company',taxId:'123456789'}),/check constraint/);assert.deepEqual(await snapshot(f.db),auditBefore);
 }finally{await f.close()}
});
test('native concurrent AFM assignment through this editor yields one company and one audit',{skip:!isolated},async()=>{
 const f=await fixture();try{const results=await Promise.allSettled([saveCompanyIdentity(f.db,actor,'c',body),saveCompanyIdentity(f.db,actor,'second',{...body,name:'Second company',expectedName:'Second company'})]);assert.equal(results.filter(x=>x.status==='fulfilled').length,1);assert.equal(results.filter(x=>x.status==='rejected'&&x.reason.status===409).length,1);assert.equal((await f.db.$queryRaw`SELECT "id" FROM "Company" WHERE "taxId"=${body.taxId}`).length,1);assert.equal((await f.db.$queryRaw`SELECT "id" FROM "AuthAudit"`).length,1)}finally{await f.close()}
});
test('native archive is scoped, idempotent, revokes activation and preserves closed shifts/documents/controls and Terminal ID',{skip:!isolated},async()=>{
 const f=await fixture();try{
  const before=await snapshot(f.db),params={companyId:'c',storeId:'s',terminalId:'t'};
  for(const bad of [{...params,companyId:'control'},{...params,terminalId:'control'},{...params,storeId:'control'}])await assert.rejects(()=>archiveInstallationTerminal(f.db,actor,bad),e=>e.status===404);
  assert.deepEqual(await snapshot(f.db),before);
  const pair=await Promise.all([archiveInstallationTerminal(f.db,actor,params),archiveInstallationTerminal(f.db,actor,params)]);assert.equal(pair.filter(x=>x.alreadyDeleted).length,1);
  const after=await snapshot(f.db),row=after.StoreInstallationTerminal.find(x=>x.row.id==='t').row;assert.ok(row.deletedAt);assert.equal(row.active,false);assert.equal(row.tokenHash,null);assert.equal(row.tokenExpiresAt,null);assert.equal(row.terminalPos,'SYNTHETIC-POS');
  for(const table of ['Company','Store','CashShiftSession','HistoricalInvoice','StoreFiscalDevice','StoreEftposDevice'])assert.deepEqual(after[table],before[table],table);assert.deepEqual(after.StoreInstallationTerminal.find(x=>x.row.id==='control'),before.StoreInstallationTerminal.find(x=>x.row.id==='control'));
  assert.equal(after.AuthAudit.length,1);assert.match(after.AuthAudit[0].row.event,/STORE_TERMINAL_DELETED:/);assert.doesNotMatch(after.AuthAudit[0].row.event,/synthetic-secret/);
  assert.equal((await f.db.$queryRaw`SELECT "id" FROM "StoreInstallationTerminal" WHERE "companyId"='c' AND "storeId"='s' AND "deletedAt" IS NULL`).length,0);
  await assert.rejects(()=>f.db.$executeRawUnsafe(`INSERT INTO "StoreInstallationTerminal"("id","companyId","storeId","terminalPos","displayName","createdBy") VALUES('reuse','c','s','SYNTHETIC-POS','Reuse','sa')`),/unique constraint/);
 }finally{await f.close()}
});
test('native archive refuses active terminal, normalized OPEN shift and fiscal mapping; audit failure rolls tombstone/token state back',{skip:!isolated},async()=>{
 for(const variant of ['active','open','mapping','audit']){const f=await fixture();try{
  if(variant==='active')await f.db.$executeRaw`UPDATE "StoreInstallationTerminal" SET "active"=true WHERE "id"='t'`;
  if(variant==='open')await f.db.$executeRaw`UPDATE "CashShiftSession" SET "terminalPos"=' synthetic-pos ',"status"='OPEN' WHERE "id"='old'`;
  if(variant==='mapping')await f.db.$executeRawUnsafe(`INSERT INTO "StoreFiscalDevice"("id","companyId","storeId","deviceCode","displayName","terminalPos","createdBy") VALUES('f','c','s','FISCAL','Synthetic fiscal','SYNTHETIC-POS','sa')`);
  if(variant==='audit')await f.db.$executeRawUnsafe(`ALTER TABLE "AuthAudit" ADD CONSTRAINT reject_audit CHECK("event" NOT LIKE 'STORE_TERMINAL_DELETED%')`);
  const before=await snapshot(f.db);await assert.rejects(()=>archiveInstallationTerminal(f.db,actor,{companyId:'c',storeId:'s',terminalId:'t'}));assert.deepEqual(await snapshot(f.db),before,variant);
 }finally{await f.close()}}
});
test('native actual HTTP routes reject ordinary users and foreign-store deletes, then save missing AFM and archive only the selected inactive registration',{skip:!isolated},async()=>{
 const f=await fixture();let server;try{
  const app=express();app.use(express.json());app.use((req,res,next)=>{req.user=req.headers['x-fixture-owner']?{id:'owner',role:'OWNER'}:actor;next()});registerPlatformMaintenanceRoutes(app,f.db,f.ensure);app.use((e,req,res,next)=>res.status(e.status||(e.name==='ZodError'?400:500)).json({error:e.message}));server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base=`http://127.0.0.1:${server.address().port}`;
  const request=(path,method,input,owner=false)=>fetch(base+path,{method,headers:{'Content-Type':'application/json',...(owner?{'x-fixture-owner':'1'}:{})},...(input?{body:JSON.stringify(input)}:{})});const before=await snapshot(f.db);
  assert.equal((await request('/companies/c/identity','PUT',body,true)).status,403);assert.equal((await request('/companies/c/stores/s/installation-terminals/t','DELETE',null,true)).status,403);assert.equal((await request('/companies/c/stores/control/installation-terminals/t','DELETE')).status,404);assert.deepEqual(await snapshot(f.db),before);
  assert.equal((await request('/companies/c/identity','PUT',body)).status,200);assert.equal((await request('/companies/c/stores/s/installation-terminals/t','DELETE')).status,200);
 }finally{if(server)await new Promise(r=>server.close(r));await f.close()}
});
