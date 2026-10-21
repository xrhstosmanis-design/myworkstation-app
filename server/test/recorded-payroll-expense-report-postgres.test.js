import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {once} from 'node:events';
import express from 'express';
import {prisma} from '../src/prisma.js';
import router from '../src/routes/kiosk-reports-sales-v4.js';
import {readRecordedPayrollExpenseReport} from '../src/services/recorded-payroll-expense-report.js';
import {salesReportCalendar} from '../src/services/sales-report-calendar.js';

const isolated=()=>{try{const u=new URL(process.env.DATABASE_URL);return process.env.NODE_ENV==='test'&&['localhost','127.0.0.1','postgres'].includes(u.hostname)&&/test/i.test(u.pathname)}catch{return false}};
const owner={id:'owner',role:'OWNER',companyId:'c'};
const superAdmin={id:'sa',role:'SUPER_ADMIN',companyId:'c'};
const now=new Date('2026-11-03T12:00:00.000Z');
const definitions={
 Company:'"id" text primary key,"active" boolean',
 Store:'"id" text primary key,"companyId" text,"active" boolean',
 StorePaidModule:'"id" text primary key,"companyId" text,"storeId" text,"moduleKey" text,"active" boolean,"startsAt" timestamptz,"endsAt" timestamptz',
 StoreTransaction:'"id" text primary key,"companyId" text,"storeId" text,"type" text,"amount" numeric,"paymentMethod" text,"subtractFromShift" boolean,"occurredAt" timestamptz,"reversedAt" timestamptz',
 WorkforceEmployeePayment:'"id" text primary key,"companyId" text,"storeId" text,"employeeId" text,"sourceType" text,"sourceId" text,"amount" numeric,"paymentMethod" text,"approvalStatus" text,"paymentDate" timestamp(3)',
 WorkforceEmployee:'"id" text primary key,"companyId" text,"fullName" text,"active" boolean'
};

