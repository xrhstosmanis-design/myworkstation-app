import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import express from 'express';
import {enforceBackofficeStaff,requireStaffGrant,staffError} from '../src/services/backoffice-staff-access.js';
import {staffRequestCapability} from '../../shared/backoffice-staff.mjs';
import * as payroll from '../src/workforce-v2-payroll.js';

const project=(row,select)=>Array.isArray(row)?row.map(value=>project(value,select)):Object.fromEntries(Object.entries(select).filter(([,enabled])=>enabled).map(([key,selection])=>[key,selection===true?row[key]:row[key]==null?row[key]:project(row[key],selection.select)]));
test('native payroll views require their independent live grant and both packages, safely scope evidence and never enable payment actions',async()=>{
 let capabilities=['payroll.read'],packages=['PERSONNEL_BASIC','PERSONNEL_PAYROLL'],withdraw=false,withdrawPackage=false,reads=0;
 const forbidden=()=>assert.fail('delegated payroll read attempted write, cash helper or package schema bootstrap');
 const employee={id:'employee',fullName:'Synthetic Employee',companyId:'company',baseStoreId:'store',paymentType:'HOURLY',hourlyRates:[{hourlyRate:10}],dailyRate:null,fixedMonthlyAmount:null,pinHash:'private',notes:'private',phone:'private',storeAccess:[{storeId:'sibling'}]};
 const period={id:'period',companyId:'company',storeId:'store',name:'Synthetic period',status:'DRAFT',periodStart:new Date('2026-11-01'),periodEnd:new Date('2026-12-01'),_count:{lines:1},createdByUserId:'private',lines:[{id:'line',employeeId:'employee',employee,grossAmount:80,actualMinutes:480,calculationJson:{private:true}}],payments:[{id:'payment',companyId:'company',storeId:'store',employeeId:'employee',amount:30,paymentMethod:'BANK_TRANSFER',requestKey:'private',sourceId:'private',createdByUserId:'private',note:'private'}],closing:{id:'closing',closedAt:null,reopenedAt:null,summaryJson:{private:true}}};
 const touch=()=>{reads++;if(withdraw)capabilities=[];if(withdrawPackage)packages=['PERSONNEL_BASIC'];};
 const scope=where=>{assert.equal(where.companyId,'company');assert.equal(where.storeId,'store');};
 const selected=(options,row)=>{touch();assert.ok(options.select);assert.equal(options.include,undefined);return project(row,options.select);};
 const db={company:{findUnique:async()=>({id:'company',active:true,licenseStatus:'ACTIVE',modules:[]})},store:{findFirst:async()=>({id:'store',companyId:'company',name:'Store'})},
  $transaction:forbidden,$executeRaw:forbidden,$executeRawUnsafe:forbidden,
  $queryRaw:async(strings,...values)=>{const sql=strings.join('?');if(sql.includes('FROM "BackofficeStaffAccount" a'))return [{mustChangePassword:false}];if(sql.includes('FROM "BackofficeStaffGrant" g'))return values[2]==='store'?[{profile:'AUDITOR',capabilities}]:[];if(sql.includes('FROM "StorePaidModule"'))return packages.map(moduleKey=>({moduleKey,active:true}));assert.fail(sql);},
  workforcePayrollPeriod:{findMany:async options=>{scope(options.where);assert.equal(options.select.createdByUserId,undefined);return [selected(options,period)];},findFirst:async options=>{scope(options.where);assert.equal(options.select.createdByUserId,undefined);assert.deepEqual(options.select.lines.where,{employee:{companyId:'company'}});assert.deepEqual(options.select.payments.where,{companyId:'company',storeId:'store',employee:{companyId:'company'}});for(const key of ['requestKey','sourceId','createdByUserId','note'])assert.equal(options.select.payments.select[key],undefined);assert.equal(options.select.lines.select.calculationJson,undefined);assert.equal(options.select.closing.select.summaryJson,undefined);return options.where.id==='period'?selected(options,period):null;},create:forbidden,update:forbidden},
  workforceEmployee:{findMany:async options=>{assert.equal(options.where.companyId,'company');assert.ok(JSON.stringify(options.where.OR).includes('store'));for(const key of ['pinHash','phone','notes','storeAccess'])assert.equal(options.select[key],undefined);return [selected(options,employee)];}},
  workforceAttendanceSession:{findMany:async options=>{scope(options.where);assert.deepEqual(options.where.employee,{companyId:'company'});return [selected(options,{employeeId:'employee',employee,startedAt:new Date('2026-11-17T08:00Z'),workedMinutes:480,overtimeMinutes:0})];}},
  workforceScheduleAssignment:{findMany:async options=>{assert.equal(options.where.schedule.companyId,'company');assert.equal(options.where.schedule.storeId,'store');assert.deepEqual(options.where.employeeId.in,['employee']);assert.deepEqual(options.select,{employeeId:true,shiftTemplate:{select:{startTime:true,endTime:true}}});assert.equal(options.include,undefined);touch();return [{employeeId:'employee',shiftTemplate:{startTime:'08:00',endTime:'16:00'}}];}},
  workforceAbsence:{findMany:async options=>{assert.equal(options.where.companyId,'company');assert.deepEqual(options.where.AND[0].OR,[{storeId:null},{storeId:'store'}]);assert.deepEqual(options.select,{employeeId:true,startsAt:true,endsAt:true,minutes:true});touch();return [];}},
  workforceLeaveRequest:{findMany:async options=>{assert.equal(options.where.companyId,'company');assert.deepEqual(options.where.OR,[{storeId:null},{storeId:'store'}]);assert.deepEqual(options.select,{employeeId:true,startDate:true,endDate:true,leaveType:true});touch();return [];}},
 };
 const accessSource=await readFile(new URL('../src/routes/workforce-v2-access.js',import.meta.url),'utf8');
 const access=new Function('prisma','requireStaffGrant','staffError','staffRequestCapability','PERSONNEL_BASIC','isSuperAdmin','requirePersonnelPackage','storePaidModuleState','storePaidModuleStates','serializeWorkforceRule',accessSource.replace(/^import .*;\s*$/gm,'').replace(/^export \{.*\};?$/gm,'').replace(/^export /gm,'')+'\nreturn {managementGuard,contextFor};')(db,requireStaffGrant,staffError,staffRequestCapability,'PERSONNEL_BASIC',()=>false,forbidden,forbidden,forbidden,forbidden);
 const source=await readFile(new URL('../src/routes/platform-workforce-v2-payroll.js',import.meta.url),'utf8');
 const dependencies={Router:express.Router,prisma:db,PERSONNEL_PAYROLL:'PERSONNEL_PAYROLL',requirePersonnelPackage:forbidden,...payroll,audit:forbidden,contextFor:access.contextFor,assertNoPendingRemuneration:forbidden,requireStaffGrant,staffError};
 const router=new Function(...Object.keys(dependencies),source.replace(/^import .*;\s*$/gm,'').replace('export default router;','return router;'))(...Object.values(dependencies));
 const app=express();app.use(async(req,res,next)=>{req.user={id:'staff',companyId:'company',role:'EMPLOYEE',tokenType:'BACKOFFICE_USER',staffAccess:true,sessionId:'session',sessionVersion:0};try{await enforceBackofficeStaff(db,req,res);next();}catch(error){next(error);}});
 const base='/api/platform/store-modules/companies';app.use(`${base}/:companyId/stores/:storeId/workforce-v2/payroll`,access.managementGuard,router);app.use((error,_req,res,_next)=>res.status(error.status||500).json({code:error.code,error:error.message}));
 const server=await new Promise(resolve=>{const handle=app.listen(0,'127.0.0.1',()=>resolve(handle));});
 const request=async({path='/periods',company='company',store='store',header=store,method='GET',query=''}={})=>{const response=await fetch(`http://127.0.0.1:${server.address().port}${base}/${company}/stores/${store}/workforce-v2/payroll${path}${query}`,{method,headers:{'x-backoffice-store-id':header}});return {status:response.status,body:await response.json()};};
 try{
  for(const path of ['/periods','/periods/period','/preview']){
   const query=path==='/preview'?'?from=2026-11-01&to=2026-12-01':'';
   capabilities=['payroll.read'];packages=['PERSONNEL_BASIC','PERSONNEL_PAYROLL'];
   const result=await request({path,query});assert.equal(result.status,200,JSON.stringify(result.body));assert.equal(result.body.companyId,'company');assert.equal(result.body.storeId,'store');assert.equal(JSON.stringify(result.body).includes('private'),false);assert.equal(JSON.stringify(result.body).includes('sibling'),false);
   if(path==='/periods/period'){assert.equal(result.body.lines[0].paidAmount,30);assert.equal(result.body.lines[0].balanceAmount,50);}
   if(path==='/preview'){assert.equal(result.body.entries[0].grossAmount,80);assert.equal(result.body.entries[0].plannedMinutes,480);assert.equal(result.body.totalAmount,80);}
   const before=reads;for(const input of [{company:'foreign'},{store:'sibling'},{store:'sibling',header:'store'}])assert.equal((await request({path,query,...input})).status,403);assert.equal(reads,before);
   capabilities=['employees.read','attendance.read'];assert.equal((await request({path,query})).status,403);capabilities=['payroll.read'];
   for(const paid of [[],['PERSONNEL_BASIC'],['PERSONNEL_PAYROLL'],['PERSONNEL_PRO'],['PERSONNEL_AI']]){packages=paid;assert.equal((await request({path,query})).status,403);}
   for(const basic of ['PERSONNEL_PRO','PERSONNEL_AI']){packages=[basic,'PERSONNEL_PAYROLL'];assert.equal((await request({path,query})).status,200);}
   packages=['PERSONNEL_BASIC','PERSONNEL_PAYROLL'];withdrawPackage=true;assert.equal((await request({path,query})).status,403);withdrawPackage=false;packages=['PERSONNEL_BASIC','PERSONNEL_PAYROLL'];
   withdraw=true;const denied=await request({path,query});assert.equal(denied.status,403);assert.equal(Object.hasOwn(denied.body,'entries'),false);assert.equal(Object.hasOwn(denied.body,'lines'),false);for(const key of ['payments','items','totalAmount','grossAmount','hourlyRate'])assert.equal(Object.hasOwn(denied.body,key),false);withdraw=false;assert.equal((await request({path,query})).status,403);
  }
  capabilities=['payroll.read'];packages=['PERSONNEL_BASIC','PERSONNEL_PAYROLL'];assert.equal((await request({path:'/periods/missing'})).status,404);assert.equal((await request({path:'/preview',query:'?from=2026-12-01&to=2026-11-01'})).status,400);
  const before=reads;for(const [path,method] of [['/open-cash-sessions','GET'],['/periods','POST'],['/periods/period/payments','POST'],['/periods/period/recalculate','POST'],['/periods/period/close','POST'],['/periods/period/reopen','POST']])assert.equal((await request({path,method})).status,403);assert.equal(reads,before);
 }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
