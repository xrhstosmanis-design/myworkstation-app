import {Worker} from 'node:worker_threads';

let occupied=false;
const failure=(code,status=409)=>Object.assign(new Error(code==='MYDATA_IDENTITY_OCR_BUSY'?'Ο έλεγχος πρωτοτύπου εκτελείται ήδη. Δοκιμάστε ξανά σε λίγο.':code==='MYDATA_IDENTITY_OCR_TIMEOUT'?'Ο έλεγχος ταυτότητας του πρωτοτύπου δεν ολοκληρώθηκε εγκαίρως. Δοκιμάστε ξανά αργότερα.':'Δεν επιβεβαιώθηκε η ταυτότητα του πρωτοτύπου. Απαιτείται έλεγχος.'),{code,status});

// Identity-only local CPU reader. No expected identifiers, model/provider URL,
// wallet, job or database handle is accepted. One process-wide permit bounds
// concurrent native/WASM work; it is released only after worker termination.
export async function readOriginalIdentityHeader(bytes,{signal}={}){
 if(!(bytes instanceof Uint8Array)||bytes.length<100||bytes.length>3400000||Buffer.from(bytes.subarray(0,5)).toString()!=='%PDF-')throw failure('MYDATA_IDENTITY_OCR_INVALID_PDF');
 if(signal?.aborted)throw signal.reason||failure('MYDATA_IDENTITY_OCR_ABORTED',504);
 if(occupied)throw failure('MYDATA_IDENTITY_OCR_BUSY',503);
 occupied=true;
 let worker;
 try{
  const copy=new Uint8Array(bytes);
  worker=new Worker(new URL('./mydata-original-identity-ocr-worker.js',import.meta.url),{workerData:{bytes:copy},transferList:[copy.buffer],resourceLimits:{maxOldGenerationSizeMb:256}});
 }catch{
  occupied=false;
  throw failure('MYDATA_IDENTITY_OCR_START_FAILED');
 }
 return new Promise((resolve,reject)=>{
  let settling=false;
  const finish=async(error,value)=>{
   if(settling)return;settling=true;
   clearTimeout(timer);signal?.removeEventListener('abort',abort);
   try{await worker.terminate();occupied=false;}catch{error=failure('MYDATA_IDENTITY_OCR_CLEANUP_FAILED');}
   if(error)reject(error);else resolve(value);
  };
  const abort=()=>void finish(signal.reason||failure('MYDATA_IDENTITY_OCR_ABORTED',504));
  const timer=setTimeout(()=>void finish(failure('MYDATA_IDENTITY_OCR_TIMEOUT',504)),20000);
  worker.once('message',message=>{
   if(message?.ok!==true)return void finish(failure(message?.code==='MYDATA_IDENTITY_OCR_MODEL_MISMATCH'?'MYDATA_IDENTITY_OCR_MODEL_MISMATCH':'MYDATA_IDENTITY_OCR_FAILED'));
   const value=message.value;
   if(!value||typeof value.text!=='string'||value.text.length>20000||value.pageCount!==1||value.region!=='FIRST_PAGE_TOP_45_PERCENT'||!Number.isFinite(value.confidence)||value.confidence<0||value.confidence>100||!/^[a-f0-9]{64}$/.test(value.checksum||'')||!Number.isSafeInteger(value.width)||!Number.isSafeInteger(value.height)||value.width<1||value.height<1||Math.max(value.width,value.height)>5000||value.width*value.height>6000000)return void finish(failure('MYDATA_IDENTITY_OCR_INVALID_RESULT'));
   void finish(null,value);
  });
  worker.once('error',()=>void finish(failure('MYDATA_IDENTITY_OCR_WORKER_FAILED')));
  worker.once('exit',()=>{if(!settling)void finish(failure('MYDATA_IDENTITY_OCR_EARLY_EXIT'));});
  signal?.addEventListener('abort',abort,{once:true});
  if(signal?.aborted)abort();
 });
}
