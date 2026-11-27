import assert from 'node:assert/strict';
import test from 'node:test';
import {applyProposalQuantities, proposalSupplierTotals, roundSupplierQuantity} from '../../shared/order-proposal-quantities.mjs';
import {renderPosOrderProposal} from '../../shared/pos-order-proposal-report.mjs';

test('rounds positive demand to complete supplier packs', () => {
 assert.equal(roundSupplierQuantity(295, 24), 312);
 assert.equal(roundSupplierQuantity(2, 24, 50), 72);
 assert.equal(roundSupplierQuantity(2, null, 50), 50);
 assert.equal(roundSupplierQuantity(0, 24, 50), 0);
 assert.equal(roundSupplierQuantity(2, 24), 24);
 assert.equal(roundSupplierQuantity(0, 24), 0);
 assert.equal(roundSupplierQuantity(295, null), 295);
 assert.equal(roundSupplierQuantity(0.3, 0.1), 0.3);
});

test('edited quantities drive supplier totals and the same exported document', () => {
 const original = {
  storeName:'Test', generatedAt:'2026-11-27T12:00:00Z',
  options:{historyDays:28, coverageDays:3, leadDays:1},
  rows:[
   {productId:'p',name:'Water',suggestedQuantity:312,supplierPack:24,orderSupplierId:'a',orderSupplierName:'Supplier A',orderUnitCost:0.50},
   {productId:'q',name:'Other',suggestedQuantity:12,orderSupplierId:'b',orderSupplierName:'Supplier B',orderUnitCost:null}
  ]
 };
 const edited=applyProposalQuantities(original,{p:48});
 assert.equal(original.rows[0].suggestedQuantity,312);
 assert.deepEqual(proposalSupplierTotals(edited.rows),[
  {id:'a',name:'Supplier A',cents:2400,missing:0},
  {id:'b',name:'Supplier B',cents:0,missing:1}
 ]);
 assert.match(renderPosOrderProposal(edited).text,/Supplier A · Εκτιμώμενη καθαρή αξία: 24,00/);
 assert.equal(renderPosOrderProposal(applyProposalQuantities(original,{p:0})).rowCount,1);
 assert.throws(()=>applyProposalQuantities(original,{foreign:2}),/εκτός/);
 assert.throws(()=>applyProposalQuantities(original,{p:-1}),/Μη έγκυρη/);
 assert.match(applyProposalQuantities(original,{p:25}).rows[0].warnings[0],/πολλαπλάσιο/);
});
