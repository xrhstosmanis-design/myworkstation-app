import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import MonthlyInvoiceAuditPanel from '../../client/src/components/commerce/MonthlyInvoiceAuditPanel.jsx';

window.__monthAuditRequests=[];
function Fixture(){
 const [storeId,setStoreId]=useState('s'),[incomplete,setIncomplete]=useState(false);
 const api=React.useCallback(async(path,options)=>{
  if(options?.method&&options.method!=='GET')throw Error('Mutation forbidden in synthetic fixture');
  const url=new URL(path,'https://synthetic.invalid');window.__monthAuditRequests.push({path:url.pathname,storeId:url.searchParams.get('storeId'),month:url.searchParams.get('month'),page:url.searchParams.get('page')});
  const id=url.searchParams.get('storeId'),month=url.searchParams.get('month');
  if(url.pathname==='/api/reports/invoice-audit-email-preview')return {store:{id},period:{month,nominalLocalTime:month+'-31 23:59'},reportObservedAt:'2026-10-28T12:00:00Z',recipientObservedAt:'2026-10-28T12:00:01Z',separateSnapshots:true,previewOnly:true,readOnly:true,sendingEnabled:false,purposeConsent:'NOT_ASSUMED',reportType:'INVOICE_AUDIT',payload:{subject:'Έλεγχος <img src=x> '+id,body:'PREVIEW-'+id+'\nΠιθανό διπλό — Δεν έχει καταχωριστεί\nΌλοι οι μήνες: 75\n<script>PRIVATE</script>',coverage:{complete:!incomplete}},recipients:{available:true,verifiedCount:1,monthlyConsentEligibleCount:0,identities:[{maskedEmail:'a***@e***.test'}]}};
  return {store:{id,name:'Synthetic'},period:{month},asOf:'2026-10-28T12:00:00Z',coverage:{complete:!incomplete,unavailable:incomplete?['inbound']:[],limited:[]},summary:incomplete?null:{logicalRecords:120,unposted:1,uploadedAwaitingReview:1,possibleDuplicates:2,identityReview:0,credits:0,inactive:0},items:incomplete?[]:[{id:'doc:'+id,documentNumber:'ROW-'+id+' <img src=x>',documentType:'INVOICE',issueDay:'2026-10-02',registeredAt:'2026-10-03T00:00:00Z',supplierName:'Synthetic supplier',supplierTaxId:'099999999',totalCents:1234,status:'UNPOSTED',sources:[],categories:['UNPOSTED_DOCUMENT','POSSIBLE_DUPLICATE'],reasons:['Πιθανό ίδιο παραστατικό· έλεγξε τα πρωτότυπα.']}],nextPage:incomplete||url.searchParams.has('page')?null:'synthetic-next-page',pendingOriginals:{available:true,period:'ALL_MONTHS',counts:{total:75,missingOriginal:60,uploadedAwaitingReview:10,reviewRequired:5},items:[{id:'old',documentNumber:'OLD-2025',documentDate:'2025-01-01',supplierName:'Synthetic old supplier',amount:1,status:'AWAITING_INVOICE'}],truncated:true},allClear:false,readOnly:true,immutableSnapshot:false};
 },[incomplete]);
 return <><div><button onClick={()=>setStoreId('other')}>Αλλαγή καταστήματος</button><button onClick={()=>setStoreId('')}>Καμία επιλογή</button><button onClick={()=>setIncomplete(true)}>Ελλιπής πηγή</button></div><MonthlyInvoiceAuditPanel api={api} storeId={storeId} storeName={storeId==='s'?'Synthetic selected':'Synthetic other'} initialMonth="2026-10"/></>;
}
createRoot(document.getElementById('root')).render(<Fixture/>);
