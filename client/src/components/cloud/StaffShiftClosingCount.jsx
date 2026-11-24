import React,{useEffect,useRef,useState} from 'react';
import {declaredEftpos} from '../../../../shared/declared-eftpos.mjs';

const cashFields=[
  ['drawer','Συρτάρι'],
  ['custody','Φύλαξη'],
  ['coins','Κέρματα'],
  ['safe','Χρηματοκιβώτιο']
];
const isAmount=value=>{
  const amount=declaredEftpos(value);
  return amount!==null&&Math.abs(amount*100-Math.round(amount*100))<0.0001;
};

export default function StaffShiftClosingCount({api,storeId,sessionId,onSaved}){
  const [configuration,setConfiguration]=useState(null);
  const [error,setError]=useState('');
  const [submitting,setSubmitting]=useState(false);
  const active=useRef(null);
  const writing=useRef(false);
  const path=`/api/owner-shifts/${encodeURIComponent(sessionId)}`;

  useEffect(()=>{
    const scope={api,storeId,sessionId,controller:new AbortController()};
    active.current=scope;
    writing.current=false;
    setSubmitting(false);
    setConfiguration(null);
    setError('');
    api(`${path}/detail`,{signal:scope.controller.signal}).then(data=>{
      if(active.current!==scope)return;
      if(data?.shift?.id!==sessionId||data.shift.storeId!==storeId||
         data.shift.closeReconciliationStatus!=='AWAITING_COUNT'||
         typeof data.countEntry?.requiresEftpos!=='boolean'){
        throw Error('Δεν επιβεβαιώθηκε εκκρεμής καταμέτρηση για τη συγκεκριμένη βάρδια.');
      }
      setConfiguration({scope,requiresEftpos:data.countEntry.requiresEftpos});
    }).catch(failure=>{
      if(active.current===scope)setError(failure.message||'Δεν φορτώθηκε η καταμέτρηση.');
    });
    return ()=>{
      active.current=null;
      scope.controller.abort();
    };
  },[api,storeId,sessionId,path]);

  const current=configuration?.scope;
  const ready=current&&active.current===current&&current.api===api&&current.sessionId===sessionId&&current.storeId===storeId;
  const fields=configuration?.requiresEftpos?[...cashFields,['eftposTotal','EFTPOS']]:cashFields;
  async function save(event){
    event.preventDefault();
    if(!ready||writing.current)return;
    const form=new FormData(event.currentTarget);
    const amounts=Object.fromEntries(fields.map(([name])=>[name,String(form.get(name)??'').trim()]));
    const note=String(form.get('note')??'').trim();
    if(!Object.values(amounts).every(isAmount)||note.length<3||note.length>500){
      setError('Συμπλήρωσε όλα τα ποσά με έως δύο δεκαδικά και σημείωση 3–500 χαρακτήρων.');
      return;
    }
    writing.current=true;
    setSubmitting(true);
    setError('');
    try{
      const result=await api(`${path}/closing-count`,{
        method:'POST',
        body:JSON.stringify({storeId,...amounts,note}),
        signal:current.controller.signal
      });
      if(active.current!==current)return;
      if(result?.ok!==true||result.shift?.id!==sessionId||result.shift.storeId!==storeId||
         result.shift.closeReconciliationStatus!=='COUNTED'){
        throw Error('Δεν επιβεβαιώθηκε η αποθήκευση. Ανανέωσε την αναφορά πριν το δοκιμάσεις ξανά.');
      }
      onSaved();
    }catch(failure){
      if(active.current===current)setError(failure.message||'Η καταμέτρηση δεν αποθηκεύτηκε.');
    }finally{
      if(active.current===current){writing.current=false;setSubmitting(false)}
    }
  }

  return <section aria-label="Καταχώριση πραγματικής καταμέτρησης">
    <h4>Καταχώριση πραγματικής καταμέτρησης</h4>
    {error&&<p role="alert">{error}</p>}
    {ready?<form onSubmit={save}>
      <p>Καταχώρισε τα ποσά για τη συγκεκριμένη κλεισμένη βάρδια.</p>
      {fields.map(([name,label])=><label key={name}>{label} <input name={name} inputMode="decimal" required disabled={submitting}/></label>)}
      <label>Πηγή καταμέτρησης / σημείωση <input name="note" required minLength={3} maxLength={500} disabled={submitting}/></label>
      <button type="submit" disabled={submitting}>{submitting?'Αποθήκευση…':'Αποθήκευση καταμέτρησης'}</button>
    </form>:!error&&<p role="status">Φόρτωση καταμέτρησης…</p>}
  </section>;
}
