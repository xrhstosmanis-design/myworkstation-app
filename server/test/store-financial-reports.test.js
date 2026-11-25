import test from 'node:test';
import assert from 'node:assert/strict';
import {financialReportFilters} from '../src/services/store-financial-reports.js';
import {staffRequestCapability} from '../../shared/backoffice-staff.mjs';

test('financial report periods count calendar days across the Athens DST boundary',()=>{
  const {start,end,days}=financialReportFilters({from:'2026-10-24',to:'2026-10-26',report:'monthly'});
  assert.equal(start.toISOString(),'2026-10-23T21:00:00.000Z');
  assert.equal(end.toISOString(),'2026-10-26T22:00:00.000Z');
  assert.equal(days,3);
});

test('financial reports reject invalid, inverted and excessive date ranges',()=>{
  const base={from:'2026-11-01',to:'2026-11-30',report:'monthly'};
  for(const bad of [{from:'2026-11-31'},{to:'2026-02-31',from:'2026-02-01'},
    {from:'2026-12-01'},{from:'2024-01-01'},{report:'all-stores'},{key:['a','b']}]) {
    assert.throws(()=>financialReportFilters({...base,...bad}),{status:400});
  }
});

test('delegated staff require the explicit store sales analysis permission for the read endpoint',()=>{
  const path='/api/commerce/sales/financial-reports';
  assert.equal(staffRequestCapability('GET',path), 'store-reports-sales-analysis.read');
  assert.equal(staffRequestCapability('POST',path), null);
});
