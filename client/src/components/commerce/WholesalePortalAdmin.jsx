import React,{useEffect,useRef,useState} from 'react';
const strong=value=>value.length>=12&&new TextEncoder().encode(value).length<=72;
const passwordError='Ο κωδικός χρειάζεται τουλάχιστον 12 χαρακτήρες και έως 72 bytes UTF-8.';

export default function WholesalePortalAdmin({api,customers=[],stores=[],activeStoreId=''}){
 const available=stores.filter(store=>store.active!==false);
 const scoped=activeStoreId?available.filter(store=>store.id===activeStoreId):available;
 // Revoke the old component and its forms when the entry scope/permissions change.
 const scopeKey=JSON.stringify([activeStoreId,scoped.map(store=>store.id).sort()]);
 return <PortalAdministration key={scopeKey} api={api} customers={customers} stores={scoped} activeStoreId={activeStoreId}/>;
}

function PortalAdministration({api,customers,stores,activeStoreId}){
 const [site,setSite]=useState(null),[accounts,setAccounts]=useState([]),[error,setError]=useState(''),[loading,setLoading]=useState(true);
 const [storeId,setStoreId]=useState(()=>stores.some(s=>s.id===activeStoreId)?activeStoreId:''),[query,setQuery]=useState(''),[products,setProducts]=useState([]),[page,setPage]=useState(1),[total,setTotal]=useState(0),[busy,setBusy]=useState('');
 const [accountScope,setAccountScope]=useState(''),[accountsLoading,setAccountsLoading]=useState(false);
 const live=useRef(false),generation=useRef(0),searchGeneration=useRef(0),pending=useRef(new Set());
 const scope=useRef({storeId,epoch:0});
 const validStore=Boolean(stores.some(store=>store.id===storeId));
 const token=()=>({...scope.current});
 const current=value=>live.current&&value.epoch===scope.current.epoch&&value.storeId===scope.current.storeId&&stores.some(store=>store.id===value.storeId);
 const loadAccounts=async(value)=>{
  if(!current(value))return;
  const serial=++generation.current;setAccountsLoading(true);setAccounts([]);setAccountScope('');
  try{
   const rows=await api('/api/wholesale/portal/accounts?'+new URLSearchParams({storeId:value.storeId}));
   if(current(value)&&serial===generation.current){setAccounts((rows.items||[]).filter(row=>row.storeId===value.storeId));setAccountScope(value.storeId);setAccountsLoading(false)}
  }catch(e){if(current(value)&&serial===generation.current){setError(e.message);setAccountsLoading(false)}}
 };
 useEffect(()=>{
  live.current=true;
  (async()=>{try{const config=await api('/api/wholesale/portal/site');if(live.current){setSite(config.site);setLoading(false)}}catch(e){if(live.current){setError(e.message);setLoading(false)}}})();
  return()=>{live.current=false;scope.current.epoch++;generation.current++;searchGeneration.current++};
 },[]);
 useEffect(()=>{if(validStore)loadAccounts(token())},[storeId]);
 const changeStore=selected=>{
  if(selected===scope.current.storeId)return;
  scope.current={storeId:selected,epoch:scope.current.epoch+1};generation.current++;searchGeneration.current++;
  setStoreId(selected);setAccounts([]);setAccountScope('');setAccountsLoading(false);setProducts([]);setTotal(0);setPage(1);setError('');
 };
 const write=async(key,fn,value=null)=>{
  if(pending.current.has(key)||value&&!current(value))return;
  pending.current.add(key);setBusy([...pending.current].join('|'));setError('');
  try{await fn()}catch(e){if(live.current&&(!value||current(value)))setError(e.message)}
  finally{pending.current.delete(key);if(live.current)setBusy([...pending.current].join('|'))}
 };
 const saveSite=e=>{
  e.preventDefault();const f=new FormData(e.currentTarget);
  write('site',async()=>{const data=await api('/api/wholesale/portal/site',{method:'PUT',body:JSON.stringify({slug:f.get('slug'),name:f.get('name'),enabled:f.get('enabled')==='on'})});if(live.current)setSite(data.site)});
 };
 const addAccount=e=>{
  e.preventDefault();const form=e.currentTarget,f=new FormData(form),value=token(),password=String(f.get('password')||'');
  if(!current(value))return setError('Επίλεξε έγκυρο κατάστημα.');
  if(!strong(password))return setError(passwordError);
  write('create-'+value.storeId,async()=>{
   await api('/api/wholesale/portal/accounts',{method:'POST',body:JSON.stringify({login:f.get('login'),password,customerId:f.get('customerId'),storeId:value.storeId,active:f.get('active')==='on'})});
   if(current(value)){form.reset();await loadAccounts(value)}
  },value);
 };
 const changeAccount=(account,body,form=null)=>{
  const value=token();if(account.storeId!==value.storeId||!current(value))return;
  write('account-'+account.id,async()=>{
   await api('/api/wholesale/portal/accounts/'+encodeURIComponent(account.id)+'?'+new URLSearchParams({storeId:value.storeId}),{method:'PATCH',body:JSON.stringify(body)});
   if(current(value)){if(form)form.reset();await loadAccounts(value)}
  },value);
 };
 const resetPassword=(e,account)=>{e.preventDefault();const form=e.currentTarget,password=String(new FormData(form).get('password')||'');if(!strong(password))return setError(passwordError);changeAccount(account,{password},form)};
 const search=async(next=1)=>{
  if(!validStore)return;const value=token(),serial=++searchGeneration.current;setProducts([]);setError('');
  try{const data=await api('/api/wholesale/portal/products?'+new URLSearchParams({storeId:value.storeId,q:query,page:String(next),pageSize:'50'}));if(current(value)&&serial===searchGeneration.current){setProducts(data.items||[]);setPage(next);setTotal(Number(data.total||0))}}
  catch(e){if(current(value)&&serial===searchGeneration.current)setError(e.message)}
 };
 const publish=(product,published)=>{
  const value=token(),serial=searchGeneration.current;
  write('product-'+value.storeId+'-'+product.id,async()=>{
   await api('/api/wholesale/portal/products/'+encodeURIComponent(product.id),{method:'PUT',body:JSON.stringify({storeId:value.storeId,published})});
   if(current(value)&&serial===searchGeneration.current)setProducts(rows=>rows.map(row=>row.id===product.id?{...row,published}:row));
  },value);
 };
 const storeOptions=<><option value="">Επίλεξε κατάστημα</option>{stores.map(store=><option key={store.id} value={store.id}>{store.name}</option>)}</>;
 return <section className="wholesale-portal-admin" aria-label="Διαχείριση πύλης πελατών">
  <h3>Πύλη πελατών χονδρικής</h3><p>Ξεχωριστή πρόσβαση πελατών. Οι λογαριασμοί συνδέονται μόνιμα με έναν πελάτη και ένα κατάστημα.</p>
  {error&&<div role="alert">{error}</div>}
  {loading?<p role="status">Φόρτωση ρυθμίσεων…</p>:<>
   <form aria-label="Ρυθμίσεις πύλης" onSubmit={saveSite} key={site?.slug||'new'}>
    <h4>Ρυθμίσεις site</h4><p>Οι ρυθμίσεις του site ισχύουν για όλη την εταιρεία.</p>
    <label>Διεύθυνση<input name="slug" minLength={3} maxLength={63} pattern="[a-z0-9]+(-[a-z0-9]+)*" defaultValue={site?.slug||''} readOnly={Boolean(site)} required/></label>
    <label>Επωνυμία site<input name="name" defaultValue={site?.name||''} required/></label>
    <label><input name="enabled" type="checkbox" defaultChecked={site?.enabled===true}/>Ενεργή πύλη</label>
    <button disabled={busy.includes('site')}>Αποθήκευση πύλης</button>{site?.slug&&<a href={'/b2b/'+encodeURIComponent(site.slug)} target="_blank" rel="noreferrer">Άνοιγμα πύλης πελατών</a>}
   </form>
   <label>Κατάστημα λογαριασμών<select aria-label="Κατάστημα λογαριασμών" value={validStore?storeId:''} onChange={e=>changeStore(e.target.value)}>{storeOptions}</select></label>
   {!validStore&&<p role="status">Επίλεξε κατάστημα για τους λογαριασμούς και τα προϊόντα της πύλης.</p>}
   <form aria-label="Νέος λογαριασμός πελάτη" onSubmit={addAccount} key={'create-'+storeId+'-'+scope.current.epoch}>
    <h4>Νέος λογαριασμός</h4><label>Όνομα χρήστη<input name="login" autoComplete="off" required/></label>
    <label>Κωδικός<input name="password" type="password" autoComplete="new-password" required minLength={12}/></label>
    <label>Πελάτης<select name="customerId" required defaultValue=""><option value="">Επίλεξε πελάτη</option>{customers.filter(c=>c.active!==false).map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
    <label>Κατάστημα<select name="storeId" value={validStore?storeId:''} disabled>{storeOptions}</select></label>
    <label><input name="active" type="checkbox" defaultChecked/>Ενεργός λογαριασμός</label>
    <button disabled={!site||!validStore||busy.includes('create-'+storeId)}>Δημιουργία λογαριασμού</button><small>Δώσε τα στοιχεία σύνδεσης στον πελάτη εσύ. Δεν αποστέλλεται email.</small>
   </form>
   <section aria-label="Λογαριασμοί πύλης">
    {accountsLoading&&<p role="status">Φόρτωση λογαριασμών…</p>}
    {validStore&&accountScope===storeId&&accounts.map(account=><article key={account.id}>
     <h4>{account.login}</h4><p>Πελάτης: {customers.find(c=>c.id===account.customerId)?.name||account.customerId} · Κατάστημα: {stores.find(s=>s.id===account.storeId)?.name||account.storeId}</p>
     <button disabled={busy.includes('account-'+account.id)} onClick={()=>changeAccount(account,{active:!account.active})}>{account.active?'Απενεργοποίηση':'Ενεργοποίηση'} · {account.login}</button>
     <form onSubmit={e=>resetPassword(e,account)} aria-label={'Νέος κωδικός · '+account.login}><label>Νέος κωδικός<input name="password" type="password" autoComplete="new-password" minLength={12} required/></label><button disabled={busy.includes('account-'+account.id)}>Ορισμός κωδικού · {account.login}</button></form>
    </article>)}
   </section>
   <section aria-label="Δημοσίευση προϊόντων"><h4>Προϊόντα πύλης</h4><p>Η δημοσίευση ισχύει μόνο για το επιλεγμένο κατάστημα σε αυτό το site. Κάθε πελάτης βλέπει μόνο τα ενεργά δημοσιευμένα είδη του δικού του καταστήματος.</p>
    <label>Κατάστημα προϊόντων<select aria-label="Κατάστημα δημοσίευσης" value={validStore?storeId:''} onChange={e=>changeStore(e.target.value)}>{storeOptions}</select></label>
    <label>Αναζήτηση<input aria-label="Αναζήτηση δημοσίευσης" value={query} onChange={e=>{searchGeneration.current++;setQuery(e.target.value);setProducts([])}}/></label>
    <button disabled={!site||!validStore} onClick={()=>search(1)}>Εύρεση ειδών πύλης</button>
    {validStore&&products.map(product=><article key={product.id}><span>{product.name} · {product.sku} · {product.unit}</span><button disabled={busy.includes('product-'+storeId+'-'+product.id)} onClick={()=>publish(product,!product.published)}>{product.published?'Απόσυρση':'Δημοσίευση'} · {product.name}</button></article>)}
    {validStore&&total>50&&<nav><button disabled={page<=1} onClick={()=>search(page-1)}>Προηγούμενα είδη</button><span>Σελίδα {page}</span><button disabled={page*50>=total} onClick={()=>search(page+1)}>Επόμενα είδη</button></nav>}
   </section>
  </>}
 </section>;
}
