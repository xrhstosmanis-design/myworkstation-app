import test from 'node:test';
import assert from 'node:assert/strict';
import {salesReportCalendar} from '../src/services/sales-report-calendar.js';
import {salesComparisonPolicy,summarizeSalesComparison,readSalesReportComparison,SALES_COMPARISON_MAX_GROSS_CENTS} from '../src/services/sales-report-comparison.js';
const now=new Date('2026-11-02T10:00:00.000Z');
const input=(from='2026-10-25',to=from,compareFrom='2026-10-24',compareTo=compareFrom)=>{const calendar=salesReportCalendar(from,to);return {companyId:'c',storeId:'s',q:'Water',calendar,from:calendar.from,to:calendar.to,compareFrom,compareTo}};
function report(policy,which='current',amounts=[2]){
 const p=policy[which+'Period'],items=amounts.map((grossSales,i)=>({productId:'p'+i,grossSales}));
 return {companyId:policy.companyId,storeId:policy.storeId,period:{...p,timeZone:'Europe/Athens'},items,count:items.length,reversalAware:true,normalSaleCount:items.length?1:0,reversalCount:0,totalGross:amounts.reduce((a,b)=>a+b,0),sourceCoverage:{complete:true,returnedGroupCount:items.length,totalGroupCount:items.length,limit:10000,totalsScope:'COMPLETE_SOURCE'}};
}
const math=(current,previous)=>{const p=salesComparisonPolicy(input(),now);return summarizeSalesComparison(report(p,'current',current),report(p,'previous',previous),p)};
test('Athens calendar comparison uses actual DST bounds and equal calendar days rather than equal elapsed hours',()=>{
 const fall=salesComparisonPolicy(input(),now);assert.equal(fall.dayCount,1);assert.equal(fall.currentPeriod.elapsedHours,25);assert.equal(fall.previousPeriod.elapsedHours,24);assert.equal(fall.currentPeriod.from,'2026-10-24T21:00:00.000Z');assert.equal(fall.currentPeriod.toExclusive,'2026-10-25T22:00:00.000Z');
 const spring=salesComparisonPolicy(input('2026-03-29',undefined,'2026-03-28'),now);assert.equal(spring.currentPeriod.elapsedHours,23);assert.equal(spring.previousPeriod.elapsedHours,24);
 const week=salesComparisonPolicy(input('2026-10-26','2026-11-01','2026-10-19','2026-10-25'),now);assert.equal(week.dayCount,7);assert.equal(week.currentPeriod.elapsedHours,168);assert.equal(week.previousPeriod.elapsedHours,169);assert.equal(week.previousPeriod.from,'2026-10-18T21:00:00.000Z');
 assert.equal(fall.policy,'EQUAL_ENDED_ATHENS_CALENDAR_DAYS');assert.equal(fall.query,'Water');assert.equal(fall.asOf,now.toISOString());
});
test('end exactly at captured server time is closed; one millisecond before is refused',()=>{
 const f=input('2026-10-10',undefined,'2026-10-09');assert.doesNotThrow(()=>salesComparisonPolicy(f,f.to));assert.throws(()=>salesComparisonPolicy(f,new Date(f.to.getTime()-1)),e=>e.status===400);
});
test('strict paired dates, selected scope, chronology, lengths and current calendar agreement fail before any DB read',async()=>{
 let calls=0;const db={$transaction:async()=>{calls++;throw new Error('must not query')}};
 const invalids=[{compareFrom:undefined},{compareTo:undefined},{compareFrom:['2026-10-24']},{compareTo:['2026-10-24']},{compareFrom:''},{compareTo:' '},{compareFrom:'2026-02-30'},{compareFrom:'2026-10-24T00:00:00Z'},{storeId:''},{storeId:' s '},{companyId:''},{calendar:null},{calendar:{...input().calendar,timeZone:'UTC'}},{from:new Date('2026-10-25')},{to:new Date('2026-10-26')},{q:{}},{compareFrom:'2026-10-23',compareTo:'2026-10-24'},{compareFrom:'2026-10-25',compareTo:'2026-10-25'},{compareFrom:'2026-10-26',compareTo:'2026-10-26'}];
 for(const change of invalids)await assert.rejects(readSalesReportComparison({...input(),...change},{db,readReport:()=>{},now}),e=>e.status===400,JSON.stringify(change));
 await assert.rejects(readSalesReportComparison(input(),{db,readReport:()=>{},now:'invalid'}),e=>e.status===400);
 assert.equal(calls,0);
 const leap=salesComparisonPolicy(input('2024-01-01','2024-12-31','2020-01-01','2020-12-31'),now);assert.equal(leap.dayCount,366);
 assert.throws(()=>salesComparisonPolicy(input('2024-01-01','2025-01-01','2020-01-01','2020-12-31'),now),e=>e.status===400);
});
test('same authenticated scope and actual canonical callback share one RepeatableRead snapshot; prior never receives hourly',async()=>{
 const filters={...input(),includeHourly:true},p=salesComparisonPolicy(filters,now),calls=[];
 const tx={store:{findFirst:async options=>{calls.push(['store',options]);return {id:'s',companyId:'c'}}}};
 const db={$transaction:async(fn,options)=>{calls.push(['transaction',options]);return fn(tx)}};
 const readReport=async(f,{db})=>{assert.equal(db,tx);calls.push(['read',f]);const current=f.from.getTime()===filters.from.getTime();return {...report(p,current?'current':'previous',current?[3]:[2]),...(current?{hourlyActivity:{kept:true}}:{privatePreviousCost:999})}};
 const out=await readSalesReportComparison(filters,{db,readReport,now});
 assert.deepEqual(calls[0],['transaction',{isolationLevel:'RepeatableRead',maxWait:5000,timeout:15000}]);assert.deepEqual(calls[1],['store',{where:{id:'s',companyId:'c',active:true},select:{id:true,companyId:true}}]);
 assert.equal(calls.length,4);assert.equal(calls[2][1].includeHourly,true);assert.equal(Object.hasOwn(calls[3][1],'includeHourly'),false);assert.equal(Object.hasOwn(calls[2][1],'compareFrom'),false);
 for(const call of calls.slice(2)){assert.equal(call[1].companyId,'c');assert.equal(call[1].storeId,'s');assert.equal(call[1].q,'Water')}
 assert.deepEqual(out.hourlyActivity,{kept:true});assert.equal(out.comparison.revenueChangePercent,50);assert.equal(Object.hasOwn(out,'privatePreviousCost'),false);assert.equal(Object.hasOwn(out.comparison,'privatePreviousCost'),false);
});
test('inactive, foreign or absent store cannot start either source read',async()=>{
 for(const owned of [null,{id:'s',companyId:'foreign'},{id:'wrong',companyId:'c'}]){
  let reads=0;await assert.rejects(readSalesReportComparison(input(),{now,db:{$transaction:async fn=>fn({store:{findFirst:async()=>owned}})},readReport:()=>{reads++}}),e=>e.status===404);assert.equal(reads,0);
 }
});
test('signed gross comparisons reconcile exact cents, including floating addition noise and refunds',()=>{
 const out=math([.1,.2,-.05],[.1]);assert.equal(out.status,'AVAILABLE');assert.deepEqual([out.currentGrossCents,out.previousGrossCents,out.deltaGrossCents],[25,10,15]);assert.equal(out.revenueChangePercent,150);assert.equal(out.percentUnavailableReason,null);
 const refunds=math([-2],[1]);assert.equal(refunds.currentGrossCents,-200);assert.equal(refunds.revenueChangePercent,-300);
 assert.equal(out.financialFinality,'PROVISIONAL');assert.equal(out.financialReconciliationComplete,false);assert.deepEqual(out.basisLimitations,['NOT_WEEKDAY_OR_SEASONAL_EQUIVALENCE','NOT_FINAL_FINANCIAL_RECONCILIATION']);
});
test('zero and negative prior bases retain signed amounts but never invent a percentage or infinity',()=>{
 for(const current of [[],[0],[2],[-2]]){const out=math(current,[]);assert.equal(out.revenueChangePercent,null);assert.equal(out.percentUnavailableReason,'ZERO_BASE')}
 const negative=math([2],[-1]);assert.equal(negative.deltaGrossCents,300);assert.equal(negative.revenueChangePercent,null);assert.equal(negative.percentUnavailableReason,'NEGATIVE_BASE');
});
test('either partial, unknown, inconsistent or wrong-scope source suppresses all comparison amounts before financial math',()=>{
 const p=salesComparisonPolicy(input(),now);
 const changes=[r=>delete r.sourceCoverage,r=>r.sourceCoverage=Object.assign([],r.sourceCoverage),r=>r.sourceCoverage.complete=false,r=>r.sourceCoverage.totalsScope='RETURNED_GROUPS',r=>r.sourceCoverage.totalGroupCount++,r=>r.sourceCoverage.returnedGroupCount++,r=>r.sourceCoverage.limit=10001,r=>r.sourceCoverage.limit=0,r=>r.companyId='x',r=>r.storeId='other',r=>r.period.from='invalid',r=>r.count++,r=>r.reversalAware=false,r=>r.normalSaleCount=-1,r=>r.reversalCount=.5,r=>{r.normalSaleCount=0;r.reversalCount=0}];
 for(const which of ['current','previous'])for(const change of changes){const current=report(p),previous=report(p,'previous');change(which==='current'?current:previous);current.totalGross=NaN;const out=summarizeSalesComparison(current,previous,p);assert.equal(out.status,'SOURCE_LIMITED');assert.equal(out.unavailableReason,'SOURCE_LIMITED');for(const key of ['currentGrossCents','previousGrossCents','deltaGrossCents','revenueChangePercent'])assert.equal(Object.hasOwn(out,key),false,key)}
});
test('genuine sub-cent, missing, nonnumeric, nonfinite, inconsistent and unsafe financial amounts fail closed',()=>{
 const p=salesComparisonPolicy(input(),now);
 for(const value of [null,undefined,'1',NaN,Infinity,-Infinity,.001,1.005,Number.MAX_SAFE_INTEGER]){const current=report(p,'current',[value]);awaitableReject(()=>summarizeSalesComparison(current,report(p,'previous'),p));}
 const inconsistent=report(p);inconsistent.totalGross=999;awaitableReject(()=>summarizeSalesComparison(inconsistent,report(p,'previous'),p));
 const unsafe=Number.MAX_SAFE_INTEGER/100;awaitableReject(()=>math([unsafe],[ -unsafe ]));
 for(const value of [.0000000001,.1+.2])awaitableReject(()=>math([value],[1]));
});
function awaitableReject(fn){assert.throws(fn,e=>e.status===502)}
test('complete exact-cap source may compare; cap overflow is explicitly limited',()=>{
 const p=salesComparisonPolicy(input(),now),current=report(p,'current',Array(10000).fill(.01)),prior=report(p,'previous',[1]);
 const out=summarizeSalesComparison(current,prior,p);assert.equal(out.currentGrossCents,10000);assert.equal(out.revenueChangePercent,9900);
 current.sourceCoverage={...current.sourceCoverage,complete:false,totalGroupCount:10001,totalsScope:'RETURNED_GROUPS'};assert.equal(summarizeSalesComparison(current,prior,p).status,'SOURCE_LIMITED');
});

