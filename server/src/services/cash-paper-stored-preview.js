// GET-only stored evidence. The caller supplies the unchanged paid-admission
// result and budget. No provider, writer or cross-request cache is available here.
const maxByteLimit=100*1024*1024;
const maxOriginalBytes=7*1024*1024; // Existing validatePaperSource ceiling.
const smallAdmittedBudget=25*1024*1024; // Preserve existing small-set validation order.
const reasons=new Set(['ATTACHMENT_BYTE_LIMIT','ATTACHMENT_SIZE_UNAVAILABLE']);
const discoverable=new Set(['AWAITING_READING','LIMITED']);
const validSource=s=>s&&typeof s.sourceId==='string'&&/^[a-f0-9]{64}$/.test(s.checksum||'')&&Array.isArray(s.references)&&s.references.length>0&&s.references.every(r=>typeof r?.messageId==='string'&&r.messageId.trim());
const unresolved=()=>({status:'REQUIRES_REVIEW'});

export async function readStoredCashPaperPreview({repository,scope,discovery,admitted,byteLimit}){
  if(!Number.isSafeInteger(byteLimit)||byteLimit<=0||byteLimit>maxByteLimit)throw new TypeError('Invalid stored-paper byte budget');
  const fallback=admitted?.status==='UNAVAILABLE'&&reasons.has(admitted.reason)&&discoverable.has(discovery?.status)&&Array.isArray(discovery.sources)&&discovery.sources.length>0&&discovery.sources.length<=50;
  // For large admitted sets, inspect cached reading state before fetching the
  // original binary. NOT_READ/PENDING/REQUIRES_REVIEW never require source bytes.
  // Every extracted reading still revalidates the exact original hash and size.
  const largeAdmitted=!fallback&&admitted?.status==='AWAITING_READING'&&Array.isArray(admitted.sources)
    &&admitted.sources.length<=50&&admitted.sources.every(s=>Number.isSafeInteger(s?.sizeBytes)&&s.sizeBytes>0)
    &&admitted.sources.reduce((total,source)=>total+source.sizeBytes,0)>smallAdmittedBudget;
  const papers=[];
  if(!fallback&&!largeAdmitted){
    // Preserve the admitted legacy path, including validation-before-get,
    // ordering and unresolved error shape. It is not a new paid-read path.
    for(const source of admitted?.sources||[]){
      let reading=unresolved();
      if(source.checksum&&source.references?.[0]?.messageId){
        try{await repository.source(scope,source.references[0].messageId,source.checksum);reading=await repository.get(scope,source.checksum);}catch{}
      }
      papers.push({...source,reading});
    }
    return {discovery:admitted,papers};
  }
  let remaining=byteLimit;
  for(const source of discovery.sources){
    let reading=unresolved();
    if(validSource(source)){
      try{
        const stored=await repository.get(scope,source.checksum);
        if(stored?.status==='EXTRACTED_UNVERIFIED'){
          const size=source.sizeBytes;
          if(Number.isSafeInteger(size)&&size>0&&size<=maxOriginalBytes&&size<=remaining){
            // A failed attempt still consumes its metadata-admitted budget.
            remaining-=size;
            const original=await repository.source(scope,source.references[0].messageId,source.checksum);
            if(original?.checksum===source.checksum&&original.messageId===source.references[0].messageId&&original.bytes?.length===size)reading=stored;
          }
        }else if(['NOT_READ','PENDING','REQUIRES_REVIEW'].includes(stored?.status)){
          // No raw extraction may escape through a non-extracted status.
          reading={status:stored.status,...(typeof stored.sourceKey==='string'?{sourceKey:stored.sourceKey}:{})};
        }
      }catch{}
    }
    papers.push({...source,reading});
  }
  // Partial admission never proves a complete scan, even if every eligible
  // stored original was validated. The original discovery snapshot is retained.
  return largeAdmitted?{discovery:admitted,papers}:{discovery:{...discovery,status:'LIMITED',reason:admitted.reason,complete:false},papers};
}
