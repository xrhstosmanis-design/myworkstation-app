import XLSX from 'xlsx';
import PDFDocument from 'pdfkit';
import {fileURLToPath} from 'node:url';
const number = x => x === null || x === undefined ? 'Άγνωστο' : String(x);
const timestamp = x => x && Number.isFinite(new Date(x).getTime()) ? new Intl.DateTimeFormat('el-GR',{timeZone:'Europe/Athens',dateStyle:'short',timeStyle:'medium',hourCycle:'h23'}).format(new Date(x)) : 'Άγνωστο';
const safeCell = x => {if(typeof x==='string'&&x.length>32767)throw Object.assign(new Error('Κείμενο πηγής υπερβαίνει το όριο κελιού Excel. Δεν εκδόθηκε αποκομμένο αρχείο.'),{status:413});return typeof x === 'string' && /^[=+\-@\t\r]/.test(x) ? `'${x}` : x;};
// Prisma raw numeric columns may be Decimal objects, which SheetJS otherwise
// silently drops. Keep missing values empty, but export actual quantities as numbers.
const quantityCell = x => x === null || x === undefined || x === '' ? null : Number.isFinite(Number(x)) ? Number(x) : null;
export function inventoryReconciliationWorkbook(report) {
  const wb = XLSX.utils.book_new();
  const append = (name,rows) => XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(rows.map(row=>row.map(safeCell))),name);
  append('Αναφορά',[
    ['Έλεγχος απογραφής','ΠΡΟΣ ΕΛΕΓΧΟ'],['Κατάστημα',report.current.storeName || report.current.storeId],
    ['Προηγούμενη απογραφή',report.previous.name,report.previous.id],['Νεότερη απογραφή',report.current.name,report.current.id],
    ['Πληρότητα',report.explanation],['Αποτίμηση',report.costMethod],['Ώρες','Europe/Athens'],
    ['Ελλείμματα τεμάχια',report.summary.shortageQuantity],['Πλεονάσματα τεμάχια',report.summary.surplusQuantity],
    ['Καθαρή διαφορά τεμάχια',report.summary.netQuantity],['Αξία ελλειμμάτων',report.summary.shortageValue],
    ['Αξία πλεονασμάτων',report.summary.surplusValue],['Καθαρή αξία',report.summary.netValue],
    ['Χωρίς υπολογισμό',report.summary.uncomputedItems],['Χωρίς κόστος',report.summary.missingCostItems],
    ['Έναρξη προηγούμενης',timestamp(report.previous.startedAt)],['Οριστικοποίηση προηγούμενης',timestamp(report.previous.finalizedAt)],['Έναρξη νέας',timestamp(report.current.startedAt)],['Οριστικοποίηση νέας',timestamp(report.current.finalizedAt)],['Χειριστής νέας',report.current.createdByUserId],['Οριστικοποίηση από',report.current.finalizedByUserId],['Πεδίο αποθήκης',report.stockScope?.explanation]
  ]);
  if(report.groups)append('Τελικό αποτέλεσμα',[['Κύριος κωδικός','SKU','Περιγραφή','Κωδικοί ομάδας','Αρχική διαφορά','Επιβεβαιωμένη διόρθωση','Τελική διαφορά','Κόστος μονάδας','Αρχική αξία','Αξία διόρθωσης','Τελική αξία','Ευρήματα'],
    ...report.groups.map(x=>[x.canonicalProductId,x.sku,x.name,x.productIds.join(', '),x.initialDifference,x.correctionQuantity,x.finalDifference,x.unitCost,x.initialValue,x.correctionValue,x.finalValue,x.findings.join(', ')])]);
  append('Είδη',[['Ταυτότητα','SKU','Περιγραφή','Από καταμέτρηση','Έως καταμέτρηση','Προηγούμενη ποσότητα','Εισαγωγές','Εξαγωγές','Διορθώσεις συστήματος','Αναμενόμενο φυσικό','Καταμέτρηση','Αρχική φυσική διαφορά ανά κωδικό','Κόστος','Αρχική αξία','Ευρήματα','Λογιστικό αναμενόμενο','Λογιστική διαφορά'],
    ...report.rows.map(x=>[x.productId,x.sku,x.name,timestamp(x.from),timestamp(x.to),x.previousCountedQuantity,x.incoming,x.outgoing,x.systemAdjustments,x.expectedQuantity,x.countedQuantity,x.difference,x.unitCost,x.differenceValue,x.findings.join(', '),x.recordedExpectedQuantity,x.recordedDifference])]);
  append('Κινήσεις',[['Προϊόν','ID κίνησης','Τύπος','Κατάταξη','Ποσότητα','Φυσικό πριν','Φυσικό μετά','Ώρα καταχώρησης','Ημερομηνία παραστατικού','Καταχώρηση παραστατικού','Πραγματική ώρα κίνησης','Χειριστής','Παραστατικό','Σύνδεση','Υπολογίστηκε','Ευρήματα','Χρόνος συναλλαγής','Λογιστικό πριν','Λογιστικό μετά','Βάση ποσότητας'],
    ...report.rows.flatMap(x=>x.movements.map(m=>[x.productId,m.id,m.movementType,m.classification,m.quantity,m.balanceBefore,m.balanceAfter,timestamp(m.postedAt),timestamp(m.documentDate),timestamp(m.documentRecordedAt),timestamp(m.physicalAt),m.actorName||m.actorId,m.documentNumber,m.sourceId,m.included,m.findings.join(', '),timestamp(m.transactionOccurredAt),m.recordedBalanceBefore,m.recordedBalanceAfter,m.quantityBasis]))]);
  append('Καταμετρήσεις',[['Προϊόν','ID συμβάντος','Απογραφή','Τύπος','Πριν','Καταμέτρηση','Θεωρητικό','Χειριστής','Πηγή','Ώρα'],
    ...report.rows.flatMap(x=>x.countHistory.map(e=>[x.productId,e.id,e.stocktakeId,e.eventType,quantityCell(e.previousQuantity),quantityCell(e.countedQuantity),quantityCell(e.expectedQuantity),e.actorName,e.source,timestamp(e.createdAt)]))]);
  if(report.review?.available)append('Ιστορικό ελέγχου',[['Ταυτότητα','Ώρα','Ελεγκτής','Ενέργεια','Προϊόντα ή αναφορά','Ποσότητα διόρθωσης','Αιτιολογία','Τεκμηρίωση','Ενεργή'],
    ...report.review.history.map(r=>[r.id,timestamp(r.createdAt),r.actorName,r.action.kind,r.action.productIds?.join(', ')||r.action.productId||r.action.actionId,r.action.quantity??null,r.action.reason,r.action.evidence,r.active])]);
  if(report.sourceEvidence){
    const e=report.sourceEvidence,links=[];
    append('Πληρότητα πηγών',[['Πηγή','Διαθέσιμη'],...Object.entries(e.coverage),['Συναλλαγές που ελέγχθηκαν',e.checkedCounts.transactions],['Παραστατικά',e.checkedCounts.invoices],['Γραμμές παραστατικών',e.checkedCounts.invoiceLines],['Συμβάντα',e.checkedCounts.systemEvents],['Όρια',e.explanation]]);
    append('Συναλλαγές',[['Συναλλαγή','Προϊόν','Γραμμή','Πηγή','Κατάσταση','Χρόνος συναλλαγής','Καταχώρηση','Μεταβολή stock','Ποσότητα γραμμής','Τιμή','Έκπτωση','Αξία','Αρχική συναλλαγή','Τεκμήριο','Ευρήματα'],
      ...e.transactions.flatMap(x=>x.lines.map(l=>[x.id,x.productId,l.id,x.source,x.status,timestamp(x.occurredAt),timestamp(x.recordedAt),x.quantity,l.quantity,l.unitPrice,l.discount,l.lineTotal,x.originalSaleId,x.disposition,x.findings.join(', ')]))]);
    append('Παραστατικά',[['Ταυτότητα','Αριθμός','Τύπος','Κατάσταση','Πηγή','Προμηθευτής','Ημερομηνία παραστατικού','Καταχώρηση','Τελευταία αλλαγή','Κοινό παραστατικό','Ευρήματα'],
      ...e.invoices.map(x=>[x.id,x.documentNumber,x.documentType,x.status,x.sourceType,x.supplierName||x.supplierId,timestamp(x.issueDate),timestamp(x.recordedAt),timestamp(x.lastChangedAt),x.canonicalDocumentId,x.findings.join(', ')] )]);
    append('Γραμμές παραστατικών',[['Παραστατικό','Γραμμή','Προϊόν','Ποσότητα','Μονάδα','Ανά συσκευασία','Βασική ποσότητα','Κόστος','Καθαρή αξία','Ευρήματα'],...e.invoices.flatMap(x=>x.lines.map(l=>[x.id,l.id,l.productId,l.quantity,l.unit,l.unitsPerPackage,l.baseQuantity,l.unitCost,l.netAmount,l.findings.join(', ')]))]);
    append('Συμβάντα πηγών',[['Ταυτότητα','Πηγή','Ενέργεια','Ώρα','Χειριστής','Αιτιολογία','Συναλλαγή','Σχετική συναλλαγή','Επίδραση stock','Παλιά τιμή','Νέα τιμή','Ποσότητα','Έκπτωση','Παλιός κωδικός','Νέος κωδικός','Παλιό barcode','Νέο barcode'],...e.systemEvents.map(x=>[x.id,x.origin,x.eventType,timestamp(x.recordedAt),x.actorName,x.reason,x.saleId,x.relatedSaleId,x.stockImpact,x.changes.oldPrice,x.changes.newPrice,x.changes.quantity,x.changes.discount,x.changes.oldCode,x.changes.newCode,x.changes.oldBarcode,x.changes.newBarcode])]);
    for(const x of e.transactions){for(const id of x.postingIds)links.push(['TRANSACTION',x.id,x.productId,'STOCK_MOVEMENT',id]);for(const id of x.auditIds)links.push(['TRANSACTION',x.id,x.productId,'AUDIT',id]);}
    for(const x of e.invoices){for(const id of x.postingIds)links.push(['INVOICE',x.id,null,'POSTING_RECEIPT',id]);for(const id of x.movementIds)links.push(['INVOICE',x.id,null,'STOCK_MOVEMENT',id]);for(const id of x.matchingDocumentIds||[])links.push(['INVOICE',x.id,null,'POSSIBLE_DUPLICATE',id]);}
    for(const x of e.systemEvents){for(const id of x.productIds)links.push(['EVENT',x.id,id,'PRODUCT',id]);for(const id of x.movementIds)links.push(['EVENT',x.id,null,'STOCK_MOVEMENT',id]);}
    append('Συνδέσεις πηγών',[['Πηγή','Ταυτότητα','Προϊόν','Είδος σύνδεσης','Συνδεδεμένη ταυτότητα'],...links]);
  }
  return XLSX.write(wb,{bookType:'xlsx',type:'buffer'});
}
export async function inventoryReconciliationPdf(report) {
  if (report.rows.length > 2000 || report.summary.movementCount > 10000 || report.sourceEvidence&&Object.values(report.sourceEvidence.checkedCounts).reduce((s,x)=>s+x,0)>10000) throw Object.assign(new Error('Η αναφορά υπερβαίνει το όριο PDF. Χρησιμοποίησε Excel για το πλήρες αποτέλεσμα.'),{status:413});
  const doc = new PDFDocument({size:'A4',margin:35,info:{Title:'Έλεγχος απογραφής'}}), chunks=[];
  const completed = new Promise((resolve,reject)=>{doc.on('data',x=>chunks.push(x));doc.on('end',()=>resolve(Buffer.concat(chunks)));doc.on('error',reject);});
  doc.font(fileURLToPath(new URL('../../assets/fonts/DejaVuSans.ttf',import.meta.url)));
  doc.fontSize(15).text('Έλεγχος απογραφής — ΠΡΟΣ ΕΛΕΓΧΟ');
  doc.fontSize(9).text(`Κατάστημα: ${report.current.storeName || report.current.storeId}`)
    .text(`Από: ${report.previous.name} (${report.previous.id})`).text(`Έως: ${report.current.name} (${report.current.id})`)
    .text(`Περίοδος: ${timestamp(report.previous.startedAt)} → ${timestamp(report.current.finalizedAt)} · νέα έναρξη ${timestamp(report.current.startedAt)}`)
    .text(`Χειριστής ${report.current.createdByUserId||'Άγνωστος'} · οριστικοποίηση ${report.current.finalizedByUserId||'Άγνωστος'}`)
    .moveDown().text(report.explanation).text(report.costMethod).text('Όλες οι ώρες: Europe/Athens').moveDown()
    .text(`Ελλείμματα: ${number(report.summary.shortageQuantity)} τμχ · ${number(report.summary.shortageValue)} €`)
    .text(`Πλεονάσματα: ${number(report.summary.surplusQuantity)} τμχ · ${number(report.summary.surplusValue)} €`)
    .text(`Καθαρή διαφορά: ${number(report.summary.netQuantity)} τμχ · ${number(report.summary.netValue)} €`)
    .text(`Χωρίς υπολογισμό: ${report.summary.uncomputedItems} · Χωρίς κόστος: ${report.summary.missingCostItems}`);
  if(report.groups){
    doc.moveDown().fontSize(11).text('Τελικό αποτέλεσμα ανά επιβεβαιωμένη ομάδα');
    for(const group of report.groups)doc.fontSize(8).moveDown().text(`${group.sku || group.id} · ${group.name} · κωδικοί ${group.productIds.join(', ')}`)
      .text(`Αρχική διαφορά ${number(group.initialDifference)} + διόρθωση ${number(group.correctionQuantity)} = τελική διαφορά ${number(group.finalDifference)} · τελική αξία ${number(group.finalValue)} €`);
    doc.moveDown().fontSize(10).text('Αρχικές καταμετρήσεις και κινήσεις ανά κωδικό');
  }
  for (const row of report.rows) {
    doc.moveDown().fontSize(10).text(`${row.sku || row.productId} · ${row.name}`);
    doc.fontSize(8).text(`${timestamp(row.from)} → ${timestamp(row.to)}`)
      .text(`Φυσικό: προηγούμενο ${number(row.previousCountedQuantity)} + εισαγωγές ${row.incoming} − εξαγωγές ${row.outgoing} = ${number(row.expectedQuantity)}`)
      .text(`Χωριστές διορθώσεις συστήματος ${number(row.systemAdjustments)} · λογιστικό υπόλοιπο ${number(row.recordedExpectedQuantity)} · λογιστική διαφορά ${number(row.recordedDifference)}`)
      .text(`Αρχική καταμέτρηση ${number(row.countedQuantity)} · αρχική διαφορά ${number(row.difference)} · κόστος ${number(row.unitCost)} · αρχική αξία ${number(row.differenceValue)}`)
      .text(`Ευρήματα: ${row.findings.join(', ') || 'Απαιτείται έλεγχος πληρότητας πηγών'}`);
    for (const m of row.movements) doc.moveDown().text(`${m.id} · ${m.movementType} · ${number(m.quantity)} · ${m.sourceId || 'Χωρίς σύνδεση'}${m.included ? '' : ' · Βάση απογραφής, δεν προσμετράται'}`)
      .text(`Καταχώρηση ${timestamp(m.postedAt)} · συναλλαγή ${timestamp(m.transactionOccurredAt)} · παραστατικό ${timestamp(m.documentDate)} · φυσική κίνηση ${timestamp(m.physicalAt)}`)
      .text(`Φυσικό ${number(m.balanceBefore)} → ${number(m.balanceAfter)} · λογιστικό ${number(m.recordedBalanceBefore)} → ${number(m.recordedBalanceAfter)} · χειριστής ${m.actorName||m.actorId||'Άγνωστος'} · ${m.findings.join(', ')}`);
  }
  if(report.review?.history?.length){doc.moveDown().fontSize(10).text('Ιστορικό επιβεβαιώσεων και διορθώσεων αναφοράς');
    for(const r of report.review.history)doc.fontSize(8).moveDown().text(`${r.id} · ${timestamp(r.createdAt)} · ${r.actorName} · ${r.action.kind} · ${r.active?'ενεργή':'ιστορική'}`)
      .text(`${r.action.reason} · ${r.action.evidence}${r.action.quantity===undefined?'':` · διόρθωση ${r.action.quantity}`}`);
  }
  if(report.sourceEvidence){const e=report.sourceEvidence;
    doc.moveDown().fontSize(11).text('Πηγές και αποδεικτικά που ελέγχθηκαν');doc.fontSize(8).text(e.explanation).text(JSON.stringify(e.coverage));
    doc.text(`Συναλλαγές ${e.checkedCounts.transactions} · παραστατικά ${e.checkedCounts.invoices} · γραμμές ${e.checkedCounts.invoiceLines} · συμβάντα ${e.checkedCounts.systemEvents}`);
    for(const x of e.transactions){doc.moveDown().text(`${x.id} · προϊόν ${x.productId} · ${x.source}/${x.status} · ${x.actorName||x.actorId||'Άγνωστος χειριστής'} · μεταβολή ${number(x.quantity)}`).text(`Συναλλαγή ${timestamp(x.occurredAt)} · καταχώρηση ${timestamp(x.recordedAt)} · ${x.disposition}`).text(`Κινήσεις ${x.postingIds.join(', ')} · audit ${x.auditIds.join(', ')} · ${x.findings.join(', ')}`);for(const l of x.lines)doc.text(`${l.id} · ποσότητα ${number(l.quantity)} · τιμή ${number(l.unitPrice)} · έκπτωση ${number(l.discount)} · αξία ${number(l.lineTotal)}`);}
    for(const x of e.invoices){doc.moveDown().text(`${x.documentNumber||x.id} · ${x.id} · ${x.documentType}/${x.status} · ημερομηνία ${timestamp(x.issueDate)} · καταχώρηση ${timestamp(x.recordedAt)}`).text(`Κοινό ${x.canonicalDocumentId||'—'} · κινήσεις ${x.movementIds.join(', ')} · ${x.findings.join(', ')}`);for(const l of x.lines)doc.text(`${l.id} · ${l.productId||'Μη αντιστοιχισμένο'} · ${number(l.quantity)} ${l.unit} × ${number(l.unitsPerPackage)} → ${number(l.baseQuantity)} · ${l.findings.join(', ')}`);}
    for(const x of e.systemEvents)doc.moveDown().text(`${x.id} · ${timestamp(x.recordedAt)} · ${x.actorName||'Άγνωστος'} · ${x.eventType} · ${x.stockImpact}`).text(`Συναλλαγή ${x.saleId||'—'} · είδη ${x.productIds.join(', ')} · ${x.reason||''}`).text(`Μεταβολές: ${JSON.stringify(x.changes)}`);
  }
  doc.end(); return completed;
}
