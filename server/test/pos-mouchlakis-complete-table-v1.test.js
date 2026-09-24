import test from 'node:test';
import assert from 'node:assert/strict';
import {buildCompletePrintedTableCandidate} from '../src/lib/invoice-discount-verifier.js';
import {verifiedPrintedTableForPersistence} from '../src/invoice-line-reconciliation.js';

test('Mouchlakis 01/129707: the printed 14-row, zero-VAT table reconciles without repeated OCR rows',()=>{
  const quantities=[30,30,20,20,20,10,40,10,50,40,20,140,40,20];
  const amounts=[105.46,105.46,70.31,91.40,91.40,41.73,148.01,37,185.01,148.01,74.01,518.04,148.01,27.78];
  const prices=[3.515262,3.515262,3.515262,4.569915,4.569915,4.173109,3.700278,3.700278,3.700278,3.700278,3.700278,3.700278,3.700278,1.38889];
  const codes=['011291','011292','011293','010105','010101','010743','011701','011716','011700','011704','011710','011713','011702','017002'];
  const rows=amounts.map((amount,index)=>({index:index+1,supplierCode:codes[index],description:`PRINTED ROW ${index+1}`,printedUnit:'ΤΕΜ',printedQuantity:quantities[index],originalUnitPrice:prices[index],initialAmount:amount,netAmount:amount,vatRate:0,confidence:99}));
  const footer=[{rate:0,taxable:1791.63,vat:0,gross:1791.63}];
  const complete=buildCompletePrintedTableCandidate(rows,1791.63,footer);
  assert.equal(complete?.length,14);
  assert.equal(complete.reduce((sum,line)=>sum+line.quantity,0),490);
  assert.equal(verifiedPrintedTableForPersistence(complete,1791.63)?.length,14);
  assert.equal(buildCompletePrintedTableCandidate([...rows,rows[0]],1791.63,footer),null);
  const shifted=structuredClone(rows);shifted[0].originalUnitPrice=105.46;
  assert.equal(buildCompletePrintedTableCandidate(shifted,1791.63,footer),null);
  const wrongVat=structuredClone(rows);wrongVat[0].vatRate=24;
  assert.equal(buildCompletePrintedTableCandidate(wrongVat,1791.63,footer),null);
});