// Real Prisma transactions and real PostgreSQL SQL; only this isolated schema is
// created or mutated by fixtures. No production credentials or business calls.
export async function runRecordedPayrollExpenseRegression(db,{other=db,http=true,subtest=async(_name,fn)=>fn()}={}){
 for(const[name,columns]of Object.entries(definitions))await db.$executeRawUnsafe(`CREATE TABLE "${name}"(${columns})`);
 await db.$executeRaw`INSERT INTO "Company" VALUES('c',true),('x',true),('inactive-company',false)`;
 await db.$executeRaw`INSERT INTO "Store" VALUES('s','c',true),('control','c',true),('foreign','x',true),('inactive','c',false),('no-packages','c',true),('inactive-owner','inactive-company',true)`;
 await db.$executeRaw`INSERT INTO "StorePaidModule" VALUES('basic','c','s','PERSONNEL_BASIC',true,NULL,NULL),('payroll','c','s','PERSONNEL_PAYROLL',true,NULL,NULL)`;
 await db.$executeRaw`INSERT INTO "WorkforceEmployee" VALUES('beneficiary','c','Verified beneficiary',true),('historical','c','Historical beneficiary',false),('foreign-employee','x','PRIVATE FOREIGN NAME',true)`;
 const ledger=async(id,amount,{date='2026-10-10T10:00:00.000Z',companyId='c',storeId='s',type='OTHER_EXPENSE',method='CASH_SHIFT',reversedAt=null}={})=>db.$executeRaw`INSERT INTO "StoreTransaction" VALUES(${id},${companyId},${storeId},${type},${amount}::numeric,${method},true,${new Date(date)},${reversedAt?new Date(reversedAt):null})`;
 const payment=async(id,sourceId,amount,{companyId='c',storeId='s',employeeId='beneficiary',sourceType='STORE_TRANSACTION',method='CASH_SHIFT',approvalStatus='APPROVED',paymentDate='1999-01-01T00:00:00.000Z'}={})=>db.$executeRaw`INSERT INTO "WorkforceEmployeePayment" VALUES(${id},${companyId},${storeId},${employeeId},${sourceType},${sourceId},${amount}::numeric,${method},${approvalStatus},${new Date(paymentDate)})`;
 const digest=()=>Promise.all(Object.keys(definitions).map(async name=>(await db.$queryRawUnsafe(`SELECT COUNT(*)::int AS count,md5(COALESCE(string_agg(row_to_json(t)::text,',' ORDER BY row_to_json(t)::text),'')) AS digest FROM "${name}" t`))[0]));
 const input=(day='2026-10-10',extra={})=>({user:owner,storeId:'s',from:day,to:day,timeZone:'Europe/Athens',...extra});
 const read=(day='2026-10-10',extra={},options={})=>readRecordedPayrollExpenseReport(input(day,extra),{db,now,...options});
 const unchanged=async(fn)=>{const before=await digest();const result=await fn();assert.deepEqual(await digest(),before);return result};
 const privateFree=value=>{const json=JSON.stringify(value);for(const text of ['PRIVATE FOREIGN NAME','foreign-employee','PRIVATE FOREIGN PAYMENT'])assert.equal(json.includes(text),false,text)};
 const item=(result,id)=>{const row=result.items.find(row=>row.transactionId===id);assert.ok(row,id);return row};

 await ledger('valid','10.25');await payment('valid-payment','valid','10.25');
 await ledger('expense','5.00');
 await ledger('refund','-2.00');await payment('refund-payment','refund','-2.00');
 await ledger('duplicate','3');await payment('duplicate-a','duplicate','3');await payment('duplicate-b','duplicate','3');
 await ledger('mismatch','4');await payment('mismatch-payment','mismatch','4.01');
 await ledger('pending','6');await payment('pending-payment','pending','6',{approvalStatus:'PENDING_PROOF'});
 await ledger('foreign-link','7');await payment('PRIVATE FOREIGN PAYMENT','foreign-link','7',{companyId:'x',storeId:'foreign',employeeId:'foreign-employee'});
 await ledger('foreign-duplicate','8');await payment('local-duplicate','foreign-duplicate','8');await payment('foreign-duplicate-payment','foreign-duplicate','8',{companyId:'x',storeId:'foreign',employeeId:'foreign-employee'});
 await ledger('foreign-beneficiary','9');await payment('foreign-beneficiary-payment','foreign-beneficiary','9',{employeeId:'foreign-employee'});
 await ledger('method','11');await payment('method-payment','method','11',{method:'BANK_TRANSFER'});
 await ledger('null-store','12');await payment('null-store-payment','null-store','12',{storeId:null});
 await ledger('historical','13');await payment('historical-payment','historical','13',{employeeId:'historical'});
 await ledger('reversed','99',{reversedAt:'2026-10-11T10:00:00.000Z'});
 await ledger('not-expense','99',{type:'SUPPLIER_PAYMENT'});
 await ledger('foreign-ledger','99',{companyId:'x',storeId:'foreign'});
 await ledger('control-ledger','99',{storeId:'control'});
 const calendar=salesReportCalendar('2026-10-10','2026-10-10');
 await ledger('before','99',{date:new Date(+calendar.from-1).toISOString()});await ledger('after','99',{date:calendar.to.toISOString()});
 await payment('standalone',null,'1000',{sourceType:'MANUAL',paymentDate:'2026-10-10T12:00:00.000Z'});

 await subtest('one signed ledger count, explicit beneficiary links, private foreign ambiguity and no settlement claim',async()=>{
  const out=await unchanged(()=>read());
  assert.equal(out.companyId,'c');assert.equal(out.storeId,'s');assert.equal(out.asOf,now.toISOString());
  assert.equal(out.basis,'NONREVERSED_RECORDED_OTHER_EXPENSE_LEDGER');assert.equal(out.settlementVerified,false);assert.equal(out.accrualIncluded,false);assert.equal(out.standaloneWorkforcePaymentsIncluded,false);
  assert.equal(out.items.length,12);assert.equal(out.sourceCoverage.complete,true);assert.equal(out.sourceCoverage.totalRowCount,12);assert.equal(out.sourceCoverage.returnedRowCount,12);assert.equal(out.sourceCoverage.payrollAttribution,'LINKED_ONLY');assert.equal(out.sourceCoverage.totalsScope,'COMPLETE_LEDGER');
  assert.equal(out.totals.recordedExpenseCents,8625);assert.equal(out.totals.linkedPayrollCents,2325);assert.equal(out.totals.unattributedExpenseCents,6300);assert.equal(out.totals.attributedTransactionCount,2);assert.equal(out.totals.unattributedTransactionCount,10);
  assert.equal(item(out,'valid').amountCents,1025);assert.deepEqual(item(out,'valid').payrollAttribution,{status:'ATTRIBUTED',reason:null,employeeId:'beneficiary',employeeName:'Verified beneficiary',paymentId:'valid-payment'});
  assert.equal(item(out,'historical').payrollAttribution.status,'ATTRIBUTED');assert.equal(item(out,'historical').payrollAttribution.employeeId,'historical');
  for(const[id,reason]of [['expense','NO_WORKFORCE_LINK'],['refund','NON_POSITIVE_PAYROLL_AMOUNT'],['duplicate','MULTIPLE_WORKFORCE_LINKS'],['mismatch','LINK_AMOUNT_MISMATCH'],['pending','LINK_NOT_APPROVED'],['foreign-link','LINK_SCOPE_MISMATCH'],['foreign-duplicate','MULTIPLE_WORKFORCE_LINKS'],['foreign-beneficiary','EMPLOYEE_SCOPE_MISMATCH'],['method','LINK_METHOD_MISMATCH'],['null-store','LINK_SCOPE_MISMATCH']])assert.deepEqual(item(out,id).payrollAttribution,{status:'UNATTRIBUTED',reason,employeeId:null,employeeName:null,paymentId:null});
  assert.equal(item(out,'refund').amountCents,-200);assert.equal(out.totals.byEmployee.length,2);assert.equal(out.totals.byEmployee.find(row=>row.employeeId==='beneficiary').amountCents,1025);privateFree(out);
 });

 await subtest('actual RepeatableRead/read-only transaction and independent-client snapshot',async()=>{
  const seen=[];let concurrent=false;
  await ledger('snapshot','1',{date:'2026-10-11T10:00:00.000Z'});
  const inspecting={$transaction:(callback,options)=>db.$transaction(async tx=>callback(new Proxy(tx,{get(target,key){
   if(key==='$queryRaw')return async(...args)=>{const rows=await target.$queryRaw(...args);seen.push((await target.$queryRawUnsafe('SHOW transaction_isolation'))[0].transaction_isolation);seen.push((await target.$queryRawUnsafe('SHOW transaction_read_only'))[0].transaction_read_only);if(!concurrent){concurrent=true;await other.$executeRaw`INSERT INTO "WorkforceEmployeePayment" VALUES('snapshot-payment','c','s','beneficiary','STORE_TRANSACTION','snapshot',1,'CASH_SHIFT','APPROVED','1999-01-01'::timestamp)`}return rows};
   const value=target[key];return typeof value==='function'?value.bind(target):value;
  }})),options)};
  const out=await read('2026-10-11',{}, {db:inspecting});assert.ok(concurrent);assert.ok(seen.length>0);assert.ok(seen.every((value,index)=>value===(index%2?'on':'repeatable read')));assert.equal(item(out,'snapshot').payrollAttribution.reason,'NO_WORKFORCE_LINK');
  assert.equal(item(await unchanged(()=>read('2026-10-11')),'snapshot').payrollAttribution.status,'ATTRIBUTED');
 });

 await subtest('Athens DST half-open timestamp boundaries, unrelated paymentDate and empty scope',async()=>{
  for(const[day,hours]of [['2026-03-29',23],['2026-10-25',25]]){
   const range=salesReportCalendar(day,day);assert.equal((+range.to-+range.from)/3600000,hours);
   await ledger(day+'-before','99',{date:new Date(+range.from-1).toISOString()});await ledger(day+'-first','1.01',{date:range.from.toISOString()});await ledger(day+'-last','2.02',{date:new Date(+range.to-1).toISOString()});await ledger(day+'-after','99',{date:range.to.toISOString()});
   const out=await unchanged(()=>read(day));assert.equal(out.items.length,2);assert.equal(out.totals.recordedExpenseCents,303);assert.equal(out.period.from,range.from.toISOString());assert.equal(out.period.toExclusive,range.to.toISOString());
  }
  const empty=await unchanged(()=>read('2026-10-12'));assert.deepEqual(empty.items,[]);assert.equal(empty.sourceCoverage.complete,true);assert.equal(empty.totals.recordedExpenseCents,0);
  await assert.rejects(read('2026-10-10',{}, {now:new Date(+calendar.to-1)}),error=>error.status===400);assert.equal((await read('2026-10-10',{}, {now:calendar.to})).totals.recordedExpenseCents,8625);
 });

 await subtest('same-company active store, BASIC/PAYROLL snapshot gates, duplicate/foreign modules and role denials',async()=>{
  for(const[extra,status]of [[{user:{...owner,role:'ADMIN'}},403],[{user:{...owner,role:'MANAGER'}},403],[{user:{...owner,tokenType:'STORE_OPERATOR'}},403],[{user:{...superAdmin,tokenType:'STORE_OPERATOR'}},403],[{storeId:''},400],[{storeId:'foreign'},404],[{storeId:'inactive'},404],[{storeId:'missing'},404],[{user:{...owner,companyId:'x'}},404],[{user:{...owner,companyId:'inactive-company'},storeId:'inactive-owner'},404],[{storeId:'no-packages'},403]])await unchanged(()=>assert.rejects(read('2026-10-10',extra),error=>error.status===status));
  assert.equal((await unchanged(()=>read('2026-10-10',{user:superAdmin,storeId:'no-packages'}))).sourceCoverage.complete,true);
  await db.$executeRaw`UPDATE "StorePaidModule" SET "active"=false WHERE "id"='payroll'`;await unchanged(()=>assert.rejects(read(),error=>error.status===403));await db.$executeRaw`UPDATE "StorePaidModule" SET "active"=true,"startsAt"='2026-12-01'::timestamptz WHERE "id"='payroll'`;await unchanged(()=>assert.rejects(read(),error=>error.status===403));await db.$executeRaw`UPDATE "StorePaidModule" SET "startsAt"=NULL,"endsAt"='2026-01-01'::timestamptz WHERE "id"='payroll'`;await unchanged(()=>assert.rejects(read(),error=>error.status===403));await db.$executeRaw`UPDATE "StorePaidModule" SET "endsAt"=NULL WHERE "id"='payroll'`;
  await db.$executeRaw`INSERT INTO "StorePaidModule" VALUES('duplicate-module','c','s','PERSONNEL_PAYROLL',true,NULL,NULL)`;await unchanged(()=>assert.rejects(read(),error=>error.status>=400));await db.$executeRaw`DELETE FROM "StorePaidModule" WHERE "id"='duplicate-module'`;
  await db.$executeRaw`UPDATE "StorePaidModule" SET "companyId"='x' WHERE "id"='payroll'`;await unchanged(()=>assert.rejects(read(),error=>error.status>=400));await db.$executeRaw`UPDATE "StorePaidModule" SET "companyId"='c' WHERE "id"='payroll'`;
 });

 if(http)await subtest('actual production HTTP router rejects role/query/store escapes without financial writes',async()=>{
  const originalTransaction=prisma.$transaction;prisma.$transaction=db.$transaction.bind(db);
  const users={owner,sa:superAdmin,admin:{...owner,role:'ADMIN'},manager:{...owner,role:'MANAGER'},staff:{...owner,role:'EMPLOYEE'},operator:{...superAdmin,tokenType:'STORE_OPERATOR'},foreign:{...owner,companyId:'x'}};
  const app=express();app.use((req,res,next)=>{req.user=users[req.get('x-fixture-user')];return req.user?next():res.status(401).json({error:'unauthorized'})});app.use('/reports',router);app.use((err,req,res,next)=>res.status(err.status||500).json({error:err.message}));
  const server=app.listen(0,'127.0.0.1');await once(server,'listening');
  const request=async(user,overrides={})=>{const query=new URLSearchParams({storeId:'s',from:'2026-10-10',to:'2026-10-10',timeZone:'Europe/Athens',...overrides});for(const[key,value]of Object.entries(overrides))if(value===null)query.delete(key);const response=await fetch(`http://127.0.0.1:${server.address().port}/reports/recorded-payroll-expenses?${query}`,{headers:{'x-fixture-user':user}});return{status:response.status,cacheControl:response.headers.get('cache-control'),body:await response.json()}};
  try{await unchanged(async()=>{
   for(const user of ['owner','sa']){const out=await request(user);assert.equal(out.status,200,JSON.stringify(out));assert.equal(out.cacheControl,'no-store');assert.equal(out.body.totals.recordedExpenseCents,8625);privateFree(out.body)}
   for(const[user,query,status]of [['admin',{},403],['manager',{},403],['staff',{},403],['operator',{},403],['foreign',{},404],['owner',{storeId:''},400],['owner',{storeId:null},400],['owner',{storeId:'foreign'},404],['owner',{timeZone:'UTC'},400],['owner',{timeZone:null},400],['owner',{from:'2026-02-30'},400],['owner',{from:'2099-01-01',to:'2099-01-01',now:'2100-01-01'},400],['owner',{companyId:'x'},400],['owner',{from:'2024-01-01',to:'2026-01-01'},400]]){const out=await request(user,query);assert.equal(out.status,status,JSON.stringify(out));assert.equal('items' in out.body,false);assert.equal('totals' in out.body,false)}
  })}finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));prisma.$transaction=originalTransaction;}
 });

 await subtest('exact 10000-row completeness and 10001-row overflow suppress full totals',async()=>{
  await db.$executeRawUnsafe(`INSERT INTO "StoreTransaction" SELECT 'cap-'||g,'c','s','OTHER_EXPENSE',.01,'CASH_SHIFT',true,'2026-05-15T10:00:00Z'::timestamptz,NULL FROM generate_series(1,10000)g`);
  const full=await unchanged(()=>read('2026-05-15'));assert.equal(full.items.length,10000);assert.equal(full.sourceCoverage.complete,true);assert.equal(full.sourceCoverage.totalRowCount,10000);assert.equal(full.totals.recordedExpenseCents,10000);
  await ledger('cap-10001','.01',{date:'2026-05-15T10:00:00.000Z'});
  const limited=await unchanged(()=>read('2026-05-15'));assert.equal(limited.items.length,10000);assert.equal(limited.sourceCoverage.complete,false);assert.equal(limited.sourceCoverage.totalRowCount,10001);assert.equal(limited.sourceCoverage.returnedRowCount,10000);assert.equal(limited.sourceCoverage.totalsScope,'RETURNED_ROWS');assert.equal(limited.totals,null);
 });

 await subtest('missing required tables fail 503 without bootstrap, preserving every fixture/control row',async()=>{
  for(const table of ['WorkforceEmployeePayment','WorkforceEmployee','StorePaidModule']){
   await db.$executeRawUnsafe(`ALTER TABLE "${table}" RENAME TO "${table}_held"`);
   try{const before=(await db.$queryRawUnsafe(`SELECT COUNT(*)::int AS n FROM "${table}_held"`))[0].n;await assert.rejects(read(),error=>error.status===503);const absent=(await db.$queryRaw`SELECT to_regclass(format('%I.%I',current_schema(),${table}))::text AS name`)[0].name;assert.equal(absent,null);assert.equal((await db.$queryRawUnsafe(`SELECT COUNT(*)::int AS n FROM "${table}_held"`))[0].n,before)}finally{await db.$executeRawUnsafe(`ALTER TABLE "${table}_held" RENAME TO "${table}"`)}
  }
  await db.$executeRawUnsafe('ALTER TABLE "StoreTransaction" RENAME COLUMN "amount" TO "amount_held"');
  try{await assert.rejects(read(),error=>error.status===503);assert.equal((await db.$queryRaw`SELECT COUNT(*)::int AS n FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='StoreTransaction' AND column_name='amount'`)[0].n,0)}finally{await db.$executeRawUnsafe('ALTER TABLE "StoreTransaction" RENAME COLUMN "amount_held" TO "amount"')}
  await db.$executeRawUnsafe('ALTER TABLE "WorkforceEmployeePayment" RENAME COLUMN "approvalStatus" TO "approvalStatus_held"');
  try{await assert.rejects(read(),error=>error.status===503);assert.equal((await db.$queryRaw`SELECT COUNT(*)::int AS n FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='WorkforceEmployeePayment' AND column_name='approvalStatus'`)[0].n,0)}finally{await db.$executeRawUnsafe('ALTER TABLE "WorkforceEmployeePayment" RENAME COLUMN "approvalStatus_held" TO "approvalStatus"')}
  const badMoney='invalid-money';await ledger(badMoney,'0.001');await unchanged(()=>assert.rejects(read(),error=>error.status>=400));await db.$executeRaw`DELETE FROM "StoreTransaction" WHERE "id"=${badMoney}`;
 });
}

test('native recorded expense/payroll: read-only snapshot, tenant/role/module boundaries, exact links, signed ledger, DST and cap',{skip:!isolated(),timeout:120000},async t=>{
 const{PrismaClient}=await import('@prisma/client'),admin=new PrismaClient(),schema='recorded_payroll_'+randomUUID().replaceAll('-','');const url=new URL(process.env.DATABASE_URL);url.searchParams.set('schema',schema);const db=new PrismaClient({datasourceUrl:url.toString()}),other=new PrismaClient({datasourceUrl:url.toString()});
 try{await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);await runRecordedPayrollExpenseRegression(db,{other,subtest:(name,fn)=>t.test(name,fn)})}finally{await other.$disconnect();await db.$disconnect();await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await admin.$disconnect()}
});
