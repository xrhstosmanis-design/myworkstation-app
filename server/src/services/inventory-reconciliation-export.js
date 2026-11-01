import XLSX from 'xlsx';
import PDFDocument from 'pdfkit';
import {fileURLToPath} from 'node:url';
const number = x => x === null ? 'Άγνωστο' : String(x);
const safeCell = x => typeof x === 'string' && /^[=+\-@\t\r]/.test(x) ? `'${x}` : x;
export function inventoryReconciliationWorkbook(report) {
  const wb = XLSX.utils.book_new();
  const append = (name,rows) => XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(rows.map(row=>row.map(safeCell))),name);
  append('Αναφορά',[
    ['Έλεγχος απογραφής','ΠΡΟΣ ΕΛΕΓΧΟ'],['Κατάστημα',report.current.storeName || report.current.storeId],
    ['Προηγούμενη απογραφή',report.previous.name,report.previous.id],['Νεότερη απογραφή',report.current.name,report.current.id],
    ['Πληρότητα',report.explanation],['Αποτίμηση',report.costMethod],
    ['Ελλείμματα τεμάχια',report.summary.shortageQuantity],['Πλεονάσματα τεμάχια',report.summary.surplusQuantity],
    ['Καθαρή διαφορά τεμάχια',report.summary.netQuantity],['Αξία ελλειμμάτων',report.summary.shortageValue],
    ['Αξία πλεονασμάτων',report.summary.surplusValue],['Καθαρή αξία',report.summary.netValue],
    ['Χωρίς υπολογισμό',report.summary.uncomputedItems],['Χωρίς κόστος',report.summary.missingCostItems]
  ]);
  append('Είδη',[['Ταυτότητα','SKU','Περιγραφή','Από καταμέτρηση','Έως καταμέτρηση','Προηγούμενη ποσότητα','Εισαγωγές','Εξαγωγές','Διορθώσεις συστήματος','Αναμενόμενο','Καταμέτρηση','Διαφορά προς έλεγχο','Κόστος','Αξία','Ευρήματα'],
    ...report.rows.map(x=>[x.productId,x.sku,x.name,x.from,x.to,x.previousCountedQuantity,x.incoming,x.outgoing,x.systemAdjustments,x.expectedQuantity,x.countedQuantity,x.difference,x.unitCost,x.differenceValue,x.findings.join(', ')])]);
  append('Κινήσεις',[['Προϊόν','ID κίνησης','Τύπος','Κατάταξη','Ποσότητα','Πριν','Μετά','Ώρα καταχώρησης','Ημερομηνία παραστατικού','Καταχώρηση παραστατικού','Πραγματική ώρα κίνησης','Χειριστής','Παραστατικό','Σύνδεση','Υπολογίστηκε','Ευρήματα'],
    ...report.rows.flatMap(x=>x.movements.map(m=>[x.productId,m.id,m.movementType,m.classification,m.quantity,m.balanceBefore,m.balanceAfter,m.postedAt,m.documentDate,m.documentRecordedAt,null,m.actorName,m.documentNumber,m.sourceId,m.included,m.findings.join(', ')]))]);
  append('Καταμετρήσεις',[['Προϊόν','ID συμβάντος','Απογραφή','Τύπος','Πριν','Καταμέτρηση','Θεωρητικό','Χειριστής','Πηγή','Ώρα'],
    ...report.rows.flatMap(x=>x.countHistory.map(e=>[x.productId,e.id,e.stocktakeId,e.eventType,e.previousQuantity,e.countedQuantity,e.expectedQuantity,e.actorName,e.source,e.createdAt]))]);
  return XLSX.write(wb,{bookType:'xlsx',type:'buffer'});
}
export async function inventoryReconciliationPdf(report) {
  if (report.rows.length > 2000 || report.summary.movementCount > 10000) throw Object.assign(new Error('Η αναφορά υπερβαίνει το όριο PDF. Χρησιμοποίησε Excel για το πλήρες αποτέλεσμα.'),{status:413});
  const doc = new PDFDocument({size:'A4',margin:35,info:{Title:'Έλεγχος απογραφής'}}), chunks=[];
  const completed = new Promise((resolve,reject)=>{doc.on('data',x=>chunks.push(x));doc.on('end',()=>resolve(Buffer.concat(chunks)));doc.on('error',reject);});
  doc.font(fileURLToPath(new URL('../../assets/fonts/DejaVuSans.ttf',import.meta.url)));
  doc.fontSize(15).text('Έλεγχος απογραφής — ΠΡΟΣ ΕΛΕΓΧΟ');
  doc.fontSize(9).text(`Κατάστημα: ${report.current.storeName || report.current.storeId}`)
    .text(`Από: ${report.previous.name} (${report.previous.id})`).text(`Έως: ${report.current.name} (${report.current.id})`)
    .moveDown().text(report.explanation).text(report.costMethod).moveDown()
    .text(`Ελλείμματα: ${number(report.summary.shortageQuantity)} τμχ · ${number(report.summary.shortageValue)} €`)
    .text(`Πλεονάσματα: ${number(report.summary.surplusQuantity)} τμχ · ${number(report.summary.surplusValue)} €`)
    .text(`Καθαρή διαφορά: ${number(report.summary.netQuantity)} τμχ · ${number(report.summary.netValue)} €`)
    .text(`Χωρίς υπολογισμό: ${report.summary.uncomputedItems} · Χωρίς κόστος: ${report.summary.missingCostItems}`);
  for (const row of report.rows) {
    doc.moveDown().fontSize(10).text(`${row.sku || row.productId} · ${row.name}`);
    doc.fontSize(8).text(`${row.from || 'Άγνωστο'} → ${row.to || 'Άγνωστο'}`)
      .text(`Προηγούμενο ${number(row.previousCountedQuantity)} + εισαγωγές ${row.incoming} − εξαγωγές ${row.outgoing} + διορθώσεις συστήματος ${row.systemAdjustments} = ${number(row.expectedQuantity)}`)
      .text(`Καταμέτρηση ${number(row.countedQuantity)} · διαφορά ${number(row.difference)} · κόστος ${number(row.unitCost)} · αξία ${number(row.differenceValue)}`)
      .text(`Ευρήματα: ${row.findings.join(', ') || 'Απαιτείται έλεγχος πληρότητας πηγών'}`);
    for (const m of row.movements) doc.text(`${m.id} · ${m.postedAt} · ${m.movementType} · ${number(m.quantity)} · ${m.sourceId || 'Χωρίς σύνδεση'}${m.included ? '' : ' · Βάση απογραφής, δεν προσμετράται'}`);
  }
  doc.end(); return completed;
}
