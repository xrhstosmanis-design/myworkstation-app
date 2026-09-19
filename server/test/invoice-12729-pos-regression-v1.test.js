import assert from "node:assert/strict";
import test from "node:test";
import {applyMantzilasPackaging,recoverMantzilasEconomics} from "../src/lib/invoice-column-reading.js";
import {verifiedPrintedTableForPersistence} from "../src/invoice-line-reconciliation.js";
import {reconcileCentRoundingResidual} from "../src/routes/commerce-pos-v244-core.js";

const row=(code,description,unit,quantity,unitCost,discount1,netAmount,exciseTotal,vatRate,grossAmount)=>({
  code,description,rawText:`${code} | ${description} | ${unit} | ${quantity}`,
  unit,invoiceUnit:unit,quantity,invoiceQuantity:quantity,unitCost,packageUnitPrice:unitCost,
  initialAmount:quantity*unitCost,discount1,discount2:0,discount3:0,
  netAmount,exciseTotal,vatRate,grossAmount,confidence:99,
  sourceColumnsVerified:true,quantitySource:"AI_PRINTED_ROW_FULL_MATH_VERIFIED"
});

const printed12729=[
  row("12","ΑΛΦΑ 0,5LT ΦΙΑΛΗ","KIB",1,19.04,22,14.85,5.72,24,25.51),
  row("60002","ΚΕΝΟ ΜΠΥΡΑΣ 500gr. ΜΕ ΦΙΑΛΕΣ","KIB",1,6.03,0,6.03,0,0,6.03),
  row("617","ΑΛΦΑ 0,5LT ΚΟΥΤΙ STRONG","KIB",1,23.01,17,19.10,9.36,24,35.29),
  row("1513","KAISER 0,5LT ΚΟΥΤΙ (3+1Δ)","KIB",1,21.54,17,17.88,7.49,24,31.46),
  row("14","ΑΛΦΑ 0,5LT ΚΟΥΤΙ","KIB",1,21.75,17,18.05,6.86,24,30.89),
  row("614","ΑΛΦΑ 0,33LT ΚΟΥΤΙ (5+1Δ)","KIB",1,12.79,17,10.62,4.53,24,18.79),
  row("012","ΝΥΜΦΗ ΚΟΥΤΙ 0,33LTx6Pack(5+1)","6PK",2,3.22,0,6.44,2.47,24,11.05),
  row("74","HELL ENERGY DRINK 250ML","TEM",48,.38,0,18.24,0,13,20.61),
  row("6102","COCA COLA LIGHT 0,5LTx4pack PET","4PK",2,4.25,31,5.86,0,13,6.62),
  row("4607","MAMOS 0,5LTx4Pack ΚΟΥΤΙ (3+1)","4PK",3,2.57,0,7.71,3.45,24,13.84)
];

test("invoice 12729 keeps verified discounts, excise and MANTZILAS stock packaging",()=>{
  const packaged=printed12729.map(applyMantzilasPackaging);
  const persisted=verifiedPrintedTableForPersistence(packaged,200.08);
  assert.ok(persisted,"the complete verified table must bypass the lossy legacy finalizer");
  assert.equal(persisted.length,10);
  assert.deepEqual(persisted.map(line=>Number(line.stockUnitsPerInvoiceUnit||1)),[20,1,24,24,24,24,6,1,4,4]);
  assert.deepEqual(persisted.map(line=>Number(line.quantity)),[1,1,1,1,1,1,2,48,2,3]);
  assert.deepEqual(persisted.map(line=>Number(line.quantity)*Number(line.stockUnitsPerInvoiceUnit||1)),[20,1,24,24,24,24,12,48,8,12]);
  assert.deepEqual(persisted.map(line=>Number(line.discount1)),[22,0,17,17,17,17,0,0,31,0]);
  assert.deepEqual(persisted.map(line=>Number(line.exciseTotal)),[5.72,0,9.36,7.49,6.86,4.53,2.47,0,0,3.45]);
  assert.equal(persisted[7].quantity,48,"printed TEM quantity must not be multiplied twice");
});

test("invoice 12729 preservation still rejects an unverified or materially mismatched table",()=>{
  assert.equal(verifiedPrintedTableForPersistence(printed12729.map((line,index)=>index?line:{...line,sourceColumnsVerified:false}),200.08),null);
  assert.equal(verifiedPrintedTableForPersistence(printed12729,210),null);
});

test("invoice 12729 preserves printed-column recovery instead of falling back to the lossy finalizer",()=>{
  const recovered=recoverMantzilasEconomics({...printed12729[0],sourceColumnsVerified:false,quantitySource:"",rawText:"12 | ΑΛΦΑ 0,5LT ΦΙΑΛΗ | KIB | 1 | 19,04 | 19,04 | 22 | 4,19 | 14,85 | 5,72 | 20,57 | 24 | 4,94"});
  assert.equal(recovered.quantitySource,"MANTZILAS_PRINTED_ECONOMICS_VERIFIED");
  const persisted=verifiedPrintedTableForPersistence([recovered,...printed12729.slice(1)].map(applyMantzilasPackaging),200.08);
  assert.ok(persisted,"a complete current-image printed-column recovery must retain its package, discount and excise fields");
  assert.equal(persisted[0].discount1,22);
  assert.equal(persisted[0].exciseTotal,5.72);
  assert.equal(persisted[0].stockUnitsPerInvoiceUnit,20);
});

test("invoice 12729 assigns the one-cent VAT rounding residual without changing net or discounts",()=>{
  const persisted=verifiedPrintedTableForPersistence(printed12729.map(applyMantzilasPackaging),200.08);
  const result=reconcileCentRoundingResidual(persisted,200.08);
  assert.equal(result.applied,true);
  assert.equal(result.residual,-0.01);
  assert.equal(Number(result.lines.reduce((sum,line)=>sum+line.grossAmount,0).toFixed(2)),200.08);
  assert.equal(Number(result.lines.reduce((sum,line)=>sum+line.netAmount+line.exciseTotal,0).toFixed(2)),164.66);
  assert.deepEqual(result.lines.map(line=>Number(line.discount1)),[22,0,17,17,17,17,0,0,31,0]);
});
