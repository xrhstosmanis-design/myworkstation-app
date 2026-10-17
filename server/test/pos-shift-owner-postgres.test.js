import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import crypto from 'node:crypto';
import {createServer} from 'node:http';
import {z} from 'zod';
import {assertPosShiftOwner} from '../src/lib/pos-shift-owner.js';
const isolated=()=>{try{const u=new URL(process.env.DATABASE_URL);return process.env.NODE_ENV==='test'&&['localhost','127.0.0.1','postgres'].includes(u.hostname)&&/test/i.test(u.pathname)}catch{return false}};
test('native actual PIN/card handlers and auth deny another open-shift owner, preserving resume/logout and independent terminals', {skip:!isolated()},async()=>{
 const {PrismaClient}=await import('@prisma/client'),admin=new PrismaClient(),schema='shift_owner_'+crypto.randomUUID().replaceAll('-',''),url=new URL(process.env.DATABASE_URL);url.searchParams.set('schema',schema);const db=new PrismaClient({datasourceUrl:url.toString()});
 const sql=async text=>{for(const statement of text.split(';').map(s=>s.trim()).filter(Boolean))await db.$executeRawUnsafe(statement)};
 let server;
 try{
  await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
  const defs={Company:'"id" text PRIMARY KEY,"name" text,"active" boolean DEFAULT true',Store:'"id" text PRIMARY KEY,"companyId" text,"name" text,"active" boolean DEFAULT true',Employee:'"id" text PRIMARY KEY,"active" boolean DEFAULT true',StoreOperatorCredential:'"id" text PRIMARY KEY,"employeeId" text,"companyId" text,"storeId" text,"displayName" text,"role" text,"active" boolean DEFAULT true,"pinHash" text,"cardCodeHash" text,"cardCodeLast4" text,"lastLoginAt" timestamptz',StoreOperatorProfile:'"companyId" text,"storeId" text,"employeeId" text,"terminalPos" text,"posAccess" boolean DEFAULT true,"permissions" jsonb DEFAULT \'{}\'',StoreOperatorSession:'"id" text PRIMARY KEY,"operatorId" text,"companyId" text,"storeId" text,"terminalPos" text,"expiresAt" timestamptz,"revokedAt" timestamptz,"lastSeenAt" timestamptz DEFAULT now(),"userAgent" text,"ipAddress" text',CashShiftSession:'"id" text PRIMARY KEY,"companyId" text,"storeId" text,"terminalPos" text,"status" text,"openedBy" text,"openedAt" timestamptz DEFAULT now()'};
  for(const[t,d]of Object.entries(defs))await db.$executeRawUnsafe(`CREATE TABLE "${t}" (${d})`);
  await sql(`INSERT INTO "Company" VALUES('c','Fixture',true),('foreign','Foreign',true); INSERT INTO "Store" VALUES('ss','c','Fixture',true),('control','c','Control',true); INSERT INTO "Employee" VALUES('ea',true),('eb',true); INSERT INTO "StoreOperatorCredential"("id","employeeId","companyId","storeId","displayName","role","pinHash","cardCodeHash") VALUES('a','ea','c','ss','Fixture A','EMPLOYEE','hash','card-a'),('b','eb','c','ss','Fixture B','MANAGER','hash','card-b'); INSERT INTO "StoreOperatorProfile"("companyId","storeId","employeeId","terminalPos") VALUES('c','ss','ea','MAIN'),('c','ss','eb',' main '); INSERT INTO "CashShiftSession" VALUES('active','c','ss','MAIN','OPEN','a',now()),('closed','c','ss','MAIN','CLOSED','b',now()),('control','c','control','MAIN','OPEN','b',now()),('foreign','foreign','ss','MAIN','OPEN','b',now())`);
  const src=await readFile(new URL('../src/routes/store-operators.js',import.meta.url),'utf8'),fns=src.slice(src.indexOf('async function createOperatorSession('),src.indexOf('function operatorPermissions('));
  const funcs=new Function('prisma','crypto','assertPosShiftOwner',fns+'return {createOperatorSession,assertOperatorTerminalAvailable};')(db,crypto,assertPosShiftOwner),audit=[];
  const deps={z,prisma:db,activeStore:async()=>{},loginSubject:()=>'',assertLoginAllowed:async()=>{},recordLoginFailure:async()=>{},clearLoginFailures:async()=>{},bcrypt:{compare:async()=>true},resolveLoginTerminal:async(_s,_t,terminalPos)=>({terminalPos}),...funcs,audit:async value=>audit.push(value),operatorToken:()=> 'fixture-token',operatorPermissions:()=>[],normalizeCard:v=>v,cardHash:v=>v};
  const handlers={};for(const method of ['pin','card']){const marker=`router.post("/login/${method}",route(async(req,res)=>{`,start=src.indexOf(marker)+marker.length,end=src.indexOf('\n}));',start);assert.ok(start>marker.length);handlers[method]=new Function(...Object.keys(deps),'return async(req,res)=>{'+src.slice(start,end)+'}')( ...Object.values(deps));}
  const logoutMarker='router.post("/logout",auth,route(async(req,res)=>{',logoutStart=src.indexOf(logoutMarker)+logoutMarker.length,logoutEnd=src.indexOf('\n}));',logoutStart),logout=new Function(...Object.keys(deps),'return async(req,res)=>{'+src.slice(logoutStart,logoutEnd)+'}')( ...Object.values(deps));
  const authSrc=(await readFile(new URL('../src/middleware/auth.js',import.meta.url),'utf8')).replace(/^import .*;\n/gm,'').replace('export async function auth','async function auth');
  const payload={id:'b',operatorId:'b',employeeId:'eb',companyId:'c',storeId:'ss',role:'MANAGER',tokenType:'STORE_OPERATOR',operatorSessionId:'old',terminalPos:'MAIN'};
  await db.$executeRawUnsafe(`INSERT INTO "StoreOperatorSession"("id","operatorId","companyId","storeId","terminalPos","expiresAt") VALUES('old','b','c','ss','MAIN',now()+interval '1 hour')`);
  const auth=new Function('prisma','jwt','crypto','assertCustomerDemoRuntimeClosed','authorizeChatOperator',authSrc+'return auth;')(db,{verify:()=>payload},crypto,()=>{},()=>{});
  server=createServer(async(req,res)=>{let text='';for await(const chunk of req)text+=chunk;const request={headers:req.headers,originalUrl:req.url,method:req.method,body:text?JSON.parse(text):{},ip:'127.0.0.1'},response={status(n){res.statusCode=n;return this},json(v){res.setHeader('Content-Type','application/json');res.end(JSON.stringify(v))},set(){return this}};try{if(req.url.startsWith('/login/'))await handlers[req.url.split('/').at(-1)](request,response);else await auth(request,response,()=>req.url==='/api/operators/logout'?logout(request,response):response.json({ok:true}));}catch(e){response.status(e.status||500).json({code:e.code,error:e.message})}});await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
  const login=async(method,operator)=>{const r=await fetch(base+'/login/'+method,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(method==='pin'?{storeId:'ss',employeeId:operator==='a'?'ea':'eb',pin:'1234'}:{storeId:'ss',cardCode:'card-'+operator})});return {status:r.status,body:await r.json()}};
  const snapshot=()=>db.$queryRawUnsafe('SELECT * FROM "CashShiftSession" ORDER BY "id"'),before=await snapshot();
  for(const method of ['pin','card']){const denied=await login(method,'b'),owner=await login(method,'a');assert.equal(denied.status,409,JSON.stringify(denied));assert.equal(owner.status,200,JSON.stringify(owner))}
  assert.equal((await db.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "StoreOperatorSession" WHERE "operatorId"='b'`))[0].n,1,'denied login creates no new session');assert.equal(audit.length,2,'only successful owner logins audited');
  const runtime=await fetch(base+'/api/cash/stores/ss/shift-status',{headers:{authorization:'Bearer fixture'}});assert.equal(runtime.status,401);assert.equal((await runtime.json()).code,'POS_SHIFT_OTHER_OPERATOR');
  assert.equal((await fetch(base+'/api/operators/logout',{method:'POST',headers:{authorization:'Bearer fixture'}})).status,200,'auth still permits logout without shift takeover');assert.deepEqual(await snapshot(),before);assert.ok((await db.$queryRawUnsafe(`SELECT \"revokedAt\" FROM \"StoreOperatorSession\" WHERE \"id\"='old'`))[0].revokedAt);
  payload.operatorId=payload.id='a';payload.employeeId='ea';payload.role='EMPLOYEE';payload.operatorSessionId=(await db.$queryRawUnsafe(`SELECT "id" FROM "StoreOperatorSession" WHERE "operatorId"='a' AND "revokedAt" IS NULL LIMIT 1`))[0].id;assert.equal((await fetch(base+'/api/cash/stores/ss/shift-status',{headers:{authorization:'Bearer fixture'}})).status,200);
  await sql(`UPDATE "StoreOperatorProfile" SET "terminalPos"='SECOND' WHERE "employeeId"='eb'; DELETE FROM "StoreOperatorSession" WHERE "operatorId"='b'`);
  for(const method of ['pin','card'])assert.equal((await login(method,'b')).status,200,'independent second terminal remains available');
  await assert.rejects(()=>assertPosShiftOwner(db,{companyId:'c',storeId:'ss',operatorId:'b',terminalPos:null}),e=>e.code==='POS_SHIFT_OTHER_OPERATOR');await assertPosShiftOwner(db,{companyId:'c',storeId:'control',operatorId:'b',terminalPos:'MAIN'});
  // Before shift opening: two different operators racing for one terminal have exactly one winner.
  await sql(`DELETE FROM "CashShiftSession" WHERE "id"='active'; UPDATE "StoreOperatorSession" SET "revokedAt"=now(); UPDATE "StoreOperatorProfile" SET "terminalPos"='MAIN' WHERE "storeId"='ss'`);
  const noShiftBefore=await snapshot(),race=await Promise.all([login('pin','a'),login('card','b')]);
  assert.deepEqual(race.map(r=>r.status).sort(),[200,409]);
  assert.equal(race.find(r=>r.status===409).body.code,'POS_TERMINAL_OCCUPIED');
  let live=await db.$queryRawUnsafe(`SELECT * FROM "StoreOperatorSession" WHERE "revokedAt" IS NULL`);assert.equal(live.length,1);
  const winner=live[0].operatorId,loser=winner==='a'?'b':'a',winnerEmployee=winner==='a'?'ea':'eb';
  // A historically duplicated same-terminal login is retired on authenticated resume.
  await db.$executeRawUnsafe(`INSERT INTO "StoreOperatorSession"("id","operatorId","companyId","storeId","terminalPos","expiresAt") VALUES('duplicate',$1,'c','ss','MAIN',now()+interval '1 hour')`,winner);
  const oldId=live[0].id;assert.equal((await login('pin',winner)).status,200);
  live=await db.$queryRawUnsafe(`SELECT * FROM "StoreOperatorSession" WHERE "revokedAt" IS NULL`);assert.equal(live.length,1);assert.notEqual(live[0].id,oldId);
  // Same operator is still refused at another terminal until explicit logout.
  await db.$executeRawUnsafe(`UPDATE "StoreOperatorProfile" SET "terminalPos"='SECOND' WHERE "employeeId"=$1`,winnerEmployee);
  assert.equal((await login('card',winner)).status,409);
  await db.$executeRawUnsafe(`UPDATE "StoreOperatorProfile" SET "terminalPos"='MAIN' WHERE "employeeId"=$1`,winnerEmployee);
  // A late old-tab logout cannot revoke the new session.
  const logoutRequest=id=>({user:{tokenType:'STORE_OPERATOR',operatorSessionId:id,operatorId:winner,companyId:'c',storeId:'ss'}}),reply={json(){},status(){return this}};
  await logout(logoutRequest(oldId),reply);assert.equal((await login('pin',loser)).status,409);
  await logout(logoutRequest(live[0].id),reply);assert.equal((await login('pin',loser)).status,200);
  await db.$executeRawUnsafe(`UPDATE "StoreOperatorProfile" SET "terminalPos"='SECOND' WHERE "employeeId"=$1`,winnerEmployee);
  assert.equal((await login('pin',winner)).status,200,'other terminal remains independent');
  assert.deepEqual(await snapshot(),noShiftBefore,'session changes never open or modify a shift');

 }finally{if(server)await new Promise(r=>server.close(r));await db.$disconnect();await admin.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);await admin.$disconnect()}
});
