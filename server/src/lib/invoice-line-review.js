const number=value=>Number(value||0);

// A review flag preserves a safe OCR draft; it never turns an uncertain value
// into a silent confirmation. A manager's explicit save clears the flag.
export function assessInvoiceLineForReview(line,{matched=false}={}){
  const reasons=[];
  const confidence=number(line?.confidence??line?.ocrConfidence);
  const quantity=number(line?.quantity);
  const unitCost=number(line?.unitCost);
  const unit=String(line?.unit??line?.invoiceUnit??"").toUpperCase();
  const unitsPerPackage=number(line?.stockUnitsPerInvoiceUnit??line?.unitsPerPackage);
  if(!matched)reasons.push("Δεν έχει αντιστοιχιστεί με προϊόν");
  if(confidence>0&&confidence<85)reasons.push("Χαμηλή σιγουριά OCR");
  if(!(quantity>0))reasons.push("Μη έγκυρη ποσότητα");
  if(!(unitCost>0))reasons.push("Μη επιβεβαιωμένη τιμή μονάδας");
  if(/PACKAGE|PACK|BOX|CASE|ΚΙΒ|ΚΒ|ΠΑΚ/.test(unit)&&!(unitsPerPackage>0))reasons.push("Αβέβαιη συσκευασία / τεμάχια ανά πακέτο");
  if(line?.sourceColumnsVerified===false)reasons.push("Μη επιβεβαιωμένη αριθμητική ανάγνωση");
  return {needsReview:reasons.length>0,reasons};
}

export function reviewStatusForInvoiceLine(line,{matched=false}={}){
  const review=assessInvoiceLineForReview(line,{matched});
  return {...review,resolutionStatus:matched?(review.needsReview?"NEEDS_REVIEW":"MATCHED"):"UNRESOLVED"};
}

export function isLabReviewAcceptable(rows){
  const productRows=(Array.isArray(rows)?rows:[]).filter(row=>row?.ocrLineType!=='INFO');
  return productRows.filter(row=>row?.resolutionStatus==='UNRESOLVED').length===0&&productRows.filter(row=>row?.resolutionStatus==='NEEDS_REVIEW').length<=2;
}
