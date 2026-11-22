import React,{useEffect,useRef,useState} from 'react';
import {supplierBalanceAdjustCapability,supplierContactPath,supplierDeactivateCapability,supplierReactivateCapability} from '../../../../shared/backoffice-staff-company.mjs';
import useCompanyConfigurationRead from './useCompanyConfigurationRead.js';
import usePartyControlChoice from './usePartyControlChoice.jsx';
import {partyControlReadValid} from './partyControlReadValidation.js';
import {ConfigurationReadState} from './ConfigurationReadPresentation.jsx';

function SupplierActionForm({api,companyId,supplier,adjust,activate,onSaved}){
 const request=useRef(null),attempt=useRef(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>()=>request.current?.abort(),[]);
 async function save(event){
  event.preventDefault();
  if(request.current)return;
  const values=new FormData(event.currentTarget);
  const reason=String(values.get('reason')||'').trim();
  const fields=adjust?{amount:Number(values.get('amount')),note:reason}:{reason,updatedAt:supplier.updatedAt};
  const fingerprint=JSON.stringify(fields);
  if(attempt.current?.fingerprint!==fingerprint)attempt.current={fingerprint,operationId:crypto.randomUUID()};
  const controller=new AbortController();
  request.current=controller;setError('');setBusy(true);
  try{
   const path=supplierContactPath+'/'+encodeURIComponent(supplier.id)+(adjust?'/balance-adjustments':activate?'/reactivate':'/deactivate');
   const response=await api(path,{method:'POST',headers:{'x-backoffice-company-id':companyId},signal:controller.signal,
    body:JSON.stringify({...fields,confirmed:values.has('confirmed'),operationId:attempt.current.operationId})});
   if(controller.signal.aborted)return;
   if(response?.ok!==true||response.companyId!==companyId||response.supplierId!==supplier.id||
    (adjust?typeof response.id!=='string':response.active!==activate))throw Error('Δεν επιβεβαιώθηκε η ενέργεια.');
   onSaved();
  }catch(e){if(!controller.signal.aborted)setError(e.message||'Η ενέργεια απέτυχε.')}
  finally{if(!controller.signal.aborted){request.current=null;setBusy(false)}}
 }
 return <form onSubmit={save}>
  <p>{supplier.name}</p>
  {adjust&&<label>Προσαρμογή σε ευρώ<input name="amount" type="number" step="0.0001" min="-999999999" max="999999999" required/></label>}
  <label>Αιτιολογία<textarea name="reason" required minLength={5} maxLength={500}/></label>
  <label><input type="checkbox" name="confirmed" required/> {adjust?'Επιβεβαιώνω την αλλαγή στο εταιρικό υπόλοιπο.':activate?'Επιβεβαιώνω την επανενεργοποίηση της κοινής καρτέλας για όλη την εταιρεία.':'Επιβεβαιώνω την απενεργοποίηση της κοινής καρτέλας για όλη την εταιρεία.'}</label>
  {error&&<p role="alert">{error}</p>}
  <button type="submit" disabled={busy}>{adjust?'Καταχώριση προσαρμογής':activate?'Επανενεργοποίηση προμηθευτή':'Απενεργοποίηση προμηθευτή'}</button>
 </form>;
}

function SupplierActionsWorkspace({api,companyId,authorityKey,adjust,activate}){
 const choice=usePartyControlChoice({api,companyId,authorityKey,customer:false});
 const party=choice.selected,[saved,setSaved]=useState(null);
 const eligible=party?.active===!activate;
 const read=useCompanyConfigurationRead({api,companyId,authorityKey,
  path:eligible?supplierContactPath+'/'+encodeURIComponent(party.id)+'/card':null,
  enabled:eligible,validate:partyControlReadValid,context:{kind:'card',customer:false,partyId:party?.id??''}});
 const supplier=read.data?.supplier;
 const title=adjust?'Διόρθωση υπολοίπου προμηθευτή':activate?'Επανενεργοποίηση προμηθευτή':'Απενεργοποίηση προμηθευτή';
 return <section aria-label={title}><h3>{title}</h3>
  {choice.controls}
  {eligible&&<ConfigurationReadState read={read}/>}
  {party&&!eligible&&<p>{activate?'Επίλεξε ανενεργό προμηθευτή.':'Επίλεξε ενεργό προμηθευτή.'}</p>}
  {saved?.supplierId===party?.id&&<p role="status">{adjust?'Καταχωρίστηκε η διόρθωση υπολοίπου.':activate?'Επανενεργοποιήθηκε ο προμηθευτής.':'Απενεργοποιήθηκε ο προμηθευτής.'}</p>}
  {supplier?.active===!activate&&!(saved?.supplierId===supplier.id&&!adjust)&&<SupplierActionForm
   key={supplier.id+':'+supplier.updatedAt+':'+(saved?.sequence||0)} api={api} companyId={companyId} adjust={adjust} activate={activate} supplier={supplier}
   onSaved={()=>{setSaved(previous=>({supplierId:supplier.id,sequence:(previous?.sequence||0)+1}));read.refresh()}}/>}
 </section>;
}

export default function CompanySupplierAccountActions(props){
 const adjust=props.capability===supplierBalanceAdjustCapability;
 const activate=props.capability===supplierReactivateCapability;
 const required=[adjust?supplierBalanceAdjustCapability:activate?supplierReactivateCapability:supplierDeactivateCapability,'supplier-card.read','supplier-control-report.read'];
 if(adjust)required.push('supplier-balances.read');
 if(!props.companyId||!required.every(key=>props.companyCapabilities?.includes(key)))return <p role="alert">Δεν επιβεβαιώθηκε η εταιρική πρόσβαση.</p>;
 return <SupplierActionsWorkspace key={JSON.stringify([props.companyId,props.authorityKey,props.capability])} {...props} adjust={adjust} activate={activate}/>;
}
