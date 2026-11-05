// Derived, read-only selected-store automatic audit summary.
// Never authorizes an OFFSET, financial finality, employee charge or paper reading.
const safeNumber=value=>Number.isSafeInteger(value);
export function summarizeAutomaticCashCheck(report){
  if(!report||!Array.isArray(report.rows)||!report.rows.length||!report.rows.every(r=>typeof r.sessionId==='string'&&r.sessionId))throw new TypeError('Complete selected-store cash report required');
  const candidates=Array.isArray(report.countingErrorCandidates)?report.countingErrorCandidates:[];
  const ambiguous=candidates.filter(p=>p.status==='AMBIGUOUS_OVERLAP').length;
  const proposed=candidates.filter(p=>p.status==='COUNTING_ERROR_CANDIDATE').length;
  const paper=report.paperEvidence;
  const unresolvedPapers=paper?.items?.filter(item=>item.status==='UNRESOLVED').length??null;
  const incompleteEvidence=report.rows.some(r=>!r.fullAudit||r.fullAudit.status!=='FINAL');
  const pending=report.rows.filter(r=>r.status!=='NOT_APPLICABLE'&&r.fullAudit?.status!=='FINAL').length;
  const cashDifferences=report.rows.filter(r=>safeNumber(r.remainingCents)&&r.remainingCents!==0).length;
  const cardDifferences=report.rows.filter(r=>safeNumber(r.cardCents)&&r.cardCents!==0).length;
  const paperCoverage=paper?.coverage?.discoveryComplete===true?'COMPLETE':paper?'INCOMPLETE':'UNAVAILABLE';
  const paperIssueCode=typeof paper?.coverage?.discoveryReason==='string'?paper.coverage.discoveryReason:null;
  const status=incompleteEvidence||paperCoverage!=='COMPLETE'||ambiguous>0?'HOLD':proposed>0||cashDifferences>0||cardDifferences>0?'REVIEW_REQUIRED':'NO_DIFFERENCES';
  return {
    version:1,status,storeId:report.storeId,period:report.period,reportHash:report.reportHash,
    checkedShifts:report.rows.length,pendingShifts:pending,cashDifferenceShifts:cashDifferences,
    cardDifferenceShifts:cardDifferences,countingCandidates:proposed,ambiguousPairs:ambiguous,
    paperCoverage,paperIssueCode,unresolvedPapers,
    financialAdjustmentCents:0,humanApproval:false,
    note:'Αυτόματη ένδειξη μόνο — χωρίς συμψηφισμό, καταλογισμό ή οριστική οικονομική αποδοχή.'
  };
}
