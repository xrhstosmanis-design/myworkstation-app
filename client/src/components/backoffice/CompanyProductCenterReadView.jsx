import React,{useRef,useState} from 'react';
import {greeceDateInput,greeceRangeDate} from '../../../../shared/greece-time.mjs';
import {productDescriptionCapability,productDescriptionPath,promotionActivateCapability,promotionActivatePath,productRenameCapability,productRenamePath,promotionDraftCapability,promotionDraftPath} from '../../../../shared/backoffice-staff-company.mjs';
import * as contract from '../../../../shared/backoffice-staff-company-product-center.mjs';
import useCompanyConfigurationRead from './useCompanyConfigurationRead.js';
import useProductCenterChoice from './useProductCenterChoice.jsx';
import {productCenterReadValid as validate} from './productCenterReadValidation.js';
import {ConfigurationReadState as ReadState,ConfigurationReadTable as Table} from './ConfigurationReadPresentation.jsx';
import ProductCenterPriceReadView from './ProductCenterPriceReadView.jsx';
import {ProductReadScalars,ProductReadTable,productReadValue} from './ProductCenterReadPresentation.jsx';
const prefix=contract.companyProductCenterPrefix;
function useRead(props,path,kind,context={},enabled=true){return useCompanyConfigurationRead({...props,path:path?prefix+path:null,enabled,validate,context:{kind,...context}})}
const kinds={'product-card.read':'card','product-barcodes.read':'barcodes','product-details.read':'details','product-set.read':'set','product-stock-package.read':'package','product-delivery.read':'delivery','product-price-history.read':'history','product-purchases.read':'purchases'},suffixes={card:'card',barcodes:'barcodes',details:'details',set:'set',package:'stock-package',delivery:'delivery',history:'price-history',purchases:'purchases'};
function StoreChoice({items,value,onChange,label='Ονομασία καταστήματος προϊόντος'}){return <label>Κατάστημα<select aria-label={label} value={value} onChange={e=>onChange(e.target.value)}><option value="">Επίλεξε κατάστημα με το όνομά του</option>{items.map(row=><option key={row.id} value={row.id}>{row.name}</option>)}</select></label>}
function ProductRenameForm({product,api,companyId,refresh}){
 const [name,setName]=useState(product.name),[busy,setBusy]=useState(false),[error,setError]=useState(''),pending=useRef(false);
 async function submit(event){
  event.preventDefault();
  const next=name.trim();
  if(pending.current||!next||next===product.name)return;
  pending.current=true;setBusy(true);setError('');
  try{
   const result=await api(productRenamePath,{method:'POST',headers:{'x-backoffice-company-id':companyId},
    body:JSON.stringify({productId:product.id,expectedName:product.name,name:next})});
   if(result?.ok!==true||result.companyId!==companyId||result.productId!==product.id||result.name!==next)throw new Error('Δεν επιβεβαιώθηκε η νέα ονομασία.');
   refresh();
  }catch(error){setError(error.message||'Η μετονομασία απέτυχε.')}
  finally{pending.current=false;setBusy(false)}
 }
 return <form onSubmit={submit}>
  <label>Νέα ονομασία προϊόντος<input value={name} onChange={event=>setName(event.target.value)} maxLength={200} required disabled={busy}/></label>
  <button type="submit" disabled={busy||!name.trim()||name.trim()===product.name}>Αποθήκευση ονομασίας</button>
  {error&&<p role="alert">{error}</p>}
 </form>;
}
function ProductDescriptionForm({product,api,companyId,refresh}){
 const [description,setDescription]=useState(product.description??''),[busy,setBusy]=useState(false),[error,setError]=useState(''),pending=useRef(false);
 const next=description.trim()||null;
 async function submit(event){
  event.preventDefault();
  if(pending.current||next===product.description)return;
  pending.current=true;setBusy(true);setError('');
  try{
   const result=await api(productDescriptionPath,{method:'POST',headers:{'x-backoffice-company-id':companyId},
    body:JSON.stringify({productId:product.id,expectedDescription:product.description,description:next??''})});
   if(result?.ok!==true||result.companyId!==companyId||result.productId!==product.id||result.description!==next)throw Error('Δεν επιβεβαιώθηκε η νέα περιγραφή.');
   refresh();
  }catch(error){setError(error.message||'Η αποθήκευση απέτυχε.')}
  finally{pending.current=false;setBusy(false)}
 }
 return <form onSubmit={submit}>
  <label>Περιγραφή κοινού προϊόντος<textarea value={description} onChange={event=>setDescription(event.target.value)} maxLength={1000} disabled={busy}/></label>
  <button type="submit" disabled={busy||next===product.description}>Αποθήκευση περιγραφής</button>
  {error&&<p role="alert">{error}</p>}
 </form>;
}
function NamedProduct(props){const choice=useProductCenterChoice(props),selected=choice.selected,kind=kinds[props.capability],packageMode=kind==='package',purchases=kind==='purchases',[storeId,setStore]=useState(''),today=greeceDateInput(),[draft,setDraft]=useState({from:today.slice(0,4)+'-01-01',to:today}),[request,setRequest]=useState(null),[error,setError]=useState(''),stores=useCompanyConfigurationRead({...props,path:'/api/owner-products/stores',enabled:purchases,validate,context:{kind:'stores'}}),options=packageMode?choice.read.data?.stores:stores.data?.items.filter(row=>row.active),store=options?.find(row=>row.id===storeId),current=request&&request.productId===selected?.id&&request.storeId===storeId?request:null,enabled=Boolean(selected&&(!packageMode||store)&&(!purchases||current)),params=packageMode?new URLSearchParams({storeId}):purchases&&current?new URLSearchParams({storeId,from:current.from,to:current.to}):null,path=enabled?'/products/'+encodeURIComponent(selected.id)+'/'+suffixes[kind]+(params?'?'+params:''):null,read=useRead(props,path,kind,{productId:selected?.id??'',storeId,from:current?.from??'',to:current?.to??''},enabled);
 function apply(e){e.preventDefault();setError('');if(!selected||!store){setError('Επίλεξε προϊόν και κατάστημα με το όνομά τους.');return}if(!greeceRangeDate(draft.from)||!greeceRangeDate(draft.to)||draft.from>draft.to||draft.from<'2000-01-01'||draft.to>'2100-12-31'){setError('Επίλεξε έγκυρο ημερολογιακό διάστημα.');return}setRequest({...draft,storeId,productId:selected.id});read.refresh()}
 return <>{choice.controls}{purchases&&<ReadState read={stores}/>} {(packageMode||purchases)&&options&&<StoreChoice items={options} value={storeId} onChange={value=>{setStore(value);setRequest(null)}}/>}{purchases&&<form onSubmit={apply}><label>Από<input aria-label="Αγορές προϊόντος από" type="date" value={draft.from} onChange={e=>{setDraft({...draft,from:e.target.value});setRequest(null)}}/></label><label>Έως<input aria-label="Αγορές προϊόντος έως" type="date" value={draft.to} onChange={e=>{setDraft({...draft,to:e.target.value});setRequest(null)}}/></label><button type="submit">Προβολή αγορών προϊόντος</button></form>}{error&&<p role="alert">{error}</p>}{enabled&&<ReadState read={read}/>} {packageMode&&(read.error||choice.read.error)&&<p>Η συσκευασία δεν είναι διαθέσιμη. Δεν έχει επιβεβαιωθεί αν υπάρχει καταχωρισμένη σύνδεση.</p>} {read.data&&<section aria-label="Στοιχεία επιλεγμένου προϊόντος μόνο ανάγνωση"><h4>{selected.name}</h4>{kind==='card'&&<>{props.companyCapabilities?.includes(productDescriptionCapability)&&<ProductDescriptionForm key={JSON.stringify([read.data.product.id,read.data.product.description])} product={read.data.product} api={props.api} companyId={props.companyId} refresh={read.refresh}/>} {props.companyCapabilities?.includes(productRenameCapability)&&<ProductRenameForm key={JSON.stringify([read.data.product.id,read.data.product.name])} product={read.data.product} api={props.api} companyId={props.companyId} refresh={read.refresh}/>}<ProductReadScalars label="Βασικά στοιχεία καρτέλας προϊόντος" value={read.data.product} fields={contract.productCenterCardFields}/><ProductReadTable label="Στοιχεία προϊόντος ανά κατάστημα" items={read.data.stores} fields={contract.productCenterStoreFields} valueFormatters={{salePrice:value=>value===null?'Χωρίς τοπική τιμή · κληρονομείται η βασική τιμή':productReadValue(value,'salePrice','number'),minStock:value=>value===null?'Δεν έχει οριστεί ελάχιστο απόθεμα':productReadValue(value,'minStock','number')}}/></>}{kind==='barcodes'&&<ProductReadTable label="Barcode επιλεγμένου προϊόντος" items={read.data.items} fields={contract.productCenterBarcodeFields}/>} {kind==='delivery'&&<ProductReadScalars label="Καταχωρισμένες ρυθμίσεις delivery προϊόντος" value={read.data.product} fields={contract.productCenterDeliveryFields}/>} {kind==='history'&&<><p>Έως 100 πρόσφατες μεταβολές τιμής του προϊόντος. Άγνωστη προηγούμενη ή νέα τιμή παραμένει μη διαθέσιμη, όχι μηδενική.</p><ProductReadTable label="Ιστορικό τιμών επιλεγμένου προϊόντος" items={read.data.items} fields={contract.productCenterPriceHistoryFields}/></>}{kind==='set'&&<><p>Καταχωρισμένα συστατικά SET. Η συνταγή υλικών έχει την ανεξάρτητη προβολή παρασκευής. Δεν αλλάζει η σύνθεση ή το απόθεμα.</p>{read.data.incomplete&&<p>Υπάρχουν {read.data.unavailableCount} μη διαθέσιμα συστατικά. Η ταυτότητα και οι βασικές τιμές τους δεν εμφανίζονται.</p>}<ProductReadTable label="Συστατικά SET επιλεγμένου προϊόντος" items={read.data.setItems} fields={contract.productCenterSetFields}/></>}{kind==='package'&&(read.data.current===null?<p>Δεν υπάρχει καταχωρισμένη σύνδεση συσκευασίας στο επιλεγμένο κατάστημα.</p>:<><p>Η συσκευασία χρησιμοποιεί το απόθεμα του βασικού είδους στο επιλεγμένο κατάστημα.</p>{read.data.current.unavailable?<p>Το συνδεδεμένο βασικό είδος δεν είναι διαθέσιμο. Δεν εμφανίζεται ταυτότητα άλλης εταιρείας.</p>:<p>Βασικό είδος: {read.data.current.baseProductName}{read.data.current.baseProductSku?' · '+read.data.current.baseProductSku:''}</p>}<p>Τεμάχια ανά συσκευασία: {read.data.current.unitsPerPackage.toLocaleString('el-GR',{maximumFractionDigits:4})}</p></>)}{kind==='details'&&<><p>Έως 250 πρόσφατες εγγραφές αγοράς από την πηγή. Τα στατιστικά διατηρούν τον δικό τους υπολογισμό και δεν είναι άθροισμα μόνο του παραθύρου.</p>{read.data.latestSupplier&&<p>Τελευταίος προμηθευτής αγοράς: {read.data.latestSupplier.supplierName}</p>}<ProductReadTable label="Προμηθευτές επιλεγμένου προϊόντος" items={read.data.supplierCodes} fields={contract.productCenterSupplierCodeFields}/><ProductReadScalars label="Στατιστικά επιλεγμένου προϊόντος" value={read.data.statistics} fields={contract.productCenterStatisticFields}/><ProductReadTable label="Αρχείο αγορών καρτέλας προϊόντος" items={read.data.purchases} fields={contract.productCenterPurchaseFields}/></>}{purchases&&<><p>Έως 1.000 εγγραφές παραγγελιών αγοράς του επιλεγμένου προϊόντος και καταστήματος. Δεν περιλαμβάνει συνημμένα ή ενέργειες παραστατικών.</p><ProductReadTable label="Παραγγελίες αγοράς επιλεγμένου προϊόντος" items={read.data.items} fields={contract.productCenterOrderPurchaseFields}/></>}</section>}</>}
