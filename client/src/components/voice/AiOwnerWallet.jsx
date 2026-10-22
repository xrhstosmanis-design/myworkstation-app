import React,{useEffect,useState} from 'react';
import {walletMoney} from './ai-wallet-money.mjs';
const noticeLabels={CREDIT:'Επιβεβαίωση πίστωσης',LOW:'Χαμηλό υπόλοιπο AI',EMPTY:'Εξαντλήθηκε το υπόλοιπο AI'};
const categoryLabels={INVOICES:'Τιμολόγια',QUESTIONS:'Ερωτήσεις στον βοηθό',OTHER:'Άλλες λειτουργίες AI'};
const featureLabel=feature=>categoryLabels[['INVOICE_OPENAI','INVOICE_AZURE','INVOICE_AI'].includes(feature)?'INVOICES':feature==='OWNER_ASSISTANT'?'QUESTIONS':'OTHER'];
const dayLabel=value=>value.split('-').reverse().join('/');
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
    <style>{`section[aria-label="Υπόλοιπο AI"] table{border-collapse:collapse;min-width:460px;width:100%;margin:12px 0}section[aria-label="Υπόλοιπο AI"] th,section[aria-label="Υπόλοιπο AI"] td{padding:10px;text-align:left;border-bottom:1px solid #cbd5e1}section[aria-label="Υπόλοιπο AI"] caption{text-align:left;font-weight:bold;padding:8px 0}`}</style>
    <h3 style={{marginTop:0}}>Υπόλοιπο AI εταιρείας</h3>
    {error?<p role="alert">{error}</p>:!data?<p>Ανάγνωση υπολοίπου…</p>:<>
      {!data.enabled?<p>Η προπληρωμένη χρήση AI δεν έχει ενεργοποιηθεί για την εταιρεία.</p>:<>
        <p role={data.state==='OK'?'status':'alert'}><strong>Διαθέσιμο: {walletMoney(data.availableMicros)}</strong>{data.state==='LOW'?' · Χρειάζεται ανανέωση.':data.state==='EMPTY'?' · Το υπόλοιπο εξαντλήθηκε.':''}</p>
        <p>Κοινό υπόλοιπο για τα καταστήματα της εταιρείας. Οι πωλήσεις και το υπόλοιπο πρόγραμμα συνεχίζουν κανονικά.</p>
        {data.reservedMicros!=='0'&&<p>Δεσμευμένο για κλήσεις AI σε εξέλιξη ή υπό έλεγχο: {walletMoney(data.reservedMicros)}.</p>}
      </>}
      {data.usageSummary&&<section aria-label="Κόστος χρήσης AI επιλεγμένου καταστήματος">
        <h4>Κόστος χρήσης AI · επιλεγμένο κατάστημα</h4>
        <p>Σήμερα: <strong>{walletMoney(data.usageSummary.todayMicros)}</strong> · Από {dayLabel(data.usageSummary.monthStartDate)} έως σήμερα: <strong>{walletMoney(data.usageSummary.monthMicros)}</strong></p>
        <p>Συνολικά από την έναρξη χρήσης έως σήμερα: <strong>{walletMoney(data.usageSummary.allTimeMicros)}</strong></p>
        <p>Ενημέρωση: {new Date(data.usageSummary.asOf).toLocaleString('el-GR',{timeZone:'Europe/Athens',hourCycle:'h23'})} (ώρα Ελλάδας).</p>
        <p>Τα ποσά είναι οι τελικές ολοκληρωμένες χρεώσεις χρήσης AI. Οι δεσμεύσεις εμφανίζονται χωριστά.</p>
        <div style={{overflowX:'auto'}}><table>
          <caption>Ανάλυση ανά χρήση AI</caption>
          <thead><tr><th scope="col">Χρήση</th><th scope="col">Σήμερα</th><th scope="col">Μήνας έως σήμερα</th><th scope="col">Συνολικά έως σήμερα</th></tr></thead>
          <tbody>{data.usageSummary.categories.map(row=><tr key={row.category}><th scope="row">{categoryLabels[row.category]||categoryLabels.OTHER}</th><td>{walletMoney(row.todayMicros)}</td><td>{walletMoney(row.monthMicros)}</td><td>{walletMoney(row.allTimeMicros)}</td></tr>)}</tbody>
        </table></div>
        {!data.usageSummary.categories.length&&<p>Δεν υπάρχουν ολοκληρωμένες χρεώσεις AI έως αυτή την ενημέρωση.</p>}
      </section>}
      <button type="button" onClick={()=>setRenew(v=>!v)}>Ανανέωση υπολοίπου AI</button>{renew&&<p style={{whiteSpace:'pre-wrap'}}>{data.paymentInstructions}</p>}
      <button type="button" onClick={()=>setDetails(v=>!v)} aria-expanded={details}>Πληρωμές και κατανάλωση</button>
      {details&&<>
        {data.usageSummary&&<div style={{overflowX:'auto'}}><table>
          <caption>Ημερήσια ανάλυση τρέχοντος μήνα</caption>
          <thead><tr><th scope="col">Ημερομηνία</th><th scope="col">Χρήση</th><th scope="col">Χρέωση</th></tr></thead>
          <tbody>{data.usageSummary.daily.map(row=><tr key={row.date+row.category}><td>{dayLabel(row.date)}</td><td>{categoryLabels[row.category]||categoryLabels.OTHER}</td><td>{walletMoney(row.chargedMicros)}</td></tr>)}</tbody>
        </table></div>}
        <p>Κατανάλωση επιλεγμένου καταστήματος: {walletMoney(data.usageSummary?.allTimeMicros??data.usage?.[0]?.chargedMicros??'0')} συνολικά. {data.meteredFeatures?.includes('INVOICE_OPENAI')?'Η χρέωση καλύπτει τον Βοηθό Ιδιοκτήτη και τις αναγνώσεις τιμολογίων με AI.':'Η χρέωση καλύπτει προς το παρόν τον Βοηθό Ιδιοκτήτη.'}</p>
        <h4>Πρόσφατες κινήσεις · έως 100</h4>
        <ul>{(data.entries||[]).map(e=><li key={e.id}>{new Date(e.status==='SETTLED'?e.settledAt||e.createdAt:e.createdAt).toLocaleString('el-GR',{timeZone:'Europe/Athens',hourCycle:'h23'})} · {e.kind==='CREDIT'?`Πίστωση ${walletMoney(e.creditedMicros)}`:`${featureLabel(e.feature)} · ${e.status==='SETTLED'?`Χρήση AI ${walletMoney(e.chargedMicros)}`:e.status==='REVIEW'?'Κλήση AI υπό έλεγχο':'Κλήση AI σε εξέλιξη'}`}</li>)}</ul>
        <h4>Ειδοποιήσεις εταιρείας</h4><ul>{(data.notices||[]).map(n=><li key={n.id}>{noticeLabels[n.kind]} · {new Date(n.createdAt).toLocaleString('el-GR',{hour12:false})} · Υπόλοιπο τότε {walletMoney(n.balanceMicros)}</li>)}</ul>
      </>}
    </>}
  </section>;
}
