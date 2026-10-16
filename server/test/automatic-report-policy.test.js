import test from "node:test";
import assert from "node:assert/strict";
import {reportBusinessPeriod,completedReportPeriod,dailyCashReportReadiness,summarizeCashVariances} from "../src/services/automatic-report-policy.js";

const settings={companyId:"C",storeId:"S",day:"2026-10-15",terminals:["MAIN"]};
const now=new Date("2026-10-16T08:00:00+03:00");
const shifts=()=>[7,15,23].map((hour,i)=>({id:`s${i}`,companyId:"C",storeId:"S",terminalPos:"MAIN",cashChain:"STORE",status:"CLOSED",openedAt:`2026-10-15T${hour.toString().padStart(2,"0")}:00:00+03:00`,closedAt:i===2?"2026-10-16T07:00:00+03:00":`2026-10-15T${hour+8}:00:00+03:00`,variance:0,openedBy:`operator${i}`}));

test("business days use Greek wall time through both DST transitions",()=>{
  const spring=reportBusinessPeriod("2026-03-28","2026-03-28"),autumn=reportBusinessPeriod("2026-10-24","2026-10-24");
  assert.equal((spring.to-spring.from)/3600000,23);assert.equal((autumn.to-autumn.from)/3600000,25);
  assert.equal(spring.to.toISOString(),"2026-03-29T04:00:00.000Z");
  assert.throws(()=>reportBusinessPeriod("2026-02-30","2026-02-30"));
  assert.throws(()=>reportBusinessPeriod("2026-10-15","2026-10-15",{dayStartHour:3}));
});
test("daily/weekly/monthly periods are fully completed and end exclusive",()=>{
  const monday=completedReportPeriod(new Date("2026-10-19T08:00:00+03:00"),"WEEKLY");
  assert.equal(monday.fromDay,"2026-10-12");assert.equal(monday.toDay,"2026-10-18");
  assert.equal(completedReportPeriod(new Date("2026-10-16T06:00:00+03:00"),"DAILY").toDay,"2026-10-14");
  assert.equal(completedReportPeriod(new Date("2026-11-01T08:00:00+02:00"),"MONTHLY").fromDay,"2026-10-01");
  assert.equal(completedReportPeriod(new Date("2026-11-01T08:00:00+02:00"),"MONTHLY").toDay,"2026-10-31");
  assert.throws(()=>completedReportPeriod(now,"UNKNOWN"));
});
test("daily report waits for actual third closure and completed business day",()=>{
  assert.equal(dailyCashReportReadiness(shifts(),settings,now).ready,true);
  const rows=shifts();rows[2].status="OPEN";rows[2].closedAt=null;
  assert.equal(dailyCashReportReadiness(rows,settings,now).ready,false);
  assert.ok(dailyCashReportReadiness(rows,settings,now).holds.some(x=>x.code==="THIRD_SHIFT_OPEN"));
  assert.equal(dailyCashReportReadiness(shifts(),settings,new Date("2026-10-16T06:00:00+03:00")).ready,false);
});
test("three arbitrary closed rows cannot substitute missing shift/terminal evidence",()=>{
  const rows=shifts();rows[1].openedAt="2026-10-15T08:00:00+03:00";
  assert.ok(dailyCashReportReadiness(rows,settings,now).holds.some(x=>x.code==="SHIFT_SLOT_MISSING"&&x.slot===2));
  assert.equal(dailyCashReportReadiness(shifts(),{...settings,terminals:["MAIN","POS2"]},now).ready,false);
  assert.equal(dailyCashReportReadiness(shifts(),{...settings,terminals:[]},now).ready,false);
});
test("explicit morning-only delivery cannot replace store third shift and must itself be closed",()=>{
  const config={...settings,terminals:["MAIN",{terminalPos:"DELIVERY",requiredSlots:[1]}]};
  const rows=[...shifts(),{...shifts()[0],id:"delivery",terminalPos:"DELIVERY",cashChain:"DELIVERY"}];
  assert.equal(dailyCashReportReadiness(rows,config,now).ready,true);
  rows[3].status="OPEN";assert.equal(dailyCashReportReadiness(rows,config,now).ready,false);
  assert.equal(dailyCashReportReadiness([rows[3]],{...settings,terminals:[{terminalPos:"DELIVERY",requiredSlots:[1]}]},now).ready,false);
});
test("foreign, duplicate, future, unknown variance and unconfigured terminal all hold dispatch",()=>{
  for(const change of [{companyId:"other"},{storeId:"other"},{id:"s0"},{closedAt:"2026-10-17T07:00:00+03:00"},{variance:null},{variance:""},{variance:false},{variance:NaN},{terminalPos:"OTHER"},{openedAt:"invalid"}]){
    const rows=shifts();Object.assign(rows[2],change);
    assert.equal(dailyCashReportReadiness(rows,settings,now).ready,false,JSON.stringify(change));
  }
});
test("cash offsets preserve original employee differences and cannot cross day/terminal/delivery",()=>{
  const rows=shifts();rows[0].variance=-10;rows[1].variance=8;
  const totals=summarizeCashVariances(rows);
  assert.deepEqual([totals[0].originalShortage,totals[0].originalSurplus,totals[0].offset,totals[0].netVariance],[10,8,8,-2]);
  assert.equal(totals[0].rows[0].variance,-10);assert.equal(totals[0].employeeLiabilityAdjusted,false);
  rows[1].cashChain="DELIVERY";assert.equal(summarizeCashVariances(rows).length,2);
  rows[1].cashChain="STORE";rows[1].terminalPos="POS2";assert.equal(summarizeCashVariances(rows).length,2);
  rows[1].terminalPos="MAIN";rows[1].openedAt="2026-10-16T15:00:00+03:00";assert.equal(summarizeCashVariances(rows).length,2);
  assert.throws(()=>summarizeCashVariances([rows[0],rows[0]]));
  assert.throws(()=>summarizeCashVariances([rows[0],{...rows[0],terminalPos:"OTHER"}]));
  assert.throws(()=>summarizeCashVariances([{...rows[0],cashChain:null}]));
});
