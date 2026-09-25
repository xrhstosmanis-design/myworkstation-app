import test from 'node:test';
import assert from 'node:assert/strict';
import {buildCompletePrintedTableCandidate} from '../src/lib/invoice-discount-verifier.js';

// Physical rows transcribed from the archived LAB originals, not earlier OCR output.
const row=(index,code,description,quantity,price,discount1,amount1,net,vat,gross,discount2=0,amount2=0)=>({
  index,supplierCode:code,description,printedUnit:'ΤΕΜ',printedQuantity:quantity,
  originalUnitPrice:price,initialAmount:Math.round(quantity*price*100)/100,
  discountPercent1:discount1,discountAmount1:amount1,
  discountPercent2:discount2,discountAmount2:amount2,
  netAmount:net,taxableAmount:net,vatRate:13,vatAmount:vat,grossAmount:gross,confidence:99
});

test('Coffee Union ΤΔΑ0012183: three physical rows reconcile to the printed 344.53 euro footer',()=>{
  const rows=[
    row(1,'ES21005','MRS ROSE ESPRESSO DECAF 250GR',1,11.20,25,2.80,8.40,1.09,9.49),
    {...row(2,'DEL005','DELIZ PREMIUM ΡΟΦΗΜΑ ΣΟΚΟΛΑΤΑΣ 1KGR',1,13.50,25,3.38,10.13,1.32,11.45),printedUnit:'ΚΙΛΟ'},
    {...row(3,'ES01000','MRS ROSE ESPRESSO 3KGR CLASSIC TIN',12,36.20,34.08,148.04,286.36,37.23,323.59),printedUnit:'ΚΙΛΟ'}
  ];
  const footer=[{rate:13,taxable:304.89,vat:39.64,gross:344.53}];
  const verified=buildCompletePrintedTableCandidate(rows,344.53,footer);
  assert.equal(verified?.length,3);
  assert.deepEqual(verified.map(line=>line.quantity),[1,1,12]);
  assert.equal(verified[1].unit,'ΚΙΛΟ');
  assert.equal(buildCompletePrintedTableCandidate([...rows,rows[0]],344.53,footer),null);
  assert.equal(buildCompletePrintedTableCandidate(rows.map((line,i)=>i===1?{...line,printedQuantity:12}:line),344.53,footer),null);
  assert.equal(buildCompletePrintedTableCandidate(rows,479.87,footer),null);
});

test('Καραμολέγκος ΙΔΑ-126-009370: six discounted rows reconcile to printed 27.44 euros',()=>{
  const rows=[
    row(1,'100139','BRIOCHE SANDWICH',2,2.10,20,.84,3.36,.44,3.80),
    row(2,'103','ΤΟΣΤ ΣΤΑΡΕΝΙΟ',3,2.15,35,2.26,3.35,.44,3.79,20,.84),
    row(3,'114','ΤΟΣΤ ΠΟΛΥΣΠΟΡΟ',4,1.90,30,2.28,4.26,.55,4.81,20,1.06),
    row(4,'521','ΑΣΙΑΤΙΚΕΣ ΜΕΓΑΛΕΣ',3,1.88,20,1.13,4.51,.59,5.10),
    row(5,'522','ΑΣΙΑΤΙΚΕΣ ΜΙΚΡΕΣ',3,1.68,20,1.01,4.03,.52,4.55),
    row(6,'650','ΚΑΤΣΕΛΗΣ ΔΙΠΛΟΣ',4,1.49,20,1.19,4.77,.62,5.39)
  ];
  const footer=[{rate:13,taxable:24.28,vat:3.16,gross:27.44}];
  assert.equal(buildCompletePrintedTableCandidate(rows,27.44,footer)?.length,6);
  assert.equal(buildCompletePrintedTableCandidate(rows,37.03,footer),null);
});
