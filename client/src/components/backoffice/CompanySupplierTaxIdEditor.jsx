import React,{useEffect,useRef,useState} from 'react';
import {supplierContactPath,supplierTaxIdCapability} from '../../../../shared/backoffice-staff-company.mjs';
import useCompanyConfigurationRead from './useCompanyConfigurationRead.js';
import usePartyControlChoice from './usePartyControlChoice.jsx';
import {partyControlReadValid} from './partyControlReadValidation.js';
import {ConfigurationReadState} from './ConfigurationReadPresentation.jsx';

const title='Διόρθωση ΑΦΜ καρτέλας προμηθευτή';

function TaxIdForm({api,companyId,supplier,onSaved}){
 const active=useRef(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>()=>{active.current?.abort();active.current=null},[]);
 async function save(event){
  event.preventDefault();if(active.current)return;
  const values=new FormData(event.currentTarget),controller=new AbortController();
  const body={taxId:values.get('taxId'),reason:values.get('reason'),confirmOriginal:values.has('confirmOriginal'),updatedAt:supplier.updatedAt};
  active.current=controller;setBusy(true);setError('');
  try{
   const result=await api(supplierContactPath+'/'+encodeURIComponent(supplier.id)+'/tax-id',{
    method:'PATCH',headers:{'x-backoffice-company-id':companyId},signal:controller.signal,body:JSON.stringify(body)
   });
   if(controller.signal.aborted)return;
   if(result?.ok!==true||result.companyId!==companyId||result.supplierId!==supplier.id)throw Error('Δεν επιβεβαιώθηκε η διόρθωση της καρτέλας.');
   onSaved();
  }catch(e){if(!controller.signal.aborted)setError(e.message||'Η διόρθωση απέτυχε.')}
  finally{if(!controller.signal.aborted){active.current=null;setBusy(false)}}
 }
 return <form onSubmit={save}>
  <p>Προμηθευτής: <strong>{supplier.name}</strong> · Τρέχον ΑΦΜ: <strong>{supplier.taxId||'—'}</strong></p>
  <p>Η αλλαγή ισχύει για όλη την εταιρεία. Καρτέλα με συνδεδεμένες αγορές ή πληρωμές απαιτεί ειδικό έλεγχο.</p>
  <fieldset disabled={busy}>
   <label>Σωστό ελληνικό ΑΦΜ<input name="taxId" inputMode="numeric" pattern="[0-9]{9}" maxLength={9} required/></label>
   <label>Αιτιολογία<textarea name="reason" minLength={5} maxLength={500} required/></label>
   <label><input type="checkbox" name="confirmOriginal" required/>Έλεγξα το πρωτότυπο και επιβεβαιώνω το σωστό ΑΦΜ.</label>
   <button type="submit">Επιβεβαίωση διόρθωσης ΑΦΜ</button>
  </fieldset>
  {error&&<p role="alert">{error}</p>}
 </form>;
}

function TaxIdWorkspace({api,companyId,authorityKey}){
 const {selected:party,controls}=usePartyControlChoice({api,companyId,authorityKey,customer:false});
 const [saved,setSaved]=useState(null);
 const read=useCompanyConfigurationRead({api,companyId,authorityKey,
  path:party?.active?supplierContactPath+'/'+encodeURIComponent(party.id)+'/card':null,
  enabled:Boolean(party?.active),validate:partyControlReadValid,context:{kind:'card',customer:false,partyId:party?.id??''}});
 const supplier=read.data?.supplier;
 return <section aria-label={title}><h3>{title}</h3>
  {controls}
  {party?.active&&<ConfigurationReadState read={read}/>}
  {party&&!party.active&&<p>Επίλεξε ενεργό προμηθευτή.</p>}
  {saved&&saved===party?.id&&<p role="status">Επιβεβαιώθηκε η διόρθωση ΑΦΜ.</p>}
  {supplier?.active&&<TaxIdForm key={supplier.id+':'+supplier.updatedAt} api={api} companyId={companyId} supplier={supplier} onSaved={()=>{setSaved(supplier.id);read.refresh()}}/>}
 </section>;
}

export default function CompanySupplierTaxIdEditor(props){
 if(!props.companyId||![supplierTaxIdCapability,'supplier-card.read','supplier-control-report.read'].every(key=>props.companyCapabilities?.includes(key)))return <p role="alert">Δεν επιβεβαιώθηκε το δικαίωμα διόρθωσης ΑΦΜ προμηθευτή.</p>;
 return <TaxIdWorkspace key={JSON.stringify([props.companyId,props.authorityKey])} {...props}/>;
}