function PromotionDraftForm(props){
 const {selected,api,companyId}=props,today=greeceDateInput();
 const stores=useCompanyConfigurationRead({...props,path:'/api/owner-products/stores',enabled:true,validate,context:{kind:'stores'}});
 const [storeId,setStoreId]=useState(''),[discount,setDiscount]=useState(''),[from,setFrom]=useState(today),[to,setTo]=useState(today);
 const [busy,setBusy]=useState(false),[message,setMessage]=useState(null),pending=useRef(false);
 const options=stores.data?.items.filter(row=>row.active)??[];
 async function submit(event){
  event.preventDefault();
  if(pending.current||!selected||!options.some(row=>row.id===storeId)||!discount||from>to)return;
  pending.current=true;setBusy(true);setMessage(null);
  try{
   const result=await api(promotionDraftPath,{method:'POST',headers:{'x-backoffice-company-id':companyId},body:JSON.stringify({productId:selected.id,storeId,discountPercent:Number(discount),from,to})});
   if(result?.ok!==true||result.companyId!==companyId||result.active!==false)throw new Error('Δεν επιβεβαιώθηκε η αποθήκευση της προσφοράς.');
   setDiscount('');setMessage({text:'Η πρόχειρη προσφορά αποθηκεύτηκε.'});
  }catch(error){setMessage({error:true,text:error.message||'Η αποθήκευση απέτυχε.'})}
  finally{pending.current=false;setBusy(false)}
 }
 return <><ReadState read={stores}/><form onSubmit={submit}>
  <fieldset disabled={busy}><legend>Πρόχειρη προσφορά</legend>
   <StoreChoice items={options} value={storeId} onChange={setStoreId} label="Κατάστημα πρόχειρης προσφοράς"/>
   <label>Έκπτωση (%)<input type="number" min="0.01" max="100" step="0.01" required value={discount} onChange={event=>setDiscount(event.target.value)}/></label>
   <label>Από<input type="date" required value={from} onChange={event=>setFrom(event.target.value)}/></label>
   <label>Έως<input type="date" required min={from} value={to} onChange={event=>setTo(event.target.value)}/></label>
   <button type="submit" disabled={!selected||!storeId}>Αποθήκευση ανενεργής προσφοράς</button>
  </fieldset>
  {message&&<p role={message.error?'alert':'status'}>{message.text}</p>}
 </form></>;
}
function PromotionDraftActivation(props){
 const [selectedId,setSelectedId]=useState(''),[confirmed,setConfirmed]=useState(false);
 const [busy,setBusy]=useState(false),[message,setMessage]=useState(null),pending=useRef(false);
 const read=useCompanyConfigurationRead({...props,path:promotionActivatePath,enabled:true,
  validate:(value,{companyId})=>value?.companyId===companyId&&Array.isArray(value.items)&&value.items.length<=100&&
    value.items.every(row=>typeof row.id==='string'&&typeof row.productName==='string'&&typeof row.storeName==='string'&&
      typeof row.updatedAt==='string'&&Number.isFinite(Date.parse(row.updatedAt))&&Number.isFinite(row.discountPercent))});
 const selected=read.data?.items.find(row=>row.id===selectedId);
 async function submit(event){
  event.preventDefault();
  if(pending.current||!selected||!confirmed)return;
  pending.current=true;setBusy(true);setMessage(null);
  try{
   const result=await props.api(promotionActivatePath,{method:'POST',headers:{'x-backoffice-company-id':props.companyId},
    body:JSON.stringify({promotionId:selected.id,expectedUpdatedAt:selected.updatedAt,confirm:true})});
   if(result?.ok!==true||result.companyId!==props.companyId||result.id!==selected.id||result.active!==true)throw Error('Δεν επιβεβαιώθηκε η ενεργοποίηση.');
   setSelectedId('');setMessage({text:'Η προσφορά ενεργοποιήθηκε.'});read.refresh();
  }catch(error){setMessage({error:true,text:error.message||'Η ενεργοποίηση απέτυχε.'});read.refresh()}
  finally{setConfirmed(false);pending.current=false;setBusy(false)}
 }
 return <section aria-label="Ενεργοποίηση πρόχειρης προσφοράς">
  <ReadState read={read}/>
  {read.data&&<form onSubmit={submit}><fieldset disabled={busy}><legend>Ενεργοποίηση πρόχειρης προσφοράς</legend>
   <label>Πρόχειρη προσφορά<select value={selectedId} onChange={event=>{setSelectedId(event.target.value);setConfirmed(false)}}>
    <option value="">Επίλεξε προσφορά</option>
    {read.data.items.map(row=><option key={row.id} value={row.id}>{row.productName} · {row.storeName} · {row.discountPercent}% · {greeceDateInput(row.validFrom)} έως {greeceDateInput(row.validUntil)}</option>)}
   </select></label>
   <label><input type="checkbox" checked={confirmed} disabled={!selected} onChange={event=>setConfirmed(event.target.checked)}/>Επιβεβαιώνω την ενεργοποίηση στο POS</label>
   <button type="submit" disabled={!selected||!confirmed}>Ενεργοποίηση προσφοράς</button>
  </fieldset></form>}
  {message&&<p role={message.error?'alert':'status'}>{message.text}</p>}
 </section>;
}
function Catalog(props){const draft=props.companyCapabilities?.includes(promotionDraftCapability)&&props.companyCapabilities.includes('stores.read'),choice=useProductCenterChoice({...props,hideChoice:!draft});return <>{choice.controls}{props.companyCapabilities?.includes(promotionActivateCapability)&&<PromotionDraftActivation {...props}/>} {draft&&choice.selected&&<PromotionDraftForm key={choice.selected.id} {...props} selected={choice.selected}/>}{choice.read.data&&<><p>Έως 500 ενεργά προϊόντα του καταλόγου. Η επιλογή καρτέλας, barcode, κόστους ή ιστορικού έχει ξεχωριστό δικαίωμα.</p><ProductReadTable label="Κατάλογος ενεργών προϊόντων Owner" items={choice.read.data.items} fields={contract.productCenterCatalogFields}/></>}</>}
function required(key,seen=new Set()){if(seen.has(key))return seen;seen.add(key);for(const parent of contract.companyProductCenterActions.find(row=>row.key===key)?.requires??[])required(parent,seen);return seen}
export default function CompanyProductCenterReadView(props){const action=contract.companyProductCenterActions.find(row=>row.key===props.capability),allowed=Boolean(action&&props.companyId&&[...required(action.key)].every(key=>props.companyCapabilities?.includes(key)));if(!allowed)return <p role="alert">Δεν επιβεβαιώθηκε η προβολή προϊόντος και η ρητή ονομαστική επιλογή.</p>;const identity=JSON.stringify([props.companyId,props.capability,props.authorityKey,props.companyCapabilities]),next={...props,authorityKey:identity};return <section aria-label="Προβολές προϊόντων και τιμοκαταλόγων μόνο ανάγνωση"><h3>{action.label}</h3><p>Μόνο καταχωρισμένα στοιχεία της τρέχουσας εταιρείας, χωρίς αλλαγές, εκτύπωση, εισαγωγή ή εντολές.</p>{props.capability==='product-center.read'?<Catalog key={identity} {...next}/>:kinds[props.capability]?<NamedProduct key={identity} {...next}/>:<ProductCenterPriceReadView key={identity} {...next}/>}</section>}
