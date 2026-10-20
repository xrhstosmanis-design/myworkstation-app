// This is a review snapshot, never an order or a statement of physical deliveries.
const shortfallFilters=new Set(["ALL","BELOW_MINIMUM","DEMAND_REPLENISHMENT","REVIEW_REQUIRED"]);
const numericFields=["currentStock","minStock","soldQuantity","returnedQuantity","netQuantity","dailyDemand","targetStock","suggestedQuantity"];
const invalidShortfall=()=>{throw Error("Μη έγκυρα στοιχεία ποσότητας τρέχοντος ελλείμματος.");};
const ownValue=(object,key)=>{
  const d=object&&typeof object==="object"?Object.getOwnPropertyDescriptor(object,key):null;
  if(!d)return undefined;
  if(!d.enumerable||!Object.hasOwn(d,"value"))invalidShortfall();
  return d.value;
};
export function validateCurrentStockShortfall(row){
  const metadata=ownValue(row,"currentStockShortfall");
  if(!metadata||typeof metadata!=="object"||Array.isArray(metadata)||![Object.prototype,null].includes(Object.getPrototypeOf(metadata)))invalidShortfall();
  const keys=["status","quantity","basis","stockVerified","reviewReasons"];
  if(Reflect.ownKeys(metadata).length!==keys.length||Reflect.ownKeys(metadata).some(key=>!keys.includes(key)))invalidShortfall();
  const {status,quantity,basis,stockVerified,reviewReasons}=Object.fromEntries(keys.map(key=>[key,ownValue(metadata,key)]));
  if(basis!=="RECORDED_CURRENT_STOCK_MINIMUM"||stockVerified!==false||!Array.isArray(reviewReasons)||Object.getPrototypeOf(reviewReasons)!==Array.prototype||Reflect.ownKeys(reviewReasons).length!==reviewReasons.length+1||reviewReasons.length>1)invalidShortfall();
  const reasons=Array.from({length:reviewReasons.length},(_,index)=>ownValue(reviewReasons,String(index)));
  const values=Object.fromEntries(numericFields.map(key=>[key,ownValue(row,key)]));
  const reason=numericFields.some(key=>values[key]==null)?"NUMERIC_SUGGESTION_UNAVAILABLE":numericFields.some(key=>typeof values[key]!=="number"||!Number.isFinite(values[key])||(key!=="currentStock"&&values[key]<0))?"INVALID_NUMERIC_SUGGESTION":values.currentStock<0?"NEGATIVE_RECORDED_STOCK":null;
  const expected=reason?"REVIEW_REQUIRED":values.currentStock<values.minStock?"BELOW_MINIMUM":values.suggestedQuantity>0?"DEMAND_REPLENISHMENT":"NO_SHORTAGE";
  const amount=reason?null:expected==="BELOW_MINIMUM"?values.minStock-values.currentStock:0;
  if(status!==expected||quantity!==amount)invalidShortfall();
  if(reason?(reasons.length!==1||reasons[0]!==reason):reasons.length!==0)invalidShortfall();
  return Object.freeze({status,quantity,basis,stockVerified,reviewReasons:Object.freeze(reasons)});
}
export function matchesCurrentStockShortfall(row,filter="ALL"){
  if(!shortfallFilters.has(filter))invalidShortfall();
  const metadata=validateCurrentStockShortfall(row);
  return filter==="ALL"||metadata.status===filter;
}
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
  header.push("Φίλτρο τρέχοντος ελλείμματος","Κατάσταση τρέχοντος αποθέματος","Έλλειμμα κάτω από ελάχιστο","Βάση ελλείμματος","Φυσικό απόθεμα επαληθευμένο","Αιτίες ελέγχου ελλείμματος");
  const stockShortfall=filters.stockShortfall===undefined?"ALL":filters.stockShortfall;
  if(!shortfallFilters.has(stockShortfall))invalidShortfall();
  snapshot.rows.forEach(validateCurrentStockShortfall);
  const metadata=[snapshot.storeId,snapshot.generatedAt,snapshot.from,snapshot.to,snapshot.options.historyDays,snapshot.options.coverageDays,snapshot.options.leadDays,snapshot.supplierBasis,snapshot.complete?"YES":"NO","YES","NO",filters.query,filters.supplier,filters.onlyNeeded?"YES":"NO","CURRENT_FILTERED_ROWS_ALL_PAGES"];
  const records=rows.map(row=>{
    if(!snapshot.rows.includes(row))throw Error("Η εξαγωγή δεν αντιστοιχεί στην εφαρμοσμένη πρόταση.");
    if(!matchesCurrentStockShortfall(row,stockShortfall))invalidShortfall();
    const shortfall=validateCurrentStockShortfall(row);
    const group=snapshot.groups.find(item=>item.candidateSupplierId===row.candidateSupplierId);
    return [...metadata,row.productId,row.name,row.sku,row.unitLabel,row.currentStock,row.minStock,row.soldQuantity,row.returnedQuantity,row.netQuantity,row.dailyDemand,row.suggestedQuantity,row.candidateSupplierId,group?.supplierName||"Χωρίς προμηθευτή",row.supplierReviewReason,row.supplierCandidates.map(candidate=>`${candidate.supplierName}: ${candidate.documentCount}`).join(" | "),row.reason,row.warnings.join(" | "),stockShortfall,shortfall.status,shortfall.quantity,shortfall.basis,"NO",shortfall.reviewReasons.join(" | ")];
  });
  return "\ufeff"+[header,...records].map(record=>record.map(cell).join(",")).join("\r\n")+"\r\n";
}

