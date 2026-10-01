import React,{useEffect,useRef,useState} from 'react';
import {loadPendingSources,sourceLabels} from './pending-sources.mjs';

export default function PendingSourcesPanel({api,stores,storeId,modules,onOpenSource}){
  const [result,setResult]=useState({rows:[],warnings:[]});
  const [busy,setBusy]=useState(false),[source,setSource]=useState('ALL'),[priority,setPriority]=useState('ALL');
  const sequence=useRef(0);
  const storeKey=JSON.stringify(stores.map(s=>[s.id,s.name])),moduleKey=JSON.stringify(modules);
  const load=async()=>{const current=++sequence.current;setBusy(true);setResult({rows:[],warnings:[]});try{const data=await loadPendingSources({api,stores,storeId,modules});if(current===sequence.current)setResult(data)}catch(error){if(current===sequence.current)setResult({rows:[],warnings:[error.message||'Αποτυχία φόρτωσης']})}finally{if(current===sequence.current)setBusy(false)}};
  useEffect(()=>{load();return()=>{sequence.current++}},[api,storeKey,storeId,moduleKey]);
  const rows=result.rows.filter(row=>(source==='ALL'||row.source===source)&&(priority==='ALL'||row.priority===priority));
  return <section className="pending-sources">
    <div className="pending-sources-head"><div><h3>Τιμολόγια, πληρωμές και απόθεμα</h3><p>Στοιχεία για έλεγχο στις αντίστοιχες οθόνες. Υψηλή προτεραιότητα: απόκλιση πληρωμής ή αρνητικό απόθεμα.</p></div><button type="button" onClick={load} disabled={busy}>Ανανέωση πηγών</button></div>
    <div className="pending-center-filters"><label>Πηγή<select value={source} onChange={e=>setSource(e.target.value)}><option value="ALL">Όλες οι πηγές</option>{Object.entries(sourceLabels).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label><label>Προτεραιότητα<select value={priority} onChange={e=>setPriority(e.target.value)}><option value="ALL">Όλες</option><option value="HIGH">Υψηλή</option><option value="NORMAL">Κανονική</option></select></label><strong>{busy?'Φόρτωση…':`${rows.length} εμφανίζονται${result.warnings.length?' · μερική εικόνα':''}`}</strong></div>
    {result.warnings.map((warning,i)=><div className="pending-source-warning" role="alert" key={i}>{warning}</div>)}
    <div className="pending-center-list">{rows.map(row=><article key={row.id} className={row.priority==='HIGH'?'pending-high':''}><div><b>{row.storeName} · {sourceLabels[row.source]} · {row.priority==='HIGH'?'Υψηλή':'Κανονική'}</b><p>{row.title}</p><small>{row.detail}</small><small>Αναγνωριστικό: {row.sourceId}</small></div><button type="button" onClick={()=>onOpenSource(row)}>Άνοιγμα πηγής</button></article>)}</div>
    {!busy&&!rows.length&&<div className="pending-center-empty">{result.warnings.length?'Δεν εμφανίζονται στοιχεία στα φίλτρα. Οι προειδοποιήσεις χρειάζονται έλεγχο.':'Δεν υπάρχουν πρόσθετες εκκρεμότητες στα επιλεγμένα φίλτρα.'}</div>}
  </section>;
}
