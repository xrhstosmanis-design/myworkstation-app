import test from 'node:test';
import assert from 'node:assert/strict';
import {automaticReportConfigurationSchema} from '../src/services/automatic-report-settings.js';
import {cashRuleFields,legacyCashControlRule} from '../src/services/cash-control-rules.js';

const base=()=>({dayStartHour:7,secondShiftStartHour:15,thirdShiftStartHour:23,terminals:[{terminalPos:'MAIN',requiredSlots:[1,2,3]}],cashRule:cashRuleFields(legacyCashControlRule({name:'LAB'}))});
test('optional reviewed mode preserves old settings shape and requires an explicit boolean',()=>{
  assert.deepEqual(automaticReportConfigurationSchema.parse(base()),base());
  for(const value of [true,false])assert.equal(automaticReportConfigurationSchema.parse({...base(),reviewedReconciliation:value}).reviewedReconciliation,value);
  for(const value of ['true',null,1,{}])assert.equal(automaticReportConfigurationSchema.safeParse({...base(),reviewedReconciliation:value}).success,false);
});

import {readAutomaticDailyCashPreview} from '../src/services/automatic-report-source.js';
import {buildAutomaticCashPayload} from '../src/services/automatic-report-cash-payload.js';
test('explicit reviewed mode fails closed until reviewed result is available',async()=>{
 const configuration={...base(),reviewedReconciliation:true};
 const rows=[7,15,23].map((hour,i)=>({id:String(i),companyId:'c',storeId:'s',terminalPos:'MAIN',status:'CLOSED',openedAt:new Date(`2026-10-15T${String(hour).padStart(2,'0')}:00:00+03:00`),closedAt:new Date(i===2?'2026-10-16T07:00:00+03:00':`2026-10-15T${hour+8}:00:00+03:00`),variance:0}));
 const tx={user:{findUnique:async()=>({role:'SUPER_ADMIN'})},store:{findFirst:async()=>({id:'s',companyId:'c',name:'LAB'})},$queryRaw:async strings=>strings.join('').includes('FROM "AutomaticReportSettings"')?[{version:1}]:strings.join('').includes('FROM "CashControlStoreRule"')?[]:rows};
 const preview=await readAutomaticDailyCashPreview({$transaction:fn=>fn(tx)},{actorId:'u',companyId:'c',storeId:'s',day:'2026-10-15',configuration,settingsVersion:1,now:new Date('2026-10-16T08:00:00+03:00')});
 assert.equal(preview.ready,true);
 assert.equal(preview.reviewedReconciliation,true);
 assert.throws(()=>buildAutomaticCashPayload({preview,companyId:'c',storeId:'s',settingsVersion:1}),e=>e.code==='INVALID_CASH_PAYLOAD');
});
