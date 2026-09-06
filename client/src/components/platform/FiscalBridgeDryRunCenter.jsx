import React,{useEffect,useMemo,useState} from "react";
import {CheckCircle2,RefreshCw,ShieldCheck,X} from "lucide-react";

const money=value=>Number(value||0).toLocaleString("el-GR",{style:"currency",currency:"EUR"});
const when=value=>value?new Date(value).toLocaleString("el-GR",{timeZone:"Europe/Athens"}):"—";

async function api(path,options={}){
  const token=localStorage.getItem("token"),response=await fetch(path,{...options,headers:{"Content-Type":"application/json",...(token?{Authorization:`Bearer ${token}`}:{})}}),text=await response.text();
  const data=text?JSON.parse(text):{};if(!response.ok)throw new Error(data.error||`Σφάλμα ${response.status}`);return data;
}

export default function FiscalBridgeDryRunCenter({companies,onClose}){
  const stores=useMemo(()=>companies.flatMap(company=>(company.stores||[]).filter(store=>store.active!==false).map(store=>({...store,companyName:company.name}))),[companies]);
  const [storeId,setStoreId]=useState(stores[0]?.id||"");
  const [status,setStatus]=useState(null),[candidates,setCandidates]=useState([]),[runs,setRuns]=useState([]),[saleId,setSaleId]=useState("");
  const [busy,setBusy]=useState(false),[error,setError]=useState(""),[message,setMessage]=useState("");
  const selected=candidates.find(row=>row.id===saleId);
  const lockedSafe=Boolean(status?.enabled&&status?.mode==="DRY_RUN"&&status?.externalExecution===false&&status?.fiscalIssuance===false&&status?.capDriverWrite===false&&status?.rbsWrite===false);

  const load=async()=>{setBusy(true);setError("");setMessage("");try{
    const nextStatus=await api("/api/connector-observer/fiscal-bridge/test-status");setStatus(nextStatus);
    if(!storeId){setCandidates([]);setRuns([]);return}
    const [nextCandidates,nextRuns]=await Promise.all([api(`/api/connector-observer/stores/${storeId}/fiscal-bridge/candidates`),api(`/api/connector-observer/stores/${storeId}/fiscal-bridge/dry-runs`)]);
    setCandidates(nextCandidates.rows||[]);setRuns(nextRuns.rows||[]);setSaleId(current=>(nextCandidates.rows||[]).some(row=>row.id===current)?current:nextCandidates.rows?.[0]?.id||"");
  }catch(err){setError(err.message)}finally{setBusy(false)}};
  useEffect(()=>{load()},[storeId]);
  const execute=async()=>{if(!lockedSafe||!selected)return;setBusy(true);setError("");setMessage("");try{
    const result=await api(`/api/connector-observer/stores/${storeId}/fiscal-bridge/dry-runs`,{method:"POST",body:JSON.stringify({saleId:selected.id,terminalPos:selected.terminalPos,confirmNoFiscalExecution:true})});
    if(result.externalExecution!==false||result.fiscalIssuance!==false||result.capDriverWrite!==false||result.rbsWrite!==false)throw new Error("Η απάντηση δεν επιβεβαίωσε πλήρη απομόνωση. Ο έλεγχος σταμάτησε.");
    const nextRuns=await api(`/api/connector-observer/stores/${storeId}/fiscal-bridge/dry-runs`);setRuns(nextRuns.rows||[]);setMessage(result.idempotentReplay?"Επιβεβαιώθηκε το ίδιο DRY RUN χωρίς δεύτερη εγγραφή.":"Το DRY RUN καταχωρίστηκε χωρίς εντολή σε RBS/CapDriver και χωρίς απόδειξη.");
  }catch(err){setError(err.message)}finally{setBusy(false)}};

  return <div className="platform-modal fiscal-dry-run-overlay"><section className="fiscal-dry-run-dialog" role="dialog" aria-modal="true" aria-label="Fiscal Bridge DRY RUN">
    <button className="fiscal-dry-run-close" onClick={onClose} aria-label="Κλείσιμο"><X/></button>
    <header><ShieldCheck/><div><small>PLATFORM SUPER ADMIN · HOME PC</small><h2>Fiscal Bridge DRY RUN</h2><p>Έλεγχος payload και αντιστοίχισης. Δεν εκδίδει απόδειξη και δεν επικοινωνεί με RBS ή CapDriver.</p></div></header>
    <div className={`fiscal-safety-lock ${lockedSafe?"safe":"blocked"}`}><strong>{lockedSafe?"ΑΣΦΑΛΕΣ ΚΛΕΙΔΩΜΑ ΕΝΕΡΓΟ":"Η ΕΚΤΕΛΕΣΗ ΕΙΝΑΙ ΚΛΕΙΔΩΜΕΝΗ"}</strong><span>DRY RUN: {status?.mode||"—"}</span><span>RBS write: {status?.rbsWrite===false?"ΟΧΙ":"—"}</span><span>CapDriver write: {status?.capDriverWrite===false?"ΟΧΙ":"—"}</span><span>Έκδοση απόδειξης: {status?.fiscalIssuance===false?"ΟΧΙ":"—"}</span></div>
    {error&&<div className="platform-alert error">{error}</div>}{message&&<div className="platform-alert success">{message}</div>}
    <div className="fiscal-dry-run-controls"><label>Κατάστημα<select value={storeId} onChange={event=>setStoreId(event.target.value)}>{stores.map(store=><option value={store.id} key={store.id}>{store.companyName} · {store.name}</option>)}</select></label><button onClick={load} disabled={busy}><RefreshCw/>Ανανέωση</button></div>
    <section className="fiscal-dry-run-panel"><h3>Επιλέξιμη NON_FISCAL πώληση</h3>{!candidates.length?<p>Δεν βρέθηκε ολοκληρωμένη μη φορολογική πώληση με καταγεγραμμένο POS/RBS mapping.</p>:<><select value={saleId} onChange={event=>setSaleId(event.target.value)}>{candidates.map(row=><option value={row.id} key={row.id}>{when(row.occurredAt)} · {row.terminalPos} → {row.fiscalDeviceCode} · {money(row.total)}</option>)}</select>{selected&&<div className="fiscal-selection"><span>Πώληση: <b>{selected.id}</b></span><span>Διαδρομή: <b>{selected.terminalPos} → {selected.fiscalDeviceCode}</b></span><span>Πληρωμή: <b>{selected.eftposDeviceCode||"Μετρητά / χωρίς EFTPOS"}</b></span></div>}</>}
      <button className="fiscal-dry-run-execute" onClick={execute} disabled={busy||!lockedSafe||!selected}><ShieldCheck/>{busy?"Έλεγχος…":"Εκτέλεση ασφαλούς DRY RUN"}</button>
    </section>
    <section className="fiscal-dry-run-panel"><h3>Τελευταία αποτελέσματα</h3>{!runs.length?<p>Δεν υπάρχει ακόμη καταχωρισμένο DRY RUN.</p>:<div className="fiscal-run-list">{runs.slice(0,10).map(run=><article key={run.id}><CheckCircle2/><div><b>{run.status} · {run.terminalPos} → {run.fiscalDeviceCode}</b><small>{when(run.createdAt)} · {run.idempotencyKey}</small><code>{run.payloadHash}</code></div><strong>{run.externalExecution===false?"ΧΩΡΙΣ ΕΚΤΕΛΕΣΗ":"ΜΠΛΟΚΑΡΙΣΜΑ"}</strong></article>)}</div>}</section>
  </section></div>;
}
