import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import express from 'express';
import {z} from 'zod';
import {enforceBackofficeStaff,requireStaffGrant,staffError} from '../src/services/backoffice-staff-access.js';
import {staffRequestCapability} from '../../shared/backoffice-staff.mjs';

test('native employee reads retain selected membership without payroll, other store access, credential writes or mutation authority',async()=>{
  let capabilities=['employees.read'],packageActive=true,packageKey='PERSONNEL_PRO',withdrawDuringRead=false,reads=0;
  const store={id:'store',companyId:'company',name:'Synthetic store'};
  const company={id:'company',active:true,licenseStatus:'ACTIVE',modules:[]};
  const employee={id:'employee',companyId:'company',baseStoreId:'sibling',fullName:'Synthetic Employee',active:true,phone:'123',email:'employee@example.test',maxHoursPerWeek:40,roleAssignments:[{primary:true,role:{id:'role',name:'Cashier',code:'CASHIER',active:true}}],storeAccess:[{storeId:'store',active:true},{storeId:'sibling',active:true}],pinHash:'private',dailyRate:90,fixedMonthlyAmount:2000,hourlyRates:[{hourlyRate:50}],rules:[{private:'rule'}],notes:'Private note',paymentType:'HOURLY'};
  const forbidden=()=>assert.fail('delegated read attempted a write or broad package bootstrap');
  const checkSelection=options=>{
    reads++;
    assert.equal(options.where.companyId,'company');
    assert.ok(options.where.OR);
    assert.ok(JSON.stringify(options.where.OR).includes('store'));
    assert.equal(JSON.stringify(options.where.OR).includes('sibling'),false);
    assert.equal(options.include,undefined);
    assert.equal(options.select.pinHash,undefined);
    for(const key of ['paymentType','dailyRate','fixedMonthlyAmount','hourlyRates','rules','notes'])assert.equal(options.select[key],undefined,key);
    assert.deepEqual(options.select.storeAccess.where,{storeId:'store',active:true});
    assert.deepEqual(options.select.roleAssignments.where,{role:{companyId:'company'}});
    if(withdrawDuringRead)capabilities=[];
  };
  const db={
    company:{findUnique:async()=>company},store:{findFirst:async({where})=>where.id==='store'&&where.companyId==='company'?store:null},
    workforceEmployee:{findMany:async options=>{checkSelection(options);return [employee];},findFirst:async options=>{checkSelection(options);return options.where.id==='employee'?employee:null;}},
    $queryRaw:async(strings,...values)=>{
      const sql=strings.join('?');
      if(sql.includes('FROM "BackofficeStaffAccount" a'))return [{mustChangePassword:false}];
      if(sql.includes('FROM "BackofficeStaffGrant" g'))return values[2]==='store'?[{profile:'AUDITOR',capabilities}]:[];
      if(sql.includes('FROM "StorePaidModule"'))return packageActive?[{moduleKey:packageKey,active:true}]:[];
      assert.fail(sql);
    },$transaction:forbidden,$executeRaw:forbidden,$executeRawUnsafe:forbidden,
  };
  const accessSource=await readFile(new URL('../src/routes/workforce-v2-access.js',import.meta.url),'utf8');
  const access=new Function('prisma','requireStaffGrant','staffError','staffRequestCapability','PERSONNEL_BASIC','isSuperAdmin','requirePersonnelPackage','storePaidModuleState','storePaidModuleStates','serializeWorkforceRule',accessSource.replace(/^import .*;\s*$/gm,'').replace(/^export \{.*\};?$/gm,'').replace(/^export /gm,'')+'\nreturn {managementGuard,contextFor,loadEmployee,employeeReadSelection,serializeEmployeeRead};')(db,requireStaffGrant,staffError,staffRequestCapability,'PERSONNEL_BASIC',()=>false,forbidden,forbidden,forbidden,forbidden);
  const source=await readFile(new URL('../src/routes/platform-workforce-v2-employees.js',import.meta.url),'utf8');
  const start=source.indexOf('router.get("/",');
  const end=source.indexOf('\nrouter.post("/:employeeId/work-card",',start);
  assert.ok(start>=0&&end>start);
  const router=express.Router({mergeParams:true});
  router.use(access.managementGuard);
  new Function('router','z','prisma','contextFor','loadEmployee','employeeReadSelection','serializeEmployeeRead','requireStaffGrant','staffError',source.slice(start,end))(router,z,db,access.contextFor,access.loadEmployee,access.employeeReadSelection,access.serializeEmployeeRead,requireStaffGrant,staffError);
  const app=express();
  app.use(async(req,res,next)=>{
    req.user={id:'staff',companyId:'company',role:'EMPLOYEE',tokenType:'BACKOFFICE_USER',staffAccess:true,sessionId:'session',sessionVersion:0};
    try{await enforceBackofficeStaff(db,req,res);next();}catch(error){next(error);}
  });
  app.use('/api/platform/store-modules/companies/:companyId/stores/:storeId/workforce-v2/employees',router);
  app.use((error,_req,res,_next)=>res.status(error.status||500).json({code:error.code,error:error.message}));
  const server=await new Promise(resolve=>{const handle=app.listen(0,'127.0.0.1',()=>resolve(handle));});
  const request=async({suffix='',companyId='company',storeId='store',method='GET',query=''}={})=>{
    const response=await fetch(`http://127.0.0.1:${server.address().port}/api/platform/store-modules/companies/${companyId}/stores/${storeId}/workforce-v2/employees${suffix}${query}`,{method,headers:{'x-backoffice-store-id':storeId}});
    return {status:response.status,body:await response.json()};
  };
  try{
    for(const suffix of ['','/employee']){
      capabilities=['employees.read'];
      const result=await request({suffix});
      assert.equal(result.status,200,JSON.stringify(result.body));
      assert.equal(result.body.companyId,'company');
      assert.equal(result.body.storeId,'store');
      const item=suffix?result.body.item:result.body.items[0];
      assert.equal(item.fullName,employee.fullName);
      assert.equal(item.baseStoreId,null);
      assert.deepEqual(item.storeAccess.map(row=>row.storeId),['store']);
      for(const key of ['pinHash','hasPin','paymentType','dailyRate','fixedMonthlyAmount','hourlyRates','rules','notes'])assert.equal(Object.hasOwn(item,key),false,key);
      const before=reads;
      assert.equal((await request({suffix,storeId:'sibling'})).status,403);
      assert.equal((await request({suffix,companyId:'foreign'})).status,403);
      assert.equal(reads,before);
      packageActive=false;
      assert.equal((await request({suffix})).status,403);
      packageActive=true;
      withdrawDuringRead=true;
      assert.equal((await request({suffix})).status,403);
      withdrawDuringRead=false;
      assert.equal((await request({suffix})).status,403);
    }
    capabilities=['employees.read'];
    packageKey='PERSONNEL_AI';
    assert.equal((await request()).status,200);
    const before=reads;
    assert.equal((await request({query:'?scope=COMPANY'})).status,403);
    for(const [suffix,method] of [['','POST'],['/employee','PUT'],['/employee/work-card','POST'],['/employee/chat-invitation','GET']])assert.equal((await request({suffix,method})).status,403);
    assert.equal(reads,before);
    assert.equal((await request({suffix:'/unknown'})).status,404);
  }finally{
    server.closeAllConnections();
    await new Promise(resolve=>server.close(resolve));
  }
});
