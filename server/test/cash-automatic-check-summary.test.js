import test from 'node:test';
import assert from 'node:assert/strict';
import {summarizeAutomaticCashCheck} from '../src/services/cash-automatic-check-summary.js';

const row=(overrides={})=>({sessionId:'a',status:'AWAITING_REVIEW',remainingCents:-34400,cardCents:-22750,fullAudit:{status:'PENDING'},...overrides});
const report=(overrides={})=>({storeId:'selected-store',period:{from:'2026-10-22',to:'2026-10-23'},reportHash:'hash',rows:[row()],paperEvidence:{coverage:{discoveryComplete:false},items:[{status:'UNRESOLVED'}]},...overrides});

test('automatic audit flags incomplete paper and shifts, never financially adjusts anything',()=>{
 const input=report(),before=structuredClone(input),out=summarizeAutomaticCashCheck(input);
 assert.equal(out.status,'HOLD');assert.equal(out.pendingShifts,1);
 assert.equal(out.cashDifferenceShifts,1);assert.equal(out.cardDifferenceShifts,1);
 assert.equal(out.paperCoverage,'INCOMPLETE');assert.equal(out.unresolvedPapers,1);
 assert.equal(out.financialAdjustmentCents,0);assert.equal(out.humanApproval,false);
 assert.deepEqual(input,before);
});
test('overlapping pair blocks finality even with otherwise complete evidence',()=>{
 const out=summarizeAutomaticCashCheck(report({rows:[row({fullAudit:{status:'FINAL'}})],paperEvidence:{coverage:{discoveryComplete:true},items:[]},countingErrorCandidates:[{status:'AMBIGUOUS_OVERLAP'}]}));
 assert.equal(out.status,'HOLD');assert.equal(out.ambiguousPairs,1);
});
test('possible counting pair only requests review, never an offset',()=>{
 const out=summarizeAutomaticCashCheck(report({rows:[row({fullAudit:{status:'FINAL'},remainingCents:-92,cardCents:0})],paperEvidence:{coverage:{discoveryComplete:true},items:[]},countingErrorCandidates:[{status:'COUNTING_ERROR_CANDIDATE'}]}));
 assert.equal(out.status,'REVIEW_REQUIRED');assert.equal(out.countingCandidates,1);assert.equal(out.financialAdjustmentCents,0);
});
test('complete clean report may say no differences but cannot approve financial finality',()=>{
 const out=summarizeAutomaticCashCheck(report({rows:[row({fullAudit:{status:'FINAL'},remainingCents:0,cardCents:0})],paperEvidence:{coverage:{discoveryComplete:true},items:[]}}));
 assert.equal(out.status,'NO_DIFFERENCES');assert.equal(out.humanApproval,false);
});
test('missing paper scope or empty/invalid source never claims completion',()=>{
 assert.equal(summarizeAutomaticCashCheck(report({paperEvidence:undefined})).status,'HOLD');
 assert.throws(()=>summarizeAutomaticCashCheck({rows:[]}),TypeError);
});

test('oversized stored-paper discovery explains HOLD without authorizing paid OCR or cash adjustment',()=>{
 const input=report({paperEvidence:{coverage:{discoveryComplete:false,discoveryReason:'ATTACHMENT_BYTE_LIMIT'},items:[]}});
 const before=structuredClone(input),out=summarizeAutomaticCashCheck(input);
 assert.equal(out.status,'HOLD');assert.equal(out.paperCoverage,'INCOMPLETE');
 assert.equal(out.paperIssueCode,'ATTACHMENT_BYTE_LIMIT');
 assert.equal(out.financialAdjustmentCents,0);assert.equal(out.humanApproval,false);
 assert.deepEqual(input,before);
});
