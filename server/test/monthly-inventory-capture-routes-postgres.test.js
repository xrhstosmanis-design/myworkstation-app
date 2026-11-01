import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {setTimeout as delay} from 'node:timers/promises';

const childKey='MWS_MONTHLY_CAPTURE_HTTP_TEST_CHILD',purpose='MONTHLY_INVENTORY_CAPTURE';
const q=value=>'"'+value.replaceAll('"','""')+'"',literal=value=>"'"+value.replaceAll("'","''")+"'";
const isolated=()=>{try{const u=new URL(process.env.DATABASE_URL);return process.env.NODE_ENV==='test'&&['postgres:','postgresql:'].includes(u.protocol)&&['localhost','127.0.0.1','postgres'].includes(u.hostname)&&!u.search&&!u.hash&&/^\/[^/]*test[^/]*$/i.test(decodeURIComponent(u.pathname))}catch{return false}};

async function nativeFlow(){
 // The parent establishes this private URL before this process imports ANY
 // Prisma/auth/router module. Never replace the real auth with req.user stubs.
 assert.ok(isolated(),'Isolated child database required before application import');
 process.env.RENDER_GIT_COMMIT='a'.repeat(40);
 const {PrismaClient}=await import('@prisma/client'),db=new PrismaClient();let server,globalDb;
 try{
  const version=(await db.$queryRawUnsafe(`SELECT current_setting('server_version_num')::integer AS version`))[0].version;
  if(process.env.MWS_MONTHLY_CAPTURE_REQUIRE_PG18==='1')assert.ok(version>=180000&&version<190000,'The same authenticated HTTP/race flow must connect to actual PostgreSQL18');
  console.log('D8 native PASS: actual database server_version_num='+version);
  const metadata=JSON.parse(readFileSync(new URL('./fixtures/ftext-full-schema-metadata-20261024.json',import.meta.url)));
  for(const e of metadata.enums)await db.$executeRawUnsafe(`CREATE TYPE ${q(e.name)} AS ENUM (${e.labels.map(literal).join(',')})`);
  await db.$executeRawUnsafe('CREATE SEQUENCE "CloudChange_sequence_seq" AS bigint START 1 INCREMENT 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 NO CYCLE');
  for(const table of new Set(metadata.columns.map(c=>c.table)))await db.$executeRawUnsafe(`CREATE TABLE ${q(table)} (${metadata.columns.filter(c=>c.table===table).map(c=>`${q(c.name)} ${c.type}${c.required?' NOT NULL':''}`).join(',')})`);
  for(const fn of metadata.functions)await db.$executeRawUnsafe(fn);
  for(const c of metadata.columns.filter(c=>c.default!==null))await db.$executeRawUnsafe(`ALTER TABLE ${q(c.table)} ALTER COLUMN ${q(c.name)} SET DEFAULT ${c.default}`);
  for(const kind of ['p','u','c'])for(const c of metadata.constraints.filter(c=>c.kind===kind))await db.$executeRawUnsafe(`ALTER TABLE ${q(c.table)} ADD CONSTRAINT ${q(c.name)} ${c.definition}`);
  for(const index of metadata.indexes)await db.$executeRawUnsafe(index);
  for(const c of metadata.constraints.filter(c=>c.kind==='f'))await db.$executeRawUnsafe(`ALTER TABLE ${q(c.table)} ADD CONSTRAINT ${q(c.name)} ${c.definition}`);
  for(const trigger of metadata.triggers){await db.$executeRawUnsafe(trigger.definition);await db.$executeRawUnsafe(`ALTER TABLE ${q(trigger.table)} ${trigger.enabled==='A'?'ENABLE ALWAYS':trigger.enabled==='D'?'DISABLE':'ENABLE'} TRIGGER ${q(trigger.name)}`)}
  const {provisionFtextRecoverySchema}=await import('../src/services/ftext-cash-schema.js'),{provisionAiWalletRecovery}=await import('../src/services/ai-owner-wallet-schema.js'),{ensureBackofficeStaffSchema}=await import('../src/backoffice-staff-bootstrap.js');
  await provisionFtextRecoverySchema(db);await provisionAiWalletRecovery(db);await ensureBackofficeStaffSchema(db);
  const {ensureStoreChatInteractions}=await import('../src/chat-interactions.mjs');
  await ensureStoreChatInteractions(db);
  const {provisionMonthlyInventorySnapshotSchema}=await import('../src/services/monthly-inventory-snapshot-schema.js'),{provisionMonthlyInventoryCaptureSchema,monthlyInventoryCaptureLifecycleManifestProposal}=await import('../src/services/monthly-inventory-capture-schema.js');
  await provisionMonthlyInventorySnapshotSchema(db);await provisionMonthlyInventoryCaptureSchema(db);
  await db.$executeRawUnsafe(`INSERT INTO "Company"("id","name","licenseStatus","subscriptionEndsAt","updatedAt") VALUES ('fixture-company','SYNTHETIC','ACTIVE',NOW()+INTERVAL '1 day',NOW()),('foreign-company','FOREIGN','ACTIVE',NOW()+INTERVAL '1 day',NOW()),('platform-company','PLATFORM','ACTIVE',NOW()+INTERVAL '1 day',NOW())`);
  await db.$executeRawUnsafe(`INSERT INTO "Store"("id","companyId","name","updatedAt") VALUES ('target','fixture-company','SYNTHETIC',NOW()),('sibling','fixture-company','CONTROL',NOW()),('foreign','foreign-company','FOREIGN',NOW())`);
  for(const[id,company,role]of[['owner','fixture-company','OWNER'],['admin','platform-company','SUPER_ADMIN'],['employee','fixture-company','EMPLOYEE']])await db.$executeRawUnsafe(`INSERT INTO "User"("id","companyId","email","passwordHash","fullName","role","updatedAt") VALUES ($1,$2,$3,'SYNTHETIC-NOT-A-LOGIN-HASH','SYNTHETIC',$4::"UserRole",NOW())`,id,company,id+'@monthly-http.invalid',role);
  for(const module of ['INVENTORY','CASH_CONTROL','STORE_CHAT','AI_READER','DOCUMENTS','STORE_MODE'])await db.$executeRawUnsafe(`INSERT INTO "CompanyModule"("id","companyId","moduleKey","active") VALUES ($1,'fixture-company',$2,true)`,module,module);
  await db.$executeRawUnsafe(`INSERT INTO "CompanyModule"("id","companyId","moduleKey","active") VALUES ('foreign-inventory','foreign-company','INVENTORY',true)`);
  await db.$executeRawUnsafe(`INSERT INTO "Product"("id","companyId","name") VALUES ('shared','fixture-company','CONTROL'),('foreign','foreign-company','FOREIGN')`);
  for(const[store,company,product]of[['target','fixture-company','shared'],['sibling','fixture-company','shared'],['foreign','foreign-company','foreign']]){
   await db.$executeRawUnsafe(`INSERT INTO "StoreProduct"("id","storeId","productId","currentStock") VALUES ($1,$2,$3,-12.3456)`,store+'-stock',store,product);
   await db.$executeRawUnsafe(`INSERT INTO "StockMovement"("id","storeId","productId","movementType","quantity") VALUES ($1,$2,$3,'SYNTHETIC',-12.3456)`,store+'-movement',store,product);
   await db.$executeRawUnsafe(`INSERT INTO "CashShiftSession"("id","companyId","storeId","openedBy","status") VALUES ($1,$2,$3,'admin','CLOSED')`,store+'-shift',company,store);
   await db.$executeRawUnsafe(`INSERT INTO "StoreTransaction"("id","companyId","storeId","type","amount","actorId","actorName") VALUES ($1,$2,$3,'SYNTHETIC',12.34,'admin','SYNTHETIC')`,store+'-payment',company,store);
   await db.$executeRawUnsafe(`INSERT INTO "Sale"("id","companyId","storeId","total") VALUES ($1,$2,$3,12.34)`,store+'-sale',company,store);
   if(store!=='target')await db.$executeRawUnsafe(`INSERT INTO "MonthlyInventoryCaptureGrant"("id","companyId","storeId","purpose","lifecycleGeneration","delegatorUserId","delegatorSessionVersion","createdByUserId","updatedByUserId") VALUES ($1,$2,$3,$4,0,'admin',0,'admin','admin')`,'control-'+store,company,store,purpose);
  }
  await db.$executeRawUnsafe(`INSERT INTO "Employee"("id","fullName","storeId","updatedAt") VALUES ('pos-employee','SYNTHETIC POS','target',NOW())`);
  await db.$executeRawUnsafe(`INSERT INTO "StoreOperatorCredential"("id","companyId","storeId","employeeId","displayName","createdBy") VALUES ('pos-operator','fixture-company','target','pos-employee','SYNTHETIC POS','owner')`);
  await db.$executeRawUnsafe(`INSERT INTO "StoreOperatorSession"("id","operatorId","companyId","storeId","expiresAt") VALUES ('pos-session','pos-operator','fixture-company','target',NOW()+INTERVAL '1 hour')`);
  const {createLifecycleInstallationCore}=await import('../src/services/store-lifecycle-executor.js');
  const core=createLifecycleInstallationCore(monthlyInventoryCaptureLifecycleManifestProposal(),{sourceRevision:'a'.repeat(40)});await core.install(db,{id:'admin',isSuperAdmin:true},{companyId:'fixture-company',storeId:'target'});
  const express=(await import('express')).default,jwt=(await import('jsonwebtoken')).default,{auth}=await import('../src/middleware/auth.js'),{requireStoreModule}=await import('../src/middleware/module-access.js'),{prisma}=await import('../src/prisma.js');globalDb=prisma;
  const {issueSession}=await import('../src/routes/auth.js'),{default:platform}=await import('../src/routes/platform-admin.js'),{createBackofficeStaffRouter}=await import('../src/routes/backoffice-staff.js'),{createMonthlyInventoryCaptureRouter}=await import('../src/routes/monthly-inventory-capture.js'),{staffCapabilities}=await import('../../shared/backoffice-staff.mjs');
  const app=express();app.use(express.json());app.use('/api/platform',platform);app.use('/api/backoffice-staff',createBackofficeStaffRouter({db:prisma,authenticate:auth,issueSession}));
  app.use('/api/monthly-inventory-capture',(_req,res,next)=>{res.setHeader('Cache-Control','no-store');next()},auth,requireStoreModule('INVENTORY'),createMonthlyInventoryCaptureRouter(prisma));
  app.use((error,_req,res,_next)=>res.status(error.status||503).json({code:error.code||'ISOLATED_REQUEST_FAILURE',error:'Isolated request refused'}));
  server=await new Promise(resolve=>{const value=app.listen(0,'127.0.0.1',()=>resolve(value))});
  const request=async(path,{token,method='GET',body,headers={}}={})=>{const r=await fetch('http://127.0.0.1:'+server.address().port+path,{method,headers:{...(token?{Authorization:'Bearer '+token}:{}),...(body===undefined?{}:{'Content-Type':'application/json'}),...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});return{status:r.status,headers:r.headers,data:await r.json()}};
  const genuineSession=async id=>{const user=(await db.$queryRawUnsafe(`SELECT "id","companyId","email","fullName","role"::text AS role,"sessionVersion","mustChangePassword" FROM "User" WHERE "id"=$1`,id))[0];user.company=(await db.$queryRawUnsafe(`SELECT "id","name" FROM "Company" WHERE "id"=$1`,user.companyId))[0];return issueSession(user,{headers:{},ip:'127.0.0.1'},'Synthetic D8 native',db)};
  const ownerSession=await genuineSession('owner'),adminSession=await genuineSession('admin'),employeeSession=await genuineSession('employee'),ownerToken=ownerSession.token;
  const support=await request('/api/platform/companies/fixture-company/support-access',{token:adminSession.token,method:'POST',body:{storeId:'target',destination:'BACKOFFICE'}});assert.equal(support.status,200,'Real support-access issuer must succeed');
  const supportClaims=jwt.verify(support.data.token,process.env.JWT_SECRET);assert.deepEqual(Object.keys(supportClaims.supportContext).sort(),['companyId','companyName','destination','storeId','storeName']);assert.equal(supportClaims.role,'OWNER');assert.equal(supportClaims.platformRole,'SUPER_ADMIN');assert.equal(supportClaims.isSuperAdmin,true);
  const issuerAudit=await db.$queryRawUnsafe(`SELECT "event","userId" FROM "AuthAudit" WHERE "event"='SUPER_ADMIN_SUPPORT_ACCESS'`);assert.deepEqual(issuerAudit,[{event:'SUPER_ADMIN_SUPPORT_ACCESS',userId:'admin'}]);
  const staff=await request('/api/backoffice-staff/admin/accounts',{token:ownerToken,method:'POST',body:{username:'monthly.all-rights.fixture',fullName:'Synthetic all-rights operator',pin:'6249',grants:[{storeId:'target',profile:'MANAGER',capabilities:[...staffCapabilities]}]}});assert.equal(staff.status,201,'Real Owner provisioning flow must succeed');
  const login=await request('/api/backoffice-staff/login',{method:'POST',body:{username:'monthly.all-rights.fixture',pin:'6249'}});assert.equal(login.status,200,'Real PIN login must succeed');const staffClaims=jwt.verify(login.data.token,process.env.JWT_SECRET);assert.equal(staffClaims.role,'EMPLOYEE');assert.equal(staffClaims.staffAccess,true);assert.equal(staffCapabilities.length,21);
  const storedStaff=(await db.$queryRawUnsafe(`SELECT "profile","capabilities" FROM "BackofficeStaffGrant" WHERE "userId"=$1 AND "storeId"='target'`,staff.data.id))[0];assert.equal(storedStaff.profile,'MANAGER');assert.deepEqual(storedStaff.capabilities,staffCapabilities);
  const controls=async()=>{const tables=await db.$queryRawUnsafe(`SELECT tablename AS name FROM pg_tables WHERE schemaname='public' ORDER BY tablename`);return db.$queryRawUnsafe(tables.map(t=>`SELECT ${literal(t.name)} AS table_name,row_to_json(t)::text AS row FROM ${q(t.name)} t${t.name==='MonthlyInventoryCaptureGrant'?` WHERE "storeId"<>'target'`:''}`).join(' UNION ALL ')+' ORDER BY table_name,row')};
  const baseline=await controls(),base='/api/monthly-inventory-capture',epoch={storeId:'target',lifecycleGeneration:'0'};
  const unchanged=async()=>{assert.deepEqual(await controls(),baseline,'business, stock, sessions, foreign grants, jobs and snapshots remain byte-identical');const counts=(await db.$queryRawUnsafe(`SELECT (SELECT count(*)::int FROM "MonthlyInventoryCaptureJob") AS jobs,(SELECT count(*)::int FROM "MonthlyInventorySnapshot") AS snapshots`))[0];assert.deepEqual(counts,{jobs:0,snapshots:0})};
  const call=async(action,body,token=ownerToken)=>request(base+(action?'/' +action:'?storeId=target'),{token,...(action?{method:'POST',body}:{})});
  const absent=await call('',null);assert.equal(absent.status,200);assert.equal(absent.data.grant,null);assert.equal(absent.data.lifecycleGeneration,'0');await unchanged();
  const created=await call('create-inactive',epoch);assert.equal(created.status,200);assert.equal(created.data.status,'CREATED_INACTIVE');let grant=created.data.grant;assert.equal(grant.active,false);assert.equal(grant.revision,'1');assert.equal(grant.activationId,null);await unchanged();
  const enable={...epoch,grantId:grant.id,expectedRevision:'1',purpose},enabled=await call('enable',enable);assert.equal(enabled.status,200);assert.equal(enabled.data.status,'ENABLED');grant=enabled.data.grant;assert.equal(grant.revision,'2');assert.equal(grant.delegatorUserId,'owner');assert.equal(grant.active,true);assert.match(grant.firstScheduledFor,/\.\d{6}Z$/);assert.ok(grant.firstScheduledFor>=grant.grantedAt);await unchanged();
  const replay=await call('enable',enable);assert.equal(replay.data.status,'ALREADY_ENABLED');assert.deepEqual(replay.data.grant,grant);const exists=await call('create-inactive',epoch);assert.equal(exists.data.status,'ALREADY_EXISTS');assert.deepEqual(exists.data.grant,grant);await unchanged();
  const revoke={...epoch,grantId:grant.id,expectedRevision:'2'},revoked=await call('revoke',revoke);assert.equal(revoked.data.status,'REVOKED');grant=revoked.data.grant;assert.equal(grant.revision,'3');assert.equal(grant.active,false);assert.deepEqual((await call('revoke',revoke)).data,{status:'ALREADY_REVOKED',grant});await unchanged();
  console.log('D8 native PASS: real personal Owner HTTP read/inactive/enable/revoke/replay and unchanged controls');
  const saRead=await call('',null,support.data.token);assert.equal(saRead.status,200);assert.deepEqual(saRead.data.grant,grant);
  const saEnabled=await call('enable',{...enable,expectedRevision:'3'},support.data.token);assert.equal(saEnabled.status,200);assert.equal(saEnabled.data.grant.delegatorUserId,'admin');assert.equal(saEnabled.data.grant.revision,'4');
  const saRevoked=await call('revoke',{...revoke,expectedRevision:'4'},support.data.token);assert.equal(saRevoked.status,200);grant=saRevoked.data.grant;assert.equal(grant.revision,'5');await unchanged();
  console.log('D8 native PASS: actual support-access issued five-key masked-SuperAdmin JWT authorizes without role rewriting');
  for(const[action,body]of[['',null],['create-inactive',epoch],['enable',{...enable,expectedRevision:'5'}],['revoke',{...revoke,expectedRevision:'5'}]]){const result=await request(base+(action?'/'+action:'?storeId=target'),{token:login.data.token,headers:{'x-backoffice-store-id':'target'},...(action?{method:'POST',body}:{})});assert.equal(result.status,403);assert.equal(result.data.code,'STAFF_ACCESS_DENIED');await unchanged()}
  const plain=await call('',null,employeeSession.token);assert.equal(plain.status,403);assert.equal(plain.data.code,'MONTHLY_CAPTURE_AUTHORITY_DENIED');await unchanged();
  const posToken=jwt.sign({id:'pos-operator',operatorId:'pos-operator',employeeId:'pos-employee',companyId:'fixture-company',storeId:'target',role:'EMPLOYEE',tokenType:'STORE_OPERATOR',operatorSessionId:'pos-session'},process.env.JWT_SECRET,{expiresIn:'1h'});
  assert.ok([400,403].includes((await call('',null,posToken)).status));
  const ownerClaims=jwt.verify(ownerToken,process.env.JWT_SECRET),sign=patch=>{const {iat,exp,...claims}=ownerClaims;return jwt.sign({...claims,...patch},process.env.JWT_SECRET,{expiresIn:'1h'})};
  for(const token of [sign({tokenType:'SERVICE_DELEGATION',role:'SYSTEM'}),sign({sessionId:undefined}),sign({sessionId:'missing-session'}),sign({companyId:'foreign-company',ownerCompanyId:'foreign-company'}),sign({isSuperAdmin:true,platformRole:'SUPER_ADMIN',supportContext:{companyId:'fixture-company',companyName:'Not authority',storeId:'target',storeName:'Not authority',destination:'BACKOFFICE'}})])assert.ok([401,403].includes((await call('',null,token)).status));
  assert.equal((await request(base+'?storeId=target')).status,401);await unchanged();
  console.log('D8 native PASS: actual all-ten-rights MANAGER-labelled PIN staff, plain employee, current POS and service/nonpersonal tokens cannot grant');
  const refuse=async(body,action='enable')=>{const before=await db.$queryRawUnsafe(`SELECT row_to_json(g)::text AS row FROM "MonthlyInventoryCaptureGrant" g WHERE "storeId"='target'`);const result=await call(action,body);assert.ok([400,403,409].includes(result.status));assert.equal(result.headers.get('cache-control'),'no-store');assert.deepEqual(await db.$queryRawUnsafe(`SELECT row_to_json(g)::text AS row FROM "MonthlyInventoryCaptureGrant" g WHERE "storeId"='target'`),before);await unchanged();return result};
  for(const body of [{...enable,expectedRevision:'1'},{...enable,expectedRevision:'5',lifecycleGeneration:'1'},{...enable,expectedRevision:'5',grantId:'foreign-grant'},{...enable,expectedRevision:'5',purpose:'CASH_CONTROL'},{...enable,expectedRevision:'5',companyId:'foreign-company'}])await refuse(body);
  for(const store of ['foreign','missing']){const result=await request(base+'?storeId='+store,{token:ownerToken});assert.equal(result.status,404)}
  const unsupported=await request(base+'?storeId=sibling',{token:ownerToken});assert.equal(unsupported.status,403);assert.equal(unsupported.data.code,'MONTHLY_CAPTURE_ENROLLMENT_REQUIRED');await unchanged();
  const saClaims=jwt.verify(support.data.token,process.env.JWT_SECRET),signedSupport=context=>{const{iat,exp,...claims}=saClaims;return jwt.sign({...claims,supportContext:context},process.env.JWT_SECRET,{expiresIn:'1h'})};
  for(const context of [{...saClaims.supportContext,companyId:'foreign-company'},{...saClaims.supportContext,storeId:'sibling'},{...saClaims.supportContext,destination:'NEW_AUTHORITY'},{...saClaims.supportContext,unknown:true},{...saClaims.supportContext,companyName:{id:'wrong'}}])assert.equal((await call('',null,signedSupport(context))).status,403);
  await unchanged();
  const mutations=[
   [`UPDATE "UserSession" SET "revokedAt"=NOW() WHERE "id"=$1`,`UPDATE "UserSession" SET "revokedAt"=NULL WHERE "id"=$1`,ownerSession.session.id],
   [`UPDATE "User" SET "sessionVersion"=1 WHERE "id"='owner'`,`UPDATE "User" SET "sessionVersion"=0 WHERE "id"='owner'`],
   [`UPDATE "User" SET "mustChangePassword"=true WHERE "id"='owner'`,`UPDATE "User" SET "mustChangePassword"=false WHERE "id"='owner'`],
   [`UPDATE "Company" SET "active"=false WHERE "id"='fixture-company'`,`UPDATE "Company" SET "active"=true WHERE "id"='fixture-company'`],
   [`UPDATE "Company" SET "licenseStatus"='SUSPENDED' WHERE "id"='fixture-company'`,`UPDATE "Company" SET "licenseStatus"='ACTIVE' WHERE "id"='fixture-company'`],
   [`UPDATE "Store" SET "active"=false WHERE "id"='target'`,`UPDATE "Store" SET "active"=true WHERE "id"='target'`],
   [`UPDATE "CompanyModule" SET "active"=false WHERE "id"='INVENTORY'`,`UPDATE "CompanyModule" SET "active"=true WHERE "id"='INVENTORY'`],
   [`UPDATE "StoreLifecycleFence" SET "maintenance"=true WHERE "storeId"='target'`,`UPDATE "StoreLifecycleFence" SET "maintenance"=false WHERE "storeId"='target'`]
  ];
  for(const[before,restore,parameter]of mutations){const args=parameter?[parameter]:[];await db.$executeRawUnsafe(before,...args);const baselineDuring=await controls();try{const result=await call('',null);assert.ok([401,403,409].includes(result.status));assert.deepEqual(await controls(),baselineDuring)}finally{await db.$executeRawUnsafe(restore,...args)}await unchanged()}
  const sessionExpiry=(await db.$queryRawUnsafe(`SELECT "expiresAt" FROM "UserSession" WHERE "id"=$1`,ownerSession.session.id))[0].expiresAt;
  await db.$executeRawUnsafe(`UPDATE "UserSession" SET "expiresAt"=NOW()-INTERVAL '1 minute' WHERE "id"=$1`,ownerSession.session.id);assert.equal((await call('',null)).status,401);await db.$executeRawUnsafe(`UPDATE "UserSession" SET "expiresAt"=$1 WHERE "id"=$2`,sessionExpiry,ownerSession.session.id);await unchanged();
  const ends=(await db.$queryRawUnsafe(`SELECT "subscriptionEndsAt" FROM "Company" WHERE "id"='fixture-company'`))[0].subscriptionEndsAt;await db.$executeRawUnsafe(`UPDATE "Company" SET "subscriptionEndsAt"=NOW()-INTERVAL '1 minute' WHERE "id"='fixture-company'`);assert.equal((await call('',null)).status,403);assert.equal((await call('',null,support.data.token)).status,403,'SuperAdmin manager still requires paid Inventory');await db.$executeRawUnsafe(`UPDATE "Company" SET "subscriptionEndsAt"=$1 WHERE "id"='fixture-company'`,ends);await unchanged();
  await db.$executeRawUnsafe(`INSERT INTO "StorePaidModule"("id","companyId","storeId","moduleKey","active","endsAt") VALUES ('expired-inventory','fixture-company','target','INVENTORY',true,NOW()-INTERVAL '1 minute')`);assert.equal((await call('',null)).status,403);assert.equal((await call('',null,support.data.token)).status,403);await db.$executeRawUnsafe(`DELETE FROM "StorePaidModule" WHERE "id"='expired-inventory'`);await unchanged();
  console.log('D8 native PASS: current session/password/company/store/paid-module/access and generation/revision/purpose boundaries refuse without mutation');
  const plan=(await db.$queryRawUnsafe(`SELECT "planHash" FROM "StoreLifecycleFence" WHERE "storeId"='target'`))[0].planHash;
  await db.$executeRawUnsafe(`UPDATE "StoreLifecycleFence" SET "planHash"=$1 WHERE "storeId"='target'`,'0'.repeat(64));const wrongPlan=await call('',null);assert.equal(wrongPlan.status,403);assert.equal(wrongPlan.data.code,'MONTHLY_CAPTURE_ENROLLMENT_REQUIRED');await db.$executeRawUnsafe(`UPDATE "StoreLifecycleFence" SET "planHash"=$1 WHERE "storeId"='target'`,plan);await unchanged();
  await db.$executeRawUnsafe('ALTER TABLE "MonthlyInventoryCaptureGrant" ADD COLUMN "UnreviewedD8Fixture" text');const tampered=await call('',null);assert.equal(tampered.status,409);assert.equal(tampered.data.code,'MONTHLY_CAPTURE_SCHEMA_CHANGED');assert.equal(Object.hasOwn(tampered.data,'grant'),false);await db.$executeRawUnsafe('ALTER TABLE "MonthlyInventoryCaptureGrant" DROP COLUMN "UnreviewedD8Fixture"');await unchanged();
  await db.$executeRawUnsafe('ALTER TABLE "MonthlyInventoryCaptureGrant" RENAME TO "MissingD8FixtureGrant"');const missing=await call('',null);assert.equal(missing.status,409);assert.equal(missing.data.code,'MONTHLY_CAPTURE_SCHEMA_UNAVAILABLE');assert.equal(Object.hasOwn(missing.data,'grant'),false);await db.$executeRawUnsafe('ALTER TABLE "MissingD8FixtureGrant" RENAME TO "MonthlyInventoryCaptureGrant"');await unchanged();
  console.log('D8 native PASS: absent/tampered schema and wrong enrollment remain unavailable, never successful empty grants');
  assert.equal((await call('',null)).data.grant.revision,'5');await unchanged();
  // New personal-now cohort follows the original unchanged grant assertions.
  // All identities originate from the genuine issuer/session flows above.
  const {createMonthlyPersonalCaptureNowService}=await import('../src/services/monthly-inventory-capture-now.js');
  const preview=await request(base+'/capture-now?storeId=target',{token:ownerToken});assert.equal(preview.status,200);assert.equal(preview.data.existingReceipt,null);
  const captureInput={...epoch,expectedIssueMonth:preview.data.issueMonth},capturePath=base+'/capture-now';
  for(const token of [login.data.token,employeeSession.token,posToken])assert.ok([400,401,403].includes((await request(capturePath,{token,method:'POST',body:captureInput})).status));
  for(const body of [{...captureInput,lifecycleGeneration:'1'},{...captureInput,expectedIssueMonth:'2000-01'},{...captureInput,month:'2000-01'},{...captureInput,companyId:'foreign-company'}])assert.ok([400,403,409].includes((await request(capturePath,{token:ownerToken,method:'POST',body})).status));
  for(const store of ['sibling','foreign'])assert.ok([403,404,409].includes((await request(base+'/capture-now?storeId='+store,{token:ownerToken})).status));
  await unchanged();
  const captureState=async()=> (await controls()).filter(row=>row.table_name!=='MonthlyInventorySnapshot');
  const beforeCapture=await captureState();
  // Coordinate real isolated transactions after held SOURCE commits and before
  // WRITE begins. This wrapper is test-only; production has no hooks/providers.
  for(const kind of ['REVOKED','EXPIRED','PAID_SA']){
   let changed=false;
   const wrapped={$transaction:async(fn,options)=>{const result=await db.$transaction(fn,options);if(options.isolationLevel==='RepeatableRead'){
    changed=true;if(kind==='REVOKED')await db.$executeRawUnsafe(`UPDATE "UserSession" SET "revokedAt"=NOW() WHERE "id"=$1`,ownerSession.session.id);
    else if(kind==='EXPIRED')await db.$executeRawUnsafe(`UPDATE "UserSession" SET "expiresAt"=NOW()-INTERVAL '1 second' WHERE "id"=$1`,ownerSession.session.id);
    else await db.$executeRawUnsafe(`UPDATE "Company" SET "subscriptionEndsAt"=NOW()-INTERVAL '1 second' WHERE "id"='fixture-company'`);
   }return result}};
   try{await assert.rejects(createMonthlyPersonalCaptureNowService(wrapped).capture(kind==='PAID_SA'?supportClaims:ownerClaims,captureInput),error=>/^MONTHLY_CAPTURE_/.test(error.code));assert.equal(changed,true)}
   finally{await db.$executeRawUnsafe(`UPDATE "UserSession" SET "revokedAt"=NULL,"expiresAt"=$1 WHERE "id"=$2`,sessionExpiry,ownerSession.session.id);await db.$executeRawUnsafe(`UPDATE "Company" SET "subscriptionEndsAt"=$1 WHERE "id"='fixture-company'`,ends)}
   assert.deepEqual(await captureState(),beforeCapture);assert.equal((await db.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "MonthlyInventorySnapshot"`))[0].n,0);
  }
  console.log('D8 native PASS: personal source-to-writer session revoke/expiry and paid-SuperAdmin loss refuse without capture');
  // Expire only after WRITE has inserted and read its own row: failure must
  // roll that new row back, not merely reject an immutable replay.
  let ownInsert=false,ownReadWait=false;
  const rollbackDb={$transaction:async(fn,options)=>{
   const result=await db.$transaction(tx=>fn(new Proxy(tx,{get(target,key){if(key==='$queryRawUnsafe')return async(sql,...args)=>{const rows=await target.$queryRawUnsafe(sql,...args);if(sql.startsWith('INSERT INTO "MonthlyInventorySnapshot"'))ownInsert=true;if(ownInsert&&!ownReadWait&&sql.startsWith('SELECT "id","companyId","storeId","lifecycleGeneration"::text')){ownReadWait=true;await target.$queryRawUnsafe('SELECT 1::integer AS waited FROM pg_sleep(3.2)')}return rows};const value=target[key];return typeof value==='function'?value.bind(target):value}})),options);
   if(options.isolationLevel==='RepeatableRead')await db.$executeRawUnsafe(`UPDATE "UserSession" SET "expiresAt"=clock_timestamp()+INTERVAL '3 seconds' WHERE "id"=$1`,ownerSession.session.id);
   return result;
  }};
  try{await assert.rejects(createMonthlyPersonalCaptureNowService(rollbackDb).capture(ownerClaims,captureInput),{code:'MONTHLY_CAPTURE_AUTHORIZATION_EXPIRED'});assert.equal(ownInsert,true);assert.equal(ownReadWait,true)}finally{await db.$executeRawUnsafe(`UPDATE "UserSession" SET "expiresAt"=$1 WHERE "id"=$2`,sessionExpiry,ownerSession.session.id)}
  assert.deepEqual(await captureState(),beforeCapture);assert.equal((await db.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "MonthlyInventorySnapshot"`))[0].n,0);
  console.log('D8 native PASS: real-clock expiry after own INSERT/readback rolls back new snapshot and preserves all controls');
  let responseLost=false;
  const lostResponseDb={$transaction:async(fn,options)=>{const result=await db.$transaction(fn,options);if(result?.receipt?.status==='STORED'&&!responseLost){responseLost=true;throw Error('ISOLATED_RESPONSE_LOST_AFTER_COMMIT')}return result}};
  // Same real router/auth/module middleware, with a test-only database wrapper
  // that loses the response only AFTER the real insertion committed.
  app.use('/api/monthly-lost-response',auth,requireStoreModule('INVENTORY'),createMonthlyInventoryCaptureRouter(lostResponseDb));
  const lost=await request('/api/monthly-lost-response/capture-now',{token:ownerToken,method:'POST',body:captureInput});assert.equal(lost.status,503);assert.equal(responseLost,true);assert.equal(Object.hasOwn(lost.data,'receipt'),false);
  const captured=await request(base+'/capture-now?storeId=target',{token:ownerToken});assert.equal(captured.status,200);const receipt=captured.data.existingReceipt;assert.ok(receipt);
  assert.equal(receipt.issueMonth,preview.data.issueMonth);assert.equal(receipt.observationStatus,'LATE');assert.equal(receipt.sourceAuthenticityVerified,false);assert.equal(receipt.receiptBasis,'FORMAT_VALIDATED_STORED_ONLY');assert.match(receipt.storedAt,/\.\d{6}Z$/);assert.equal(Object.keys(receipt).length,16);assert.equal(Object.hasOwn(receipt,'candidateJsonText'),false);
  const immutable=await db.$queryRawUnsafe(`SELECT row_to_json(s)::text AS row FROM "MonthlyInventorySnapshot" s ORDER BY "id"`);
  // A lost POST response is reconciled by GET, with no resubmission necessary.
  const recovered=await request(base+'/capture-now?storeId=target',{token:ownerToken});assert.equal(recovered.status,200);assert.deepEqual(recovered.data.existingReceipt,receipt);
  const repeated=await request(capturePath,{token:support.data.token,method:'POST',body:captureInput});assert.equal(repeated.data.status,'ALREADY_CAPTURED');assert.deepEqual(repeated.data.receipt,receipt);
  assert.deepEqual(await captureState(),beforeCapture);assert.deepEqual(await db.$queryRawUnsafe(`SELECT row_to_json(s)::text AS row FROM "MonthlyInventorySnapshot" s ORDER BY "id"`),immutable);
  // Replay remains freshly authorized AFTER canonical readback and waits.
  await db.$executeRawUnsafe(`UPDATE "UserSession" SET "expiresAt"=clock_timestamp()+INTERVAL '2 seconds' WHERE "id"=$1`,ownerSession.session.id);
  let waited=false;
  const delayed={$transaction:(fn,options)=>db.$transaction(tx=>fn(new Proxy(tx,{get(target,key){if(key==='$queryRawUnsafe')return async(sql,...args)=>{const result=await target.$queryRawUnsafe(sql,...args);if(sql.startsWith('SELECT "id","companyId","storeId","lifecycleGeneration"::text')&&!waited){waited=true;await target.$queryRawUnsafe('SELECT 1::integer AS waited FROM pg_sleep(2.1)')}return result};const value=target[key];return typeof value==='function'?value.bind(target):value}})),options)};
  try{await assert.rejects(createMonthlyPersonalCaptureNowService(delayed).preview(ownerClaims,{storeId:'target'}),{code:'MONTHLY_CAPTURE_AUTHORIZATION_EXPIRED'});assert.equal(waited,true)}finally{await db.$executeRawUnsafe(`UPDATE "UserSession" SET "expiresAt"=$1 WHERE "id"=$2`,sessionExpiry,ownerSession.session.id)}
  assert.deepEqual(await captureState(),beforeCapture);assert.deepEqual(await db.$queryRawUnsafe(`SELECT row_to_json(s)::text AS row FROM "MonthlyInventorySnapshot" s ORDER BY "id"`),immutable);
  // A fixture-only DB-result wrapper models crossing the next Athens07 within
  // the bounded context. No production clock/provider or arbitrary date input.
  const {monthlyInventorySnapshotPeriod}=await import('../src/services/monthly-inventory-snapshot-period.js');
  const nextIssue=new Date(Date.UTC(Number(preview.data.issueMonth.slice(0,4)),Number(preview.data.issueMonth.slice(5)),1)).toISOString().slice(0,7),boundary=monthlyInventorySnapshotPeriod(nextIssue).scheduledFor;
  const beforeBoundary=new Date(Date.parse(boundary)-1000).toISOString(),afterBoundary=new Date(Date.parse(boundary)+1).toISOString();
  const farExpiry=new Date(Date.parse(boundary)+86400000);
  await db.$executeRawUnsafe(`UPDATE "UserSession" SET "expiresAt"=$1 WHERE "id"=$2`,farExpiry,ownerSession.session.id);await db.$executeRawUnsafe(`UPDATE "Company" SET "subscriptionEndsAt"=$1 WHERE "id"='fixture-company'`,farExpiry);
  let readBack=false;
  const rollover={$transaction:(fn,options)=>db.$transaction(tx=>fn(new Proxy(tx,{get(target,key){if(key==='$queryRawUnsafe')return async(sql,...args)=>{const rows=await target.$queryRawUnsafe(sql,...args);if(sql.includes("current_setting('transaction_read_only')")&&sql.includes('transaction_timestamp()'))return rows.map(r=>({...r,transactionStartedAt:beforeBoundary,readAt:beforeBoundary}));if(sql.startsWith('SELECT "id","companyId","storeId","lifecycleGeneration"::text'))readBack=true;if(sql.startsWith('SELECT to_char(clock_timestamp()')&&sql.includes('AS valid'))return rows.map(r=>({...r,readAt:readBack?afterBoundary:beforeBoundary}));return rows};const value=target[key];return typeof value==='function'?value.bind(target):value}})),options)};
  try{await assert.rejects(createMonthlyPersonalCaptureNowService(rollover).preview(ownerClaims,{storeId:'target'}),{code:'MONTHLY_CAPTURE_PERIOD_STALE'});assert.equal(readBack,true)}finally{await db.$executeRawUnsafe(`UPDATE "UserSession" SET "expiresAt"=$1 WHERE "id"=$2`,sessionExpiry,ownerSession.session.id);await db.$executeRawUnsafe(`UPDATE "Company" SET "subscriptionEndsAt"=$1 WHERE "id"='fixture-company'`,ends)}
  assert.deepEqual(await captureState(),beforeCapture);assert.deepEqual(await db.$queryRawUnsafe(`SELECT row_to_json(s)::text AS row FROM "MonthlyInventorySnapshot" s ORDER BY "id"`),immutable);
  console.log('D8 native PASS: current actual capture/immutable replay/uncertain-result GET and post-readback real-clock expiry preserve all business/grant/job controls');
  // The installed database guard must admit a genuine NONZERO epoch, not only
  // its implicit zero fallback. Old immutable generation-zero bytes stay intact.
  await db.$executeRawUnsafe(`UPDATE "StoreLifecycleFence" SET "generation"=1 WHERE "storeId"='target'`);
  try{const next=await request(base+'/capture-now?storeId=target',{token:ownerToken});assert.equal(next.data.lifecycleGeneration,'1');assert.equal(next.data.existingReceipt,null);const nonzero=await request(capturePath,{token:ownerToken,method:'POST',body:{...captureInput,lifecycleGeneration:'1'}});assert.equal(nonzero.status,200);assert.equal(nonzero.data.status,'STORED');assert.equal(nonzero.data.receipt.lifecycleGeneration,'1')}
  finally{await db.$executeRawUnsafe(`UPDATE "StoreLifecycleFence" SET "generation"=0 WHERE "storeId"='target'`)}
  assert.deepEqual(await captureState(),beforeCapture);assert.equal((await db.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "MonthlyInventorySnapshot"`))[0].n,2);assert.equal((await db.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "MonthlyInventoryCaptureJob"`))[0].n,0);
  console.log('D8 native PASS: installed mutation guards accept explicit generation1 while stale epoch and all sibling/business state stay protected');
  console.log('D8 native authenticated HTTP integration passed');
 }finally{if(server)await new Promise(resolve=>{server.close(resolve);server.closeAllConnections()});await globalDb?.$disconnect();await db.$disconnect()}
}

