import React,{useEffect,useRef,useState} from 'react';

import {staffDelegatableReadKeys,staffPermissionSections,staffReadDelegationCapability} from '../../../../shared/backoffice-staff.mjs';

import {staffCompanyPermissionSections} from '../../../../shared/backoffice-staff-company.mjs';
import {delegatableCompanyReadKeys} from '../../../../shared/backoffice-staff-company-delegation.mjs';

export const readDelegationRight=staffReadDelegationCapability;
const shortLabels=new Map([
  ['products.read','Είδη'],
  ['inventory.read','Απογραφή'],
  ['invoices.read','Τιμολόγια'],
  ['sales.read','Πωλήσεις'],
  ['shifts.read','Βάρδιες']
]);
const labels=new Map(staffPermissionSections.flatMap(section=>section.actions.map(action=>[action.key,action.label])));
export const delegatedReadOptions=staffDelegatableReadKeys.map(key=>[key,shortLabels.get(key)??labels.get(key)]);

const companyLabels=new Map(staffCompanyPermissionSections.flatMap(section=>section.actions.map(action=>[action.key,action.label])));
const companyOptions=delegatableCompanyReadKeys.map(key=>[key,companyLabels.get(key)]);
const companyPath='/api/backoffice-staff/company/delegated-reads';
const validRevision=value=>Number.isSafeInteger(value)&&value>0;

export default function StaffReadDelegation({api,storeId,companyId,userId,onSaved}){
  const companyMode=Boolean(companyId);
  const scopeId=companyMode?companyId:storeId,scopeKey=companyMode?'companyId':'storeId';
  const options=companyMode?companyOptions:delegatedReadOptions;
  const title=companyMode?'Επανεκχώρηση εταιρικών προβολών':'Παραχώρηση προβολών καταστήματος';
  const path=companyMode?companyPath:`/api/backoffice-staff/stores/${encodeURIComponent(storeId)}/delegated-reads`;
  const [snapshot,setSnapshot]=useState(null),[selected,setSelected]=useState(''),[revision,reload]=useState(0);
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
  const scope=useRef(null),writing=useRef(false);
  const data=snapshot?.scope===scope.current&&snapshot?.scope.api===api&&snapshot.scope.path===path&&snapshot.scope.scopeId===scopeId&&snapshot.scope.revision===revision?snapshot.data:null;
  const target=data?.items.find(item=>item.userId===selected&&item.userId!==userId);

  useEffect(()=>{
    const request={api,path,scopeId,revision,controller:new AbortController()};
    scope.current=request;
    writing.current=false;
    setSnapshot(null);setError('');setBusy(false);
    api(path,{signal:request.controller.signal,...(companyMode?{headers:{'x-backoffice-company-id':companyId}}:{})}).then(data=>{
      if(scope.current!==request)return;
      if(data?.[scopeKey]!==scopeId||!Array.isArray(data.editableKeys)||!data.editableKeys.every(key=>options.some(([option])=>option===key))||
        !Array.isArray(data.items)||!data.items.every(item=>item&&typeof item.userId==='string'&&typeof item.fullName==='string'&&
          validRevision(item.revision)&&Array.isArray(item.capabilities)&&
          (!companyMode||item.capabilities.every(key=>data.editableKeys.includes(key)))))throw Error('Δεν επιβεβαιώθηκαν οι παραχωρήσεις.');
      setSnapshot({scope:request,data});
    }).catch(failure=>{if(scope.current===request)setError(failure.message)});
    return ()=>{scope.current=null;request.controller.abort()};
  },[api,path,scopeId,revision]);

  async function change(key,enabled){
    if(!target||writing.current||!data.editableKeys.includes(key))return;
    const request=scope.current;
    writing.current=true;
    setBusy(true);setError('');setNotice('');
    try{
      const result=await api(companyMode?path:`${path}/${encodeURIComponent(target.userId)}`,{
        method:'PATCH',body:JSON.stringify({key,enabled,expectedRevision:target.revision,...(companyMode?{userId:target.userId}:{})}),
        signal:request.controller.signal,...(companyMode?{headers:{'x-backoffice-company-id':companyId}}:{})
      });
      if(scope.current!==request)return;
      if(result?.[scopeKey]!==scopeId||result.userId!==target.userId||!validRevision(result.revision)||
        result.revision<=target.revision||!Array.isArray(result.capabilities)||result.capabilities.includes(key)!==enabled||(companyMode&&!result.capabilities.every(item=>data.editableKeys.includes(item)))){
        throw Error('Δεν επιβεβαιώθηκε η αλλαγή. Ανανέωσε τις παραχωρήσεις.');
      }
      setSnapshot({scope:request,data:{...data,items:data.items.map(item=>item===target?
        {...item,revision:result.revision,capabilities:result.capabilities}:item)}});
      setNotice('Η παραχώρηση αποθηκεύτηκε.');
      onSaved?.();
    }catch(failure){
      if(scope.current===request){setSnapshot(null);setError(failure.message)}
    }finally{
      if(scope.current===request){writing.current=false;setBusy(false)}
    }
  }

  return <section className="panel staff-panel" aria-label={title}>
    <h3>{title}</h3>
    <button type="button" disabled={busy} onClick={()=>{setNotice('');reload(value=>value+1)}}>Ανανέωση παραχωρήσεων</button>
    {error&&<p role="alert">{error}</p>}
    {notice&&<p role="status">{notice}</p>}
    {!data&&!error&&<p role="status">Φόρτωση παραχωρήσεων…</p>}
    {data&&data.editableKeys.length===0&&<p>{companyMode?'Δεν έχουν οριστεί εταιρικές προβολές για επανεκχώρηση.':'Δεν έχουν οριστεί παραχωρήσιμες προβολές για το κατάστημα.'}</p>}
    {data?.editableKeys.length>0&&<label>Χειριστής <select value={target?selected:''} disabled={busy} onChange={event=>{
      setSelected(event.target.value);setNotice('');
    }}>
      <option value="">Επίλεξε χειριστή</option>
      {data.items.filter(item=>item.userId!==userId).map(item=><option key={item.userId} value={item.userId}>{item.fullName}</option>)}
    </select></label>}
    {target&&<fieldset disabled={busy}>
      <legend>Προβολές · {target.fullName}</legend>
      {options.filter(([key])=>data.editableKeys.includes(key)).map(([key,label])=><label key={key} className="staff-check">
        <input type="checkbox" checked={target.capabilities.includes(key)} onChange={event=>change(key,event.target.checked)}/>
        {label}
      </label>)}
    </fieldset>}
  </section>;
}
