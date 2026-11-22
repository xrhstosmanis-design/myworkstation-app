import React,{useEffect,useRef,useState} from 'react';
import {supplierAddressCapability,supplierUnitCapability,supplierContactPath} from '../../../../shared/backoffice-staff-company.mjs';
import useCompanyConfigurationRead from './useCompanyConfigurationRead.js';
import usePartyControlChoice from './usePartyControlChoice.jsx';
import {partyControlReadValid} from './partyControlReadValidation.js';
import {ConfigurationReadState} from './ConfigurationReadPresentation.jsx';

const addressFields=[['label','Ετικέτα',80],['address','Διεύθυνση',250,true],['city','Πόλη',120],['postalCode','Τ.Κ.',20],['phone','Τηλέφωνο',40]];
const unitFields=[['name','Ονομασία',120,true],['code','Κωδικός',60],['email','Email',254,false,'email'],['phone','Τηλέφωνο',40]];

function Records({api,companyId,supplier,resource,items,onSaved}){
 const active=useRef(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 useEffect(()=>()=>{active.current?.abort();active.current=null},[]);
 const addresses=resource==='addresses';
 const fields=addresses?addressFields:unitFields;
 async function mutate(method,itemId,body){
  if(active.current)return;
  const controller=new AbortController();
  active.current=controller;setError('');setBusy(true);
  try{
   const path=supplierContactPath+'/'+encodeURIComponent(supplier.id)+'/'+resource+(itemId?'/'+encodeURIComponent(itemId):'');
   const receipt=await api(path,{method,headers:{'x-backoffice-company-id':companyId},signal:controller.signal,...(body?{body:JSON.stringify(body)}:{})});
   if(controller.signal.aborted)return;
   if(receipt?.ok!==true||receipt.companyId!==companyId||receipt.supplierId!==supplier.id||receipt.resource!==resource||typeof receipt.itemId!=='string'||itemId&&itemId!==receipt.itemId)throw Error('Δεν επιβεβαιώθηκε η μεταβολή.');
   onSaved(method==='POST'?'Η εγγραφή προστέθηκε.':'Η εγγραφή αφαιρέθηκε.');
  }catch(e){if(!controller.signal.aborted)setError(e.message||'Η μεταβολή απέτυχε.')}
  finally{if(!controller.signal.aborted){active.current=null;setBusy(false)}}
 }
 function add(event){
  event.preventDefault();
  const form=new FormData(event.currentTarget);
  const values=Object.fromEntries(fields.map(([key])=>[key,String(form.get(key)).trim()||null]));
  if(addresses)values.isPrimary=form.has('isPrimary');
  void mutate('POST',null,values);
 }
 return <>
  <p>Ενεργός προμηθευτής: <strong>{supplier.name}</strong>. Οι αλλαγές ισχύουν για όλη την εταιρεία.</p>
  <ul>{items.map(row=><li key={row.id}>
   {addresses?<>{row.label?row.label+' · ':''}{row.address}{row.city?' · '+row.city:''}{row.isPrimary?' · Κύρια':''}</>:<>{row.name}{row.code?' · '+row.code:''}{row.active?'':' · Ανενεργή'}</>}
   {' '}<button type="button" disabled={busy} onClick={()=>{if(window.confirm('Να αφαιρεθεί η εγγραφή του προμηθευτή;'))void mutate('DELETE',row.id)}}>Αφαίρεση</button>
  </li>)}</ul>
  <form onSubmit={add}>
   {fields.map(([key,label,max,required,type])=><label key={key}>{label}<input name={key} maxLength={max} required={Boolean(required)} type={type||'text'}/></label>)}
   {addresses&&<label><input name="isPrimary" type="checkbox"/>Κύρια διεύθυνση</label>}
   <button type="submit" disabled={busy}>{addresses?'Προσθήκη διεύθυνσης':'Προσθήκη μονάδας'}</button>
  </form>
  {error&&<p role="alert">{error}</p>}
 </>;
}

function Workspace({api,companyId,authorityKey,capability}){
 const {selected:party,controls}=usePartyControlChoice({api,companyId,authorityKey,customer:false});
 const resource=capability===supplierAddressCapability?'addresses':'units';
 const title=resource==='addresses'?'Διαχείριση διευθύνσεων προμηθευτή':'Διαχείριση μονάδων προμηθευτή';
 const [response,setResponse]=useState(null);
 const read=useCompanyConfigurationRead({api,companyId,authorityKey,
  path:party?.active?supplierContactPath+'/'+encodeURIComponent(party.id)+'/card':null,
  enabled:Boolean(party?.active),validate:partyControlReadValid,context:{kind:'card',customer:false,partyId:party?.id??''}});
 const supplier=read.data?.supplier;
 return <section aria-label={title}>
  <h3>{title}</h3>
  {controls}
  {party?.active&&<ConfigurationReadState read={read}/>}
  {party&&!party.active&&<p>Επίλεξε ενεργό προμηθευτή.</p>}
  {response&&response.supplierId===party?.id&&<p role="status">{response.message}</p>}
  {supplier?.active&&<Records key={supplier.id+':'+resource} api={api} companyId={companyId} supplier={supplier}
   resource={resource} items={read.data[resource]} onSaved={message=>{setResponse({supplierId:supplier.id,message});read.refresh()}}/>}
 </section>;
}

export default function CompanySupplierRelatedRecordsEditor(props){
 const allowed=[supplierAddressCapability,supplierUnitCapability].includes(props.capability)
  &&[props.capability,'supplier-card.read','supplier-control-report.read'].every(key=>props.companyCapabilities?.includes(key));
 if(!props.companyId||!allowed)return <p role="alert">Δεν επιβεβαιώθηκε το δικαίωμα διαχείρισης στοιχείων προμηθευτή.</p>;
 const identity=JSON.stringify([props.companyId,props.authorityKey,props.capability]);
 return <Workspace key={identity} {...props}/>;
}
