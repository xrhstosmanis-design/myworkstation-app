import React,{useEffect,useState} from "react";
import {FileSpreadsheet,RefreshCw,Search} from "lucide-react";

const money=v=>Number(v||0).toLocaleString("el-GR",{style:"currency",currency:"EUR"});
const date=v=>v?new Date(v).toLocaleDateString("el-GR"):"—";
const readBase64=file=>new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result||"").split(",").pop()||"");r.onerror=()=>reject(new Error("Δεν διαβάστηκε το αρχείο."));r.readAsDataURL(file)});

export default function BankPaymentImportPanel({api}){
  const [stores,setStores]=useState([]),[storeId,setStoreId]=useState(""),[file,setFile]=useState(null),[data,setData]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState("");
  useEffect(()=>{api("/api/stores").then(rows=>{setStores(rows||[]);if(rows?.[0])setStoreId(rows[0].id)}).catch(e=>setError(e.message))},[]);
  const preview=async()=>{if(!file||!storeId)return;setBusy(true);setError("");setData(null);try{const dataBase64=await readBase64(file);setData(await api("/api/owner-payments/preview-bank",{method:"POST",body:JSON.stringify({storeId,filename:file.name,dataBase64})}))}catch(e){setError(e.message)}finally{setBusy(false)}};
  return <section className="commerce-box" style={{marginTop:18}}>
    <div className="supplier-section-title"><div><h4><FileSpreadsheet/> Εισαγωγή αρχείου τράπεζας</h4><p style={{margin:"4px 0 0",color:"#64748b"}}>Excel / CSV → τραπεζική κίνηση → προτεινόμενος προμηθευτής → προτεινόμενο ανεξόφλητο τιμολόγιο. Προεπισκόπηση μόνο.</p></div>{data&&<button type="button" onClick={preview} disabled={busy}><RefreshCw/>Ανανέωση preview</button>}</div>
    <div className="commerce-form" style={{gridTemplateColumns:"1fr 1fr auto",alignItems:"end"}}>
      <label>Κατάστημα<select value={storeId} onChange={e=>setStoreId(e.target.value)}><option value="">Επιλογή</option>{stores.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
      <label>Αρχείο Excel / CSV<input type="file" accept=".xlsx,.xls,.csv" onChange={e=>{setFile(e.target.files?.[0]||null);setData(null)}}/></label>
      <button type="button" onClick={preview} disabled={!file||!storeId||busy}><Search/>{busy?"Ανάγνωση…":"Προεπισκόπηση"}</button>
    </div>
    {error&&<div className="commerce-error">{error}</div>}
    {data&&<><div className="commerce-notice" style={{marginTop:10}}><b>{data.message}</b><br/>Βρέθηκαν {data.count} κινήσεις · {data.matched} πλήρεις προτάσεις · {data.pending} σε εκκρεμότητα.</div>
      <div className="supplier-table" style={{marginTop:10,overflowX:"auto"}}><div className="supplier-row head" style={{gridTemplateColumns:"120px 110px 220px 220px 170px 220px 130px"}}><span>Ημερομηνία</span><span>Ποσό</span><span>Δικαιούχος / Αιτιολογία</span><span>Προτεινόμενος προμηθευτής</span><span>Τιμολόγιο</span><span>Reference / IBAN</span><span>Κατάσταση</span></div>{data.rows.map((r,i)=><div className="supplier-row" key={`${r.reference}-${i}`} style={{gridTemplateColumns:"120px 110px 220px 220px 170px 220px 130px"}}><span>{date(r.date)}</span><b>{money(r.amount)}</b><span><b>{r.beneficiary||"—"}</b><small>{r.description||""}</small></span><span>{r.supplier?<><b>{r.supplier.name}</b><small>{r.supplier.reasons?.join(" + ")||"matching"}</small></>:"—"}</span><span>{r.invoice?<><b>{r.invoice.documentNumber||"Χωρίς αριθμό"}</b><small>{money(r.invoice.totalGross)} · {date(r.invoice.documentDate)}</small></>:"—"}</span><span><b>{r.reference||"—"}</b><small>{r.iban||""}</small></span><span className={r.status==="MATCHED"?"pill":""}>{r.status==="MATCHED"?"ΠΡΟΤΑΣΗ":"ΕΚΚΡΕΜΟΤΗΤΑ"}</span></div>)}</div>
      <div className="commerce-notice">Δεν έχει γίνει καμία τελική καταχώριση. Η επιβεβαίωση πληρωμής θα ενεργοποιηθεί μόνο μετά το πραγματικό test του preview.</div></>}
  </section>;
}
