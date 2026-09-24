import test from 'node:test';
import assert from 'node:assert/strict';
import {buildCompletePrintedTableCandidate} from '../src/lib/invoice-discount-verifier.js';

// A real LAB acceptance example from another supplier. Keep the physical rows
// distinct even when an OCR source returns an apparently balanced alternative.
test('Kontogiannis 129979: two printed rows and 13% footer survive complete-table verification',()=>{
  const rows=[
    {index:1,supplierCode:'0055',description:'PRINTED ITEM 0055',printedUnit:'ΤΕΜ',printedQuantity:10,originalUnitPrice:1.25,initialAmount:12.50,netAmount:12.50,vatRate:13,confidence:99},
    {index:2,supplierCode:'0320',description:'PRINTED ITEM 0320',printedUnit:'ΤΕΜ',printedQuantity:5,originalUnitPrice:2.20,initialAmount:11,netAmount:11,vatRate:13,confidence:99}
  ];
  const footer=[{rate:13,taxable:23.50,vat:3.06,gross:26.56}];
  const accepted=buildCompletePrintedTableCandidate(rows,26.56,footer);
  assert.equal(accepted?.length,2);
  assert.equal(accepted?.reduce((sum,row)=>sum+row.quantity,0),15);
  assert.equal(buildCompletePrintedTableCandidate(rows,26.56,[{rate:0,taxable:26.56,vat:0,gross:26.56}]),null);
  assert.equal(buildCompletePrintedTableCandidate(rows.map((row,index)=>index===1?{...row,printedQuantity:50}:row),26.56,footer),null);
  assert.equal(buildCompletePrintedTableCandidate([...rows,{...rows[1],index:3}],26.56,footer),null);
});
