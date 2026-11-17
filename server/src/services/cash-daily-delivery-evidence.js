import {z} from 'zod';

const sources={
  OPENING_CASH:'Άνοιγμα ταμείου',
  CLOSING_CASH:'Κλείσιμο ταμείου',
  POS:'POS',
  EFTPOS:'EFTPOS',
  PREPAID:'Προπληρωμένες κάρτες'
};
const issues={
  UNCERTAIN_LINE:'Αβέβαιη ανάγνωση γραμμής',
  DOCUMENT_DATE_UNREADABLE:'Μη αναγνώσιμη ημερομηνία',
  LINE_TIME_UNREADABLE:'Μη αναγνώσιμη ώρα',
  AMBIGUOUS_MATCH:'Περισσότερες από μία πιθανές αντιστοιχίσεις',
  NO_MATCHING_RECORDED_MOVEMENT:'Χρειάζεται αντιστοίχιση με κίνηση',
  REPEATED_LINE_MATCH:'Πολλαπλές γραμμές αντιστοιχούν στην ίδια κίνηση',
  OTHER:'Χρειάζεται έλεγχος συνημμένου'
};
const count=z.number().int().nonnegative().safe();
const cents=z.number().int().safe();
const issueCounts=z.array(z.object({
  reason:z.enum(Object.keys(issues)),
  count:count.positive()
}).strict()).max(Object.keys(issues).length);
const comparisons=z.array(z.object({
  kind:z.enum(Object.keys(sources)),
  status:z.enum(['MATCHED','EFTPOS_TOTAL_DIFFERS','NETLINK_SUBTOTAL_COMPARISON']),
  amountCents:cents,
  recordedAmountCents:cents
}).strict()).max(30);
export const dailyCashEvidenceSchema=z.object({
  complete:z.boolean(),
  unassigned:issueCounts,
  shifts:z.array(z.object({
    sessionId:z.string().min(1).max(200),
    unresolved:issueCounts,
    comparisons,
    omittedComparisons:count,
    netlink:z.object({completedCount:count,reviewCount:count,amountCents:cents.nullable()}).strict().nullable()
  }).strict()).min(1).max(200)
}).strict();

function addIssue(group,reason){
  const key=Object.hasOwn(issues,reason)?reason:'OTHER';
  group.set(key,(group.get(key)||0)+1);
}
const counts=group=>Object.keys(issues).filter(key=>group.has(key)).map(reason=>({reason,count:group.get(reason)}));

export function projectDailyCashEvidence(paper,netlink,sessionIds){
  const unassigned=new Map();
  const shifts=new Map(sessionIds.map(sessionId=>[sessionId,{
    sessionId,unresolved:new Map(),comparisons:[],omittedComparisons:0,netlink:netlink.get(sessionId)??null
  }]));
  for(const item of paper.items){
    const shift=shifts.get(item.sessionId);
    if(item.status==='UNRESOLVED')addIssue(shift?.unresolved??unassigned,item.reason);
    if(!shift||!Object.hasOwn(sources,item.kind)||!Number.isSafeInteger(item.amountCents))continue;
    const status=item.status==='MATCHED'&&['SHIFT_TOTAL','SHIFT_BOUNDARY'].includes(item.evidenceBasis)
      ?'MATCHED':item.reason;
    if(!['MATCHED','EFTPOS_TOTAL_DIFFERS','NETLINK_SUBTOTAL_COMPARISON'].includes(status))continue;
    const recordedAmountCents=status==='MATCHED'?item.amountCents:item.recordedAmountCents;
    if(!Number.isSafeInteger(recordedAmountCents))continue;
    if(shift.comparisons.length===30){shift.omittedComparisons++;continue;}
    shift.comparisons.push({kind:item.kind,status,amountCents:item.amountCents,recordedAmountCents});
  }
  return dailyCashEvidenceSchema.parse({complete:paper.coverage.complete,unassigned:counts(unassigned),
    shifts:[...shifts.values()].map(shift=>({...shift,unresolved:counts(shift.unresolved)}))});
}

const money=value=>new Intl.NumberFormat('el-GR',{style:'currency',currency:'EUR'}).format(value/100);
const issueText=group=>group.map(({reason,count})=>issues[reason]+' ('+count+')').join(', ');

export function dailyCashEvidenceText(evidence,report){
  const lines=['Διασταύρωση αποθηκευμένων χειρογράφων, POS, EFTPOS και Netlink',
    report.storeName+' · '+report.period.from+' — '+report.period.to];
  if(!evidence.complete)lines.push('Η διασταύρωση των συνημμένων παραμένει σε εκκρεμότητα.');
  if(evidence.unassigned.length)lines.push('Χωρίς ασφαλή αντιστοίχιση βάρδιας · '+issueText(evidence.unassigned));
  const rows=new Map(report.rows.map(row=>[row.sessionId,row]));
  for(const shift of evidence.shifts){
    const row=rows.get(shift.sessionId);
    lines.push(row.day+' · '+row.shiftLabel+' · '+row.terminalPos);
    if(shift.unresolved.length)lines.push('Εκκρεμεί: '+issueText(shift.unresolved));
    for(const item of shift.comparisons){
      const source=item.status==='NETLINK_SUBTOTAL_COMPARISON'?'Ονομαστική αξία Netlink':sources[item.kind];
      lines.push(source+' · συνημμένο '+money(item.amountCents)+' · καταγεγραμμένο '+money(item.recordedAmountCents)
        +(item.status==='MATCHED'?' · συμφωνεί':' · εκκρεμεί διασταύρωση'));
    }
    if(shift.omittedComparisons)lines.push('Πρόσθετες συγκρίσεις στο BackOffice: '+shift.omittedComparisons);
    if(shift.netlink?.completedCount&&shift.netlink.amountCents!==null){
      lines.push('Καταγεγραμμένο υποσύνολο Netlink · '+money(shift.netlink.amountCents)+' · '+shift.netlink.completedCount+' κινήσεις.');
    }
    if(shift.netlink?.reviewCount)lines.push('Κινήσεις Netlink προς διασταύρωση: '+shift.netlink.reviewCount);
    if(!shift.netlink)lines.push('Δεν τεκμηριώθηκε συσχετισμένο υποσύνολο Netlink για τη βάρδια.');
  }
  return lines;
}
