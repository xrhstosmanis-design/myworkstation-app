import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {readWorkforceEvaluations,readWorkforcePerformance} from '../src/routes/platform-workforce-v2.js';
import {readWorkforceScheduleValidation,readWorkforceScheduleForValidation} from '../src/routes/platform-workforce-v2-schedules.js';
const context={company:{id:'company'},store:{id:'store-a'},requestUser:{id:'staff',role:'EMPLOYEE',staffAccess:true}},employee={id:'employee',fullName:'Visible employee'},forbidden=()=>assert.fail('pure workforce read attempted writer/bootstrap');
function performanceDb({pending=false}={}){
 const seen=[],at=new Date(Date.now()-86400000),attendance=[{storeId:'store-a',status:'CLOSED',workedMinutes:60,overtimeMinutes:5,lateMinutes:2,earlyLeaveMinutes:0},{storeId:'store-b',status:'CLOSED',workedMinutes:600,overtimeMinutes:50,lateMinutes:20,earlyLeaveMinutes:0}],shifts=[{id:'shift-a',storeId:'store-a',terminalPos:'MAIN',status:'CLOSED',openedAt:at,closedAt:at,openedInPeriod:true,closedInPeriod:true,cashSales:30,cardSales:0,eftposTotal:0,variance:2,openingVariance:0,cardVariance:0,transactionCount:2,reversedCount:0},{id:'shift-b',storeId:'store-b',terminalPos:'OTHER',status:'CLOSED',openedAt:at,closedAt:at,openedInPeriod:true,closedInPeriod:true,cashSales:300,cardSales:0,eftposTotal:0,variance:20,openingVariance:0,cardVariance:0,transactionCount:20,reversedCount:0}];
 if(pending)shifts.push({...shifts[0],id:'uncounted',closeReconciliationStatus:'AWAITING_COUNT',openingVariance:null,cashSales:15});
 const db={$executeRaw:forbidden,$executeRawUnsafe:forbidden,$transaction:forbidden,workforceEmployee:{findFirst:async options=>{seen.push({model:'employee',options});return employee}},workforceAttendanceSession:{findMany:async options=>{seen.push({model:'attendance',options});return attendance.filter(row=>!options.where.storeId||row.storeId===options.where.storeId)}},workforceAuditLog:{findMany:async options=>{seen.push({model:'audit',options});return[]}},$queryRaw:async(parts,...values)=>{const sql=parts.join('?');seen.push({sql,values});assert.doesNotMatch(sql,/\b(?:INSERT|UPDATE|DELETE|CREATE|ALTER|FOR UPDATE)\b/i);const own=values.includes('store-a');if(sql.includes('FROM "StoreOperatorCredential"'))return(own?['a']:['a','b']).map(id=>({id:'operator-'+id}));if(sql.includes('FROM "CashShiftSession"'))return shifts.filter(row=>!own||row.storeId==='store-a');if(sql.includes('FROM "PosSaleActionAudit"'))return(own?['CANCEL']:['CANCEL','RETURN']).map((actionType,i)=>({id:'action-'+i,actionType,amount:0}));assert.fail(sql)}};
 return {db,seen};
}
test('native rolling performance arithmetic is preserved while delegated reads restrict every rendered source to the selected store',async()=>{
 const a=performanceDb(),legacy=await readWorkforcePerformance(context,employee,{days:'30'},{db:a.db});assert.equal(legacy.attendance.workedMinutes,660);assert.equal(legacy.cashier.totalSales,330);assert.equal(legacy.posActions.returns,1);
 const b=performanceDb(),scoped=await readWorkforcePerformance(context,employee,{days:'30'},{db:b.db,strictStore:true});assert.equal(scoped.attendance.workedMinutes,60);assert.equal(scoped.cashier.totalSales,30);assert.equal(scoped.cashier.variance,2);assert.equal(scoped.posActions.cancellations,1);assert.equal(scoped.posActions.returns,0);
 for(const row of b.seen){if(row.model&&row.model!=='employee'){assert.equal(row.options.where.storeId,'store-a');assert.equal(row.options.where.companyId,'company')}if(row.sql){assert.ok(row.values.includes('store-a'),'every performance SQL source receives selected store');if(row.sql.includes('CashShiftSession')){assert.match(row.sql,/t\."companyId"=s\."companyId"/);assert.match(row.sql,/t\."storeId"=s\."storeId"/)}if(row.sql.includes('PosSaleActionAudit')){assert.doesNotMatch(row.sql,/a\."details"/);assert.match(row.sql,/o\."storeId"=a\."storeId"/)}}}
});
test('actual monthly performance keeps native closed-month totals and warnings without changing the Owner cache-header timing',async()=>{
 const f=performanceDb();let cache=0;const value=await readWorkforcePerformance(context,employee,{month:'2026-11'},{db:f.db,strictStore:true,onMonthlyReady:()=>{assert.equal(f.seen.at(-1).model,'employee');cache++}});assert.equal(cache,1);assert.equal(value.period.month,'2026-11');assert.equal(value.period.timeZone,'Europe/Athens');assert.equal(value.cashier.totalSales,30);assert.equal(value.cashier.closedShifts,1);assert.equal(value.cashier.variance,2);assert.deepEqual(value.warnings,[]);assert.deepEqual(f.seen.find(row=>row.model==='employee').options.select,{id:true,fullName:true});
});
test('workforce monthly and rolling reports retain sales and show unresolved count differences as unknown',async()=>{
 for(const query of [{days:'30'},{month:'2026-11'}]){
  const f=performanceDb({pending:true});
  const {cashier}=await readWorkforcePerformance(context,employee,query,{db:f.db,strictStore:true});
  assert.equal(cashier.totalSales,45);
  assert.equal(cashier.awaitingCount,1);
  for(const key of ['variance','cardVariance','eftpos','openingVariance'])assert.equal(cashier[key],null,key);
  const pending=cashier.recentShifts.find(row=>row.id==='uncounted');
  assert.equal(pending.closeReconciliationStatus,'AWAITING_COUNT');
  for(const key of ['variance','cardVariance','eftposTotal','openingVariance'])assert.equal(pending[key],null,key);
  assert.equal(cashier.recentShifts[0].variance,2);
 }
});
test('monthly employee withdrawal produces the same typed native404 rather than accessing a response inside the pure reader',async()=>{const f=performanceDb();f.db.workforceEmployee.findFirst=async()=>null;await assert.rejects(readWorkforcePerformance(context,employee,{month:'2026-11'},{db:f.db,strictStore:true,onMonthlyReady:forbidden}),{status:404});});
test('evaluation preparation remains native-only and delegated selection closes store and author company without exposing raw identity columns',async()=>{
 const sequence=[],db={$executeRawUnsafe:forbidden,$queryRaw:async(parts,...values)=>{const sql=parts.join('?');sequence.push('query');return[{sql,values}]}};
 await readWorkforceEvaluations(context,employee,{db,prepareSource:async()=>sequence.push('prepare')});assert.deepEqual(sequence,['prepare','query']);sequence.length=0;
 const {items}=await readWorkforceEvaluations(context,employee,{db,strictStore:true});assert.deepEqual(sequence,['query']);assert.match(items[0].sql,/e\."storeId"=/);assert.match(items[0].sql,/u\."companyId"=e\."companyId"/);assert.doesNotMatch(items[0].sql,/SELECT e\.\*|e\."createdByUserId",/);assert.deepEqual(items[0].values,['company','store-a','employee']);
});
test('schedule validation reuses actual finding calculations with a genuine employee loader and no management/bootstrap path',async()=>{
 const date=new Date('2026-11-09T00:00Z'),template={id:'template',name:'Morning',minimumPeople:1,maximumPeople:2,startTime:'08:00',requiredRole:null},schedule={id:'schedule',periodStart:date,periodEnd:date,assignments:[{id:'assignment',date,shiftTemplateId:'template',employeeId:'employee',shiftTemplate:template,warningState:null}]},db={$executeRawUnsafe:forbidden,workforceShiftTemplate:{findMany:async options=>{assert.deepEqual(options.where,{companyId:'company',storeId:'store-a',active:true});return[template]}},workforceSchedule:{findFirst:async options=>{assert.deepEqual(options.where,{id:'schedule',companyId:'company',storeId:'store-a'});return schedule}}};
 assert.equal((await readWorkforceScheduleForValidation(context,'schedule',{db})).id,'schedule');
 const result=await readWorkforceScheduleValidation(context,schedule,{db,employeeLoader:async(ctx,id)=>{assert.equal(ctx.requestUser.role,'EMPLOYEE');assert.equal(id,'employee');return{id,fullName:'Visible employee',rules:[{ruleType:'NEVER_ALONE',active:true,validFrom:null,validTo:null}]}}});assert.equal(result.findings.length,1);assert.equal(result.errors[0].ruleCode,'NEVER_ALONE');assert.equal(result.approvals.length,0);
});
test('canonical workforce performance and validation bodies match reviewed report calculations and SQL',async()=>{
 const performance=await readFile(new URL('../src/routes/platform-workforce-v2.js',import.meta.url),'utf8'),a=performance.indexOf('export async function readWorkforcePerformance('),start=performance.indexOf('    if(rawQuery.month!==undefined)',a),end=performance.indexOf('}\nrouter.get("/employees/:employeeId/performance"',start),body=performance.slice(start,end);assert.ok(end>start);assert.equal(createHash('sha256').update(body.replace('throw Object.assign(new Error("Δεν βρέθηκε εργαζόμενος στο κατάστημα."),{status:404})','return res.status(404).json({error:"Δεν βρέθηκε εργαζόμενος στο κατάστημα."})').replace(/\s/g,'')).digest('hex'),'7c9f8de65a084c1620128904c81a9de5700f230861f760ff47255520fe2fde2c');
 const validation=await readFile(new URL('../src/routes/platform-workforce-v2-schedules.js',import.meta.url),'utf8'),v=validation.indexOf('export async function readWorkforceScheduleValidation('),vs=validation.indexOf(' const prisma=db;',v)+' const prisma=db;'.length,ve=validation.indexOf('}\n\nconst scheduleValidation=',vs);assert.ok(ve>vs);assert.equal(createHash('sha256').update(validation.slice(vs,ve).replace(/\s/g,'')).digest('hex'),'beaea1b5d1bbafc7e4c0a09445e5df7b3f3baa7f3a7a2b244376d8a2cc920022');
});
