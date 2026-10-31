import React,{useEffect,useRef,useState} from 'react';
import {staffProfiles,staffPermissionSections,changeStaffCapability} from '../../../shared/backoffice-staff.mjs';
import './backoffice-staff.css';
const OperatorManagementPanel=React.lazy(()=>import('./commerce/OperatorManagementPanel.jsx'));
export default function BackofficeStaffAdmin({api}){
  const [area,setArea]=useState('BACKOFFICE'),[posStoreId,setPosStoreId]=useState('');
  const [data,setData]=useState(null),[edit,setEdit]=useState(null),[grants,setGrants]=useState([]),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
  const sequence=useRef(0),saving=useRef(false);
  const load=async()=>{const id=++sequence.current;setData(null);try{const d=await api('/api/backoffice-staff/admin');if(id===sequence.current)setData(d)}catch(e){if(id===sequence.current)setError(e.message)}};
  useEffect(()=>{load();return()=>{sequence.current++}},[api]);
  const open=account=>{setEdit(account||{id:null,active:true});setGrants((account?.grants||[]).map(({storeId,profile,capabilities})=>({storeId,profile,capabilities})));setError('');setMessage('')};
  const toggleStore=(storeId,on)=>setGrants(rows=>on?[...rows,{storeId,profile:'STOCKTAKER',capabilities:[]}]:rows.filter(r=>r.storeId!==storeId));
  const changeProfile=(storeId,profile)=>setGrants(rows=>rows.map(r=>r.storeId===storeId?{...r,profile}:r));
  const applyProfile=storeId=>setGrants(rows=>rows.map(r=>r.storeId===storeId?{...r,capabilities:[...staffProfiles[r.profile].capabilities]}:r));
  const toggleCapability=(storeId,cap,on)=>setGrants(rows=>rows.map(r=>{
    if(r.storeId!==storeId)return r;
    return {...r,capabilities:changeStaffCapability(r.capabilities,cap,on)};
  }));
  const save=async e=>{
    e.preventDefault();if(saving.current)return;saving.current=true;setBusy(true);setError('');setMessage('');
    const form=e.currentTarget,f=new FormData(form),password=String(f.get('password')||''),pin=String(f.get('pin')||'');
    const body=edit.id?{expectedRevision:edit.revision,active:f.get('active')==='on',grants,...(password?{password}:{}),...(pin?{pin}:{})}:{username:f.get('username'),fullName:f.get('fullName'),...(password?{password}:{}),pin,grants};
    try{
      await api(edit.id?`/api/backoffice-staff/admin/accounts/${encodeURIComponent(edit.id)}`:'/api/backoffice-staff/admin/accounts',{method:edit.id?'PUT':'POST',body:JSON.stringify(body)});
      form.reset();setEdit(null);setGrants([]);setMessage('Αποθηκεύτηκε. Κάθε αλλαγή δικαιωμάτων απαιτεί νέα προσωπική σύνδεση.');await load();
    }catch(e){setError((e.message||'Δεν επιβεβαιώθηκε η αποθήκευση.')+' Ανανέωσε τη λίστα πριν επαναλάβεις.');setEdit(null);setGrants([]);await load()}
    finally{saving.current=false;setBusy(false)}
  };
  return <section className="panel staff-panel"><h2>Χειριστές και δικαιώματα</h2><p>Δημιούργησε χειριστή, επίλεξε τα καταστήματά του και όρισε ξεχωριστά τι βλέπει και τι κάνει σε καθένα.</p>
    <nav className="staff-actions" aria-label="Τύπος πρόσβασης χειριστή"><button type="button" aria-pressed={area==='BACKOFFICE'} onClick={()=>setArea('BACKOFFICE')}>Πρόσβαση BackOffice</button><button type="button" aria-pressed={area==='POS'} onClick={()=>setArea('POS')}>Χειριστές POS</button></nav>
    {area==='POS'&&<section aria-label="Δικαιώματα χειριστών POS"><label>Κατάστημα POS<select value={posStoreId} onChange={e=>setPosStoreId(e.target.value)}><option value="">Επίλεξε κατάστημα</option>{data?.stores.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>{posStoreId&&data?.stores.some(s=>s.id===posStoreId)&&<React.Suspense fallback={<p role="status">Φόρτωση χειριστών…</p>}><OperatorManagementPanel key={posStoreId} api={api} store={data.stores.find(s=>s.id===posStoreId)} onClose={()=>setPosStoreId('')}/></React.Suspense>}</section>}
    <div hidden={area!=='BACKOFFICE'}>
    <p>Ο ρόλος περιγράφει τη θέση του χειριστή. Τα επιλεγμένα δικαιώματα ορίζουν την πρόσβασή του. Η αλλαγή ρόλου δεν αλλάζει αυτόματα τα δικαιώματα.</p>
    {error&&<p role="alert">{error}</p>}{message&&<p role="status">{message}</p>}
    <div className="staff-actions"><button type="button" disabled={busy} onClick={()=>{setEdit(null);load()}}>Ανανέωση λίστας</button><button type="button" disabled={busy||!data} onClick={()=>open(null)}>Νέος χειριστής</button></div>
    {data&&<><ul className="staff-accounts">{data.accounts.map(a=><li key={a.id}><b>{a.fullName}</b> · {a.username} · {a.active?'Ενεργός':'Ανενεργός'}<span>{a.grants.length} καταστήματα</span><button type="button" disabled={busy} onClick={()=>open(a)}>Δικαιώματα / Απενεργοποίηση</button></li>)}</ul>{!data.accounts.length&&<p>Δεν έχουν δημιουργηθεί προσωπικές προσβάσεις.</p>}</>}
    {edit&&data&&<form key={edit.id||'new'} onSubmit={save} autoComplete="off"><h3>{edit.id?`${edit.fullName} · ${edit.username}`:'Νέος λογαριασμός'}</h3>
      {!edit.id&&<><label>Ονοματεπώνυμο<input name="fullName" required minLength={2} maxLength={180}/></label><label>Username<input name="username" required pattern="[a-zA-Z0-9][a-zA-Z0-9._-]{2,79}" minLength={3} maxLength={80} autoComplete="off"/></label></>}
      <label>{edit.id?'Νέος κωδικός (προαιρετικά)':'Προσωπικός κωδικός (προαιρετικά)'}<input name="password" type="password" autoComplete="new-password" minLength={10} maxLength={100}/></label>
      <label>{edit.id?'Νέο PIN (προαιρετικά)':'Προσωπικό PIN, 4–12 ψηφία'}<input name="pin" type="password" inputMode="numeric" autoComplete="new-password" required={!edit.id} pattern="[0-9]{4,12}"/></label>
      {!edit.id&&<p>Για απλή είσοδο αρκούν το username και το PIN. Ο ξεχωριστός κωδικός είναι προαιρετικός.</p>}
      {edit.id&&<label className="staff-check"><input name="active" type="checkbox" defaultChecked={edit.active}/>Ενεργός λογαριασμός</label>}
      <fieldset><legend>Καταστήματα και δικαιώματα</legend><p>Επίλεξε κατάστημα και τα δικαιώματα που θέλεις να δώσεις. Κατάστημα χωρίς επιλεγμένα δικαιώματα δεν επιτρέπει λειτουργίες.</p>{data.stores.map(s=>{
        const grant=grants.find(g=>g.storeId===s.id);
        return <div key={s.id} className="staff-grant"><label className="staff-check"><input type="checkbox" checked={Boolean(grant)} onChange={e=>toggleStore(s.id,e.target.checked)}/>{s.name}</label>{grant&&<><div className="staff-role-row"><label>Ρόλος<select value={grant.profile} onChange={e=>changeProfile(s.id,e.target.value)}>{Object.entries(staffProfiles).map(([key,p])=><option key={key} value={key}>{p.label}</option>)}</select></label><button type="button" onClick={()=>applyProfile(s.id)}>Εφαρμογή προτεινόμενων δικαιωμάτων ρόλου</button></div><div className="staff-permission-matrix">{staffPermissionSections.map(section=><fieldset key={section.key}><legend>{section.label}</legend>{section.actions.map(action=><label key={action.key} className="staff-check"><input type="checkbox" aria-label={`${s.name}: ${section.label} — ${action.label}`} checked={grant.capabilities.includes(action.key)} onChange={e=>toggleCapability(s.id,action.key,e.target.checked)}/><span><b>{action.label}</b><small>{action.description}</small></span></label>)}</fieldset>)}</div><p className="staff-permission-summary">{grant.capabilities.length?`${grant.capabilities.length} επιλεγμένα δικαιώματα`:'Καμία λειτουργία επιλεγμένη'}</p></>}
        </div>;
      })}</fieldset><div className="staff-actions"><button disabled={busy}>{busy?'Αποθήκευση…':'Αποθήκευση πρόσβασης'}</button><button type="button" disabled={busy} onClick={()=>setEdit(null)}>Ακύρωση</button></div>
    </form>}
    </div></section>;
}
