import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import express from 'express';
import {PrismaClient} from '@prisma/client';
import {createAttendedRemoteRouter} from '../src/routes/attended-remote.js';
const url=process.env.TEST_DATABASE_URL||process.env.DATABASE_URL;
const local=(()=>{try{return ['localhost','127.0.0.1','::1'].includes(new URL(url).hostname);}catch{return false;}})();
test('native PostgreSQL HTTP: three independent tenants, consent revocation, terminal revocation, file isolation and unchanged business controls',{skip:!local},async()=>{
 const schema=`remote_${crypto.randomBytes(8).toString('hex')}`,admin=new PrismaClient({datasources:{db:{url}}}),scoped=new URL(url);scoped.searchParams.set('schema',schema);const db=new PrismaClient({datasources:{db:{url:scoped.toString()}}});let server,route;
 try{
  await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
  for(const sql of [
   'CREATE TABLE "Company" ("id" TEXT PRIMARY KEY,"active" BOOLEAN DEFAULT TRUE)',
   'CREATE TABLE "Store" ("id" TEXT PRIMARY KEY,"companyId" TEXT,"name" TEXT,"active" BOOLEAN DEFAULT TRUE)',
   'CREATE TABLE "StoreInstallationTerminal" ("id" TEXT PRIMARY KEY,"companyId" TEXT,"storeId" TEXT,"displayName" TEXT,"active" BOOLEAN DEFAULT TRUE)',
   'CREATE TABLE "User" ("id" TEXT PRIMARY KEY,"role" TEXT,"sessionVersion" INTEGER,"mustChangePassword" BOOLEAN DEFAULT FALSE)',
   'CREATE TABLE "UserSession" ("id" TEXT PRIMARY KEY,"userId" TEXT,"expiresAt" TIMESTAMPTZ,"revokedAt" TIMESTAMPTZ)',
   'CREATE TABLE "StoreOperatorCredential" ("id" TEXT PRIMARY KEY,"companyId" TEXT,"storeId" TEXT,"employeeId" TEXT,"role" TEXT,"active" BOOLEAN DEFAULT TRUE)',
   'CREATE TABLE "Employee" ("id" TEXT PRIMARY KEY,"active" BOOLEAN DEFAULT TRUE)',
   'CREATE TABLE "StoreOperatorSession" ("id" TEXT PRIMARY KEY,"operatorId" TEXT,"expiresAt" TIMESTAMPTZ,"revokedAt" TIMESTAMPTZ)',
   'CREATE TABLE "StoreOperatorProfile" ("companyId" TEXT,"storeId" TEXT,"employeeId" TEXT,"posAccess" BOOLEAN DEFAULT TRUE)',
   'CREATE TABLE "AuthAudit" ("id" TEXT PRIMARY KEY,"userId" TEXT,"email" TEXT,"event" TEXT,"success" BOOLEAN,"deviceName" TEXT,"userAgent" TEXT,"ipAddress" TEXT,"createdAt" TIMESTAMPTZ DEFAULT NOW())',
   'CREATE TABLE "RemoteBusinessControl" ("id" TEXT PRIMARY KEY,"cash" NUMERIC,"stock" NUMERIC)'
  ])await db.$executeRawUnsafe(sql);
  await db.$executeRaw`INSERT INTO "User" ("id","role","sessionVersion") VALUES ('admin','SUPER_ADMIN',1)`;
  await db.$executeRaw`INSERT INTO "UserSession" ("id","userId","expiresAt") VALUES ('admin-session','admin',NOW()+INTERVAL '1 hour')`;
  for(let i=0;i<3;i++){
   await db.$executeRaw`INSERT INTO "Company" ("id") VALUES (${`c${i}`})`;
   await db.$executeRaw`INSERT INTO "Store" ("id","companyId","name") VALUES (${`s${i}`},${`c${i}`},${`Store ${i}`})`;
   await db.$executeRaw`INSERT INTO "StoreInstallationTerminal" ("id","companyId","storeId","displayName") VALUES (${`t${i}`},${`c${i}`},${`s${i}`},${`POS ${i}`})`;
   await db.$executeRaw`INSERT INTO "Employee" ("id") VALUES (${`e${i}`})`;
   await db.$executeRaw`INSERT INTO "StoreOperatorCredential" ("id","companyId","storeId","employeeId","role") VALUES (${`op${i}`},${`c${i}`},${`s${i}`},${`e${i}`},'EMPLOYEE')`;
   await db.$executeRaw`INSERT INTO "StoreOperatorSession" ("id","operatorId","expiresAt") VALUES (${`os${i}`},${`op${i}`},NOW()+INTERVAL '1 hour')`;
   await db.$executeRaw`INSERT INTO "StoreOperatorProfile" ("companyId","storeId","employeeId") VALUES (${`c${i}`},${`s${i}`},${`e${i}`})`;
  }
  await db.$executeRaw`INSERT INTO "RemoteBusinessControl" VALUES ('a',51.25,8),('b',90,15)`;const before=await db.$queryRaw`SELECT * FROM "RemoteBusinessControl" ORDER BY "id"`;
  // Authentication is a test adapter; all scope/current-session predicates below run
  // against real PostgreSQL. Production continues to use the unchanged auth middleware.
  const authenticate=(req,res,next)=>{const i=Number(req.headers['x-pos']);req.user=Number.isInteger(i)&&i>=0&&i<3?{id:`op${i}`,operatorId:`op${i}`,employeeId:`e${i}`,operatorSessionId:`os${i}`,tokenType:'STORE_OPERATOR',role:'EMPLOYEE',companyId:`c${i}`,storeId:`s${i}`,terminalId:`t${i}`}:{id:'admin',role:'SUPER_ADMIN',sessionId:'admin-session',sessionVersion:1};next();};
  const facade={$queryRaw:(...args)=>db.$queryRaw(...args),authAudit:db.authAudit,userSession:{findUnique:async({where})=>{const rows=await db.$queryRaw`SELECT os."userId",os."expiresAt",os."revokedAt",u."role",u."sessionVersion",u."mustChangePassword" FROM "UserSession" os JOIN "User" u ON u."id"=os."userId" WHERE os."id"=${where.id}`;const r=rows[0];return r?{userId:r.userId,expiresAt:r.expiresAt,revokedAt:r.revokedAt,user:{role:r.role,sessionVersion:r.sessionVersion,mustChangePassword:r.mustChangePassword}}:null;}}};
  route=createAttendedRemoteRouter({db:facade,authenticate,env:{REMOTE_SUPPORT_ENABLED:'true',REMOTE_SUPPORT_TERMINALS:'t0,t1,t2'}});const app=express();app.use(express.json());app.use(route);app.use((e,_req,res,_next)=>res.status(e.status||500).json({error:e.message}));server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base=`http://127.0.0.1:${server.address().port}`;
  const call=async(path,body,pos)=>{const r=await fetch(base+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(pos===undefined?{}:{'x-pos':String(pos)})},body:body?JSON.stringify(body):undefined});return {status:r.status,body:await r.json()};};
  const jobs=[],tokens=[];
  for(let i=0;i<3;i++){const j=await call('/invitations',{companyId:`c${i}`,storeId:`s${i}`,terminalId:`t${i}`});assert.equal(j.status,201);jobs.push(j.body);assert.equal((await call(`/pos/${j.body.id}/consent`,{accepted:true},(i+1)%3)).status,403);const g=await call(`/pos/${j.body.id}/consent`,{accepted:true},i);const p=await call('/pair',{grant:g.body.grant});assert.equal(p.status,201);tokens.push(p.body.token);}
  for(let i=0;i<3;i++){const r=await call(`/controller/${jobs[i].id}/frame`);assert.equal(r.status,200);assert.equal(r.body.terminalId,`t${i}`);}
  const bytes=Buffer.from('native diagnostic'),sha256=crypto.createHash('sha256').update(bytes).digest('hex');const f=await call(`/controller/${jobs[0].id}/files`,{name:'diagnostic.zip',size:bytes.length,sha256});assert.equal(f.status,201);assert.equal((await call(`/controller/${jobs[1].id}/files/${f.body.id}/chunk?offset=0`)).status,404);
  await db.$executeRaw`UPDATE "StoreInstallationTerminal" SET "active"=FALSE WHERE "id"='t0'`;
  const denied=await fetch(base+`/device/${jobs[0].id}/frame`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${tokens[0]}`},body:JSON.stringify({jpeg:'/9j/YQ==',width:1,height:1})});assert.equal(denied.status,403);assert.equal((await call(`/controller/${jobs[1].id}/frame`)).status,200);
  await db.$executeRaw`UPDATE "StoreOperatorSession" SET "revokedAt"=NOW() WHERE "id"='os1'`;assert.equal((await call(`/controller/${jobs[1].id}/frame`)).status,403);assert.equal((await call(`/controller/${jobs[2].id}/frame`)).status,200);
  assert.deepEqual(await db.$queryRaw`SELECT * FROM "RemoteBusinessControl" ORDER BY "id"`,before);assert.ok(Number((await db.$queryRaw`SELECT COUNT(*) AS n FROM "AuthAudit"`)[0].n)>0);
 }finally{route?.close();if(server)await new Promise(r=>{server.close(r);server.closeAllConnections();});await db.$disconnect();await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await admin.$disconnect();}
});
