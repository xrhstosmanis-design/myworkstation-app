import React,{useEffect,useMemo,useRef,useState} from "react";
import {createBackofficeSessionBoundary,readBackofficeContext,watchBackofficeContext} from "../../utils/backofficeSessionBoundary.mjs";

const PURPOSE="MONTHLY_INVENTORY_CAPTURE",MAX=9223372036854775807n;
const text=value=>typeof value==="string"&&value.length>0&&new TextEncoder().encode(value).length<=160&&value.trim()===value&&!/[\u0000-\u001f\u007f]/.test(value);
const integer=(value,positive=false)=>typeof value==="string"&&value.length<=19&&/^(0|[1-9][0-9]*)$/.test(value)&&BigInt(value)<=MAX&&(!positive||BigInt(value)>0n);
const stamp=value=>typeof value==="string"&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString()===value.slice(0,23)+"Z";
const keys=(value,expected)=>{if(!value||typeof value!=="object"||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value)))return false;const fields=Object.getOwnPropertyDescriptors(value);return Reflect.ownKeys(fields).length===expected.length&&expected.every(key=>Object.hasOwn(fields,key)&&Object.hasOwn(fields[key],"value"))};
const unavailable=new Set(["MONTHLY_CAPTURE_SCHEMA_UNAVAILABLE","MONTHLY_CAPTURE_SCHEMA_CHANGED","MONTHLY_CAPTURE_SCHEMA_REQUIRED","MONTHLY_CAPTURE_ENROLLMENT_REQUIRED","MONTHLY_SNAPSHOT_SCHEMA_UNAVAILABLE","MONTHLY_SNAPSHOT_SCHEMA_CHANGED"]);
const grantKeys=["id","companyId","storeId","purpose","purposeVersion","lifecycleGeneration","revision","active","delegatorUserId","delegatorSessionVersion","activationId","firstIssueMonth","createdByUserId","grantedByUserId","revokedByUserId","updatedByUserId","firstScheduledFor","createdAt","grantedAt","revokedAt","updatedAt"];
const invalid=()=>{throw Object.assign(new Error("Η απάντηση δεν αντιστοιχεί στην ενεργή προβολή."),{code:"MONTHLY_CAPTURE_RESPONSE_INVALID"})};

