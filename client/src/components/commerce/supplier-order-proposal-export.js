// This is a review snapshot, never an order or a statement of physical deliveries.
const cell=value=>{
  if(typeof value==="number"){
    if(!Number.isFinite(value))throw Error("Μη έγκυρη ποσότητα εξαγωγής.");
    return `"${String(value)}"`;
  }
  let text=value==null?"":String(value);
  // Spreadsheet importers can ignore whitespace/control prefixes before formulas.
  if(/^[\s\u0000-\u001f\u007f-\u009f]*[=+\-@]/u.test(text)||/^[\t\r\n]/.test(text))text="'"+text;
  return `"${text.replace(/"/g,'""')}"`;
};
export function buildSupplierProposalCsv({snapshot,rows,filters}){
  if(!snapshot?.storeId||!Array.isArray(rows)||!rows.length||typeof snapshot.generatedAt!=="string"||snapshot.generatedAt!==snapshot.to||!Number.isFinite(Date.parse(snapshot.generatedAt))||snapshot.supplierBasis!=="APPROVED_DOCUMENT_FREQUENCY_PROXY"||snapshot.reviewRequired!==true||snapshot.automaticTransmission!==false)throw Error("Δεν υπάρχει έγκυρη πρόταση για εξαγωγή.");
  const header=["Κατάστημα ID","Στιγμή υπολογισμού (ISO)","Ιστορικό από (ISO)","Ιστορικό έως (ISO)","Ημέρες ιστορικού","Ημέρες κάλυψης","Ημέρες παράδοσης","Βάση πρότασης","Πλήρης πηγή παραστατικών","Απαιτείται έλεγχος","Αυτόματη αποστολή","Αναζήτηση","Φίλτρο υποψήφιου προμηθευτή","Μόνο ποσότητες για παραγγελία / έλεγχο","Εύρος εξαγωγής","Προϊόν ID","Προϊόν","Κωδικός","Μονάδα αποθήκης","Απόθεμα","Ελάχιστο απόθεμα","Πωλήσεις","Επιστροφές / ακυρώσεις","Καθαρή κίνηση","Ημερήσια ζήτηση","Προτεινόμενη ποσότητα","Υποψήφιος προμηθευτής ID","Υποψήφιος προμηθευτής","Αιτία ελέγχου προμηθευτή","Υποψήφιοι / εγκεκριμένα παραστατικά","Αιτιολογία ποσότητας","Προειδοποιήσεις"];
  const metadata=[snapshot.storeId,snapshot.generatedAt,snapshot.from,snapshot.to,snapshot.options.historyDays,snapshot.options.coverageDays,snapshot.options.leadDays,snapshot.supplierBasis,snapshot.complete?"YES":"NO","YES","NO",filters.query,filters.supplier,filters.onlyNeeded?"YES":"NO","CURRENT_FILTERED_ROWS_ALL_PAGES"];
  const records=rows.map(row=>{
    if(!snapshot.rows.includes(row))throw Error("Η εξαγωγή δεν αντιστοιχεί στην εφαρμοσμένη πρόταση.");
    const group=snapshot.groups.find(item=>item.candidateSupplierId===row.candidateSupplierId);
    return [...metadata,row.productId,row.name,row.sku,row.unitLabel,row.currentStock,row.minStock,row.soldQuantity,row.returnedQuantity,row.netQuantity,row.dailyDemand,row.suggestedQuantity,row.candidateSupplierId,group?.supplierName||"Χωρίς προμηθευτή",row.supplierReviewReason,row.supplierCandidates.map(candidate=>`${candidate.supplierName}: ${candidate.documentCount}`).join(" | "),row.reason,row.warnings.join(" | ")];
  });
  return "\ufeff"+[header,...records].map(record=>record.map(cell).join(",")).join("\r\n")+"\r\n";
}
