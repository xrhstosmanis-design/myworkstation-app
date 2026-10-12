const money=v=>v===null||v===undefined?null:typeof v==="number"&&Number.isFinite(v)?v:null;
const at=v=>v&&!Number.isNaN(new Date(v).getTime())?new Date(v).toLocaleString("el-GR",{timeZone:"Europe/Athens"}):"Μη καταγεγραμμένη";
const unit=v=>({PIECE:"τεμάχια",KG:"κιλά",LITER:"λίτρα",PACKAGE:"συσκευασίες"})[v]||"Μη καταγεγραμμένη";
export const spreadsheetSafeText=value=>{const s=String(value??"").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g,"");return /^[\s\uFEFF]*[=+\-@]/.test(s)?"'"+s:s;};
export function assistantReportTables(evidence,{generatedAt=new Date()}={}){
 if(!Array.isArray(evidence)||!evidence.length||evidence.length>2)throw Object.assign(new Error("Δεν υπάρχει αναγνωσμένη αναφορά για εξαγωγή."),{status:422});
 return evidence.flatMap((r,index)=>{
  if(!r||!Array.isArray(r.rows)||r.rows.length>2000)throw Object.assign(new Error("Η αναφορά ξεπερνά το όριο εξαγωγής."),{status:422});
  const notes=[`Ώρα δημιουργίας: ${at(generatedAt)}`,`Πηγή: ${r.source||"Κανονική αναφορά MyWorkStation"}`,`Εύρος: ${r.storeName||(["PLATFORM_ALL_STORES","PLATFORM_AUTHORIZED_STORES"].includes(r.scope)?"Ρητά όλα τα εξουσιοδοτημένα καταστήματα":"Επιλεγμένο κατάστημα")}`,`Περίοδος: ${r.from||r.date||"Τρέχον καταγεγραμμένο απόθεμα"}${r.to?` έως ${r.to}`:""} · ώρα Ελλάδας`];
  if(r.truncated||r.result==="source_limited")notes.push(r.reason||"Περιορισμένη πηγή. Δεν επιβεβαιώνεται πλήρες σύνολο.");
  if(r.incompletePeriod)notes.push(`Η περίοδος δεν έχει ολοκληρωθεί. Στοιχεία έως ${r.asOf||r.observedAt||"την ώρα ανάγνωσης"}.`);
  if(r.result==="ambiguous")notes.push("Ασαφής ονομασία· απαιτείται επιλογή είδους. Δεν εξάγονται ποσά.");
  if(r.result==="no_match")notes.push("Δεν βρέθηκε αντίστοιχη εγγραφή. Δεν αποδεικνύεται μηδενικό απόθεμα ή μηδενική πώληση.");
  if(r.result==="no_records"||r.result==="no_sales")notes.push("Δεν βρέθηκαν καταχωρημένα στοιχεία στο συγκεκριμένο φίλτρο.");
  for(const unavailable of r.unavailable||[])notes.push(`Μη διαθέσιμη πηγή: ${unavailable.storeName||"Κατάστημα"} · ${unavailable.reason||"Δεν επιβεβαιώθηκαν στοιχεία"}`);
  let title,columns,rows;
  const noAmounts=["ambiguous","no_match","source_limited"].includes(r.result);
  if(r.kind==="consumption"){
   title=r.consumptionKind==="PRODUCT_DESTRUCTION"?"Καταστροφή προϊόντων":"Ιδιοκατανάλωση";
   columns=["Ημερομηνία","Είδος","SKU","Ποσότητα","Αξία αναφοράς (€)","Χειριστής καταχώρισης"];
   rows=noAmounts?[]:r.rows.map(x=>[at(x.recordedAt),x.name,x.sku||"",money(x.quantity),money(x.referenceValue),x.operatorName||"Μη καταγεγραμμένος"]);
   notes.push("Η αξία αναφοράς δεν είναι τζίρος, πληρωμή ή κόστος αγοράς. Δεν αθροίζονται ποσότητες διαφορετικών μονάδων.");
  }else if(r.kind==="product_stock"){
   title="Τρέχον καταγεγραμμένο απόθεμα";columns=["Κατάστημα","Είδος","SKU","Ποσότητα","Μονάδα"];
   rows=noAmounts?[]:r.rows.map(x=>[r.storeName,x.name,x.sku,money(x.currentStock),unit(x.unit)]);notes.push("Καταγεγραμμένο απόθεμα της ώρας ανάγνωσης, όχι φυσική καταμέτρηση ή διαθέσιμο προς πώληση.");
  }else if(r.kind==="product_sales"||r.kind==="sales_by_store"){
   title=r.kind==="sales_by_store"?"Πωλήσεις ανά κατάστημα":"Πωλήσεις είδους";
   columns=["Εταιρεία","Κατάστημα","Είδος","Μονάδα","Ποσότητα","Τζίρος (€)","Καθαρή αξία (€)","ΦΠΑ (€)"];
   rows=noAmounts?[]:r.rows.map(x=>[x.companyName||r.companyName,x.storeName||r.storeName,x.name,unit(x.unit),money(x.salesQuantity),money(x.grossSales),money(x.netSales),money(x.vatValue)]);
   notes.push("Καταχωρημένες πωλήσεις με επιστροφές/ακυρώσεις συνυπολογισμένες. Δεν αθροίζονται διαφορετικές μονάδες.");if(r.mode==="family")notes.push("Όλες οι καταγεγραμμένες συσκευασίες/παραλλαγές που ταιριάζουν στην ονομασία· χωριστή γραμμή ανά είδος.");if(r.mode==="offers")notes.push("Μόνο πωλήσεις με καταγεγραμμένη εφαρμοσμένη προσφορά.");
  }else if(!r.kind&&r.closedShiftsOnly){
   title="Έλεγχος κλεισμένων βαρδιών";columns=["Εταιρεία","Κατάστημα","Βάρδια / POS","Κλείσιμο","Αναμενόμενα (€)","Καταμετρημένα (€)","Διαφορά μετρητών (€)","Διαφορά POS–EFTPOS (€)"];
   rows=r.rows.map(x=>[x.companyName,x.storeName,`${x.shiftLabel||""} / ${x.terminalPos||""}`,at(x.closedAt),money(x.expectedOperational),money(x.actualOperational),x.auditRule?.mode==="POS_EFTPOS_ONLY"?"Δεν ελέγχεται":money(x.variance),x.auditRule?.posEftposEnabled===false?"Δεν ελέγχεται":money(x.cardVariance)]);notes.push("Μόνο κλεισμένες βάρδιες. Οι κανόνες ελέγχου διατηρούνται· απουσία κλεισμένων βαρδιών δεν επιβεβαιώνει συμφωνία στα ανοικτά ταμεία.");
  }else throw Object.assign(new Error("Η πηγή δεν υποστηρίζει ακόμη εξαγωγή."),{status:422});
  const details={title,columns,rows,notes:notes.map(v=>String(v).slice(0,2000)),sheet:`Αναφορά ${index+1}`};
  if(r.kind==="sales_by_store"&&!noAmounts&&Array.isArray(r.stores))return [{title:"Σύνοψη ανά κατάστημα",columns:["Εταιρεία","Κατάστημα","Κατάσταση πηγής","Τζίρος (€)","Ποσότητες ανά μονάδα"],rows:r.stores.map(x=>[x.companyName,x.storeName,({complete:"Διαβάστηκε",no_sales:"Χωρίς πωλήσεις",unavailable:"Μη διαθέσιμη"})[x.result]||"Δες τον περιορισμό της πηγής",money(x.grossSales),(x.quantities||[]).map(q=>`${q.quantity} ${unit(q.unit)}`).join(" · ")]),notes:details.notes,sheet:`Σύνοψη ${index+1}`},details];
  return [details];
 });
}
