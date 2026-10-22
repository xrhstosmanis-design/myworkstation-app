import React,{useEffect,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {installOfflineStorageGuard} from './storage-guard.mjs';
import StorePosPanel from '../../client/src/components/store/StorePosPanel.jsx';
import '../../client/src/pos-payment-minimize-bootstrap.js';

// This entry is bundled only by ops/pos-ui-lab/build.mjs, never by the product
// entry. Every record below belongs to a synthetic, isolated visual fixture.
const STORE_ID='pos-ui-lab-only';
const BASE=`/api/store-pos/stores/${STORE_ID}`;
const TRANSACTIONS=`/api/transactions/stores/${STORE_ID}`;
const CACHE_KEY=`myworkstation:offline-pos-catalog:${STORE_ID}`;
const store={id:STORE_ID,companyId:'pos-ui-lab-company',name:'MYWORKSTATION LAB · ΣΥΝΘΕΤΙΚΟ',active:true};
const operator={id:'pos-ui-lab-operator',employeeId:'pos-ui-lab-operator',companyId:store.companyId,fullName:'ΧΕΙΡΙΣΤΗΣ LAB',terminalPos:'LAB-VISUAL-ONLY'};
const company={id:store.companyId,name:'ΣΥΝΘΕΤΙΚΗ ΕΤΑΙΡΕΙΑ LAB'};
const labels=['ΚΑΦΕΣ','ΡΟΦΗΜΑΤΑ','ΝΕΡΑ','ΑΝΑΨΥΚΤΙΚΑ','ΧΥΜΟΙ','ΣΑΝΤΟΥΙΤΣ','ΣΦΟΛΙΑΤΕΣ','ΤΟΣΤ','ΜΠΑΡΕΣ','ΣΟΚΟΛΑΤΕΣ','ΜΠΙΣΚΟΤΑ','ΠΑΓΩΤΑ','ΓΑΛΑΚΤΟΚΟΜΙΚΑ','ΕΙΔΗ ΠΡΩΙΝΟΥ','ΑΡΤΟΣΚΕΥΑΣΜΑΤΑ','ΞΗΡΟΙ ΚΑΡΠΟΙ','ΤΣΙΧΛΕΣ','ΕΙΔΗ ΥΓΙΕΙΝΗΣ','ΑΞΕΣΟΥΑΡ','ΔΙΑΦΟΡΑ'];
const names=['ΕΛΛΗΝΙΚΟΣ ΚΑΦΕΣ ΜΟΝΟΣ','ΣΟΚΟΛΑΤΑ ΖΕΣΤΗ ΜΕΓΑΛΗ','ΝΕΡΟ 500ML','ΑΝΑΨΥΚΤΙΚΟ ZERO 330ML','ΧΥΜΟΣ ΠΟΡΤΟΚΑΛΙ 250ML','ΣΑΝΤΟΥΙΤΣ ΓΑΛΟΠΟΥΛΑ','ΤΥΡΟΠΙΤΑ ΚΟΥΡΟΥ','ΤΟΣΤ ΤΥΡΙ ΓΑΛΟΠΟΥΛΑ','ΜΠΑΡΑ ΔΗΜΗΤΡΙΑΚΩΝ 60G','ΣΟΚΟΛΑΤΑ ΓΑΛΑΚΤΟΣ 100G','ΜΠΙΣΚΟΤΑ ΓΕΜΙΣΤΑ 150G','ΠΑΓΩΤΟ ΒΑΝΙΛΙΑ 120ML','ΓΙΑΟΥΡΤΙ ΣΤΡΑΓΓΙΣΤΟ 200G','ΔΗΜΗΤΡΙΑΚΑ ΠΡΩΙΝΟΥ 250G','ΚΟΥΛΟΥΡΙ ΘΕΣΣΑΛΟΝΙΚΗΣ','ΑΜΥΓΔΑΛΑ ΑΝΑΛΑΤΑ 100G','ΤΣΙΧΛΕΣ ΔΥΟΣΜΟΣ','ΧΑΡΤΟΜΑΝΤΗΛΑ ΠΑΚΕΤΟ','ΚΑΛΩΔΙΟ ΦΟΡΤΙΣΗΣ USB','ΣΥΝΘΕΤΙΚΟ ΕΙΔΟΣ LAB'];
const colors=['#176b50','#306c84','#457f9b','#6b548d','#8b633c'];
const ean=index=>{const prefix=`29000000${String(index).padStart(4,'0')}`;const sum=[...prefix].reduce((n,d,i)=>n+Number(d)*(i%2?3:1),0);return prefix+(10-sum%10)%10;};
const products=Array.from({length:40},(_,i)=>({
  id:`lab-product-${String(i+1).padStart(2,'0')}`,name:`${names[i%20]}${i>=20?' · ΕΝΑΛΛΑΚΤΙΚΟ LAB':''}`,
  sku:`LAB-${String(i+1).padStart(4,'0')}`,sourceCode:`LAB-${String(i+1).padStart(4,'0')}`,
  categoryName:labels[i%20],salePrice:Number((.5+(i%9)*.35).toFixed(2)),currentStock:50+i,
  barcodes:[ean(i+1)],barcodeOptions:[{barcode:ean(i+1),salePrice:Number((.5+(i%9)*.35).toFixed(2))}],
  vatRate:24,active:true,negativeStockWarning:true,
}));
const access={customersPos:true,customerCardOnly:false,changeRetail:true,editPosButtons:true,deleteSaleReason:true,confirmDeleteSale:true,supplierPayment:true,thirdPartyPayment:true,sameShiftPayments:true,onlineBarcode:false,onlineProductSearch:false};
const catalog={products,access,deliveryEnabled:false,tableServiceEnabled:false,rbsCapDriverV1Active:false,rbsCapDriverV1Configured:false,
  layout:{title:'MYWORKSTATION LAB',showSku:true,buttonFontScale:1,theme:{headerColor:'#033d2f',accentColor:'#087a52'},audienceSettings:{enabled:false},
    quickKeys:products.slice(0,20).map((p,i)=>({id:`lab-quick-${i}`,label:p.name,productQuery:p.id,price:p.salePrice,color:colors[i%5],visible:true})),
    categories:labels.map((label,i)=>({id:`lab-category-${i}`,label,categoryName:label,color:colors[i%5],visible:true})),
  },
};
const suppliers=[{id:'lab-supplier-1',name:'ΣΥΝΘΕΤΙΚΟΣ ΠΡΟΜΗΘΕΥΤΗΣ LAB',balance:0}];
const customers=[{id:'lab-customer-1',name:'ΠΕΛΑΤΗΣ LAB Α',balance:0,creditLimit:100,discountPercent:0,points:0},{id:'lab-customer-2',name:'ΠΕΛΑΤΗΣ LAB Β',balance:0,creditLimit:200,discountPercent:0,points:0}];
const openedAt=new Date().toISOString();
const overview={openSession:{id:'lab-visual-shift',openedAt,operatorName:operator.fullName},suppliers,rows:[],transactions:[],totals:{cash:0,card:0,iris:0,total:0},cash:0,card:0,total:0};
const sales=[{id:'lab-sale-display-only',source:'POS',sessionId:'lab-visual-shift',fiscalStatus:'NON_FISCAL',total:2,occurredAt:openedAt,productSummary:'ΣΥΝΘΕΤΙΚΗ ΕΜΦΑΝΙΣΗ · ΟΧΙ ΠΡΑΓΜΑΤΙΚΗ ΠΩΛΗΣΗ',paymentSummary:'Συνθετικό δείγμα οθόνης',lines:[{id:'lab-sale-line',productId:products[0].id,description:products[0].name,quantity:1,unitPrice:2,lineTotal:2}]}];
const reads=new Map([
  [BASE,()=>catalog],
  [`${BASE}/access`,()=>({access})],
  [`${BASE}/holds`,()=>({rows:[{id:'lab-hold-display-only',total:2,items:[{productId:products[0].id,quantity:1}],note:'ΣΥΝΘΕΤΙΚΗ ΟΘΟΝΗ'}]})],
  [`${BASE}/audience-discounts`,()=>({items:[]})],
  [`${BASE}/rbs-capdriver-v1/pending`,()=>({requests:[]})],
  [`${BASE}/sales/recent`,()=>({rows:sales})],
  [`${BASE}/barcode-registration`,()=>({missingCount:0,items:[]})],
  [`${BASE}/online-radio`,()=>({enabled:false,stations:[],state:{stationId:null,volume:0}})],
  [`${BASE}/customers`,url=>({items:customers.filter(c=>c.name.toLocaleLowerCase('el-GR').includes((url.searchParams.get('q')||'').toLocaleLowerCase('el-GR'))),cardOnly:false})],
  [`${BASE}/gift-offers`,()=>({offers:[]})],
  [`${TRANSACTIONS}/overview`,()=>overview],
  [`/api/cash-control/stores/${STORE_ID}/overview`,()=>overview],
  [`${TRANSACTIONS}/payroll-employees`,()=>({items:[{id:operator.id,fullName:operator.fullName}]})],
  [`${TRANSACTIONS}/supplier-open-invoices`,()=>({items:[{id:'lab-invoice-display-only',documentNumber:'LAB-001',supplierId:suppliers[0].id,total:10,remainingAmount:10,openAmount:10,issuedAt:openedAt}],advances:[]})],
  ['/api/management/expense-categories',()=>({items:[{id:'lab-expense-category',description:'ΣΥΝΘΕΤΙΚΗ ΚΑΤΗΓΟΡΙΑ LAB',active:true}]})],
  [`/api/store-chat/stores/${STORE_ID}/messages`,()=>({rows:[{id:'lab-message',body:'Συνθετικό μήνυμα μόνο για οπτικό έλεγχο.',category:'MESSAGE',readByMe:true,createdAt:openedAt}],assignees:[],settings:{photosEnabled:false,pdfEnabled:false,downloadsEnabled:false,employeeDownloadsEnabled:false,employeeTaskCreationEnabled:false,invoiceAiReaderEnabled:false},permissions:{canPin:false,canDownload:false,canComplete:false,canCreateTask:false,canManageTask:false,canManageSettings:false}})],
]);
const queryKeys=new Map([
  [`${BASE}/customers`,new Set(['q','creditOnly'])],
  [`${BASE}/gift-offers`,new Set(['triggerProductId'])],
  [`${BASE}/barcode-registration`,new Set(['countOnly'])],
  [`${TRANSACTIONS}/supplier-open-invoices`,new Set(['supplierId'])],
  [`/api/store-chat/stores/${STORE_ID}/messages`,new Set(['_ts'])],
]);
const listeners=new Set();
const events=[];
let blockedWrites=0,blockedReads=0;
function record(kind,method,path){
  const event=Object.freeze({kind,method,path,time:new Date().toISOString()});
  events.push(event);if(events.length>80)events.shift();
  if(kind==='write-blocked')blockedWrites++;
  if(kind==='read-blocked')blockedReads++;
  for(const listener of listeners)listener();
  return event;
}
function deny(kind,method,path,detail=''){
  record(kind,method,path);
  const error=new Error(`ΟΠΤΙΚΟ LAB: ${kind==='write-blocked'?'η καταχώριση απαγορεύεται':'η ανάγνωση δεν επιτρέπεται'} (${method} ${path}). Δεν έγινε συναλλαγή ή αποστολή.${detail?' '+detail:''}`);
  error.code='POS_UI_LAB_BLOCKED';throw error;
}
function requestParts(input,options={}){
  const url=new URL(typeof input==='string'?input:input?.url||String(input),location.origin);
  const method=String(options.method||input?.method||'GET').toUpperCase();
  return {url,method};
}
export async function labApi(input,options={}){
  const {url,method}=requestParts(input,options);
  if(method!=='GET')return deny('write-blocked',method,url.pathname);
  if(url.origin!==location.origin||url.hash||!reads.has(url.pathname))return deny('read-blocked',method,url.pathname);
  const allowed=queryKeys.get(url.pathname)||new Set();
  if([...url.searchParams.keys()].some(key=>!allowed.has(key)))return deny('read-blocked',method,url.pathname,'Μη επιτρεπτή παράμετρος.');
  if(url.pathname===`${BASE}/gift-offers`&&url.searchParams.has('triggerProductId')&&!products.some(p=>p.id===url.searchParams.get('triggerProductId')))return deny('read-blocked',method,url.pathname);
  if(url.pathname===`${TRANSACTIONS}/supplier-open-invoices`&&url.searchParams.get('supplierId')!==suppliers[0].id)return deny('read-blocked',method,url.pathname);
  record('fixture-read',method,url.pathname);
  return structuredClone(reads.get(url.pathname)(url));
}

// No raw client network call reaches a business API. Health is the one actual
// same-origin read, served by the isolated runtime without product/server code.
const healthFetch=window.fetch.bind(window);
window.fetch=async(input,options={})=>{
  const {url,method}=requestParts(input,options);
  if(method!=='GET')return deny('write-blocked',method,url.pathname);
  if(url.origin!==location.origin||url.pathname!=='/api/health'||url.hash||[...url.searchParams.keys()].some(key=>key!=='posProbe'))return deny('read-blocked',method,url.pathname);
  return healthFetch(url.href,{method:'GET',credentials:'omit',redirect:'error',cache:'no-store',signal:options.signal});
};
for(const name of ['WebSocket','EventSource','XMLHttpRequest']){
  window[name]=class {constructor(){deny('read-blocked',name,'/external-transport','Δεν υπάρχουν ενεργοί εξωτερικοί πάροχοι.');}};
}
if(navigator.mediaDevices?.getUserMedia){
  navigator.mediaDevices.getUserMedia=async()=>deny('read-blocked','MEDIA','/camera-microphone','Οι συσκευές είναι απενεργοποιημένες στο οπτικό LAB.');
}
if(navigator.sendBeacon)navigator.sendBeacon=()=>{deny('write-blocked','BEACON','/beacon');};

// The original component initializes audience selection with a POST. We do not
// fake that write's success: it rejects, and the unmodified cache fallback loads
// only this synthetic catalog. Its offline-catalog notice is intentionally kept.
installOfflineStorageGuard({storeId:STORE_ID,onBlocked:({key})=>record('write-blocked','LOCAL_STORAGE',key)});
function seedSyntheticCatalog(){
  localStorage.setItem(CACHE_KEY,JSON.stringify({savedAt:Date.now(),data:catalog}));
}
seedSyntheticCatalog();
const snapshot=()=>({blockedWrites,blockedReads,last:events.at(-1)||null,events:[...events]});
Object.defineProperty(window,'__MWS_POS_UI_LAB__',{value:Object.freeze({mode:'visual-only',storeId:STORE_ID,products:products.map(({id,name,sku,barcodes})=>({id,name,sku,barcodes})),request:labApi,snapshot}),writable:false});

document.documentElement.setAttribute('data-pos-ui-lab','visual-only');
const style=document.createElement('style');
style.textContent=`html,body,#root{margin:0;width:100%;height:100%;font-family:Arial,sans-serif}*{box-sizing:border-box}.lab-banner{position:fixed;inset:0 0 auto;z-index:2147483647;background:#fff4d5;color:#543b10;border-bottom:2px solid #b68b32;padding:7px 10px;display:flex;gap:12px;align-items:center}.lab-banner>div{min-width:0;flex:1}.lab-banner strong{display:block;font-size:14px}.lab-banner p{margin:3px 0;font-size:12px;line-height:1.25}.lab-banner small{display:block;font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.lab-banner button{min-height:38px;padding:5px 10px;border:1px solid #a17b2c;border-radius:7px;background:#fff;color:#543b10;font-weight:700;cursor:pointer}.lab-shell .compact-store-mode{top:var(--lab-banner-height,88px);height:calc(100dvh - var(--lab-banner-height,88px))}html[data-pos-ui-lab] .pos-standard-modal,html[data-pos-ui-lab] .category-product-overlay,html[data-pos-ui-lab] .pos-text-size-overlay{top:var(--lab-banner-height,88px)}html[data-pos-ui-lab] .pos-standard-modal>section,html[data-pos-ui-lab] .category-product-overlay>section,html[data-pos-ui-lab] .pos-text-size-overlay>section{max-height:calc(100dvh - var(--lab-banner-height,88px) - 24px)}.lab-fatal{padding:24px;color:#862020;font:700 18px Arial,sans-serif}`;
 document.head.appendChild(style);
class Boundary extends React.Component{
  state={error:null};
  static getDerivedStateFromError(error){return {error};}
  render(){return this.state.error?<div className="lab-fatal" role="alert">Η οπτική προεπισκόπηση σταμάτησε: {this.state.error.message}. Δεν έγινε συναλλαγή.</div>:this.props.children;}
}
function Lab(){
  const [view,setView]=useState(snapshot),[version,setVersion]=useState(0);
  const banner=useRef(null);
  useEffect(()=>{const update=()=>setView(snapshot());listeners.add(update);update();return()=>listeners.delete(update);},[]);
  useEffect(()=>{const resize=()=>document.documentElement.style.setProperty('--lab-banner-height',`${banner.current?.getBoundingClientRect().height||88}px`);const observer=new ResizeObserver(resize);observer.observe(banner.current);resize();return()=>observer.disconnect();},[]);
  return <div className="lab-shell">
    <header className="lab-banner" ref={banner} aria-label="Περιορισμοί οπτικού LAB">
      <div><strong>MYWORKSTATION LAB · ΜΟΝΟ ΟΠΤΙΚΟΣ ΕΛΕΓΧΟΣ</strong><p>Συνθετικά δεδομένα. Χωρίς πραγματικές συναλλαγές, αποθήκη, ταμειακή ή EFTPOS. Όλες οι εγγραφές αποκλείονται.</p><small title="Η αρχική εγγραφή δικαιούχου απορρίπτεται και ο πραγματικός κώδικας φορτώνει συνθετική τοπική cache.">Κατάλογος από συνθετική cache · αποκλεισμένες εγγραφές: {view.blockedWrites} · {view.last?`${view.last.method} ${view.last.path}`:'έτοιμο'}</small></div>
      <button type="button" onClick={()=>{seedSyntheticCatalog();setVersion(v=>v+1);}}>Νέο οπτικό καλάθι</button>
    </header>
    <div className="compact-store-mode"><div className="compact-store-main"><Boundary key={version}><StorePosPanel api={labApi} store={store} operator={operator} company={company} canEditCategories={false} canRegisterBarcode={true} canPurchaseOrders={false} runtimeAccess={access}/></Boundary></div></div>
  </div>;
}
createRoot(document.getElementById('root')).render(<Lab/>);
