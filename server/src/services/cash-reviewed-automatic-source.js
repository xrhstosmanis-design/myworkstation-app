import {authorizeCashPaper} from '../routes/cash-papers.js';
import {createCashReconciliationRepository} from './cash-reconciliation-repository.js';
import {readLifecycleGeneration} from './store-lifecycle-generation.js';
import {hash} from './cash-reconciliation-contract.js';
import {projectAutomaticReviewedReport,validateAutomaticReviewedReport,canSendProvisionalCashReport} from './cash-reviewed-automatic-contract.js';

export function finalCashEvidence(report, fullReport, evidence){
 const rows=fullReport.rows;
 if(!evidence?.complete||evidence.unassigned.length||!rows.length||
    rows.length!==report.rows.length||evidence.shifts.length!==rows.length)return null;
 const baseRows=new Map(report.rows.map(row=>[row.sessionId,row]));
 const evidenceByShift=new Map(evidence.shifts.map(shift=>[shift.sessionId,shift]));
 const shifts=[];
 for(const row of rows){
  const base=baseRows.get(row.sessionId),paper=evidenceByShift.get(row.sessionId);
  if(!base||base.sourceHash!==row.sourceHash||base.planHash!==row.planHash||
     row.fullAudit?.status!=='FINAL'||!paper||paper.unresolved.length||paper.handwrittenCandidates||
     paper.omittedComparisons||paper.netlink?.reviewCount||!paper.comparisons.length||
     paper.comparisons.some(item=>item.status!=='MATCHED'||item.amountCents!==item.recordedAmountCents))return null;
  shifts.push({sessionId:row.sessionId,auditFingerprint:row.fullAudit.fingerprint});
  baseRows.delete(row.sessionId);
 }
 return {shifts,evidenceFingerprint:hash(evidence)};
}

// This adapter runs inside the caller's existing authenticated, read-only
// business-day transaction. It never calls the handwriting provider or writes
// to the financial ledger. Failure always stays a hold, never a zero balance.
export async function readReviewedAutomaticCash(tx,{actorId,companyId,storeId,period,rows,groups,rule,sourceFingerprint,ready,includeDailyEvidence=false,requireFinal=false}){
 const hold=reason=>({status:'HOLD',reason,report:null});
 if(!ready)return hold('SOURCE_NOT_READY');
 try{
  if(!Array.isArray(rows)||rows.length<1||rows.length>200)return hold('SOURCE_LIMIT_OR_EMPTY');
  const {scope,actor}=await authorizeCashPaper(tx,{id:actorId},storeId);
  if(actor.id!==actorId||scope.companyId!==companyId||scope.storeId!==storeId)return hold('SCOPE_UNAVAILABLE');
  const state=await readLifecycleGeneration(tx,scope);
  if(state.maintenance||state.retired)return hold('SCOPE_UNAVAILABLE');
  scope.generation=state.generation;
  const repository=createCashReconciliationRepository(tx);
  const scanPeriod={from:period.fromDay,to:period.toDay},sessionIds=rows.map(row=>row.id);
  const selected=await repository.readSelectedInTransaction(tx,scope,scanPeriod,sessionIds,{includeDailyEvidence:includeDailyEvidence||requireFinal});
  const report=projectAutomaticReviewedReport(selected.report);
  if(!validateAutomaticReviewedReport(report,{companyId,storeId,groups,rule,dayStartHour:period.dayStartHour}))return hold('REVIEWED_SOURCE_MISMATCH');
  const complete=canSendProvisionalCashReport(report);
  let finalEvidence;
  if(requireFinal){
   if(!complete)return hold('REVIEW_REQUIRED');
   const full=await repository.readSelectedInTransaction(tx,{...scope,fullAudit:true},scanPeriod,sessionIds,{includeDailyEvidence:true});
   if(full.head!==selected.head||full.generation!==selected.generation||
      hash(full.dailyEvidence)!==hash(selected.dailyEvidence))return hold('REVIEWED_SOURCE_MISMATCH');
   finalEvidence=finalCashEvidence(report,full.report,full.dailyEvidence);
   if(!finalEvidence)return hold('FINAL_REVIEW_REQUIRED');
  }
  const result={status:complete?'READY':'HOLD',reason:complete?null:'REVIEW_REQUIRED',companyId,storeId,generation:state.generation,head:selected.head,sourceFingerprint,report,...(selected.dailyEvidence?{dailyEvidence:selected.dailyEvidence}:{}),...(finalEvidence?{finalEvidence}:{})};
  return {...result,fingerprint:hash(result)};
 }catch{return hold('REVIEWED_SOURCE_UNAVAILABLE')}
}
