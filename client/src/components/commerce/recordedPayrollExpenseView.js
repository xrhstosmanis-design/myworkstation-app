import {greeceDateTimeToIso,greeceExportValue} from '../../../../shared/greece-time.mjs';

const snapshots=new WeakSet(),PAGE_SIZE=100;
const reasons=new Set(['NO_WORKFORCE_LINK','MULTIPLE_WORKFORCE_LINKS','LINK_SCOPE_MISMATCH','LINK_NOT_APPROVED','NON_POSITIVE_PAYROLL_AMOUNT','LINK_AMOUNT_MISMATCH','LINK_METHOD_MISMATCH','EMPLOYEE_SCOPE_MISMATCH']);
const limitations=['RECORDED_LEDGER_NOT_SETTLEMENT_PROOF','LINKED_PAYROLL_ONLY','STANDALONE_WORKFORCE_PAYMENTS_EXCLUDED','ACCRUAL_EXCLUDED','UNLINKED_EXPENSES_MAY_INCLUDE_PAYROLL','NOT_SERIALIZABLE_AUTHORIZATION_REVOCATION'];
const fail=()=>{throw new Error('Δεν επιβεβαιώθηκε η ακεραιότητα της αναφοράς. Δεν επιτρέπεται εξαγωγή.');};
const check=value=>{if(!value)fail();};
const text=value=>typeof value==='string'&&value.trim()===value&&value.length>0&&value.length<=180&&!/[\u0000-\u001f\u007f]/.test(value);
const integer=value=>Number.isSafeInteger(value)&&!Object.is(value,-0);
const iso=value=>typeof value==='string'&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString()===value;
const keys=(value,expected)=>{check(value&&typeof value==='object'&&!Array.isArray(value));check(Object.keys(value).sort().join('|')===expected.split(' ').sort().join('|'));};
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
export function escapeRecordedPayrollExpenseHtml(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
export function validateRecordedPayrollExpensePeriod(applied,{now=new Date()}={}){
  check(applied&&text(applied.storeId)&&applied.timeZone==='Europe/Athens');
  const {from,to,storeId}=applied;
  check(typeof from==='string'&&typeof to==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(from)&&/^\d{4}-\d{2}-\d{2}$/.test(to));
  const start=Date.parse(`${from}T00:00:00Z`),end=Date.parse(`${to}T00:00:00Z`);
  check(Number.isFinite(start)&&Number.isFinite(end)&&new Date(start).toISOString().slice(0,10)===from&&new Date(end).toISOString().slice(0,10)===to&&end>=start&&(end-start)/86400000<366);
  const next=new Date(end+86400000).toISOString().slice(0,10),fromIso=greeceDateTimeToIso(`${from}T00:00:00`),toExclusive=greeceDateTimeToIso(`${next}T00:00:00`);
  check(now instanceof Date&&Number.isFinite(now.getTime())&&Date.parse(toExclusive)<=now.getTime());
  return Object.freeze({storeId,from,to,timeZone:'Europe/Athens',fromIso,toExclusive});
}
export function validateRecordedPayrollExpenseReport(data,applied,options={}){
  const range=validateRecordedPayrollExpensePeriod(applied,options);
  keys(data,'companyId storeId asOf period basis settlementVerified accrualIncluded standaloneWorkforcePaymentsIncluded sourceCoverage items totals limitations');
  check(text(data.companyId)&&data.storeId===range.storeId&&iso(data.asOf)&&Date.parse(data.asOf)>=Date.parse(range.toExclusive)&&Date.parse(data.asOf)<=(options.now??new Date()).getTime()+60000);
  keys(data.period,'calendarFrom calendarTo timeZone from toExclusive');
  check(data.period.calendarFrom===range.from&&data.period.calendarTo===range.to&&data.period.timeZone===range.timeZone&&data.period.from===range.fromIso&&data.period.toExclusive===range.toExclusive);
  check(data.basis==='NONREVERSED_RECORDED_OTHER_EXPENSE_LEDGER'&&data.settlementVerified===false&&data.accrualIncluded===false&&data.standaloneWorkforcePaymentsIncluded===false);
  check(Array.isArray(data.limitations)&&data.limitations.length===limitations.length&&limitations.every((value,index)=>data.limitations[index]===value));
  const coverage=data.sourceCoverage;
  keys(coverage,'complete totalRowCount returnedRowCount limit totalsScope payrollAttribution');
  check(typeof coverage.complete==='boolean'&&integer(coverage.totalRowCount)&&coverage.totalRowCount>=0&&coverage.limit===10000&&coverage.returnedRowCount===Math.min(coverage.totalRowCount,10000)&&coverage.complete===(coverage.totalRowCount===coverage.returnedRowCount)&&coverage.totalsScope===(coverage.complete?'COMPLETE_LEDGER':'RETURNED_ROWS')&&coverage.payrollAttribution==='LINKED_ONLY');
  check(Array.isArray(data.items)&&data.items.length===coverage.returnedRowCount);
  const seen=new Set(),employees=new Map();let previous=-Infinity,total=0n,payroll=0n,unattributed=0n,attributedCount=0,unattributedCount=0;
  for(const item of data.items){
    keys(item,'transactionId occurredAt paymentMethod amountCents payrollAttribution');
    check(text(item.transactionId)&&!seen.has(item.transactionId));seen.add(item.transactionId);
    check(iso(item.occurredAt));const at=Date.parse(item.occurredAt);
    check(at>=Date.parse(range.fromIso)&&at<Date.parse(range.toExclusive)&&at>=previous);previous=at;
    check(integer(item.amountCents)&&(item.paymentMethod===null||typeof item.paymentMethod==='string'&&item.paymentMethod.length<=128&&!/[\u0000-\u001f\u007f]/.test(item.paymentMethod)));
    const a=item.payrollAttribution;keys(a,'status reason employeeId employeeName paymentId');
    total+=BigInt(item.amountCents);
    if(a.status==='ATTRIBUTED'){
      check(a.reason===null&&item.amountCents>0&&item.paymentMethod!==null&&text(a.employeeId)&&text(a.paymentId)&&typeof a.employeeName==='string'&&a.employeeName.length<=1000&&a.employeeName.trim().length>0);
      const entry=employees.get(a.employeeId)||{employeeId:a.employeeId,employeeName:a.employeeName,amount:0n,transactionCount:0};
      check(entry.employeeName===a.employeeName);entry.amount+=BigInt(item.amountCents);entry.transactionCount++;employees.set(a.employeeId,entry);payroll+=BigInt(item.amountCents);attributedCount++;
    }else{
      check(a.status==='UNATTRIBUTED'&&reasons.has(a.reason)&&a.employeeId===null&&a.employeeName===null&&a.paymentId===null);unattributed+=BigInt(item.amountCents);unattributedCount++;
    }
  }
  if(coverage.complete){
    const t=data.totals;keys(t,'recordedExpenseCents linkedPayrollCents unattributedExpenseCents attributedTransactionCount unattributedTransactionCount byEmployee');
    for(const [key,value] of [['recordedExpenseCents',total],['linkedPayrollCents',payroll],['unattributedExpenseCents',unattributed]])check(integer(t[key])&&BigInt(t[key])===value);
    check(t.attributedTransactionCount===attributedCount&&t.unattributedTransactionCount===unattributedCount&&Array.isArray(t.byEmployee)&&t.byEmployee.length===employees.size);
    const employeeIds=new Set();for(const entry of t.byEmployee){keys(entry,'employeeId employeeName amountCents transactionCount');const expected=employees.get(entry.employeeId);check(expected&&!employeeIds.has(entry.employeeId)&&entry.employeeName===expected.employeeName&&integer(entry.amountCents)&&BigInt(entry.amountCents)===expected.amount&&entry.transactionCount===expected.transactionCount);employeeIds.add(entry.employeeId);}
  }else check(data.totals===null);
  const snapshot=freeze(JSON.parse(JSON.stringify(data)));snapshots.add(snapshot);return snapshot;
}
function validated(snapshot){check(snapshots.has(snapshot));return snapshot;}
function decimal(cents){check(integer(cents));const n=BigInt(cents),absolute=n<0n?-n:n;return `${n<0n?'-':''}${absolute/100n}.${String(absolute%100n).padStart(2,'0')}`;}
export function formatRecordedPayrollExpenseCents(cents){return `${decimal(cents)} €`;}
// Quote every field and neutralize spreadsheet formulas, including leading whitespace/control characters.
const numeric=cents=>({numeric:decimal(cents)});
const csvCell=value=>{const trusted=value&&typeof value==='object'&&typeof value.numeric==='string';let valueText=trusted?value.numeric:String(value??'');if(!trusted&&/^[\s\u0000-\u001f]*[=+\-@]/.test(valueText))valueText="'"+valueText;return '"'+valueText.replace(/"/g,'""')+'"';};
export function buildRecordedPayrollExpenseCsv(snapshot){
  const s=validated(snapshot),rows=[['PROVISIONAL — καταγεγραμμένα έξοδα / συνδεδεμένες πληρωμές'],['companyId',s.companyId],['storeId',s.storeId],['calendarFrom',s.period.calendarFrom],['calendarTo',s.period.calendarTo],['timeZone',s.period.timeZone],['from',s.period.from],['toExclusive',s.period.toExclusive],['asOf',s.asOf],['basis',s.basis],['settlementVerified','false'],['payrollAttribution','LINKED_ONLY'],['complete',String(s.sourceCoverage.complete)],['totalRowCount',s.sourceCoverage.totalRowCount],['returnedRowCount',s.sourceCoverage.returnedRowCount],['limit',s.sourceCoverage.limit],['totalsScope',s.sourceCoverage.totalsScope],...s.limitations.map(v=>['limitation',v]),['Σημείωση','Αρνητικά ποσά διατηρούνται. Μη αποδιδόμενα έξοδα μπορεί να περιλαμβάνουν μισθοδοσία. Δεν αποτελεί απόδειξη εξόφλησης.'],['transactionId','occurredAtUTC','occurredAt Europe/Athens','paymentMethod','amountEUR','status','reason','employeeId','employeeName','paymentId']];
  for(const item of s.items){const a=item.payrollAttribution;rows.push([item.transactionId,item.occurredAt,greeceExportValue(item.occurredAt),item.paymentMethod,numeric(item.amountCents),a.status,a.reason,a.employeeId,a.employeeName,a.paymentId]);}
  if(s.totals){rows.push(['totals','recordedExpenseEUR','linkedPayrollEUR','unattributedExpenseEUR'],['COMPLETE_LEDGER',numeric(s.totals.recordedExpenseCents),numeric(s.totals.linkedPayrollCents),numeric(s.totals.unattributedExpenseCents)],['employeeId','employeeName','amountEUR','transactionCount']);for(const e of s.totals.byEmployee)rows.push([e.employeeId,e.employeeName,numeric(e.amountCents),e.transactionCount]);}
  return '\uFEFF'+rows.map(row=>row.map(csvCell).join(';')).join('\r\n')+'\r\n';
}
export function renderRecordedPayrollExpensePage(snapshot,page=0){
  const s=validated(snapshot);check(Number.isInteger(page)&&page>=0);const pages=Math.max(1,Math.ceil(s.items.length/PAGE_SIZE));check(page<pages);const h=escapeRecordedPayrollExpenseHtml;
  const rows=s.items.slice(page*PAGE_SIZE,(page+1)*PAGE_SIZE).map(item=>{const a=item.payrollAttribution;return `<tr><td>${h(item.transactionId)}</td><td>${h(greeceExportValue(item.occurredAt))}</td><td>${h(item.paymentMethod??'—')}</td><td>${h(formatRecordedPayrollExpenseCents(item.amountCents))}</td><td>${h(a.status)}</td><td>${h(a.employeeName??'Μη αποδιδόμενο')} ${h(a.reason??'')}</td></tr>`;}).join('');
  const employeeSummary=s.totals?`<h4>Συνδεδεμένες πληρωμές ανά εργαζόμενο</h4><p>Σελίδα εργαζομένων ${page+1} / ${pages} · σύνολο εργαζομένων ${s.totals.byEmployee.length} · 100 ανά σελίδα · ίδια πλοήγηση</p><table><thead><tr><th>Εργαζόμενος</th><th>Ποσό</th><th>Κινήσεις</th></tr></thead><tbody>${s.totals.byEmployee.slice(page*PAGE_SIZE,(page+1)*PAGE_SIZE).map(e=>`<tr><td>${h(e.employeeName)} (${h(e.employeeId)})</td><td>${h(formatRecordedPayrollExpenseCents(e.amountCents))}</td><td>${e.transactionCount}</td></tr>`).join('')||'<tr><td colspan="3">Δεν υπάρχουν συνδεδεμένες πληρωμές σε αυτή τη σελίδα.</td></tr>'}</tbody></table>`:'';
  return `<p>PROVISIONAL · Εταιρεία: ${h(s.companyId)} · Κατάστημα: ${h(s.storeId)} · ${h(s.period.calendarFrom)} — ${h(s.period.calendarTo)} · Europe/Athens · ${h(s.asOf)}</p><p>settlementVerified: false · LINKED_ONLY. Δεν αποτελεί απόδειξη εξόφλησης. Δεν περιλαμβάνει αυτοτελείς πληρωμές προσωπικού ή δεδουλευμένα. Μη αποδιδόμενα έξοδα μπορεί να περιλαμβάνουν μισθοδοσία. Αρνητικά ποσά διατηρούνται.</p><p>${s.sourceCoverage.complete?'Πλήρης κάλυψη':'ΕΛΛΙΠΗΣ ΚΑΛΥΨΗ — χωρίς συνολικά ποσά'}: ${s.sourceCoverage.returnedRowCount} / ${s.sourceCoverage.totalRowCount} · όριο 10000 · ${h(s.sourceCoverage.totalsScope)}</p>${s.totals?`<p>Καταγεγραμμένα έξοδα: ${h(formatRecordedPayrollExpenseCents(s.totals.recordedExpenseCents))} · Συνδεδεμένη μισθοδοσία: ${h(formatRecordedPayrollExpenseCents(s.totals.linkedPayrollCents))} · Μη αποδιδόμενα: ${h(formatRecordedPayrollExpenseCents(s.totals.unattributedExpenseCents))}</p>`:''}${employeeSummary}<table><thead><tr><th>Κίνηση</th><th>Ώρα Ελλάδας</th><th>Τρόπος</th><th>Ποσό</th><th>Απόδοση</th><th>Εργαζόμενος / αιτία</th></tr></thead><tbody>${rows||'<tr><td colspan="6">Δεν βρέθηκαν καταγεγραμμένα έξοδα.</td></tr>'}</tbody></table><p>Σελίδα ${page+1} / ${pages} · 100 γραμμές ανά σελίδα</p><button type="button" data-rpe-page="${page-1}" ${page===0?'disabled':''}>Προηγούμενη</button><button type="button" data-rpe-page="${page+1}" ${page+1===pages?'disabled':''}>Επόμενη</button>`;
}
