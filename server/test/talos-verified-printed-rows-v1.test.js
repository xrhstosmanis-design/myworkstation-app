import test from 'node:test';
import assert from 'node:assert/strict';
import {applyTalosVerifiedPrintedRows} from '../src/routes/platform-invoice-learning-ai.js';

const rows=[
  ['4014386',2,'TEM 4,00 1.06 4.24 14.90 41.08 2.11 2.13 13',4,2.13],
  ['4266583',11,'TEM 20,00 1.05 21.00 21.00 30.00 9.39 11.61 13',20,11.61],
  ['4270121',11,'TEM 20,00 1.05 21.00 21.00 30.00 9.39 11.61 13',20,11.61],
  ['4320394',13,'TEM 18,00 1.11 19.98 18.80 12.00 5.70 14.28 13',18,14.28],
  ['4323714',3,'TEM 4,00 1.23 4.92 15.60 12.00 1.27 3.65 13',4,3.65],
  ['4323717',0,'TEM 6,00 1.02 6.12 18.40 12.00 1.73 4.39 13',6,4.39],
  ['4323803',3,'TEM 4,00 1.23 4.92 15.60 12.00 1.27 3.65 13',4,3.65],
  ['4323811',3,'TEM 4,00 1.23 4.92 15.60 12.00 1.27 3.65 13',4,3.65],
  ['4324338',5,'TEM 7,00 1.02 7.14 18.40 12.00 2.01 5.13 13',7,5.13],
  ['4327322',5,'TEM 7,00 0.85 5.95 18.30 12.00 1.67 4.28 13',7,4.28],
  ['4327325',5,'TEM 7,00 0.85 5.95 18.30 12.00 1.67 4.28 13',7,4.28],
  ['4327428',5,'TEM 7,00 0.85 5.95 18.30 12.00 1.67 4.28 13',7,4.28],
  ['4332684',1.44,'TEM 2,00 2.65 5.30 11.20 18.00 1.44 3.86 13',2,3.86],
  ['4323717-R',0,'TEM 6.12 18.40 12.00 1.73 4.39 13 1.02',6,4.39],
  ['4266583-R',11,'TEM 1.05 21.00 21.00 30.00 9.39 11.61 13',20,11.61],
];

test('TALOS repairs every mathematically verified printed quantity on the server',()=>{
  const input={supplier:{name:'ΤΑΛΩΣ ΑΕ',taxId:'800802293'},productLines:rows.map(([code,quantity,suffix])=>({supplierItemCode:code,quantity,unitPrice:1,netAmount:1,azureRawRow:`${code} PRODUCT TEM ${suffix.replace(/^TEM /,'')}`}))};
  const output=applyTalosVerifiedPrintedRows(input);
  assert.deepEqual(output.productLines.map(line=>[line.supplierItemCode,line.quantity,line.netAmount]),rows.map(row=>[row[0],row[3],row[4]]));
  assert.ok(output.productLines.every(line=>line.quantitySource==='TALOS_PRINTED_ROW_VERIFIED'));
});

test('TALOS repair leaves other suppliers and unbalanced rows unchanged',()=>{
  const line={quantity:2,unitPrice:1,netAmount:2,azureRawRow:'1 PRODUCT TEM 9 1.00 8.00 10.00 10.00 1.00 7.00 13'};
  assert.strictEqual(applyTalosVerifiedPrintedRows({supplier:{taxId:'123'},productLines:[line]}).productLines[0],line);
  assert.strictEqual(applyTalosVerifiedPrintedRows({supplier:{taxId:'800802293'},productLines:[line]}).productLines[0],line);
});

test('TALOS exact 44-row layout is repaired when cached supplier metadata is absent',()=>{
  const signatureCodes=['3759850','4011985','4323717','4332684','8741200','6400600'];
  const productLines=Array.from({length:44},(_,index)=>({
    supplierItemCode:signatureCodes[index]||String(9000000+index),
    quantity:index===2?0:1,
    unitPrice:1,
    netAmount:1,
    azureRawRow:index===2?'4323717 PRODUCT TEM 6,00 1.02 6.12 18.40 12.00 1.73 4.39 13':`${9000000+index} PRODUCT`,
  }));
  const output=applyTalosVerifiedPrintedRows({productLines});
  assert.equal(output.productLines[2].quantity,6);
  assert.equal(output.productLines[2].unitPrice,1.02);
  assert.equal(output.productLines[2].netAmount,4.39);
  assert.equal(output.productLines[2].quantitySource,'TALOS_PRINTED_ROW_VERIFIED');
});

test('TALOS top-level supplier identity used by the Learning response is accepted',()=>{
  const line={supplierItemCode:'4323717',quantity:0,unitPrice:1,netAmount:1,azureRawRow:'4323717 PRODUCT TEM 6,00 1.02 6.12 18.40 12.00 1.73 4.39 13'};
  const output=applyTalosVerifiedPrintedRows({supplierTaxId:'800802293',supplierName:'ΤΑΛΩΣ ΑΕ',productLines:[line]});
  assert.equal(output.productLines[0].quantity,6);
  assert.equal(output.productLines[0].netAmount,4.39);
});

test('TALOS layout fallback stays closed without the exact row count and signature',()=>{
  const line={supplierItemCode:'4323717',quantity:0,unitPrice:1,netAmount:1,azureRawRow:'4323717 PRODUCT TEM 6,00 1.02 6.12 18.40 12.00 1.73 4.39 13'};
  const productLines=Array.from({length:44},()=>({...line}));
  assert.equal(applyTalosVerifiedPrintedRows({productLines:productLines.slice(0,43)}).productLines[0].quantity,0);
  assert.equal(applyTalosVerifiedPrintedRows({productLines}).productLines[0].quantity,0);
});
