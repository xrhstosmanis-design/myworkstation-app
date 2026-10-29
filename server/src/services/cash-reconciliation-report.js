import {assessAutomaticCash,automaticCashAuditText} from './cash-automatic-audit.js';
import {cashEventSalesText} from './cash-event-sales.js';
import {hash,activeRecords,reconcileError} from './cash-reconciliation-contract.js';
import {cashReportRowDay} from '../../../client/src/lib/cash-report-period.js';

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
    if(original.automaticSnapshot){
      const full=s=>s?{...s.automaticSnapshot,...s.session}:null;
      row.automaticAudit=assessAutomaticCash({session:full(original),transactions:original.automaticTransactions,previous:full(source.sessions.get(original.session.previousSession?.id)),next:full(source.sessions.get(original.session.nextSession?.id)),rule:source.rule,sourceValid:!row.recheck});
    }
    row.transactions=original.transactions.slice(0,30);row.transactionsLimited=original.transactions.length>30;
    row.nextSessionId=original.session.nextSession?.id||null;row.previousSessionId=original.session.previousSession?.id||null;
  }
  const selected=source.selectedIds.map(id=>rows.get(id));
  const reportHash=hash({period:source.period,rows:selected.map(r=>({id:r.sessionId,sourceHash:r.sourceHash,planHash:r.planHash,status:r.status,associations:r.associations,pendingEvidence:r.pendingEvidence||[],...(r.automaticAudit?{automaticAudit:r.automaticAudit}:{}),...(r.expenseFindings?.length?{expenseFindings:r.expenseFindings}:{}),...(r.eventSales?{eventSales:r.eventSales}:{})})),...(source.kioskEventSales?{kioskEventSales:source.kioskEventSales}:{})});
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
  const sameCheckpointPeriod=checkpoint?.proof.period?.from===source.period.from&&checkpoint?.proof.period?.to===source.period.to;
  const result={storeId:source.store.id,storeName:source.store.name,period:source.period,rows:selected,context:[...rows.values()].filter(r=>!source.selectedIds.includes(r.sessionId)),totals,employees:[...employees.values()],reportHash,checkpoint:checkpoint?{resumeFrom:checkpoint.data.resumeFrom,pendingNotes:checkpoint.data.pendingNotes,period:checkpoint.proof.period,createdAt:checkpoint.createdAt,reviewedBy:checkpoint.actorName,current:sameCheckpointPeriod?checkpoint.data.reportHash===reportHash:null}:null,coverage:source.coverage,financialFinality:'REVIEWED_CASH_ROWS_ONLY',originalFinancialLedgerChanged:false};
  if(source.kioskEventSales)result.kioskEventSales=source.kioskEventSales;
  result.text=reconciliationText(result);return result;
}
const money=cents=>cents===null?'άγνωστο':(Math.abs(cents)/100).toLocaleString('el-GR',{style:'currency',currency:'EUR'});
const signedResult=cents=>cents===null?'Άγνωστη διαφορά':cents<0?'Έλλειμμα '+money(cents):cents>0?'Πλεόνασμα '+money(cents):'Χωρίς διαφορά';
export function reconciliationText(report){
  const names=[...new Set(report.rows.filter(r=>r.reviewed).map(r=>r.reviewedBy).filter(Boolean))],tokens=names.length===1?names[0].normalize('NFD').replace(/\p{M}/gu,'').toLocaleUpperCase('el-GR').split(/\s+/):[];
  const signature=names.length===1?tokens.includes('ΧΡΗΣΤΟΣ')&&tokens.includes('ΜΑΝΗΣ')?'ΜΑΝΗΣ ΧΡΗΣΤΟΣ':names[0].toLocaleUpperCase('el-GR'):null;
  const lines=['ΕΛΕΓΧΟΣ ΤΑΜΕΙΩΝ MYWORKSTATION',`${report.storeName} · ${report.period.from} έως ${report.period.to}`,'','ΑΠΟΤΕΛΕΣΜΑ ΜΕΤΑ ΑΠΟ ΕΛΕΓΧΟ'+(signature?' — '+signature:'')];
  if(!report.rows.length)lines.push('Δεν βρέθηκαν κλεισμένες βάρδιες στην επιλεγμένη περίοδο.');
  for(const row of report.rows){
    if(row.openedAt&&row.closedAt){const clock=v=>new Date(v).toLocaleTimeString('el-GR',{timeZone:'Europe/Athens',hour:'2-digit',minute:'2-digit',hour12:false});lines.push(`Ώρες βάρδιας ${row.operatorName}: ${clock(row.openedAt)}–${clock(row.closedAt)}.`);}
    if(row.status==='NOT_APPLICABLE')lines.push(`${row.day} · ${row.shiftLabel} · ${row.operatorName}: δεν εφαρμόζεται έλεγχος μετρητών.`);
    else{lines.push(`${row.day} · ${row.shiftLabel} · ${row.operatorName}: ${signedResult(row.remainingCents)}${row.reviewed?'':' — ΥΠΟ ΕΛΕΓΧΟ'}.`);
      if(row.offsetCents)lines.push(`Αρχική διαφορά ${signedResult(row.initialCents)} · επαληθευμένος συμψηφισμός με διαδοχική βάρδια ${money(row.offsetCents)}.`);
      if(row.status==='AWAITING_NEXT_SHIFT')lines.push('Αναμονή κλεισίματος της επόμενης βάρδιας.');
      if(row.status==='RECHECK_REQUIRED')lines.push('Απαιτείται επανέλεγχος των κινήσεων ή των συνδεδεμένων στοιχείων.');
    }
    lines.push(`POS–EFTPOS: ${row.cardCents===null?'δεν υπάρχουν πλήρη στοιχεία':row.cardCents===0?'χωρίς διαφορά':'διαφορά '+(row.cardCents>0?'+':'−')+money(row.cardCents)}.`);
    for(const finding of row.expenseFindings||[]){
      const amount=money(finding.amountCents),when=finding.occurredAt?new Date(finding.occurredAt).toLocaleString('el-GR',{timeZone:'Europe/Athens',dateStyle:'short',timeStyle:'short',hour12:false}):'χωρίς ώρα';
      lines.push(finding.code==='EXPENSE_WITHOUT_DOCUMENT'?`Εκκρεμότητα ${when}: έξοδο ${amount} χωρίς παραστατικό.`:`Εκκρεμότητα ${when}: παραστατικό ή πληρωμή ${amount} χρειάζεται επανέλεγχο.`);
    }
    if(row.automaticAudit)lines.push(...automaticCashAuditText(row.automaticAudit));
    if(row.reviewNote)lines.push('Σχόλιο ελέγχου: '+row.reviewNote);
    for(const evidence of row.pendingEvidence||[])lines.push(`Εκκρεμεί επανέλεγχος: ${evidence.date} · ${evidence.label} · ${money(evidence.amountCents)}.`);
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
  if(report.rows.some(r=>r.reviewed))lines.push('',`Ελεγμένα ελλείμματα: ${money(report.totals.shortageCents)}. Ελεγμένα πλεονάσματα: ${money(report.totals.surplusCents)}.`);
  if(report.totals.pending)lines.push(`Εκκρεμούν ${report.totals.pending} βάρδιες· δεν περιλαμβάνονται στα ελεγμένα σύνολα.`);
  for(const employee of report.employees)lines.push(`${employee.name}: ελλείμματα ${money(employee.shortageCents)} · πλεονάσματα ${money(employee.surplusCents)}${employee.identityRequiresReview?' · απαιτείται ταυτοποίηση της βάρδιας':''}.`);
  if(report.checkpoint){lines.push('',`Συνέχεια από ${report.checkpoint.resumeFrom}${report.checkpoint.current===false?' — το σημείο συνέχειας χρειάζεται ενημέρωση':''}. Έλεγχος ${report.checkpoint.period.from} έως ${report.checkpoint.period.to}.`,...report.checkpoint.pendingNotes.map(n=>'Εκκρεμότητα: '+n));}
  return lines.join('\n');
}
