import React from 'react';
import {businessRecordLabel,businessStatusLabel} from '../../../../shared/assistant-business.mjs';
import {assistantMoney} from './presentAssistantAnswer.js';
export default function BusinessAssistantEvidence({evidence=[]}){
 return evidence.filter(r=>r.kind==='business_records').map((r,i)=><section key={i} className="mws-business-evidence" aria-label={r.title}>
  <h3>{r.title}</h3><p>{r.companyName} · {r.storeName} · {r.currentSnapshot?'Τρέχοντα στοιχεία':`${r.from} έως ${r.to} · ώρα Ελλάδας`}</p>
  {r.query&&<p>Φίλτρο: {r.query}</p>}{r.incompletePeriod&&<p>Στοιχεία έως {new Date(r.asOf).toLocaleString('el-GR',{timeZone:'Europe/Athens',hour12:false})}. Η περίοδος δεν έχει ολοκληρωθεί.</p>}
  {r.result==='source_limited'?<p role="status">{r.reason} Δεν εμφανίζεται πλήρες σύνολο.</p>:r.result==='no_records'?<p>Δεν βρέθηκαν καταχωρημένες εγγραφές στο συγκεκριμένο φίλτρο.</p>:<>
   <p><b>Εγγραφές: {r.totals?.count??r.rows.length}</b>{Number.isFinite(r.totals?.amount)&&<> · Συνολικό καταχωρημένο ποσό: <b>{assistantMoney(r.totals.amount)}</b></>}</p>
   <div style={{overflowX:'auto'}}><table><thead><tr><th>Ημερομηνία</th><th>Είδος</th><th>Περιγραφή / Ονομασία</th><th>Ποσό</th><th>Χειριστής</th><th>Αριθμός / Ταμείο</th><th>Κατάσταση</th></tr></thead><tbody>{r.rows.map(x=><tr key={x.recordId}><td>{new Date(x.recordedAt).toLocaleString('el-GR',{timeZone:'Europe/Athens',hour12:false})}</td><td>{businessRecordLabel(x.recordType)}</td><td>{x.label}</td><td>{x.amount===null?'—':assistantMoney(x.amount)}</td><td>{x.operatorName||'—'}</td><td>{x.reference||'—'}</td><td>{businessStatusLabel(x.status)}</td></tr>)}</tbody></table></div>
  </>}
  <small>Πηγή: {r.source}. Μόνο το επιλεγμένο κατάστημα. Οι χειριστές δείχνουν καταχώριση, όχι συμπέρασμα ευθύνης.</small>
  <style>{'.mws-business-evidence{margin-top:16px;padding:14px;background:#f4f8fc;border-radius:12px}.mws-business-evidence table{width:100%;border-collapse:collapse}.mws-business-evidence th,.mws-business-evidence td{padding:10px;text-align:left;border-bottom:1px solid #cbd8e5;white-space:nowrap}'}</style>
 </section>);
}
