import React,{useEffect,useRef,useState} from 'react';
import {supplierContactPath,supplierManualCreateCapability} from '../../../../shared/backoffice-staff-company.mjs';

const fields=[
 ['name','Επωνυμία',180],['taxId','ΑΦΜ',30],['email','Email',254,'email'],
 ['phone','Τηλέφωνο',40,'tel'],['address','Διεύθυνση',250],['city','Πόλη',120]
];

function CreateSupplierForm({api,companyId}){
 const active=useRef(null),pending=useRef(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[saved,setSaved]=useState('');
 useEffect(()=>()=>{active.current?.abort();active.current=null},[]);
 async function create(event){
  event.preventDefault();
  if(active.current)return;
  const form=event.currentTarget,data=new FormData(form);
  const body=Object.fromEntries(fields.map(([key])=>[key,String(data.get(key)).trim()||null]));
  const serialized=JSON.stringify(body);
  if(pending.current?.serialized!==serialized)pending.current={serialized,requestId:crypto.randomUUID()};
  const controller=new AbortController();
  active.current=controller;setError('');setSaved('');setBusy(true);
  try{
   const result=await api(supplierContactPath,{method:'POST',headers:{'x-backoffice-company-id':companyId},
    signal:controller.signal,body:JSON.stringify({...body,requestId:pending.current.requestId})});
   if(controller.signal.aborted)return;
   if(result?.ok!==true||result.companyId!==companyId||typeof result.supplierId!=='string'||!result.supplierId)throw Error('Δεν επιβεβαιώθηκε η δημιουργία προμηθευτή.');
   pending.current=null;setSaved(body.name);form.reset();
  }catch(e){if(!controller.signal.aborted)setError(e.message||'Η δημιουργία προμηθευτή απέτυχε.')}
  finally{if(!controller.signal.aborted){active.current=null;setBusy(false)}}
 }
 return <section aria-label="Χειροκίνητη δημιουργία προμηθευτή">
  <h3>Χειροκίνητη δημιουργία προμηθευτή</h3>
  <p>Η νέα καρτέλα θα είναι διαθέσιμη σε όλη την εταιρεία.</p>
  <form onSubmit={create}><fieldset disabled={busy}>
   {fields.map(([key,label,max,type])=><label key={key}>{label}<input name={key} maxLength={max} type={type||'text'} required={key==='name'}/></label>)}
   <button type="submit">Δημιουργία προμηθευτή</button>
  </fieldset></form>
  {error&&<p role="alert">{error}</p>}
  {saved&&<p role="status">Δημιουργήθηκε ο προμηθευτής «{saved}».</p>}
 </section>;
}

export default function CompanySupplierManualCreate(props){
 if(!props.companyId||!props.companyCapabilities?.includes(supplierManualCreateCapability))return <p role="alert">Δεν επιβεβαιώθηκε το δικαίωμα δημιουργίας προμηθευτή.</p>;
 return <CreateSupplierForm key={JSON.stringify([props.companyId,props.authorityKey])} {...props}/>;
}
