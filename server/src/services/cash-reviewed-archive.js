import {isExpenseIssueClosed,issueStatusLabel,issueCodeLabel} from './cash-issue-replies.js';
import {assertCalculatedCashResult,canAutomaticallyCalculate} from './cash-automatic-result.js';
import {automaticCashAuditText} from './cash-automatic-audit.js';
import XLSX from 'xlsx';
import {createHash} from 'node:crypto';
import {cashArchivePreviewPayload} from '../../../client/src/lib/cash-reviewed-archive.js';
import {z} from 'zod';
import {periodSchema,reconcileError} from './cash-reconciliation-contract.js';
import {normalizeLifecycleGeneration} from './store-lifecycle-generation.js';
import {reconciliationText} from './cash-reconciliation-report.js';

const sha=z.string().regex(/^[a-f0-9]{64}$/);
export const archiveArguments=z.object({from:z.string(),to:z.string(),generation:z.string().refine(v=>{try{return normalizeLifecycleGeneration(v)!==null}catch{return false}}),reportHash:sha,previewHash:sha,head:z.union([sha,z.literal('ROOT')])}).strict().refine(v=>periodSchema.safeParse({from:v.from,to:v.to}).success);
export const cashArchiveSourceHash=report=>createHash('sha256').update(cashArchivePreviewPayload(report),'utf8').digest('hex');
export const archiveMime='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const invalid=()=>{throw reconcileError('CASH_ARCHIVE_INVALID_SOURCE',502)};
const integer=v=>Number.isSafeInteger(v)&&Math.abs(v)<=99999999900;
const amount=v=>v===null?null:integer(v)?v/100:invalid();
const text=v=>{if(typeof v!=='string'||v.length>32767||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(v))invalid();return v;};
const at=value=>{if(value===null||value===undefined)return null;const d=value instanceof Date?value:typeof value==='string'?new Date(value):null;if(!d||!Number.isFinite(+d))invalid();return new Intl.DateTimeFormat('el-GR',{timeZone:'Europe/Athens',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(d);};
const status={REVIEWED:'Ελεγμένη',AWAITING_NEXT_SHIFT:'Αναμονή επόμενης βάρδιας',AWAITING_REVIEW:'Εκκρεμεί έλεγχος',RECHECK_REQUIRED:'Απαιτείται επανέλεγχος',NOT_APPLICABLE:'Δεν εφαρμόζεται έλεγχος μετρητών'};
const sameReceipt=(r,q)=>r.generation===q.generation&&r.head===q.head&&r.reportHash===q.reportHash&&r.period?.from===q.from&&r.period?.to===q.to&&cashArchiveSourceHash(r)===q.previewHash;
export function cashArchiveWorkbook(report,scope){
  if(report?.storeId!==scope.storeId||!periodSchema.safeParse(report.period).success||report.coverage!=='BOUNDED_CLOSED_SHIFTS'||report.financialFinality!=='REVIEWED_CASH_ROWS_ONLY'||report.originalFinancialLedgerChanged!==false||!Array.isArray(report.rows)||report.rows.length>200||!Array.isArray(report.employees)||!report.totals)invalid();
  try{assertCalculatedCashResult(report)}catch{invalid()}
  if(report.text!==reconciliationText(report))invalid();
  const rows=report.rows,seen=new Set(),employees=new Map(),days=new Map(),pending=[];
  let shortage=0,surplus=0,pendingCount=0;
  const shifts=[['Κατάστημα','Ημερομηνία','Έναρξη βάρδιας (Ελλάδα)','Λήξη βάρδιας (Ελλάδα)','Ταμείο/POS','Βάρδια','Χειριστής','Κωδικός εργαζομένου','Αναφορά βάρδιας','Κατάσταση','Αρχική διαφορά μετρητών','Επαληθευμένος συμψηφισμός','Υπόλοιπο μετρητών','Ελεγμένο έλλειμμα','Ελεγμένο πλεόνασμα','Διαφορά POS–EFTPOS','Σχόλιο ελέγχου']];
  for(const r of rows){
    if(typeof r.sessionId!=='string'||seen.has(r.sessionId)||!status[r.status]||typeof r.reviewed!=='boolean'||r.reviewed!==(r.status==='REVIEWED')||typeof r.identityRequiresReview!=='boolean'||r.employeeKey!==(r.identityRequiresReview?'session:'+r.sessionId:'operator:'+r.operatorId)||!integer(r.offsetCents)||r.offsetCents<0||typeof r.day!=='string'||r.day<report.period.from||r.day>report.period.to||!periodSchema.safeParse({from:r.day,to:r.day}).success)invalid();
    seen.add(r.sessionId);
    const deficit=r.reviewed?Math.max(0,-r.remainingCents):null,excess=r.reviewed?Math.max(0,r.remainingCents):null;
    if(r.reviewed&&!integer(r.remainingCents))invalid();
    if(r.reviewed){
      shortage+=deficit;surplus+=excess;
      for(const [map,key,day]of [[employees,r.employeeKey,null],[days,JSON.stringify([r.day,r.employeeKey]),r.day]]){
        const a=map.get(key)||{name:text(r.operatorName),operatorId:r.identityRequiresReview?null:text(r.operatorId),requiresIdentity:r.identityRequiresReview,day,shifts:0,shortage:0,surplus:0};
        if(a.name!==r.operatorName)invalid();a.shifts++;a.shortage+=deficit;a.surplus+=excess;map.set(key,a);
      }
    }else if(r.status!=='NOT_APPLICABLE'){pendingCount++;if(!canAutomaticallyCalculate(r))pending.push([r.day,r.shiftLabel,r.operatorName,status[r.status],amount(r.remainingCents),'Δεν περιλαμβάνεται στα ελεγμένα σύνολα.']);}
    if(r.identityRequiresReview)pending.push([r.day,r.shiftLabel,r.operatorName,'Ταυτοποίηση εργαζομένου',null,'Ο κοινός ή μη επιβεβαιωμένος κωδικός δεν συνενώνει βάρδιες.']);
    if(r.cardCents===null||r.cardCents!==0)pending.push([r.day,r.shiftLabel,r.operatorName,r.cardCents===null?'Μη πλήρη στοιχεία καρτών':'Διαφορά POS–EFTPOS',amount(r.cardCents),'Χωριστά από τα μετρητά.']);
    if(r.automaticAudit)for(const message of automaticCashAuditText(r.automaticAudit).filter(v=>v.startsWith('Εκκρεμότητα:')))pending.push([r.day,r.shiftLabel,r.operatorName,'Αυτόματος έλεγχος',null,message]);
    for(const e of r.expenseFindings||[])if(!isExpenseIssueClosed(report,r,e))pending.push([r.day,r.shiftLabel,r.operatorName,'Παραστατικό εξόδου',amount(e.amountCents),e.code==='EXPENSE_WITHOUT_DOCUMENT'?'Λείπει παραστατικό.':'Απαιτείται επανέλεγχος παραστατικού.']);
    for(const e of r.pendingEvidence||[])pending.push([e.date,r.shiftLabel,r.operatorName,'Επανέλεγχος συνδεδεμένου στοιχείου',amount(e.amountCents),e.label]);
    shifts.push([report.storeName,r.day,at(r.openedAt),at(r.closedAt),r.terminalPos||null,r.shiftLabel,r.operatorName,r.identityRequiresReview?null:r.operatorId,r.sessionId,status[r.status],amount(r.initialCents),amount(r.offsetCents),amount(r.remainingCents),deficit===null?null:deficit/100,excess===null?null:excess/100,amount(r.cardCents),r.reviewNote||'']);
  }
  if(shortage!==report.totals.shortageCents||surplus!==report.totals.surplusCents||pendingCount!==report.totals.pending)invalid();
  if(employees.size!==report.employees.length||report.employees.some(e=>{const a=employees.get(e.key);return !a||a.name!==e.name||a.requiresIdentity!==e.identityRequiresReview||a.shortage!==e.shortageCents||a.surplus!==e.surplusCents;}))invalid();
  const summary=a=>[report.storeName,...(a.day?[a.day]:[]),a.name,a.operatorId,a.requiresIdentity?'Απαιτείται ταυτοποίηση βάρδιας':'Καταγεγραμμένος εργαζόμενος',a.shifts,a.shortage/100,a.surplus/100];
  if(report.checkpoint){pending.push([report.checkpoint.resumeFrom,'','','Σημείο συνέχειας',null,report.checkpoint.current===false?'Απαιτείται ενημέρωση του σημείου συνέχειας.':'Συνέχεια ελέγχου.']);for(const n of report.checkpoint.pendingNotes||[])pending.push(['','','','Εκκρεμότητα',null,n]);}
  const book=XLSX.utils.book_new();
  const add=(name,values,moneyColumns=[])=>{for(const row of values)for(const v of row)if(typeof v==='string')text(v);else if(v!==null&&v!==undefined&&(!Number.isFinite(v)||typeof v!=='number'))invalid();const sheet=XLSX.utils.aoa_to_sheet(values);sheet['!cols']=values[0].map((_,i)=>({wch:name==='Αναφορά'?110:i===values[0].length-1?55:26}));for(let row=1;row<values.length;row++)for(const column of moneyColumns){const cell=sheet[XLSX.utils.encode_cell({r:row,c:column})];if(cell?.t==='n')cell.z='#,##0.00" €"';}XLSX.utils.book_append_sheet(book,sheet,name);};
  add('Βάρδιες',shifts,[10,11,12,13,14,15]);
  add('Ανά εργαζόμενο',[['Κατάστημα','Χειριστής','Κωδικός εργαζομένου','Ταυτοποίηση','Ελεγμένες βάρδιες','Έλλειμμα','Πλεόνασμα'],...[...employees.values()].map(summary)],[5,6]);
  add('Ανά ημέρα',[['Κατάστημα','Ημερομηνία','Χειριστής','Κωδικός εργαζομένου','Ταυτοποίηση','Ελεγμένες βάρδιες','Έλλειμμα','Πλεόνασμα'],...[...days.values()].map(summary)],[6,7]);
  if(report.calculatedResult?.automaticCount){
    const result=report.calculatedResult;
    add('Αποτελέσματα βαρδιών',[['Κατάστημα','Ημερομηνία','Βάρδια','Χειριστής','Αναφορά βάρδιας','Τρόπος ελέγχου','Έλλειμμα','Πλεόνασμα'],...rows.filter(r=>r.reviewed||r.automaticallyCalculated).map(r=>[report.storeName,r.day,r.shiftLabel,r.operatorName,r.sessionId,r.reviewed?'Επιβεβαίωση ελεγκτή':'Αυτόματος υπολογισμός',Math.max(0,-r.remainingCents)/100,Math.max(0,r.remainingCents)/100])],[6,7]);
    add('Αποτελέσματα εργαζομένων',[['Κατάστημα','Χειριστής','Αναφορά εργαζομένου','Βάρδιες','Έλλειμμα','Πλεόνασμα'],...result.employees.map(e=>[report.storeName,e.name,e.key,e.shifts,e.shortageCents/100,e.surplusCents/100])],[4,5]);
    add('Αποτελέσματα ημέρας',[['Κατάστημα','Ημερομηνία','Χειριστής','Αναφορά εργαζομένου','Βάρδιες','Έλλειμμα','Πλεόνασμα'],...result.days.map(e=>[report.storeName,e.day,e.name,e.key,e.shifts,e.shortageCents/100,e.surplusCents/100])],[5,6]);
  }
  if(report.issueRegister?.status==='AVAILABLE')add('Απαντήσεις εκκρεμοτήτων',[
    ['Ημερομηνία','Χειριστής','Θέμα','Κίνηση','Ποσό','Κατάσταση','Τελευταία απόφαση','Απάντηση','Ελεγκτής','Χρόνος απάντησης (Ελλάδα)','Απαντήσεις','Τρέχον εύρημα'],
    ...report.issueRegister.issues.map(q=>[q.day,q.operatorName,issueCodeLabel[q.code],q.transactionId,amount(q.amountCents),issueStatusLabel[q.status],q.lastReply?(q.lastReply.decision==='CLOSED'?'Κλείσιμο':'Ανοιχτή / απάντηση'):'',q.lastReply?.note||'',q.lastReply?.actorName||'',at(q.lastReply?.createdAt),q.repliesCount,q.current?'Ναι':'Όχι - διατηρείται το ιστορικό'])
  ],[4]);
  if(report.handoffRegister?.status==='AVAILABLE')add('Απαντήσεις παραδόσεων',[
    ['Προηγούμενη ημέρα','Προηγούμενος χειριστής','Προηγούμενη βάρδια','Επόμενη ημέρα','Επόμενος χειριστής','Επόμενη βάρδια','POS','Προηγούμενη λήξη','Επόμενη έναρξη','Απόκλιση','Κατάσταση','Τελευταία απόφαση','Απάντηση','Ελεγκτής','Χρόνος απάντησης (Ελλάδα)','Απαντήσεις','Τρέχον εύρημα'],
    ...report.handoffRegister.issues.map(q=>[q.previousDay,q.previousOperator,q.previousSessionId,q.nextDay,q.nextOperator,q.nextSessionId,q.terminalPos,amount(q.previousClosingCents),amount(q.nextOpeningCents),amount(q.differenceCents),issueStatusLabel[q.status],q.lastReply?(q.lastReply.decision==='CLOSED'?'Κλείσιμο':'Ανοιχτή / απάντηση'):'',q.lastReply?.note||'',q.lastReply?.actorName||'',at(q.lastReply?.createdAt),q.repliesCount,q.current?'Ναι':'Όχι - διατηρείται το ιστορικό'])
  ],[7,8,9]);
  add('Εκκρεμότητες',[['Ημερομηνία','Βάρδια','Χειριστής','Θέμα','Ποσό','Σημείωση'],...pending],[4]);
  add('Αναφορά',[['Κείμενο αναφοράς'],...report.text.split('\n').map(line=>[line])]);
  add('Στοιχεία ελέγχου',[['Πεδίο','Τιμή'],['Κατάστημα',text(report.storeName)],['Αναφορά καταστήματος',text(scope.storeId)],['Εταιρεία',text(scope.companyId)],['Από',report.period.from],['Έως',report.period.to],['Ελεγμένα ελλείμματα',shortage/100],['Ελεγμένα πλεονάσματα',surplus/100],['Εκκρεμείς βάρδιες',pendingCount],['Κατάσταση ιστορικού',text(report.generation)],['Αποτύπωμα αναφοράς',text(report.reportHash)],['Αποτύπωμα προβολής',cashArchiveSourceHash(report)],['Τελευταίος έλεγχος',text(report.head)],['Χρόνος ανάγνωσης',report.checkedAt||'']]);
  const buffer=XLSX.write(book,{type:'buffer',bookType:'xlsx'});if(buffer.length>8*1024*1024)throw reconcileError('CASH_ARCHIVE_LIMIT',413);return buffer;
}
export async function readCashReviewedArchive({db,authorize,repository,req}){
  const parsed=archiveArguments.safeParse(req.query);if(!parsed.success)throw reconcileError('CASH_ARCHIVE_INVALID_REQUEST',400);
  const q=parsed.data,{scope}=await authorize(db,req.user,req.params.storeId);scope.generation=await repository.generation(scope);
  if(scope.storeId!==req.params.storeId||scope.generation!==q.generation)throw reconcileError('CASH_ARCHIVE_STALE');
  const period={from:q.from,to:q.to},report=await repository.read(scope,period);if(!sameReceipt(report,q))throw reconcileError('CASH_ARCHIVE_STALE');
  const buffer=cashArchiveWorkbook(report,scope);
  const fresh=await authorize(db,req.user,req.params.storeId);if(fresh.scope.companyId!==scope.companyId||fresh.scope.storeId!==scope.storeId||await repository.generation(scope)!==q.generation)throw reconcileError('CASH_ARCHIVE_STALE');
  const latest=await repository.read(scope,period);if(!sameReceipt(latest,q))throw reconcileError('CASH_ARCHIVE_STALE');
  const final=await authorize(db,req.user,req.params.storeId);
  if(final.scope.companyId!==scope.companyId||final.scope.storeId!==scope.storeId||await repository.generation(scope)!==q.generation)throw reconcileError('CASH_ARCHIVE_STALE');
  return {storeId:scope.storeId,period,generation:q.generation,head:q.head,reportHash:q.reportHash,previewHash:q.previewHash,mimeType:archiveMime,filename:`cash-reviewed-${q.from}-${q.to}.xlsx`,base64:buffer.toString('base64')};
}
