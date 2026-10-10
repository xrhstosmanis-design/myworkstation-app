import {n40ObservedStore,N40_VISIBLE_TRACE_EVENT} from "../../../shared/n40-read-trace.mjs";
const LAB_COMPANY="cmtpopbgk000prhb5qc60zxus";
export function installN40VisibleReadTrace(){
  let host,list,count,records=[];
  const render=()=>{count.textContent="Νο40 · LAB GET trace ("+records.length+"/80)";list.textContent=records.map(r=>JSON.stringify(r)).join("\n\n")||"Δεν υπάρχουν καταγραφές στην τρέχουσα παρτίδα."};
  const create=()=>{
    host=document.createElement("details");host.setAttribute("data-n40-visible-trace","");host.style.cssText="position:fixed;bottom:8px;left:8px;z-index:2147482000;max-width:calc(100vw - 32px);width:680px;background:white;border:1px solid #94a3b8;border-radius:8px;padding:8px;color:#0f172a;box-shadow:0 2px 12px #0002";
    count=document.createElement("summary");count.style.cursor="pointer";host.append(count);
    const explanation=document.createElement("p");explanation.textContent="Μόνο ασφαλή στοιχεία ήδη εκτελεσμένων GET του LAB. Η αντιστοίχιση με τον server απαιτεί το ίδιο traceId. Χωρίς δεδομένα αποκρίσεων ή διαπιστευτήρια. Η μνήμη καθαρίζει με ανανέωση.";
    const clear=document.createElement("button");clear.type="button";clear.textContent="Νο40 · Καθαρισμός τοπικής παρτίδας";clear.onclick=()=>{records=[];render()};
    list=document.createElement("pre");list.setAttribute("aria-label","Νο40 ασφαλείς καταγραφές GET");list.style.cssText="max-height:230px;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere;font-size:11px";
    host.append(explanation,clear,list);document.body.append(host);
  };
  const receive=event=>{
    const r=event.detail;
    if(!n40ObservedStore(r?.expectedStoreId)||r.expectedCompanyId!==LAB_COMPANY||r.side!=="client"||r.method!=="GET"||!/^n40-[a-f0-9]{32}$/.test(r.traceId)||!/^\/api\/(?:[a-z0-9-]+|:value)(?:\/(?:[a-z0-9-]+|:value))*$/.test(r.route))return;
    // Explicit projection: even unexpected extra event fields cannot enter the UI.
    const clean={traceId:r.traceId,route:r.route,method:"GET",expectedCompanyId:LAB_COMPANY,expectedStoreId:r.expectedStoreId,companyIds:Array.isArray(r.companyIds)?r.companyIds.filter(x=>/^[a-zA-Z0-9_-]{3,80}$/.test(x)).slice(0,8):[],storeIds:Array.isArray(r.storeIds)?r.storeIds.filter(x=>/^[a-zA-Z0-9_-]{3,80}$/.test(x)).slice(0,8):[],companyMatches:r.companyMatches===null?null:r.companyMatches===true,storeMatches:r.storeMatches===null?null:r.storeMatches===true,status:Number.isInteger(r.status)&&r.status>=100&&r.status<=599?r.status:null,side:"client",observedAt:/^\d{4}-\d{2}-\d{2}T[0-9:.]+Z$/.test(r.observedAt)?r.observedAt:null};
    records=[...records,clean].slice(-80);if(!host)create();render();
  };
  window.addEventListener(N40_VISIBLE_TRACE_EVENT,receive);
  return ()=>{window.removeEventListener(N40_VISIBLE_TRACE_EVENT,receive);host?.remove()};
}
