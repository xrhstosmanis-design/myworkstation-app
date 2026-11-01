import test from 'node:test';
import assert from 'node:assert/strict';
import XLSX from 'xlsx';
import {Prisma} from '@prisma/client';
import {inventoryReconciliationWorkbook,inventoryReconciliationPdf} from '../src/services/inventory-reconciliation-export.js';
const report={previous:{id:'a',name:'Παλιά'},current:{id:'b',name:'Νέα',storeId:'s'},explanation:'Προς έλεγχο',costMethod:'Αποθηκευμένο κόστος',
  summary:{shortageQuantity:23,surplusQuantity:0,netQuantity:-23,shortageValue:null,surplusValue:null,netValue:null,uncomputedItems:0,missingCostItems:1},
  rows:[{productId:'p',name:'=HYPERLINK("bad")',sku:'-001',from:new Date('2026-10-01T02:01:02Z'),to:new Date('2026-10-01T10:03:04Z'),previousCountedQuantity:263,countedQuantity:240,incoming:0,outgoing:0,systemAdjustments:0,expectedQuantity:263,difference:-23,unitCost:null,differenceValue:null,findings:['MISSING_OR_ZERO_COST'],movements:[],countHistory:[]}]};
test('real XLSX keeps numeric deficits and unknown values; text cells cannot become formulas',()=>{
  const wb=XLSX.read(inventoryReconciliationWorkbook(report),{type:'buffer'}),sheet=wb.Sheets['Είδη'];
  assert.deepEqual(wb.SheetNames,['Αναφορά','Είδη','Κινήσεις','Καταμετρήσεις']);
  assert.equal(sheet.L2.v,-23);assert.equal(sheet.L2.t,'n');assert.equal(sheet.C2.f,undefined);assert.ok(sheet.C2.v.startsWith("'="));
  assert.equal(sheet.N2,undefined);assert.equal(sheet.M2,undefined);
  assert.match(sheet.D2.v,/5:01:02/);assert.match(sheet.E2.v,/13:03:04/);assert.equal(sheet.D2.t,'s');
});
test('real Greek PDF export completes and uses the bundled font',async()=>{
  const bytes=await inventoryReconciliationPdf(report);assert.equal(bytes.subarray(0,5).toString(),'%PDF-');assert.ok(bytes.length>5000);
});
test('count history exports real Prisma Decimal quantities without silently dropping them',()=>{
  const r=structuredClone(report);r.rows[0].countHistory=[{id:'event',stocktakeId:'b',eventType:'RECOUNT',previousQuantity:new Prisma.Decimal('5'),countedQuantity:new Prisma.Decimal('4.25'),expectedQuantity:new Prisma.Decimal('6'),createdAt:'2026-10-01T10:03:04Z'}];
  const sheet=XLSX.read(inventoryReconciliationWorkbook(r),{type:'buffer'}).Sheets['Καταμετρήσεις'];
  assert.equal(sheet.E2.v,5);assert.equal(sheet.F2.v,4.25);assert.equal(sheet.G2.v,6);assert.equal(sheet.F2.t,'n');
});
