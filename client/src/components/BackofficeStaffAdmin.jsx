import {delegatedReadOptions,readDelegationRight} from './backoffice/StaffReadDelegation.jsx';
import {POS_MENU_PERMISSIONS,POS_PERMISSIONS} from '../../../shared/pos-operator-permissions.mjs';
import CompanyAuthorityReadiness,{companyAuthoritySupported} from './backoffice/CompanyAuthorityReadiness.jsx';
import React,{useEffect,useRef,useState} from 'react';
import {staffProfiles,staffCapabilities,staffPermissionSections,changeStaffCapability} from '../../../shared/backoffice-staff.mjs';
import './backoffice-staff.css';
import {staffCompanyCapabilities,staffCompanyPermissionSections,validStaffCompanyCapabilities,changeStaffCompanyCapability} from '../../../shared/backoffice-staff-company.mjs';
const OperatorManagementPanel=React.lazy(()=>import('./commerce/OperatorManagementPanel.jsx'));
const posPermissions=[...POS_PERMISSIONS,...POS_MENU_PERMISSIONS];
const hasPosEditor=grant=>grant.capabilities.some(key=>key==='operator-profiles.manage-permissions'||key==='operator-profiles.copy-permissions');
const viewCapabilities=staffCapabilities.filter(capability=>capability.endsWith('.read'));

function capabilitiesMatch(expected,stored){
  return Array.isArray(stored)&&expected.length===stored.length&&expected.every(capability=>stored.includes(capability));
}

function grantsMatch(expected,stored){
  return Array.isArray(stored)&&expected.length===stored.length&&expected.every(grant=>{
    const match=stored.find(row=>row.storeId===grant.storeId);
    return match?.profile===grant.profile&&capabilitiesMatch(grant.capabilities,match.capabilities)&&
      (!Object.hasOwn(grant,'posPermissionCeiling')||(grant.posPermissionCeiling===null?match.posPermissionCeiling==null:capabilitiesMatch(grant.posPermissionCeiling,match.posPermissionCeiling)))&&
      (!Object.hasOwn(grant,'backofficeReadDelegationCeiling')||capabilitiesMatch(grant.backofficeReadDelegationCeiling,match.backofficeReadDelegationCeiling));
  });
}

