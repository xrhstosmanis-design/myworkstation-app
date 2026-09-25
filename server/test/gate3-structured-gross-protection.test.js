import test from 'node:test';
import assert from 'node:assert/strict';
import {finalizeV244ProductLines} from '../../client/src/lib/invoice-v244-safe.js';

test('ΜΟΥΧΑΛΗΣ: product strength 1,8% cannot replace a balanced printed quantity when gross was copied from net',()=>{
  const [line]=finalizeV244ProductLines([{
    code:'019277',description:'VEEV ONE MELLON COCONUT 1,8% (1 POD)',
    rawText:'019277 VEEV ONE MELLON COCONUT 1,8% (1 POD) TEM 6 2,131763 12,79 24',
    quantity:6,unitCost:2.131763,netAmount:12.79,grossAmount:12.79,vatRate:24
  }]);
  assert.equal(line.quantity,6);
  assert.equal(line.unitCost,2.131763);
  assert.equal(line.netAmount,12.79);
  assert.equal(line.vatRate,24);
  assert.equal(line.grossAmount,15.86);
  assert.equal(line.grossRecoveredFromNetAndVat,true);
  assert.equal(line.sourceColumnsVerified,false);
});

test('valid ΡΗΓΑΣ VAT row keeps its printed economics',()=>{
  const [line]=finalizeV244ProductLines([{
    code:'1935',description:'POD2.0 MYBLU STRAWBERRY MINT 1.6%',
    rawText:'1935 POD2.0 MYBLU STRAWBERRY MINT 1.6% ΠΑΚ 2 4,239 8,48 24 10,52',
    quantity:2,unitCost:4.239,netAmount:8.48,grossAmount:10.52,vatRate:24,
    sourceColumnsVerified:true
  }]);
  assert.equal(line.quantity,2);
  assert.equal(line.grossAmount,10.52);
  assert.equal(line.grossRecoveredFromNetAndVat,undefined);
});

test('ambiguous row arithmetic is never promoted to verified OCR',()=>{
  const [line]=finalizeV244ProductLines([{
    code:'DEL005',description:'COFFEE UNION',rawText:'DEL005 COFFEE UNION KG 1 13,50 25 10,13',
    quantity:12,unitCost:13.5,discount1:25,netAmount:10.13,grossAmount:10.13,vatRate:13
  }]);
  assert.notEqual(line.grossRecoveredFromNetAndVat,true);
  assert.equal(line.sourceColumnsVerified,false);
});