function personalContext(){
 try{
  const context=readBackofficeContext(localStorage),part=context.token.split(".")[1],encoded=part.replace(/-/g,"+").replace(/_/g,"/");
  const claims=JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(encoded.padEnd(Math.ceil(encoded.length/4)*4,"=")),c=>c.charCodeAt(0))));
  // Unverified browser claims identify this view only; the server authorizes every request.
  if(claims.tokenType!=="BACKOFFICE_USER"||!text(claims.id)||!text(claims.sessionId)||!text(claims.companyId))return{key:context.key,companyId:null};
  return{key:context.key,companyId:claims.companyId};
 }catch{return{key:null,companyId:null}}
}
function grantView(value,scope){
 if(!keys(value,grantKeys)||value.companyId!==scope.companyId||value.storeId!==scope.storeId||value.lifecycleGeneration!==scope.lifecycleGeneration||value.purpose!==PURPOSE||value.purposeVersion!==1||!text(value.id)||!integer(value.revision,true)||typeof value.active!=="boolean")invalid();
 for(const key of ["delegatorUserId","createdByUserId","updatedByUserId"])if(!text(value[key]))invalid();
 if(!Number.isInteger(value.delegatorSessionVersion)||value.delegatorSessionVersion<0||value.delegatorSessionVersion>2147483647)invalid();
 for(const key of ["activationId","grantedByUserId","revokedByUserId"])if(value[key]!==null&&!text(value[key]))invalid();
 for(const key of ["createdAt","updatedAt"])if(!stamp(value[key]))invalid();
 for(const key of ["firstScheduledFor","grantedAt","revokedAt"])if(value[key]!==null&&!stamp(value[key]))invalid();
 if(value.createdAt>value.updatedAt||(value.revokedAt===null)!==(value.revokedByUserId===null)||value.active&&value.revokedAt!==null)invalid();
 if(value.activationId===null){if(value.active||["firstIssueMonth","firstScheduledFor","grantedByUserId","grantedAt"].some(key=>value[key]!==null))invalid()}
 else if(typeof value.firstIssueMonth!=="string"||!/^\d{4}-(0[1-9]|1[0-2])$/.test(value.firstIssueMonth)||!stamp(value.firstScheduledFor)||!stamp(value.grantedAt)||!text(value.grantedByUserId))invalid();
 // Keep only fields used by this screen; never render actor/session internals.
 return{id:value.id,companyId:value.companyId,storeId:value.storeId,lifecycleGeneration:value.lifecycleGeneration,revision:value.revision,active:value.active,firstScheduledFor:value.firstScheduledFor,revokedAt:value.revokedAt};
}
function readView(value,view){
 if(!keys(value,["status","companyId","storeId","lifecycleGeneration","purpose","grant"])||value.status!=="READ"||value.companyId!==view.companyId||value.storeId!==view.storeId||value.purpose!==PURPOSE||!integer(value.lifecycleGeneration))invalid();
 const scope={companyId:value.companyId,storeId:value.storeId,lifecycleGeneration:value.lifecycleGeneration};
 return{...scope,grant:value.grant===null?null:grantView(value.grant,scope)};
}
function mutationView(value,action,data){
 const statuses={"create-inactive":["CREATED_INACTIVE","ALREADY_EXISTS"],enable:["ENABLED","ALREADY_ENABLED"],revoke:["REVOKED","ALREADY_REVOKED"]};
 if(!keys(value,["status","grant"])||!statuses[action]?.includes(value.status))invalid();
 const grant=grantView(value.grant,data);
 if(action!=="create-inactive"&&grant.id!==data.grant.id)invalid();
 if(value.status==="CREATED_INACTIVE"&&(grant.active||grant.revokedAt!==null)||action==="enable"&&!grant.active||action==="revoke"&&(grant.active||grant.revokedAt===null))invalid();
 return{...data,grant};
}
const initial=()=>({data:null,busy:false,ack:false,error:"",notice:"",unavailable:false});
const date=value=>new Intl.DateTimeFormat("el-GR",{timeZone:"Europe/Athens",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).format(new Date(value));

export default function MonthlyInventoryCapturePanel({api,storeId="",storeName=""}){
 const context=personalContext(),current=useRef(null),[,refresh]=useState(0),[state,setState]=useState({view:null,...initial()});
 const publish=(view,patch)=>{if(current.current!==view||!view.mounted)return;view.snapshot={...view.snapshot,...patch};setState({view,...view.snapshot})};
 const makeBoundary=view=>{
  view.stopWatch?.();
  view.boundary=createBackofficeSessionBoundary({readContext:()=>readBackofficeContext(localStorage),request:view.api,isCurrent:()=>current.current===view&&view.mounted,onInvalidated:()=>{
   view.invalid=true;view.serial++;view.controller?.abort();
   if(current.current===view&&view.mounted)refresh(value=>value+1);
  }});
  if(view.mounted)view.stopWatch=watchBackofficeContext(view.boundary,window,document);
 };
 const view=useMemo(()=>({api,storeId,companyId:context.companyId,contextKey:context.key,snapshot:initial(),serial:0,busy:false,mounted:false,invalid:false,controller:null,boundary:null,stopWatch:null}),[api,storeId,context.key,context.companyId]);
 current.current=view;
 useEffect(()=>{
  view.mounted=true;
  if(view.contextKey&&view.companyId&&typeof view.api==="function")makeBoundary(view);
  return()=>{view.mounted=false;view.serial++;view.controller?.abort();view.stopWatch?.()};
 },[view]);
 const shown=state.view===view&&!view.invalid?state:initial(),data=shown.data;
 const perform=async action=>{
  if(current.current!==view||!view.mounted||view.busy||!text(view.storeId)||!view.companyId||typeof view.api!=="function")return;
  if(personalContext().key!==view.contextKey){view.boundary?.check();view.invalid=true;refresh(value=>value+1);return}
  if(action==="read"&&view.invalid){view.invalid=false;makeBoundary(view)}
  if(!view.boundary?.check())return;
  const previous=view.snapshot.data;
  if(action!=="read"&&(!previous||view.invalid))return;
  if(action==="create-inactive"&&previous.grant!==null)return;
  if(action==="enable"&&(!previous.grant||previous.grant.active||view.snapshot.ack!==true))return;
  if(action==="revoke"&&(!previous.grant||!previous.grant.active))return;
  view.busy=true;const serial=++view.serial;view.controller=new AbortController();
  publish(view,{busy:true,ack:false,error:"",notice:"",unavailable:false,...(action==="read"?{data:null}:{})});
  const valid=()=>current.current===view&&view.mounted&&serial===view.serial&&!view.invalid&&personalContext().key===view.contextKey;
  try{
   let response;
   if(action==="read")response=await view.boundary.request(`/api/monthly-inventory-capture?storeId=${encodeURIComponent(view.storeId)}`,{signal:view.controller.signal});
   else{
    const body={storeId:view.storeId,lifecycleGeneration:previous.lifecycleGeneration};
    if(action!=="create-inactive"){body.grantId=previous.grant.id;body.expectedRevision=previous.grant.revision}
    if(action==="enable")body.purpose=PURPOSE;
    response=await view.boundary.request(`/api/monthly-inventory-capture/${action}`,{method:"POST",body:JSON.stringify(body),signal:view.controller.signal});
   }
   if(!valid())return;
   const next=action==="read"?readView(response,view):mutationView(response,action,previous);
   publish(view,{data:next,notice:action==="read"?"Η κατάσταση ανανεώθηκε.":action==="create-inactive"?(response.status==="CREATED_INACTIVE"?"Δημιουργήθηκε ανενεργή εξουσιοδότηση.":"Βρέθηκε η υπάρχουσα εξουσιοδότηση."):action==="enable"?"Η προσωπική εξουσιοδότηση είναι ενεργή.":"Η προσωπική εξουσιοδότηση ανακλήθηκε."});
  }catch(error){
   if(!valid())return;
   const missing=unavailable.has(error?.code);
   publish(view,{data:null,unavailable:missing,error:missing?"Η λειτουργία δεν είναι διαθέσιμη: χρειάζεται ελεγμένη εγκατάσταση για το κατάστημα.":action==="read"?"Η κατάσταση δεν επιβεβαιώθηκε. Κάνε νέο έλεγχο.":"Το αποτέλεσμα της ενέργειας δεν επιβεβαιώθηκε. Κάνε νέο έλεγχο πριν από άλλη ενέργεια."});
  }finally{
   view.busy=false;
   if(valid())publish(view,{busy:false});
  }
 };
 const selected=text(storeId),personal=Boolean(context.companyId&&context.key),busy=shown.busy;
 return <section className="monthly-inventory-capture" aria-label="Προσωπική εξουσιοδότηση μηνιαίας απογραφής" style={{padding:18,minWidth:0,overflowWrap:"anywhere"}}>
  <style>{`.monthly-inventory-capture button{min-height:44px;padding:10px 14px;white-space:normal;max-width:100%}.monthly-inventory-capture .mic-actions{display:flex;flex-wrap:wrap;gap:10px;margin:14px 0}.monthly-inventory-capture label{display:flex;align-items:flex-start;gap:10px;margin:14px 0}.monthly-inventory-capture input[type=checkbox]{flex:none;min-width:22px;min-height:22px}.monthly-inventory-capture p{max-width:80ch}`}</style>
  <h3>Προσωπική εξουσιοδότηση μηνιαίας απογραφής</h3>
  <p>Κατάστημα: <strong>{selected?storeName||storeId:"Καμία επιλογή"}</strong></p>
  <p>Η εξουσιοδότηση αφορά μελλοντικές προγραμματισμένες παρατηρήσεις. Δεν αλλάζει απόθεμα, δεν οριστικοποιεί καταμέτρηση και δεν στέλνει email.</p>
  {!selected?<p role="status">Επίλεξε συγκεκριμένο κατάστημα από την αρχική διαχείριση.</p>:!personal?<p role="status">Απαιτείται προσωπική σύνδεση Owner ή SuperAdmin.</p>:<>
   <button type="button" disabled={busy} onClick={()=>perform("read")}>Έλεγχος κατάστασης</button>
   {view.invalid&&<p role="alert">Η προηγούμενη προβολή δεν είναι ενεργή. Κάνε νέο έλεγχο με την τρέχουσα σύνδεση.</p>}
   {busy&&<p role="status">Έλεγχος σε εξέλιξη…</p>}
   {shown.error&&<p role="alert">{shown.error}</p>}
   {shown.notice&&<p role="status">{shown.notice}</p>}
   {!data&&!shown.error&&!busy&&!view.invalid&&<p>Δεν έχει ελεγχθεί ακόμη η κατάσταση.</p>}
   {data&&<div aria-label="Τρέχουσα προσωπική εξουσιοδότηση">
    <p><strong>{!data.grant?"Δεν υπάρχει προσωπική εξουσιοδότηση.":data.grant.active?"Ενεργή προσωπική εξουσιοδότηση":data.grant.revokedAt?"Ανακλημένη προσωπική εξουσιοδότηση":"Ανενεργή προσωπική εξουσιοδότηση"}</strong></p>
    {data.grant?.firstScheduledFor&&<p>Αρχική επιλέξιμη προγραμματισμένη ώρα: <strong>{date(data.grant.firstScheduledFor)} (Ελλάδας)</strong>. Δεν είναι πρόβλεψη επόμενης εκτέλεσης.</p>}
    <p>Ενεργή εξουσιοδότηση δεν επιβεβαιώνει ότι λειτουργεί ο προγραμματιστής ή ότι έγινε πραγματική απογραφή.</p>
    <div className="mic-actions">
     {!data.grant&&<button type="button" disabled={busy} onClick={()=>perform("create-inactive")}>Δημιουργία ανενεργής εξουσιοδότησης</button>}
     {data.grant&&!data.grant.active&&<button type="button" disabled={busy||!shown.ack} onClick={()=>perform("enable")}>Ενεργοποίηση εξουσιοδότησης</button>}
     {data.grant?.active&&<button type="button" disabled={busy} onClick={()=>perform("revoke")}>Ανάκληση εξουσιοδότησης</button>}
    </div>
    {data.grant&&!data.grant.active&&<label><input type="checkbox" disabled={busy} checked={shown.ack} onChange={event=>{if(current.current===view&&!view.busy&&!view.invalid)publish(view,{ack:event.target.checked})}}/>Εγκρίνω προσωπικά τον σκοπό μηνιαίας παρατήρησης αποθήκης για το εμφανιζόμενο κατάστημα.</label>}
   </div>}
  </>}
 </section>;
}