export default function BackofficeStaffAdmin({api}){
  const [area,setArea]=useState('BACKOFFICE'),[posStoreId,setPosStoreId]=useState('');
  const [data,setData]=useState(null),[edit,setEdit]=useState(null),[grants,setGrants]=useState([]),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
  const [companyCapabilities,setCompanyCapabilities]=useState([]);
  const canEditReadDelegationCeiling=data?.canEditBackofficeReadDelegationCeiling===true;
  const canEditPosPermissionCeiling=data?.canEditPosPermissionCeiling===true;
  const companySupported=companyAuthoritySupported(data?.companyAuthority);
  const currentApi=useRef(api),formApi=useRef(null);currentApi.current=api;
  const sequence=useRef(0),saving=useRef(false);
  const load=async()=>{
    const id=++sequence.current;
    setData(null);
    try{
      const result=await api('/api/backoffice-staff/admin');
      if(id!==sequence.current)return null;
      setData(result);
      return result;
    }catch(e){if(id===sequence.current)setError(e.message);return null}
  };
  useEffect(()=>{load();return()=>{sequence.current++}},[api]);
  const open=account=>{formApi.current=api;setCompanyCapabilities(Array.isArray(account?.companyCapabilities)?[...account.companyCapabilities]:[]);setEdit(account||{id:null,active:true});setGrants((account?.grants||[]).map(({storeId,profile,capabilities,posPermissionCeiling,backofficeReadDelegationCeiling})=>({storeId,profile,capabilities,...(canEditPosPermissionCeiling&&posPermissionCeiling!==undefined?{posPermissionCeiling}:{}),...(canEditReadDelegationCeiling&&Array.isArray(backofficeReadDelegationCeiling)?{backofficeReadDelegationCeiling}:{})})));setError('');setMessage('')};
  const toggleStore=(storeId,on)=>setGrants(rows=>on?[...rows,{storeId,profile:'STOCKTAKER',capabilities:[]}]:rows.filter(r=>r.storeId!==storeId));
  const setPosCeiling=(storeId,ceiling)=>setGrants(rows=>rows.map(row=>
    row.storeId===storeId?{...row,posPermissionCeiling:ceiling}:row));
  const changeProfile=(storeId,profile)=>setGrants(rows=>rows.map(r=>r.storeId===storeId?{...r,profile}:r));
  const applyProfile=storeId=>setGrants(rows=>rows.map(r=>r.storeId===storeId?{...r,capabilities:[...staffProfiles[r.profile].capabilities]}:r));
  const selectStoreCapabilities=(storeId,capabilities)=>setGrants(rows=>rows.map(row=>
    row.storeId===storeId?{...row,capabilities:[...capabilities]}:row));
  const toggleCapability=(storeId,cap,on)=>setGrants(rows=>rows.map(r=>{
    if(r.storeId!==storeId)return r;
    return {...r,capabilities:changeStaffCapability(r.capabilities,cap,on)};
  }));
  const save=async e=>{
    e.preventDefault();if(saving.current||formApi.current!==api||currentApi.current!==api)return;saving.current=true;setBusy(true);setError('');setMessage('');
    const form=e.currentTarget,f=new FormData(form),password=String(f.get('password')||''),pin=String(f.get('pin')||'');
    const body=edit.id?{expectedRevision:edit.revision,active:f.get('active')==='on',grants,...(password?{password}:{}),...(pin?{pin}:{})}:{username:f.get('username'),fullName:f.get('fullName'),...(password?{password}:{}),pin,grants};
    if(companySupported&&(!edit.id||validStaffCompanyCapabilities(edit.companyCapabilities)))body.companyCapabilities=[...companyCapabilities];
    try{
      const saved=await api(edit.id?`/api/backoffice-staff/admin/accounts/${encodeURIComponent(edit.id)}`:'/api/backoffice-staff/admin/accounts',{method:edit.id?'PUT':'POST',body:JSON.stringify(body)});
      if(currentApi.current!==api)return;
      form.reset();setEdit(null);setGrants([]);
      const refreshed=await load();
      const account=refreshed?.accounts.find(row=>row.id===saved?.id);
      if(account&&account.revision===saved.revision&&account.active===(body.active??true)&&grantsMatch(body.grants,account.grants)&&(!Object.hasOwn(body,'companyCapabilities')||companyAuthoritySupported(refreshed.companyAuthority)&&capabilitiesMatch(body.companyCapabilities,account.companyCapabilities))){
        setMessage('Αποθηκεύτηκε και επαληθεύτηκε η πρόσβαση. Απαιτείται νέα προσωπική σύνδεση.');
      }else{
        setError('Δεν επιβεβαιώθηκαν τα επιλεγμένα δικαιώματα μετά την αποθήκευση. Άνοιξε ξανά τον χειριστή και έλεγξε την πρόσβαση ανά κατάστημα.');
      }
    }catch(e){if(currentApi.current!==api)return;setError((e.message||'Δεν επιβεβαιώθηκε η αποθήκευση.')+' Ανανέωσε τη λίστα πριν επαναλάβεις.');setEdit(null);setGrants([]);await load()}
    finally{saving.current=false;setBusy(false)}
  };
  return <section className="panel staff-panel"><h2>Χειριστές και δικαιώματα</h2><p>Δημιούργησε χειριστή, επίλεξε τα καταστήματά του και όρισε ξεχωριστά τι βλέπει και τι κάνει σε καθένα.</p>
    <nav className="staff-actions" aria-label="Τύπος πρόσβασης χειριστή"><button type="button" aria-pressed={area==='BACKOFFICE'} onClick={()=>setArea('BACKOFFICE')}>Πρόσβαση BackOffice</button><button type="button" aria-pressed={area==='POS'} onClick={()=>setArea('POS')}>Χειριστές POS</button></nav>
    {area==='POS'&&<section aria-label="Δικαιώματα χειριστών POS"><label>Κατάστημα POS<select value={posStoreId} onChange={e=>setPosStoreId(e.target.value)}><option value="">Επίλεξε κατάστημα</option>{data?.stores.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>{posStoreId&&data?.stores.some(s=>s.id===posStoreId)&&<React.Suspense fallback={<p role="status">Φόρτωση χειριστών…</p>}><OperatorManagementPanel key={posStoreId} api={api} store={data.stores.find(s=>s.id===posStoreId)} onClose={()=>setPosStoreId('')}/></React.Suspense>}</section>}
    <div hidden={area!=='BACKOFFICE'}>
    <p>Ο ρόλος περιγράφει τη θέση του χειριστή. Τα επιλεγμένα δικαιώματα ορίζουν την πρόσβασή του. Η αλλαγή ρόλου δεν αλλάζει αυτόματα τα δικαιώματα.</p>
    {error&&<p role="alert">{error}</p>}{message&&<p role="status">{message}</p>}
    <div className="staff-actions"><button type="button" disabled={busy} onClick={()=>{setEdit(null);load()}}>Ανανέωση λίστας</button><button type="button" disabled={busy||!data} onClick={()=>open(null)}>Νέος χειριστής</button></div>
    {data&&<CompanyAuthorityReadiness authority={data.companyAuthority}/>}
    {data&&<><ul className="staff-accounts">{data.accounts.map(a=><li key={a.id}><b>{a.fullName}</b> · {a.username} · {a.active?'Ενεργός':'Ανενεργός'}<span>{a.grants.length} καταστήματα</span><button type="button" disabled={busy} onClick={()=>open(a)}>Δικαιώματα / Απενεργοποίηση</button></li>)}</ul>{!data.accounts.length&&<p>Δεν έχουν δημιουργηθεί προσωπικές προσβάσεις.</p>}</>}
    {edit&&data&&formApi.current===api&&<form key={edit.id||'new'} onSubmit={save} autoComplete="off"><h3>{edit.id?`${edit.fullName} · ${edit.username}`:'Νέος λογαριασμός'}</h3>
      {!edit.id&&<><label>Ονοματεπώνυμο<input name="fullName" required minLength={2} maxLength={180}/></label><label>Username<input name="username" required pattern="[a-zA-Z0-9][a-zA-Z0-9._-]{2,79}" minLength={3} maxLength={80} autoComplete="off"/></label></>}
      <label>{edit.id?'Νέος κωδικός (προαιρετικά)':'Προσωπικός κωδικός (προαιρετικά)'}<input name="password" type="password" autoComplete="new-password" minLength={10} maxLength={100}/></label>
      <label>{edit.id?'Νέο PIN (προαιρετικά)':'Προσωπικό PIN, 4–12 ψηφία'}<input name="pin" type="password" inputMode="numeric" autoComplete="new-password" required={!edit.id} pattern="[0-9]{4,12}"/></label>
      {!edit.id&&<p>Για απλή είσοδο αρκούν το username και το PIN. Ο ξεχωριστός κωδικός είναι προαιρετικός.</p>}
      {edit.id&&<label className="staff-check"><input name="active" type="checkbox" defaultChecked={edit.active}/>Ενεργός λογαριασμός</label>}
      {companySupported&&(!edit.id||validStaffCompanyCapabilities(edit.companyCapabilities))&&<fieldset disabled={busy}><legend>Εταιρικά δικαιώματα</legend><p>Επίλεξε χωριστά τις προβολές και τις ενέργειες που επιτρέπονται σε ολόκληρη την εταιρεία.</p>
        <div className="staff-actions" aria-label="Μαζική επιλογή εταιρικών δικαιωμάτων">
          <button type="button" disabled={capabilitiesMatch(staffCompanyCapabilities,companyCapabilities)} onClick={()=>setCompanyCapabilities([...staffCompanyCapabilities])}>Όλα τα διαθέσιμα εταιρικά δικαιώματα</button>
          <button type="button" disabled={!companyCapabilities.length} onClick={()=>setCompanyCapabilities([])}>Καθαρισμός εταιρικών επιλογών</button>
        </div>
        {staffCompanyPermissionSections.flatMap(section=>section.actions).map(action=><label key={action.key} className="staff-check"><input type="checkbox" aria-label={`Εταιρεία: ${action.label}`} checked={companyCapabilities.includes(action.key)} onChange={e=>setCompanyCapabilities(rows=>changeStaffCompanyCapability(rows,action.key,e.target.checked))}/><span><b>{action.label}</b><small>{action.description}</small>{action.requires?.includes('suppliers.read')&&<small>Επιλέγεται επίσης η προβολή προμηθευτών εταιρείας.</small>}</span></label>)}</fieldset>}
      <fieldset disabled={busy}>
        <legend>Καταστήματα και δικαιώματα</legend>
        <p>Επίλεξε κατάστημα και όρισε τι μπορεί να βλέπει και τι μπορεί να κάνει ο χειριστής εκεί. Αποεπίλεξε κατάστημα για να ανακαλέσεις την πρόσβασή του σε αυτό.</p>
        {grants.some(grant=>grant.profile==='MANAGER')&&<div className="staff-actions">
          <button type="button"
            disabled={!grants.some(grant=>grant.profile==='MANAGER'&&!capabilitiesMatch(staffCapabilities,grant.capabilities))}
            onClick={()=>setGrants(rows=>rows.map(grant=>grant.profile==='MANAGER'
              ? {...grant,capabilities:[...staffCapabilities]}
              : grant))}>
            Όλες οι προβολές και ενέργειες στα επιλεγμένα καταστήματα Υπευθύνου
          </button>
        </div>}
        {data.stores.map(store=>{
          const grant=grants.find(row=>row.storeId===store.id);
          return <div key={store.id} className="staff-grant">
            <label className="staff-check"><input type="checkbox" checked={Boolean(grant)} onChange={e=>toggleStore(store.id,e.target.checked)}/>{store.name}</label>
            {grant&&<>
              <div className="staff-role-row">
                <label>Ρόλος<select value={grant.profile} onChange={e=>changeProfile(store.id,e.target.value)}>{Object.entries(staffProfiles).map(([key,profile])=><option key={key} value={key}>{profile.label}</option>)}</select></label>
                <button type="button" onClick={()=>applyProfile(store.id)}>Εφαρμογή προτεινόμενων δικαιωμάτων ρόλου</button>
              </div>
              <div className="staff-actions" aria-label={`Μαζική επιλογή δικαιωμάτων για ${store.name}`}>
                <button type="button" disabled={capabilitiesMatch(viewCapabilities,grant.capabilities)} onClick={()=>selectStoreCapabilities(store.id,viewCapabilities)}>Μόνο διαθέσιμες προβολές</button>
                <button type="button" disabled={grant.capabilities.length===staffCapabilities.length} onClick={()=>selectStoreCapabilities(store.id,staffCapabilities)}>Όλες οι προβολές και ενέργειες</button>
                <button type="button" disabled={!grant.capabilities.length} onClick={()=>selectStoreCapabilities(store.id,[])}>Καθαρισμός επιλογών</button>
              </div>
              <div className="staff-permission-matrix">
                {staffPermissionSections.map(section=><fieldset key={section.key}>
                  <legend>{section.label}</legend>
                  {section.actions.map(action=><label key={action.key} className="staff-check">
                    <input type="checkbox" aria-label={`${store.name}: ${section.label} — ${action.label}`} checked={grant.capabilities.includes(action.key)} onChange={e=>toggleCapability(store.id,action.key,e.target.checked)}/>
                    <span><b>{action.label}</b><small>{action.description}</small></span>
                  </label>)}
                </fieldset>)}
              </div>
              {canEditReadDelegationCeiling&&grant.capabilities.includes(readDelegationRight)&&<details>
                <summary>Προβολές που μπορεί να παραχωρεί ο Υπεύθυνος · {store.name}</summary>
                <fieldset>
                  <legend>Επιτρεπόμενες προβολές</legend>
                  {delegatedReadOptions.map(([key,label])=>{
                    const ceiling=grant.backofficeReadDelegationCeiling??[];
                    return <label className="staff-check" key={key}>
                      <input type="checkbox" checked={ceiling.includes(key)} disabled={!ceiling.includes(key)&&!grant.capabilities.includes(key)}
                        onChange={event=>setGrants(rows=>rows.map(row=>row.storeId===store.id?{...row,backofficeReadDelegationCeiling:
                          event.target.checked?[...ceiling,key]:ceiling.filter(value=>value!==key)}:row))}/>
                      {label}
                    </label>;
                  })}
                </fieldset>
              </details>}
              {canEditPosPermissionCeiling&&hasPosEditor(grant)&&<details className="staff-permission-ceiling">
                <summary>Όριο αλλαγής δικαιωμάτων POS · {store.name}</summary>
                <label className="staff-check">
                  <input type="checkbox" checked={Array.isArray(grant.posPermissionCeiling)}
                    onChange={event=>setPosCeiling(store.id,event.target.checked?[]:null)}/>
                  Περιορισμός σε συγκεκριμένα δικαιώματα POS
                </label>
                {Array.isArray(grant.posPermissionCeiling)&&<fieldset>
                  <legend>Δικαιώματα που μπορεί να αλλάζει ή να αντιγράφει ο Υπεύθυνος</legend>
                  {posPermissions.map(([key,label])=><label className="staff-check" key={key}>
                    <input type="checkbox" checked={grant.posPermissionCeiling.includes(key)} onChange={event=>setPosCeiling(store.id,
                      event.target.checked?[...grant.posPermissionCeiling,key]:grant.posPermissionCeiling.filter(value=>value!==key))}/>
                    {label}
                  </label>)}
                </fieldset>}
              </details>}
              <p className="staff-permission-summary">{grant.capabilities.length?`${grant.capabilities.filter(capability=>viewCapabilities.includes(capability)).length} προβολές · ${grant.capabilities.filter(capability=>!viewCapabilities.includes(capability)).length} ενέργειες`:'Καμία λειτουργία επιλεγμένη'}</p>
            </>}
          </div>;
        })}
      </fieldset>
      <div className="staff-actions"><button disabled={busy}>{busy?'Αποθήκευση…':'Αποθήκευση πρόσβασης'}</button><button type="button" disabled={busy} onClick={()=>setEdit(null)}>Ακύρωση</button></div>
    </form>}
    </div></section>;
}
