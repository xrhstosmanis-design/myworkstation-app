import {greeceDateTimeInput} from './greece-time.mjs';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=value=>value==null?'—':Number(value).toLocaleString('el-GR',{maximumFractionDigits:3});
export function posProposalRows(report,search=''){
 const q=String(search).trim().toLocaleLowerCase('el-GR');
 return (report.rows||[]).filter(r=>(r.suggestedQuantity>0||r.suggestedQuantity==null)&&`${r.name} ${r.sku||''}`.toLocaleLowerCase('el-GR').includes(q));
}
export function renderPosOrderProposal(report,search=''){
 const rows=posProposalRows(report,search),supplier=report.supplier?.name||'Όλοι οι προμηθευτές',period=report.period||{};
 const title='Πρόταση παραγγελίας';
 const details=[`Κατάστημα: ${report.storeName||report.storeId}`,`Προμηθευτής: ${supplier}`,`Πωλήσεις: ${period.fromDate||report.from} έως ${period.toDate||report.to} · ${report.options.historyDays} ημέρες`,
  `Κάλυψη: ${report.options.coverageDays} ημέρες · μέχρι παράδοση: ${report.options.leadDays} ημέρες`,
  `Υπολογισμός: ${greeceDateTimeInput(report.generatedAt,true).replace('T',' ')} (ώρα Ελλάδας)`,
  ...(search.trim()?[`Αναζήτηση: ${search.trim()}`]:[]),report.automaticAlarm?'Χρησιμοποιείται το τρέχον αποθηκευμένο alarm. Η εβδομαδιαία αυτόματη αναπροσαρμογή είναι ενεργοποιημένη.':'Χρησιμοποιείται το τρέχον αποθηκευμένο alarm. Η εβδομαδιαία αυτόματη αναπροσαρμογή δεν είναι ενεργή.',
  ...(report.expectedReceipts?.available===false?['Οι αναμενόμενες παραλαβές δεν είναι διαθέσιμες στον υπολογισμό. Έλεγξέ τες πριν παραγγείλεις.']:[]),
  'Πρόταση για έλεγχο. Η αποστολή ή η εκτύπωση δεν καταχωρίζει παραγγελία.'];
 const review=r=>[r.reason,...(r.warnings||[]),...(r.expectedReceiptReviewReasons||[]),...(r.confirmedPendingStockQuantity>0?[`Επιβεβαιωμένο αναμενόμενο υπόλοιπο: ${fmt(r.confirmedPendingStockQuantity)} ${r.unitLabel}`]:[]),...(r.pendingPurchaseReview||[]).map(x=>`${x.status==='NEW'?'Πρόχειρες αγορές':'Προς τιμολόγηση'}: ${x.orderCount} · ${x.recordedStockQuantity==null?'μετατροπή προς έλεγχο':fmt(x.recordedStockQuantity)+' '+r.unitLabel}`)].filter(Boolean);
 const cells=r=>[`${r.name} · ${r.sku||''}`,`${fmt(r.netQuantity)} (πωλήσεις ${fmt(r.soldQuantity)}, επιστροφές ${fmt(r.returnedQuantity)})`,fmt(r.currentStock),fmt(r.minStock),`${fmt(r.suggestedQuantity)} ${r.unitLabel}`,review(r).join(' · ')];
 const text=[title,...details,'',...rows.map(r=>cells(r).join(' | ')),...(!rows.length?['Δεν υπάρχουν προτάσεις με αυτά τα κριτήρια.']:[])].join('\n');
 const html=`<!doctype html><html lang="el"><head><meta charset="utf-8"><title>${title}</title><style>@page{size:A4 landscape;margin:12mm}body{font:12px Arial,sans-serif;color:#14352d}h1{font-size:21px}p{margin:5px 0}table{border-collapse:collapse;width:100%;margin-top:16px}th,td{text-align:left;vertical-align:top;padding:7px;border:1px solid #ccd8d3}thead{display:table-header-group}tr{break-inside:avoid}th{background:#e8f2ec}td:last-child{max-width:320px;overflow-wrap:anywhere}small{display:block}.brand{font-weight:bold}</style></head><body><div class="brand">MyWorkStation</div><h1>${title}</h1>${details.map(x=>`<p>${esc(x)}</p>`).join('')}<table><thead><tr>${['Είδος / κωδικός','Καθαρές πωλήσεις περιόδου','Απόθεμα','Alarm','Πρόταση','Έλεγχος'].map(x=>`<th>${x}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${cells(r).map(x=>`<td>${esc(x)}</td>`).join('')}</tr>`).join('')}</tbody></table>${!rows.length?'<p>Δεν υπάρχουν προτάσεις με αυτά τα κριτήρια.</p>':''}</body></html>`;
 const subject=`${title} · ${report.storeName||report.storeId} · ${supplier}`.replace(/[\r\n\u0000-\u001f\u007f]/g,' ').slice(0,250);
 return {subject,text,html,rowCount:rows.length};
}
