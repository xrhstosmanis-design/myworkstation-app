import React,{useRef,useState} from 'react';
import {walletMoney} from '../voice/ai-wallet-money.mjs';

export default function AiWalletCommercialWaiver({companyId,entries=[],more=false,busy,api,onWaive}){
 const [selected,setSelected]=useState([]),[reason,setReason]=useState(''),[preview,setPreview]=useState(null),[confirmed,setConfirmed]=useState(false),[loading,setLoading]=useState(false),[error,setError]=useState(''),[submitted,setSubmitted]=useState(null);
 const inFlight=useRef(false),epoch=useRef(0),submission=useRef(null);
 const eligible=entries.filter(e=>e.kind==='USAGE'&&e.status==='REVIEW'&&e.storeId&&String(e.chargedMicros)==='0');
 const invalidate=()=>{epoch.current++;setPreview(null);setConfirmed(false);setError('')};
 const choose=id=>{invalidate();setSelected(old=>old.includes(id)?old.filter(v=>v!==id):[...old,id])};
 const rows=eligible.filter(e=>selected.includes(e.id)),stores=new Set(rows.map(e=>e.storeId)),disabled=busy||loading||Boolean(submitted);
 const showPreview=async()=>{
  if(inFlight.current||busy||!selected.length||stores.size!==1)return;
  inFlight.current=true;setLoading(true);setError('');const current=++epoch.current;
  try{const value=await api(`/api/ai-wallet/platform/companies/${encodeURIComponent(companyId)}/commercial-waivers/preview`,{method:'POST',body:JSON.stringify({storeId:rows[0].storeId,entryIds:selected})});
   if(current===epoch.current){if(value.companyId!==companyId||value.storeId!==rows[0].storeId)throw Error('Η επιλογή άλλαξε.');setPreview(value);setConfirmed(false)}
  }catch(e){if(current===epoch.current)setError(e.message)}finally{inFlight.current=false;setLoading(false)}
 };
 const submit=()=>{
  if(busy||inFlight.current||!preview||!confirmed||reason.trim().length<5)return;
  const body=submission.current||{storeId:preview.storeId,entryIds:preview.entryIds,version:preview.version,generation:preview.generation,fingerprint:preview.fingerprint,requestId:crypto.randomUUID(),reason:reason.trim(),customerWaiverConfirmed:true};
  submission.current=body;
  setSubmitted(body);onWaive(body);
 };
 return <section aria-label="Εμπορική απαλλαγή δεσμεύσεων AI">
  <h2>Απαλλαγή πελάτη από δεσμεύσεις AI</h2>
  <p>Το MyWorkStation αναλαμβάνει το άγνωστο κόστος παρόχου. Απελευθερώνεται μόνο η επιλεγμένη δέσμευση, χωρίς νέα πίστωση ή επιστροφή σε κάρτα. Το αρχικό ιστορικό διατηρείται.</p>
  {!eligible.length?<p>Δεν υπάρχουν διαθέσιμες εκκρεμείς κινήσεις για απαλλαγή.</p>:<>
   <p>Επίλεξε συγκεκριμένες κινήσεις ενός καταστήματος. Εμφανίζονται έως 100 παλαιότερες εκκρεμείς δεσμεύσεις, ανεξάρτητα από το πρόσφατο ιστορικό.</p>
   {more&&<p>Υπάρχουν και νεότερες εκκρεμείς κινήσεις πέρα από αυτό το όριο. Δεν επιλέγονται ούτε απαλλάσσονται αυτόματα.</p>}
   <ul>{eligible.map(e=><li key={e.id}><label><input type="checkbox" checked={selected.includes(e.id)} disabled={disabled} onChange={()=>choose(e.id)}/>{new Date(e.createdAt).toLocaleString('el-GR',{timeZone:'Europe/Athens',hour12:false})} · {e.storeName||e.storeId} · {walletMoney(e.reservedMicros)} · {e.id}</label></li>)}</ul>
   {stores.size>1&&<p role="alert">Επίλεξε κινήσεις μόνο ενός καταστήματος.</p>}
   <label>Αιτιολογία απαλλαγής <input value={reason} minLength={5} maxLength={300} disabled={disabled} onChange={e=>{invalidate();setReason(e.target.value)}}/></label>
   <button type="button" disabled={disabled||!selected.length||stores.size!==1||reason.trim().length<5} onClick={showPreview}>Προεπισκόπηση απαλλαγής</button>
  </>}
  {error&&<p role="alert">{error}</p>}
  {preview&&<div role="status"><p>{preview.entryIds.length} επιλεγμένες κινήσεις · Αποδέσμευση {walletMoney(preview.releasedMicros)} · Χρέωση πελάτη 0,00 €. Το κόστος παρόχου παραμένει άγνωστο.</p>
   <label><input type="checkbox" checked={confirmed} disabled={disabled} onChange={e=>setConfirmed(e.target.checked)}/>Εγκρίνω την απαλλαγή με κόστος του MyWorkStation.</label>
   <button type="button" disabled={busy||loading||!confirmed} onClick={submit}>{submitted?'Επανάληψη ίδιας καταχώρισης':'Καταχώριση απαλλαγής'}</button>
   {submitted&&<p>Αν το αποτέλεσμα είναι αβέβαιο, έλεγξε πρώτα το υπόλοιπο και το ιστορικό. Η ίδια καταχώριση δεν αποδεσμεύει δεύτερη φορά.</p>}
  </div>}
 </section>;
}
