import {projectHandoffIssues,assertHandoffIssues,handoffIssueText} from './cash-handoff-issues.js';
import {canAutomaticallyCalculate,hasCashNumericContradiction,calculateCashResult,assertCalculatedCashResult} from './cash-automatic-result.js';
import {projectCashIssues,assertCashIssues,cashIssueText,isExpenseIssueClosed} from './cash-issue-replies.js';
import {assessAutomaticCash,automaticCashAuditText} from './cash-automatic-audit.js';
import {cashEventSalesText} from './cash-event-sales.js';
import {hash,activeRecords,reconcileError} from './cash-reconciliation-contract.js';
import {cashReportRowDay} from '../../../client/src/lib/cash-report-period.js';
import {projectFullCashAudit,assertFullCashAudit} from './cash-full-audit.js';

function fullCoverage(row,papers,kiosk){
  const e=row.fullEvidence,items=papers?.items||[],externalGap=kiosk&&(kiosk.status!=='AVAILABLE'||kiosk.coverage?.sourceUnavailable||kiosk.coverage?.missingJournalShiftIds?.length||kiosk.coverage?.unverifiedEventOverlapCount);
  const externalFindings=kiosk?.findings?.length||0;
  return {sessionId:row.sessionId,sourceHash:row.sourceHash,
    events:{status:e?.events?.status==='AVAILABLE'&&row.eventSales?.status==='AVAILABLE'&&!externalGap?'COMPLETE':'INCOMPLETE',unresolvedCount:(e?.events?.findings?.length||0)+(e?.events?.unassignedCount||0)+(row.eventSales?.findings?.length||0)+externalFindings},
    duplicates:{status:e?.duplicates?.salesStatus==='LINKED_POS_SCOPE'?'COMPLETE':'INCOMPLETE',windowSeconds:60,unresolvedCount:(e?.duplicates?.findings||[]).filter(f=>f.code==='SALE_LINE_DUPLICATE_CANDIDATE').length},
    papers:{status:papers?.coverage.complete?'COMPLETE':'INCOMPLETE',unresolvedCount:items.filter(i=>i.status==='UNRESOLVED').length+(row.pendingEvidence?.length||0)},
    expenses:{status:'COMPLETE',unresolvedCount:row.expenseFindings.length}};
}
const timestamp=v=>v?new Date(v).getTime():NaN;
export function immediateCashPair(previous,next,rule){
  const a=previous?.session,b=next?.session;
  return Boolean(a&&b&&rule.mode==='FULL'&&rule.carryOverEnabled===true&&a.status==='CLOSED'&&b.status==='CLOSED'&&a.companyId===b.companyId&&a.storeId===b.storeId&&a.terminalPos===b.terminalPos&&a.nextSession?.id===b.id&&Number.isFinite(timestamp(a.openedAt))&&Number.isFinite(timestamp(a.closedAt))&&Number.isFinite(timestamp(b.openedAt))&&Number.isFinite(timestamp(b.closedAt))&&timestamp(a.openedAt)<=timestamp(a.closedAt)&&timestamp(a.closedAt)<=timestamp(b.openedAt)&&timestamp(b.openedAt)<=timestamp(b.closedAt));
}
export function projectReconciliation(source,records,paperValidity=new Map()){
  const active=activeRecords(records),activeIds=new Set(active.map(r=>r.id));
  const rows=new Map([...source.sessions].map(([id,s])=>[id,{sessionId:id,sourceHash:s.sourceHash,openedAt:s.session.openedAt,closedAt:s.session.closedAt,terminalPos:s.session.terminalPos,shiftLabel:s.session.shiftLabel||'Βάρδια',operatorId:s.session.openedBy||null,operatorName:s.session.openedByName||'Χωρίς καταγεγραμμένο χειριστή',initialCents:s.initialCents,explainedCents:s.explainedCents,offsetCents:0,remainingCents:s.basisCents,cardCents:s.cardCents,nextClosed:s.nextClosed,recheck:s.reviewStatus!=='VALID',associations:[],offsets:[]} ]));
  const offsets=active.filter(r=>r.data.kind==='OFFSET'),invalid=new Set();
  const pairs=new Set();for(const r of offsets){const key=JSON.stringify([r.data.previousSessionId,r.data.nextSessionId]);if(pairs.has(key))throw reconcileError('CASH_RECONCILIATION_INVALID_HISTORY');pairs.add(key);}
  for(const r of active.filter(r=>r.data.kind==='ASSOCIATE')){
    const row=rows.get(r.data.sessionId);if(!row)continue;
    row.associations.push(r.id);row.cashAssociations??=[];row.pendingEvidence??=[];
    const separate=['POS','EFTPOS','PREPAID'].includes(r.data.confirmedKind),valid=row.sourceHash===r.data.sourceHash&&r.proof.sourceHash===r.data.sourceHash&&paperValidity.get(r.id)===true;
    if(!separate)row.cashAssociations.push(r.id);
    if(!valid||r.data.confirmedKind==='OTHER'){
      if(!separate)invalid.add(row.sessionId);
      row.pendingEvidence.push({id:r.id,kind:r.data.confirmedKind,label:r.proof.rawLine?.label||'Συνδεδεμένο χαρτί',date:r.data.confirmedDate,amountCents:r.data.confirmedAmountCents});
    }
  }
  for(const r of offsets){
    const d=r.data,a=source.sessions.get(d.previousSessionId),b=source.sessions.get(d.nextSessionId);
    if(!a||!b||!immediateCashPair(a,b,source.rule)||a.sourceHash!==d.previousHash||b.sourceHash!==d.nextHash||r.proof.previousHash!==d.previousHash||r.proof.nextHash!==d.nextHash){invalid.add(d.previousSessionId);invalid.add(d.nextSessionId);}
  }
  // Assess before allocating offsets so a contradiction invalidates both halves.
  const automatic=new Map(),full=s=>s?{...s.automaticSnapshot,...s.session}:null;
  for(const [id,original]of source.sessions)if(original.automaticSnapshot){
    const audit=assessAutomaticCash({session:full(original),transactions:original.automaticTransactions,previous:full(source.sessions.get(original.session.previousSession?.id)),next:full(source.sessions.get(original.session.nextSession?.id)),rule:source.rule,sourceValid:original.reviewStatus==='VALID'});
    automatic.set(id,audit);if(hasCashNumericContradiction(audit))invalid.add(id);
  }
  for(const row of rows.values())if(row.recheck)invalid.add(row.sessionId);
  // A changed half invalidates every connected allocation, never only one side.
  let propagated=true;
  while(propagated){propagated=false;for(const r of offsets){const ids=[r.data.previousSessionId,r.data.nextSessionId];if(ids.some(id=>invalid.has(id)))for(const id of ids)if(!invalid.has(id)){invalid.add(id);propagated=true;}}}
  for(const r of offsets){
    const d=r.data,a=rows.get(d.previousSessionId),b=rows.get(d.nextSessionId);
    if(!a||!b||invalid.has(a.sessionId)||invalid.has(b.sessionId))continue;
    if(a.remainingCents===null||b.remainingCents===null||a.remainingCents*b.remainingCents>=0||d.amountCents>Math.min(Math.abs(a.remainingCents),Math.abs(b.remainingCents)))throw reconcileError('CASH_RECONCILIATION_INVALID_HISTORY');
    for(const row of [a,b]){row.remainingCents-=Math.sign(row.remainingCents)*d.amountCents;row.offsetCents+=d.amountCents;row.offsets.push(r.id);}
  }
  for(const [id,row]of rows){
    const original=source.sessions.get(id),lastConfirmation=[...records].reverse().find(r=>r.data.kind==='CONFIRM'&&r.data.sessionId===id);
    row.recheck=invalid.has(id);row.planHash=hash({sessionId:id,sourceHash:row.sourceHash,remainingCents:row.remainingCents,associations:row.cashAssociations||[],offsets:row.offsets});
    const needsNext=source.rule.mode==='FULL'&&source.rule.carryOverEnabled;
    row.eligible=original.session.status==='CLOSED'&&Number.isFinite(timestamp(row.closedAt))&&timestamp(row.closedAt)>=timestamp(row.openedAt)&&row.remainingCents!==null&&!row.recheck&&(!needsNext||row.nextClosed)&&source.rule.mode!=='POS_EFTPOS_ONLY';
    row.reviewed=Boolean(row.eligible&&lastConfirmation&&activeIds.has(lastConfirmation.id)&&lastConfirmation.data.sourceHash===row.sourceHash&&lastConfirmation.data.planHash===row.planHash);
    row.status=source.rule.mode==='POS_EFTPOS_ONLY'?'NOT_APPLICABLE':row.recheck?'RECHECK_REQUIRED':needsNext&&!row.nextClosed?'AWAITING_NEXT_SHIFT':row.reviewed?'REVIEWED':'AWAITING_REVIEW';
    row.reviewedBy=row.reviewed?lastConfirmation.actorName:null;
    row.reviewNote=row.reviewed?lastConfirmation.data.note||null:null;
    row.day=row.closedAt?cashReportRowDay(row.closedAt):null;
    row.expenseFindings=original.expenseFindings||[];
    if(original.eventSales)row.eventSales=original.eventSales;
    if(automatic.has(id))row.automaticAudit=automatic.get(id);
    row.transactions=original.transactions.slice(0,30);row.transactionsLimited=original.transactions.length>30;
    row.nextSessionId=original.session.nextSession?.id||null;row.previousSessionId=original.session.previousSession?.id||null;
  }
  const selected=source.selectedIds.map(id=>rows.get(id));
  const sourceReportHash=hash({period:source.period,rows:selected.map(r=>({id:r.sessionId,sourceHash:r.sourceHash,planHash:r.planHash,status:r.status,associations:r.associations,pendingEvidence:r.pendingEvidence||[],...(r.automaticAudit?{automaticAudit:r.automaticAudit}:{}),...(r.expenseFindings?.length?{expenseFindings:r.expenseFindings}:{}),...(r.eventSales?{eventSales:r.eventSales}:{})})),...(source.kioskEventSales?{kioskEventSales:source.kioskEventSales}:{})});
  const checkpoint=[...records].reverse().find(r=>r.data.kind==='CHECKPOINT');
  const totals={shortageCents:0,surplusCents:0,pending:selected.filter(r=>!r.reviewed&&r.status!=='NOT_APPLICABLE').length},employees=new Map();
  const operatorNames=new Map();for(const r of rows.values()){const names=operatorNames.get(r.operatorId)||new Set();names.add(r.operatorName);operatorNames.set(r.operatorId,names);}
  for(const r of rows.values()){
    const normalized=r.operatorName.normalize('NFD').replace(/\p{M}/gu,'').toLocaleUpperCase('el-GR');
    r.identityRequiresReview=!r.operatorId||/ΕΚΤΑΚΤ|ΧΩΡΙΣ|UNKNOWN/.test(normalized)||operatorNames.get(r.operatorId)?.size>1;
    r.employeeKey=r.identityRequiresReview?'session:'+r.sessionId:'operator:'+r.operatorId;
  }
  for(const r of selected.filter(r=>r.reviewed)){
    const key=r.employeeKey;
    const e=employees.get(key)||{key,name:r.operatorName,identityRequiresReview:r.identityRequiresReview,shortageCents:0,surplusCents:0};
    const shortage=Math.max(0,-r.remainingCents),surplus=Math.max(0,r.remainingCents);totals.shortageCents+=shortage;totals.surplusCents+=surplus;e.shortageCents+=shortage;e.surplusCents+=surplus;employees.set(key,e);
  }
  for(const r of selected)r.automaticallyCalculated=canAutomaticallyCalculate(r);
  if(source.paperEvidence)for(const row of selected){
    row.fullEvidence=source.sessions.get(row.sessionId).fullEvidence;
    row.fullCoverage=fullCoverage(row,source.paperEvidence,source.kioskEventSales);
    row.fullAudit=projectFullCashAudit({row,coverage:row.fullCoverage});
  }
  const calculatedResult=calculateCashResult(selected);
  const issueRegister=projectCashIssues(source.store.id,selected,records);
  const handoffRegister=projectHandoffIssues(source,records,immediateCashPair);
  for(const row of selected){const ids=handoffRegister?.status==='AVAILABLE'?handoffRegister.issues.filter(q=>q.current&&[q.previousSessionId,q.nextSessionId].includes(row.sessionId)).map(q=>q.id):[];if(ids.length)row.handoffIssueIds=ids;}
  const reportHash=hash({sourceReportHash,calculatedResult,...(source.paperEvidence?{paperEvidence:source.paperEvidence,fullEvidence:selected.map(r=>({sessionId:r.sessionId,fullEvidence:r.fullEvidence,fullCoverage:r.fullCoverage,fullAudit:r.fullAudit}))}:{}),...(handoffRegister?{handoffRegister}:{}),...(issueRegister?{issueRegister}:{}),identities:selected.map(r=>({sessionId:r.sessionId,employeeKey:r.employeeKey,operatorName:r.operatorName,identityRequiresReview:r.identityRequiresReview,automaticallyCalculated:r.automaticallyCalculated}))});
  const sameCheckpointPeriod=checkpoint?.proof.period?.from===source.period.from&&checkpoint?.proof.period?.to===source.period.to;
  const result={storeId:source.store.id,storeName:source.store.name,period:source.period,rows:selected,context:[...rows.values()].filter(r=>!source.selectedIds.includes(r.sessionId)),totals,employees:[...employees.values()],calculatedResult,reportHash,checkpoint:checkpoint?{resumeFrom:checkpoint.data.resumeFrom,pendingNotes:checkpoint.data.pendingNotes,period:checkpoint.proof.period,createdAt:checkpoint.createdAt,reviewedBy:checkpoint.actorName,current:sameCheckpointPeriod?checkpoint.data.reportHash===reportHash:null}:null,coverage:source.coverage,financialFinality:'REVIEWED_CASH_ROWS_ONLY',originalFinancialLedgerChanged:false};
  if(source.kioskEventSales)result.kioskEventSales=source.kioskEventSales;
  if(issueRegister)result.issueRegister=issueRegister;
  if(handoffRegister)result.handoffRegister=handoffRegister;
  if(source.paperEvidence)result.paperEvidence=source.paperEvidence;
  result.text=reconciliationText(result);if(result.text.length>140000)throw reconcileError('CASH_RECONCILIATION_LIMIT');return result;
}
const money=cents=>cents===null?'άγνωστο':(Math.abs(cents)/100).toLocaleString('el-GR',{style:'currency',currency:'EUR'});
const signedResult=cents=>cents===null?'Άγνωστη διαφορά':cents<0?'Έλλειμμα '+money(cents):cents>0?'Πλεόνασμα '+money(cents):'Χωρίς διαφορά';
export function reconciliationText(report){
  assertCalculatedCashResult(report);
  assertCashIssues(report);
  assertHandoffIssues(report);
  for(const row of report.rows)if(row.fullAudit){const current=fullCoverage(row,report.paperEvidence,report.kioskEventSales);if(hash(current)!==hash(row.fullCoverage))throw Error('Full evidence coverage changed.');assertFullCashAudit({row,coverage:current,fullAudit:row.fullAudit});}
  const names=[...new Set(report.rows.filter(r=>r.reviewed).map(r=>r.reviewedBy).filter(Boolean))],tokens=names.length===1?names[0].normalize('NFD').replace(/\p{M}/gu,'').toLocaleUpperCase('el-GR').split(/\s+/):[];
  const signature=names.length===1?tokens.includes('ΧΡΗΣΤΟΣ')&&tokens.includes('ΜΑΝΗΣ')?'ΜΑΝΗΣ ΧΡΗΣΤΟΣ':names[0].toLocaleUpperCase('el-GR'):null;
  const lines=['ΕΛΕΓΧΟΣ ΤΑΜΕΙΩΝ MYWORKSTATION',`${report.storeName} · ${report.period.from} έως ${report.period.to}`,'','ΑΠΟΤΕΛΕΣΜΑ ΜΕΤΑ ΑΠΟ ΕΛΕΓΧΟ'+(signature?' — '+signature:'')];
  if(!report.rows.length)lines.push('Δεν βρέθηκαν κλεισμένες βάρδιες στην επιλεγμένη περίοδο.');
  for(const row of report.rows){
    if(row.fullAudit){
      const pendingLabels={SOURCE_COVERAGE:'κάλυψη πηγών',CASH_ARITHMETIC:'συμφωνία κινήσεων μετρητών',OPERATOR_IDENTITY:'ταυτότητα χειριστή',RESULT_ELIGIBILITY:'επιλεξιμότητα αποτελέσματος',CARD_ARITHMETIC:'συμφωνία καρτών',HANDOFF:'παραδόσεις ταμείου',AWAITING_NEXT_SHIFT:'κλείσιμο επόμενης βάρδιας',AUDIT_OPEN_ISSUES:'ανοικτά αριθμητικά ερωτήματα',EVENTS:'συμβάντα και αλλαγές τιμών',DUPLICATES:'πιθανές διπλές συναλλαγές',PAPERS:'χειρόγραφα του τσατ',EXPENSES:'παραστατικά εξόδων'};
      lines.push(row.fullAudit.status==='FINAL'?`ΤΕΛΙΚΟ ΤΕΚΜΗΡΙΩΜΕΝΟ ΑΠΟΤΕΛΕΣΜΑ · ${row.operatorName}: ${signedResult(row.fullAudit.remainingCents)}.`:`Πλήρης έλεγχος · ${row.operatorName}: ${row.fullAudit.status==='NOT_APPLICABLE'?'δεν εφαρμόζεται':row.fullAudit.status==='AWAITING_NEXT_SHIFT'?'αναμονή επόμενης βάρδιας':'εκκρεμεί διασταύρωση'}.`);
      if(row.fullAudit.pendingChecks.length)lines.push(`Ευρήματα: συμβάντα ${row.fullCoverage.events.unresolvedCount}, πιθανές διπλές συναλλαγές ${row.fullCoverage.duplicates.unresolvedCount}, χειρόγραφα ${row.fullCoverage.papers.unresolvedCount}, παραστατικά ${row.fullCoverage.expenses.unresolvedCount}.`);
      if(row.fullAudit.pendingChecks.length)lines.push('Εκκρεμούν: '+row.fullAudit.pendingChecks.map(c=>pendingLabels[c]).join(', ')+'.');
      for(const event of (row.fullEvidence?.events?.findings||[]).slice(0,30))lines.push(`Συμβάν ${event.code} · ${new Date(event.occurredAt).toLocaleString('el-GR',{timeZone:'Europe/Athens',hour12:false})} · αναφορά ${event.eventId}${event.afterClose?' · μετά το κλείσιμο':''}. Παραμένει προς διευκρίνιση.`);
      for(const finding of (row.fullEvidence?.duplicates?.findings||[]).slice(0,30))if(finding.code==='SALE_LINE_DUPLICATE_CANDIDATE')lines.push(`Πιθανή διπλή συναλλαγή εντός 1 λεπτού: ${finding.transactions.map(t=>t.receiptNumber||t.saleId).join(' / ')} · απόσταση ${finding.secondsApart} δευτερολέπτων. Δεν επιβάλλεται αυτόματη χρέωση.`);
    }
    if(row.openedAt&&row.closedAt){const clock=v=>new Date(v).toLocaleTimeString('el-GR',{timeZone:'Europe/Athens',hour:'2-digit',minute:'2-digit',hour12:false});lines.push(`Ώρες βάρδιας ${row.operatorName}: ${clock(row.openedAt)}–${clock(row.closedAt)}.`);}
    if(row.status==='NOT_APPLICABLE')lines.push(`${row.day} · ${row.shiftLabel} · ${row.operatorName}: δεν εφαρμόζεται έλεγχος μετρητών.`);
    else{lines.push(`${row.day} · ${row.shiftLabel} · ${row.operatorName}: ${signedResult(row.remainingCents)}${row.reviewed||row.automaticallyCalculated?'':' — ΥΠΟ ΕΛΕΓΧΟ'}.`);
      if(row.offsetCents)lines.push(`Αρχική διαφορά ${signedResult(row.initialCents)} · επαληθευμένος συμψηφισμός με διαδοχική βάρδια ${money(row.offsetCents)}.`);
      if(row.status==='AWAITING_NEXT_SHIFT')lines.push('Αναμονή κλεισίματος της επόμενης βάρδιας.');
      if(row.status==='RECHECK_REQUIRED')lines.push('Απαιτείται επανέλεγχος των κινήσεων ή των συνδεδεμένων στοιχείων.');
    }
    lines.push(`POS–EFTPOS: ${row.cardCents===null?'δεν υπάρχουν πλήρη στοιχεία':row.cardCents===0?'χωρίς διαφορά':'διαφορά '+(row.cardCents>0?'+':'−')+money(row.cardCents)}.`);
    if(row.automaticAudit?.irisCents)lines.push('Εκκρεμεί ο διαχωρισμός IRIS από το παραπάνω καταχωρισμένο σύνολο καρτών.');
    for(const finding of row.expenseFindings||[]){
      const amount=money(finding.amountCents),when=finding.occurredAt?new Date(finding.occurredAt).toLocaleString('el-GR',{timeZone:'Europe/Athens',dateStyle:'short',timeStyle:'short',hour12:false}):'χωρίς ώρα';
      const prefix=isExpenseIssueClosed(report,row,finding)?'Αρχικό εύρημα (κλειστή εκκρεμότητα με τεκμηρίωση)':'Εκκρεμότητα';
      lines.push(finding.code==='EXPENSE_WITHOUT_DOCUMENT'?`${prefix} ${when}: έξοδο ${amount} χωρίς παραστατικό.`:`${prefix} ${when}: παραστατικό ή πληρωμή ${amount} χρειάζεται επανέλεγχο.`);
    }
    if(row.automaticallyCalculated)lines.push('Το αποτέλεσμα μετρητών υπολογίστηκε αυτόματα από τις διαθέσιμες κινήσεις και παραδόσεις.');
    if(row.automaticAudit)lines.push(...automaticCashAuditText(row.automaticAudit));
    if(row.reviewNote)lines.push('Σχόλιο ελέγχου: '+row.reviewNote);
    for(const evidence of row.pendingEvidence||[])lines.push(`Εκκρεμεί επανέλεγχος: ${evidence.date} · ${evidence.label} · ${money(evidence.amountCents)}.`);
  }
  if(report.paperEvidence){
    lines.push('','ΧΕΙΡΟΓΡΑΦΑ ΚΑΙ ΠΑΡΑΣΤΑΤΙΚΑ ΑΠΟ ΤΟ ΤΣΑΤ');
    lines.push(report.paperEvidence.coverage.discoveryComplete?'Εξετάστηκαν όλα τα διαθέσιμα υποστηριζόμενα συνημμένα του καταστήματος στην τρέχουσα αναζήτηση.':'Η κάλυψη των συνημμένων παραμένει περιορισμένη.');
    const reasons={CURRENT_SOURCE_UNAVAILABLE:'το πρωτότυπο χρειάζεται επανέλεγχο',NOT_READ:'δεν έχει διαβαστεί',PENDING:'αναμονή προηγούμενης ανάγνωσης',REQUIRES_REVIEW:'η ανάγνωση χρειάζεται έλεγχο',INVALID_SOURCE:'μη διαθέσιμο πρωτότυπο',INVALID_READING:'μη επιβεβαιωμένη ανάγνωση',DOCUMENT_DATE_UNREADABLE:'δεν διαβάστηκε πλήρης ημερομηνία',PRINTED_DATE_OUTSIDE_SELECTED_SHIFTS:'η αναγραφόμενη ημερομηνία είναι εκτός περιόδου',NO_DOCUMENT_LINES:'δεν αναγνωρίστηκαν γραμμές',UNCERTAIN_LINE:'ασαφή στοιχεία γραμμής',LINE_TIME_UNREADABLE:'δεν διαβάστηκε σαφής ώρα',AMBIGUOUS_MATCH:'περισσότερες από μία πιθανές αντιστοιχίσεις',NO_MATCHING_RECORDED_MOVEMENT:'δεν βρέθηκε αντίστοιχη καταχωρισμένη κίνηση',UNIQUE_RECORDED_CORROBORATION:'μοναδική συμφωνία με καταχωρισμένα στοιχεία',CONTEXT_SHIFT_ONLY:'αφορά βάρδια εκτός επιλεγμένης περιόδου'};
    if(report.paperEvidence.items.length>100)lines.push(`Εμφανίζονται 100 από ${report.paperEvidence.items.length} γραμμές. Οι υπόλοιπες περιλαμβάνονται στον έλεγχο κάλυψης.`);
    for(const item of report.paperEvidence.items.slice(0,100))lines.push(`${item.status==='MATCHED'?'Συμφωνεί με καταχωρισμένη κίνηση':item.status==='OUT_OF_PERIOD'?'Εκτός επιλεγμένων βαρδιών':'Χρειάζεται διευκρίνιση'} · συνημμένο ${item.sourceId} · γραμμή ${item.line===null?'—':item.line+1}${Number.isSafeInteger(item.amountCents)?' · '+money(item.amountCents):''}${item.transactionId?' · κίνηση '+item.transactionId:''} · ${reasons[item.reason]||'χρειάζεται διευκρίνιση'}.`);
  }
  const eventRows=report.rows.filter(r=>r.eventSales&&(r.eventSales.status!=='AVAILABLE'||r.eventSales.findings.length));
  if(eventRows.length){lines.push('','ΕΛΕΓΧΟΣ ΣΥΜΒΑΝΤΩΝ — ΑΛΛΑΓΕΣ ΤΙΜΩΝ ΚΑΙ ΕΚΠΤΩΣΕΙΣ');for(const row of eventRows)lines.push(...cashEventSalesText(row.eventSales,{storeName:report.storeName,shiftLabel:row.shiftLabel}));}
  if(report.kioskEventSales){
    const external=report.kioskEventSales,coverage=external.coverage;
    lines.push('','ΣΥΜΒΑΝΤΑ ΚΑΙ ΠΩΛΗΣΕΙΣ ΑΠΟ ΑΡΧΕΙΑ KIOSK');
    if(external.status!=='AVAILABLE')lines.push('Ο έλεγχος των αρχείων Kiosk παραμένει ελλιπής.');
    if(coverage.missingJournalShiftIds.length)lines.push('Λείπουν ημερολόγια Kiosk για τις βάρδιες: '+coverage.missingJournalShiftIds.join(', ')+'.');
    if(coverage.unverifiedEventOverlapCount)lines.push('Υπάρχουν επικαλυπτόμενα συμβάντα μεταξύ διαφορετικών αρχείων, χωρίς ασφαλή ταυτοποίηση.');
    if(coverage.sourceUnavailable)lines.push('Δεν επιβεβαιώθηκαν όλα τα πρωτότυπα και η ανάγνωσή τους.');
    lines.push(...cashEventSalesText({...external,status:'AVAILABLE'},{storeName:report.storeName,shiftLabel:'Βάρδια Kiosk'}));
    if(external.status==='AVAILABLE'&&!external.findings.length)lines.push('Δεν εντοπίστηκαν πρόσθετα ευρήματα στα ανεβασμένα αρχεία της επιλεγμένης περιόδου.');
  }
  const original=report.rows.filter(r=>r.status!=='NOT_APPLICABLE');
  if(original.length&&original.every(r=>r.initialCents!==null)){const surplus=original.reduce((a,r)=>a+Math.max(0,r.initialCents),0),shortage=original.reduce((a,r)=>a+Math.max(0,-r.initialCents),0);lines.push('',`Αρχικά ελλείμματα: ${money(shortage)}. Αρχικά πλεονάσματα: ${money(surplus)}.`);}
  const effective=report.calculatedResult?.automaticCount?report.calculatedResult:null;
  if(effective)lines.push('',`Ελλείμματα μετά τον έλεγχο: ${money(effective.shortageCents)}. Πλεονάσματα μετά τον έλεγχο: ${money(effective.surplusCents)}.`);
  else if(report.rows.some(r=>r.reviewed))lines.push('',`Ελεγμένα ελλείμματα: ${money(report.totals.shortageCents)}. Ελεγμένα πλεονάσματα: ${money(report.totals.surplusCents)}.`);
  const pending=effective?.pending??report.totals.pending;
  if(pending)lines.push(`Εκκρεμούν ${pending} βάρδιες· δεν περιλαμβάνονται στα ελεγμένα σύνολα.`);
  for(const employee of effective?.employees??report.employees)lines.push(`${employee.name}: ελλείμματα ${money(employee.shortageCents)} · πλεονάσματα ${money(employee.surplusCents)}${employee.identityRequiresReview?' · απαιτείται ταυτοποίηση της βάρδιας':''}.`);
  lines.push(...cashIssueText(report.issueRegister),...handoffIssueText(report.handoffRegister));
  if(report.checkpoint){lines.push('',`Συνέχεια από ${report.checkpoint.resumeFrom}${report.checkpoint.current===false?' — το σημείο συνέχειας χρειάζεται ενημέρωση':''}. Έλεγχος ${report.checkpoint.period.from} έως ${report.checkpoint.period.to}.`,...report.checkpoint.pendingNotes.map(n=>'Εκκρεμότητα: '+n));}
  return lines.join('\n');
}
