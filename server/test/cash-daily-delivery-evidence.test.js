import test from 'node:test';
import assert from 'node:assert/strict';
import {dailyCashEvidenceSchema,dailyCashEvidenceText,projectDailyCashEvidence} from '../src/services/cash-daily-delivery-evidence.js';

test('daily evidence publishes only scoped comparisons, aggregates and pending reasons',()=>{
  const netlink=new Map([
    ['main',{completedCount:2,reviewCount:1,amountCents:5000}],
    ['outside',{completedCount:1,reviewCount:0,amountCents:9000}]
  ]);
  const evidence=projectDailyCashEvidence({coverage:{complete:false},items:[
    {sessionId:'main',kind:'POS',status:'MATCHED',evidenceBasis:'SHIFT_TOTAL',amountCents:3000,filename:'private.pdf'},
    {sessionId:'main',kind:'EFTPOS',status:'UNRESOLVED',reason:'EFTPOS_TOTAL_DIFFERS',amountCents:2900,recordedAmountCents:3000},
    {sessionId:'main',kind:'PREPAID',status:'UNRESOLVED',reason:'NETLINK_SUBTOTAL_COMPARISON',amountCents:5000,recordedAmountCents:5000},
    {sessionId:'main',kind:'POS',status:'MATCHED',evidenceBasis:'LEDGER_TRANSACTION',amountCents:4000},
    {sessionId:null,status:'UNRESOLVED',reason:'DOCUMENT_DATE_UNREADABLE'},
    {sessionId:'outside',kind:'POS',status:'OUT_OF_PERIOD',amountCents:9000}
  ]},netlink,['main']);
  assert.equal(evidence.shifts.length,1);
  assert.deepEqual(evidence.shifts[0].comparisons.map(row=>row.status),['MATCHED','EFTPOS_TOTAL_DIFFERS','NETLINK_SUBTOTAL_COMPARISON']);
  assert.deepEqual(evidence.unassigned,[{reason:'DOCUMENT_DATE_UNREADABLE',count:1}]);
  const text=dailyCashEvidenceText(evidence,{storeName:'LAB',period:{from:'2026-11-17',to:'2026-11-18'},rows:[
    {sessionId:'main',day:'2026-11-18',shiftLabel:'Βραδινή',terminalPos:'MAIN'}
  ]}).join('\n');
  assert.match(text,/Βραδινή · MAIN/);
  assert.match(text,/Η διασταύρωση των συνημμένων παραμένει σε εκκρεμότητα/);
  assert.match(text,/Ονομαστική αξία Netlink.*εκκρεμεί διασταύρωση/);
  assert.doesNotMatch(JSON.stringify(evidence),/private.pdf|outside|9000|4000/);
  assert.equal(dailyCashEvidenceSchema.safeParse({...evidence,rawPaper:['invalid']}).success,false);
});

test('daily evidence bounds display and discloses additional comparisons',()=>{
  const item={sessionId:'main',kind:'CLOSING_CASH',status:'MATCHED',evidenceBasis:'SHIFT_BOUNDARY',amountCents:20};
  const evidence=projectDailyCashEvidence({coverage:{complete:true},items:Array(31).fill(item)},new Map(),['main']);
  assert.equal(evidence.shifts[0].comparisons.length,30);
  assert.equal(evidence.shifts[0].omittedComparisons,1);
  assert.equal(evidence.shifts[0].netlink,null);
});
