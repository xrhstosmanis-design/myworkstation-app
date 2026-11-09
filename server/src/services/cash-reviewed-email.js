import {cashArithmeticIsCurrent,hasCashNumericContradiction} from './cash-automatic-result.js';
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
// The complete envelope is checked before this private readiness projection.
// Its full findings remain in the preview, fingerprint and delivered report.
const provisionalReadinessReport=report=>{
 const view={...report,rows:report.rows.map(row=>{
  const cash={...row};delete cash.fullEvidence;delete cash.fullCoverage;delete cash.fullAudit;return cash;
 })};
 delete view.paperEvidence;
 view.text=reconciliationText(view);
 return projectAutomaticReviewedReport(view);
};
export function createReviewedCashEmailReader({db,authorize,repository}){
 return async(user,storeId,date)=>{
  const parsed=periodSchema.safeParse({from:date,to:date});if(!parsed.success)fail('CASH_EMAIL_INVALID_DATE',400);
  const admission=authorize||(await import('../routes/cash-papers.js')).authorizeCashPaper;
  const repo=repository||(await import('./cash-reconciliation-repository.js')).createCashReconciliationRepository(db);
  try{
   const {scope}=await admission(db,user,storeId);scope.generation=await repo.generation(scope);scope.fullAudit=true;
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
 if(!rows.length)return false;
 const byId=new Map(rows.map(r=>[r.sessionId,r]));
 if(!legacyRows.every(r=>r.reviewValid===true||r.reviewValid===false&&r.reviewDecision===null&&r.reviewedAt===null&&r.reviewedBy===null&&cashArithmeticIsCurrent(byId.get(r.sessionId))))return false;
 if(rows.some(r=>hasCashNumericContradiction(r.automaticAudit)))return false;
 if(rows.every(r=>r.reviewed===true||r.status==='NOT_APPLICABLE'))return true;
 return rows.every(r=>r.reviewed||cashArithmeticIsCurrent(r))&&canSendProvisionalCashReport(provisionalReadinessReport(e.report));
}
export function assertReviewedCashEmailPreview(evidence,{reportHash,generation}){
 const e=checked(evidence);if(e.fingerprint!==reportHash||e.generation!==generation)fail('CASH_EMAIL_PREVIEW_CHANGED');return e;
}
const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

const amount=cents=>Number.isSafeInteger(cents)?(cents/100).toLocaleString('el-GR',{style:'currency',currency:'EUR',signDisplay:'exceptZero'}):'—';
const shiftTime=new Intl.DateTimeFormat('el-GR',{timeZone:'Europe/Athens',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
const clock=value=>value&&Number.isFinite(Date.parse(value))?shiftTime.format(new Date(value)):'—';
function reportTable(title,headers,rows){
 const cell='border:1px solid #cbd5e1;padding:6px 8px;text-align:left';
 return '<h3>'+escape(title)+'</h3><table style="border-collapse:collapse;width:100%"><thead><tr>'+
   headers.map(h=>'<th scope="col" style="'+cell+';background:#f1f5f9">'+escape(h)+'</th>').join('')+
   '</tr></thead><tbody>'+rows.map(row=>'<tr>'+row.map(v=>'<td style="'+cell+'">'+escape(v)+'</td>').join('')+'</tr>').join('')+'</tbody></table>';
}
const evidenceHeadings=new Map([
 ['ΣΤΟΙΧΕΙΑ ΠΟΥ ΕΛΕΓΧΘΗΚΑΝ','Στοιχεία που ελέγχθηκαν'],
 ['ΑΝΑΛΥΤΙΚΑ ΑΠΟΤΕΛΕΣΜΑΤΑ ΑΝΑ ΒΑΡΔΙΑ','Αναλυτικά αποτελέσματα ανά βάρδια'],
 ['ΧΕΙΡΟΓΡΑΦΑ ΚΑΙ ΠΑΡΑΣΤΑΤΙΚΑ ΑΠΟ ΤΟ ΤΣΑΤ','Χειρόγραφα και παραστατικά'],
 ['ΕΛΕΓΧΟΣ ΣΥΜΒΑΝΤΩΝ — ΑΛΛΑΓΕΣ ΤΙΜΩΝ ΚΑΙ ΕΚΠΤΩΣΕΙΣ','Αλλαγές τιμών και εκπτώσεις'],
 ['ΣΥΜΒΑΝΤΑ ΚΑΙ ΠΩΛΗΣΕΙΣ ΑΠΟ ΑΡΧΕΙΑ KIOSK','Συμβάντα και πωλήσεις Kiosk'],
]);
function renderCashEmailEvidence(text){
 const blocks=[];
 let lines=[];
 const flush=()=>{
   if(lines.some(Boolean))blocks.push('<div style="white-space:pre-wrap;overflow-wrap:anywhere">'+escape(lines.join('\n').trim())+'</div>');
   lines=[];
 };
 for(const line of text.split('\n')){
   const heading=evidenceHeadings.get(line);
   const shift=line.startsWith('ΒΑΡΔΙΑ · ');
   if(heading||shift){
     flush();
     blocks.push(shift?'<h4>'+escape(line.slice('ΒΑΡΔΙΑ · '.length))+'</h4>':'<h3>'+escape(heading)+'</h3>');
   }else lines.push(line);
 }
 flush();
 return blocks.join('');
}
function cashEmailHtml(report,text){
 const rows=report.rows;
 const pending=rows.some(row=>row.fullAudit?.pendingChecks?.length||(!row.reviewed&&row.status!=='NOT_APPLICABLE'))||
   report.paperEvidence?.items.some(item=>item.status==='UNRESOLVED')||report.paperEvidence?.coverage?.complete===false;
 const cash=rows.map(row=>{
   const status=row.fullAudit?.status||row.status;
   const result=status==='NOT_APPLICABLE'?'Δεν εφαρμόζεται':status==='AWAITING_NEXT_SHIFT'?'Αναμονή επόμενης βάρδιας':
     (row.fullAudit?status==='FINAL':row.reviewed)?'Ελεγμένο':'Εκκρεμεί διασταύρωση';
   return [row.shiftLabel,row.operatorName,clock(row.openedAt)+'–'+clock(row.closedAt),amount(row.initialCents),amount(row.remainingCents),result];
 });
 const cards=rows.map(row=>[row.shiftLabel,row.operatorName,amount(row.cardCents),Number.isSafeInteger(row.cardCents)?'Καταγεγραμμένη διαφορά':'Ελλιπή στοιχεία']);
 const details=text.replace(/^Χρειάζεται διευκρίνιση · /gm,'Δεν ελέγχθηκε πλήρως · ');
 const followUp=pending?'<h3>Εκκρεμότητες και συνέχεια</h3><p><strong>Περιμένω απάντηση μέσω email για καθεμία από τις εκκρεμότητες, με τις απαραίτητες διευκρινίσεις και τα σχετικά αποδεικτικά, ώστε να ολοκληρωθεί ο έλεγχος και να κλείσουν.</strong></p>':'';
 return '<div lang="el" style="font-family:Arial,sans-serif;line-height:1.5;max-width:760px"><h2>'+escape(report.storeName)+' — Έλεγχος ταμείων</h2><p>'+
   escape(report.period.from)+(report.period.to===report.period.from?'':' έως '+escape(report.period.to))+
   ' · Κλεισμένες βάρδιες: '+rows.length+'</p>'+
   reportTable('Μετρητά και παραδόσεις',['Βάρδια','Χειριστής','Ώρες','Αρχική διαφορά','Υπόλοιπο ελέγχου','Κατάσταση'],cash)+
   reportTable('Κάρτες POS–EFTPOS',['Βάρδια','Χειριστής','Διαφορά','Κατάσταση'],cards)+
   '<h3>Αναλυτικά ευρήματα και τεκμήρια</h3>'+renderCashEmailEvidence(details)+followUp+'</div>';
}

export function renderReviewedCashEmail({evidence,companyId,storeId,storeName,date,comment='',previewOnly=false}){
 const e=checked(evidence),r=e.report;
 if(e.companyId!==companyId||e.storeId!==storeId||r.storeName!==storeName||r.period.from!==date||r.period.to!==date||typeof comment!=='string'||comment.length>2000)fail();
 const subject=`Έλεγχος ταμείων MyWorkStation · ${storeName} · ${date}`;
 const text=[...(previewOnly?['ΠΡΟΕΠΙΣΚΟΠΗΣΗ ΑΝΑΦΟΡΑΣ','']:[]),r.text,...(comment?['','Πρόσθετο σχόλιο αποστολής: '+comment]:[])].join('\n');
 const html=cashEmailHtml(r,text);
 return {subject,text,html};
}
