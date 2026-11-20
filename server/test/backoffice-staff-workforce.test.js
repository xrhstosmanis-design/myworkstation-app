import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import express from 'express';
import jwt from 'jsonwebtoken';
import {enforceBackofficeStaff} from '../src/services/backoffice-staff-access.js';
import {readStaffWorkforceView} from '../src/services/backoffice-staff-workforce.js';
import {assertCustomerDemoRuntimeClosed} from '../src/customer-demo-runtime.js';
import {PERSONNEL_BASIC,PERSONNEL_PRO} from '../src/personnel-packages.js';
const base='/api/platform/store-modules/companies/company/stores/store/workforce-v2',date='2026-11-18T10:00:00.000Z';
const caps=['workforce-roles.read','workforce-rules.read','shift-templates.read','workforce-audit.read'];
const forbidden=()=>assert.fail('read invoked a writer, transaction, bootstrap or generic platform middleware');
const staff={id:'staff',companyId:'company',role:'EMPLOYEE',tokenType:'BACKOFFICE_USER',staffAccess:true,sessionId:'session',sessionVersion:1};
async function mounted(){
 const state={capabilities:[...caps],basic:true,pro:true,license:true,accountRevision:1,grantRevision:1,afterRead:null,dataReads:0,role:'EMPLOYEE',valueJson:{days:2,privateToken:'PRIVATE'},ruleType:'MIN_DAYS_OFF',badRole:false};
 const db={company:{findUnique:async()=>({id:'company',active:true,licenseStatus:state.license?'ACTIVE':'SUSPENDED',modules:[]})},userSession:{findUnique:async()=>({id:'session',expiresAt:new Date(Date.now()+60000),lastSeenAt:new Date(),revokedAt:null,user:{role:state.role,companyId:'company',sessionVersion:1,mustChangePassword:false,company:{active:true}}}),update:forbidden},$executeRaw:forbidden,$executeRawUnsafe:forbidden,$queryRawUnsafe:forbidden,$transaction:forbidden};
 db.$queryRaw=async(strings,...values)=>{
  const sql=strings.join('?');
  assert.doesNotMatch(sql,/\b(?:INSERT|UPDATE|DELETE|CREATE|ALTER|LOCK TABLE)\b/);
  if(sql.includes('FROM "BackofficeStaffAccount" a'))return[{mustChangePassword:false,revision:state.accountRevision}];
  if(sql.includes('FROM "BackofficeStaffGrant" g'))return values[0]==='staff'&&values[1]==='company'&&values[2]==='store'?[{profile:'AUDITOR',capabilities:state.capabilities,revision:state.grantRevision}]:[];
  if(sql.includes('FROM "StorePaidModule"'))return [{moduleKey:PERSONNEL_BASIC,active:state.basic,startsAt:null,endsAt:null},{moduleKey:PERSONNEL_PRO,active:state.pro,startsAt:null,endsAt:null}];
  assert.ok(values.includes('company'));assert.ok(values.includes('store'));state.dataReads++;
  let rows;
  if(sql.includes('FROM "WorkforceRole" r')){assert.match(sql,/e\."companyId"=r\."companyId"/);assert.match(sql,/t\."storeId"=\?/);assert.match(sql,/v\."active"=true/);rows=[{id:'role',companyId:'company',name:'Store referenced',code:'CASHIER',description:null,active:true,employeeCount:1,shiftTemplateCount:2,createdAt:date,updatedAt:date,privateJson:'PRIVATE'}]}
  else if(sql.includes('FROM "WorkforceEmployeeRule" r')){assert.match(sql,/related\."companyId"=e\."companyId"/);assert.match(sql,/related\."baseStoreId"=\?/);rows=[{id:'rule',employeeId:'employee',employeeName:'Visible employee',ruleType:state.ruleType,severity:'ERROR',relatedEmployeeId:null,relatedEmployeeName:null,valueJson:state.valueJson,note:'Visible note',active:true,validFrom:null,validTo:null,createdAt:date,updatedAt:date}]}
  else if(sql.includes('FROM "WorkforceShiftTemplate" t')){assert.match(sql,/s\."companyId"=t\."companyId" AND s\."storeId"=t\."storeId"/);assert.match(sql,/role\."companyId"=t\."companyId"/);rows=[{id:'template',companyId:'company',storeId:'store',name:'Morning',code:'AM',category:'MORNING',startTime:'07:00',endTime:'15:00',minimumPeople:1,maximumPeople:2,requiredRoleId:state.badRole?null:'role',requiredRoleUnavailable:state.badRole,roleName:state.badRole?null:'Store referenced',roleCode:state.badRole?null:'CASHIER',roleActive:state.badRole?null:true,requiresSupervisor:false,changeAllowed:true,active:true,assignmentCount:3,createdAt:date,updatedAt:date}]}
  else {assert.match(sql,/FROM "WorkforceAuditLog" a/);assert.match(sql,/CASE WHEN jsonb_typeof\(a\."beforeJson"\)='object'/);assert.match(sql,/CASE WHEN jsonb_typeof\(a\."afterJson"\)='object'/);assert.match(sql,/\|\|/);assert.match(sql,/e\."id"=source\.value->>'employeeId'/);assert.match(sql,/t\."id"=source\.value->>'shiftTemplateId'/);assert.doesNotMatch(sql,/COALESCE\(a\."afterJson"->>/);assert.match(sql,/e\."companyId"=a\."companyId"/);assert.match(sql,/t\."storeId"=a\."storeId"/);assert.doesNotMatch(sql,/SELECT a\.\*/);rows=[{id:'audit',action:'WORKFORCE_UPDATED',entityType:'WORKFORCE_EMPLOYEE',createdAt:date,actorName:'Own actor',storeName:'Selected',employeeName:null,date:'PRIVATE_TOKEN',shift:null,ruleCode:'PRIVATE_TOKEN',reason:'Native displayed reason',beforeJson:{salary:'PRIVATE'},ipAddress:'PRIVATE'}]}
  if(state.afterRead)state.afterRead();return rows;
 };
 const source=await readFile(new URL('../src/middleware/auth.js',import.meta.url),'utf8');
 const auth=new Function('prisma','jwt','assertCustomerDemoRuntimeClosed','enforceBackofficeStaff',source.slice(source.indexOf('export async function auth(')).replace('export async function auth','async function auth')+';return auth;')(db,jwt,assertCustomerDemoRuntimeClosed,enforceBackofficeStaff);
 const app=express();app.use(express.json());
 const index=await readFile(new URL('../src/index.js',import.meta.url),'utf8'),start=index.indexOf('// Exact delegated workforce settings'),end=index.indexOf('app.use("/api/platform",auth,platformAuditCapture)',start);assert.ok(start>0&&end>start);
 new Function('app','auth','readStaffWorkforceView','prisma',index.slice(start,end))(app,auth,readStaffWorkforceView,db);
 app.use('/api/platform',auth);
 let ownerPass=0;app.use((req,res)=>{if(req.user?.staffAccess)forbidden();ownerPass++;res.json({nativeOwner:true})});app.use((error,_req,res,_next)=>res.status(error.status||500).json({code:error.code}));
 const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
 return {state,get ownerPass(){return ownerPass},async get(view,{path=base,header='store',method='GET',owner=false,token}={}){state.role=owner?'OWNER':'EMPLOYEE';const payload=owner?{...staff,staffAccess:undefined,role:'OWNER'}:staff;const response=await fetch(`http://127.0.0.1:${server.address().port}${path}/${view}`,{method,headers:{authorization:'Bearer '+(token||jwt.sign(payload,process.env.JWT_SECRET)), 'x-backoffice-store-id':header}});return {status:response.status,body:await response.json()}},async close(){server.closeAllConnections();await new Promise(resolve=>server.close(resolve))}};
}
const original=process.env.JWT_SECRET;
test.before(()=>{process.env.JWT_SECRET='isolated-workforce-exact-auth-test-secret'});test.after(()=>{if(original===undefined)delete process.env.JWT_SECRET;else process.env.JWT_SECRET=original});

test('mounted real JWT auth and actual early index bridge return only four scoped workforce DTOs without bootstrap',async()=>{const f=await mounted();try{for(const view of ['roles','rules','shift-templates','audit']){const r=await f.get(view);assert.equal(r.status,200,JSON.stringify(r.body));assert.equal(r.body.companyId,'company');assert.equal(r.body.storeId,'store');assert.equal(r.body.scope,'STORE');assert.equal(r.body.readOnly,true);assert.equal(r.body.count,1);assert.ok(!JSON.stringify(r.body).includes('PRIVATE'));}assert.equal(f.state.dataReads,4);assert.deepEqual((await f.get('rules')).body.items[0].value,{days:2});f.state.badRole=true;const t=(await f.get('shift-templates')).body.items[0];assert.equal(t.requiredRoleUnavailable,true);assert.equal(t.requiredRoleId,null);assert.equal(t.requiredRole,null);assert.equal((await f.get('roles',{owner:true})).body.nativeOwner,true);assert.equal(f.ownerPass,1)}finally{await f.close()}});
test('four scoped reads reject mismatched tenant/store, query, writers, bootstrap and invalid JWT before data',async()=>{const f=await mounted();try{for(const [view,options] of [['roles',{header:'other'}],['roles',{path:base.replace('/company/','/foreign/')}],['rules?employeeId=foreign',{}],['roles?page=1',{}],['bootstrap',{}],['roles',{method:'POST'}],['roles',{token:'invalid'}]]){const before=f.state.dataReads;assert.ok([401,403].includes((await f.get(view,options)).status));assert.equal(f.state.dataReads,before)}}finally{await f.close()}});
test('BASIC/PRO licensing and live grant/account revisions are rechecked after each data read',async()=>{const f=await mounted();try{f.state.pro=false;assert.equal((await f.get('rules')).status,403);assert.equal((await f.get('roles')).status,200);f.state.basic=false;assert.equal((await f.get('roles')).status,403);for(const change of [()=>f.state.capabilities=[],()=>f.state.accountRevision++,()=>f.state.grantRevision++,()=>f.state.pro=false,()=>f.state.license=false]){f.state.capabilities=[...caps];f.state.basic=true;f.state.pro=true;f.state.license=true;f.state.afterRead=change;assert.equal((await f.get('rules')).status,403)}}finally{await f.close()}});
test('typed rule values reject invalid historical numbers and discard arbitrary JSON keys',async()=>{const f=await mounted();try{for(const value of [0,7,'2',Infinity]){f.state.valueJson={days:value};assert.equal((await f.get('rules')).status,503)}f.state.valueJson={days:6,otherStoreId:'PRIVATE'};assert.deepEqual((await f.get('rules')).body.items[0].value,{days:6});f.state.ruleType='INCOMPATIBLE_EMPLOYEE';f.state.valueJson={relatedEmployeeId:'PRIVATE'};const r=(await f.get('rules')).body.items[0];assert.deepEqual(r.value,{});assert.equal(r.relatedEmployeeId,null);assert.equal(r.relatedEmployeeName,null)}finally{await f.close()}});

const isolated=()=>{try{const url=new URL(process.env.DATABASE_URL);return process.env.NODE_ENV==='test'&&['localhost','127.0.0.1','postgres'].includes(url.hostname)&&/test/i.test(url.pathname)}catch{return false}};
test('native audit projection keeps after-null clearing and object-only merge semantics',{skip:!isolated()},async()=>{
 const {PrismaClient}=await import('@prisma/client'),db=new PrismaClient();
 try{
  const source=await readFile(new URL('../src/services/backoffice-staff-workforce.js',import.meta.url),'utf8');
  const lateral=source.match(/CROSS JOIN LATERAL \(SELECT .*? AS value\) source/)[0];
  const sql=`SELECT source.value->>'employeeId' AS employee,source.value->>'shiftTemplateId' AS template,source.value->>'ruleCode' AS rule,COALESCE(NULLIF(source.value->>'date',''),source.value->>'startDate') AS date FROM (VALUES($1::jsonb,$2::jsonb)) a("beforeJson","afterJson") ${lateral}`;
  const before={employeeId:'previous',shiftTemplateId:'previous-template',ruleCode:'MIN_DAYS_OFF',date:'2026-01-01',startDate:'2026-02-01'};
  const [cleared]=await db.$queryRawUnsafe(sql,JSON.stringify(before),JSON.stringify({employeeId:null,shiftTemplateId:null,ruleCode:null,date:null}));
  assert.deepEqual(cleared,{employee:null,template:null,rule:null,date:'2026-02-01'});
  const [dateCleared]=await db.$queryRawUnsafe(sql,JSON.stringify(before),JSON.stringify({date:null,startDate:null}));assert.equal(dateCleared.date,null);
  const [arrayIgnored]=await db.$queryRawUnsafe(sql,JSON.stringify(before),JSON.stringify([{employeeId:'not-an-object'}]));assert.equal(arrayIgnored.employee,'previous');
  const [scalarIgnored]=await db.$queryRawUnsafe(sql,JSON.stringify('private scalar'),JSON.stringify({employeeId:'current'}));assert.equal(scalarIgnored.employee,'current');
 }finally{await db.$disconnect()}
});
