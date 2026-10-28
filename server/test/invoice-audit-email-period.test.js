import test from 'node:test';
import assert from 'node:assert/strict';
import {invoiceAuditEmailPeriod} from '../src/services/invoice-audit-email-period.js';

test('invoice email uses the last calendar day at 23:59 Athens including leap February, year rollover and DST',()=>{
 for(const [month,local,utc]of [['2024-02','2024-02-29 23:59','2024-02-29T21:59:00.000Z'],['2026-02','2026-02-28 23:59','2026-02-28T21:59:00.000Z'],['2026-03','2026-03-31 23:59','2026-03-31T20:59:00.000Z'],['2026-10','2026-10-31 23:59','2026-10-31T21:59:00.000Z'],['2026-12','2026-12-31 23:59','2026-12-31T21:59:00.000Z']]){
  const p=invoiceAuditEmailPeriod(month);assert.equal(p.nominalLocalTime,local);assert.equal(p.nominalScheduledAt,utc);assert.equal(p.timeZone,'Europe/Athens');assert.equal(p.observationBasis,'PROVISIONAL_AS_OBSERVED');
 }
 assert.equal(invoiceAuditEmailPeriod('2026-12').toDayExclusive,'2027-01-01');
});
test('invoice email period rejects malformed, coerced or out-of-range months',()=>{
 for(const month of [null,{},['2026-10'],'2026-00','2026-13','1999-12','2026-10\n','2026-1'])assert.throws(()=>invoiceAuditEmailPeriod(month));
});