if(process.env[childKey]==='1')await nativeFlow();
else test('native authenticated personal capture routes use real JWT/session/issuer/staff boundaries and preserve all controls',{
 skip:!isolated()&&!process.env.CI?'Actual isolated PostgreSQL unavailable locally':false,timeout:360000
},async()=>{
 assert.ok(isolated(),'Actual isolated PostgreSQL is mandatory in CI');const {PrismaClient}=await import('@prisma/client'),admin=new PrismaClient(),name='monthly_http_'+randomBytes(10).toString('hex')+'_test';let created=false;
 try{await admin.$executeRawUnsafe(`CREATE DATABASE ${q(name)}`);created=true;const url=new URL(process.env.DATABASE_URL);url.pathname='/'+name;
  const{stdout}=await promisify(execFile)(process.execPath,[fileURLToPath(import.meta.url)],{env:{...process.env,DATABASE_URL:url.href,NODE_ENV:'test',[childKey]:'1',JWT_SECRET:'isolated-monthly-http-secret-not-production'},timeout:330000,maxBuffer:4*1024*1024});
  assert.match(stdout,/D8 native authenticated HTTP integration passed/);for(const line of stdout.split('\n').filter(line=>line.startsWith('D8 native PASS:')))console.log(line);
 }finally{if(created)await admin.$executeRawUnsafe(`DROP DATABASE ${q(name)} WITH (FORCE)`);await admin.$disconnect()}
});

