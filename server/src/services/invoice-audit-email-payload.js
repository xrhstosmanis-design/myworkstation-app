import {invoiceAuditEmailPeriod} from './invoice-audit-email-period.js';

const text=(value,max=160)=>typeof value==='string'?value.replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,max):'';
const labels={UNPOSTED_DOCUMENT:'Δεν έχει καταχωριστεί',UPLOADED_AWAITING_REVIEW:'Ανεβασμένο προς έλεγχο',POSSIBLE_DUPLICATE:'Πιθανό διπλό',IDENTITY_OR_LINK_REVIEW:'Χρειάζεται ταυτοποίηση',AWAITING_INVOICE:'Λείπει πρωτότυπο',REVIEW_REQUIRED:'Χρειάζεται έλεγχο'};
const count=value=>Number.isSafeInteger(value)&&value>=0?value:null;
const amount=value=>Number.isSafeInteger(value)?(value/100).toLocaleString('el-GR',{style:'currency',currency:'EUR'}):'Άγνωστο';
const date=value=>new Date(value).toLocaleString('el-GR',{timeZone:'Europe/Athens',hour12:false});
export const INVOICE_AUDIT_BACKOFFICE_URL='https://myworkstation-app.onrender.com/';

// Explicit metadata projection: no source/session fingerprints, raw OCR or originals.
export function buildInvoiceAuditEmailPayload(report){
 if(report?.readOnly!==true||!report?.store?.id||!Number.isFinite(Date.parse(report.asOf)))throw Object.assign(new Error('Μη έγκυρη πηγή προεπισκόπησης.'),{status:502});
 const period=invoiceAuditEmailPeriod(report.period?.month),known=report.coverage?.complete===true;
 const keys=['logicalRecords','unposted','uploadedAwaitingReview','possibleDuplicates','identityReview','credits','inactive'];
 const summary=known?Object.fromEntries(keys.map(k=>[k,count(report.summary?.[k])])):null;
 if(summary&&Object.values(summary).some(v=>v===null))throw Object.assign(new Error('Δεν επιβεβαιώθηκαν τα σύνολα της πηγής.'),{status:502});
 const items=known?(report.items||[]).slice(0,50).map(r=>({documentNumber:text(r.documentNumber),supplierName:text(r.supplierName),issueDay:text(r.issueDay,10),totalCents:Number.isSafeInteger(r.totalCents)?r.totalCents:null,categories:(r.categories||[]).filter(k=>Object.hasOwn(labels,k)),reasons:(r.reasons||[]).slice(0,10).map(r=>text(r))})):[];
 const p=report.pendingOriginals,pendingKnown=p?.available===true,pendingCounts=pendingKnown?Object.fromEntries(['total','missingOriginal','uploadedAwaitingReview','reviewRequired'].map(k=>[k,count(p.counts?.[k])])):null;
 if(pendingCounts&&Object.values(pendingCounts).some(v=>v===null))throw Object.assign(new Error('Δεν επιβεβαιώθηκαν οι εκκρεμότητες πρωτοτύπων.'),{status:502});
 const pendingItems=pendingKnown?(p.items||[]).slice(0,50).map(r=>({documentNumber:text(r.documentNumber),supplierName:text(r.supplierName),documentDate:text(r.documentDate,10),status:labels[r.status]?r.status:'REVIEW_REQUIRED'})):[];
 const coverage={complete:known,unavailable:(report.coverage?.unavailable||[]).map(k=>text(k,60)),limited:(report.coverage?.limited||[]).map(k=>text(k,60))};
 const detailsTruncated=known&&Boolean(report.nextPage),pendingTruncated=pendingKnown&&(p.truncated===true||pendingCounts.total>pendingItems.length);
 const subject=`Έλεγχος τιμολογίων ${period.month} - ${text(report.store.name||report.store.id,80)}`;
 const lines=[`Κατάστημα: ${text(report.store.name||report.store.id)}`,`Μήνας έκδοσης: ${period.month}`,`Παρατήρηση πηγών: ${date(report.asOf)} (ώρα Ελλάδας).`,`Προγραμματισμένη ώρα: ${period.nominalLocalTime} (ώρα Ελλάδας).`,'Προσωρινή εικόνα κατά την παρατήρηση. Δεν ανακατασκευάζει ιστορική κατάσταση και δεν αποτελεί οριστικό λογιστικό κλείσιμο.',''];
 if(!known)lines.push('Κάλυψη πηγών: ΑΓΝΩΣΤΗ / ΕΛΛΙΠΗΣ. Τα σύνολα είναι άγνωστα. Δεν επιτρέπεται συμπέρασμα ότι δεν υπάρχουν εκκρεμότητες.');
 else{
  lines.push(`Εγγραφές ελέγχου: ${summary.logicalRecords}`,`Δεν έχουν καταχωριστεί: ${summary.unposted}`,`Ανεβασμένα προς έλεγχο: ${summary.uploadedAwaitingReview}`,`Εγγραφές με ένδειξη πιθανού διπλού: ${summary.possibleDuplicates}`,`Ταυτοποίηση / συνδέσεις: ${summary.identityReview}`,`Πιστωτικά: ${summary.credits}`,'«Δεν έχει καταχωριστεί» δεν σημαίνει «δεν έχει πληρωθεί».',`Λεπτομέρειες πρώτης σελίδας: ${items.length}, έως 50.${detailsTruncated?' Υπάρχουν επιπλέον εγγραφές· τα σύνολα καλύπτουν όλη την ελεγμένη πηγή.':''}`);
  for(const r of items)lines.push(`${r.documentNumber||'Χωρίς αριθμό'} | ${r.supplierName||'Προμηθευτής προς έλεγχο'} | ${r.issueDay||'Άγνωστη ημερομηνία'} | ${amount(r.totalCents)}`,r.categories.map(k=>labels[k]).join(' · '),...r.reasons);
 }
 lines.push('','Εκκρεμότητες πρωτοτύπων — Όλοι οι μήνες (χωριστό σύνολο, εκτός του επιλεγμένου μήνα έκδοσης).');
 if(!pendingKnown)lines.push('Η πηγή εκκρεμοτήτων δεν είναι διαθέσιμη. Το πλήθος είναι άγνωστο, όχι μηδενικό.');
 else{lines.push(`Σύνολο: ${pendingCounts.total} · Λείπει πρωτότυπο: ${pendingCounts.missingOriginal} · Ανεβασμένο προς έλεγχο: ${pendingCounts.uploadedAwaitingReview} · Χρειάζεται έλεγχο: ${pendingCounts.reviewRequired}`,`Λεπτομέρειες: ${pendingItems.length}, έως 50.${pendingTruncated?' Η λίστα είναι περιορισμένη· υπάρχουν επιπλέον εκκρεμότητες.':''}`);for(const r of pendingItems)lines.push(`${r.documentNumber||'Χωρίς αριθμό'} | ${r.supplierName||'Προμηθευτής προς έλεγχο'} | ${r.documentDate||'Άγνωστη ημερομηνία'} | ${labels[r.status]}`)}
 lines.push('','Τα πιθανά διπλά απαιτούν ανθρώπινη σύγκριση πρωτοτύπων. Καμία αυτόματη ενοποίηση, καταχώριση ή πληρωμή.','Προεπισκόπηση μόνο — η αποστολή είναι απενεργοποιημένη.',`BackOffice (απαιτείται προσωπική σύνδεση και τρέχον δικαίωμα): ${INVOICE_AUDIT_BACKOFFICE_URL}`);
 return {subject,body:lines.join('\n'),period,reportObservedAt:report.asOf,coverage,summary,details:{items,limit:50,truncated:detailsTruncated},pendingOriginals:{period:'ALL_MONTHS',available:pendingKnown,counts:pendingCounts,items:pendingItems,limit:50,truncated:pendingTruncated},backofficeUrl:INVOICE_AUDIT_BACKOFFICE_URL};
}
