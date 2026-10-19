import test from 'node:test';
import assert from 'node:assert/strict';
import {dailyCashReportReadiness,reportDayOffset,reportWallTime,cashPreviewPeriod} from '../src/services/automatic-report-policy.js';
import {readAutomaticDailyCashPreview,readAutomaticCashPreview} from '../src/services/automatic-report-source.js';

const configuration={terminals:['MAIN',{terminalPos:'DELIVERY',requiredSlots:[1]}]};
const scope={companyId:'c',storeId:'s',day:'2026-02-18',...configuration};
const now=new Date('2026-03-01T09:00:00+02:00');
function dayRows(day='2026-02-18'){
 const start=reportWallTime(day,7),next=reportWallTime(reportDayOffset(day,1),7);
 return [7,15,23].map((hour,index)=>({id:`${day}-${index}`,companyId:'c',storeId:'s',terminalPos:'MAIN',cashChain:'STORE',status:'CLOSED',openedBy:`user-${index}`,openedByName:`Recorded ${index}`,openedAt:new Date(+start+index*8*3600000),closedAt:index===2?next:new Date(+start+(index+1)*8*3600000),variance:[-10,8,0][index]})).concat([{id:`${day}-delivery`,companyId:'c',storeId:'s',terminalPos:'DELIVERY',cashChain:'DELIVERY',status:'CLOSED',openedAt:start,closedAt:reportWallTime(day,12),variance:20}]);
}
const overlaps=result=>result.holds.filter(h=>h.overlappingSessionId);
function snapshot(rows){
 const calls=[];
 const tx={user:{findUnique:async()=>({role:'SUPER_ADMIN'})},store:{findFirst:async()=>({id:'s',companyId:'c',name:'LAB fixture'})},$queryRaw:async(strings,...values)=>{const sql=strings.join('?');calls.push({sql,values});return sql.includes('FROM "CashControlStoreRule"')?[{mode:'FULL',deliveryTerminalPattern:'DELIVERY',carryOverEnabled:true,posEftposEnabled:true}]:rows;}};
 return {calls,db:{$transaction:async(fn,options)=>{assert.equal(options.isolationLevel,'RepeatableRead');return fn(tx);}}};
}

test('same-terminal closed overlap is held with deterministic source IDs without mutating input',()=>{
 const rows=dayRows();rows[0].closedAt=rows[1].closedAt;const before=JSON.stringify(rows);
 const result=dailyCashReportReadiness(rows,scope,now);
 assert.equal(result.ready,false);assert.deepEqual(overlaps(result),[{code:'SOURCE_SCOPE_OR_ID_INVALID',terminalPos:'MAIN',sessionId:rows[1].id,overlappingSessionId:rows[0].id}]);assert.equal(JSON.stringify(rows),before);
 const reverse=rows.toReversed(),reverseBefore=JSON.stringify(reverse);
 assert.deepEqual(overlaps(dailyCashReportReadiness(reverse,scope,now)),overlaps(result));assert.equal(JSON.stringify(reverse),reverseBefore);
});

test('running maximum catches nested intervals and equal starts while preserving input order',()=>{
 const rows=dayRows();rows[0].closedAt=rows[1].closedAt;
 const nested={...rows[0],id:'nested',openedAt:new Date(+rows[0].openedAt+3600000),closedAt:new Date(+rows[0].openedAt+2*3600000)};
 const late={...rows[1],id:'later-nested',openedAt:new Date(+rows[1].openedAt+3600000),closedAt:new Date(+rows[1].openedAt+2*3600000)};
 const items=[late,rows[2],nested,rows[0],rows[3],rows[1]],before=JSON.stringify(items),result=dailyCashReportReadiness(items,scope,now);
 assert.equal(result.ready,false);assert.ok(overlaps(result).some(h=>h.sessionId==='later-nested'&&h.overlappingSessionId===rows[0].id));assert.equal(JSON.stringify(items),before);
 const sameStart=[...dayRows(),{...dayRows()[0],id:'same-start',closedAt:new Date(+dayRows()[0].openedAt+3600000)}];
 assert.equal(dailyCashReportReadiness(sameStart,scope,now).ready,false);assert.equal(overlaps(dailyCashReportReadiness(sameStart,scope,now)).length,1);
});

