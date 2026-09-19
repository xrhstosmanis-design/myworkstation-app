const number=value=>Number(value||0);
const compact=value=>String(value||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLocaleUpperCase("el-GR").replace(/[^A-ZΑ-Ω0-9.,-]/g,"");
const words=value=>String(value||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLocaleUpperCase("el-GR").split(/[^A-ZΑ-Ω0-9]+/).filter(word=>word.length>=4&&!/^\d+$/.test(word));

// A total can reconcile even when two neighbouring physical rows exchanged
// their quantity or description.  Do not call that combination confirmed
// unless the stored raw row independently carries the same code, quantity and
// meaningful description words.
export function rawRowSupportsStructuredLine(line){
  const raw=String(line?.rawText||line?.ocrRawText||"").trim();
  if(!raw)return false;
  const rawKey=compact(raw),code=compact(line?.code||line?.supplierCode);
  if(code&&code.length>=3&&!rawKey.includes(code))return false;
  const quantity=number(line?.quantity);
  if(quantity>0){
    const values=[...raw.replace(/,/g,".").matchAll(/(?<![\d.])-?\d+(?:\.\d+)?/g)].map(match=>Number(match[0]));
    if(!values.some(value=>Math.abs(value-quantity)<=0.0001))return false;
  }
  const descriptionWords=words(line?.description);
  return !descriptionWords.length||descriptionWords.some(word=>rawKey.includes(word));
}

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
  if(!rawRowSupportsStructuredLine(line))reasons.push("Τα στοιχεία δεν επιβεβαιώνονται από την ίδια φυσική σειρά OCR");
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
