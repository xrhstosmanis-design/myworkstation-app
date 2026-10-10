const canonical=value=>JSON.stringify(value,(_key,item)=>item&&typeof item==="object"&&!Array.isArray(item)?Object.fromEntries(Object.keys(item).sort().map(key=>[key,item[key]])):item);
const storedValue=value=>{try{return canonical(JSON.parse(value))}catch{return value}};

// These unverified claims identify a client view only. They never grant access;
// every request still uses the current token and the existing server guards.
function tokenIdentity(token){
  try{
    const part=token.split(".")[1],encoded=part.replace(/-/g,"+").replace(/_/g,"/");
    const bytes=Uint8Array.from(atob(encoded.padEnd(Math.ceil(encoded.length/4)*4,"=")),c=>c.charCodeAt(0));
    const p=JSON.parse(new TextDecoder().decode(bytes));
    if(p.tokenType!=="BACKOFFICE_USER"||!p.id||!p.sessionId||!p.companyId) return token;
    // Renewal preserves identity/scope, but changes iat/exp/signature and may
    // explicitly add mustChangePassword:false to an older support token.
    return canonical([p.tokenType,p.id,p.sessionId,p.sessionVersion??null,p.companyId,p.role,p.platformRole||p.role,Boolean(p.isSuperAdmin),Boolean(p.mustChangePassword),p.supportContext?{companyId:p.supportContext.companyId,storeId:p.supportContext.storeId||null,destination:p.supportContext.destination||"ALL"}:null]);
  }catch{return token}
}

export function readBackofficeContext(storage){
  const token=storage.getItem("token");
  return {token,key:canonical([tokenIdentity(token),storedValue(storage.getItem("user")),storedValue(storage.getItem("supportContext"))])};
}

const blocked=()=>Object.assign(new Error("Η προηγούμενη προβολή Backoffice δεν είναι πλέον ενεργή."),{code:"BACKOFFICE_SESSION_CHANGED"});

export function createBackofficeSessionBoundary({readContext,request,onInvalidated=()=>{},isCurrent=()=>true}){
  const initial=readContext();
  let reason=null;
  const invalidate=next=>{if(!reason){reason=next;if(isCurrent())onInvalidated(next)}return false};
  const check=()=>{
    if(!isCurrent()||reason)return false;
    try{return readContext().key===initial.key||invalidate("context-changed")}catch{return invalidate("context-unavailable")}
  };
  const assertCurrent=()=>{if(!check())throw blocked()};
  return {
    check,
    request:async(path,options={})=>{
      assertCurrent();
      const sentToken=readContext().token;
      try{
        const result=await request(path,options);
        assertCurrent();
        return result;
      }catch(error){
        assertCurrent();
        // A late rejection for a pre-renewal token must not suspend the new
        // credential. Nor should an explicit Authorization override do so.
        const override=Object.keys(options.headers||{}).some(k=>k.toLowerCase()==="authorization");
        if(error.status===401&&!override&&readContext().token===sentToken)invalidate("unauthorized");
        throw error;
      }
    }
  };
}

export function watchBackofficeContext(boundary,win,doc){
  const check=()=>boundary.check();
  const storage=event=>{if(event.key===null||["token","user","supportContext"].includes(event.key))check()};
  win.addEventListener("storage",storage);
  win.addEventListener("focus",check);
  win.addEventListener("pageshow",check);
  doc.addEventListener("visibilitychange",check);
  check();
  return ()=>{
    win.removeEventListener("storage",storage);
    win.removeEventListener("focus",check);
    win.removeEventListener("pageshow",check);
    doc.removeEventListener("visibilitychange",check);
  };
}
