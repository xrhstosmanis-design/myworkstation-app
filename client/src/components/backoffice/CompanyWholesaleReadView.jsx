import React,{useRef,useState} from 'react';
import {companyWholesaleActions as actions,companyWholesalePrefix as prefix} from '../../../../shared/backoffice-staff-company-wholesale.mjs';
import {wholesaleTierPriceCapability,wholesaleTierPricePath,wholesalePriceListRenameCapability,wholesalePriceListRenamePath,wholesalePriceListDraftCapability,wholesalePriceListDraftPath} from '../../../../shared/backoffice-staff-company.mjs';
import useCompanyConfigurationRead from './useCompanyConfigurationRead.js';
import {companyWholesaleReadValid as validate} from './companyWholesaleReadValidation.js';
import {ConfigurationReadState as ReadState,ConfigurationReadTable as Table} from './ConfigurationReadPresentation.jsx';
import {WholesaleNamedStores,WholesaleSitePresentation,WholesaleCustomersPresentation,WholesaleListsPresentation,WholesaleTiersPresentation,WholesaleAccountsPresentation,WholesalePublicationsPresentation,WholesaleSellersPresentation,WholesaleAssignmentsPresentation,WholesaleServerPages} from './WholesaleReadPresentation.jsx';
const configs={'wholesale-customers.read':['customers','/customers'],'wholesale-price-lists.read':['lists','/price-lists'],'wholesale-site.read':['site','/site'],'wholesale-portal-accounts.read':['accounts','/portal-accounts'],'wholesale-store-options.read':['stores','/stores']};
function useRead(props,path,kind,context={},enabled=true){return useCompanyConfigurationRead({...props,path:path?prefix+path:null,enabled,validate,context:{kind,...context}})}
function TierPriceForm({items,selected,api,companyId,refresh}){
 const [id,setId]=useState(''),[price,setPrice]=useState(''),[basis,setBasis]=useState(''),[message,setMessage]=useState(null),[busy,setBusy]=useState(false),pending=useRef(false);
 const tier=items.find(row=>row.id===id);
 async function submit(event){
  event.preventDefault();
  if(pending.current||!tier||price===''||!basis)return;
  pending.current=true;setBusy(true);setMessage(null);
  try{
   const result=await api(wholesaleTierPricePath,{method:'POST',headers:{'x-backoffice-company-id':companyId},
    body:JSON.stringify({priceListId:selected.id,tierId:tier.id,expectedVersion:tier.version,unitPrice:Number(price),priceBasis:basis})});
   if(result?.ok!==true||result.companyId!==companyId||result.tierId!==tier.id||result.version!==tier.version+1)throw Error('Δεν επιβεβαιώθηκε η νέα τιμή.');
   setId('');setPrice('');setBasis('');setMessage({text:'Η τιμή αποθηκεύτηκε.'});refresh();
  }catch(error){setMessage({error:true,text:error.message||'Η αποθήκευση απέτυχε.'})}
  finally{pending.current=false;setBusy(false)}
 }
 return <form onSubmit={submit}><fieldset disabled={busy}><legend>Αλλαγή τιμής κλίμακας χονδρικής</legend>
  <label>Κλίμακα<select required value={id} onChange={event=>{const row=items.find(item=>item.id===event.target.value);setId(event.target.value);setPrice(row?.unitPrice??'');setBasis(row?.priceBasis??'');setMessage(null)}}>
   <option value="">Επίλεξε κλίμακα</option>{items.map(row=><option key={row.id} value={row.id}>{row.name} · {row.minimumQuantity}</option>)}
  </select></label>
  <label>Τιμή μονάδας<input type="number" required min="0" max="9999999999.9999" step="0.0001" value={price} onChange={event=>setPrice(event.target.value)}/></label>
  <label>Βάση ΦΠΑ<select required value={basis} onChange={event=>setBasis(event.target.value)}><option value="">Επίλεξε βάση</option><option value="NET">Χωρίς ΦΠΑ</option><option value="GROSS">Με ΦΠΑ</option></select></label>
  {tier?.discountPercent!=null&&<p>Η σταθερή τιμή θα αντικαταστήσει την ποσοστιαία έκπτωση της κλίμακας.</p>}
  <button type="submit" disabled={!tier||price===''||!basis}>Αποθήκευση τιμής</button>
 </fieldset>{message&&<p role={message.error?'alert':'status'}>{message.text}</p>}</form>;
}
function Tiers(props){const {selected}=props,[page,setPage]=useState(1),read=useRead(props,'/price-lists/'+encodeURIComponent(selected.id)+'/products?'+new URLSearchParams({page:String(page),pageSize:'50'}),'tiers',{priceListId:selected.id,page});return <section><h4>Αποθηκευμένες τιμές: {selected.name}</h4><ReadState read={read}/>{read.data&&<><p>{read.data.total} καταχωρισμένες κλίμακες · έως 50 ανά αίτημα.</p><WholesaleTiersPresentation items={read.data.items}/>{selected.active&&props.companyCapabilities?.includes(wholesaleTierPriceCapability)&&<TierPriceForm key={page} {...props} items={read.data.items} refresh={read.refresh}/>} <WholesaleServerPages page={page} pages={Math.max(1,Math.ceil(read.data.total/50))} onPage={setPage} label="Σελίδες κλιμάκων χονδρικής"/></>}</section>}
function PriceListDraftForm({api,companyId,onSaved}){
 const [code,setCode]=useState(''),[name,setName]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState(null);
 const requestInProgress=useRef(false);
 async function submit(event){
  event.preventDefault();
  if(requestInProgress.current||!code.trim()||!name.trim())return;
  requestInProgress.current=true;
  setBusy(true);setMessage(null);
  try{
   const result=await api(wholesalePriceListDraftPath,{method:'POST',headers:{'x-backoffice-company-id':companyId},body:JSON.stringify({code:code.trim(),name:name.trim()})});
   if(result?.ok!==true||result.companyId!==companyId||result.active!==false)throw new Error('Δεν επιβεβαιώθηκε η αποθήκευση του πρόχειρου.');
   setCode('');setName('');setMessage({text:'Ο πρόχειρος τιμοκατάλογος αποθηκεύτηκε.'});
   onSaved();
  }catch(error){setMessage({error:true,text:error.message||'Η αποθήκευση απέτυχε.'})}
  finally{requestInProgress.current=false;setBusy(false)}
 }
 return <form onSubmit={submit}>
  <label>Κωδικός τιμοκαταλόγου<input value={code} onChange={event=>setCode(event.target.value)} maxLength={60} required disabled={busy}/></label>
  <label>Ονομασία τιμοκαταλόγου<input value={name} onChange={event=>setName(event.target.value)} maxLength={160} required disabled={busy}/></label>
  <button disabled={busy} type="submit">Δημιουργία πρόχειρου τιμοκαταλόγου</button>
  {message&&<p role={message.error?'alert':'status'}>{message.text}</p>}
 </form>;
}
function PriceListRenameForm({api,companyId,selected,refresh}){
 const [name,setName]=useState(selected.name),[busy,setBusy]=useState(false),[error,setError]=useState(''),pending=useRef(false);
 async function submit(event){
  event.preventDefault();
  const next=name.trim();
  if(pending.current||!next||next===selected.name)return;
  pending.current=true;setBusy(true);setError('');
  try{
   const result=await api(wholesalePriceListRenamePath,{method:'POST',headers:{'x-backoffice-company-id':companyId},
    body:JSON.stringify({priceListId:selected.id,expectedName:selected.name,name:next})});
   if(result?.ok!==true||result.companyId!==companyId||result.priceListId!==selected.id||result.name!==next)throw new Error('Δεν επιβεβαιώθηκε η νέα ονομασία.');
   refresh();
  }catch(error){setError(error.message||'Η μετονομασία απέτυχε.')}
  finally{pending.current=false;setBusy(false)}
 }
 return <form onSubmit={submit}>
  <label>Νέα ονομασία τιμοκαταλόγου<input value={name} onChange={event=>setName(event.target.value)} maxLength={160} required disabled={busy}/></label>
  <button type="submit" disabled={busy||!name.trim()||name.trim()===selected.name}>Αποθήκευση ονομασίας τιμοκαταλόγου</button>
  {error&&<p role="alert">{error}</p>}
 </form>;
}
function FixedView(props){const [kind,path]=configs[props.capability],read=useRead(props,path,kind),[chosen,setChosen]=useState(null),selected=read.data?.items?.find(row=>row.id===chosen);return <><ReadState read={read}/>{read.data&&(kind==='customers'?<WholesaleCustomersPresentation items={read.data.items}/>:kind==='site'?<WholesaleSitePresentation site={read.data.site}/>:kind==='accounts'?<WholesaleAccountsPresentation items={read.data.items}/>:kind==='stores'?<Table label="Ονομασίες καταστημάτων χονδρικής" items={read.data.items} columns={[["name","Κατάστημα"]]}/>:<>{props.companyCapabilities?.includes(wholesalePriceListDraftCapability)&&<PriceListDraftForm api={props.api} companyId={props.companyId} onSaved={read.refresh}/>}<WholesaleListsPresentation items={read.data.items} onSelect={row=>setChosen(row.id)}/>{selected&&props.companyCapabilities?.includes(wholesalePriceListRenameCapability)&&<PriceListRenameForm key={JSON.stringify([selected.id,selected.name])} api={props.api} companyId={props.companyId} selected={selected} refresh={read.refresh}/>} {selected&&<Tiers key={selected.id} {...props} selected={selected}/>}</>)}</>}
function SearchControl({draft,onChange,onSubmit,label}){return <form onSubmit={onSubmit}><label>{label}<input aria-label={label} maxLength={160} value={draft} onChange={e=>onChange(e.target.value)}/></label><button type="submit">Εφαρμογή αναζήτησης χονδρικής</button></form>}
function useSearch(){const [draft,setDraft]=useState(''),[q,setQuery]=useState(''),[error,setError]=useState('');return{draft,q,error,dirty:draft.trim()!==q,change(value){setDraft(value);setError('')},apply(e){e.preventDefault();const value=draft.trim();if(value.length>160||/[\u0000-\u001f\u007f]/.test(value)){setError('Η αναζήτηση δέχεται έως 160 χαρακτήρες.');return false}setQuery(value);setError('');return true}}}
function Publications(props){const stores=useRead(props,'/stores','stores'),site=useRead(props,'/site','site'),[storeId,setStore]=useState(''),[page,setPage]=useState(1),search=useSearch(),store=stores.data?.items.find(row=>row.id===storeId),enabled=Boolean(store&&site.data?.site&&!search.dirty),read=useRead(props,enabled?'/publications?'+new URLSearchParams({storeId,q:search.q,page:String(page),pageSize:'50'}):null,'publications',{storeId,q:search.q,page},enabled);return <><ReadState read={stores}/><ReadState read={site}/>{site.data&&site.data.site===null&&<WholesaleSitePresentation site={null}/>} {stores.data&&<WholesaleNamedStores items={stores.data.items} value={storeId} onChange={value=>{setStore(value);setPage(1)}}/>}<SearchControl draft={search.draft} onChange={value=>{search.change(value);setPage(1)}} onSubmit={e=>{if(search.apply(e)){setPage(1);read.refresh()}}} label="Αναζήτηση δημοσιευμένων προϊόντων χονδρικής"/>{search.error&&<p role="alert">{search.error}</p>}{enabled&&<ReadState read={read}/>} {read.data&&<><p>Κατάστημα: {store.name} · {read.data.total} προϊόντα. Η κατάσταση δημοσίευσης δεν δεσμεύει απόθεμα.</p><WholesalePublicationsPresentation items={read.data.items}/><WholesaleServerPages page={page} pages={Math.max(1,Math.ceil(read.data.total/50))} onPage={setPage} label="Σελίδες δημοσιεύσεων χονδρικής"/></>}</>}
function AssignmentRows(props){const {selected,storeId}=props,[page,setPage]=useState(1),read=useRead(props,'/sellers/'+encodeURIComponent(selected.id)+'/assignments?'+new URLSearchParams({storeId,page:String(page),pageSize:'50'}),'assignments',{userId:selected.id,storeId,page});return <section><h4>Αναθέσεις: {selected.fullName}</h4>{!selected.memberActive&&<p>Δεν υπάρχει ενεργή ιδιότητα πωλητή. Οι αποθηκευμένες αναθέσεις δεν αρκούν για πρόσβαση.</p>}<ReadState read={read}/>{read.data&&<><WholesaleAssignmentsPresentation items={read.data.items}/><WholesaleServerPages page={page} pages={Math.max(1,Math.ceil(read.data.total/50))} onPage={setPage} label="Σελίδες αναθέσεων χονδρικής"/></>}</section>}
function Sellers(props){const assignments=props.capability==='wholesale-seller-assignments.read',search=useSearch(),[page,setPage]=useState(1),[chosen,setChosen]=useState(''),[storeId,setStore]=useState(''),stores=useRead(props,assignments?'/stores':null,'stores',{},assignments),read=useRead(props,'/sellers?'+new URLSearchParams({q:search.q,page:String(page),pageSize:'50'}),'sellers',{q:search.q,page},!search.dirty),selected=read.data?.items.find(row=>row.id===chosen),store=stores.data?.items.find(row=>row.id===storeId);return <><SearchControl draft={search.draft} onChange={value=>{search.change(value);setPage(1);setChosen('')}} onSubmit={e=>{if(search.apply(e)){setPage(1);setChosen('');read.refresh()}}} label="Αναζήτηση ονόματος ή email πωλητή χονδρικής"/>{search.error&&<p role="alert">{search.error}</p>}{!search.dirty&&<ReadState read={read}/>} {read.data&&<><WholesaleSellersPresentation items={read.data.items} onSelect={assignments?row=>setChosen(row.id):undefined}/><WholesaleServerPages page={page} pages={Math.max(1,Math.ceil(read.data.total/50))} onPage={value=>{setPage(value);setChosen('')}} label="Σελίδες πωλητών χονδρικής"/></>}{assignments&&<ReadState read={stores}/>} {assignments&&stores.data&&<WholesaleNamedStores items={stores.data.items} value={storeId} onChange={setStore}/>} {selected&&store&&<AssignmentRows key={JSON.stringify([selected.id,storeId,search.q,page])} {...props} selected={selected} storeId={storeId}/>}</>}
function required(key,seen=new Set()){if(seen.has(key))return seen;seen.add(key);for(const parent of actions.find(row=>row.key===key)?.requires??[])required(parent,seen);return seen}
export default function CompanyWholesaleReadView(props){const action=actions.find(row=>row.key===props.capability),allowed=Boolean(action&&props.companyId&&[...required(action.key)].every(key=>props.companyCapabilities?.includes(key)));if(!allowed)return <p role="alert">Δεν επιβεβαιώθηκαν τα δικαιώματα χονδρικής και οι ρητές ονομαστικές επιλογές.</p>;const identity=JSON.stringify([props.companyId,props.capability,props.authorityKey,props.companyCapabilities]),next={...props,authorityKey:identity};return <section aria-label="Εταιρικές προβολές χονδρικής μόνο ανάγνωση"><h3>{action.label}</h3><p>{props.capability==='wholesale-price-lists.read'&&props.companyCapabilities?.includes(wholesalePriceListDraftCapability)?'Προβολή τιμοκαταλόγων και δημιουργία ανενεργών πρόχειρων.':props.capability==='wholesale-price-lists.read'&&props.companyCapabilities?.includes(wholesalePriceListRenameCapability)?'Προβολή και μετονομασία τιμοκαταλόγων.':props.capability==='wholesale-price-lists.read'&&props.companyCapabilities?.includes(wholesaleTierPriceCapability)?'Προβολή και αλλαγή τιμών κλιμάκων.':'Μόνο ανάγνωση των καταχωρισμένων στοιχείων της τρέχουσας εταιρείας.'} Απαιτείται ενεργή πληρωμένη Χονδρική B2B. Δεν ενεργοποιούνται προσβάσεις, αναθέσεις, δημοσιεύσεις ή παραγγελίες.</p>{configs[props.capability]?<FixedView key={identity} {...next}/>:props.capability==='wholesale-publications.read'?<Publications key={identity} {...next}/>:<Sellers key={identity} {...next}/>}</section>}
