import {authorizeCashPaper} from '../routes/cash-papers.js';
import {createCashReconciliationRepository} from './cash-reconciliation-repository.js';
import {readLifecycleGeneration} from './store-lifecycle-generation.js';
import {hash} from './cash-reconciliation-contract.js';
import {projectAutomaticReviewedReport,validateAutomaticReviewedReport} from './cash-reviewed-automatic-contract.js';

// This adapter runs inside the caller's existing authenticated, read-only
// business-day transaction. It never calls the handwriting provider or writes
// to the financial ledger. Failure always stays a hold, never a zero balance.
export async function readReviewedAutomaticCash(tx,{actorId,companyId,storeId,period,rows,groups,rule,sourceFingerprint,ready}){
 const hold=reason=>({status:'HOLD',reason,report:null});
 if(!ready)return hold('SOURCE_NOT_READY');
 try{
  if(!Array.isArray(rows)||rows.length<1||rows.length>200)return hold('SOURCE_LIMIT_OR_EMPTY');
  const {scope,actor}=await authorizeCashPaper(tx,{id:actorId},storeId);
  if(actor.id!==actorId||scope.companyId!==companyId||scope.storeId!==storeId)return hold('SCOPE_UNAVAILABLE');
  const state=await readLifecycleGeneration(tx,scope);
  if(state.maintenance||state.retired)return hold('SCOPE_UNAVAILABLE');
  scope.generation=state.generation;
  const selected=await createCashReconciliationRepository(tx).readSelectedInTransaction(tx,scope,{from:period.fromDay,to:period.toDay},rows.map(r=>r.id));
  const report=projectAutomaticReviewedReport(selected.report);
  if(!validateAutomaticReviewedReport(report,{companyId,storeId,groups,rule,dayStartHour:period.dayStartHour}))return hold('REVIEWED_SOURCE_MISMATCH');
  const result={status:report.rows.every(r=>r.reviewed)?'READY':'HOLD',reason:report.rows.every(r=>r.reviewed)?null:'REVIEW_REQUIRED',companyId,storeId,generation:state.generation,head:selected.head,sourceFingerprint,report};
  return {...result,fingerprint:hash(result)};
 }catch{return hold('REVIEWED_SOURCE_UNAVAILABLE')}
}
