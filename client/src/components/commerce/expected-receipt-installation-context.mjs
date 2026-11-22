import {createReportInstallerSession} from '../platform/report-event-installation-context.mjs';
const denied=()=>Object.assign(new Error('Η κεντρική συνεδρία εγκατάστασης άλλαξε. Απαιτείται νέος έλεγχος.'),{status:403,code:'EXPECTED_RECEIPT_INSTALL_CONTEXT_CHANGED'});
function selectedIdentity(bound){
 const encoded=bound.token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/');
 const value=JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(encoded.padEnd(Math.ceil(encoded.length/4)*4,'=')),c=>c.charCodeAt(0))));
 return {actorId:value.id,sessionId:value.sessionId,sessionVersion:value.sessionVersion,expiresAt:bound.expiresAt};
}
export function sameExpectedReceiptCredential(a,b){
 const valid=value=>!!value&&typeof value.actorId==='string'&&!!value.actorId.trim()&&typeof value.sessionId==='string'&&!!value.sessionId.trim()&&Number.isSafeInteger(value.sessionVersion)&&value.sessionVersion>=0&&Number.isFinite(value.expiresAt)&&value.expiresAt>0;
 return valid(a)&&valid(b)&&['actorId','sessionId','sessionVersion','expiresAt'].every(k=>a[k]===b[k]);
}
export function createExpectedReceiptInstallationSession(options){
 const central=createReportInstallerSession(options);
 const context=()=>{const bound=central.context();return {...bound,credentialIdentity:selectedIdentity(bound)};};
 const assertCurrent=bound=>{central.assertCurrent(bound);const current=context();if(current.token!==bound.token||current.expiresAt!==bound.expiresAt||!sameExpectedReceiptCredential(current.credentialIdentity,bound.credentialIdentity))throw denied();};
 function bind(request,base,bound=context()){
  const match=/^\/api\/platform\/expected-receipt-installation\/stores\/([^/?#]+)$/.exec(base);
  if(!match)throw denied();
  let store;try{store=decodeURIComponent(match[1]);}catch{throw denied();}
  if(!store||store.length>200||store!==store.trim()||/[\u0000-\u001f\u007f/\\?#%]/.test(store)||['.','..'].includes(store)||encodeURIComponent(store)!==match[1])throw denied();
  return async(path,options={})=>{
   const method=options.method||'GET';
   if(!((method==='GET'&&[base+'/inspect',base+'/describe'].includes(path))||(method==='POST'&&path===base+'/install')))throw denied();
   assertCurrent(bound);
   const input=new Headers(options.headers),headers={};
   for(const [key,value] of input)if(key.toLowerCase()!=='authorization')headers[key==='content-type'?'Content-Type':key]=value;
   headers.Authorization=`Bearer ${bound.token}`;
   try{const result=await request(path,{...options,headers});assertCurrent(bound);return result;}
   catch(error){assertCurrent(bound);throw error;}
  };
 }
 function watch(onChanged,win,doc){
  const signature=()=>{try{const value=context();return JSON.stringify([value.key,value.expiresAt]);}catch{return null;}};
  let previous=signature();
  const check=()=>{const next=signature();if(next!==previous){previous=next;onChanged();}};
  const stopCentral=central.watch(check,win,doc);
  for(const event of ['storage','focus','pageshow'])win.addEventListener(event,check);
  doc.addEventListener('visibilitychange',check);const timer=win.setInterval(check,500);
  return()=>{stopCentral();for(const event of ['storage','focus','pageshow'])win.removeEventListener(event,check);doc.removeEventListener('visibilitychange',check);win.clearInterval(timer);};
 }
 return {capture:central.capture,context,assertCurrent,bind,watch};
}
