import React,{useEffect,useState} from 'react';
import {walletMoney} from './ai-wallet-money.mjs';
const noticeLabels={CREDIT:'Επιβεβαίωση πίστωσης',LOW:'Χαμηλό υπόλοιπο AI',EMPTY:'Εξαντλήθηκε το υπόλοιπο AI'};
export default function AiOwnerWallet({api,storeId='',enabled=false}){
  const [data,setData]=useState(null),[error,setError]=useState(''),[details,setDetails]=useState(false),[renew,setRenew]=useState(false);
  useEffect(()=>{
    let closed=false,busy=false,controller;
    setData(null);setError('');setDetails(false);setRenew(false);
    const load=async()=>{if(!enabled||!storeId||busy||closed)return;busy=true;controller=new AbortController();try{
      const result=await api(`/api/ai-wallet/stores/${encodeURIComponent(storeId)}`,{signal:controller.signal,cache:'no-store'});
      if(!closed&&!controller.signal.aborted){if(result.storeId!==storeId)throw new Error('Άλλαξε το επιλεγμένο κατάστημα.');setData(result);setError('')}
    }catch(e){if(!closed&&!controller.signal.aborted){setData(null);setError(e.message||'Δεν διαβάστηκε το υπόλοιπο AI.')}}finally{busy=false}};
    load();const timer=setInterval(load,30000);window.addEventListener('focus',load);window.addEventListener('myworkstation:ai-usage',load);
    return()=>{closed=true;controller?.abort();clearInterval(timer);window.removeEventListener('focus',load);window.removeEventListener('myworkstation:ai-usage',load)};
  },[api,storeId,enabled]);
  if(!enabled||!storeId||data?.runtimeEnabled===false||data&&data.storeId!==storeId)return null;
  return <section aria-label="Υπόλοιπο AI" style={{padding:16,margin:'12px 0',border:'1px solid #94a3b8',borderRadius:12,background:'#f8fafc',color:'#173550'}}>
    <h3 style={{marginTop:0}}>Υπόλοιπο AI εταιρείας</h3>
    {error?<p role="alert">{error}</p>:!data?<p>Ανάγνωση υπολοίπου…</p>:<>
      {!data.enabled?<p>Η προπληρωμένη χρήση AI δεν έχει ενεργοποιηθεί για την εταιρεία.</p>:<>
        <p role={data.state==='OK'?'status':'alert'}><strong>Διαθέσιμο: {walletMoney(data.availableMicros)}</strong>{data.state==='LOW'?' · Χρειάζεται ανανέωση.':data.state==='EMPTY'?' · Το υπόλοιπο εξαντλήθηκε.':''}</p>
        <p>Κοινό υπόλοιπο για τα καταστήματα της εταιρείας. Οι πωλήσεις και το υπόλοιπο πρόγραμμα συνεχίζουν κανονικά.</p>
        {data.reservedMicros!=='0'&&<p>Δεσμευμένο για κλήσεις AI σε εξέλιξη ή υπό έλεγχο: {walletMoney(data.reservedMicros)}.</p>}
      </>}
      <button type="button" onClick={()=>setRenew(v=>!v)}>Ανανέωση υπολοίπου AI</button>{renew&&<p style={{whiteSpace:'pre-wrap'}}>{data.paymentInstructions}</p>}
      <button type="button" onClick={()=>setDetails(v=>!v)} aria-expanded={details}>Πληρωμές και κατανάλωση</button>
      {details&&<>
        <p>Κατανάλωση επιλεγμένου καταστήματος: {walletMoney(data.usage?.[0]?.chargedMicros||'0')} συνολικά. Η χρέωση AI λειτουργεί προς το παρόν στον Βοηθό Ιδιοκτήτη.</p>
        <ul>{(data.entries||[]).map(e=><li key={e.id}>{new Date(e.createdAt).toLocaleString('el-GR',{hour12:false})} · {e.kind==='CREDIT'?`Πίστωση ${walletMoney(e.creditedMicros)}`:e.status==='SETTLED'?`Χρήση AI ${walletMoney(e.chargedMicros)}`:e.status==='REVIEW'?'Κλήση AI υπό έλεγχο':'Κλήση AI σε εξέλιξη'}</li>)}</ul>
        <h4>Ειδοποιήσεις εταιρείας</h4><ul>{(data.notices||[]).map(n=><li key={n.id}>{noticeLabels[n.kind]} · {new Date(n.createdAt).toLocaleString('el-GR',{hour12:false})} · Υπόλοιπο τότε {walletMoney(n.balanceMicros)}</li>)}</ul>
      </>}
    </>}
  </section>;
}