test('ten thousand exact-cent SQL rows retain authoritative cents despite canonical JS aggregate noise',()=>{
 for(const amount of [100.01,100000.01]){
  const p=salesComparisonPolicy(input(),now),current=report(p,'current',Array(10000).fill(amount));
  assert.notEqual(current.totalGross,Math.round(amount*100)*10000/100);
  const out=summarizeSalesComparison(current,report(p,'previous',[1]),p);
  assert.equal(out.currentGrossCents,Math.round(amount*100)*10000);
  assert.equal(out.deltaGrossCents,out.currentGrossCents-100);
  current.totalGross+=.01;assert.throws(()=>summarizeSalesComparison(current,report(p,'previous',[1]),p),e=>e.status===502);
 }
});
test('conservative row and aggregate precision bounds reject large Number aliasing without changing default report amounts',()=>{
 const maximum=SALES_COMPARISON_MAX_GROSS_CENTS/100;
 const allowed=math([maximum],[maximum-.01]);assert.equal(allowed.currentGrossCents,SALES_COMPARISON_MAX_GROSS_CENTS);assert.equal(allowed.deltaGrossCents,1);
 for(const value of [maximum+.01,-maximum-.01,90071992547409.90])assert.throws(()=>math([value],[1]),e=>e.status===502);
 assert.throws(()=>math([maximum,.01],[1]),e=>e.status===502);
 const opposite=math([maximum],[-maximum]);assert.equal(opposite.deltaGrossCents,2*SALES_COMPARISON_MAX_GROSS_CENTS);assert.equal(opposite.revenueChangePercent,null);
});

