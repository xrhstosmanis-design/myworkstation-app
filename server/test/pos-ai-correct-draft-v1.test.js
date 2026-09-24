import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {buildCompletePrintedTableCandidate} from '../src/lib/invoice-discount-verifier.js';
import {verifiedPrintedTableForPersistence} from '../src/invoice-line-reconciliation.js';

test('2621650: only a complete printed table can replace the shifted POS draft',async()=>{
  const quantities=[20,10,16,10,10,10,10,90,30,70,10,10,10,10,10,30];
  const codes=['01669','01671','01799','01694','01342','010','07','01740','01748','01745','01744','01750','01743','01753','01762','01708'];
  const costs=[4.56991,4.56991,5.7795,4.56991,3.87834,3.88196,3.88196,...Array(8).fill(3.70278),2.13176];
  const net=[91.40,45.70,92.47,45.70,38.78,38.82,38.82,333.25,111.08,259.19,37.03,37.03,37.03,37.03,37.03,63.95];
  const rows=codes.map((supplierCode,index)=>({index:index+1,supplierCode,description:`ITEM ${supplierCode}`,printedUnit:'ΤΕΜ',printedQuantity:quantities[index],originalUnitPrice:costs[index],initialAmount:net[index],netAmount:net[index],vatRate:index===15?24:0,confidence:99}));
  const footer=[{rate:0,taxable:1280.36,vat:0,gross:1280.36},{rate:24,taxable:63.95,vat:15.35,gross:79.30}];
  const complete=buildCompletePrintedTableCandidate(rows,1359.66,footer);
  assert.equal(complete?.length,16);
  assert.equal(complete.reduce((sum,line)=>sum+line.quantity,0),356);
  assert.equal(verifiedPrintedTableForPersistence(complete,1359.66)?.length,16);
  const shifted=structuredClone(rows);shifted[1].printedQuantity=20;
  assert.equal(buildCompletePrintedTableCandidate(shifted,1359.66,footer),null);
  const wrongAmount=structuredClone(rows);wrongAmount[7].netAmount=833.25;
  assert.equal(buildCompletePrintedTableCandidate(wrongAmount,1359.66,footer),null);
  const route=await readFile(new URL('../src/routes/commerce-pos-v244.js',import.meta.url),'utf8');
  const section=route.slice(route.indexOf('router.post("/ai-reader/jobs/:jobId/ai-correct-draft"'),route.indexOf('router.get("/ai-reader/fast-status/:jobId"'));
  assert.match(section,/job\.status!=="POS_FAILED"/);
  assert.match(section,/job\.draftStatus!=="DRAFT"/);
  assert.match(section,/job\.draftSource!=="POS_OCR_DRAFT"/);
  assert.match(route,/handoff\.aiCorrectExistingDraft===true&&!verifiedProductLines/);
});
