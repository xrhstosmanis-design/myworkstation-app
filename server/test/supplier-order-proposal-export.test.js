import test from 'node:test';
import assert from 'node:assert/strict';
import {buildSupplierProposalCsv} from '../../client/src/components/commerce/supplier-order-proposal-export.js';

const fixture=()=>{
  const row={productId:'p1',name:'Νερό, "κρύο"\n500ml',sku:'00123',unitLabel:'τεμ.',currentStock:-1.125,minStock:2,soldQuantity:10.5,returnedQuantity:.25,netQuantity:10.25,dailyDemand:10.25/30,suggestedQuantity:5.125,candidateSupplierId:null,supplierReviewReason:'NO_APPROVED_DOCUMENT_EVIDENCE',supplierCandidates:[],reason:'Έλεγχος',warnings:['Αρνητικό απόθεμα']};
  return {storeId:'LAB',generatedAt:'2026-10-18T20:30:00.000Z',from:'2026-09-18T20:30:00.000Z',to:'2026-10-18T20:30:00.000Z',options:{historyDays:30,coverageDays:7,leadDays:3},supplierBasis:'APPROVED_DOCUMENT_FREQUENCY_PROXY',reviewRequired:true,automaticTransmission:false,complete:true,groups:[],rows:[row]};
};
const filters={query:'',supplier:'all',onlyNeeded:true};
test('supplier CSV keeps canonical raw quantities, quoted fields and review snapshot metadata',()=>{
  const snapshot=fixture(),csv=buildSupplierProposalCsv({snapshot,rows:snapshot.rows,filters});
  assert.ok(csv.startsWith('\ufeff'));assert.match(csv,/"Νερό, ""κρύο""\n500ml"/);assert.match(csv,/"00123"/);
  for(const raw of ['-1.125','10.5','0.25','10.25',String(10.25/30),'5.125'])assert.ok(csv.includes(`"${raw}"`));
  for(const value of ['LAB',snapshot.generatedAt,snapshot.from,snapshot.to,'APPROVED_DOCUMENT_FREQUENCY_PROXY','NO_APPROVED_DOCUMENT_EVIDENCE','Χωρίς προμηθευτή','CURRENT_FILTERED_ROWS_ALL_PAGES'])assert.ok(csv.includes(`"${value}"`));
  assert.match(csv,/"30","7","3"/);assert.match(csv,/"YES","YES","NO"/);assert.doesNotMatch(csv,/physicalDeliveryFrequencyVerified|primarySupplierId/);
});
test('supplier CSV neutralizes text formula prefixes including whitespace and control characters',()=>{
  for(const attack of ['=1+1','+SUM(1,2)','-1+2','@SUM(1,2)',' \t\r\n=1+1','\u0000\u000b=1+1','\u0085@SUM(1,2)','\u00a0=1+1','\tordinary','\rordinary','\nordinary']){
    const snapshot=fixture();snapshot.rows[0].name=attack;
    const csv=buildSupplierProposalCsv({snapshot,rows:snapshot.rows,filters:{...filters,query:attack}});
    assert.ok(csv.includes(`"'${attack}"`),JSON.stringify(attack));
  }
});
test('supplier CSV uses only passed canonical filtered rows, preserves incomplete unassigned evidence and rejects invalid export inputs',()=>{
  const snapshot=fixture();snapshot.complete=false;snapshot.rows[0].supplierReviewReason='INCOMPLETE_EVIDENCE';snapshot.rows.push({...snapshot.rows[0],productId:'p2',name:'EXCLUDED'});
  const csv=buildSupplierProposalCsv({snapshot,rows:[snapshot.rows[0]],filters:{query:'Νερό',supplier:'unassigned',onlyNeeded:false}});
  assert.doesNotMatch(csv,/EXCLUDED/);assert.match(csv,/"NO","YES","NO"/);assert.match(csv,/"Νερό","unassigned","NO"/);assert.match(csv,/INCOMPLETE_EVIDENCE/);
  assert.throws(()=>buildSupplierProposalCsv({snapshot,rows:[{...snapshot.rows[0]}],filters}),/εφαρμοσμένη/);
  assert.throws(()=>buildSupplierProposalCsv({snapshot,rows:[],filters}));
  assert.throws(()=>buildSupplierProposalCsv({snapshot:{...snapshot,generatedAt:'invalid'},rows:snapshot.rows,filters}));
  snapshot.rows[0].suggestedQuantity=Infinity;assert.throws(()=>buildSupplierProposalCsv({snapshot,rows:snapshot.rows,filters}),/ποσότητα/);
});
