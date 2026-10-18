import React,{useEffect,useState} from 'react';
const labels={OPEN_SHIFT:'Ανοιχτή βάρδια',FISCAL_REQUEST:'Εκκρεμές/αβέβαιο φορολογικό αίτημα',ACTIVE_OPERATOR:'Ενεργή σύνδεση χειριστή',ACTIVE_CONNECTOR:'Συνδεδεμένος connector',INCONSISTENT_SCOPE:'Ασυμφωνία εταιρείας/καταστήματος',UNREVIEWED_TABLE:'Πίνακας που χρειάζεται έλεγχο',DEPENDENCY_REVIEW_REQUIRED:'Έλεγχος έμμεσων εξαρτήσεων',RECOVERY_VERIFICATION_REQUIRED:'Επιβεβαίωση ανάκτησης από backup',OFFLINE_QUEUES_REQUIRE_DEVICE_CHECK:'Έλεγχος τοπικών ουρών στα PC'};
export default function StoreLifecyclePanel({company,store,request,onClose}){
 const [mode,setMode]=useState('RESET'),[preview,setPreview]=useState(null),[error,setError]=useState(''),[loading,setLoading]=useState(false),[reload,setReload]=useState(0);
 useEffect(()=>{
  let current=true;setPreview(null);setError('');setLoading(true);
  request(`/api/platform/companies/${encodeURIComponent(company.id)}/stores/${encodeURIComponent(store.id)}/lifecycle/preview?mode=${mode}`).then(result=>{
   if(!current)return;if(result.store?.id!==store.id||result.store?.companyId!==company.id||result.mode!==mode)throw Error('Η απάντηση δεν αντιστοιχεί στο επιλεγμένο κατάστημα.');setPreview(result);
  }).catch(e=>{if(current)setError(e.message||'Η απογραφή απέτυχε.')}).finally(()=>{if(current)setLoading(false)});
  return()=>{current=false};
 },[company.id,store.id,mode,reload,request]);
 return <div className="platform-modal"><section className="platform-security-dialog" style={{maxHeight:'90vh',overflow:'auto'}} role="dialog" aria-modal="true" aria-label="Εκκαθάριση και διαγραφή καταστήματος" onKeyDown={e=>{if(e.key==='Escape'){e.stopPropagation();onClose()}}}>
  <button autoFocus type="button" className="modal-close" onClick={onClose} aria-label="Κλείσιμο">×</button><h2>Εκκαθάριση / Διαγραφή καταστήματος</h2><p><b>{company.name} · {store.name}</b></p>
  <p>Προεπισκόπηση προετοιμασίας — δεν διαγράφει δεδομένα. Η τελική εκτέλεση δεν έχει ενεργοποιηθεί.</p>
  <label>Ενέργεια<select value={mode} onChange={e=>setMode(e.target.value)}><option value="RESET">Εκκαθάριση για νέα έναρξη</option><option value="DELETE">Οριστική διαγραφή καταστήματος</option></select></label>
  <p>{mode==='RESET'?'Απογραφή κινήσεων, ταμείων, καταλόγου καταστήματος και προσωπικού προς εκκαθάριση. Διατηρούνται η ταυτότητα και οι ρυθμίσεις εγκατάστασης.':'Απογραφή δεδομένων του επιλεγμένου καταστήματος για οριστική διαγραφή, μαζί με την εγκατάστασή του.'}</p>
  <button type="button" disabled={loading} onClick={()=>setReload(n=>n+1)}>Ανανέωση απογραφής</button>{loading&&<p role="status">Έλεγχος δεδομένων…</p>}{error&&<p role="alert">{error}</p>}
  {preview&&<><p>Έλεγχος: {new Date(preview.checkedAt).toLocaleString('el-GR')} · Τα πλήθη δεν περιλαμβάνουν όλες τις έμμεσες εγγραφές.</p>
   <h3>Άμεσες εγγραφές καταστήματος</h3><div style={{maxHeight:'35vh',overflow:'auto'}}><table><thead><tr><th>Πίνακας</th><th>Εγγραφές</th><th>Προτεινόμενο αποτέλεσμα</th></tr></thead><tbody>{preview.inventory.map(row=><tr key={row.table}><td>{row.table}</td><td>{row.count}</td><td>{row.action==='KEEP'?'Διατήρηση':row.action==='REMOVE'?'Αφαίρεση':'Χρειάζεται έλεγχο'}</td></tr>)}</tbody></table></div>
   <h3>Πριν επιτραπεί η εκτέλεση</h3><ul>{preview.blockers.map((row,i)=><li key={i}>{labels[row.code]||row.code}{row.table?` · ${row.table}`:''}{row.count?` (${row.count})`:''}</li>)}</ul>
   <h3>Κοινά δεδομένα που προστατεύονται</h3><ul>{preview.preservedShared.map(text=><li key={text}>{text}</li>)}</ul>
   {preview.indirect.length>0&&<details><summary>Δηλωμένες έμμεσες εξαρτήσεις ({preview.indirect.length})</summary><ul>{preview.indirect.map((row,i)=><li key={i}>{row.table} → {row.parent}</li>)}</ul></details>}{preview.limitations.map(text=><p key={text}>{text}</p>)}
  </>}
 </section></div>;
}
