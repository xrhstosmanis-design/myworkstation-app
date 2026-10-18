import test from "node:test";
import assert from "node:assert/strict";
import {cashPreviewPeriod,reportDayOffset,reportWallTime} from "../src/services/automatic-report-policy.js";
import {readAutomaticCashPreview} from "../src/services/automatic-report-source.js";

const configuration={dayStartHour:7,terminals:["MAIN",{terminalPos:"DELIVERY",requiredSlots:[1]}]};
const args={actorId:"sa",companyId:"c",storeId:"s",day:"2026-10-18",frequency:"MONTHLY",configuration,now:new Date("2026-11-01T09:00:00+02:00")};
function monthRows(){return Array.from({length:31},(_,d)=>{
 const day=reportDayOffset("2026-10-01",d),next=reportDayOffset(day,1);
 return [7,15,23].map((hour,slot)=>({id:`${d}-${slot}`,companyId:"c",storeId:"s",terminalPos:"MAIN",status:"CLOSED",openedBy:slot===0?"a":"b",openedByName:slot===0?"Alice":"Bob",openedAt:reportWallTime(day,7),closedAt:reportWallTime(slot===2?next:day,7),variance:slot===0?-10:slot===1?8:0})).map((r,slot)=>({...r,openedAt:new Date(reportWallTime(day,7).getTime()+[0,8,16][slot]*3600000),closedAt:slot===2?reportWallTime(next,7):new Date(reportWallTime(day,7).getTime()+[8,16][slot]*3600000)})).concat([{id:`${d}-delivery`,companyId:"c",storeId:"s",terminalPos:"DELIVERY",status:"CLOSED",openedBy:"a",openedByName:"Alice",openedAt:reportWallTime(day,7),closedAt:reportWallTime(day,12),variance:20}]);
}).flat()}
function fixture(rows){const calls=[];const tx={user:{findUnique:async()=>({role:"SUPER_ADMIN"})},store:{findFirst:async()=>({id:"s",companyId:"c",name:"LAB"})},$queryRaw:async(strings,...values)=>{const sql=strings.join("?");calls.push({sql,values});return sql.includes('FROM "CashControlStoreRule"')?[{mode:"FULL",deliveryTerminalPattern:"DELIVERY",carryOverEnabled:true,posEftposEnabled:true}]:rows}};return{calls,db:{$transaction:async(fn,options)=>{assert.equal(options.isolationLevel,"RepeatableRead");return fn(tx)}}}}

test("monthly calendar bounds respect leap years, year rollover and Athens business-day DST",()=>{
 for(const [anchor,end,days] of [["2026-02-18","2026-02-28",28],["2028-02-29","2028-02-29",29],["2026-04-30","2026-04-30",30],["2026-12-31","2026-12-31",31]])for(const hour of [6,7]){
  const p=cashPreviewPeriod(anchor,"MONTHLY",{dayStartHour:hour});assert.equal(p.fromDay,anchor.slice(0,7)+"-01");assert.equal(p.toDay,end);assert.equal(p.from.getTime(),reportWallTime(p.fromDay,hour).getTime());assert.equal(p.to.getTime(),reportWallTime(reportDayOffset(end,1),hour).getTime());assert.equal((Date.parse(p.toDay)-Date.parse(p.fromDay))/86400000+1,days);
 }
 assert.equal((cashPreviewPeriod("2026-03-15","MONTHLY").to-cashPreviewPeriod("2026-03-15","MONTHLY").from)/3600000,31*24-1);
 assert.equal((cashPreviewPeriod("2026-10-25","MONTHLY").to-cashPreviewPeriod("2026-10-25","MONTHLY").from)/3600000,31*24+1);
 assert.throws(()=>cashPreviewPeriod("2026-02-30","MONTHLY"));assert.throws(()=>cashPreviewPeriod("2026-10-18","YEARLY"));
});
test("monthly snapshot checks every day and keeps original employee rows separate per day and cash chain",async()=>{
 const rows=monthRows(),before=JSON.stringify(rows),f=fixture(rows),r=await readAutomaticCashPreview(f.db,args);
 assert.equal(r.ready,true);assert.equal(r.kind,"MONTHLY_CASH_PREVIEW");assert.equal(r.frequency,"MONTHLY");assert.equal(r.sourceReadiness,"READY");assert.equal(r.financialFinality,"PROVISIONAL");assert.equal(r.financialReconciliationComplete,false);assert.equal(r.employeeLiabilityAdjusted,false);assert.equal(r.deliveryStatus,"PREVIEW_ONLY");assert.equal(r.dayReadiness.length,31);assert.equal(r.sourceCount,124);assert.equal(r.groups.length,62);
 for(const group of r.groups){assert.equal(group.employeeLiabilityAdjusted,false);if(group.cashChain==="STORE"){assert.deepEqual([group.originalShortage,group.originalSurplus,group.offset,group.netVariance],[10,8,8,-2]);assert.deepEqual(group.rows.map(x=>x.employeeId),["a","b","b"])}else assert.equal(group.netVariance,20)}
 assert.equal(JSON.stringify(rows),before);assert.equal(f.calls.length,2);const q=f.calls.find(c=>c.sql.includes('FROM "CashShiftSession"'));assert.deepEqual(q.values.slice(0,2),["c","s"]);assert.equal(q.values[2].toISOString(),"2026-11-01T05:00:00.000Z");assert.equal(q.values[3].toISOString(),"2026-10-01T04:00:00.000Z");assert.ok(f.calls.every(x=>!(/\b(?:INSERT|UPDATE|DELETE)\b/i.test(x.sql))));
});
test("monthly missing, unfinished, carried, invalid or capped source suppresses all totals",async()=>{
 for(const mode of ["missing","open","old","duplicate","foreign","future","cap"]){let rows=monthRows();if(mode==="missing")rows=rows.filter(r=>r.id!=="14-1");if(mode==="open")Object.assign(rows.find(r=>r.id==="30-2"),{status:"OPEN",closedAt:null});if(mode==="old")rows.push({...rows[0],id:"old",openedAt:reportWallTime("2026-09-30",7),status:"OPEN",closedAt:null});if(mode==="duplicate")rows[4].id=rows[0].id;if(mode==="foreign")rows[0].companyId="foreign";if(mode==="future")rows.push({...rows[0],id:"future",openedAt:reportWallTime("2026-11-01",7)});if(mode==="cap")rows=Array.from({length:1001},(_,i)=>({...rows[0],id:String(i)}));
 const r=await readAutomaticCashPreview(fixture(rows).db,args);assert.equal(r.ready,false,mode);assert.equal(r.groups,null,mode);assert.equal(r.sourceReadiness,"HOLD");assert.equal(r.financialFinality,"PROVISIONAL");if(mode==="missing")assert.ok(r.holds.some(h=>h.day==="2026-10-15"&&h.slot===2));if(mode==="cap"){assert.equal(r.complete,false);assert.ok(r.holds.some(h=>h.code==="SOURCE_LIMIT_EXCEEDED"&&h.limit===1000))}}
 const r=await readAutomaticCashPreview(fixture(monthRows()).db,{...args,now:new Date("2026-10-31T09:00:00+02:00")});assert.equal(r.ready,false);assert.equal(r.groups,null);assert.ok(r.holds.some(h=>h.day==="2026-10-31"&&h.code==="BUSINESS_DAY_NOT_FINISHED"));
});
