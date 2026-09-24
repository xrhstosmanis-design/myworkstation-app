import test from 'node:test';
import assert from 'node:assert/strict';
import {reusableVerifiedPrintedTable} from '../src/invoice-line-reconciliation.js';

test('matching header total alone cannot authorize reuse of partial OCR rows',()=>{
  const totalsOnly=[{description:'A',quantity:1,unitCost:10,netAmount:10,vatRate:0,grossAmount:10}];
  assert.equal(reusableVerifiedPrintedTable(totalsOnly,10),false);
  const proved={...totalsOnly[0],sourceColumnsVerified:true,quantitySource:'AI_COMPLETE_PRINTED_TABLE_VERIFIED'};
  assert.equal(reusableVerifiedPrintedTable([proved],10),true);
  assert.equal(reusableVerifiedPrintedTable([proved,{...totalsOnly[0],netAmount:0,grossAmount:0}],10),false);
  assert.equal(reusableVerifiedPrintedTable([proved],11),false);
});
