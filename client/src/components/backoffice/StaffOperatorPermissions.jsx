import React,{useEffect,useRef,useState} from 'react';
import {POS_MENU_PERMISSIONS,POS_PERMISSIONS} from '../../../../shared/pos-operator-permissions.mjs';

const EDITABLE_POS_PERMISSIONS=[...POS_PERMISSIONS,...POS_MENU_PERMISSIONS];

export default function StaffOperatorPermissions({api,companyId,storeId,canManagePosAccess=false,canProvision=false,canResetPin=false}){
  const base=`/api/operator-management/stores/${encodeURIComponent(storeId)}/employee-permissions`;
  const [loaded,setLoaded]=useState(null),[selected,setSelected]=useState('');
  const [revision,reload]=useState(0),[error,setError]=useState(''),[notice,setNotice]=useState('');
  const [busy,setBusy]=useState(false),[showProvision,setShowProvision]=useState(false);
  const [showPinReset,setShowPinReset]=useState(false);
  const provisionId=useRef(null);
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
    const accessChange=key===null;
    if(accessChange&&(!canManagePosAccess||(!enabled&&!window.confirm(`Απενεργοποίηση πρόσβασης POS για «${operator.displayName}»;`))))return;
    const request=generation.current,employeeId=operator.employeeId;
    writing.current=true;
    setBusy(true);setError('');setNotice('');
    try{
      const result=await api(`${base}/${encodeURIComponent(employeeId)}${accessChange?"/pos-access":""}`,{
        method:'PATCH',body:JSON.stringify(accessChange?{enabled,expected:operator.posAccess}:{key,enabled,expected:Boolean(operator.permissions[key])})
      });
      if(request!==generation.current)return;
      if(result?.companyId!==companyId||result.storeId!==storeId||result.employeeId!==employeeId||(!accessChange&&result.key!==key)||result.enabled!==enabled){
        throw Error('Δεν επιβεβαιώθηκε η αλλαγή δικαιώματος.');
      }
      setLoaded(current=>current?{...current,items:current.items.map(item=>item.employeeId===employeeId?
        {...item,...(accessChange?{posAccess:enabled}:{permissions:{...item.permissions,[key]:enabled}})}:item)}:current);
      setNotice('Το δικαίωμα αποθηκεύτηκε.');
    }catch(error){
      if(request===generation.current){setLoaded(null);setError(error.message);}
    }finally{
      writing.current=false;setBusy(false);
    }
  };

  const provision=async(event)=>{
    event.preventDefault();
    if(!canProvision||writing.current)return;
    const form=event.currentTarget,fields=new FormData(form),request=generation.current;
    provisionId.current??=crypto.randomUUID();
    writing.current=true;
    setBusy(true);setError('');setNotice('');
    try{
      const result=await api(base.replace(/employee-permissions$/,'employee-provisioning'),{
        method:'POST',body:JSON.stringify({fullName:fields.get('fullName'),initialPin:fields.get('pin'),requestId:provisionId.current})
      });
      if(request!==generation.current)return;
      if(result?.companyId!==companyId||result.storeId!==storeId||!result.employeeId)throw Error('Δεν επιβεβαιώθηκε ο νέος χειριστής.');
      provisionId.current=null;
      form.reset();setShowProvision(false);setSelected(result.employeeId);
      setNotice('Ο χειριστής δημιουργήθηκε. Η πρόσβαση POS είναι ανενεργή.');
      reload(value=>value+1);
    }catch(error){
      if(request===generation.current)setError(error.message);
    }finally{
      writing.current=false;setBusy(false);
    }
  };

  const resetPin=async(event)=>{
    event.preventDefault();
    if(!canResetPin||!operator||writing.current)return;
    const form=event.currentTarget;
    const pin=new FormData(form).get('pin');
    const request=generation.current,employeeId=operator.employeeId;
    writing.current=true;
    setBusy(true);setError('');setNotice('');
    form.reset();
    try{
      const result=await api(`${base}/${encodeURIComponent(employeeId)}/pin`,{
        method:'POST',body:JSON.stringify({pin})
      });
      if(request!==generation.current)return;
      if(result?.companyId!==companyId||result.storeId!==storeId||result.employeeId!==employeeId||result.changed!==true){
        throw Error('Δεν επιβεβαιώθηκε η αλλαγή PIN.');
      }
      setShowPinReset(false);
      setNotice('Το PIN άλλαξε και οι ενεργές συνδέσεις POS του χειριστή έκλεισαν.');
    }catch(error){
      if(request===generation.current)setError(error.message);
    }finally{
      writing.current=false;setBusy(false);
    }
  };

  return <section className="panel staff-panel">
    <h3>Δικαιώματα χειριστών POS</h3>
    <button type="button" disabled={busy} onClick={()=>{setNotice('');reload(value=>value+1)}}>Ανανέωση χειριστών</button>
    {canProvision&&<button type="button" disabled={busy} onClick={()=>setShowProvision(value=>!value)}>Νέος χειριστής POS</button>}
    {canProvision&&showProvision&&<form onSubmit={provision} autoComplete="off">
      <fieldset disabled={busy}>
        <legend>Νέος χειριστής POS</legend>
        <label>Ονοματεπώνυμο <input name="fullName" minLength={2} maxLength={160} required/></label>
        <label>Αρχικό PIN <input name="pin" type="password" autoComplete="new-password" inputMode="numeric" pattern="[0-9]{4,8}" required/></label>
        <button type="submit">Δημιουργία χειριστή</button>
      </fieldset>
    </form>}
    {error&&<p role="alert">{error}</p>}
    {notice&&<p role="status">{notice}</p>}
    {!items&&!error&&<p role="status">Φόρτωση χειριστών…</p>}
    {items?.length===0&&<p>Δεν υπάρχουν ενεργοί χειριστές υπάλληλοι στο κατάστημα.</p>}
    {!!items?.length&&<label>Χειριστής <select disabled={busy} value={operator?selected:''} onChange={event=>{setSelected(event.target.value);setShowPinReset(false);setNotice('')}}>
      <option value="">Επίλεξε χειριστή</option>
      {items.map(item=><option key={item.employeeId} value={item.employeeId}>{item.displayName}</option>)}
    </select></label>}
    {operator&&canManagePosAccess&&<label className="staff-check">
      <input type="checkbox" disabled={busy} checked={operator.posAccess} onChange={event=>change(null,event.target.checked)}/>
      Πρόσβαση στις Πωλήσεις (POS)
    </label>}
    {operator&&canResetPin&&<button type="button" disabled={busy} onClick={()=>setShowPinReset(value=>!value)}>Αλλαγή PIN χειριστή</button>}
    {operator&&canResetPin&&showPinReset&&<form key={operator.employeeId} onSubmit={resetPin} autoComplete="off">
      <fieldset disabled={busy}>
        <legend>Νέο PIN · {operator.displayName}</legend>
        <label>Νέο PIN <input name="pin" type="password" autoComplete="new-password" inputMode="numeric" pattern="[0-9]{4,8}" required/></label>
        <button type="submit">Αποθήκευση PIN</button>
      </fieldset>
    </form>}
    {operator&&<fieldset disabled={busy}>
      <legend>Δικαιώματα POS · {operator.displayName}</legend>
      {EDITABLE_POS_PERMISSIONS.map(([key,label])=><label className="staff-check" key={key}>
        <input type="checkbox" checked={Boolean(operator.permissions[key])} onChange={event=>change(key,event.target.checked)}/>
        {label}
      </label>)}
    </fieldset>}
  </section>;
}
