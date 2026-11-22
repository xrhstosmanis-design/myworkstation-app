import React,{useEffect,useRef,useState} from 'react';
import {supplierTransferCapability} from '../../../../shared/backoffice-staff-company.mjs';
import useCompanyConfigurationRead from './useCompanyConfigurationRead.js';
import usePartyControlChoice from './usePartyControlChoice.jsx';
import {ConfigurationReadState} from './ConfigurationReadPresentation.jsx';

const route=id=>'/api/supplier-control/'+encodeURIComponent(id);
const labels={ITEMS:'Μόνο είδη',CODES:'Μόνο κωδικοί',ITEMS_CODES:'Είδη και κωδικοί'};
function valid(data,{partyId}){
 return data?.source?.id===partyId&&Array.isArray(data.targets)&&Array.isArray(data.items);
}
function Transfer({api,companyId,partyId,data,onSaved}){
 const [destination,setDestination]=useState(''),[mode,setMode]=useState('ITEMS_CODES'),[selected,setSelected]=useState([]);
 const [error,setError]=useState(''),[busy,setBusy]=useState(false);
 const active=useRef(null),attempt=useRef(null);
 useEffect(()=>()=>active.current?.abort(),[]);
 async function submit(event){
  event.preventDefault();
  if(active.current||!destination||!selected.length||selected.length>1000)return;
  const target=data.targets.find(item=>item.id===destination);
  if(!target||!window.confirm(`Μεταφορά ${selected.length} εγγραφών στον προμηθευτή «${target.name}»;`))return;
  const request={toSupplierId:destination,mode,productIds:[...selected].sort(),confirmed:true};
  const fingerprint=JSON.stringify(request);
  if(attempt.current?.fingerprint!==fingerprint)attempt.current={fingerprint,id:crypto.randomUUID()};
  const controller=new AbortController();
  active.current=controller;setBusy(true);setError('');
  try{
   const receipt=await api(route(partyId)+'/transfer',{method:'POST',headers:{'x-backoffice-company-id':companyId},
    signal:controller.signal,body:JSON.stringify({...request,operationId:attempt.current.id})});
   if(controller.signal.aborted)return;
   if(receipt?.ok!==true||receipt.fromSupplier?.id!==partyId||receipt.toSupplier?.id!==destination||
     receipt.mode!==mode||receipt.count!==selected.length)throw Error('Δεν επιβεβαιώθηκε η μεταφορά.');
   attempt.current=null;setSelected([]);onSaved(receipt.message);
  }catch(e){if(!controller.signal.aborted)setError(e.message||'Η μεταφορά απέτυχε.')}
  finally{if(!controller.signal.aborted){active.current=null;setBusy(false)}}
 }
 return <form onSubmit={submit}>
  <p>Οι συνδέσεις ειδών και κωδικών αλλάζουν για όλη την εταιρεία.</p>
  <fieldset disabled={busy}>
   <label>Προμηθευτής προορισμού<select value={destination} onChange={e=>setDestination(e.target.value)} required>
    <option value="">Επιλέξτε</option>{data.targets.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}
   </select></label>
   <label>Τύπος μεταφοράς<select value={mode} onChange={e=>setMode(e.target.value)}>
    {Object.entries(labels).map(([key,label])=><option key={key} value={key}>{label}</option>)}
   </select></label>
   <ul>{data.items.map(item=><li key={item.productId}><label><input type="checkbox" checked={selected.includes(item.productId)}
    onChange={e=>setSelected(e.target.checked?[...selected,item.productId]:selected.filter(id=>id!==item.productId))}/>
    {item.name}{item.supplierCode?' · '+item.supplierCode:''}</label></li>)}</ul>
   <button type="submit" disabled={!destination||!selected.length||selected.length>1000}>Μεταφορά επιλεγμένων ειδών</button>
  </fieldset>
  {error&&<p role="alert">{error}</p>}
 </form>;
}
function Workspace({api,companyId,authorityKey}){
 const {selected:party,controls}=usePartyControlChoice({api,companyId,authorityKey,customer:false});
 const [receipt,setReceipt]=useState(null);
 const read=useCompanyConfigurationRead({api,companyId,authorityKey,path:party?.id?route(party.id)+'/transfer-candidates':null,
  enabled:Boolean(party?.id),validate:valid,context:{partyId:party?.id??''}});
 return <section aria-label="Μεταφορά ειδών και κωδικών προμηθευτή">
  <h3>Μεταφορά ειδών και κωδικών προμηθευτή</h3>
  {controls}
  {party&&<ConfigurationReadState read={read}/>}
  {receipt?.supplierId===party?.id&&<p role="status">{receipt.message}</p>}
  {read.data&&read.data.source.id===party?.id&&<Transfer key={party.id} api={api} companyId={companyId} partyId={party.id}
   data={read.data} onSaved={message=>{setReceipt({supplierId:party.id,message});read.refresh()}}/>}
 </section>;
}
export default function CompanySupplierTransfer(props){
 const grants=props.companyCapabilities;
 if(!props.companyId||![supplierTransferCapability,'supplier-control-report.read'].every(key=>grants?.includes(key)))
  return <p role="alert">Δεν επιβεβαιώθηκε το δικαίωμα μεταφοράς ειδών προμηθευτή.</p>;
 return <Workspace key={JSON.stringify([props.companyId,props.authorityKey])} {...props}/>;
}
