import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import express from 'express';
import {enforceBackofficeStaff,requireStaffGrant,staffError} from '../src/services/backoffice-staff-access.js';
import {monthlyInventorySnapshotPeriod} from '../src/services/monthly-inventory-snapshot-period.js';
import {monthlyInventoryCaptureRuntimeManifest} from '../src/services/monthly-inventory-capture-schema.js';
const forbidden=()=>assert.fail('status read entered writer, personal manager, capture, DDL or worker');
const actor=()=>({id:'staff',companyId:'company',role:'EMPLOYEE',tokenType:'BACKOFFICE_USER',staffAccess:true,sessionId:'session',sessionVersion:0});

test('native delegated monthly status binds current generation, redacts authority and refuses stale grant/module/schema without writes',async()=>{
 let capabilities=['monthly-inventory.read'],active=true,withdraw=false,disable=false,schemaAvailable=true,profile=true,rows=[],reads=0,account=true,generation='0',changeGeneration=false,maintenance=false;
 const hash=createHash('sha256').update(JSON.stringify(monthlyInventoryCaptureRuntimeManifest())).digest('hex');
 const db={company:{findUnique:async()=>({id:'company',active:true,licenseStatus:'ACTIVE',modules:[{moduleKey:'INVENTORY',active}]})},$transaction:forbidden,$executeRaw:forbidden,$executeRawUnsafe:forbidden,$queryRawUnsafe:forbidden,
  $queryRaw:async(strings,...values)=>{
   const sql=strings.join('?');
   if(sql.includes('FROM "BackofficeStaffAccount" a'))return account?[{mustChangePassword:false}]:[];
   if(sql.includes('FROM "BackofficeStaffGrant" g'))return values[1]==='company'&&values[2]==='store'?[{profile:'AUDITOR',capabilities}]:[];
   if(sql.includes('FROM "StorePaidModule"'))return [];
   assert.doesNotMatch(sql,/FOR UPDATE|FOR SHARE|INSERT |UPDATE |DELETE |CREATE |ALTER /);assert.deepEqual(values,['company','store']);
   if(sql.includes('FROM "StoreLifecycleFence" WHERE'))return [{planHash:profile?hash:'wrong',maintenance,retired:false,operationId:null,generation}];
   assert.match(sql,/JOIN "Store" s ON s\."id"=g\."storeId" AND s\."companyId"=g\."companyId"/);assert.match(sql,/f\."companyId"=g\."companyId" AND f\."generation"=g\."lifecycleGeneration"/);assert.match(sql,/g\."purpose"='MONTHLY_INVENTORY_CAPTURE'/);assert.match(sql,/s\."active"=true LIMIT 2/);assert.doesNotMatch(sql,/g\.\*|delegator|activationId|sessionVersion|revision/);
   reads++;if(changeGeneration)generation='1';if(withdraw)capabilities=[];if(disable)active=false;return rows;
  }
 };
 // Evaluate the actual service with the separately tested native schema validator
 // represented by its available/unavailable contract. The PG suite uses it intact.
 const source=await readFile(new URL('../src/services/monthly-inventory-capture-status.js',import.meta.url),'utf8');
 const readStatus=new Function('requireStaffGrant','staffError','validateMonthlyInventoryCaptureSchema','monthlyInventoryCaptureRuntimeManifest','createHash','monthlyInventorySnapshotPeriod',source.replace(/^import .*;\s*$/gm,'').replace(/^export /gm,'')+'\nreturn readMonthlyInventoryCaptureStatus;')(requireStaffGrant,staffError,async()=>({available:schemaAvailable,lifecycleGuardsInstalled:schemaAvailable}),monthlyInventoryCaptureRuntimeManifest,createHash,monthlyInventorySnapshotPeriod);
 const routerSource=await readFile(new URL('../src/routes/monthly-inventory-capture.js',import.meta.url),'utf8');
 const makeRouter=new Function('Router','readMonthlyInventoryCaptureStatus','createMonthlyInventoryCaptureGrantManager','createMonthlyPersonalCaptureNowService',routerSource.replace(/^import .*;\s*$/gm,'').replace(/^export /gm,'')+'\nreturn createMonthlyInventoryCaptureRouter;')(express.Router,readStatus,()=>new Proxy({},{get:()=>forbidden}),()=>new Proxy({},{get:()=>forbidden}));
 const app=express();app.use(express.json());app.use(async(req,res,next)=>{req.user=actor();try{await enforceBackofficeStaff(db,req,res);next()}catch(error){next(error)}});app.use('/api/monthly-inventory-capture',makeRouter(db));app.use((error,_req,res,_next)=>res.status(error.status||500).json({code:error.code||'ERROR'}));
 const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s))});
 const request=async(suffix='/status?storeId=store',{method='GET',header='store',body}={})=>{const response=await fetch(`http://127.0.0.1:${server.address().port}/api/monthly-inventory-capture${suffix}`,{method,headers:{'x-backoffice-store-id':header,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:response.status,body:await response.json(),headers:response.headers}};
 try{
  const empty=await request();assert.equal(empty.status,200);assert.deepEqual(empty.body,{companyId:'company',storeId:'store',readOnly:true,status:'STATE',grant:null});assert.match(empty.headers.get('cache-control'),/no-store/);
  rows=[{active:true,firstIssueMonth:'2026-11',firstScheduledFor:new Date('2026-12-01T05:00:00Z'),grantedAt:'2026-11-18T12:00:00Z',revokedAt:null,id:'PRIVATE-ID',activationId:'PRIVATE-ACTIVATION',revision:'SECRET',delegatorUserId:'PRIVATE-USER'}];
  const state=await request();assert.equal(state.status,200);assert.deepEqual(state.body.grant,{active:true,firstIssueMonth:'2026-11',firstScheduledFor:'2026-12-01T05:00:00.000Z',grantedAt:'2026-11-18T12:00:00.000Z',revokedAt:null});assert.doesNotMatch(JSON.stringify(state.body),/PRIVATE|SECRET|generation|revision|activation/);
  const before=reads;
  for(const [path,options]of [['/status',{}],['/status?storeId=foreign',{}],['/status?storeId=foreign',{header:'foreign'}],['/status?storeId=store',{header:''}],['/status?storeId=store&companyId=foreign',{}],['/status?storeId=store&storeId=foreign',{}],['/status?storeId=store',{method:'POST',body:{storeId:'store'}}],['?storeId=store',{}],['/capture-now?storeId=store',{}],...['create-inactive','enable','revoke','capture-now'].map(action=>['/'+action,{method:'POST',body:{storeId:'store',lifecycleGeneration:'0'}}])])assert.equal((await request(path,options)).status,403,path);
  assert.equal(reads,before);capabilities=['inventory.read'];assert.equal((await request()).status,403);capabilities=['monthly-inventory.read'];active=false;assert.equal((await request()).status,403);active=true;
  schemaAvailable=false;assert.equal((await request()).status,503);schemaAvailable=true;profile=false;assert.equal((await request()).status,503);profile=true;assert.equal(reads,before);
  rows=[...rows,...rows];assert.equal((await request()).status,503);rows=rows.slice(0,1);rows[0].firstScheduledFor='invalid';assert.equal((await request()).status,503);rows[0].firstScheduledFor='2026-12-01T05:00:00.000Z';
  changeGeneration=true;assert.equal((await request()).status,503);changeGeneration=false;generation='0';maintenance=true;assert.equal((await request()).status,503);maintenance=false;
  for(const corrupt of [{active:true,firstIssueMonth:null},{revokedAt:'2026-11-01T00:00:00.000Z'},{firstScheduledFor:'2026-12-02T05:00:00.000Z'}]){const valid=rows[0];rows=[{...valid,...corrupt}];assert.equal((await request()).status,503);rows=[valid]}
  disable=true;const moduleLost=await request();assert.equal(moduleLost.status,403);assert.equal(Object.hasOwn(moduleLost.body,'grant'),false);disable=false;active=true;
  withdraw=true;const revoked=await request();assert.equal(revoked.status,403);assert.equal(Object.hasOwn(revoked.body,'grant'),false);withdraw=false;const after=reads;assert.equal((await request()).status,403);assert.equal(reads,after);
  capabilities=['monthly-inventory.read'];account=false;assert.equal((await request()).status,401);
 }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve))}
});

