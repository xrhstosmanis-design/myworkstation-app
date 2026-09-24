// Preserve bounded, job-local evidence across a POS complete-table reread.
// A reread replaces resultJson.productLines; without a snapshot it becomes
// impossible to tell whether the first OCR pass or the reread shifted a comma.
const MAX_LINES=100;
const MAX_RAW=320;
const number=value=>{const n=Number(value);return Number.isFinite(n)?n:null};

function snapshot(result,stage){
  const source=Array.isArray(result?.productLines)?result.productLines:[];
  return {
    stage,
    lineCount:source.length,
    truncated:source.length>MAX_LINES,
    lines:source.slice(0,MAX_LINES).map(line=>({
      code:String(line?.code||"").slice(0,80),
      rawText:String(line?.azureRawRow||line?.rawText||"").slice(0,MAX_RAW),
      quantity:number(line?.quantity),unitCost:number(line?.unitCost),
      discount1:number(line?.discount1),netAmount:number(line?.netAmount),
      vatRate:number(line?.vatRate),grossAmount:number(line?.grossAmount),
      sourceColumnsVerified:line?.sourceColumnsVerified===true,
      quantitySource:String(line?.quantitySource||"").slice(0,100)
    }))
  };
}

export function capturePosInvoiceProviderRows(result){
  return snapshot(result,"PROVIDER_BEFORE_RECOVERY");
}

export function preservePosInvoiceReadingEvidence(previous,next,providerRows){
  if(!previous?.posHandoff)return null;
  const saved=previous?.posReadingEvidence?.original;
  // The first POS pass often starts with an empty fast-handoff job. Preserve
  // the first populated table, then retain it across subsequent rereads.
  const original=saved?.lineCount>0?saved
    :Array.isArray(previous.productLines)&&previous.productLines.length?snapshot(previous,"BEFORE_COMPLETE_REREAD")
    :snapshot(next,"FIRST_COMPLETE_READ");
  return {version:1,original,provider:providerRows?.stage==="PROVIDER_BEFORE_RECOVERY"?providerRows:null,reread:snapshot(next,"AFTER_COMPLETE_REREAD")};
}
