import {readBackofficeContext} from "../../utils/backofficeSessionBoundary.mjs";
const denied=(message,code="PLATFORM_ASSISTANT_SESSION_REQUIRED")=>Object.assign(new Error(message),{status:403,code});
const claims=token=>{try{const part=String(token||"").split(".")[1].replace(/-/g,"+").replace(/_/g,"/"),bytes=Uint8Array.from(atob(part.padEnd(Math.ceil(part.length/4)*4,"=")),c=>c.charCodeAt(0));return JSON.parse(new TextDecoder().decode(bytes))}catch{return null}};
const native=p=>p?.tokenType==="BACKOFFICE_USER"&&p.id&&p.sessionId&&["OWNER","SUPER_ADMIN"].includes(p.role)&&(p.isSuperAdmin===true||p.platformRole==="SUPER_ADMIN")&&!p.mustChangePassword;
const identity=p=>JSON.stringify([p.id,p.sessionId,p.sessionVersion??null,p.companyId,p.role,p.platformRole,Boolean(p.isSuperAdmin),Boolean(p.mustChangePassword),p.supportContext||null]);
const live=(p,now)=>Number.isFinite(p?.exp)&&p.exp*1000>now;
export function readPlatformAssistantContext(storage,sessions,{now=Date.now()}={}){
 const current=storage.getItem("token"),p=claims(current);
 if(!native(p))throw denied("Η κεντρική ερώτηση απαιτεί συνεδρία Super Admin. Ο Ιδιοκτήτης χρησιμοποιεί τον Βοηθό Ιδιοκτήτη στα αδειοδοτημένα δικά του καταστήματα.","PLATFORM_ASSISTANT_ROLE_REQUIRED");
 let token=current,central=p;
 if(p.supportContext){
  token=sessions.getItem("platformToken");central=claims(token);
  if(!native(central)||central.supportContext||central.id!==p.id||central.sessionId!==p.sessionId||central.sessionVersion!==p.sessionVersion)
   throw denied("Βρίσκεσαι σε προβολή υποστήριξης. Πάτησε «Επιστροφή στο Super Admin» και ολοκλήρωσε την κανονική σύνδεση.");
 }
 if(!live(central,now))throw denied("Η κεντρική συνεδρία έληξε. Χρειάζεται κανονική επανασύνδεση Super Admin.");
 // Client claims select an already issued credential, never authorize access.
 // The server still verifies signature, real DB SUPER_ADMIN/session and scope.
 return {token,key:JSON.stringify([identity(p),identity(central)])};
}
export async function requestPlatformAssistant(request,path,options,storage,sessions){
 if(path!=="/api/platform/ai-command-center/ask")throw denied("Μη επιτρεπόμενη κεντρική αίτηση.","PLATFORM_ASSISTANT_REQUEST_REJECTED");
 return requestBoundAssistant(request,path,options,storage,sessions);
}
export async function requestPlatformAssistantExport(request,path,options,storage,sessions){
 if(path!=="/api/platform/ai-command-center/export"||options?.method!=="POST")throw denied("Μη επιτρεπόμενη εξαγωγή αναφοράς.","PLATFORM_ASSISTANT_REQUEST_REJECTED");
 return requestBoundAssistant(request,path,options,storage,sessions);
}
export async function requestPlatformAssistantStatus(request,path,options,storage,sessions){
 if(!/^\/api\/platform\/ai-command-center\/status(?:\?[^#]*)?$/.test(path)||(options?.method||"GET")!=="GET")throw denied("Μη επιτρεπόμενος έλεγχος βοηθού.","PLATFORM_ASSISTANT_REQUEST_REJECTED");
 return requestBoundAssistant(request,path,options,storage,sessions);
}
async function requestBoundAssistant(request,path,options,storage,sessions){
 const before=readPlatformAssistantContext(storage,sessions);
 const assertCurrent=()=>{
  let current;try{current=readPlatformAssistantContext(storage,sessions)}catch{throw denied("Η συνεδρία άλλαξε. Ζήτησε ξανά την αναφορά.","PLATFORM_ASSISTANT_CONTEXT_CHANGED")}
  if(current.key!==before.key)throw denied("Η συνεδρία άλλαξε. Η προηγούμενη απάντηση απορρίφθηκε.","PLATFORM_ASSISTANT_CONTEXT_CHANGED");
 };
 let result;try{result=await request(path,{...options,headers:{...options?.headers,Authorization:`Bearer ${before.token}`}})}catch(error){assertCurrent();throw error}
 assertCurrent();
 return result;
}
export function watchPlatformAssistantContext(storage,sessions,win,doc,onChanged){
 const sample=()=>{
  let valid;try{valid=readPlatformAssistantContext(storage,sessions).key}catch(error){valid=error.code}
  const central=readBackofficeContext({getItem:key=>key==="token"?sessions.getItem("platformToken"):null}).key;
  return JSON.stringify([readBackofficeContext(storage).key,central,valid]);
 };
 let previous=sample();
 const check=()=>{const next=sample();if(next!==previous){previous=next;onChanged()}};
 win.addEventListener("storage",check);win.addEventListener("focus",check);win.addEventListener("pageshow",check);doc.addEventListener("visibilitychange",check);
 const timer=win.setInterval(check,800);
 return ()=>{win.clearInterval(timer);win.removeEventListener("storage",check);win.removeEventListener("focus",check);win.removeEventListener("pageshow",check);doc.removeEventListener("visibilitychange",check)};
}
