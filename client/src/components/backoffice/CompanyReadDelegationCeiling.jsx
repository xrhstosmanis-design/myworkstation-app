import React,{useEffect,useRef,useState} from 'react';
import {delegatableCompanyReadKeys,validCompanyReadDelegationCeiling} from '../../../../shared/backoffice-staff-company-delegation.mjs';
import {staffCompanyPermissionSections} from '../../../../shared/backoffice-staff-company.mjs';

const labels=new Map(staffCompanyPermissionSections.flatMap(section=>section.actions.map(action=>[action.key,action.label])));
const sameKeys=(left,right)=>left.length===right.length&&left.every(key=>right.includes(key));

export default function CompanyReadDelegationCeiling({api,companyId,account,onSaved,onClose}){
  const [snapshot,setSnapshot]=useState(null),[keys,setKeys]=useState([]),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const scope=useRef(null),saving=useRef(false);
  const path='/api/backoffice-staff/admin/accounts/'+encodeURIComponent(account.id)+'/company-read-delegation';
  const state=snapshot?.request===scope.current&&snapshot?.request.api===api&&snapshot?.request.path===path&&
    snapshot?.request.companyId===companyId?snapshot.value:null;
  const valid=value=>value?.companyId===companyId&&value.userId===account.id&&
    Number.isSafeInteger(value.revision)&&value.revision>0&&validCompanyReadDelegationCeiling(value.capabilities);

  useEffect(()=>{
    const request={api,path,companyId,controller:new AbortController()};
    scope.current=request;
    saving.current=false;
    setSnapshot(null);setError('');setBusy(false);
    api(path,{signal:request.controller.signal}).then(value=>{
      if(scope.current!==request)return;
      if(!valid(value))throw Error('Δεν επιβεβαιώθηκε η ρύθμιση του χειριστή.');
      setSnapshot({request,value});setKeys(value.capabilities);
    }).catch(failure=>{if(scope.current===request)setError(failure.message||'Η ρύθμιση δεν είναι διαθέσιμη.')});
    return ()=>{scope.current=null;request.controller.abort()};
  },[api,path,companyId]);

  async function save(event){
    event.preventDefault();
    if(saving.current||!state||sameKeys(keys,state.capabilities))return;
    const request=scope.current;
    saving.current=true;setBusy(true);setError('');
    try{
      const result=await api(path,{method:'PUT',body:JSON.stringify({expectedRevision:state.revision,capabilities:keys}),
        signal:request.controller.signal});
      if(scope.current!==request)return;
      if(!valid(result)||result.revision!==state.revision+1||!sameKeys(keys,result.capabilities)){
        throw Error('Δεν επιβεβαιώθηκε η αποθήκευση.');
      }
      onSaved();
    }catch(failure){
      if(scope.current===request){setError(failure.message||'Η αποθήκευση απέτυχε.');setSnapshot(null)}
    }finally{
      if(scope.current===request){saving.current=false;setBusy(false)}
    }
  }

  return <form onSubmit={save} aria-label="Όριο επανεκχώρησης εταιρικών προβολών">
    <h3>Όριο επανεκχώρησης · {account.fullName}</h3>
    {error&&<p role="alert">{error}</p>}
    {!state&&!error&&<p role="status">Φόρτωση ορίου…</p>}
    {state&&<fieldset disabled={busy}>
      <legend>Εταιρικές προβολές που μπορεί να επανεκχωρεί</legend>
      {delegatableCompanyReadKeys.map(key=><label className="staff-check" key={key}>
        <input type="checkbox" checked={keys.includes(key)} onChange={event=>{
          const enabled=event.target.checked;
          setKeys(current=>enabled?[...new Set([...current,key])]:current.filter(item=>item!==key));
        }}/>
        {labels.get(key)}
      </label>)}
      <button type="submit" disabled={sameKeys(keys,state.capabilities)}>Αποθήκευση ορίου</button>
    </fieldset>}
    <button type="button" disabled={busy} onClick={onClose}>Κλείσιμο</button>
  </form>;
}
