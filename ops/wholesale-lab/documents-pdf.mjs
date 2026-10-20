import PDFDocument from 'pdfkit';
import {fileURLToPath} from 'node:url';
const titles={INVOICE:'Εικονικό τιμολόγιο',DELIVERY_NOTE:'Εικονικό δελτίο αποστολής',INVOICE_DELIVERY:'Εικονικό τιμολόγιο - δελτίο αποστολής',CREDIT_NOTE:'Εικονικό πιστωτικό τιμολόγιο',RETURN_NOTE:'Εικονικό δελτίο επιστροφής'};
export async function createLabDocumentPdf(document){
  if(document?.testOnly!==true||!titles[document.type]||!Array.isArray(document.snapshot?.items))throw Error('Only verified TEST documents can render');
  const doc=new PDFDocument({size:'A4',margin:42,bufferPages:true,info:{Title:`TEST ${titles[document.type]}`,Author:'MyWorkStation isolated wholesale LAB',Subject:'TEST ONLY - NO FISCAL VALIDITY - NO AADE'}}),chunks=[];
  const complete=new Promise((resolve,reject)=>{doc.on('data',chunk=>chunks.push(chunk));doc.on('end',()=>resolve(Buffer.concat(chunks)));doc.on('error',reject)});
  doc.font(fileURLToPath(new URL('../../server/assets/fonts/DejaVuSans.ttf',import.meta.url)));
  const banner=()=>{doc.fillColor('#9f1239').fontSize(12).text('TEST ONLY / ΔΟΚΙΜΗ - ΧΩΡΙΣ ΦΟΡΟΛΟΓΙΚΗ ΙΣΧΥ',42,35,{width:510,align:'center'});doc.fontSize(9).text('NO AADE / NO myDATA / Καμία διαβίβαση ή πραγματική πληρωμή',42,55,{width:510,align:'center'});doc.fillColor('#10273d')};
  banner();doc.fontSize(19).text(titles[document.type],42,87,{width:510});doc.moveDown(.5).fontSize(10);
  for(const line of [`Αριθμός δοκιμής: ${document.number||document.id}`,`Κατάσταση: ${document.status||'ISSUED'}`,`Εκδότης: ΕΙΚΟΝΙΚΗ ΧΟΝΔΡΙΚΗ LAB - ΔΟΚΙΜΗ`,`Πελάτης δοκιμής: ${document.customerName||document.snapshot.customerName}`,`Κατάστημα: ${document.storeId}`,`Αίτημα παραγγελίας: ${document.orderId}`,`Ημερομηνία: ${document.createdAt||''}`])doc.text(line,{width:510});
  if(document.referenceId)doc.text(`Αρχικό εικονικό παραστατικό: ${document.referenceId}`,{width:510});
  doc.moveDown();
  function header(){const y=doc.y;doc.save().rect(42,y,510,25).fill('#e8eff5').restore();doc.fillColor('#10273d').fontSize(8);doc.text('Είδος / SKU',48,y+7,{width:215});doc.text('Ποσότητα',270,y+7,{width:70});doc.text('Καθαρή',350,y+7,{width:60,align:'right'});doc.text('ΦΠΑ',415,y+7,{width:53,align:'right'});doc.text('Σύνολο',470,y+7,{width:76,align:'right'});doc.y=y+31}
  header();
  for(const item of document.snapshot.items){
    const label=`${item.name}\n${item.sku||item.productId} · ΦΠΑ ${item.vatRate}%`,height=Math.max(36,doc.heightOfString(label,{width:215})+12);
    if(doc.y+height>715){doc.addPage();banner();doc.y=85;header()}
    const y=doc.y;doc.fillColor('#10273d').fontSize(8);doc.text(label,48,y,{width:215});doc.text(`${item.quantity} ${item.unit}`,270,y,{width:70});doc.text(item.netTotal,350,y,{width:60,align:'right'});doc.text(item.vatTotal,415,y,{width:53,align:'right'});doc.text(item.grossTotal,470,y,{width:76,align:'right'});doc.save().moveTo(42,y+height-5).lineTo(552,y+height-5).strokeColor('#d8e3ed').stroke().restore();doc.y=y+height;
  }
  if(doc.y>650){doc.addPage();banner();doc.y=85}
  doc.moveDown().fontSize(11).text(`Καθαρή αξία: ${document.netTotal} EUR`,42,doc.y,{width:510,align:'right'}).text(`ΦΠΑ: ${document.vatTotal} EUR`,42,doc.y,{width:510,align:'right'}).fontSize(14).text(`Σύνολο δοκιμής: ${document.grossTotal} EUR`,42,doc.y,{width:510,align:'right'});
  doc.moveDown().fontSize(9).fillColor('#9f1239').text('Αποκλειστικά συνθετικά δεδομένα. Δεν είναι απόδειξη, νόμιμο τιμολόγιο ή έγκυρο παραστατικό διακίνησης. Δεν χρησιμοποιείται εκτός του δοκιμαστικού περιβάλλοντος.',42,doc.y,{width:510});
  const range=doc.bufferedPageRange();for(let page=0;page<range.count;page++){doc.switchToPage(page);doc.save().fillColor('#9f1239').opacity(.07).fontSize(70).rotate(-30,{origin:[295,410]}).text('TEST ONLY',70,380,{width:500,align:'center'}).restore();doc.fontSize(8).fillColor('#566b7d').text(`TEST ONLY - NO FISCAL VALIDITY - NO AADE | ${page+1}/${range.count}`,42,780,{width:510,align:'center',lineBreak:false})}
  doc.end();return complete;
}
