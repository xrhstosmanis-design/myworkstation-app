import React,{useCallback,useEffect,useRef,useState} from 'react';
const InvoiceInboxPanel=React.lazy(()=>import('./commerce/InvoiceInboxPanel.jsx'));
const StaffInvoicePurchases=React.lazy(()=>import('./commerce/StaffInvoicePurchases.jsx'));
const PosSaleActionsPanel=React.lazy(()=>import('./commerce/PosSaleActionsPanel.jsx'));
const StoreShiftClosePanel=React.lazy(()=>import('./store/StoreShiftClosePanel.jsx'));
const InventoryV2Center=React.lazy(()=>import('./inventory/InventoryV2Center.jsx'));
const StoreCloudPage=React.lazy(()=>import('./cloud/StoreCloudPage.jsx'));
const InventoryArchivePanel=React.lazy(()=>import('./commerce/InventoryArchivePanel.jsx'));
const InventoryNewProductCard=React.lazy(()=>import('./commerce/InventoryNewProductCard.jsx'));
import {greeceDateInput} from '../../../shared/greece-time.mjs';
import BackofficeStores from './backoffice/BackofficeStores.jsx';
import BackofficeShell from './backoffice/BackofficeShell.jsx';
import {Building2,LayoutDashboard,LogOut} from 'lucide-react';
import {staffProfiles} from '../../../shared/backoffice-staff.mjs';
import './backoffice-staff.css';
export default function BackofficeStaffWorkspace({api,user,onLogout}){
  const [page,setPage]=useState('stores');
  const [identity,setIdentity]=useState(null),[storeId,setStoreId]=useState(''),[view,setView]=useState(''),[data,setData]=useState(null),[detail,setDetail]=useState(null),[from,setFrom]=useState(()=>greeceDateInput(new Date())),[to,setTo]=useState(()=>greeceDateInput(new Date())),[error,setError]=useState(''),[busy,setBusy]=useState(false),[pending,setPending]=useState(null);
  const [terminalPos,setTerminalPos]=useState(''),[terminals,setTerminals]=useState([]),[invoicePage,setInvoicePage]=useState('archive'),[closeOpen,setCloseOpen]=useState(false);
  const moduleWriting=useRef(false);
  const sequence=useRef(0),scope=useRef(''),sending=useRef(false);scope.current=JSON.stringify([storeId,view,from,to,terminalPos]);
  const [newProduct,setNewProduct]=useState(false),[productBusy,setProductBusy]=useState(false),[catalogVersion,setCatalogVersion]=useState(0);
  const [stocktakeOperation,setStocktakeOperation]=useState(null),[stocktakeMessage,setStocktakeMessage]=useState('');
  const selected=identity?.stores.find(s=>s.id===storeId),capabilities=selected?.capabilities||[];
  const commerceView=['products','invoices','inventory','cash'].find(key=>capabilities.includes(`${key}.read`));
  const openCommerce=commerceView?()=>setView(commerceView):undefined;
  useEffect(()=>{let live=true;api('/api/backoffice-staff/me').then(d=>{if(live)setIdentity(d)}).catch(e=>{if(live)setError(e.message)});return()=>{live=false;sequence.current++}},[api]);
  useEffect(()=>{sequence.current++;setData(null);setDetail(null);setError('');setBusy(false);setNewProduct(false);setStocktakeMessage('');if(view==='inventory'&&storeId&&capabilities.includes('inventory.read'))void load()},[storeId,view,from,to]);
  const scoped=useCallback(async(path,options={})=>{
    const own=scope.current;
    const writing=String(options.method||'GET').toUpperCase()!=='GET';
    if(writing&&moduleWriting.current)throw Error('Περίμενε να ολοκληρωθεί η καταχώριση.');
    if(writing){moduleWriting.current=true;setProductBusy(true);}
    try{const result=await api(path,{...options,headers:{...options.headers,'x-backoffice-store-id':storeId,...(terminalPos?{'x-mws-terminal-pos':terminalPos}:{})}});
    if(own!==scope.current)throw Error('Άλλαξε η προβολή. Άνοιξε ξανά τη λειτουργία στο επιλεγμένο κατάστημα.');
    return result;}finally{if(writing){moduleWriting.current=false;setProductBusy(false);}}
  },[api,storeId,terminalPos]);
  useEffect(()=>{let live=true;setTerminals([]);setTerminalPos('');setCloseOpen(false);if(!storeId||!capabilities.includes('sales.read'))return;api(`/api/backoffice-staff/sales/stores/${encodeURIComponent(storeId)}/terminals`,{headers:{'x-backoffice-store-id':storeId}}).then(result=>{if(live&&result.storeId===storeId)setTerminals(result.terminals||[])}).catch(e=>{if(live)setError(e.message)});return()=>{live=false}},[api,storeId,identity]);
  const load=async()=>{
    if(!storeId||!view||sending.current)return;const n=++sequence.current,own=scope.current;setBusy(true);setError('');setData(null);setDetail(null);
    try{const result=await scoped(view==='inventory'?`/api/backoffice-staff/inventory/stores/${encodeURIComponent(storeId)}/stocktakes`:`/api/backoffice-staff/cash/stores/${encodeURIComponent(storeId)}?${new URLSearchParams({from,to})}`);if(n!==sequence.current||own!==scope.current)return;if(result.storeId!==storeId)throw Error('Δεν επιβεβαιώθηκε το κατάστημα.');setData(result)}catch(e){if(n===sequence.current&&own===scope.current)setError(e.message)}finally{if(n===sequence.current&&own===scope.current)setBusy(false)}
  };
  const open=async stocktakeId=>{
    const n=++sequence.current,own=scope.current;setBusy(true);setError('');setDetail(null);
    try{const result=await scoped(`/api/backoffice-staff/inventory/stores/${encodeURIComponent(storeId)}/stocktakes/${encodeURIComponent(stocktakeId)}`);if(n!==sequence.current||own!==scope.current)return;if(result.storeId!==storeId||result.id!==stocktakeId)throw Error('Δεν επιβεβαιώθηκε η απογραφή.');setDetail(result);return result}catch(e){if(n===sequence.current&&own===scope.current)setError(e.message)}finally{if(n===sequence.current&&own===scope.current)setBusy(false)}
  };
  const mutateStocktake=async request=>{
    if(sending.current)return;sending.current=true;setBusy(true);setError('');setStocktakeMessage('');setStocktakeOperation(request);
    const own=scope.current;
    try{
      const path=request.kind==='CREATE'?'/api/inventory-v2/stocktakes':`/api/inventory-v2/stocktakes/${encodeURIComponent(request.stocktakeId)}/finalize`;
      const result=await scoped(path,{method:'POST',body:JSON.stringify(request.body)});
      if(own!==scope.current)return;
      if((request.kind==='CREATE'&&typeof result?.id!=='string')||(request.kind==='FINALIZE'&&result?.ok!==true))throw Error('Δεν επιβεβαιώθηκε η ενέργεια.');
      setStocktakeOperation(null);sending.current=false;
      if(request.kind==='CREATE'){setStocktakeMessage(result.status==='FINALIZED'?'Η ίδια απογραφή έχει ήδη δημιουργηθεί και οριστικοποιηθεί.':'Η απογραφή δημιουργήθηκε.');await load()}
      else{setStocktakeMessage('Η απογραφή οριστικοποιήθηκε.');await open(request.stocktakeId)}
    }catch(e){if(own===scope.current)setError((e.message||'Δεν επιβεβαιώθηκε η ενέργεια.')+' Χρησιμοποίησε την επαλήθευση πριν από νέα ενέργεια.')}finally{sending.current=false;if(own===scope.current)setBusy(false)}
  };
  const verifyFinalization=async()=>{
    if(sending.current||stocktakeOperation?.kind!=='FINALIZE')return;
    sending.current=true;const own=scope.current;
    try{const result=await open(stocktakeOperation.stocktakeId);if(own!==scope.current||!result)return;setStocktakeOperation(null);setStocktakeMessage(result.status==='FINALIZED'?'Η απογραφή εμφανίζεται οριστικοποιημένη.':'Η απογραφή παραμένει ανοιχτή. Έλεγξε τις μετρήσεις πριν την οριστικοποίηση.')}finally{sending.current=false}
  };
  const count=async request=>{
    if(sending.current)return;sending.current=true;setBusy(true);setError('');setPending(request);
    const own=scope.current,n=++sequence.current;
    try{
      const result=await scoped(`/api/inventory-v2/stocktakes/${encodeURIComponent(request.stocktakeId)}/count`,{method:'POST',body:JSON.stringify(request.body)});
      if(n!==sequence.current||own!==scope.current)return;
      if(result.ok!==true&&result.replayed!==true)throw Error('Δεν επιβεβαιώθηκε η καταμέτρηση.');
      setPending(null);sending.current=false;await open(request.stocktakeId);return true;
    }catch(e){if(n===sequence.current&&own===scope.current)setError((e.message||'Δεν επιβεβαιώθηκε η καταμέτρηση.')+' Χρησιμοποίησε «Επαλήθευση ίδιας καταχώρισης» πριν νέα μέτρηση.')}finally{sending.current=false;if(own===scope.current)setBusy(false)}
  };
  const createInventoryForm=capabilities.includes('inventory.create')&&<form className="op-form" onSubmit={e=>{e.preventDefault();const name=String(new FormData(e.currentTarget).get('name')||'').trim();if(!name||name.length>180)return setError('Γράψε όνομα απογραφής έως 180 χαρακτήρες.');mutateStocktake({kind:'CREATE',body:{storeId,name,scopeType:'FULL',clientEventId:crypto.randomUUID()}})}}><label>Όνομα νέας απογραφής<input name="name" required maxLength={180} disabled={busy||Boolean(pending||stocktakeOperation)}/></label><button disabled={busy||Boolean(pending||stocktakeOperation)}>Νέα απογραφή</button></form>;
  const finalizeInventoryForm=<>{detail?.status==='FINALIZED'&&<p role="status">Οριστικοποιημένη απογραφή — οι μετρήσεις δεν αλλάζουν.</p>}{detail?.status==='DRAFT'&&capabilities.includes('inventory.finalize')&&<form className="op-form inv2-finalization" onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget),reason=String(f.get('reason')||'').trim();if(f.get('confirm')!=='on'||reason.length<3||reason.length>300)return setError('Συμπλήρωσε αιτιολογία και επιβεβαίωσε την ενημέρωση αποθέματος.');mutateStocktake({kind:'FINALIZE',stocktakeId:detail.id,body:{reason}})}}><h3>Οριστικοποίηση απογραφής</h3><p>Η οριστικοποίηση ενημερώνει τα αποθέματα με βάση τις ελεγμένες μετρήσεις.</p><label>Αιτιολογία<input name="reason" required minLength={3} maxLength={300} disabled={busy||Boolean(pending||stocktakeOperation)}/></label><label className="staff-check"><input name="confirm" type="checkbox" required disabled={busy||Boolean(pending||stocktakeOperation)}/>Έλεγξα τις μετρήσεις και επιβεβαιώνω την ενημέρωση αποθέματος.</label><button disabled={busy||Boolean(pending||stocktakeOperation)}>Οριστικοποίηση και ενημέρωση αποθέματος</button></form>}</>;
  return <BackofficeShell className="staff-backoffice" companyName={identity?.companyName||user.company?.name||'MyWorkStation'} title={page==='dashboard'?'Αρχική':'Καταστήματα'} subtitle={`Καλώς ήρθες, ${identity?.fullName||user.fullName}`} navigation={<nav><button className={page==='dashboard'?'active':''} disabled={busy||productBusy||Boolean(pending||stocktakeOperation)} onClick={()=>{sequence.current++;setStoreId('');setView('');setPage('dashboard')}}><LayoutDashboard/>Αρχική</button><button className={page==='stores'?'active':''} disabled={busy||productBusy||Boolean(pending||stocktakeOperation)} onClick={()=>{sequence.current++;setStoreId('');setView('');setPage('stores')}}><Building2/>Καταστήματα</button></nav>} footer={<button className="logout" disabled={busy||productBusy||Boolean(pending||stocktakeOperation)} onClick={onLogout}><LogOut/>Έξοδος</button>}>
    {!selected&&identity&&<BackofficeStores rows={identity.stores} disabled={busy||productBusy||Boolean(pending||stocktakeOperation)} onOpen={store=>{sequence.current++;setStoreId(store.id);setView('');setPage('stores')}}/>}
    <section className="panel staff-panel"><label>Κατάστημα<select aria-label="Κατάστημα" value={storeId} disabled={busy||productBusy||Boolean(pending||stocktakeOperation)} onChange={e=>{sequence.current++;setData(null);setDetail(null);setView('');setPage('stores');setStoreId(e.target.value)}}><option value="">Επίλεξε κατάστημα</option>{identity?.stores.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
      {identity&&!identity.stores.length&&<p>Δεν υπάρχει ενεργή ανάθεση καταστήματος. Επικοινώνησε με τον ιδιοκτήτη.</p>}
      {selected&&<><h2>{selected.name}</h2><p>{staffProfiles[selected.profile]?.label||'Προσωπική πρόσβαση'}</p>{!view&&<p>Επίλεξε λειτουργία από το μενού. Εμφανίζονται όσα σου έχει επιτρέψει ο ιδιοκτήτης.</p>}</>}
      <nav className="owner-primary-nav" aria-label="Λειτουργίες BackOffice">{selected&&<>{capabilities.includes('invoices.read')&&<button disabled={productBusy||Boolean(pending||stocktakeOperation)} className={view==='invoices'?'active':''} onClick={()=>setView('invoices')}>Τιμολόγια</button>}{capabilities.includes('sales.read')&&<button disabled={productBusy||Boolean(pending||stocktakeOperation)} className={view==='sales'?'active':''} onClick={()=>setView('sales')}>Πωλήσεις και βάρδιες</button>}{capabilities.includes('payments.read')&&<button disabled={productBusy||Boolean(pending||stocktakeOperation)} className={view==='payments'?'active':''} onClick={()=>setView('payments')}>Πληρωμές</button>}{capabilities.includes('products.read')&&<button disabled={productBusy||Boolean(pending||stocktakeOperation)} className={view==='products'?'active':''} onClick={()=>setView('products')}>Είδη και αποθήκη</button>}{capabilities.includes('inventory.read')&&<button disabled={productBusy||Boolean(pending||stocktakeOperation)} className={view==='inventory'?'active':''} onClick={()=>setView('inventory')}>Απογραφή</button>}{capabilities.includes('cash.read')&&<button disabled={productBusy||Boolean(pending||stocktakeOperation)} className={view==='cash'?'active':''} onClick={()=>setView('cash')}>Έλεγχος ταμείων</button>}</>}</nav>
    </section>
    <section className={view==='cash'?'panel staff-panel':'backoffice-module-workspace'}>
      {view==='invoices'&&selected&&capabilities.includes('invoices.read')&&<React.Suspense fallback={<p role="status">Φόρτωση τιμολογίων…</p>}><div className="staff-actions"><button type="button" disabled={productBusy} onClick={()=>setInvoicePage('archive')}>Θυρίδα και πρωτότυπα</button><button type="button" disabled={productBusy} onClick={()=>setInvoicePage('purchases')}>Αγορές και πρόχειρα τιμολογίων</button></div>{invoicePage==='archive'?<InvoiceInboxPanel key={storeId} api={scoped} stores={[selected]} readOnly/>:<StaffInvoicePurchases key={storeId} api={scoped} store={selected} capabilities={capabilities}/>}</React.Suspense>}
      {['sales','payments'].includes(view)&&selected&&<label>Ταμείο<select aria-label="Ταμείο" value={terminalPos} disabled={productBusy} onChange={e=>{setCloseOpen(false);setTerminalPos(e.target.value)}}><option value="">Επίλεξε ταμείο</option>{terminals.map(terminal=><option key={terminal} value={terminal}>{terminal}</option>)}</select></label>}
      {view==='sales'&&selected&&terminalPos&&capabilities.includes('sales.read')&&<React.Suspense fallback={<p role="status">Φόρτωση πωλήσεων…</p>}><StoreCloudPage key={`${storeId}:${terminalPos}`} api={scoped} store={selected} capabilities={capabilities} primaryView="shifts" onPrimaryChange={value=>setView(value==='payments'?'payments':'sales')} navigationLocked={busy||productBusy||Boolean(pending||stocktakeOperation)} onBack={()=>{setStoreId('');setView('')}} onOpenCommerce={openCommerce}/>{capabilities.includes('sales.cancel')&&<PosSaleActionsPanel key={`cancel:${storeId}:${terminalPos}`} api={scoped} storeId={storeId} delegatedCapabilities={capabilities}/>}{capabilities.includes('shifts.close')&&<><button type="button" disabled={productBusy} onClick={()=>setCloseOpen(value=>!value)}>{closeOpen?'Κλείσιμο φόρμας':'Κλείσιμο βάρδιας με καταμέτρηση'}</button>{closeOpen&&<StoreShiftClosePanel key={`close:${storeId}:${terminalPos}`} api={scoped} store={selected} backoffice/>}</>}</React.Suspense>}
      {view==='payments'&&selected&&terminalPos&&capabilities.includes('payments.read')&&<React.Suspense fallback={<p role="status">Φόρτωση πληρωμών…</p>}><StoreCloudPage key={`payments:${storeId}:${terminalPos}`} api={scoped} store={selected} capabilities={capabilities} primaryView="payments" onOpenCommerce={openCommerce} onPrimaryChange={value=>setView(value==='payments'?'payments':'sales')} navigationLocked={busy||productBusy||Boolean(pending||stocktakeOperation)} onBack={()=>{setStoreId('');setView('')}}/></React.Suspense>}
      {view==='products'&&selected&&capabilities.includes('products.read')&&<React.Suspense fallback={<p role="status">Φόρτωση ειδών…</p>}>{capabilities.includes('products.create')&&<button type="button" disabled={productBusy} onClick={()=>setNewProduct(true)}>Νέο είδος · Πλήρης καρτέλα</button>}<InventoryArchivePanel key={`${storeId}:${catalogVersion}`} api={scoped} storeId={storeId} stores={[selected]} readOnly onClose={()=>setView('')}/>{newProduct&&<InventoryNewProductCard key={storeId} api={scoped} storeId={storeId} lookupAllowed={false} allowOpeningStock={capabilities.includes('products.opening-stock')} onBusyChange={setProductBusy} onClose={()=>setNewProduct(false)} onSaved={()=>{setNewProduct(false);setCatalogVersion(v=>v+1)}}/>}</React.Suspense>}
      {view==='cash'&&<div className="staff-actions"><label>Από<input type="date" value={from} disabled={busy||Boolean(pending||stocktakeOperation)} onChange={e=>setFrom(e.target.value)}/></label><label>Έως<input type="date" value={to} disabled={busy||Boolean(pending||stocktakeOperation)} onChange={e=>setTo(e.target.value)}/></label></div>}
      {view==='inventory'&&selected&&capabilities.includes('inventory.read')&&<React.Suspense fallback={<p role="status">Φόρτωση απογραφής…</p>}><InventoryV2Center key={storeId} api={scoped} stores={[selected]} delegated={{storeId,storeName:selected.name,stocktakes:data?.stocktakes||[],listLoaded:data!==null,current:detail,canCreate:capabilities.includes('inventory.create'),canCount:capabilities.includes('inventory.count'),canFinalize:capabilities.includes('inventory.finalize'),locked:busy||Boolean(pending||stocktakeOperation),onLoad:load,onOpen:open,onNew:()=>{setDetail(null);setError('')},onCount:count,setError,createForm:createInventoryForm,finalizationForm:finalizeInventoryForm}}/></React.Suspense>}
      {view==='cash'&&<button type="button" disabled={busy||Boolean(pending||stocktakeOperation)} onClick={load}>Φόρτωση / Ανανέωση</button>}{busy&&<p role="status">Φόρτωση…</p>}{error&&<p role="alert">{error}</p>}{stocktakeMessage&&<p role="status">{stocktakeMessage}</p>}
      {stocktakeOperation?.kind==='CREATE'&&<button type="button" disabled={busy} onClick={()=>mutateStocktake(stocktakeOperation)}>Επαλήθευση ίδιας δημιουργίας</button>}
      {stocktakeOperation?.kind==='FINALIZE'&&<button type="button" disabled={busy} onClick={verifyFinalization}>Έλεγχος αποτελέσματος οριστικοποίησης</button>}
      {pending&&<button type="button" disabled={busy} onClick={()=>count(pending)}>Επαλήθευση ίδιας καταχώρισης</button>}
      {view==='cash'&&data&&<><p>Προβολή αναφοράς — οι εκκρεμότητες παραμένουν όπως έχουν καταγραφεί.</p><pre className="staff-report">{data.text}</pre><button type="button" onClick={()=>navigator.clipboard.writeText(data.text)}>Αντιγραφή αναφοράς</button></>}
    </section></BackofficeShell>;
}
