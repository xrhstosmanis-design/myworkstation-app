import test from 'node:test';
import assert from 'node:assert/strict';
import {businessPictureCalendarRange as range} from '../src/business-picture-dates.js';
import {businessPicturePreset as preset} from '../../client/src/components/cloud/business-picture-dates.js';
test('Greek calendar day boundaries follow winter and summer offsets',()=>{
 const jan=range('2026-01-01','2026-01-01'),oct=range('2026-10-01','2026-10-01');
 assert.equal(jan.from.toISOString(),'2025-12-31T22:00:00.000Z');assert.equal(jan.to.toISOString(),'2026-01-01T21:59:59.999Z');
 assert.equal(oct.from.toISOString(),'2026-09-30T21:00:00.000Z');assert.equal(oct.to.toISOString(),'2026-10-01T20:59:59.999Z');
});
test('DST transition days have 23 and 25 hours and leap dates validate',()=>{
 const spring=range('2026-03-29','2026-03-29'),autumn=range('2026-10-25','2026-10-25');
 assert.equal(spring.to-spring.from+1,23*3600000);assert.equal(autumn.to-autumn.from+1,25*3600000);
 assert.equal(range('2024-02-29','2024-02-29').calendarFrom,'2024-02-29');
});
test('invalid normalized dates and inverted or partial periods reject before queries',()=>{
 for(const [a,b] of [['2026-02-30','2026-03-01'],['2026-02-29','2026-03-01'],['2026-04-31','2026-05-01'],['2026-10-02','2026-10-01'],['2026-10-01',undefined],['1999-12-31','2000-01-01'],['2101-01-01','2101-01-01']])assert.throws(()=>range(a,b),{status:400});
});
test('defaults and current month start on the first Greek calendar day',()=>{
 const now=new Date('2026-09-30T21:15:00Z');
 assert.deepEqual(preset('DEFAULT',now),{from:'2026-08-01',to:'2026-10-01'});
 assert.deepEqual(preset('CURRENT_MONTH',now),{from:'2026-10-01',to:'2026-10-01'});
});
test('previous quarter is complete and handles year rollover',()=>{
 assert.deepEqual(preset('PREVIOUS_QUARTER',new Date('2026-10-01T12:00Z')),{from:'2026-07-01',to:'2026-09-30'});
 assert.deepEqual(preset('PREVIOUS_QUARTER',new Date('2026-01-01T12:00Z')),{from:'2025-10-01',to:'2025-12-31'});
});