test('ordinary employee fails native monthly personal authorization before any lock or writer',async()=>{
 const source=await readFile(new URL('../src/services/monthly-inventory-capture-authorization.js',import.meta.url),'utf8');
 const names=['authorizeMonthlyCaptureGrantManagementInTransaction','authorizeMonthlyPersonalCaptureNowLookupInTransaction','authorizeMonthlyPersonalCaptureNowSourceInTransaction','authorizeMonthlyPersonalCaptureNowWriteInTransaction'];
 const runtime=new Function('createHash','timingSafeEqual','readCurrentMonthlyCaptureActivation','companyModuleState','isCurrentlyActive','monthlyInventorySnapshotPeriod','validateMonthlyInventoryCaptureSchema','monthlyInventoryCaptureRuntimeManifest',source.replace(/^import .*;\s*$/gm,'').replace(/^export /gm,'')+'\nreturn {'+names.join(',')+'};')(createHash,forbidden,forbidden,forbidden,forbidden,forbidden,async()=>({available:true,lifecycleGuardsInstalled:true}),monthlyInventoryCaptureRuntimeManifest);
 for(const name of names){
  let reads=0;const tx={$executeRawUnsafe:forbidden,$queryRawUnsafe:async sql=>{reads++;if(sql.includes('current_setting'))return [{readOnly:name.includes('Source')?'on':'off',isolation:name.includes('Source')?'repeatable read':'read committed',transactionStartedAt:'2026-11-18T12:00:00.000Z',readAt:'2026-11-18T12:00:00.000Z'}];assert.match(sql,/FROM "User"/);return [{id:'staff',companyId:'company',role:'EMPLOYEE',sessionVersion:0,mustChangePassword:false}]}};
  await assert.rejects(runtime[name](tx,actor(),name.includes('Management')?{companyId:'company',storeId:'store'}:{storeId:'store',...(name.includes('Write')||name.includes('Source')?{lifecycleGeneration:'0',expectedIssueMonth:'2026-10'}:{})}),{code:'MONTHLY_CAPTURE_AUTHORITY_DENIED'});assert.equal(reads,2);
 }
});