if(process.env[childKey]!=='1')test('same genuine personal capture HTTP and transaction races run against actual CI PG18 image',{
 skip:!process.env.MWS_LIFECYCLE_RECOVERY_IMAGE&&!process.env.CI?'Actual PG18 recovery image unavailable locally':false,timeout:540000
},async()=>{
 const image=process.env.MWS_LIFECYCLE_RECOVERY_IMAGE;assert.ok(image,'CI requires the already-built lifecycle recovery image');
 const run=promisify(execFile),suffix=randomBytes(10).toString('hex'),name='monthly-http-pg18-'+suffix,database='monthly_http_pg18_'+suffix+'_test',password=randomBytes(32).toString('hex');
 const docker=(args,timeout=30000)=>run('docker',args,{timeout,maxBuffer:4*1024*1024});
 let created=false;
 try{
  // Only synthetic POSTGRES_* values enter the container. Use the official PG18
  // entrypoint instead of the image's backup runner; no AWS/Render env or mount.
  await docker(['run','--detach','--name',name,'--label','mws.test=monthly-personal-capture-pg18','--read-only','--memory=512m','--cpus=1','--pids-limit=128','--security-opt','no-new-privileges',
   '--tmpfs','/var/lib/postgresql:rw,size=512m','--tmpfs','/var/run/postgresql:rw,size=32m','--tmpfs','/tmp:rw,size=64m',
   '--publish','127.0.0.1::5432','--env','POSTGRES_USER=postgres','--env','POSTGRES_PASSWORD='+password,'--env','POSTGRES_DB='+database,'--env','PGDATA=/var/lib/postgresql/18/docker',
   '--entrypoint','docker-entrypoint.sh',image,'postgres','-c','shared_buffers=32MB','-c','max_connections=30']);
  created=true;
  let ready=false;const readyUntil=Date.now()+30000;while(Date.now()<readyUntil){try{await docker(['exec',name,'pg_isready','-h','127.0.0.1','-U','postgres','-d',database],5000);ready=true;break}catch{await delay(250)}}assert.ok(ready,'Private synthetic PG18 TCP listener must become ready');
  const published=(await docker(['port',name,'5432/tcp'])).stdout.trim();assert.match(published,/^127\.0\.0\.1:\d+$/);const port=published.slice(published.lastIndexOf(':')+1);
  const version=Number((await docker(['exec',name,'psql','-U','postgres','-d',database,'-tAc','SHOW server_version_num'])).stdout.trim());assert.ok(version>=180000&&version<190000,'Actual container server must be PG18');
  const url='postgresql://postgres:'+password+'@127.0.0.1:'+port+'/'+database;
  const childEnv={PATH:process.env.PATH,HOME:process.env.HOME,TMPDIR:process.env.TMPDIR,NODE_ENV:'test',DATABASE_URL:url,JWT_SECRET:'isolated-pg18-monthly-http-secret-not-production',[childKey]:'1',MWS_MONTHLY_CAPTURE_REQUIRE_PG18:'1'};
  const {stdout}=await run(process.execPath,[fileURLToPath(import.meta.url)],{env:childEnv,timeout:360000,maxBuffer:4*1024*1024});
  assert.match(stdout,/D8 native authenticated HTTP integration passed/);assert.match(stdout,new RegExp('actual database server_version_num='+version));
  for(const line of stdout.split('\n').filter(line=>line.startsWith('D8 native PASS:')))console.log('PG18 '+line);
 }finally{if(created)await docker(['rm','--force','--volumes',name]);else await docker(['rm','--force','--volumes',name]).catch(()=>{})}
});
