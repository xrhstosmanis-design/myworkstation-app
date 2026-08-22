const KEY='mws_invoice_learning_lab_v1';
const API='/api/platform/invoice-learning/workspace';
const token=()=>localStorage.getItem('token')||'';
const empty=()=>({documents:[],profiles:{},master:[]});
const parse=v=>{try{const x=JSON.parse(v||'null');return x&&typeof x==='object'?x:empty()}catch{return empty()}};
const cleanState=input=>{
  const seen=new WeakSet();
  const strip=value=>{
    if(value==null||typeof value!=='object')return value;
    if(seen.has(value))return null;seen.add(value);
    if(Array.isArray(value))return value.map(strip);
    const out={};
    for(const [k,v] of Object.entries(value)){
      if(k==='dataUrl'||k==='sourceDataUrl'||k==='imageData'||k==='pdfData')continue;
      if(typeof v==='string'&&v.length>750000)continue;
      out[k]=strip(v);
    }
    return out;
  };
  const s=strip(input||empty())||empty();
  return {documents:Array.isArray(s.documents)?s.documents:[],profiles:s.profiles&&typeof s.profiles==='object'&&!Array.isArray(s.profiles)?s.profiles:{},master:Array.isArray(s.master)?s.master:[]};
};
const docKey=d=>String(d?.id||[d?.supplierTaxId,d?.invoiceNumber,d?.invoiceDate,d?.filename].filter(Boolean).join('|'));
const merge=(remote,local)=>{
  const r=cleanState(remote),l=cleanState(local);const docs=new Map();
  for(const d of r.documents){const k=docKey(d);if(k)docs.set(k,d)}
  for(const d of l.documents){const k=docKey(d);if(k)docs.set(k,{...(docs.get(k)||{}),...d})}
  const master=new Map();
  for(const x of [...r.master,...l.master]){const k=String(x?.id||x?.barcode||x?.sourceCode||x?.name||'');if(k)master.set(k,{...(master.get(k)||{}),...x})}
  return {documents:[...docs.values()],profiles:{...r.profiles,...l.profiles},master:[...master.values()]};
};
let internal=false,timer=null,lastSent='';
const nativeSet=Storage.prototype.setItem;
async function push(raw){
  const state=cleanState(parse(raw));const body=JSON.stringify({state});if(body===lastSent)return;
  const r=await fetch(API,{method:'PUT',headers:{Authorization:`Bearer ${token()}`,'Content-Type':'application/json'},body});
  if(!r.ok)throw new Error(`workspace sync ${r.status}`);lastSent=body;
}
function schedule(raw){clearTimeout(timer);timer=setTimeout(()=>push(raw).catch(e=>console.error('Invoice Learning sync failed',e)),450)}
Storage.prototype.setItem=function(k,v){nativeSet.call(this,k,v);if(this===localStorage&&k===KEY&&!internal)schedule(v)};

export const invoiceLearningServerSyncReady=(async()=>{
  try{
    const local=parse(localStorage.getItem(KEY));
    const r=await fetch(API,{headers:{Authorization:`Bearer ${token()}`}});
    if(!r.ok)throw new Error(`workspace load ${r.status}`);
    const payload=await r.json();const merged=merge(payload?.state,local);const raw=JSON.stringify(merged);
    internal=true;nativeSet.call(localStorage,KEY,raw);internal=false;
    await push(raw);
    window.__MWS_INVOICE_LEARNING_CENTRAL_SYNC__={ok:true,documents:merged.documents.length,profiles:Object.keys(merged.profiles).length};
  }catch(error){
    console.error('Invoice Learning central sync unavailable; local cache remains active.',error);
    window.__MWS_INVOICE_LEARNING_CENTRAL_SYNC__={ok:false,error:String(error?.message||error)};
  }
})();

invoiceLearningServerSyncReady.catch(error=>console.error('Invoice Learning startup sync failed',error));
