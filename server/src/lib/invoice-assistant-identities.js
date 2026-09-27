const normalized=value=>String(value??"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toUpperCase().replace(/[^\p{L}\p{N}]+/gu," ").trim().replace(/\s+/g," ");

// The identity transcription is made without the POS draft or the economics
// answer. A disagreement stays visible and never silently becomes a correction.
export function reconcileAssistantIdentities(lines,independent){
  const rows=Array.isArray(independent?.rows)?independent.rows:[];
  if(rows.length!==lines.length)return lines.map(line=>({...line,confidence:"uncertain",matchingLineId:"",identityMismatch:true,reviewReason:"Η ανεξάρτητη ανάγνωση δεν επιβεβαίωσε το πλήθος και τη σειρά των προϊόντων."}));
  return lines.map((line,index)=>{
    const other=rows[index]||{};
    const sameCode=Boolean(normalized(line.supplierCode))&&normalized(line.supplierCode)===normalized(other.supplierCode);
    const sameName=Boolean(normalized(line.description))&&normalized(line.description)===normalized(other.description);
    if(sameCode&&sameName&&other.confidence==="certain")return line;
    const candidateCode=other.confidence==="certain"&&String(other.supplierCode||"").trim()?String(other.supplierCode).trim():line.supplierCode;
    const candidateName=other.confidence==="certain"&&String(other.description||"").trim()?String(other.description).trim():line.description;
    const detail=`Ανεξάρτητη ανάγνωση: ${String(other.supplierCode||"—").slice(0,40)} · ${String(other.description||"—").slice(0,130)}. Επιβεβαίωσε κωδικό και ονομασία στο έντυπο.`;
    return {...line,supplierCode:candidateCode,description:candidateName,confidence:"uncertain",matchingLineId:"",identityMismatch:true,reviewReason:[line.reviewReason,detail].filter(Boolean).join(" ").slice(0,300)};
  });
}
