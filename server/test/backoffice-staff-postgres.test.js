import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import {readFile} from 'node:fs/promises';
import express from 'express';
import jwt from 'jsonwebtoken';
import {z} from 'zod';
import {PrismaClient} from '@prisma/client';
import {ensureBackofficeStaffSchema} from '../src/backoffice-staff-bootstrap.js';
import {enforceBackofficeStaff,requireStaffGrant,requireStaffAction,requireStaffOrderAction} from '../src/services/backoffice-staff-access.js';
import {createStaffAccount,updateStaffAccount,verifyStaffLogin} from '../src/services/backoffice-staff-accounts.js';
import {createBackofficeStaffRouter} from '../src/routes/backoffice-staff.js';
import {issueSession} from '../src/routes/auth.js';
import {assertCustomerDemoRuntimeClosed} from '../src/customer-demo-runtime.js';
import {finalizeInventoryStocktake} from '../src/lib/inventory-stocktake-finalize.js';
import {lockDraftInventoryStocktake} from '../src/lib/inventory-stocktake-draft.js';
import {inventoryStocktakeScopeAllowed,inventoryStoreScopeAllowed} from '../src/lib/inventory-stocktake-scope.js';
import {reviewedFreshStoreManifest} from '../src/services/store-lifecycle-manifest.js';
import {lifecyclePreview} from '../src/services/store-lifecycle-preview.js';
import {lifecycleStateHandler} from '../src/routes/store-lifecycle-state.js';
const isolated=()=>{try{const u=new URL(process.env.DATABASE_URL);return process.env.NODE_ENV==='test'&&['localhost','127.0.0.1','postgres'].includes(u.hostname)&&u.pathname==='/myworkstation_test'}catch{return false}};
test('native personal BackOffice identities, hashed PIN, scoped HTTP count, revocation and immutable audit',{skip:!isolated(),timeout:90000},async t=>{
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
    await db.$executeRaw`INSERT INTO "CompanyModule" ("id","companyId","moduleKey") SELECT 'a-'||key,'a',key FROM unnest(ARRAY['CORE','INVENTORY','CASH_CONTROL','STORE_CHAT','AI_READER','STORE_MODE','DOCUMENTS']) AS key`;
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
    const inventorySource=(await readFile(new URL('../src/routes/inventory-v2.js',import.meta.url),'utf8')).replace(/^import[\s\S]*?;\n/gm,'').replace(/^export .*;\n/gm,'');
    let beforeCount;
    const countGrant=async(...args)=>{if(beforeCount){const wait=beforeCount;beforeCount=null;await wait()}return requireStaffGrant(...args)};
    const inventory=new Function('Router','z','crypto','prisma','jwt','assertCustomerDemoRuntimeClosed','finalizeInventoryStocktake','lockDraftInventoryStocktake','inventoryStocktakeScopeAllowed','inventoryStoreScopeAllowed','requireStaffGrant',inventorySource+'\nreturn router;')(express.Router,z,crypto,db,jwt,assertCustomerDemoRuntimeClosed,finalizeInventoryStocktake,lockDraftInventoryStocktake,inventoryStocktakeScopeAllowed,inventoryStoreScopeAllowed,countGrant);
    const reportReads=[],repository={generation:async()=>'0',read:async(scope,period)=>{reportReads.push({...scope,period});return {...scope,period,text:'Isolated read-only report',rows:[]}}};
    const commerceSource=await readFile(new URL('../src/routes/commerce-v1.js',import.meta.url),'utf8');
    const fileStart=commerceSource.indexOf('router.get("/documents/inbox/:inboxId/file",');
    const fileEnd=commerceSource.indexOf('\nrouter.get("/ai-reader/status",',fileStart);
    assert.ok(fileStart>=0&&fileEnd>fileStart);let fileHandlers;
    new Function('router','requireCompanyModule','prisma','requireStaffGrant',commerceSource.slice(fileStart,fileEnd))({get:(_path,...handlers)=>{fileHandlers=handlers}},()=> (_req,_res,next)=>next(),db,requireStaffGrant);
    const app=express();app.use(express.json());app.use('/api/backoffice-staff',createBackofficeStaffRouter({db,authenticate:auth,issueSession,repository}));app.use('/api/inventory-v2',auth,inventory);app.get('/api/lifecycle/stores/:storeId',auth,lifecycleStateHandler(db));app.get('/api/platform/companies',auth,(_req,res)=>res.json({leak:true}));app.get(['/api/transactions/stores/:storeId/overview','/api/cash/stores/:storeId/overview','/api/store-pos/stores/:storeId/sales/recent'],auth,(req,res)=>res.json({storeId:req.user.storeId,capability:req.staffGrant.capability}));app.post('/api/transactions/stores/:storeId',auth,(_req,res)=>res.json({leak:true}));app.get('/api/commerce/documents/inbox/:inboxId/file',auth,...fileHandlers);app.use((e,_req,res,_next)=>res.status(e.status||500).json({code:e.code,error:e.message}));
    server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s))});
    const request=async(path,{token,method='GET',body,storeId}={})=>{
      const r=await fetch(`http://127.0.0.1:${server.address().port}${path}`,{method,signal:AbortSignal.timeout(15000),headers:{'content-type':'application/json',...(token?{authorization:'Bearer '+token}:{}),...(storeId?{'x-backoffice-store-id':storeId}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,data:await r.json(),headers:r.headers};
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
      await Promise.race([entered,pending.then(result=>{throw Error("Count did not reach the transaction admission hook: "+JSON.stringify(result))})]);
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
    await t.test('native auditor HTTP admits only own read projection and manager label cannot restore unchecked actions',async()=>{
      for(const [profile,capabilities] of [['AUDITOR',['cash.read']],['MANAGER',['inventory.read']]]){
        const username=profile.toLowerCase()+'.fixture';
        await createStaffAccount(db,owner,{...input,username,fullName:profile,grants:[{storeId:'a1',profile,capabilities}]});
        const login=await request('/api/backoffice-staff/login',{method:'POST',body:{username,pin:input.pin}});assert.equal(login.status,200);const roleToken=login.data.token;
        assert.equal(jwt.verify(roleToken,process.env.JWT_SECRET).role,'EMPLOYEE');
        const cash=await request('/api/backoffice-staff/cash/stores/a1?from=2026-10-29&to=2026-10-29',{token:roleToken,storeId:'a1'});assert.equal(cash.status,profile==='AUDITOR'?200:403);
        if(profile==='AUDITOR'){assert.equal(cash.data.text,'Isolated read-only report');assert.deepEqual(reportReads.at(-1),{companyId:'a',storeId:'a1',generation:'0',period:{from:'2026-10-29',to:'2026-10-29'}})}
        assert.equal((await request('/api/inventory-v2/stocktakes/sta/count',{token:roleToken,storeId:'a1',method:'POST',body:count})).status,403);
        assert.equal((await request('/api/backoffice-staff/admin',{token:roleToken})).status,403);
      }
    });
    await t.test('PIN-only four-digit accounts keep independent password hashes, scoped sessions and durable lockout',async()=>{
      const {password,...original}=input;
      const short={...original,username:'pin.only.fixture',pin:'0483'};
      const first=await createStaffAccount(db,owner,short);
      const second=await createStaffAccount(db,owner,{...short,username:'pin.other.fixture'});
      const hashes=await db.$queryRaw`SELECT u."id",u."passwordHash",a."pinHash" FROM "User" u JOIN "BackofficeStaffAccount" a ON a."userId"=u."id" WHERE u."id" IN (${first.id},${second.id})`;
      assert.equal(hashes.length,2);assert.notEqual(hashes[0].passwordHash,hashes[1].passwordHash);
      for(const row of hashes){assert.equal(await bcrypt.compare(short.pin,row.pinHash),true);assert.equal(await bcrypt.compare(short.pin,row.passwordHash),false);assert.notEqual(row.pinHash,row.passwordHash)}
      const passwordFallback=await request('/api/backoffice-staff/login',{method:'POST',body:{username:short.username,password:short.pin}});assert.equal(passwordFallback.status,401);
      const login=await request('/api/backoffice-staff/login',{method:'POST',body:{username:short.username,pin:short.pin}});assert.equal(login.status,200);assert.equal(jwt.verify(login.data.token,process.env.JWT_SECRET).staffAccess,true);
      const me=await request('/api/backoffice-staff/me',{token:login.data.token});assert.equal(me.status,200);assert.deepEqual(me.data.stores.map(s=>s.id),['a1']);
      assert.equal((await request('/api/backoffice-staff/admin',{token:login.data.token})).status,403);
      assert.equal((await request('/api/backoffice-staff/inventory/stores/a2/stocktakes',{token:login.data.token,storeId:'a2'})).status,403);
      const audit=(await db.$queryRaw`SELECT "detail" FROM "BackofficeStaffAudit" WHERE "targetUserId"=${first.id}`)[0];
      assert.deepEqual(audit.detail,{username:short.username,fullName:short.fullName,active:true,grants:short.grants});
      for(let i=0;i<5;i++)assert.equal((await verifyStaffLogin(db,{username:short.username,pin:'9999'},'short-fixture-ip',process.env.JWT_SECRET)).ok,false);
      assert.equal((await verifyStaffLogin(db,{username:short.username,pin:short.pin},'different-fixture-ip',process.env.JWT_SECRET)).limited,true);
      const optional='isolated-optional-password';
      await updateStaffAccount(db,owner,second.id,{expectedRevision:1,active:true,grants:short.grants,password:optional});
      for(const credential of [{pin:short.pin},{password:optional}]){const r=await request('/api/backoffice-staff/login',{method:'POST',body:{username:'pin.other.fixture',...credential}});assert.equal(r.status,200);assert.equal(r.data.user.staffAccess,true)}
      assert.equal(Number((await db.$queryRaw`SELECT "amount" FROM "Sale"`)[0].amount),77.33);assert.equal(Number((await db.$queryRaw`SELECT "quantity" FROM "StockMovement"`)[0].quantity),42);
    });
    await t.test('owner-defined cross-profile rights execute only explicit operations and revoke the existing session on edit',async()=>{
      const username='custom.rights.fixture';
      const grants=[{storeId:'a1',profile:'STOCKTAKER',capabilities:['inventory.read','cash.read']}];
      const created=await createStaffAccount(db,owner,{...input,username,grants});
      const login=await request('/api/backoffice-staff/login',{method:'POST',body:{username,pin:input.pin}});
      assert.equal(login.status,200);const customToken=login.data.token;
      assert.equal(jwt.verify(customToken,process.env.JWT_SECRET).role,'EMPLOYEE');
      assert.equal((await request('/api/backoffice-staff/cash/stores/a1?from=2026-10-29&to=2026-10-29',{token:customToken,storeId:'a1'})).status,200);
      assert.equal((await request('/api/backoffice-staff/inventory/stores/a1/stocktakes',{token:customToken,storeId:'a1'})).status,200);
      assert.equal((await request('/api/inventory-v2/stocktakes/sta/count',{token:customToken,storeId:'a1',method:'POST',body:count})).status,403);
      assert.equal((await request('/api/backoffice-staff/cash/stores/a2?from=2026-10-29&to=2026-10-29',{token:customToken,storeId:'a2'})).status,403);
      assert.equal((await request('/api/backoffice-staff/admin',{token:customToken})).status,403);
      await db.$executeRaw`UPDATE "CompanyModule" SET "active"=false WHERE "companyId"='a' AND "moduleKey"='INVENTORY'`;
      assert.equal((await request('/api/lifecycle/stores/a1',{token:customToken})).status,200);
      await db.$executeRaw`UPDATE "CompanyModule" SET "active"=true WHERE "companyId"='a' AND "moduleKey"='INVENTORY'`;
      await updateStaffAccount(db,owner,created.id,{expectedRevision:1,active:true,grants:[{storeId:'a1',profile:'MANAGER',capabilities:[]}]});
      assert.equal((await request('/api/backoffice-staff/me',{token:customToken})).status,401);
      const next=await request('/api/backoffice-staff/login',{method:'POST',body:{username,pin:input.pin}});assert.equal(next.status,200);
      assert.equal((await request('/api/backoffice-staff/cash/stores/a1?from=2026-10-29&to=2026-10-29',{token:next.data.token,storeId:'a1'})).status,403);
      assert.equal((await request('/api/backoffice-staff/inventory/stores/a1/stocktakes',{token:next.data.token,storeId:'a1'})).status,403);
      assert.equal(Number((await db.$queryRaw`SELECT "amount" FROM "Sale"`)[0].amount),77.33);
      assert.equal(Number((await db.$queryRaw`SELECT "quantity" FROM "StockMovement"`)[0].quantity),42);
    });
    await t.test('native sales read admission keeps exact selected store, module licence, explicit zero-write scope and live withdrawal',async()=>{
      const username='sales.read.fixture',grants=[{storeId:'a1',profile:'AUDITOR',capabilities:['sales.read']}];
      const created=await createStaffAccount(db,owner,{...input,username,grants});
      const login=await request('/api/backoffice-staff/login',{method:'POST',body:{username,pin:input.pin}});assert.equal(login.status,200);const salesToken=login.data.token;
      for(const path of ['/api/transactions/stores/a1/overview','/api/cash/stores/a1/overview','/api/store-pos/stores/a1/sales/recent']){
        const r=await request(path,{token:salesToken,storeId:'a1'});assert.equal(r.status,200);assert.deepEqual(r.data,{storeId:'a1',capability:'sales.read'});
        assert.equal((await request(path.replace('/a1/','/a2/'),{token:salesToken,storeId:'a1'})).status,403);
      }
      assert.equal((await request('/api/transactions/stores/a1',{token:salesToken,storeId:'a1',method:'POST',body:{storeId:'a1',amount:1}})).status,403);
      await db.$executeRaw`UPDATE "CompanyModule" SET "active"=false WHERE "companyId"='a' AND "moduleKey"='STORE_MODE'`;
      assert.equal((await request('/api/transactions/stores/a1/overview',{token:salesToken,storeId:'a1'})).status,403);
      await db.$executeRaw`UPDATE "CompanyModule" SET "active"=true WHERE "companyId"='a' AND "moduleKey"='STORE_MODE'`;
      await updateStaffAccount(db,owner,created.id,{expectedRevision:1,active:false,grants});
      assert.equal((await request('/api/transactions/stores/a1/overview',{token:salesToken,storeId:'a1'})).status,401);
      assert.equal(Number((await db.$queryRaw`SELECT "amount" FROM "Sale"`)[0].amount),77.33);assert.equal(Number((await db.$queryRaw`SELECT "quantity" FROM "StockMovement"`)[0].quantity),42);
    });
    await t.test('native original invoice file stays inside both inbox and attachment store with live read grant',async()=>{
      await db.$executeRawUnsafe('CREATE TABLE "DocumentInbox" ("id" text PRIMARY KEY,"companyId" text,"storeId" text,"attachmentId" text)');
      await db.$executeRawUnsafe('CREATE TABLE "DocumentAttachment" ("id" text PRIMARY KEY,"companyId" text,"storeId" text,"contentData" text,"filename" text,"mimeType" text)');
      await db.$executeRaw`INSERT INTO "DocumentAttachment" VALUES ('file-a','a','a1','data:application/pdf;base64,JVBERi0=','Synthetic.pdf','application/pdf'),('file-a2','a','a2','PRIVATE-CONTROL','Control.pdf','application/pdf')`;
      await db.$executeRaw`INSERT INTO "DocumentInbox" VALUES ('invoice-a','a','a1','file-a'),('invoice-a2','a','a2','file-a2'),('mismatch','a','a1','file-a2')`;
      const username='invoices.read.fixture',grants=[{storeId:'a1',profile:'AUDITOR',capabilities:['invoices.read']}];
      const created=await createStaffAccount(db,owner,{...input,username,grants});
      const login=await request('/api/backoffice-staff/login',{method:'POST',body:{username,pin:input.pin}});assert.equal(login.status,200);const invoiceToken=login.data.token;
      const original=await request('/api/commerce/documents/inbox/invoice-a/file',{token:invoiceToken,storeId:'a1'});
      assert.equal(original.status,200);assert.equal(original.data.filename,'Synthetic.pdf');assert.match(original.headers.get('cache-control'),/no-store/);
      for(const id of ['invoice-a2','mismatch']){const r=await request('/api/commerce/documents/inbox/'+id+'/file',{token:invoiceToken,storeId:'a1'});assert.equal(r.status,404);assert.ok(!JSON.stringify(r.data).includes('PRIVATE-CONTROL'))}
      assert.equal((await request('/api/commerce/documents/inbox/invoice-a/file',{token:invoiceToken,storeId:'a2'})).status,403);
      await db.$executeRaw`UPDATE "CompanyModule" SET "active"=false WHERE "companyId"='a' AND "moduleKey"='DOCUMENTS'`;
      assert.equal((await request('/api/commerce/documents/inbox/invoice-a/file',{token:invoiceToken,storeId:'a1'})).status,403);
      await db.$executeRaw`UPDATE "CompanyModule" SET "active"=true WHERE "companyId"='a' AND "moduleKey"='DOCUMENTS'`;
      await updateStaffAccount(db,owner,created.id,{expectedRevision:1,active:false,grants});
      assert.equal((await request('/api/commerce/documents/inbox/invoice-a/file',{token:invoiceToken,storeId:'a1'})).status,401);
      assert.equal(Number((await db.$queryRaw`SELECT "amount" FROM "Sale"`)[0].amount),77.33);assert.equal(Number((await db.$queryRaw`SELECT "quantity" FROM "StockMovement"`)[0].quantity),42);
    });
    await t.test('native separately delegated create/count/finalize replays creation and posts one audited adjustment',async()=>{
      for(const sql of [
        'ALTER TABLE "Product" ADD COLUMN "costPrice" numeric DEFAULT 0, ADD COLUMN "active" boolean DEFAULT true, ADD COLUMN "categoryId" text',
        'ALTER TABLE "Stocktake" ADD COLUMN "createdByUserId" text REFERENCES "User"("id"), ADD COLUMN "finalizedByUserId" text REFERENCES "User"("id"), ADD COLUMN "updatedAt" timestamptz DEFAULT now()',
        'CREATE TABLE "StoreProduct" ("storeId" text,"productId" text,"currentStock" numeric,"active" boolean DEFAULT true,"updatedAt" timestamptz DEFAULT now(),PRIMARY KEY("storeId","productId"))',
        'ALTER TABLE "StockMovement" ADD COLUMN "storeId" text, ADD COLUMN "productId" text, ADD COLUMN "movementType" text, ADD COLUMN "unitCost" numeric, ADD COLUMN "sourceType" text, ADD COLUMN "sourceId" text, ADD COLUMN "note" text, ADD COLUMN "createdByUserId" text REFERENCES "User"("id")'
      ])await db.$executeRawUnsafe(sql);
      await db.$executeRaw`INSERT INTO "StoreProduct" ("storeId","productId","currentStock") VALUES ('a1','pa',10),('a2','pa',42)`;
      const username='inventory.lifecycle.fixture',grants=[{storeId:'a1',profile:'AUDITOR',capabilities:['inventory.read','inventory.create','inventory.count']}];
      const created=await createStaffAccount(db,owner,{...input,username,grants});
      const login=async()=>{const r=await request('/api/backoffice-staff/login',{method:'POST',body:{username,pin:input.pin}});assert.equal(r.status,200);assert.equal(r.data.user.role,'EMPLOYEE');return r.data.token};
      let inventoryToken=await login();
      const send=(path,body,method='POST')=>request(path,{token:inventoryToken,storeId:'a1',method,body});
      const create={storeId:'a1',name:'Synthetic delegated inventory',scopeType:'FULL',recountPolicy:'NONE',clientEventId:crypto.randomUUID()};
      const first=await send('/api/inventory-v2/stocktakes',create);assert.equal(first.status,201,JSON.stringify(first.data));
      const stId=first.data.id;
      const replay=await send('/api/inventory-v2/stocktakes',create);assert.equal(replay.status,200);assert.equal(replay.data.id,stId);assert.equal(replay.data.replayed,true);
      assert.equal((await send('/api/inventory-v2/stocktakes',{...create,name:'Changed'})).status,409);
      const {clientEventId,...missingNonce}=create;assert.equal((await send('/api/inventory-v2/stocktakes',missingNonce)).status,400);
      assert.equal(Number((await db.$queryRaw`SELECT COUNT(*) AS n FROM "Stocktake" WHERE "createdByUserId"=${created.id}`)[0].n),1);
      const line=(await db.$queryRaw`SELECT "id","expectedQuantity" FROM "StocktakeLine" WHERE "stocktakeId"=${stId}`)[0];assert.equal(Number(line.expectedQuantity),10);
      const counted=await send('/api/inventory-v2/stocktakes/'+stId+'/count',{lineId:line.id,quantity:12,expectedVersion:0,clientEventId:crypto.randomUUID(),source:'BACKOFFICE'});assert.equal(counted.status,200,JSON.stringify(counted.data));
      const finalPath='/api/inventory-v2/stocktakes/'+stId+'/finalize';
      assert.equal((await send(finalPath,{reason:'Synthetic correction'})).status,403);
      assert.equal(Number((await db.$queryRaw`SELECT "currentStock" FROM "StoreProduct" WHERE "storeId"='a1'`)[0].currentStock),10);
      grants[0].capabilities.push('inventory.finalize');await updateStaffAccount(db,owner,created.id,{expectedRevision:1,active:true,grants});
      assert.equal((await send(finalPath,{reason:'Synthetic correction'})).status,401);inventoryToken=await login();
      const finalized=await send(finalPath,{reason:'Synthetic correction'});assert.equal(finalized.status,200,JSON.stringify(finalized.data));
      assert.equal((await send(finalPath,{reason:'Synthetic correction'})).status,409);
      const movements=await db.$queryRaw`SELECT "quantity","createdByUserId","note" FROM "StockMovement" WHERE "sourceId"=${stId}`;
      assert.equal(movements.length,1);assert.equal(Number(movements[0].quantity),2);assert.equal(movements[0].createdByUserId,created.id);assert.match(movements[0].note,/Synthetic correction/);
      const detail=await send('/api/backoffice-staff/inventory/stores/a1/stocktakes/'+stId,undefined,'GET');assert.equal(detail.status,200,JSON.stringify(detail.data));assert.equal(detail.data.status,'FINALIZED');assert.equal(Number(detail.data.lines[0].expectedQuantity),10);assert.equal(Number(detail.data.lines[0].countedQuantity),12);
      const stocks=await db.$queryRaw`SELECT "storeId","currentStock" FROM "StoreProduct" ORDER BY "storeId"`;assert.deepEqual(stocks.map(r=>[r.storeId,Number(r.currentStock)]),[['a1',12],['a2',42]]);
      assert.equal(Number((await db.$queryRaw`SELECT "amount" FROM "Sale" WHERE "id"='control'`)[0].amount),77.33);assert.equal(Number((await db.$queryRaw`SELECT "quantity" FROM "StockMovement" WHERE "id"='control'`)[0].quantity),42);
    });
    await t.test('native canonical delegated expense is pending, attributed, atomic and single-write; stale grant, cash and foreign store refuse',async()=>{
      for(const sql of [
        'CREATE TABLE "StoreTransaction" ("id" text PRIMARY KEY,"companyId" text,"storeId" text,"sessionId" text,"type" text,"amount" numeric,"description" text,"supplierId" text,"supplierName" text,"invoiceDocumentNumber" text,"invoicePaymentKey" text,"subtractFromShift" boolean,"paymentMethod" text,"actorId" text REFERENCES "User"("id"),"actorName" text,"attachmentData" text,"attachmentMimeType" text,"attachmentFilename" text,"attachmentChecksum" text,"occurredAt" timestamptz DEFAULT now(),"createdAt" timestamptz DEFAULT now(),"reversedAt" timestamptz)',
        'CREATE TABLE "OtherExpenseReview" ("id" text PRIMARY KEY,"companyId" text,"storeId" text,"transactionId" text UNIQUE,"status" text,"reviewedBy" text,"reviewedAt" timestamptz,"reviewNote" text)',
        'CREATE TABLE IF NOT EXISTS "StoreOperatorAudit" ("id" text PRIMARY KEY,"companyId" text,"storeId" text,"operatorId" text,"actorId" text,"eventType" text,"details" jsonb,"createdAt" timestamptz DEFAULT now())'
      ])await db.$executeRawUnsafe(sql);
      const grants=[{storeId:'a1',profile:'AUDITOR',capabilities:['sales.read','payments.read','payments.expense']}],username='actions.expense.fixture';
      const created=await createStaffAccount(db,owner,{...input,username,grants});
      const login=await request('/api/backoffice-staff/login',{method:'POST',body:{username,pin:input.pin}});assert.equal(login.status,200);
      const principal={...jwt.verify(login.data.token,process.env.JWT_SECRET),storeId:'a1'};
      const source=await readFile(new URL('../src/routes/store-transactions.js',import.meta.url),'utf8');
      const schema=source.slice(source.indexOf('const transactionSchema='),source.indexOf('const supplierSettlementSchema='));
      const start=source.indexOf('router.post("/stores/:storeId",'),end=source.indexOf('\nrouter.get("/:transactionId/attachment",',start);assert.ok(start>0&&end>start);
      let handler,beforeWriter;
      const runtime={$transaction:async callback=>{if(beforeWriter){const change=beforeWriter;beforeWriter=null;await change()}return db.$transaction(callback)}};
      const bindings={router:{post:(_path,h)=>handler=h},route:h=>h,z,prisma:runtime,crypto,
        assertStoreAccess:(req,id)=>{assert.equal(req.user.storeId,id)},ownedStore:async id=>({id}),requestTerminal:async()=> 'POS2',parseAttachment:()=>null,
        paymentId:(company,store,key)=>'pay_'+crypto.createHash('sha256').update(`${company}:${store}:${key}`).digest('hex'),invoicePaymentReference:()=>'',
        requireStaffAction,expenseReviewStatus:()=> 'PENDING_REVIEW',normalize:row=>({...row,amount:Number(row.amount)}),
        virtualBankAccount:()=>assert.fail('employee reimbursement must not create a bank ledger'),notifyLedgerAlert:()=>assert.fail('expense must not send a notification')};
      new Function(...Object.keys(bindings),schema+source.slice(start,end))(...Object.values(bindings));
      const body={type:'OTHER_EXPENSE',amount:2.15,description:'Synthetic delegated expense',evidenceMode:'NO_DOCUMENT',responsibilityAcknowledged:true,paymentSource:'EXTERNAL',paymentMethod:'EMPLOYEE_REIMBURSEMENT',idempotencyKey:'native-fixed-expense'};
      const invoke=async overrides=>{const req={user:principal,staffGrant:{capability:'payments.expense'},params:{storeId:'a1'},body:{...body,...overrides},get:()=> 'POS2'},out={status:200};const res={status(value){out.status=value;return this},json(value){out.body=value;return this}};try{await handler(req,res)}catch(error){out.status=error.status||(['23505','P2010'].includes(error.code)?409:500);out.body={code:error.code,error:error.message}}return out};
      const controls=async()=>JSON.stringify({sale:await db.$queryRaw`SELECT * FROM "Sale" ORDER BY "id"`,stock:await db.$queryRaw`SELECT * FROM "StoreProduct" ORDER BY "storeId","productId"`,movement:await db.$queryRaw`SELECT * FROM "StockMovement" ORDER BY "id"`});
      const before=await controls();const first=await invoke();assert.equal(first.status,201,JSON.stringify(first));assert.equal(first.body.amount,2.15);assert.equal(first.body.actorId,created.id);assert.equal(first.body.sessionId,null);
      const review=(await db.$queryRaw`SELECT * FROM "OtherExpenseReview"`)[0];assert.equal(review.status,'PENDING_REVIEW');assert.equal(review.reviewedBy,null);
      const audit=(await db.$queryRaw`SELECT * FROM "StoreOperatorAudit" WHERE "eventType"='BACKOFFICE_STAFF_EXPENSE_RECORDED'`)[0];assert.equal(audit.actorId,created.id);assert.equal(audit.details.responsibilityAcknowledged,true);
      assert.equal((await invoke()).status,409);assert.equal(Number((await db.$queryRaw`SELECT COUNT(*) AS count FROM "StoreTransaction"`)[0].count),1);
      assert.equal((await invoke({idempotencyKey:'no-declaration',responsibilityAcknowledged:false})).status,400);
      assert.equal((await invoke({idempotencyKey:'cash-not-granted',paymentSource:'CASH_SHIFT',paymentMethod:'CASH_SHIFT'})).status,403);
      await assert.rejects(db.$transaction(tx=>requireStaffAction(tx,{user:principal,staffGrant:{capability:'payments.expense'},body,get:()=> 'POS2'},'a2','payments.expense')),{status:403});
      beforeWriter=()=>updateStaffAccount(db,owner,created.id,{expectedRevision:1,active:false,grants});
      assert.equal((await invoke({idempotencyKey:'revoked-between-admission-and-write'})).status,401);
      assert.equal(Number((await db.$queryRaw`SELECT COUNT(*) AS count FROM "StoreTransaction"`)[0].count),1);assert.equal(Number((await db.$queryRaw`SELECT COUNT(*) AS count FROM "OtherExpenseReview"`)[0].count),1);assert.equal(await controls(),before);
    });
    await t.test('native delegated supplier settlement stays pending, requires its separate cash right and never duplicates a payment',async()=>{
      for(const sql of [
        'CREATE TABLE "Supplier" ("id" text PRIMARY KEY,"companyId" text,"name" text,"active" boolean DEFAULT true)',
        'CREATE TABLE "PurchaseDocument" ("id" text PRIMARY KEY,"companyId" text,"storeId" text,"supplierId" text,"documentNumber" text,"totalGross" numeric,"status" text,"settlementMode" text)',
        'CREATE TABLE "SupplierPaymentSettlement" ("id" text PRIMARY KEY,"companyId" text,"storeId" text,"transactionId" text,"supplierId" text,"status" text,"paymentMethod" text,"paidAt" timestamptz,"note" text,"createdBy" text REFERENCES "User"("id"),"createdByName" text)',
        'CREATE TABLE "SupplierPaymentAllocation" ("id" text PRIMARY KEY,"companyId" text,"settlementId" text,"purchaseDocumentId" text,"amount" numeric)'
      ])await db.$executeRawUnsafe(sql);
      await db.$executeRaw`INSERT INTO "Supplier" ("id","companyId","name") VALUES ('supplier-a','a','Synthetic'),('supplier-b','b','Foreign control')`;
      const username='actions.supplier.fixture',grants=[{storeId:'a1',profile:'AUDITOR',capabilities:['sales.read','payments.read','payments.supplier']}];
      const created=await createStaffAccount(db,owner,{...input,username,grants}),login=await request('/api/backoffice-staff/login',{method:'POST',body:{username,pin:input.pin}});assert.equal(login.status,200);
      const principal={...jwt.verify(login.data.token,process.env.JWT_SECRET),storeId:'a1'};
      const source=await readFile(new URL('../src/routes/store-transactions.js',import.meta.url),'utf8'),start=source.indexOf('router.post("/stores/:storeId/supplier-settlements",'),end=source.indexOf('\nfunction isSuperAdminReview',start);let handler;
      const schema=source.slice(source.indexOf('const supplierSettlementSchema='),source.indexOf('function parseAttachment('));
      const bindings={router:{post:(_path,h)=>handler=h},route:h=>h,z,crypto,prisma:db,requireStaffAction,
        assertStoreAccess:(req,id)=>assert.equal(req.user.storeId,id),ownedStore:async id=>({id}),requestTerminal:async()=> 'POS2',parseAttachment:()=>null,supplierProofMismatch:()=>null,
        paymentId:(company,store,key)=>'pay_'+crypto.createHash('sha256').update(`${company}:${store}:${key}`).digest('hex'),normalize:row=>({...row,amount:Number(row.amount)})};
      new Function(...Object.keys(bindings),schema+source.slice(start,end))(...Object.values(bindings));
      const body={supplierId:'supplier-a',paymentMethod:'EMPLOYEE_REIMBURSEMENT',totalAmount:2,advanceAcknowledged:true,paidAt:'2026-10-31T08:00:00Z',idempotencyKey:'native-fixed-supplier',evidenceMode:'NO_DOCUMENT',noDocumentAcknowledged:true,allocations:[]};
      const invoke=async changes=>{const req={user:principal,staffGrant:{capability:'payments.supplier'},params:{storeId:'a1'},body:{...body,...changes},get:()=> 'POS2'},out={status:200},res={status(value){out.status=value;return this},json(value){out.body=value;return this}};try{await handler(req,res)}catch(error){out.status=error.status||500;out.body={error:error.message}}return out};
      const before=Number((await db.$queryRaw`SELECT COUNT(*) AS count FROM "StoreTransaction"`)[0].count);
      assert.equal((await invoke({paymentMethod:'CASH_SHIFT'})).status,403);assert.equal((await invoke({supplierId:'supplier-b'})).status,404);
      const saved=await invoke();assert.equal(saved.status,201,JSON.stringify(saved));assert.equal(saved.body.status,'PENDING_REVIEW');assert.equal(saved.body.transaction.actorId,created.id);assert.equal(saved.body.advanceAmount,2);
      const settlement=(await db.$queryRaw`SELECT * FROM "SupplierPaymentSettlement"`)[0];assert.equal(settlement.status,'PENDING_REVIEW');assert.equal(settlement.createdBy,created.id);
      assert.equal((await invoke()).status,409);assert.equal(Number((await db.$queryRaw`SELECT COUNT(*) AS count FROM "StoreTransaction"`)[0].count),before+1);assert.equal(Number((await db.$queryRaw`SELECT COUNT(*) AS count FROM "SupplierPaymentSettlement"`)[0].count),1);
      assert.equal(Number((await db.$queryRaw`SELECT "amount" FROM "Sale" WHERE "id"='control'`)[0].amount),77.33);assert.equal(Number((await db.$queryRaw`SELECT "currentStock" FROM "StoreProduct" WHERE "storeId"='a2'`)[0].currentStock),42);
    });
  }finally{
    if(server)await new Promise(resolve=>{server.close(resolve);server.closeAllConnections()});await db.$disconnect();await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await admin.$disconnect();if(oldSecret===undefined)delete process.env.JWT_SECRET;else process.env.JWT_SECRET=oldSecret;
  }
});
