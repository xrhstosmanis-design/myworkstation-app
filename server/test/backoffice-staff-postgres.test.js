import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {readFile} from 'node:fs/promises';
import express from 'express';
import jwt from 'jsonwebtoken';
import {z} from 'zod';
import {PrismaClient} from '@prisma/client';
import {ensureBackofficeStaffSchema} from '../src/backoffice-staff-bootstrap.js';
import {enforceBackofficeStaff,requireStaffGrant} from '../src/services/backoffice-staff-access.js';
import {createStaffAccount,updateStaffAccount,verifyStaffLogin} from '../src/services/backoffice-staff-accounts.js';
import {createBackofficeStaffRouter} from '../src/routes/backoffice-staff.js';
import {issueSession} from '../src/routes/auth.js';
import {assertCustomerDemoRuntimeClosed} from '../src/customer-demo-runtime.js';
import {lockDraftInventoryStocktake} from '../src/lib/inventory-stocktake-draft.js';
import {inventoryStocktakeScopeAllowed,inventoryStoreScopeAllowed} from '../src/lib/inventory-stocktake-scope.js';
import {reviewedFreshStoreManifest} from '../src/services/store-lifecycle-manifest.js';
import {lifecyclePreview} from '../src/services/store-lifecycle-preview.js';
const isolated=()=>{try{const u=new URL(process.env.DATABASE_URL);return process.env.NODE_ENV==='test'&&['localhost','127.0.0.1','postgres'].includes(u.hostname)&&u.pathname==='/myworkstation_test'}catch{return false}};
test('native personal BackOffice identities, hashed PIN, scoped HTTP count, revocation and immutable audit',{skip:!isolated()},async t=>{
  const schema='staff_'+crypto.randomBytes(8).toString('hex'),admin=new PrismaClient(),url=new URL(process.env.DATABASE_URL);url.searchParams.set('schema',schema);
  const db=new PrismaClient({datasourceUrl:url.toString()}),oldSecret=process.env.JWT_SECRET;process.env.JWT_SECRET||='isolated-staff-only';let server;
  try{
    await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
    for(const sql of [
      `CREATE TYPE "UserRole" AS ENUM ('SUPER_ADMIN','OWNER','ADMIN','MANAGER','EMPLOYEE')`,
      `CREATE TABLE "Company" ("id" TEXT PRIMARY KEY,"name" TEXT NOT NULL,"active" BOOLEAN NOT NULL DEFAULT true,"licenseStatus" TEXT NOT NULL DEFAULT 'ACTIVE',"subscriptionEndsAt" TIMESTAMPTZ)`,
      `CREATE TABLE "CompanyModule" ("id" TEXT PRIMARY KEY,"companyId" TEXT NOT NULL REFERENCES "Company"("id"),"moduleKey" TEXT NOT NULL,"active" BOOLEAN NOT NULL DEFAULT true,"startsAt" TIMESTAMPTZ,"endsAt" TIMESTAMPTZ)`,
      `CREATE TABLE "Store" ("id" TEXT PRIMARY KEY,"companyId" TEXT NOT NULL REFERENCES "Company"("id"),"name" TEXT NOT NULL,"active" BOOLEAN NOT NULL DEFAULT true)`,
      `CREATE TABLE "StorePaidModule" ("storeId" TEXT,"moduleKey" TEXT,"active" BOOLEAN,"startsAt" TIMESTAMPTZ,"endsAt" TIMESTAMPTZ)`,
      `CREATE TABLE "User" ("id" TEXT PRIMARY KEY,"companyId" TEXT NOT NULL REFERENCES "Company"("id"),"email" TEXT UNIQUE NOT NULL,"fullName" TEXT NOT NULL,"role" "UserRole" NOT NULL,"passwordHash" TEXT NOT NULL,"mustChangePassword" BOOLEAN NOT NULL DEFAULT false,"sessionVersion" INTEGER NOT NULL DEFAULT 0,"totpSecret" TEXT,"totpEnabled" BOOLEAN NOT NULL DEFAULT false,"totpRecoveryCodes" TEXT,"createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),"updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW())`,
      `CREATE TABLE "UserSession" ("id" TEXT PRIMARY KEY,"userId" TEXT NOT NULL REFERENCES "User"("id"),"deviceName" TEXT,"userAgent" TEXT,"ipAddress" TEXT,"createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),"lastSeenAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),"expiresAt" TIMESTAMPTZ NOT NULL,"revokedAt" TIMESTAMPTZ)`,
      `CREATE TABLE "AuthAudit" ("id" TEXT PRIMARY KEY,"userId" TEXT,"email" TEXT NOT NULL,"event" TEXT NOT NULL,"success" BOOLEAN NOT NULL,"deviceName" TEXT,"userAgent" TEXT,"ipAddress" TEXT,"createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW())`,
      `CREATE TABLE "Stocktake" ("id" TEXT PRIMARY KEY,"companyId" TEXT NOT NULL,"storeId" TEXT NOT NULL,"name" TEXT,"inventoryVersion" INTEGER DEFAULT 2,"status" TEXT DEFAULT 'DRAFT',"scopeType" TEXT DEFAULT 'FULL',"scopeJson" JSONB DEFAULT '{}',"liveDuringTrading" BOOLEAN DEFAULT false,"recountPolicy" TEXT DEFAULT 'NONE',"startedAt" TIMESTAMPTZ DEFAULT NOW(),"finalizedAt" TIMESTAMPTZ,"snapshotJson" JSONB)`,
      `CREATE TABLE "StocktakeLine" ("id" TEXT PRIMARY KEY,"stocktakeId" TEXT NOT NULL REFERENCES "Stocktake"("id"),"productId" TEXT NOT NULL,"expectedQuantity" NUMERIC DEFAULT 0,"countedQuantity" NUMERIC,"unitCost" NUMERIC DEFAULT 0,"zoneId" TEXT,"countVersion" INTEGER NOT NULL DEFAULT 0,"recountRequired" BOOLEAN DEFAULT false,"countedByUserId" TEXT REFERENCES "User"("id"),"countedAt" TIMESTAMPTZ,"countSource" TEXT,"updatedAt" TIMESTAMPTZ DEFAULT NOW())`,
      `CREATE TABLE "Product" ("id" TEXT PRIMARY KEY,"companyId" TEXT NOT NULL,"name" TEXT,"sku" TEXT)`,
      `CREATE TABLE "ProductBarcode" ("productId" TEXT,"barcode" TEXT,"createdAt" TIMESTAMPTZ DEFAULT NOW())`,
      `CREATE TABLE "InventoryCountEvent" ("id" TEXT PRIMARY KEY,"companyId" TEXT,"storeId" TEXT,"stocktakeId" TEXT,"lineId" TEXT,"zoneId" TEXT,"eventType" TEXT,"previousQuantity" NUMERIC,"countedQuantity" NUMERIC,"expectedQuantity" NUMERIC,"actorId" TEXT,"actorName" TEXT,"deviceId" TEXT,"source" TEXT,"clientEventId" TEXT,"createdAt" TIMESTAMPTZ DEFAULT NOW())`,
      `CREATE TABLE "Sale" ("id" TEXT PRIMARY KEY,"amount" NUMERIC)`,
      `CREATE TABLE "StockMovement" ("id" TEXT PRIMARY KEY,"quantity" NUMERIC)`
    ])await db.$executeRawUnsafe(sql);
    await db.$executeRaw`INSERT INTO "Company" ("id","name") VALUES ('a','A'),('b','B')`;
    await db.$executeRaw`INSERT INTO "Store" ("id","companyId","name") VALUES ('a1','a','A1'),('a2','a','A2'),('b1','b','B1')`;
    await db.$executeRaw`INSERT INTO "CompanyModule" ("id","companyId","moduleKey") SELECT 'a-'||key,'a',key FROM unnest(ARRAY['CORE','INVENTORY','CASH_CONTROL','STORE_CHAT','AI_READER']) AS key`;
    await db.$executeRaw`INSERT INTO "User" ("id","companyId","email","fullName","role","passwordHash") VALUES ('owner-a','a','a@isolated.invalid','Owner A','OWNER','unused'),('owner-b','b','b@isolated.invalid','Owner B','OWNER','unused')`;
    await db.$executeRaw`INSERT INTO "UserSession" ("id","userId","expiresAt") VALUES ('session-owner-a','owner-a',NOW()+INTERVAL '1 hour'),('session-owner-b','owner-b',NOW()+INTERVAL '1 hour')`;
    await ensureBackofficeStaffSchema(db);await ensureBackofficeStaffSchema(db);
    const owner={id:'owner-a',companyId:'a',role:'OWNER',platformRole:'OWNER',tokenType:'BACKOFFICE_USER',sessionId:'session-owner-a',sessionVersion:0};
    const input={username:'counter.fixture',fullName:'Isolated Counter',password:'isolated-password-624918',pin:'624918',grants:[{storeId:'a1',profile:'STOCKTAKER',capabilities:['inventory.read','inventory.count']}]};
    const created=await createStaffAccount(db,owner,input),staffId=created.id;
    await assert.rejects(createStaffAccount(db,owner,{...input,username:'foreign.fixture',grants:[{...input.grants[0],storeId:'b1'}]}),{code:'STAFF_STORE_INVALID'});
    await assert.rejects(createStaffAccount(db,{...owner,sessionId:'session-owner-b'},{...input,username:'session.fixture'}),{code:'STAFF_ACCESS_DENIED'});
    await assert.rejects(createStaffAccount(db,owner,input));
    const saved=(await db.$queryRaw`SELECT u."passwordHash",a."pinHash" FROM "User" u JOIN "BackofficeStaffAccount" a ON a."userId"=u."id" WHERE u."id"=${staffId}`)[0];
    assert.notEqual(saved.passwordHash,input.password);assert.notEqual(saved.pinHash,input.pin);assert.notEqual(saved.pinHash,saved.passwordHash);
    const authSource=(await readFile(new URL('../src/middleware/auth.js',import.meta.url),'utf8')).replace(/^import .*;\n/gm,'').replace('export async function auth','async function auth');
    const auth=new Function('jwt','crypto','prisma','assertCustomerDemoRuntimeClosed','authorizeChatOperator','enforceBackofficeStaff',authSource+'\nreturn auth;')(jwt,crypto,db,assertCustomerDemoRuntimeClosed,async()=>null,enforceBackofficeStaff);
    const inventorySource=(await readFile(new URL('../src/routes/inventory-v2.js',import.meta.url),'utf8')).replace(/^import[\s\S]*?;\n/gm,'').replace(/^export default .*;\n/gm,'');
    let beforeCount;
    const countGrant=async(...args)=>{if(beforeCount){const wait=beforeCount;beforeCount=null;await wait()}return requireStaffGrant(...args)};
    const inventory=new Function('Router','z','crypto','prisma','jwt','assertCustomerDemoRuntimeClosed','finalizeInventoryStocktake','lockDraftInventoryStocktake','inventoryStocktakeScopeAllowed','inventoryStoreScopeAllowed','requireStaffGrant',inventorySource+'\nreturn router;')(express.Router,z,crypto,db,jwt,assertCustomerDemoRuntimeClosed,()=>assert.fail('finalization executed'),lockDraftInventoryStocktake,inventoryStocktakeScopeAllowed,inventoryStoreScopeAllowed,countGrant);
    const app=express();app.use(express.json());app.use('/api/backoffice-staff',createBackofficeStaffRouter({db,authenticate:auth,issueSession,repository:{}}));app.use('/api/inventory-v2',auth,inventory);app.get('/api/platform/companies',auth,(_req,res)=>res.json({leak:true}));app.use((e,_req,res,_next)=>res.status(e.status||500).json({code:e.code,error:e.message}));
    server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s))});
    const request=async(path,{token,method='GET',body,storeId}={})=>{
      const r=await fetch(`http://127.0.0.1:${server.address().port}${path}`,{method,headers:{'content-type':'application/json',...(token?{authorization:'Bearer '+token}:{}),...(storeId?{'x-backoffice-store-id':storeId}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,data:await r.json(),headers:r.headers};
    };
    let token;
    await t.test('username/PIN and username/password use personal revocable UserSession and omit secrets',async()=>{
      for(const credential of [{pin:input.pin},{password:input.password}]){
        const r=await request('/api/backoffice-staff/login',{method:'POST',body:{username:input.username,...credential}});assert.equal(r.status,200,JSON.stringify(r.data));token=r.data.token;
        const claims=jwt.verify(token,process.env.JWT_SECRET);assert.equal(claims.id,staffId);assert.equal(claims.role,'EMPLOYEE');assert.equal(claims.staffAccess,true);assert.equal(r.data.user.staffAccess,true);
        assert.ok(!JSON.stringify(r.data).includes(input.password));assert.ok(!JSON.stringify(r.data).includes(saved.pinHash));
      }
      const r=await request('/api/backoffice-staff/me',{token});assert.equal(r.status,200);assert.deepEqual(r.data.stores.map(s=>s.id),['a1']);assert.match(r.headers.get('cache-control'),/no-store/);
    });
    await db.$executeRaw`INSERT INTO "Stocktake" ("id","companyId","storeId","name") VALUES ('sta','a','a1','A'),('sta2','a','a2','Other own store'),('stb','b','b1','Foreign')`;
    await db.$executeRaw`INSERT INTO "Product" VALUES ('pa','a','Product A','SKU-A')`;
    await db.$executeRaw`INSERT INTO "StocktakeLine" ("id","stocktakeId","productId","expectedQuantity","unitCost") VALUES ('line-a','sta','pa',5,17.23),('line-a2','sta2','pa',8,22)`;
    await db.$executeRaw`INSERT INTO "Sale" VALUES ('control',77.33)`;await db.$executeRaw`INSERT INTO "StockMovement" VALUES ('control',42)`;
    await t.test('direct unknown/admin/foreign store/object/finalization calls are denied before writers',async()=>{
      for(const [path,options] of [['/api/platform/companies',{}],['/api/backoffice-staff/admin',{}],['/api/inventory-v2/stocktakes',{}],['/api/inventory-v2/stocktakes/sta/finalize',{method:'POST',body:{}}],['/api/inventory-v2/stocktakes/sta2/count',{method:'POST',body:{}}],['/api/backoffice-staff/inventory/stores/a2/stocktakes',{storeId:'a2'}],['/api/backoffice-staff/inventory/stores/b1/stocktakes',{storeId:'b1'}],['/api/backoffice-staff/inventory/stores/a1/stocktakes/sta2',{}],['/api/backoffice-staff/cash/stores/a1',{}]]){
        const r=await request(path,{token,storeId:'a1',...options});assert.ok([403,404].includes(r.status),path+' '+JSON.stringify(r));
      }
      const list=await request('/api/backoffice-staff/inventory/stores/a1/stocktakes',{token,storeId:'a1'});assert.equal(list.status,200);assert.deepEqual(list.data.stocktakes.map(s=>s.id),['sta']);
      const detail=await request('/api/backoffice-staff/inventory/stores/a1/stocktakes/sta',{token,storeId:'a1'});assert.equal(detail.status,200);assert.equal(detail.data.lines.length,1);assert.equal(Object.hasOwn(detail.data.lines[0],'unitCost'),false);assert.equal(Object.hasOwn(detail.data.lines[0],'expectedQuantity'),false);
    });
    const count={lineId:'line-a',quantity:7,expectedVersion:0,clientEventId:crypto.randomUUID(),source:'BACKOFFICE'};
    await t.test('actual existing count writer attributes one native count/event and replays once without stock/financial writes',async()=>{
      for(let i=0;i<2;i++){const r=await request('/api/inventory-v2/stocktakes/sta/count',{token,storeId:'a1',method:'POST',body:count});assert.equal(r.status,200,JSON.stringify(r.data));assert.equal(i?r.data.replayed:r.data.ok,true)}
      const line=(await db.$queryRaw`SELECT "countedQuantity","countVersion","countedByUserId" FROM "StocktakeLine" WHERE "id"='line-a'`)[0];assert.equal(Number(line.countedQuantity),7);assert.equal(line.countVersion,1);assert.equal(line.countedByUserId,staffId);
      const events=await db.$queryRaw`SELECT "actorId" FROM "InventoryCountEvent"`;assert.deepEqual(events,[{actorId:staffId}]);
      assert.equal(Number((await db.$queryRaw`SELECT "amount" FROM "Sale"`)[0].amount),77.33);assert.equal(Number((await db.$queryRaw`SELECT "quantity" FROM "StockMovement"`)[0].quantity),42);
      const foreign=(await db.$queryRaw`SELECT "countedQuantity","countVersion" FROM "StocktakeLine" WHERE "id"='line-a2'`)[0];assert.equal(foreign.countedQuantity,null);assert.equal(foreign.countVersion,0);
    });
    await t.test('current license, disabled user, wrong session owner, withdrawn grant and role demotion refuse cached token',async()=>{
      await db.$executeRaw`UPDATE "CompanyModule" SET "active"=false WHERE "companyId"='a' AND "moduleKey"='INVENTORY'`;
      assert.equal((await request('/api/inventory-v2/stocktakes/sta/count',{token,storeId:'a1',method:'POST',body:count})).status,403);
      await db.$executeRaw`UPDATE "CompanyModule" SET "active"=true WHERE "companyId"='a'`;
      const claims=jwt.verify(token,process.env.JWT_SECRET),wrong=jwt.sign({...claims,sessionId:'session-owner-b'},process.env.JWT_SECRET);assert.equal((await request('/api/backoffice-staff/me',{token:wrong})).status,401);
      await db.$executeRaw`UPDATE "BackofficeStaffGrant" SET "active"=false WHERE "userId"=${staffId}`;assert.equal((await request('/api/inventory-v2/stocktakes/sta/count',{token,storeId:'a1',method:'POST',body:count})).status,403);await db.$executeRaw`UPDATE "BackofficeStaffGrant" SET "active"=true WHERE "userId"=${staffId}`;
      await db.$executeRaw`UPDATE "BackofficeStaffAccount" SET "active"=false WHERE "userId"=${staffId}`;assert.equal((await request('/api/backoffice-staff/me',{token})).status,401);await db.$executeRaw`UPDATE "BackofficeStaffAccount" SET "active"=true WHERE "userId"=${staffId}`;
      await db.$executeRaw`UPDATE "User" SET "role"='MANAGER' WHERE "id"=${staffId}`;assert.equal((await request('/api/backoffice-staff/me',{token})).status,401);await db.$executeRaw`UPDATE "User" SET "role"='EMPLOYEE' WHERE "id"=${staffId}`;
    });
    await t.test('withdrawal after HTTP admission but before native count transaction refuses without a second event',async()=>{
      let reached,release;const entered=new Promise(r=>{reached=r}),wait=new Promise(r=>{release=r});beforeCount=async()=>{reached();await wait};
      const pending=request('/api/inventory-v2/stocktakes/sta/count',{token,storeId:'a1',method:'POST',body:{...count,quantity:9,expectedVersion:1,clientEventId:crypto.randomUUID()}});
      await entered;
      try{await db.$executeRaw`UPDATE "BackofficeStaffGrant" SET "active"=false WHERE "userId"=${staffId}`;}finally{release()}
      assert.equal((await pending).status,403);
      assert.equal(Number((await db.$queryRaw`SELECT COUNT(*) AS n FROM "InventoryCountEvent"`)[0].n),1);
      assert.equal(Number((await db.$queryRaw`SELECT "countedQuantity" FROM "StocktakeLine" WHERE "id"='line-a'`)[0].countedQuantity),7);
      await db.$executeRaw`UPDATE "BackofficeStaffGrant" SET "active"=true WHERE "userId"=${staffId}`;
    });
    await t.test('revision-checked administration revokes live sessions and audit stores no credentials',async()=>{
      await assert.rejects(updateStaffAccount(db,owner,staffId,{expectedRevision:9,active:true,grants:[]}),{code:'STAFF_STALE'});
      await updateStaffAccount(db,owner,staffId,{expectedRevision:1,active:false,grants:input.grants});assert.equal((await request('/api/backoffice-staff/me',{token})).status,401);
      const audit=await db.$queryRaw`SELECT "event","detail" FROM "BackofficeStaffAudit" WHERE "companyId"='a' ORDER BY "createdAt"`;
      assert.deepEqual(audit.map(a=>a.event),['CREATED','UPDATED']);for(const secret of [input.pin,input.password,saved.pinHash,saved.passwordHash])assert.ok(!JSON.stringify(audit).includes(secret));
    });
    await t.test('native columns/FKs match reviewed catalogue; scoped reset retains grants and shared security metadata',async()=>{
      const manifest=reviewedFreshStoreManifest();
      const columns=await db.$queryRaw`SELECT c.relname AS "table",a.attname AS name,format_type(a.atttypid,a.atttypmod) AS type,a.attnotnull AS "notNull" FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=${schema} AND c.relname LIKE 'BackofficeStaff%' AND a.attnum>0 AND NOT a.attisdropped ORDER BY c.relname,a.attnum`;
      for(const name of ['BackofficeStaffAccount','BackofficeStaffGrant','BackofficeStaffAudit','BackofficeStaffLoginGuard'])assert.deepEqual(columns.filter(c=>c.table===name).map(c=>[c.name,c.type,c.notNull]),manifest.knownColumns[name]);
      await assert.rejects(db.$executeRaw`INSERT INTO "BackofficeStaffGrant" ("userId","companyId","storeId","profile","capabilities") VALUES (${staffId},'b','b1','AUDITOR','["cash.read"]'::jsonb)`);
      const before=await db.$queryRaw`SELECT "userId","companyId","storeId","active","revision" FROM "BackofficeStaffGrant" ORDER BY "userId","storeId"`;
      for(const mode of ['RESET','DELETE']){
        const preview=await lifecyclePreview(db,{id:'isolated-platform',isSuperAdmin:true},{companyId:'a',storeId:'a1'},mode);
        const row=preview.inventory.find(r=>r.table==='BackofficeStaffGrant');assert.equal(row.count,1);assert.equal(row.action,mode==='RESET'?'KEEP':'REMOVE');assert.equal(preview.executionAvailable,false);
        for(const name of ['BackofficeStaffAccount','BackofficeStaffAudit','BackofficeStaffLoginGuard'])assert.equal(preview.inventory.some(r=>r.table===name),false);
      }
      assert.deepEqual(await db.$queryRaw`SELECT "userId","companyId","storeId","active","revision" FROM "BackofficeStaffGrant" ORDER BY "userId","storeId"`,before);
    });
    await t.test('unknown username attempts persist and block without creating accounts or sessions',async()=>{
      for(let i=0;i<5;i++)assert.equal((await verifyStaffLogin(db,{username:'absent.fixture',pin:'999999'},'fixture-ip',process.env.JWT_SECRET)).ok,false);
      assert.equal((await verifyStaffLogin(db,{username:'absent.fixture',pin:'999999'},'other-ip',process.env.JWT_SECRET)).limited,true);
      assert.equal(Number((await db.$queryRaw`SELECT COUNT(*) AS n FROM "BackofficeStaffAccount"`)[0].n),1);
    });
  }finally{
    if(server)await new Promise(resolve=>{server.close(resolve);server.closeIdleConnections()});await db.$disconnect();await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await admin.$disconnect();if(oldSecret===undefined)delete process.env.JWT_SECRET;else process.env.JWT_SECRET=oldSecret;
  }
});
