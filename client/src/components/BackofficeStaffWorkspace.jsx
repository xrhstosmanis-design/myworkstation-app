import React,{useEffect,useRef,useState} from 'react';
import {greeceDateInput} from '../../../shared/greece-time.mjs';
import {staffProfiles} from '../../../shared/backoffice-staff.mjs';
import './backoffice-staff.css';
export default function BackofficeStaffWorkspace({api,user,onLogout}){
  const [identity,setIdentity]=useState(null),[storeId,setStoreId]=useState(''),[view,setView]=useState(''),[data,setData]=useState(null),[detail,setDetail]=useState(null),[query,setQuery]=useState(''),[from,setFrom]=useState(()=>greeceDateInput(new Date())),[to,setTo]=useState(()=>greeceDateInput(new Date())),[error,setError]=useState(''),[busy,setBusy]=useState(false),[pending,setPending]=useState(null);
  const sequence=useRef(0),scope=useRef(''),sending=useRef(false);scope.current=JSON.stringify([storeId,view,from,to]);
  const selected=identity?.stores.find(s=>s.id===storeId),capabilities=selected?.capabilities||[];
  useEffect(()=>{let live=true;api('/api/backoffice-staff/me').then(d=>{if(live)setIdentity(d)}).catch(e=>{if(live)setError(e.message)});return()=>{live=false;sequence.current++}},[api]);
  useEffect(()=>{sequence.current++;setData(null);setDetail(null);setError('');setQuery('');setBusy(false)},[storeId,view,from,to]);
  const scoped=(path,options={})=>api(path,{...options,headers:{...options.headers,'x-backoffice-store-id':storeId}});
  const load=async()=>{
    if(!storeId||!view||sending.current)return;const n=++sequence.current,own=scope.current;setBusy(true);setError('');setData(null);setDetail(null);
    try{const result=await scoped(view==='inventory'?`/api/backoffice-staff/inventory/stores/${encodeURIComponent(storeId)}/stocktakes`:`/api/backoffice-staff/cash/stores/${encodeURIComponent(storeId)}?${new URLSearchParams({from,to})}`);if(n!==sequence.current||own!==scope.current)return;if(result.storeId!==storeId)throw Error('Δεν επιβεβαιώθηκε το κατάστημα.');setData(result)}catch(e){if(n===sequence.current&&own===scope.current)setError(e.message)}finally{if(n===sequence.current&&own===scope.current)setBusy(false)}
  };
  const open=async stocktakeId=>{
    const n=++sequence.current,own=scope.current;setBusy(true);setError('');setDetail(null);
    try{const result=await scoped(`/api/backoffice-staff/inventory/stores/${encodeURIComponent(storeId)}/stocktakes/${encodeURIComponent(stocktakeId)}`);if(n!==sequence.current||own!==scope.current)return;if(result.storeId!==storeId||result.id!==stocktakeId)throw Error('Δεν επιβεβαιώθηκε η απογραφή.');setDetail(result)}catch(e){if(n===sequence.current&&own===scope.current)setError(e.message)}finally{if(n===sequence.current&&own===scope.current)setBusy(false)}
  };
  const count=async request=>{
    if(sending.current)return;sending.current=true;setBusy(true);setError('');setPending(request);
    const own=scope.current,n=++sequence.current;
    try{
      const result=await scoped(`/api/inventory-v2/stocktakes/${encodeURIComponent(request.stocktakeId)}/count`,{method:'POST',body:JSON.stringify(request.body)});
      if(n!==sequence.current||own!==scope.current)return;
      if(result.ok!==true&&result.replayed!==true)throw Error('Δεν επιβεβαιώθηκε η καταμέτρηση.');
      setPending(null);sending.current=false;await open(request.stocktakeId);
    }catch(e){if(n===sequence.current&&own===scope.current)setError((e.message||'Δεν επιβεβαιώθηκε η καταμέτρηση.')+' Χρησιμοποίησε «Επαλήθευση ίδιας καταχώρισης» πριν νέα μέτρηση.')}finally{sending.current=false;if(own===scope.current)setBusy(false)}
  };
  const rows=(detail?.lines||[]).filter(l=>!query||[l.name,l.sku,...(l.barcodes||[])].some(v=>String(v||'').toLocaleLowerCase('el-GR').includes(query.toLocaleLowerCase('el-GR'))));
  return <div className="staff-workspace"><header><div><h1>Προσωπικό BackOffice</h1><p>{identity?.fullName||user.fullName} · {identity?.username||user.username}</p></div><button type="button" disabled={busy||Boolean(pending)} onClick={onLogout}>Έξοδος</button></header>
    <section className="panel staff-panel"><label>Κατάστημα<select aria-label="Κατάστημα" value={storeId} disabled={busy||Boolean(pending)} onChange={e=>{sequence.current++;setData(null);setDetail(null);setView('');setStoreId(e.target.value)}}><option value="">Επίλεξε κατάστημα</option>{identity?.stores.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
      {identity&&!identity.stores.length&&<p>Δεν υπάρχει ενεργή ανάθεση καταστήματος. Επικοινώνησε με τον ιδιοκτήτη.</p>}
      {selected&&<><h2>{selected.name}</h2><p>{staffProfiles[selected.profile]?.label||'Προσωπική πρόσβαση'}</p><div className="staff-actions">{capabilities.includes('inventory.read')&&<button type="button" disabled={busy||Boolean(pending)} onClick={()=>setView('inventory')}>Απογραφή</button>}{capabilities.includes('cash.read')&&<button type="button" disabled={busy||Boolean(pending)} onClick={()=>setView('cash')}>Έλεγχος ταμείων</button>}</div></>}
      {view==='cash'&&<div className="staff-actions"><label>Από<input type="date" value={from} disabled={busy||Boolean(pending)} onChange={e=>setFrom(e.target.value)}/></label><label>Έως<input type="date" value={to} disabled={busy||Boolean(pending)} onChange={e=>setTo(e.target.value)}/></label></div>}
      {view&&<button type="button" disabled={busy||Boolean(pending)} onClick={load}>Φόρτωση / Ανανέωση</button>}{busy&&<p role="status">Φόρτωση…</p>}{error&&<p role="alert">{error}</p>}
      {pending&&<button type="button" disabled={busy} onClick={()=>count(pending)}>Επαλήθευση ίδιας καταχώρισης</button>}
      {view==='cash'&&data&&<><p>Προβολή αναφοράς — οι εκκρεμότητες παραμένουν όπως έχουν καταγραφεί.</p><pre className="staff-report">{data.text}</pre><button type="button" onClick={()=>navigator.clipboard.writeText(data.text)}>Αντιγραφή αναφοράς</button></>}
      {view==='inventory'&&data&&!detail&&<><p>Καταμέτρηση σε υπάρχουσα ανοιχτή απογραφή. Η οριστικοποίηση γίνεται από τον ιδιοκτήτη.</p><ul>{data.stocktakes.map(s=><li key={s.id}><button type="button" disabled={busy} onClick={()=>open(s.id)}>{s.name}</button></li>)}</ul>{!data.stocktakes.length&&<p>Δεν υπάρχουν ανοιχτές απογραφές στο κατάστημα.</p>}</>}
      {view==='inventory'&&detail&&<><h3>{detail.name}</h3><label>Είδος / Barcode<input value={query} disabled={Boolean(pending)} onChange={e=>setQuery(e.target.value)}/></label><p>{rows.length} είδη</p><div className="staff-lines">{rows.slice(0,100).map(l=><form key={l.id+':'+l.countVersion} onSubmit={e=>{e.preventDefault();const quantity=String(new FormData(e.currentTarget).get('quantity')||'').replace(',','.');if(!/^[0-9]{1,9}(?:\.[0-9]{1,4})?$/.test(quantity))return setError('Συμπλήρωσε έγκυρη μη αρνητική ποσότητα.');count({stocktakeId:detail.id,body:{lineId:l.id,quantity,expectedVersion:l.countVersion,clientEventId:crypto.randomUUID(),source:'BACKOFFICE'}})}}><b>{l.name}</b><small>{l.sku} · {l.barcodes?.[0]||'Χωρίς barcode'}</small><label>Μετρημένη ποσότητα<input name="quantity" aria-label={`Ποσότητα ${l.name}`} defaultValue={l.countedQuantity??''} inputMode="decimal" required disabled={busy||Boolean(pending)||!capabilities.includes('inventory.count')}/></label>{capabilities.includes('inventory.count')&&<button disabled={busy||Boolean(pending)}>Καταχώρηση μέτρησης</button>}</form>)}</div>{rows.length>100&&<p>Εμφανίζονται τα πρώτα 100 είδη. Περιόρισε την αναζήτηση.</p>}</>}
    </section></div>;
}
