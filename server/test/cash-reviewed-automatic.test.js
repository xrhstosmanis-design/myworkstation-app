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
