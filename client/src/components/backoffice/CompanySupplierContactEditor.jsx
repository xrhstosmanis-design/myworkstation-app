import React,{useEffect,useRef,useState} from 'react';
import {supplierContactCapability,supplierFiscalCapability,supplierContactPath} from '../../../../shared/backoffice-staff-company.mjs';
import useCompanyConfigurationRead from './useCompanyConfigurationRead.js';
import usePartyControlChoice from './usePartyControlChoice.jsx';
import {partyControlReadValid} from './partyControlReadValidation.js';
import {ConfigurationReadState} from './ConfigurationReadPresentation.jsx';

const contactTitle='Επεξεργασία βασικών στοιχείων προμηθευτή';
const fiscalTitle='Φορολογικές και λογιστικές ρυθμίσεις προμηθευτή';
const fiscalTextFields=[
 ['taxOffice','ΔΟΥ',120],['accountingCode','Λογιστικός κωδικός',80],
 ['legacyCode','Κωδικός παλαιού συστήματος',40],['erpCode','Κωδικός ERP',80]
];
const fiscalOptions=[
 ['supplierCategory','Κατηγορία',{A:'Α',B:'Β',C:'Γ'}],
 ['scope','Τύπος',{INTERNAL:'Εσωτερικού',EXTERNAL:'Εξωτερικού'}],
 ['paymentPreference','Προτίμηση πληρωμής',{CREDIT:'Πίστωση',CASH:'Μετρητά'}],
 ['vatMode','Καθεστώς ΦΠΑ',{NORMAL:'Κανονικό',REDUCED:'Μειωμένο',EXEMPT:'Απαλλαγή'}]
];
function FiscalFields({supplier}){
 return <>
  <p>ΑΦΜ καρτέλας: <strong>{supplier.taxId||'—'}</strong></p>
  {fiscalTextFields.map(([key,label,max])=><label key={key}>{label}<input name={key} defaultValue={supplier[key]||''} maxLength={max}/></label>)}
  {fiscalOptions.map(([key,label,options])=><label key={key}>{label}<select required name={key} defaultValue={supplier[key]||''}>
   <option value="">Επίλεξε</option>{Object.entries(options).map(([value,caption])=><option key={value} value={value}>{caption}</option>)}
  </select></label>)}
  <label><input type="checkbox" name="myfEnabled" defaultChecked={supplier.myfEnabled}/>Υπόχρεος ΜΥΦ</label>
 </>;
}
function ContactForm({api,companyId,supplier,onSaved,fiscal}){
 const request=useRef(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>()=>{request.current?.abort();request.current=null},[]);
 async function save(event){
  event.preventDefault();if(request.current)return;
  const form=new FormData(event.currentTarget),controller=new AbortController();
  request.current=controller;setBusy(true);setError('');
  try{
   const field=key=>String(form.get(key)??'').trim()||null;
   const values=fiscal?{
    ...Object.fromEntries([...fiscalTextFields,...fiscalOptions].map(([key])=>[key,field(key)])),
    myfEnabled:form.has('myfEnabled')
   }:{name:field('name'),phone:field('phone'),mobile:field('mobile'),email:field('email')};
   const response=await api(supplierContactPath+'/'+encodeURIComponent(supplier.id)+(fiscal?'/fiscal':'/contact'),{
    method:'PATCH',headers:{'x-backoffice-company-id':companyId},signal:controller.signal,
    body:JSON.stringify({...values,updatedAt:supplier.updatedAt})
   });
   if(controller.signal.aborted)return;
   if(response?.ok!==true||response.companyId!==companyId||response.supplierId!==supplier.id)throw Error('Δεν επιβεβαιώθηκε η αποθήκευση της καρτέλας.');
   onSaved();
  }catch(e){if(!controller.signal.aborted)setError(e.message||'Η αποθήκευση απέτυχε.')}
  finally{if(!controller.signal.aborted){setBusy(false);request.current=null}}
 }
 return <form onSubmit={save}>
  <p>Οι αλλαγές ισχύουν στην καρτέλα προμηθευτή για όλη την εταιρεία.</p>
  {fiscal?<FiscalFields supplier={supplier}/>:<>
  <label>Επωνυμία<input name="name" defaultValue={supplier.name} required maxLength={180}/></label>
  <label>Τηλέφωνο<input name="phone" type="tel" defaultValue={supplier.phone||''} maxLength={40}/></label>
  <label>Κινητό<input name="mobile" type="tel" defaultValue={supplier.mobile||''} maxLength={40}/></label>
  <label>Email<input name="email" type="email" defaultValue={supplier.email||''} maxLength={254}/></label>
  </>}
  {error&&<p role="alert">{error}</p>}
  <button type="submit" disabled={busy}>Αποθήκευση στοιχείων προμηθευτή</button>
 </form>;
}

function SupplierContactWorkspace({api,companyId,authorityKey,fiscal}){
 const choice=usePartyControlChoice({api,companyId,authorityKey,customer:false});
 const party=choice.selected,[saved,setSaved]=useState(null);
 const read=useCompanyConfigurationRead({api,companyId,authorityKey,
  path:party?.active?supplierContactPath+'/'+encodeURIComponent(party.id)+'/card':null,
  enabled:Boolean(party?.active),validate:partyControlReadValid,context:{kind:'card',customer:false,partyId:party?.id??''}});
 const supplier=read.data?.supplier;
 const title=fiscal?fiscalTitle:contactTitle;
 return <section aria-label={title}>
  <h3>{title}</h3>
  {choice.controls}
  {party?.active&&<ConfigurationReadState read={read}/>}
  {party&&!party.active&&<p>Επίλεξε ενεργό προμηθευτή.</p>}
  {saved===party?.id&&<p role="status">Αποθηκεύτηκαν τα στοιχεία του προμηθευτή.</p>}
  {supplier?.active&&<ContactForm key={supplier.id+':'+supplier.updatedAt} api={api} companyId={companyId}
   supplier={supplier} fiscal={fiscal} onSaved={()=>{setSaved(supplier.id);read.refresh()}}/>}
 </section>;
}

export default function CompanySupplierContactEditor(props){
 const fiscal=props.capability===supplierFiscalCapability;
 const allowed=[fiscal?supplierFiscalCapability:supplierContactCapability,'supplier-card.read','supplier-control-report.read'].every(key=>props.companyCapabilities?.includes(key));
 if(!props.companyId||!allowed)return <p role="alert">Δεν επιβεβαιώθηκε η εταιρική πρόσβαση επεξεργασίας προμηθευτή.</p>;
 const key=JSON.stringify([props.companyId,props.authorityKey,fiscal]);
 return <SupplierContactWorkspace key={key} {...props} fiscal={fiscal}/>;
}