test('half-open adjacency, empty intervals and concurrent different terminals remain valid',()=>{
 const base=dayRows(),before=JSON.stringify(base);assert.equal(dailyCashReportReadiness(base,scope,now).ready,true);assert.equal(JSON.stringify(base),before);
 const split=dayRows(),boundary=new Date(+split[0].openedAt+3600000);split[0].closedAt=boundary;split.push({...base[0],id:'split-morning',openedAt:boundary});
 assert.equal(dailyCashReportReadiness(split,scope,now).ready,true);
 const empty={...base[0],id:'empty',openedAt:boundary,closedAt:boundary};assert.equal(dailyCashReportReadiness([...base,empty],scope,now).ready,true);
 const named=base.map(row=>({...row,terminalPos:row.terminalPos==='MAIN'?'__proto__':'constructor',cashChain:'caller-fiction'}));
 assert.equal(dailyCashReportReadiness(named,{...scope,terminals:['__proto__',{terminalPos:'constructor',requiredSlots:[1]}]},now).ready,true);
});

test('existing invalid, future, open and foreign-source holds are retained without overlap inference',()=>{
 for(const change of [{status:'OPEN',closedAt:null},{closedAt:'invalid'},{closedAt:new Date('2026-03-02T09:00:00+02:00')},{closedAt:new Date('2026-02-18T06:00:00+02:00')},{companyId:'foreign'}]){
  const rows=dayRows();Object.assign(rows[0],change);const result=dailyCashReportReadiness(rows,scope,now);assert.equal(result.ready,false);assert.equal(overlaps(result).length,0,JSON.stringify(change));
 }
 const old={...dayRows()[0],id:'carry-in',openedAt:reportWallTime('2026-02-17',7),closedAt:null,status:'OPEN'};
 assert.ok(dailyCashReportReadiness([...dayRows(),old],scope,now).holds.some(h=>h.code==='SOURCE_SCOPE_OR_ID_INVALID'));
});

test('actual UTC adjacency across both Athens DST transitions remains valid',()=>{
 for(const day of ['2026-03-28','2026-10-24']){
  const rows=dayRows(day),settings={...scope,day};assert.equal(dailyCashReportReadiness(rows,settings,new Date('2026-11-01T09:00:00+02:00')).ready,true);
  const end=new Date(+rows[2].openedAt+3600000),inside={...rows[2],id:'overnight-nested',openedAt:new Date(+rows[2].openedAt+1800000),closedAt:end};
  assert.equal(dailyCashReportReadiness([...rows,inside],settings,new Date('2026-11-01T09:00:00+02:00')).ready,false);
 }
});

test('actual daily, weekly and monthly readers suppress all totals for one overlapped day and keep valid controls',async()=>{
 for(const frequency of ['DAILY','WEEKLY','MONTHLY']){
  const period=cashPreviewPeriod(scope.day,frequency),days=Math.round((Date.parse(period.toDay)-Date.parse(period.fromDay))/86400000)+1;
  const rows=Array.from({length:days},(_,index)=>dayRows(reportDayOffset(period.fromDay,index))).flat(),before=JSON.stringify(rows),args={actorId:'sa',companyId:'c',storeId:'s',day:scope.day,frequency,configuration,now};
  const read=db=>frequency==='DAILY'?readAutomaticDailyCashPreview(db,args):readAutomaticCashPreview(db,args);
  const control=await read(snapshot(rows).db);assert.equal(control.ready,true,frequency);assert.equal(control.financialFinality,'PROVISIONAL');assert.equal(control.financialReconciliationComplete,false);assert.equal(control.deliveryStatus,'PREVIEW_ONLY');assert.equal(control.employeeLiabilityAdjusted,false);assert.equal(control.groups.length,days*2);assert.equal(JSON.stringify(rows),before);
  const original=rows.find(r=>r.id===scope.day+'-0'),later=rows.find(r=>r.id===scope.day+'-1');original.closedAt=later.closedAt;const changedBefore=JSON.stringify(rows),f=snapshot(rows),report=await read(f.db);
  assert.equal(report.ready,false,frequency);assert.equal(report.sourceReadiness,'HOLD');assert.equal(report.groups,null);assert.equal(report.complete,true);assert.equal(report.sourceCount,rows.length);assert.ok(report.holds.some(h=>h.code==='SOURCE_SCOPE_OR_ID_INVALID'&&h.sessionId===later.id&&h.overlappingSessionId===original.id));
  if(frequency==='MONTHLY'){assert.equal(control.openingOperatorSummary.complete,true);assert.equal(report.openingOperatorSummary,null);}else assert.equal('openingOperatorSummary' in report,false);
  assert.equal(report.financialFinality,'PROVISIONAL');assert.equal(report.financialReconciliationComplete,false);assert.equal(report.deliveryStatus,'PREVIEW_ONLY');assert.equal(report.employeeLiabilityAdjusted,false);assert.equal(JSON.stringify(rows),changedBefore);assert.ok(f.calls.every(({sql})=>!(/\b(?:INSERT|UPDATE|DELETE)\b/i.test(sql))));
 }
});
