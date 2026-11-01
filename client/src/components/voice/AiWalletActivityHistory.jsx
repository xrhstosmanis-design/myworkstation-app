import {staffProfiles} from "../../../../shared/backoffice-staff.mjs";
import React,{useMemo,useState} from 'react';
import {walletMoney} from './ai-wallet-money.mjs';
import {purposeLabels,statusLabels,sourceLabels,roleLabels,surfaceLabels,activityPurpose,activityActor,activityActorKey,activitySource,activityProvider,filterWalletActivity,walletActivityTotals} from './ai-wallet-activity.mjs';

const unknown='Δεν έχει καταγραφεί';
const dateLabel=value=>value&&!Number.isNaN(new Date(value).getTime())?new Date(value).toLocaleString('el-GR',{timeZone:'Europe/Athens',hourCycle:'h23'}):'—';
const choices=(entries,key,label)=>[...new Map(entries.map(e=>[key(e),label(e)])).entries()].sort((a,b)=>a[1].localeCompare(b[1],'el'));
export default function AiWalletActivityHistory({entries=[],stores=[]}){
  const [filters,setFilters]=useState({purpose:'',actor:'',store:'',status:'',source:''});
  const visible=useMemo(()=>filterWalletActivity(entries,filters),[entries,filters]);
  const totals=walletActivityTotals(visible);
  const storeLabel=e=>!e.storeId?'Εταιρική πίστωση':stores.find(s=>s.id===e.storeId)?.name||e.storeName||'Παλιό / μη διαθέσιμο κατάστημα';
  const selects=[['purpose','Λειτουργία AI',choices(entries,activityPurpose,e=>purposeLabels[activityPurpose(e)])],['actor','Χρήστης / χειριστής',choices(entries,activityActorKey,e=>activityActor(e)?.name||unknown)],['store','Κατάστημα κίνησης',choices(entries,e=>e.storeId||'COMPANY',storeLabel)],['status','Κατάσταση κίνησης',choices(entries,e=>e.status,e=>statusLabels[e.status]||unknown)],['source','Προέλευση χρήσης',choices(entries,activitySource,e=>sourceLabels[activitySource(e)])]];
  const grouped=choices(visible,activityPurpose,e=>purposeLabels[activityPurpose(e)]);
  return <section className="ai-wallet-activity" aria-label="Αναλυτικές κινήσεις AI">
    <h2>Αναλυτικές κινήσεις AI</h2>
    <p>Τελευταίες έως 100 κινήσεις. Τα φίλτρα και τα σύνολα παρακάτω αφορούν μόνο αυτή τη λίστα. Ώρες Ελλάδας.</p>
    <div className="ai-wallet-activity-filters">{selects.map(([key,label,options])=><label key={key}>{label}<select value={filters[key]} onChange={e=>setFilters(previous=>({...previous,[key]:e.target.value}))}><option value="">Όλες</option>{options.map(([value,text])=><option key={value} value={value}>{text}</option>)}</select></label>)}<button type="button" onClick={()=>setFilters({purpose:'',actor:'',store:'',status:'',source:''})}>Καθαρισμός φίλτρων</button></div>
    <div role="status" className="ai-wallet-activity-totals"><strong>{visible.length} κινήσεις</strong><span>Οριστικές χρεώσεις: {walletMoney(totals.charged)}</span><span>Εκκρεμείς δεσμεύσεις: {walletMoney(totals.reserved)}</span><span>Πιστώσεις: {walletMoney(totals.credited)}</span></div>
    {grouped.length>0&&<details><summary>Σύνολα λίστας ανά λειτουργία</summary><ul>{grouped.map(([key,label])=>{const rows=visible.filter(e=>activityPurpose(e)===key),sum=walletActivityTotals(rows);return <li key={key}>{label}: {rows.length} κινήσεις · χρεώσεις {walletMoney(sum.charged)} · δεσμεύσεις {walletMoney(sum.reserved)}{rows.some(e=>e.kind==='CREDIT')&&<> · πιστώσεις {walletMoney(sum.credited)}</>}</li>})}</ul></details>}
    {!visible.length&&<p>Δεν υπάρχουν κινήσεις με αυτά τα φίλτρα.</p>}
    <ul className="ai-wallet-activity-list">{visible.map(e=>{const actor=activityActor(e),activity=e.activity;return <li key={e.id}>
      <div className="ai-wallet-activity-heading"><strong>{e.postpaid?.type==='DEBT_PAYMENT'?'Εξόφληση οφειλής AI':e.postpaid?.type==='CREDIT_ON_ACCOUNT'?'Πίστωση AI επί πιστώσει':purposeLabels[activityPurpose(e)]}</strong><span>{e.postpaid?.type==='DEBT_PAYMENT'?'Καταχωρισμένη είσπραξη':statusLabels[e.status]||unknown}</span></div>
      <p className="ai-wallet-activity-amount">{e.postpaid?.type==='DEBT_PAYMENT'?<>Εξόφληση {walletMoney(e.postpaid.amountMicros)} · Δεν προστέθηκε νέο υπόλοιπο AI.</>:e.kind==='CREDIT'?<>Πίστωση {walletMoney(e.creditedMicros)}</>:e.status==='SETTLED'?<>Τελική χρέωση {walletMoney(e.chargedMicros)}</>:<>Δέσμευση {walletMoney(e.reservedMicros)}<small>Το ποσό δεν είναι οριστική χρέωση.</small></>}</p>
      <p><strong>{e.kind==='CREDIT'?'Καταχωρίστηκε από':'Αρχικός αιτών'}:</strong> {actor?.name||unknown}{actor?.role&&<> · Ρόλος συνεδρίας: {roleLabels[actor.role]||actor.role}</>}{actor?.kind==='POS_OPERATOR'&&' · Χειριστής POS'}{actor?.kind==='SUPPORT'&&' · Πρόσβαση υποστήριξης'}{actor?.kind==='DELEGATED_USER'&&' · Προσωπική πρόσβαση'}</p>
      <p>{storeLabel(e)} · {dateLabel(e.createdAt)}{activity?.terminalPos&&<> · Ταμείο {activity.terminalPos}</>}</p>
      <p>Προέλευση: {sourceLabels[activitySource(e)]}{activity&&<> · Οθόνη / ροή: {surfaceLabels[activity.surface]||unknown}</>}</p>
      {e.kind!=='CREDIT'&&<p>Υπηρεσία AI: {activityProvider(e)}{e.model&&<> · Μοντέλο: {e.model}</>}</p>}
      {e.status==='SETTLED'&&e.customerCharge&&<p>Χρήση {walletMoney(e.customerCharge.baseMicros)} + προσαύξηση {walletMoney(e.customerCharge.additionalMarkupMicros)} + κλήση {walletMoney(e.customerCharge.callFeeMicros)} + τιμολόγιο {walletMoney(e.customerCharge.invoiceFeeMicros)}</p>}
      {!activity&&e.kind!=='CREDIT'&&<p>Παλιά κίνηση χωρίς καταγεγραμμένο αρχικό χρήστη ή επιμέρους προέλευση. Δεν αποδίδεται σε κάποιον από εκτίμηση.</p>}
      <details><summary>Στοιχεία κίνησης</summary><dl>
        <dt>Αναφορά κίνησης</dt><dd>{e.id}</dd>
        {activity?.documentNumber&&<><dt>Παραστατικό</dt><dd>{activity.documentNumber}</dd></>}
        <dt>Αναφορά αποθηκευμένου παραστατικού</dt><dd>{activity?.documentId||unknown}</dd>
        <dt>Εργασία ανάγνωσης</dt><dd>{activity?.jobId||unknown}</dd>
        {actor?.profile&&<><dt>Προφίλ προσωπικής πρόσβασης</dt><dd>{staffProfiles[actor.profile]?.label||actor.profile}</dd></>}
        {activity?.execution==='BACKGROUND'&&<><dt>Εκτελεστής</dt><dd>Αυτόματη εργασία. Ο αρχικός αιτών εμφανίζεται χωριστά.</dd></>}
        <dt>Οριστικοποίηση</dt><dd>{e.status==='SETTLED'?dateLabel(e.settledAt):e.kind==='CREDIT'?'Καταχωρισμένη πίστωση':'Δεν έχει οριστικοποιηθεί'}</dd>
        {e.manuallyResolved&&<><dt>Έλεγχος / επίλυση εκκρεμότητας από</dt><dd>{e.actionUser?.name||unknown} · Δεν είναι κατ’ ανάγκη ο αρχικός αιτών.</dd></>}
        {e.kind!=='CREDIT'&&<><dt>Καταγεγραμμένη χρήση</dt><dd>{e.pages!=null?`${e.pages} σελίδες`:e.inputTokens!=null?`Είσοδος ${e.inputTokens} tokens · έξοδος ${e.outputTokens??unknown} · από προσωρινή μνήμη ${e.cachedInputTokens??unknown}`:unknown}</dd></>}
      </dl></details>
    </li>})}</ul>
    <style>{`.ai-wallet-activity{margin:24px 0;text-align:left}.ai-wallet-activity-filters{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,200px),1fr));gap:12px}.ai-wallet-activity-filters label{display:grid;gap:6px}.ai-wallet-activity select,.ai-wallet-activity button,.ai-wallet-activity summary{min-height:44px;font:inherit}.ai-wallet-activity select{width:100%;padding:8px}.ai-wallet-activity-totals{display:flex;flex-wrap:wrap;gap:12px;margin:18px 0;padding:14px;background:#edf3fa;border-radius:10px}.ai-wallet-activity-list{list-style:none;padding:0;display:grid;gap:14px}.ai-wallet-activity-list>li{padding:16px;border:1px solid #cbd5e1;border-radius:12px;background:#fff;color:#172d46;overflow-wrap:anywhere}.ai-wallet-activity-heading{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap}.ai-wallet-activity-heading>span{font-weight:600}.ai-wallet-activity-amount{font-size:1.1em;font-weight:700}.ai-wallet-activity-amount small{display:block;font-size:.85em;font-weight:400}.ai-wallet-activity summary{cursor:pointer;padding:8px 0}.ai-wallet-activity dl{display:grid;grid-template-columns:minmax(100px,1fr) minmax(0,2fr);gap:8px}.ai-wallet-activity dt{font-weight:600}.ai-wallet-activity dd{margin:0}@media(max-width:600px){.ai-wallet-activity dl{grid-template-columns:1fr}.ai-wallet-activity dd{margin-bottom:8px}}`}</style>
  </section>;
}
