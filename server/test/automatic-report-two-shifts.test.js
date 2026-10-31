import test from 'node:test';
import assert from 'node:assert/strict';
import {dailyCashReportReadiness,reportBusinessPeriod} from '../src/services/automatic-report-policy.js';
import {automaticReportConfigurationSchema} from '../src/services/automatic-report-settings.js';

const configuration={dayStartHour:7,secondShiftStartHour:15,thirdShiftStartHour:null,terminals:[{terminalPos:'TWO',requiredSlots:[1,2]}],cashRule:{mode:'FULL',deliveryTerminalPattern:'DELIVERY',carryOverEnabled:true,posEftposEnabled:true}};
const settings={...configuration,companyId:'c',storeId:'s',day:'2026-10-15'};
const now=new Date('2026-10-16T08:00:00+03:00');
const rows=(close='2026-10-16T00:20:00+03:00')=>[
 {id:'morning',companyId:'c',storeId:'s',terminalPos:'TWO',status:'CLOSED',openedAt:'2026-10-15T07:10:00+03:00',closedAt:'2026-10-15T15:10:00+03:00',variance:-10},
 {id:'afternoon',companyId:'c',storeId:'s',terminalPos:'TWO',status:'CLOSED',openedAt:'2026-10-15T15:10:00+03:00',closedAt:close,variance:8}
];
test('explicit two-shift schema accepts absent third boundary but still validates required third, slot identity and hours',()=>{
 assert.deepEqual(automaticReportConfigurationSchema.parse(configuration),configuration);
 assert.equal(automaticReportConfigurationSchema.safeParse({...configuration,thirdShiftStartHour:23}).success,true);
 for(const change of [{thirdShiftStartHour:undefined},{thirdShiftStartHour:''},{thirdShiftStartHour:15},{thirdShiftStartHour:24},{secondShiftStartHour:7},{terminals:[{terminalPos:'TWO',requiredSlots:[1,2,3]}]},{terminals:[{terminalPos:'TWO',requiredSlots:[1,1]}]},{terminals:[]}])assert.equal(automaticReportConfigurationSchema.safeParse({...configuration,...change}).success,false,JSON.stringify(change));
});
test('two actual closed shifts are ready for variable late closing, never require a fabricated third',()=>{
 for(const close of ['2026-10-15T23:00:00+03:00','2026-10-16T00:00:00+03:00','2026-10-16T00:20:00+03:00']){
  const result=dailyCashReportReadiness(rows(close),settings,now);
  assert.equal(result.ready,true,JSON.stringify(result.holds));assert.deepEqual(result.sessionIds,['morning','afternoon']);
 }
 // Last configured slot extends to the next business morning even if a retained
 // numeric third boundary exists for a different three-shift terminal.
 const late=rows();late[0].closedAt='2026-10-15T23:10:00+03:00';late[1].openedAt=late[0].closedAt;
 assert.equal(dailyCashReportReadiness(late,{...settings,thirdShiftStartHour:23},now).ready,true);
 late[0].closedAt='2026-10-16T00:10:00+03:00';late[1].openedAt=late[0].closedAt;
 assert.equal(dailyCashReportReadiness(late,settings,now).ready,true);
});
test('two-shift reporting retains missing, open, unknown, scope, duplicate, overlap and unfinished-day holds',()=>{
 for(const change of [{status:'OPEN',closedAt:null},{variance:null},{companyId:'foreign'},{storeId:'foreign'},{id:'morning'},{terminalPos:'OTHER'},{openedAt:'2026-10-15T14:50:00+03:00'},{closedAt:'2026-10-17T00:00:00+03:00'}]){
  const source=rows();Object.assign(source[1],change);assert.equal(dailyCashReportReadiness(source,settings,now).ready,false,JSON.stringify(change));
 }
 assert.equal(dailyCashReportReadiness(rows().slice(0,1),settings,now).ready,false);
 assert.equal(dailyCashReportReadiness(rows(),settings,new Date('2026-10-16T06:59:00+03:00')).ready,false);
 assert.throws(()=>dailyCashReportReadiness(rows(),{...settings,terminals:[{terminalPos:'TWO',requiredSlots:[1,2,3]}]},now));
});
test('two-shift day boundaries retain Greek DST and original source identities',()=>{
 for(const [day,next,offset,hours] of [['2026-03-28','2026-03-29','+02:00',23],['2026-10-24','2026-10-25','+03:00',25]]){
  const source=rows().map((row,i)=>({...row,openedAt:day+(i?'T15:10:00':'T07:10:00')+offset,closedAt:(i?next:day)+(i?'T00:20:00':'T15:10:00')+offset}));
  const before=structuredClone(source),period=reportBusinessPeriod(day,day);
  assert.equal((period.to-period.from)/3600000,hours);
  assert.equal(dailyCashReportReadiness(source,{...settings,day},new Date(period.to.getTime()+3600000)).ready,true);
  assert.deepEqual(source,before);
 }
});
