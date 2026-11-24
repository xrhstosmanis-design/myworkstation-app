import React,{useEffect,useRef,useState} from 'react';

export const readDelegationRight='staff-grants.manage-reads';
export const delegatedReadOptions=[
  ['products.read','Είδη'],
  ['inventory.read','Απογραφή'],
  ['invoices.read','Τιμολόγια'],
  ['sales.read','Πωλήσεις'],
  ['shifts.read','Βάρδιες']
];

const allowedKeys=new Set(delegatedReadOptions.map(([key])=>key));
const validRevision=value=>Number.isSafeInteger(value)&&value>0;

export default function StaffReadDelegation({api,storeId,userId}){
  const path=`/api/backoffice-staff/stores/${encodeURIComponent(storeId)}/delegated-reads`;
  const [snapshot,setSnapshot]=useState(null),[selected,setSelected]=useState(''),[revision,reload]=useState(0);
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
  const scope=useRef(null),writing=useRef(false);
  const data=snapshot?.scope===scope.current&&snapshot?.scope.api===api&&snapshot.scope.path===path&&snapshot.scope.revision===revision?snapshot.data:null;
  const target=data?.items.find(item=>item.userId===selected&&item.userId!==userId);

  useEffect(()=>{
    const request={api,path,revision,controller:new AbortController()};
    scope.current=request;
    writing.current=false;
    setSnapshot(null);setError('');setBusy(false);
    api(path,{signal:request.controller.signal}).then(data=>{
      if(scope.current!==request)return;
      if(data?.storeId!==storeId||!Array.isArray(data.editableKeys)||!data.editableKeys.every(key=>allowedKeys.has(key))||
        !Array.isArray(data.items)||!data.items.every(item=>item&&typeof item.userId==='string'&&typeof item.fullName==='string'&&
          validRevision(item.revision)&&Array.isArray(item.capabilities)))throw Error('Δεν επιβεβαιώθηκαν οι παραχωρήσεις του επιλεγμένου καταστήματος.');
      setSnapshot({scope:request,data});
    }).catch(failure=>{if(scope.current===request)setError(failure.message)});
    return ()=>{scope.current=null;request.controller.abort()};
  },[api,path,storeId,revision]);

  async function change(key,enabled){
    if(!target||writing.current||!data.editableKeys.includes(key))return;
    const request=scope.current;
    writing.current=true;
    setBusy(true);setError('');setNotice('');
    try{
      const result=await api(`${path}/${encodeURIComponent(target.userId)}`,{
        method:'PATCH',body:JSON.stringify({key,enabled,expectedRevision:target.revision}),
        signal:request.controller.signal
      });
      if(scope.current!==request)return;
      if(result?.storeId!==storeId||result.userId!==target.userId||!validRevision(result.revision)||
        result.revision<=target.revision||!Array.isArray(result.capabilities)||result.capabilities.includes(key)!==enabled){
        throw Error('Δεν επιβεβαιώθηκε η αλλαγή. Ανανέωσε τις παραχωρήσεις.');
      }
      setSnapshot({scope:request,data:{...data,items:data.items.map(item=>item===target?
        {...item,revision:result.revision,capabilities:result.capabilities}:item)}});
      setNotice('Η παραχώρηση αποθηκεύτηκε.');
    }catch(failure){
      if(scope.current===request){setSnapshot(null);setError(failure.message)}
    }finally{
      if(scope.current===request){writing.current=false;setBusy(false)}
    }
  }

  return <section className="panel staff-panel" aria-label="Παραχώρηση προβολών καταστήματος">
    <h3>Παραχώρηση προβολών καταστήματος</h3>
    <button type="button" disabled={busy} onClick={()=>{setNotice('');reload(value=>value+1)}}>Ανανέωση παραχωρήσεων</button>
    {error&&<p role="alert">{error}</p>}
    {notice&&<p role="status">{notice}</p>}
    {!data&&!error&&<p role="status">Φόρτωση παραχωρήσεων…</p>}
    {data&&data.editableKeys.length===0&&<p>Δεν έχουν οριστεί παραχωρήσιμες προβολές για το κατάστημα.</p>}
    {data?.editableKeys.length>0&&<label>Χειριστής <select value={target?selected:''} disabled={busy} onChange={event=>{
      setSelected(event.target.value);setNotice('');
    }}>
      <option value="">Επίλεξε χειριστή</option>
      {data.items.filter(item=>item.userId!==userId).map(item=><option key={item.userId} value={item.userId}>{item.fullName}</option>)}
    </select></label>}
    {target&&<fieldset disabled={busy}>
      <legend>Προβολές · {target.fullName}</legend>
      {delegatedReadOptions.filter(([key])=>data.editableKeys.includes(key)).map(([key,label])=><label key={key} className="staff-check">
        <input type="checkbox" checked={target.capabilities.includes(key)} onChange={event=>change(key,event.target.checked)}/>
        {label}
      </label>)}
    </fieldset>}
  </section>;
}
