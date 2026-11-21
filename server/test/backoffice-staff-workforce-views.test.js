import test from 'node:test';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import express from 'express';
import {z} from 'zod';
import {enforceBackofficeStaff,requireStaffGrant,staffError} from '../src/services/backoffice-staff-access.js';
import {staffRequestCapability} from '../../shared/backoffice-staff.mjs';

const base='/api/platform/store-modules/companies';
const project=(value,select)=>Array.isArray(value)?value.map(row=>project(row,select)):Object.fromEntries(Object.entries(select).filter(([,enabled])=>enabled).map(([key,selection])=>[key,selection===true?value[key]:value[key]==null?value[key]:project(value[key],selection.select)]));
for(const [path,capability,packageKey,query] of [['schedules','schedule.read','PERSONNEL_BASIC',''],['attendance','attendance.read','PERSONNEL_PRO','?date=2026-11-17'],['leaves','leaves.read','PERSONNEL_BASIC','']]){
 test(`native ${path} delegated view is scoped, read only, live revoked and excludes payroll`,async()=>{
  let capabilities=[capability],paid=packageKey,revoke=false,reads=0,leaveWrites=0,leaveAudits=0,attendanceWrites=0,payrollLocked=false,scheduleWrites=0,scheduleBlocked=true;
  const createdLeaves=new Map();
  const forbidden=()=>assert.fail('delegated view attempted write, personnel bootstrap or remuneration query');
  const employee={id:'employee',fullName:'Synthetic Employee',companyId:'company',baseStoreId:'store',paymentType:'HOURLY',pinHash:'secret',dailyRate:100};
  const template={id:'template',name:'Morning',startTime:'08:00',endTime:'16:00',category:'MORNING',minimumPeople:1,maximumPeople:2,requiredRole:{id:'role',name:'Cashier'}};
  const assignment={id:'assignment',date:new Date('2026-11-17'),employeeId:'employee',shiftTemplateId:'template',slot:1,status:'ASSIGNED',warningState:'NONE',employee,shiftTemplate:template};
  const schedule={id:'schedule',companyId:'company',storeId:'store',periodStart:new Date('2026-11-16'),periodEnd:new Date('2026-11-22'),status:'PUBLISHED',version:1,assignments:[assignment],createdByUserId:'secret',notes:'secret'};
  const attendance={id:'session',companyId:'company',storeId:'store',employeeId:'employee',scheduledAssignmentId:'assignment',startedAt:new Date('2026-11-17T08:00Z'),endedAt:new Date('2026-11-17T16:00Z'),workedMinutes:480,status:'NEEDS_REVIEW',updatedAt:new Date('2026-11-17T17:00Z'),employee,hourlyRate:100,workedAmount:800,issueJson:{secret:'private'}};
  const leave={id:'leave',companyId:'company',storeId:'store',employeeId:'employee',employee,startDate:new Date('2026-11-17'),endDate:new Date('2026-11-18'),status:'REQUESTED',leaveType:'LEAVE',requestedByUserId:'secret',approvedByUserId:'secret'};
  function selected(options,row,{scoped=true}={}){
   reads++;
   assert.ok(options.select,'must fetch an explicit safe projection');assert.equal(options.include,undefined);
   if(scoped){assert.equal(options.where.companyId,'company');assert.equal(options.where.storeId,'store');}
   for(const key of ['hourlyRate','workedAmount','paymentType','pinHash','dailyRate','notes','requestedByUserId','approvedByUserId','createdByUserId','issueJson'])assert.equal(options.select[key],undefined,key);
   if(options.select.employee)assert.deepEqual(options.select.employee.select,{id:true,fullName:true});
   if(revoke)capabilities=[];
   return [project(row,options.select)];
  }
  const db={company:{findUnique:async()=>({id:'company',active:true,licenseStatus:'ACTIVE',modules:[]})},store:{findFirst:async()=>({id:'store',companyId:'company',name:'Store'})},
   workforceSchedule:{
    findFirst:async({where,select})=>{
     assert.equal(where.companyId,'company');assert.equal(where.storeId,'store');
     if(select.id){assert.ok(where.status.in.includes('PUBLISHED'));return scheduleBlocked?{id:'published'}:null;}
     return {version:2};
    },
    create:async({data})=>{assert.equal(data.version,3);scheduleWrites++;scheduleBlocked=true;return {id:'draft',status:'DRAFT',...data};},
    findMany:async options=>{assert.equal(options.select.assignments.where.shiftTemplate.storeId,'store');assert.equal(options.select.assignments.where.shiftTemplate.companyId,'company');assert.ok(JSON.stringify(options.select.assignments.where.OR).includes('baseStoreId'));return selected(options,schedule);}},
   workforceAttendanceSession:{
    findFirst:async({where})=>where.id===attendance.id&&where.storeId==='store'&&where.companyId==='company'&&where.employee?.companyId==='company'?attendance:null,
    update:async({where,data})=>{assert.equal(where.id,attendance.id);attendanceWrites++;Object.assign(attendance,data,{updatedAt:new Date(+attendance.updatedAt+1)});return attendance;},
    findMany:async options=>{assert.equal(options.where.employee.companyId,'company');return selected(options,attendance);}},
   workforceScheduleAssignment:{findMany:async options=>{assert.deepEqual(options.where.schedule,{companyId:'company',storeId:'store'});assert.deepEqual(options.where.shiftTemplate,{companyId:'company',storeId:'store'});return selected(options,assignment,{scoped:false});}},
   workforceEmployee:{findFirst:async({where})=>{
    assert.deepEqual(where.storeAccess,{none:{active:true,storeId:{not:'store'}}});
    return where.id===employee.id&&where.baseStoreId==='store'&&where.companyId==='company'&&where.active?{id:employee.id}:null;
   },findMany:async options=>{assert.equal(options.where.companyId,'company');if(options.where.baseStoreId){
    assert.equal(options.where.baseStoreId,'store');assert.deepEqual(options.where.storeAccess,{none:{active:true,storeId:{not:'store'}}});
   }else assert.ok(JSON.stringify(options.where.OR).includes('store'));assert.deepEqual(options.select,{id:true,fullName:true});return [project(employee,options.select)];}},
   workforceLeaveRequest:{
    findUnique:async({where})=>createdLeaves.get(where.id),
    create:async({data})=>{leaveWrites++;const item={...data,status:'REQUESTED'};createdLeaves.set(item.id,item);return item;},
    findMany:async options=>{assert.equal(options.where.employee.companyId,'company');assert.ok(JSON.stringify(options.where.employee.OR).includes('store'));return selected(options,leave);}},
   workforcePayrollPeriod:{findFirst:async({where})=>{assert.equal(where.status,'CLOSED');assert.equal(where.storeId,'store');return payrollLocked?{id:'locked'}:null;}},
   workforceHourlyRate:{findMany:forbidden},$transaction:async callback=>{assert.ok(capabilities.some(right=>['schedule.create','leaves.create','attendance.correct','attendance.approve-review','attendance.approve-overtime'].includes(right)));return callback(db);},$executeRaw:forbidden,$executeRawUnsafe:forbidden,$queryRawUnsafe:async sql=>{assert.match(sql,/StoreLifecycleFence/);return [{schema:"test",fence:null}];},
   $queryRaw:async(strings,...values)=>{const sql=strings.join('?');if(sql.includes('FOR UPDATE')&&sql.includes('WorkforceAttendanceSession'))return [];if(sql.includes('pg_advisory_xact_lock'))return [{locked:1}];if(sql.includes('FROM "BackofficeStaffAccount" a'))return [{mustChangePassword:false}];if(sql.includes('FROM "BackofficeStaffGrant" g'))return values[2]==='store'?[{profile:'AUDITOR',capabilities}]:[];if(sql.includes('FROM "StorePaidModule"'))return paid?[{moduleKey:paid,active:true}]:[];assert.fail(sql);}
  };
  const accessSource=await readFile(new URL('../src/routes/workforce-v2-access.js',import.meta.url),'utf8');
  const access=new Function('prisma','requireStaffGrant','staffError','staffRequestCapability','PERSONNEL_BASIC','isSuperAdmin','requirePersonnelPackage','storePaidModuleState','storePaidModuleStates','serializeWorkforceRule',accessSource.replace(/^import .*;\s*$/gm,'').replace(/^export \{.*\};?$/gm,'').replace(/^export /gm,'')+'\nreturn {managementGuard,contextFor};')(db,requireStaffGrant,staffError,staffRequestCapability,'PERSONNEL_BASIC',()=>false,forbidden,forbidden,forbidden,forbidden);
  const source=await readFile(new URL(`../src/routes/platform-workforce-v2-${path}.js`,import.meta.url),'utf8');
  const router=new Function('createHash','Router','z','prisma','contextFor','requireStaffGrant','audit','loadEmployee','confirmed',source.replace(/^import .*;\s*$/gm,'').replace('export default router;','return router;').replace(/^export /gm,''))(createHash,express.Router,z,db,access.contextFor,requireStaffGrant,async()=>{leaveAudits++;},forbidden,z.literal(true));
  const app=express();app.use(express.json());app.use(async(req,res,next)=>{req.user={id:'staff',companyId:'company',role:'EMPLOYEE',tokenType:'BACKOFFICE_USER',staffAccess:true,sessionId:'session',sessionVersion:0};try{await enforceBackofficeStaff(db,req,res);next();}catch(error){next(error);}});
  app.use(`${base}/:companyId/stores/:storeId/workforce-v2/${path}`,access.managementGuard,router);
  app.use((error,_req,res,_next)=>res.status(error.status||500).json({code:error.code,error:error.message}));
  const server=await new Promise(resolve=>{const handle=app.listen(0,'127.0.0.1',()=>resolve(handle));});
  const request=async({company='company',store='store',header=store,suffix='',method='GET',search=query,body}={})=>{const response=await fetch(`http://127.0.0.1:${server.address().port}${base}/${company}/stores/${store}/workforce-v2/${path}${suffix}${search}`,{method,headers:{'x-backoffice-store-id':header,...(body?{'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});return {status:response.status,body:await response.json()};};
  try{
   const success=await request();assert.equal(success.status,200,JSON.stringify(success.body));assert.equal(success.body.companyId,'company');assert.equal(success.body.storeId,'store');assert.equal(success.body.items.length,1);if(path==='attendance')assert.equal(success.body.canApprove,false);
   const json=JSON.stringify(success.body);for(const secret of ['pinHash','paymentType','hourlyRate','workedAmount','createdByUserId','requestedByUserId','approvedByUserId','secret'])assert.equal(json.includes(secret),false,secret);
   const before=reads;for(const input of [{store:'sibling'},{company:'foreign'},{store:'sibling',header:'store'},{method:'POST'},{suffix:'/id/validation'},{suffix:'/clock',method:'POST'},{suffix:'/id/decision',method:'POST'}])assert.equal((await request(input)).status,403,JSON.stringify(input));assert.equal(reads,before);
   capabilities=['employees.read'];assert.equal((await request()).status,403);capabilities=[capability];paid=null;assert.equal((await request()).status,403);
   paid='PERSONNEL_BASIC';assert.equal((await request()).status,path==='attendance'?403:200);paid='PERSONNEL_PRO';assert.equal((await request()).status,200);paid='PERSONNEL_AI';assert.equal((await request()).status,200);
   if(path==='schedules'){
    const input={method:'POST',body:{periodStart:'2026-11-17',periodType:'WEEK',confirmed:true,reason:'Synthetic draft'}};
    assert.equal((await request(input)).status,403);
    capabilities=['schedule.read','schedule.create'];
    assert.equal((await request({...input,store:'sibling'})).status,403);
    assert.equal((await request(input)).status,409);
    scheduleBlocked=false;
    const created=await request(input);
    assert.equal(created.status,201,JSON.stringify(created.body));
    assert.deepEqual(created.body,{item:{companyId:'company',storeId:'store',id:'draft',status:'DRAFT'},copiedFromPublished:false});
    assert.equal((await request(input)).status,409);
    assert.equal(scheduleWrites,1);
    capabilities=['schedule.read'];
   }
   if(path==='attendance'){
    const input={suffix:'/session/correct-hours',method:'POST',body:{confirmed:true,reason:'Synthetic correction',workedMinutes:420,expectedUpdatedAt:attendance.updatedAt.toISOString()}};
    assert.equal((await request(input)).status,403);
    capabilities=['attendance.read','attendance.correct'];
    assert.equal((await request({...input,store:'sibling'})).status,403);
    assert.equal((await request({...input,suffix:'/foreign/correct-hours'})).status,404);
    assert.equal((await request({...input,suffix:'/session/approve-review'})).status,403);
    payrollLocked=true;assert.equal((await request(input)).status,409);payrollLocked=false;
    const corrected=await request(input);
    assert.equal(corrected.status,200,JSON.stringify(corrected.body));
    assert.deepEqual(corrected.body,{item:{id:'session',companyId:'company',storeId:'store',status:'NEEDS_REVIEW'}});
    assert.equal((await request(input)).status,409);
    capabilities=['attendance.read','attendance.approve-review'];
    const approved=await request({...input,suffix:'/session/approve-review',body:{...input.body,expectedUpdatedAt:attendance.updatedAt.toISOString()}});
    assert.equal(approved.body.item?.status,'APPROVED',JSON.stringify(approved.body));
    Object.assign(attendance,{status:'NEEDS_APPROVAL',workedMinutes:540,updatedAt:new Date(+attendance.updatedAt+1)});
    const overtime={...input,suffix:'/session/approve-over-8-hours',body:{...input.body,expectedUpdatedAt:attendance.updatedAt.toISOString()}};
    assert.equal((await request(overtime)).status,403);
    capabilities=['attendance.read','attendance.approve-overtime'];
    assert.equal((await request(overtime)).body.item?.status,'APPROVED');
    assert.equal(attendanceWrites,3);
    capabilities=['attendance.read'];
   }
   if(path==='leaves'){
    const input={method:'POST',body:{requestId:'3e83bf24-fc29-4248-96f0-60049a12391d',employeeId:'employee',storeId:'store',startDate:'2026-11-17',endDate:'2026-11-18',leaveType:'LEAVE',confirmed:true,reason:'Synthetic test request'}};
    assert.equal((await request(input)).status,403);
    assert.equal((await request({suffix:'/eligible-employees'})).status,403);
    capabilities=['leaves.read','leaves.create'];
    const eligible=await request({suffix:'/eligible-employees'});
    assert.deepEqual(eligible.body,{companyId:'company',storeId:'store',items:[{id:'employee',fullName:'Synthetic Employee'}]});
    assert.equal((await request({...input,body:{...input.body,storeId:'sibling'}})).status,403);
    assert.equal((await request({...input,body:{...input.body,employeeId:'sibling-employee'}})).status,404);
    const created=await request(input);
    assert.equal(created.status,201,JSON.stringify(created.body));
    assert.equal(created.body.item.status,'REQUESTED');
    assert.deepEqual((await request(input)).body,created.body);
    assert.equal((await request({...input,body:{...input.body,leaveType:'DAY_OFF'}})).status,409);
    assert.equal(leaveWrites,1);assert.equal(leaveAudits,1);
    capabilities=['leaves.read'];
    assert.equal((await request(input)).status,403);
   }
   revoke=true;assert.equal((await request()).status,403);revoke=false;assert.equal((await request()).status,403);
  }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
 });
}

test('workforce leave decisions require the matching scoped grant',async()=>{
 const source=await readFile(new URL('../src/routes/workforce-v2-access.js',import.meta.url),'utf8');
 const managementGuard=new Function('staffRequestCapability',source.slice(source.indexOf('export function managementGuard'),source.indexOf('export function cleanText')).replace('export function','function')+'\nreturn managementGuard;')(staffRequestCapability);
 const decisions=[['APPROVED','leaves.approve'],['REJECTED','leaves.reject'],['CANCELLED','leaves.cancel']];
 const request={method:'POST',originalUrl:base+'/company/stores/store/workforce-v2/leaves/leave/decision',
  user:{staffAccess:true,companyId:'company',storeId:'store'},params:{companyId:'company',storeId:'store'}};
 const result=(status,capability,params=request.params)=>managementGuard({...request,body:{status},staffGrant:{capability},params},
  {status:code=>({json:()=>code})},()=>200);
 for(const [status,capability] of decisions){
  assert.equal(result(status,capability),200);
  assert.equal(result(status,'leaves.read'),403);
  for(const [,other] of decisions.filter(([,right])=>right!==capability))assert.equal(result(status,other),403);
  assert.equal(result(status,capability,{companyId:'company',storeId:'other'}),403);
  assert.equal(result(status,capability,{companyId:'other',storeId:'store'}),403);
 }
 assert.equal(result(undefined,'leaves.approve'),403);
});
