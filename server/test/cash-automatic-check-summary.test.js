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
 const out=summarizeAutomaticCashCheck(report({rows:[row({fullAudit:{status:'FINAL'}})],paperEvidence:{status:'COMPLETE',coverage:{discoveryComplete:true,complete:true},items:[]},countingErrorCandidates:[{status:'AMBIGUOUS_OVERLAP'}]}));
 assert.equal(out.status,'HOLD');assert.equal(out.ambiguousPairs,1);
});
test('possible counting pair only requests review, never an offset',()=>{
 const out=summarizeAutomaticCashCheck(report({rows:[row({fullAudit:{status:'FINAL'},remainingCents:-92,cardCents:0})],paperEvidence:{status:'COMPLETE',coverage:{discoveryComplete:true,complete:true},items:[]},countingErrorCandidates:[{status:'COUNTING_ERROR_CANDIDATE'}]}));
 assert.equal(out.status,'REVIEW_REQUIRED');assert.equal(out.countingCandidates,1);assert.equal(out.financialAdjustmentCents,0);
});
test('complete clean report may say no differences but cannot approve financial finality',()=>{
 const out=summarizeAutomaticCashCheck(report({rows:[row({fullAudit:{status:'FINAL'},remainingCents:0,cardCents:0})],paperEvidence:{status:'COMPLETE',coverage:{discoveryComplete:true,complete:true},items:[]}}));
 assert.equal(out.status,'NO_DIFFERENCES');assert.equal(out.humanApproval,false);
});
test('discovery alone cannot certify unread photographs as complete',()=>{
 const input=report({rows:[row({fullAudit:{status:'FINAL'},remainingCents:0,cardCents:0})],paperEvidence:{status:'INCOMPLETE',coverage:{discoveryComplete:true,complete:false},items:[{line:null,status:'UNRESOLVED',reason:'NOT_READ'}]}});
 const out=summarizeAutomaticCashCheck(input);
 assert.equal(out.status,'HOLD');assert.equal(out.paperCoverage,'INCOMPLETE');assert.equal(out.unreadPaperSources,1);
 assert.equal(out.financialAdjustmentCents,0);assert.equal(out.humanApproval,false);
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

test('automatic cash report separates unread and uncertain stored papers without any financial adjustment',()=>{
 const paperEvidence={coverage:{discoveryComplete:false},items:[
  {line:null,status:'UNRESOLVED',reason:'NOT_READ'},
  {line:null,status:'UNRESOLVED',reason:'PENDING'},
  {line:null,status:'UNRESOLVED',reason:'REQUIRES_REVIEW'},
  {line:0,status:'UNRESOLVED',reason:'UNCERTAIN_LINE'},
  {line:1,status:'MATCHED',reason:'UNIQUE_RECORDED_CORROBORATION'}]};
 const input=report({paperEvidence}),copy=structuredClone(input),out=summarizeAutomaticCashCheck(input);
 assert.equal(out.status,'HOLD');assert.equal(out.unreadPaperSources,1);
 assert.equal(out.pendingPaperSources,1);assert.equal(out.reviewPaperSources,1);
 assert.equal(out.unresolvedPapers,4);assert.equal(out.financialAdjustmentCents,0);
 assert.equal(out.humanApproval,false);assert.deepEqual(input,copy);
});

test('informational upload-date metadata is not an actionable paper error',()=>{
 const input=report({paperEvidence:{status:'INCOMPLETE',coverage:{discoveryComplete:true,complete:false,discoveryReason:'UPLOAD_TIME_IS_NOT_DOCUMENT_DATE'},items:[{line:null,status:'UNRESOLVED',reason:'NOT_READ'}]}});
 const out=summarizeAutomaticCashCheck(input);
 assert.equal(out.status,'HOLD');assert.equal(out.paperCoverage,'INCOMPLETE');
 assert.equal(out.paperIssueCode,null,'upload timestamps alone cannot establish printed document dates');
 assert.equal(out.unreadPaperSources,1);assert.equal(out.financialAdjustmentCents,0);
});
