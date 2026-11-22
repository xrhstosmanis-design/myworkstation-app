import React,{useEffect,useRef,useState} from 'react';
import {supplierContactCapability,supplierContactPath} from '../../../../shared/backoffice-staff-company.mjs';
import useCompanyConfigurationRead from './useCompanyConfigurationRead.js';
import usePartyControlChoice from './usePartyControlChoice.jsx';
import {partyControlReadValid} from './partyControlReadValidation.js';
import {ConfigurationReadState} from './ConfigurationReadPresentation.jsx';

function ContactForm({api,companyId,supplier,onSaved}){
 const request=useRef(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>()=>{request.current?.abort();request.current=null},[]);
 async function save(event){
  event.preventDefault();if(request.current)return;
  const form=new FormData(event.currentTarget),controller=new AbortController();
  request.current=controller;setBusy(true);setError('');
  try{
   const response=await api(supplierContactPath+'/'+encodeURIComponent(supplier.id)+'/contact',{
    method:'PATCH',headers:{'x-backoffice-company-id':companyId},signal:controller.signal,
    body:JSON.stringify({name:String(form.get('name')).trim(),phone:String(form.get('phone')).trim()||null,
     mobile:String(form.get('mobile')).trim()||null,email:String(form.get('email')).trim()||null,updatedAt:supplier.updatedAt})
   });
   if(controller.signal.aborted)return;
   if(response?.ok!==true||response.companyId!==companyId||response.supplierId!==supplier.id)throw Error('Δεν επιβεβαιώθηκε η αποθήκευση της καρτέλας.');
   onSaved();
  }catch(e){if(!controller.signal.aborted)setError(e.message||'Η αποθήκευση απέτυχε.')}
  finally{if(!controller.signal.aborted){setBusy(false);request.current=null}}
 }
 return <form onSubmit={save}>
  <p>Οι αλλαγές ισχύουν στην καρτέλα προμηθευτή για όλη την εταιρεία.</p>
  <label>Επωνυμία<input name="name" defaultValue={supplier.name} required maxLength={180}/></label>
  <label>Τηλέφωνο<input name="phone" type="tel" defaultValue={supplier.phone||''} maxLength={40}/></label>
  <label>Κινητό<input name="mobile" type="tel" defaultValue={supplier.mobile||''} maxLength={40}/></label>
  <label>Email<input name="email" type="email" defaultValue={supplier.email||''} maxLength={254}/></label>
  {error&&<p role="alert">{error}</p>}
  <button type="submit" disabled={busy}>Αποθήκευση στοιχείων προμηθευτή</button>
 </form>;
}

function SupplierContactWorkspace({api,companyId,authorityKey}){
 const choice=usePartyControlChoice({api,companyId,authorityKey,customer:false});
 const party=choice.selected,[saved,setSaved]=useState(null);
 const read=useCompanyConfigurationRead({api,companyId,authorityKey,
  path:party?.active?supplierContactPath+'/'+encodeURIComponent(party.id)+'/card':null,
  enabled:Boolean(party?.active),validate:partyControlReadValid,context:{kind:'card',customer:false,partyId:party?.id??''}});
 const supplier=read.data?.supplier;
 return <section aria-label="Επεξεργασία βασικών στοιχείων προμηθευτή">
  <h3>Επεξεργασία βασικών στοιχείων προμηθευτή</h3>
  {choice.controls}
  {party?.active&&<ConfigurationReadState read={read}/>}
  {party&&!party.active&&<p>Επίλεξε ενεργό προμηθευτή.</p>}
  {saved===party?.id&&<p role="status">Αποθηκεύτηκαν τα στοιχεία του προμηθευτή.</p>}
  {supplier?.active&&<ContactForm key={supplier.id+':'+supplier.updatedAt} api={api} companyId={companyId}
   supplier={supplier} onSaved={()=>{setSaved(supplier.id);read.refresh()}}/>}
 </section>;
}

export default function CompanySupplierContactEditor(props){
 const allowed=[supplierContactCapability,'supplier-card.read','supplier-control-report.read'].every(key=>props.companyCapabilities?.includes(key));
 if(!props.companyId||!allowed)return <p role="alert">Δεν επιβεβαιώθηκε η εταιρική πρόσβαση επεξεργασίας προμηθευτή.</p>;
 const key=JSON.stringify([props.companyId,props.authorityKey]);
 return <SupplierContactWorkspace key={key} {...props}/>;
}
