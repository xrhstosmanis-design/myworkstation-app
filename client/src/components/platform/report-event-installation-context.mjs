const retainedKey='myworkstation.reportInstaller.centralSession.v1';
const invalidatedValue='!invalidated';
const profiles=new Set(['BASE','CAPTURE','CAPTURE_REPORTS_ONLY','CAPTURE_REPORTS_ONLY_V2','CAPTURE_REPORTS_ONLY_V3','REPORTS_ONLY_V3_TO_V4']);
const denied=(message,code='REPORT_INSTALLER_SESSION_REQUIRED')=>Object.assign(new Error(message),{status:403,code});
function claims(token){
 if(typeof token!=='string'||token!==token.trim()||token.split('.').length!==3)return null;
 try{
  const payload=String(token||'').split('.')[1].replace(/-/g,'+').replace(/_/g,'/');
  const bytes=Uint8Array.from(atob(payload.padEnd(Math.ceil(payload.length/4)*4,'=')),character=>character.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
 }catch{return null;}
}
const native=value=>value?.tokenType==='BACKOFFICE_USER'&&typeof value.id==='string'&&value.id&&typeof value.sessionId==='string'&&value.sessionId&&Number.isSafeInteger(value.sessionVersion)&&value.sessionVersion>=0&&['OWNER','SUPER_ADMIN'].includes(value.role)&&(value.isSuperAdmin===true||value.platformRole==='SUPER_ADMIN')&&value.mustChangePassword!==true;
const identity=value=>JSON.stringify([value.id,value.sessionId,value.sessionVersion]);
const live=(value,now)=>Number.isFinite(value?.exp)&&value.exp*1000>now;

// Credentials are already issued by the ordinary login. Claims select a
// credential only. The installer still verifies its signature and live session.
export function createReportInstallerSession({storage,sessions,now=Date.now}){
 let invalidated=false,observedIdentity=null,epoch=0;
 function observe(value){if(value!==observedIdentity){observedIdentity=value;epoch++;}return JSON.stringify([value,epoch]);}
 function retain(token){invalidated=false;try{sessions?.setItem(retainedKey,token);}catch{/* Current native requests can still proceed when tab storage is unavailable. */}}
 function invalidate(){
  invalidated=true;observe(null);
  try{if(sessions?.getItem(retainedKey)||sessions?.getItem('platformToken'))sessions.setItem(retainedKey,invalidatedValue);}catch{}
 }
 function context(){
  const current=storage?.getItem('token'),currentClaims=claims(current);
  if(!native(currentClaims)||!live(currentClaims,now())){
   invalidate();
   throw denied('Η εγκατάσταση απαιτεί ενεργή προσωπική συνεδρία Platform Super Admin.');
  }
  if(!currentClaims.supportContext){
   retain(current);
   return {token:current,key:observe(identity(currentClaims)),expiresAt:currentClaims.exp*1000};
  }
  const retained=sessions?.getItem(retainedKey);
  const candidates=invalidated||retained===invalidatedValue?[]:[retained,sessions?.getItem('platformToken')];
  for(const token of candidates){
   const central=claims(token);
   if(native(central)&&!central.supportContext&&identity(central)===identity(currentClaims)&&live(central,now())){
    retain(token);
    return {token,key:observe(identity(central)),expiresAt:central.exp*1000};
   }
  }
  invalidate();
  throw denied('Δεν υπάρχει διατηρημένη κεντρική συνεδρία για αυτή την καρτέλα. Χρειάζεται κανονική επιστροφή στο Platform Super Admin.');
 }
 function capture(){try{return context().key;}catch{return null;}}
 function assertCurrent(bound){
  let current;
  try{current=context();}catch{throw denied('Η συνεδρία άλλαξε. Επανέλαβε τον προέλεγχο εγκατάστασης.','REPORT_INSTALLER_CONTEXT_CHANGED');}
  if(current.key!==bound.key||bound.expiresAt<=now())throw denied('Η συνεδρία άλλαξε. Το προηγούμενο πακέτο εγκατάστασης ακυρώθηκε.','REPORT_INSTALLER_CONTEXT_CHANGED');
 }
 function bind(request,base,bound=context()){
  if(!/^\/api\/platform\/companies\/[^/?#]+\/stores\/[^/?#]+\/report-event-installation$/.test(base))throw denied('Μη έγκυρη διαδρομή εγκατάστασης.','REPORT_INSTALLER_REQUEST_REJECTED');
  return async(path,options={})=>{
   const method=options.method||'GET';
   const describe=path.startsWith(base+'/describe?profile=')&&profiles.has(path.slice((base+'/describe?profile=').length))&&method==='GET';
   if(!describe&&!(method==='POST'&&[base+'/inspect',base+'/install'].includes(path)))throw denied('Μη επιτρεπόμενη κεντρική αίτηση.','REPORT_INSTALLER_REQUEST_REJECTED');
   assertCurrent(bound);
   let result;
   try{result=await request(path,{...options,headers:{...options.headers,Authorization:`Bearer ${bound.token}`}});}
   catch(error){assertCurrent(bound);throw error;}
   assertCurrent(bound);
   return result;
  };
 }
 function watch(onChanged,win,doc){
  let previous=capture();
  const check=()=>{const next=capture();if(next!==previous){previous=next;onChanged();}};
  win.addEventListener('storage',check);win.addEventListener('focus',check);win.addEventListener('pageshow',check);doc.addEventListener('visibilitychange',check);
  const timer=win.setInterval(check,500);
  return ()=>{win.removeEventListener('storage',check);win.removeEventListener('focus',check);win.removeEventListener('pageshow',check);doc.removeEventListener('visibilitychange',check);win.clearInterval(timer);};
 }
 return {capture,context,assertCurrent,bind,watch};
}
