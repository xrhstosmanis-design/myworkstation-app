import React,{useEffect,useRef,useState} from 'react';
import {createWholesaleOfflineVault} from './wholesale-offline-vault.mjs';
import {ensureWholesaleOfflineShell} from './wholesale-offline-registration.mjs';
import {fetchOfflineSnapshot,offlineIdentityKey,offlineScopeKey,reviewOfflineDraft,sendOfflineFrozen} from './wholesale-offline-api.mjs';

const quantityValid=value=>/^\d{1,7}(?:\.\d{1,4})?$/.test(value)&&Number(value)>0&&Number(value)<=1000000;
const statuses={LOCAL_DRAFT:'Τοπικό πρόχειρο — δεν υποβλήθηκε',FROZEN:'Αρχικό αίτημα κλειδωμένο — δεν επιβεβαιώθηκε',SENDING:'Αποστολή σε εξέλιξη ή διακοπή — απαιτείται έλεγχος',UNKNOWN:'Άγνωστο αποτέλεσμα — μόνο επανάληψη του ίδιου αιτήματος',REJECTED:'Απόρριψη — διατηρείται το αρχικό αίτημα για έλεγχο',CONFIRMED:'Επιβεβαιωμένο από server — SUBMITTED'};
const errors={UNLOCK_FAILED:'Ο τοπικός κωδικός δεν ξεκλείδωσε την προετοιμασία.',PASSPHRASE_INVALID:'Χρησιμοποίησε τοπικό κωδικό τουλάχιστον 12 χαρακτήρων.',CRYPTO_UNAVAILABLE:'Ο browser δεν διαθέτει την απαιτούμενη ασφαλή κρυπτογράφηση.',STORAGE_UNAVAILABLE:'Η ασφαλής τοπική αποθήκευση δεν είναι διαθέσιμη.',LOCKS_UNAVAILABLE:'Ο browser δεν υποστηρίζει ασφαλή αποκλεισμό παράλληλων αποστολών. Το αρχικό αίτημα αποθηκεύτηκε αλλά δεν στάλθηκε.',WRITE_FAILED:'Δεν επιβεβαιώθηκε η τοπική εγγραφή. Μην θεωρήσεις το πρόχειρο αποθηκευμένο ή την αποστολή επιβεβαιωμένη· κλείδωσε και ξεκλείδωσε για έλεγχο.',CONFLICT:'Τα τοπικά δεδομένα άλλαξαν σε άλλη καρτέλα. Ξεκλείδωσε ξανά για έλεγχο.',LOCKED:'Η τοπική συνεδρία κλειδώθηκε. Ξεκλείδωσε ξανά.',EXPIRED:'Η προετοιμασία έληξε. Κάνε online ανανέωση με τον ίδιο τοπικό κωδικό.',REVOKED:'Η πρόσβαση ανακλήθηκε. Απαιτείται online ανανέωση με τον ίδιο τοπικό κωδικό.',NOT_PREPARED:'Δεν υπάρχει προετοιμασία για αυτόν τον λογαριασμό και κατάστημα.',SEND_BUSY:'Η ίδια παραγγελία αποστέλλεται σε άλλη καρτέλα. Περίμενε και ξεκλείδωσε ξανά για έλεγχο.',NOT_SENDABLE:'Αυτό το αρχικό αίτημα έχει ήδη επιβεβαιωθεί ή απορριφθεί. Δεν επιτρέπεται νέα αποστολή.',FROZEN:'Το αρχικό αίτημα είναι κλειδωμένο και δεν μπορεί να αλλάξει.',INVALID_DRAFT:'Το πρόχειρο δεν είναι έγκυρο. Έλεγξε πελάτη, είδη και ποσότητες.',INVALID_SNAPSHOT:'Δεν επιβεβαιώθηκε έγκυρη προετοιμασία της συσκευής.'};
const money=value=>String(value).replace('.',',')+' €';
export default function WholesaleOfflinePanel({session,storeId='',access,api,locked=false,accessDenial=null,vaultFactory=createWholesaleOfflineVault,ensureOfflineShell=ensureWholesaleOfflineShell}){
 const [open,setOpen]=useState(false),[profiles,setProfiles]=useState([]),[chosen,setChosen]=useState(''),[password,setPassword]=useState(''),[data,setData]=useState(null),[scope,setScope]=useState(null),[customerId,setCustomerId]=useState(''),[productId,setProductId]=useState(''),[quantity,setQuantity]=useState('1'),[cart,setCart]=useState([]),[notes,setNotes]=useState(''),[editingId,setEditingId]=useState(''),[review,setReview]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const vault=useRef(null),generation=useRef(0),alive=useRef(false),working=useRef(false),context=useRef(null),scopeRef=useRef(null),sessionRef=useRef(session),outerRef=useRef(storeId),lockedRef=useRef(locked),denialRef=useRef(accessDenial);
 sessionRef.current=session;outerRef.current=storeId;lockedRef.current=locked;scopeRef.current=scope;denialRef.current=accessDenial;
 const denied=profileScope=>Boolean(denialRef.current&&offlineIdentityKey(profileScope)===offlineIdentityKey(denialRef.current.identity)&&(!denialRef.current.storeId||denialRef.current.storeId===profileScope?.storeId));
 const identityKey=offlineIdentityKey(session?.identity),contextKey=JSON.stringify([identityKey,storeId,locked]);
 const clearPlain=()=>{generation.current++;vault.current?.lock();setData(null);setScope(null);setPassword('');setCustomerId('');setProductId('');setCart([]);setNotes('');setEditingId('');setReview(null);setBusy(false);working.current=false;setNotice('')};
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;generation.current++;vault.current?.dispose()}},[]);
 useEffect(()=>{if(context.current!==null&&context.current!==contextKey)clearPlain();context.current=contextKey;setChosen('');setError('')},[contextKey]);
 useEffect(()=>{const storage=()=>{clearPlain();setError('Η σύνδεση ή το περιβάλλον άλλαξε. Ξεκλείδωσε ξανά με τον σωστό λογαριασμό.')};window.addEventListener('storage',storage);return()=>window.removeEventListener('storage',storage)},[]);
 useEffect(()=>{if(!data)return;const timer=setTimeout(()=>{clearPlain();setError('Η τοπική άδεια προετοιμασίας έληξε. Απαιτείται online ανανέωση με τον ίδιο κωδικό συσκευής.')},Math.max(0,Math.min(2147483647,data.snapshot.expiresAt-Date.now())));return()=>clearTimeout(timer)},[data?.snapshot.expiresAt]);
 const instance=()=>vault.current||(vault.current=vaultFactory({onInvalidated:()=>{if(alive.current){clearPlain();setError(errors.REVOKED)}}}));
 const denialKey=accessDenial?JSON.stringify([accessDenial.serial,offlineIdentityKey(accessDenial.identity),accessDenial.storeId]):'';
 useEffect(()=>{
  if(!accessDenial)return;
  clearPlain();setChosen('');setError(errors.REVOKED);const observed=accessDenial;
  (async()=>{
   const rows=await instance().listProfiles();
   for(const profile of rows.filter(row=>offlineIdentityKey(row.scope)===offlineIdentityKey(observed.identity)&&(!observed.storeId||row.scope.storeId===observed.storeId)))await instance().denyPrepared(profile.scope);
  })().catch(()=>{if(alive.current)setError('Η πρόσβαση απορρίφθηκε. Δεν επιβεβαιώθηκε η μόνιμη ανάκληση όλων των τοπικών προετοιμασιών· το ξεκλείδωμα παραμένει αποκλεισμένο μέχρι online επανέλεγχο.')});
 },[denialKey]);
 const valid=number=>alive.current&&number===generation.current&&!lockedRef.current;
 const guardedApi=number=>{
  const principal=offlineIdentityKey(sessionRef.current?.identity),selected=outerRef.current;
  const check=()=>{if(!valid(number)||offlineIdentityKey(sessionRef.current?.identity)!==principal||outerRef.current!==selected||denied({...sessionRef.current?.identity,storeId:selected||scopeRef.current?.storeId}))throw Object.assign(Error('Το περιβάλλον εργασίας άλλαξε.'),{code:'LOCKED',status:401})};
  return async(path,options)=>{check();const result=await api(path,options);check();return result};
 };
 const run=async action=>{
  if(working.current||lockedRef.current)return;working.current=true;setBusy(true);setError('');setNotice('');const number=generation.current;
  try{await action(number)}catch(e){
   if(valid(number)){
    if([403,404].includes(e.status)&&scopeRef.current){try{await instance().revoke('ACCESS_REVOKED')}catch{setError('Δεν αποθηκεύτηκε η ανάκληση σε όλες τις καρτέλες. Κλείσε τη συσκευή και κάνε online ανανέωση.')}clearPlain()}
    else if(e.status===401||['CONFLICT','REVOKED','EXPIRED','LOCKED','FROZEN'].includes(e.code))clearPlain();
    if(alive.current)setError(previous=>previous||errors[e.code]||e.message||'Η ενέργεια δεν επιβεβαιώθηκε.');
   }
  }finally{if(valid(number)){working.current=false;setBusy(false)}}
 };
 const read=async(number,target=scopeRef.current)=>{const next=await instance().read();if(valid(number)){setData(next);setScope(target)}return next};
 const show=()=>{if(open){clearPlain();setOpen(false);return}setOpen(true);run(async number=>{const rows=await instance().listProfiles();if(valid(number))setProfiles(rows)})};
 const prepare=()=>run(async number=>{
  const current=sessionRef.current,target=outerRef.current,secret=password;setPassword('');
  if(!current||!target)throw Error('Συνδέσου online και επίλεξε συγκεκριμένο κατάστημα στην επάνω επιλογή.');
  if(denied({...current.identity,storeId:target}))throw Object.assign(Error(errors.REVOKED),{code:'REVOKED'});
  if(secret.length<12)throw Error('Ο τοπικός κωδικός συσκευής χρειάζεται τουλάχιστον 12 χαρακτήρες.');
  await ensureOfflineShell();if(!valid(number))return;
  let snapshot;
  try{snapshot=await fetchOfflineSnapshot(guardedApi(number),current,target)}catch(e){
   if(valid(number)&&[403,404].includes(e.status)){
    try{await instance().denyPrepared({...current.identity,storeId:target})}catch{throw Error('Η πρόσβαση απορρίφθηκε και δεν επιβεβαιώθηκε η μόνιμη ανάκληση της τοπικής προετοιμασίας. Κάνε online ανανέωση με τον αρχικό τοπικό κωδικό.');}
   }
   throw e;
  }
  if(!valid(number))return;
  const nextScope={...current.identity,storeId:target};await instance().prepare(nextScope,secret,snapshot);if(!valid(number))return;
  await read(number,nextScope);const rows=await instance().listProfiles();if(valid(number)){setProfiles(rows);setNotice('Η συσκευή προετοιμάστηκε. Τα τοπικά πρόχειρα είναι κρυπτογραφημένα· δεν αποστέλλονται αυτόματα.')}
 });
 const available=profiles.filter(profile=>(!session?.identity||offlineIdentityKey(profile.scope)===identityKey)&&(!storeId||profile.scope.storeId===storeId));
 const unlock=()=>run(async number=>{
  const profile=available.find(row=>offlineScopeKey(row.scope)===chosen),secret=password;setPassword('');
  if(!profile)throw Error('Επίλεξε ένα προετοιμασμένο δικό σου κατάστημα.');
  if(denied(profile.scope))throw Object.assign(Error(errors.REVOKED),{code:'REVOKED'});
  await instance().unlock(profile.scope,secret);if(valid(number))await read(number,profile.scope);
 });
 const add=()=>{if(!data||!quantityValid(quantity)||!data.snapshot.products.some(row=>row.id===productId))return;setCart(rows=>{const next=rows.filter(row=>row.productId!==productId);return [...next,{productId,quantity}]});setReview(null)};
 const cancelEdit=()=>{setEditingId('');setCustomerId('');setProductId('');setQuantity('1');setCart([]);setNotes('');setReview(null)};
 const edit=draft=>{if(busy||editingId||draft.status!=='LOCAL_DRAFT')return;setEditingId(draft.id);setCustomerId(draft.customerId);setProductId('');setQuantity('1');setCart(draft.items.map(row=>({...row})));setNotes(draft.notes);setReview(null);setError('');setNotice('')};
 const save=()=>run(async number=>{if(!data||!cart.length||!customerId)throw Error('Επίλεξε πελάτη και είδη.');if(editingId)await instance().editDraft(editingId,{customerId,items:cart,notes});else await instance().addDraft({customerId,items:cart,notes});if(!valid(number))return;await read(number);if(valid(number)){cancelEdit();setNotice('Αποθηκεύτηκε κρυπτογραφημένο τοπικό πρόχειρο. Δεν υπάρχει υποβολή ή οικονομική κίνηση.')}});
 const calculate=draft=>run(async number=>{
  if(editingId)throw Error('Αποθήκευσε ή ακύρωσε πρώτα τις τοπικές αλλαγές.');
  setReview(null);const next=await reviewOfflineDraft(guardedApi(number),sessionRef.current,scopeRef.current,draft);if(!valid(number))return;
  const current=await read(number);if(valid(number)&&current.drafts.some(row=>row.id===draft.id&&row.status==='LOCAL_DRAFT'))setReview({id:draft.id,...next});
 });
 const send=draft=>run(async number=>{
  if(editingId)throw Error('Αποθήκευσε ή ακύρωσε πρώτα τις τοπικές αλλαγές.');
  if(!scopeRef.current)throw Error('Ξεκλείδωσε την αρχική προετοιμασία.');const originalScope={...scopeRef.current},operationApi=guardedApi(number);
  if(draft.status==='LOCAL_DRAFT'){
   if(review?.id!==draft.id)throw Error('Απαιτείται τρέχων υπολογισμός και ρητή αποδοχή τιμών.');
   const next=await reviewOfflineDraft(operationApi,sessionRef.current,originalScope,draft);if(!valid(number))return;
   if(JSON.stringify(next.quote)!==JSON.stringify(review.quote)){setReview({id:draft.id,...next});throw Error('Οι τιμές άλλαξαν. Έλεγξε τον νέο υπολογισμό και αποδέξου ξανά.');}
   await instance().freezeSend(draft.id,{clientOrderId:draft.clientOrderId,customerId:draft.customerId,storeId:originalScope.storeId,items:draft.items,notes:draft.notes,quoteId:next.quote.quoteId});
   if(!valid(number))return;await read(number);if(!valid(number))return;setReview(null);
  }
  let denial=null;
  await instance().sendFrozen(draft.id,async bodyString=>{
   if(!valid(number)||offlineIdentityKey(sessionRef.current?.identity)!==offlineIdentityKey(originalScope))throw Error('Η σύνδεση άλλαξε.');
   try{return await sendOfflineFrozen(operationApi,sessionRef.current,originalScope,bodyString)}catch(e){if([401,403,404].includes(e.status))denial=e;return {status:[400,409,422].includes(e.status)?'REJECTED':'UNKNOWN',message:[400,409,422].includes(e.status)?'Ο server απέρριψε το αρχικό αίτημα. Απαιτείται έλεγχος.':'Δεν επιβεβαιώθηκε το αποτέλεσμα. Διατηρείται το ίδιο αρχικό αίτημα.'}}
  });
  if(!valid(number))return;await read(number);if(denial)throw denial;
 });
 const ready=Boolean(data&&scope&&!locked&&!denied(scope)&&context.current===contextKey&&(!session?.identity||offlineIdentityKey(scope)===identityKey)&&(!storeId||scope.storeId===storeId)),drafts=data?.drafts||[],snapshot=data?.snapshot;
 return <section className="wholesale-offline" aria-label="Λειτουργία χωρίς internet"><button type="button" aria-expanded={open} disabled={locked||busy} onClick={show}>Χωρίς internet · τοπικά πρόχειρα</button>{open&&<div className="wholesale-offline-body">
  <h2>Προετοιμασία συσκευής και τοπικές παραγγελίες</h2><p>Χωρίς σύνδεση καταγράφεις μόνο πρόχειρες παραγγελίες, χωρίς τιμές ή δέσμευση αποθέματος. Αποστολή γίνεται αποκλειστικά με δική σου ενέργεια, μετά από online έλεγχο δικαιωμάτων και αποδοχή τρεχουσών τιμών. Δεν εκδίδονται παραστατικά και δεν καταχωρίζονται πληρωμές.</p>
  <p>Η προετοιμασία ισχύει έως 24 ώρες, περιορίζεται από τη συνεδρία και την άδεια του module. Ανάκληση δικαιωμάτων δεν μπορεί να ελεγχθεί χωρίς σύνδεση. Φύλαξε τον ξεχωριστό τοπικό κωδικό· δεν ανακτάται.</p>
  {error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}{busy&&<p role="status">Επεξεργασία…</p>}{locked&&<p role="alert">Εκκρεμεί παραγγελία στο κύριο περιβάλλον. Το τοπικό περιβάλλον παραμένει κλειδωμένο.</p>}
  {!ready&&<fieldset disabled={busy||locked}><label>Τοπικός κωδικός συσκευής (τουλάχιστον 12 χαρακτήρες)<input aria-label="Τοπικός κωδικός συσκευής" type="password" autoComplete="off" value={password} onChange={e=>setPassword(e.target.value)}/></label><button type="button" onClick={prepare} disabled={!session||!storeId||!access||denied({...session?.identity,storeId})}>Προετοιμασία / ανανέωση online</button><label>Προετοιμασμένο προσωπικό κατάστημα<select aria-label="Προετοιμασμένο κατάστημα" value={chosen} onChange={e=>setChosen(e.target.value)}><option value="">Επίλεξε ρητά</option>{available.map(profile=><option key={offlineScopeKey(profile.scope)} disabled={denied(profile.scope)} value={offlineScopeKey(profile.scope)}>{profile.storeName} · {profile.scope.userId} · {profile.scope.companyId} · λήξη {new Date(profile.expiresAt).toLocaleString('el-GR')}</option>)}</select></label><button type="button" onClick={unlock} disabled={!chosen||available.some(profile=>offlineScopeKey(profile.scope)===chosen&&denied(profile.scope))}>Ξεκλείδωμα τοπικών προχείρων</button></fieldset>}
  {ready&&<><p><strong>{snapshot.store.name}</strong> · προσωπικό κατάστημα · λήξη {new Date(snapshot.expiresAt).toLocaleString('el-GR')}</p><button type="button" disabled={busy} onClick={clearPlain}>Κλείδωμα τοπικών δεδομένων</button><fieldset disabled={busy}><legend>{editingId?'Επεξεργασία του ίδιου τοπικού προχείρου — χωρίς τιμές':'Νέο τοπικό πρόχειρο — χωρίς τιμές'}</legend><label>Πελάτης<select aria-label="Τοπικός πελάτης" value={customerId} onChange={e=>{setCustomerId(e.target.value);setCart([])}}><option value="">Επίλεξε πελάτη</option>{snapshot.customers.map(row=><option key={row.id} value={row.id}>{row.name}</option>)}</select></label><label>Είδος<select aria-label="Τοπικό είδος" value={productId} onChange={e=>setProductId(e.target.value)}><option value="">Επίλεξε είδος</option>{snapshot.products.map(row=><option key={row.id} value={row.id}>{row.name} · {row.sku} · {row.unit}</option>)}</select></label><label>Ποσότητα<input aria-label="Τοπική ποσότητα" inputMode="decimal" value={quantity} onChange={e=>setQuantity(e.target.value)}/></label><button type="button" disabled={!customerId||!productId||!quantityValid(quantity)} onClick={add}>Προσθήκη στο πρόχειρο</button><ul>{cart.map(row=><li key={row.productId}>{snapshot.products.find(item=>item.id===row.productId)?.name} · {row.quantity}<button type="button" onClick={()=>setCart(rows=>rows.filter(item=>item.productId!==row.productId))}>Αφαίρεση</button></li>)}</ul><label>Σημείωση<input aria-label="Τοπική σημείωση" maxLength={2000} value={notes} onChange={e=>setNotes(e.target.value)}/></label><button type="button" disabled={!customerId||!cart.length} onClick={save}>{editingId?'Αποθήκευση αλλαγών στο ίδιο πρόχειρο':'Κρυπτογραφημένη αποθήκευση προχείρου'}</button>{editingId&&<button type="button" onClick={cancelEdit}>Ακύρωση τοπικής επεξεργασίας</button>}</fieldset>
   <h3>Αποθηκευμένα τοπικά αιτήματα</h3>{!drafts.length&&<p>Δεν υπάρχουν αποθηκευμένα πρόχειρα.</p>}{drafts.map(draft=><article key={draft.id} className="wholesale-offline-draft"><h4>{snapshot.customers.find(row=>row.id===draft.customerId)?.name||draft.customerId}</h4><p><strong>{statuses[draft.status]||draft.status}</strong></p><small>Αρχικό κλειδί: {draft.clientOrderId}</small><ul>{draft.items.map(row=><li key={row.productId}>{snapshot.products.find(item=>item.id===row.productId)?.name||row.productId} · {row.quantity}</li>)}</ul>{draft.notes&&<p>{draft.notes}</p>}{draft.serverOrderId&&<p>Παραγγελία server: {draft.serverOrderId}</p>}{draft.message&&<p>{draft.message}</p>}
    {draft.status==='LOCAL_DRAFT'&&<><button type="button" disabled={busy||Boolean(editingId)} onClick={()=>edit(draft)}>Επεξεργασία τοπικού προχείρου</button><button type="button" disabled={busy||Boolean(editingId)} onClick={()=>calculate(draft)}>Online έλεγχος και τρέχουσες τιμές</button></>}
    {review?.id===draft.id&&draft.status==='LOCAL_DRAFT'&&<section aria-label="Αποδοχή τρεχουσών τιμών"><p>Τρέχων υπολογισμός server: καθαρά {money(review.quote.totals.net)} · ΦΠΑ {money(review.quote.totals.vat)} · σύνολο <strong>{money(review.quote.totals.gross)}</strong></p><ul>{review.quote.items.map(row=><li key={row.productId}>{row.name} · {row.quantity} · καθαρά {money(row.netTotal)} · ΦΠΑ {money(row.vatTotal)} · σύνολο {money(row.grossTotal)}</li>)}</ul><p>Η διαθεσιμότητα δεν αποτελεί δέσμευση αποθέματος. Δεν έχει γίνει έλεγχος πίστωσης.</p><button type="button" disabled={busy||Boolean(editingId)} onClick={()=>send(draft)}>Αποδέχομαι τις τιμές και υποβάλλω μία φορά</button></section>}
    {['FROZEN','UNKNOWN','SENDING'].includes(draft.status)&&<button type="button" disabled={busy||Boolean(editingId)} onClick={()=>send(draft)}>Επανάληψη ακριβώς του αρχικού αιτήματος</button>}
   </article>)}</>}
 </div>}</section>;
}
