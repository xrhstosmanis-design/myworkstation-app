import {projectAutomaticReviewedReport,canSendProvisionalCashReport} from './cash-reviewed-automatic-contract.js';
import {periodSchema,hash} from './cash-reconciliation-contract.js';
import {reconciliationText} from './cash-reconciliation-report.js';

const fail=(code='CASH_EMAIL_RECHECK_REQUIRED',status=409)=>{throw Object.assign(new Error('Ανανέωσε την προεπισκόπηση και ολοκλήρωσε τον έλεγχο πριν από αποστολή.'),{code,status})};
const fingerprint=e=>hash({companyId:e.companyId,storeId:e.storeId,generation:e.generation,head:e.report.head,reportHash:e.report.reportHash,period:e.report.period,text:e.report.text});
const checked=e=>{
 if(!e||typeof e.companyId!=='string'||!e.companyId||typeof e.storeId!=='string'||!e.storeId||typeof e.generation!=='string'||!e.report||e.report.storeId!==e.storeId||e.report.generation!==e.generation||!periodSchema.safeParse(e.report.period).success||!Array.isArray(e.report.rows)||e.report.rows.length>200||e.report.coverage!=='BOUNDED_CLOSED_SHIFTS'||e.report.financialFinality!=='REVIEWED_CASH_ROWS_ONLY'||e.report.originalFinancialLedgerChanged!==false||!/^[a-f0-9]{64}$/.test(e.report.reportHash)||(e.report.head!=='ROOT'&&!/^[a-f0-9]{64}$/.test(e.report.head)))fail();
 if(new Set(e.report.rows.map(r=>r.sessionId)).size!==e.report.rows.length||e.report.text!==reconciliationText(e.report)||e.fingerprint!==fingerprint(e))fail();
 return e;
};
export function createReviewedCashEmailReader({db,authorize,repository}){
 return async(user,storeId,date)=>{
  const parsed=periodSchema.safeParse({from:date,to:date});if(!parsed.success)fail('CASH_EMAIL_INVALID_DATE',400);
  const admission=authorize||(await import('../routes/cash-papers.js')).authorizeCashPaper;
  const repo=repository||(await import('./cash-reconciliation-repository.js')).createCashReconciliationRepository(db);
  try{
   const {scope}=await admission(db,user,storeId);scope.generation=await repo.generation(scope);
   const report=await repo.read(scope,parsed.data);
   const fresh=await admission(db,user,storeId);
   if(fresh.scope.companyId!==scope.companyId||fresh.scope.storeId!==scope.storeId||await repo.generation(scope)!==scope.generation)fail();
   if(report.period?.from!==date||report.period?.to!==date)fail();
   const result={companyId:scope.companyId,storeId:scope.storeId,generation:scope.generation,report};result.fingerprint=fingerprint(result);return checked(result);
  }catch(error){if(error?.code==='CASH_EMAIL_INVALID_DATE')throw error;fail('CASH_EMAIL_RECHECK_REQUIRED',error?.status===403?403:error?.status===404?404:409);}
 };
}
export function reviewedCashEmailReadiness(evidence,legacyRows){
 const e=checked(evidence),rows=e.report.rows;
 if(!Array.isArray(legacyRows)||legacyRows.length!==rows.length||new Set(legacyRows.map(r=>r.sessionId)).size!==legacyRows.length||legacyRows.some(r=>!rows.some(v=>v.sessionId===r.sessionId)))fail();
 if(!rows.length||!legacyRows.every(r=>r.reviewValid===true))return false;
 // A provisional report may retain open questions; no CONFIRM is fabricated.
 // New automatic evidence must be complete for this path. Historical reviewed
 // reports retain their previous admission and source-freshness behavior.
 if(rows.some(r=>r.automaticAudit?.openIssues.includes('SOURCE_CHANGED')))return false;
 if(rows.every(r=>r.reviewed===true||r.status==='NOT_APPLICABLE'))return true;
 if(rows.some(r=>!r.reviewed&&r.automaticAudit?.status==='INCOMPLETE'))return false;
 return rows.every(r=>r.automaticAudit?.status==='CALCULATED')&&canSendProvisionalCashReport(projectAutomaticReviewedReport(e.report));
}
export function assertReviewedCashEmailPreview(evidence,{reportHash,generation}){
 const e=checked(evidence);if(e.fingerprint!==reportHash||e.generation!==generation)fail('CASH_EMAIL_PREVIEW_CHANGED');return e;
}
const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function renderReviewedCashEmail({evidence,companyId,storeId,storeName,date,comment='',previewOnly=false}){
 const e=checked(evidence),r=e.report;
 if(e.companyId!==companyId||e.storeId!==storeId||r.storeName!==storeName||r.period.from!==date||r.period.to!==date||typeof comment!=='string'||comment.length>2000)fail();
 const subject=`Έλεγχος ταμείων MyWorkStation · ${storeName} · ${date}`;
 const text=[...(previewOnly?['ΠΡΟΕΠΙΣΚΟΠΗΣΗ ΑΝΑΦΟΡΑΣ','']:[]),r.text,...(comment?['','Πρόσθετο σχόλιο αποστολής: '+comment]:[])].join('\n');
 const html=`<div style="font-family:Arial,sans-serif;max-width:760px"><div style="white-space:pre-wrap">${escape(text)}</div></div>`;
 return {subject,text,html};
}
