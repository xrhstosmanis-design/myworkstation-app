import React,{useEffect,useRef,useState} from 'react';
import {walletMoney,walletMicrosFromEuros} from '../voice/ai-wallet-money.mjs';
function TrialGrantForm({busy,onGrant}){
  const [amount,setAmount]=useState(''),[reference,setReference]=useState(''),[reason,setReason]=useState(''),[confirmed,setConfirmed]=useState(false);
  return <form aria-label="Δοκιμαστική πίστωση AI" onSubmit={e=>{e.preventDefault();onGrant({amount,reference,reason,confirmed})}}>
    <p>Εσωτερική δοκιμαστική παροχή από το MyWorkStation, χωρίς είσπραξη από τον πελάτη. Η πίστωση δεν ενεργοποιεί τη χρέωση AI.</p>
    <label>Δοκιμαστικό ποσό (€) <input inputMode="decimal" value={amount} disabled={busy} onChange={e=>setAmount(e.target.value)} required/></label>
    <label>Μοναδική αναφορά δοκιμαστικής παροχής <input value={reference} maxLength={160} minLength={5} disabled={busy} onChange={e=>setReference(e.target.value)} required/></label>
    <label>Αιτιολογία δοκιμαστικής παροχής <input value={reason} maxLength={300} minLength={5} disabled={busy} onChange={e=>setReason(e.target.value)} required/></label>
    <label><input type="checkbox" checked={confirmed} disabled={busy} onChange={e=>setConfirmed(e.target.checked)}/> Εγκρίνω εσωτερική δοκιμαστική πίστωση.</label>
    <button disabled={busy||!confirmed}>Καταχώριση δοκιμαστικής πίστωσης</button>
  </form>;
}
export default function AiOwnerWalletAdmin({api,companies=[],onClose}){
  const [companyId,setCompanyId]=useState(''),[data,setData]=useState(null),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false),[amount,setAmount]=useState(''),[receipt,setReceipt]=useState(''),[confirmed,setConfirmed]=useState(false),[enabled,setEnabled]=useState(false),[emailEnabled,setEmailEnabled]=useState(false),[ownerId,setOwnerId]=useState('');
  const epoch=useRef(0),pending=useRef(null),mutating=useRef(false);
  const path=`/api/ai-wallet/platform/companies/${encodeURIComponent(companyId)}`;
  useEffect(()=>{
    const generation=++epoch.current;pending.current?.abort();const controller=new AbortController();pending.current=controller;
    setData(null);setError('');setNotice('');setAmount('');setReceipt('');setConfirmed(false);
    if(companyId)api(path,{signal:controller.signal,cache:'no-store'}).then(value=>{if(generation===epoch.current&&!controller.signal.aborted){if(value.companyId!==companyId)throw new Error('Η εταιρεία άλλαξε.');setData(value);setEnabled(value.enabled);setEmailEnabled(value.emailEnabled||false);setOwnerId(value.notificationOwnerId||'')}}).catch(e=>{if(!controller.signal.aborted&&generation===epoch.current)setError(e.message)});
    return()=>{epoch.current++;controller.abort()};
  },[api,companyId]);
  const execute=async(operation,success)=>{
    if(mutating.current||!companyId||!data?.runtimeEnabled||data.companyId!==companyId)return;
    mutating.current=true;setBusy(true);setError('');setNotice('');const generation=epoch.current;
    try{await operation();const value=await api(path,{cache:'no-store'});if(generation===epoch.current){if(value.companyId!==companyId)throw new Error('Η εταιρεία άλλαξε.');setData(value);setEnabled(value.enabled);setEmailEnabled(value.emailEnabled);setOwnerId(value.notificationOwnerId||'');setNotice(success);setAmount('');setReceipt('');setConfirmed(false)}}catch(e){if(generation===epoch.current)setError(e.message)}finally{mutating.current=false;if(generation===epoch.current)setBusy(false)};
  };
  return <div role="dialog" aria-modal="true" aria-label="Διαχείριση υπολοίπου AI" style={{position:'fixed',inset:0,zIndex:1500,background:'#fff',padding:24,overflow:'auto',color:'#173550'}}>
    <button type="button" onClick={onClose} disabled={busy}>Κλείσιμο</button><h1>Υπόλοιπα AI πελατών</h1>
    <label>Εταιρεία <select value={companyId} disabled={busy} onChange={e=>setCompanyId(e.target.value)}><option value="">Επίλεξε εταιρεία</option>{companies.filter(c=>c.active).map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
    {error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
    {data?.companyId===companyId&&(data?.runtimeEnabled===false?<p>Η υπηρεσία προπληρωμένης χρέωσης δεν έχει ενεργοποιηθεί στον server.</p>:<>
      <h2>Διαθέσιμο {walletMoney(data.availableMicros)} · Δεσμευμένο {walletMoney(data.reservedMicros)}</h2>
      <p>{data.meteredFeatures?.includes('INVOICE_OPENAI')?'Η χρέωση καλύπτει τον Βοηθό Ιδιοκτήτη και τις αναγνώσεις τιμολογίων με AI.':'Η χρέωση καλύπτει τον Βοηθό Ιδιοκτήτη. Οι αναγνώσεις τιμολογίων δεν έχουν ενεργοποιηθεί για χρέωση.'}</p>
      <form onSubmit={e=>{e.preventDefault();execute(()=>api(path,{method:'PUT',body:JSON.stringify({version:data.version,enabled,emailEnabled,notificationOwnerId:ownerId})}),'Οι ρυθμίσεις αποθηκεύτηκαν.')}}>
        <label><input type="checkbox" checked={enabled} disabled={busy} onChange={e=>setEnabled(e.target.checked)}/> Χρέωση AI στον πελάτη</label><br/>
        <p>Ρύθμιση για αυτή την εταιρεία, σύμφωνα με τη συμφωνία της. Όταν είναι ανενεργή, η χρήση AI συνεχίζεται με κόστος του MyWorkStation. Το υπάρχον υπόλοιπο και το ιστορικό διατηρούνται. Κλήσεις που έχουν ήδη δεσμευτεί ολοκληρώνουν τη χρέωσή τους.</p>
        <label><input type="checkbox" checked={emailEnabled} disabled={busy} onChange={e=>setEmailEnabled(e.target.checked)}/> Ειδοποιήσεις email στον ιδιοκτήτη</label>
        <select aria-label="Ιδιοκτήτης για ειδοποιήσεις" value={ownerId} disabled={busy} onChange={e=>setOwnerId(e.target.value)}><option value="">Επίλεξε ιδιοκτήτη</option>{(data.owners||[]).map(o=><option key={o.id} value={o.id}>{o.fullName} · {o.email}</option>)}</select>
        <button disabled={busy||emailEnabled&&!ownerId}>Αποθήκευση ρυθμίσεων</button>
      </form>
      <h2>Δοκιμαστική πίστωση από το MyWorkStation</h2>
      <TrialGrantForm key={companyId+':'+data.version} busy={busy} onGrant={input=>execute(()=>api(path+'/trial-grants',{method:'POST',body:JSON.stringify({amountMicros:walletMicrosFromEuros(input.amount),grantReference:input.reference.trim(),reason:input.reason.trim(),trialConfirmed:input.confirmed})}),'Η δοκιμαστική πίστωση καταγράφηκε.')}/>
      <h2>Πίστωση επιβεβαιωμένης είσπραξης</h2><form onSubmit={e=>{e.preventDefault();execute(()=>api(path+'/credits',{method:'POST',body:JSON.stringify({amountMicros:walletMicrosFromEuros(amount),receiptReference:receipt.trim(),receiptConfirmed:confirmed})}),'Η πίστωση καταγράφηκε.')}}>
        <label>Καθαρό ποσό για χρήση AI (€) <input inputMode="decimal" value={amount} disabled={busy} onChange={e=>setAmount(e.target.value)} required/></label>
        <label>Μοναδική αναφορά είσπραξης <input value={receipt} maxLength={160} minLength={5} disabled={busy} onChange={e=>setReceipt(e.target.value)} required/></label>
        <label><input type="checkbox" checked={confirmed} disabled={busy} onChange={e=>setConfirmed(e.target.checked)}/> Επιβεβαίωσα την είσπραξη. Το ποσό αφορά διαθέσιμο υπόλοιπο AI.</label>
        <button disabled={busy||!confirmed}>Καταχώριση πίστωσης</button>
      </form>
      <h2>Κατανάλωση ανά κατάστημα</h2><ul>{(data.usage||[]).map(u=><li key={u.storeId}>{companies.find(c=>c.id===companyId)?.stores?.find(s=>s.id===u.storeId)?.name||u.storeId}: {walletMoney(u.chargedMicros)} · {u.requests} κλήσεις</li>)}</ul>
      <h2>Πρόσφατες κινήσεις</h2><ul>{(data.entries||[]).map(e=><li key={e.id}>{new Date(e.createdAt).toLocaleString('el-GR',{hour12:false})} · {e.kind==='CREDIT'?(e.feature==='TRIAL_GRANT'?'Δοκιμαστική πίστωση από MyWorkStation ':'Πίστωση ')+walletMoney(e.creditedMicros):e.status==='SETTLED'?'Χρήση '+walletMoney(e.chargedMicros):e.status==='REVIEW'?'Υπό έλεγχο · '+e.id+' · Δέσμευση '+walletMoney(e.reservedMicros):'Σε εξέλιξη'}</li>)}</ul>
      <h2>Ειδοποιήσεις</h2><ul>{(data.notices||[]).map(n=><li key={n.id}>{({CREDIT:'Πίστωση',LOW:'Χαμηλό υπόλοιπο',EMPTY:'Μηδενικό υπόλοιπο'})[n.kind]} · {new Date(n.createdAt).toLocaleString('el-GR',{hour12:false})} · Email: {({ACCEPTED:'Παραλήφθηκε από SMTP',PENDING:'Σε αναμονή',ATTEMPTING:'Η αποστολή χρειάζεται έλεγχο',UNKNOWN:'Αβέβαιο αποτέλεσμα — χωρίς επανάληψη',DISABLED:'Ανενεργό',REVOKED:'Ανακλήθηκε'})[n.emailStatus]||n.emailStatus}</li>)}</ul>
    </>)}
    <style>{`[aria-label="Διαχείριση υπολοίπου AI"] form{display:grid;gap:12px;max-width:800px;margin:20px 0;padding:16px;background:#f1f5f9;border-radius:12px}[aria-label="Διαχείριση υπολοίπου AI"] input:not([type=checkbox]),[aria-label="Διαχείριση υπολοίπου AI"] select{padding:10px;max-width:100%;box-sizing:border-box}[aria-label="Διαχείριση υπολοίπου AI"] button{padding:10px;min-height:44px}`}</style>
  </div>;
}
