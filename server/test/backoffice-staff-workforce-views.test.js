import test from 'node:test';
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
  let capabilities=[capability],paid=packageKey,revoke=false,reads=0;
  const forbidden=()=>assert.fail('delegated view attempted write, personnel bootstrap or remuneration query');
  const employee={id:'employee',fullName:'Synthetic Employee',companyId:'company',baseStoreId:'store',paymentType:'HOURLY',pinHash:'secret',dailyRate:100};
  const template={id:'template',name:'Morning',startTime:'08:00',endTime:'16:00',category:'MORNING',minimumPeople:1,maximumPeople:2,requiredRole:{id:'role',name:'Cashier'}};
  const assignment={id:'assignment',date:new Date('2026-11-17'),employeeId:'employee',shiftTemplateId:'template',slot:1,status:'ASSIGNED',warningState:'NONE',employee,shiftTemplate:template};
  const schedule={id:'schedule',companyId:'company',storeId:'store',periodStart:new Date('2026-11-16'),periodEnd:new Date('2026-11-22'),status:'PUBLISHED',version:1,assignments:[assignment],createdByUserId:'secret',notes:'secret'};
  const attendance={id:'session',companyId:'company',storeId:'store',employeeId:'employee',scheduledAssignmentId:'assignment',startedAt:new Date('2026-11-17T08:00Z'),endedAt:new Date('2026-11-17T16:00Z'),workedMinutes:480,status:'CLOSED',employee,hourlyRate:100,workedAmount:800,issueJson:{secret:'private'}};
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
   workforceSchedule:{findMany:async options=>{assert.equal(options.select.assignments.where.shiftTemplate.storeId,'store');assert.equal(options.select.assignments.where.shiftTemplate.companyId,'company');assert.ok(JSON.stringify(options.select.assignments.where.OR).includes('baseStoreId'));return selected(options,schedule);}},
   workforceAttendanceSession:{findMany:async options=>{assert.equal(options.where.employee.companyId,'company');return selected(options,attendance);}},
   workforceScheduleAssignment:{findMany:async options=>{assert.deepEqual(options.where.schedule,{companyId:'company',storeId:'store'});assert.deepEqual(options.where.shiftTemplate,{companyId:'company',storeId:'store'});return selected(options,assignment,{scoped:false});}},
   workforceEmployee:{findMany:async options=>{assert.equal(options.where.companyId,'company');assert.ok(JSON.stringify(options.where.OR).includes('store'));assert.deepEqual(options.select,{id:true,fullName:true});return [project(employee,options.select)];}},
   workforceLeaveRequest:{findMany:async options=>{assert.equal(options.where.employee.companyId,'company');assert.ok(JSON.stringify(options.where.employee.OR).includes('store'));return selected(options,leave);}},
   workforceHourlyRate:{findMany:forbidden},$transaction:forbidden,$executeRaw:forbidden,$executeRawUnsafe:forbidden,
   $queryRaw:async(strings,...values)=>{const sql=strings.join('?');if(sql.includes('FROM "BackofficeStaffAccount" a'))return [{mustChangePassword:false}];if(sql.includes('FROM "BackofficeStaffGrant" g'))return values[2]==='store'?[{profile:'AUDITOR',capabilities}]:[];if(sql.includes('FROM "StorePaidModule"'))return paid?[{moduleKey:paid,active:true}]:[];assert.fail(sql);}
  };
  const accessSource=await readFile(new URL('../src/routes/workforce-v2-access.js',import.meta.url),'utf8');
  const access=new Function('prisma','requireStaffGrant','staffError','staffRequestCapability','PERSONNEL_BASIC','isSuperAdmin','requirePersonnelPackage','storePaidModuleState','storePaidModuleStates','serializeWorkforceRule',accessSource.replace(/^import .*;\s*$/gm,'').replace(/^export \{.*\};?$/gm,'').replace(/^export /gm,'')+'\nreturn {managementGuard,contextFor};')(db,requireStaffGrant,staffError,staffRequestCapability,'PERSONNEL_BASIC',()=>false,forbidden,forbidden,forbidden,forbidden);
  const source=await readFile(new URL(`../src/routes/platform-workforce-v2-${path}.js`,import.meta.url),'utf8');
  const router=new Function('Router','z','prisma','contextFor','requireStaffGrant','audit','loadEmployee','confirmed',source.replace(/^import .*;\s*$/gm,'').replace('export default router;','return router;'))(express.Router,z,db,access.contextFor,requireStaffGrant,forbidden,forbidden,z.literal(true));
  const app=express();app.use(async(req,res,next)=>{req.user={id:'staff',companyId:'company',role:'EMPLOYEE',tokenType:'BACKOFFICE_USER',staffAccess:true,sessionId:'session',sessionVersion:0};try{await enforceBackofficeStaff(db,req,res);next();}catch(error){next(error);}});
  app.use(`${base}/:companyId/stores/:storeId/workforce-v2/${path}`,access.managementGuard,router);
  app.use((error,_req,res,_next)=>res.status(error.status||500).json({code:error.code,error:error.message}));
  const server=await new Promise(resolve=>{const handle=app.listen(0,'127.0.0.1',()=>resolve(handle));});
  const request=async({company='company',store='store',header=store,suffix='',method='GET',search=query}={})=>{const response=await fetch(`http://127.0.0.1:${server.address().port}${base}/${company}/stores/${store}/workforce-v2/${path}${suffix}${search}`,{method,headers:{'x-backoffice-store-id':header}});return {status:response.status,body:await response.json()};};
  try{
   const success=await request();assert.equal(success.status,200,JSON.stringify(success.body));assert.equal(success.body.companyId,'company');assert.equal(success.body.storeId,'store');assert.equal(success.body.items.length,1);if(path==='attendance')assert.equal(success.body.canApprove,false);
   const json=JSON.stringify(success.body);for(const secret of ['pinHash','paymentType','hourlyRate','workedAmount','createdByUserId','requestedByUserId','approvedByUserId','secret'])assert.equal(json.includes(secret),false,secret);
   const before=reads;for(const input of [{store:'sibling'},{company:'foreign'},{store:'sibling',header:'store'},{method:'POST'},{suffix:'/id/validation'},{suffix:'/clock',method:'POST'},{suffix:'/id/decision',method:'POST'}])assert.equal((await request(input)).status,403,JSON.stringify(input));assert.equal(reads,before);
   capabilities=['employees.read'];assert.equal((await request()).status,403);capabilities=[capability];paid=null;assert.equal((await request()).status,403);
   paid='PERSONNEL_BASIC';assert.equal((await request()).status,path==='attendance'?403:200);paid='PERSONNEL_PRO';assert.equal((await request()).status,200);paid='PERSONNEL_AI';assert.equal((await request()).status,200);
   revoke=true;assert.equal((await request()).status,403);revoke=false;assert.equal((await request()).status,403);
  }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
 });
}
