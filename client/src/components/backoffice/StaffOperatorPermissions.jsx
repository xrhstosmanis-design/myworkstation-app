import React,{useEffect,useRef,useState} from 'react';
import {POS_PERMISSIONS} from '../../../../shared/pos-operator-permissions.mjs';

export default function StaffOperatorPermissions({api,companyId,storeId}){
  const base=`/api/operator-management/stores/${encodeURIComponent(storeId)}/employee-permissions`;
  const [loaded,setLoaded]=useState(null),[selected,setSelected]=useState('');
  const [revision,reload]=useState(0),[error,setError]=useState(''),[notice,setNotice]=useState('');
  const [busy,setBusy]=useState(false);
  const generation=useRef(0),writing=useRef(false);
  const items=loaded?.api===api&&loaded.base===base&&loaded.revision===revision?loaded.items:null;
  const operator=items?.find(item=>item.employeeId===selected);

  useEffect(()=>{
    const request=++generation.current;
    setError('');
    api(base).then(result=>{
      if(request!==generation.current)return;
      if(result?.companyId!==companyId||result.storeId!==storeId||!Array.isArray(result.items)){
        throw Error('Δεν επιβεβαιώθηκε το κατάστημα των χειριστών.');
      }
      setLoaded({api,base,revision,items:result.items});
    }).catch(error=>{
      if(request===generation.current)setError(error.message);
    });
    return ()=>{generation.current++};
  },[api,base,companyId,storeId,revision]);

  const change=async(key,enabled)=>{
    if(writing.current||!operator)return;
    const request=generation.current,employeeId=operator.employeeId;
    writing.current=true;
    setBusy(true);setError('');setNotice('');
    try{
      const result=await api(`${base}/${encodeURIComponent(employeeId)}`,{
        method:'PATCH',body:JSON.stringify({key,enabled,expected:Boolean(operator.permissions[key])})
      });
      if(request!==generation.current)return;
      if(result?.companyId!==companyId||result.storeId!==storeId||result.employeeId!==employeeId||result.key!==key||result.enabled!==enabled){
        throw Error('Δεν επιβεβαιώθηκε η αλλαγή δικαιώματος.');
      }
      setLoaded(current=>current?{...current,items:current.items.map(item=>item.employeeId===employeeId?
        {...item,permissions:{...item.permissions,[key]:enabled}}:item)}:current);
      setNotice('Το δικαίωμα αποθηκεύτηκε.');
    }catch(error){
      if(request===generation.current){setLoaded(null);setError(error.message);}
    }finally{
      writing.current=false;setBusy(false);
    }
  };

  return <section className="panel staff-panel">
    <h3>Δικαιώματα χειριστών POS</h3>
    <button type="button" disabled={busy} onClick={()=>{setNotice('');reload(value=>value+1)}}>Ανανέωση χειριστών</button>
    {error&&<p role="alert">{error}</p>}
    {notice&&<p role="status">{notice}</p>}
    {!items&&!error&&<p role="status">Φόρτωση χειριστών…</p>}
    {items?.length===0&&<p>Δεν υπάρχουν ενεργοί χειριστές υπάλληλοι στο κατάστημα.</p>}
    {!!items?.length&&<label>Χειριστής <select disabled={busy} value={operator?selected:''} onChange={event=>{setSelected(event.target.value);setNotice('')}}>
      <option value="">Επίλεξε χειριστή</option>
      {items.map(item=><option key={item.employeeId} value={item.employeeId}>{item.displayName}</option>)}
    </select></label>}
    {operator&&<fieldset disabled={busy}>
      <legend>Δικαιώματα POS · {operator.displayName}</legend>
      {POS_PERMISSIONS.map(([key,label])=><label className="staff-check" key={key}>
        <input type="checkbox" checked={Boolean(operator.permissions[key])} onChange={event=>change(key,event.target.checked)}/>
        {label}
      </label>)}
    </fieldset>}
  </section>;
}
