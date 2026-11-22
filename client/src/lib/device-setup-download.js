const ROOT="/downloads/device-setup/v1/";
const MAX_TOTAL=80*1024*1024,MAX_PART=8*1024*1024;
const hex=bytes=>Array.from(new Uint8Array(bytes),n=>n.toString(16).padStart(2,"0")).join("");
const abort=signal=>{if(signal?.aborted)throw new DOMException("Η λήψη ακυρώθηκε.","AbortError")};
async function bounded(response,max,signal){
  if(!response.body?.getReader){const data=new Uint8Array(await response.arrayBuffer());if(data.length>max)throw new Error("Το αρχείο υπερβαίνει το αναμενόμενο μέγεθος.");return data}
  const reader=response.body.getReader(),chunks=[];let length=0;
  try{while(true){abort(signal);const {value,done}=await reader.read();if(done)break;length+=value.length;if(length>max)throw new Error("Το αρχείο υπερβαίνει το αναμενόμενο μέγεθος.");chunks.push(value)}const bytes=new Uint8Array(length);let offset=0;for(const part of chunks){bytes.set(part,offset);offset+=part.length}return bytes}
  finally{await reader.cancel().catch(()=>{});reader.releaseLock()}
}
export async function fetchDeviceSetup({device="scanner",signal,onProgress=()=>{},fetcher=globalThis.fetch,crypto=globalThis.crypto}={}){
  if(!["scanner","printer"].includes(device))throw new Error("Μη έγκυρη συσκευή.");
  if(!crypto?.subtle)throw new Error("Χρειάζεται ενημερωμένος browser μέσω ασφαλούς σύνδεσης.");
  const request=async path=>{abort(signal);const r=await fetcher(path,{signal,credentials:"omit",redirect:"error",cache:"no-cache"});if(!r.ok)throw new Error("Δεν ολοκληρώθηκε η λήψη του βοηθού. Δοκίμασε ξανά.");return r};
  const response=await request(ROOT+"manifest.json"),text=new TextDecoder().decode(await bounded(response,20000,signal));
  let manifest;try{manifest=JSON.parse(text)}catch{throw new Error("Μη έγκυρο πακέτο εγκατάστασης.")}
  if(!manifest||manifest.version!=="1.0.0"||!Number.isSafeInteger(manifest.size)||manifest.size<1024||manifest.size>MAX_TOTAL||!/^[a-f0-9]{64}$/.test(manifest.sha256||"")||!Array.isArray(manifest.parts)||!manifest.parts.length||manifest.parts.length>32)throw new Error("Μη έγκυρο πακέτο εγκατάστασης.");
  let total=0;const names=new Set();for(const p of manifest.parts){if(!p||!/^part-\d{3}\.bin$/.test(p.name)||names.has(p.name)||!Number.isSafeInteger(p.size)||p.size<1||p.size>MAX_PART||!/^[a-f0-9]{64}$/.test(p.sha256||""))throw new Error("Μη έγκυρο τμήμα εγκατάστασης.");names.add(p.name);total+=p.size;}if(total!==manifest.size)throw new Error("Ελλιπές πακέτο εγκατάστασης.");
  const bytes=new Uint8Array(total);let offset=0;
  try{
    for(const part of manifest.parts){const r=await request(ROOT+part.name),data=await bounded(r,part.size,signal);abort(signal);if(data.length!==part.size||hex(await crypto.subtle.digest("SHA-256",data))!==part.sha256)throw new Error("Το αρχείο δεν επαληθεύτηκε. Δεν θα εκτελεστεί εγκατάσταση.");bytes.set(data,offset);offset+=data.length;onProgress(Math.round(offset*95/total));}
    abort(signal);if(hex(await crypto.subtle.digest("SHA-256",bytes))!==manifest.sha256||bytes[0]!==77||bytes[1]!==90)throw new Error("Το αρχείο εγκατάστασης δεν επαληθεύτηκε.");abort(signal);onProgress(100);
    return {blob:new Blob([bytes],{type:"application/octet-stream"}),filename:device==="printer"?"MyWorkStation-LabelPrinter-Setup.exe":"MyWorkStation-Scanner-Setup.exe"};
  }finally{bytes.fill(0)}
}
