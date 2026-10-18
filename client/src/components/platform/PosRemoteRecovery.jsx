import React,{useEffect,useRef,useState} from 'react';
import './pos-remote-recovery.css';
const money=n=>Number(n).toLocaleString('el-GR',{style:'currency',currency:'EUR'});
export default function PosRemoteRecovery({companyId,storeId,request}){
 const [rows,setRows]=useState([]),[error,setError]=useState(''),[message,setMessage]=useState(''),[selected,setSelected]=useState(null),[printed,setPrinted]=useState(false),[reason,setReason]=useState(''),[busy,setBusy]=useState(false),[loading,setLoading]=useState(false),[checked,setChecked]=useState(false),[truncated,setTruncated]=useState(false);
 const alive=useRef(true),lock=useRef(false),generation=useRef(0);
 const base=`/api/platform/device-operations/companies/${encodeURIComponent(companyId)}/stores/${encodeURIComponent(storeId)}/pos-recovery`;
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;generation.current++}},[]);
 const load=async()=>{
  const epoch=++generation.current;setLoading(true);setError('');setSelected(null);setPrinted(false);setReason('');
  try{const result=await request(base);if(!alive.current||epoch!==generation.current)return;if(result.companyId!==companyId||result.storeId!==storeId)throw Error('Η απάντηση δεν ανήκει στο επιλεγμένο κατάστημα.');setRows(result.requests||[]);setChecked(true);setTruncated(Boolean(result.truncated))}catch(e){if(alive.current&&epoch===generation.current){setError(e.message);setRows([])}}finally{if(alive.current&&epoch===generation.current)setLoading(false)}
 };
 const recover=async event=>{
  event.preventDefault();if(lock.current||!selected||!printed||reason.trim().length<5)return;
  lock.current=true;setBusy(true);setError('');setMessage('');const epoch=generation.current;
  try{
   const result=await request(`${base}/${encodeURIComponent(selected.id)}`,{method:'POST',body:JSON.stringify({preview:selected.preview,receiptPrinted:true,reason:reason.trim()})});
   if(!alive.current||epoch!==generation.current)return;
   if(result.companyId!==companyId||result.storeId!==storeId||!result.saleId)throw Error('Μη αναμενόμενη απάντηση. Ανανέωσε για έλεγχο της ίδιας συναλλαγής.');
   setMessage('Η πώληση καταχωρίστηκε. Το POS θα ενημερωθεί αυτόματα· αν χρειαστεί, πάτησε Ανανέωση στο POS.');await load();
  }catch(e){if(alive.current&&epoch===generation.current){setSelected(null);setRows([]);setError(`${e.message} Ανανέωσε τη λίστα πριν από νέα προσπάθεια.`)}}finally{lock.current=false;if(alive.current)setBusy(false)}
 };
 return <section className="pos-remote-recovery" aria-label="Ανάκτηση εκκρεμούς συναλλαγής">
  <h3>Ανάκτηση εκκρεμούς συναλλαγής</h3>
  <p>Ολοκλήρωση καταχώρισης ήδη εκδομένης απόδειξης. Δεν εκδίδει νέα απόδειξη και δεν χρεώνει κάρτα.</p>
  <button type="button" disabled={busy||loading} onClick={load}>{loading?'Έλεγχος…':'Έλεγχος εκκρεμοτήτων POS'}</button>
  {error&&<p role="alert">{error}</p>}{message&&<p role="status">{message}</p>}
  {checked&&!loading&&!error&&rows.length===0&&<p>Δεν υπάρχουν εκκρεμείς συναλλαγές.</p>}{truncated&&<p>Εμφανίζονται οι πρώτες 100 εκκρεμότητες.</p>}
  {rows.map(row=><article key={row.id}><div><b>{row.terminalPos} · {money(row.total)} · {row.paymentMethod==='CASH'?'Μετρητά':'Κάρτα'}</b><small>{new Date(row.createdAt).toLocaleString('el-GR',{timeZone:'Europe/Athens',hour12:false})} · {row.status} · {row.id.slice(0,8)}</small><span>{row.items.map(x=>`${x.quantity} × ${x.name}`).join(' · ')}</span>{row.blocker&&<span>{row.blocker}</span>}</div><button type="button" disabled={busy||Boolean(row.blocker)} onClick={()=>{setSelected(row);setPrinted(false);setReason('');setError('');setMessage('')}}>Έλεγχος / Ανάκτηση</button></article>)}
  {selected&&<form onSubmit={recover}><h4>{selected.terminalPos} · {money(selected.total)}</h4><p>Έλεγξε τη συγκεκριμένη απόδειξη με το κατάστημα πριν συνεχίσεις.{selected.paymentMethod==='CARD'?' Η έγκριση κάρτας έχει ήδη επιβεβαιωθεί από τον αρχικό χειριστή.':''}</p><label><input type="checkbox" checked={printed} disabled={busy} onChange={e=>setPrinted(e.target.checked)}/>Επιβεβαιώνω ότι αυτή η απόδειξη έχει ήδη εκδοθεί.</label><label>Αιτιολογία<textarea required minLength={5} maxLength={500} disabled={busy} value={reason} onChange={e=>setReason(e.target.value)}/></label><button disabled={busy||!printed||reason.trim().length<5}>{busy?'Καταχώριση…':'Ολοκλήρωση υπάρχουσας συναλλαγής'}</button><button type="button" disabled={busy} onClick={()=>setSelected(null)}>Κλείσιμο</button></form>}
 </section>;
}
