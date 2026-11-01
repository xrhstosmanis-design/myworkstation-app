import React,{useState} from 'react';
import {previewSharedCost,sharedCostStores,sharedCostCatalogueKey,sharedCostPeriodDays,sharedCostExampleCompanies} from './shared-cost-preview.mjs';

const emptyRow=()=>({storeId:'',days:''});
const euros=cents=>(Number(cents)/100).toLocaleString('el-GR',{style:'currency',currency:'EUR',minimumFractionDigits:2,maximumFractionDigits:2});
export default function SharedCostPreview({companies=[]}){
  const [example,setExample]=useState(false),[period,setPeriod]=useState(''),[amount,setAmount]=useState(''),[reference,setReference]=useState(''),[confirmed,setConfirmed]=useState(false),[participants,setParticipants]=useState([emptyRow()]),[preview,setPreview]=useState(null),[error,setError]=useState('');
  const catalogue=example?sharedCostExampleCompanies:companies;
  let stores=[],catalogueKey='',catalogueError='';
  try{stores=sharedCostStores(catalogue);catalogueKey=sharedCostCatalogueKey(catalogue)}catch(e){catalogueError=e.message}
  const result=preview?.catalogueKey===catalogueKey&&!catalogueError?preview.result:null;
  const changed=work=>{setPreview(null);setError('');work()};
  const updateRow=(index,field,value)=>changed(()=>setParticipants(rows=>rows.map((row,i)=>i===index?{...row,[field]:value}:row)));
  const reset=()=>changed(()=>{setExample(false);setPeriod('');setAmount('');setReference('');setConfirmed(false);setParticipants([emptyRow()])});
  const sample=()=>changed(()=>{setExample(true);setPeriod('2026-10');setAmount('100,00');setReference('Ενδεικτικό παράδειγμα υπολογισμού');setConfirmed(true);setParticipants(['A','B','C'].map((letter,i)=>({storeId:'example-store-'+letter,days:i===2?'16':'31'})))});
  let maxDays=31;try{maxDays=sharedCostPeriodDays(period)}catch{}
  return <details className="shared-cost-preview">
    <summary>Κοινά έξοδα · Προεπισκόπηση κατανομής</summary>
    <section aria-label="Προεπισκόπηση κοινών εξόδων">
      <h2>Επιμερισμός κοινών εξόδων</h2>
      <p>Κεντρικός υπολογισμός για τα καταστήματα που επιλέγεις παρακάτω. Οι ημέρες αφορούν ενεργή εξυπηρέτηση μέσα στον επιλεγμένο μήνα.</p>
      <p><strong>Μόνο προεπισκόπηση.</strong> Δεν αποθηκεύεται χρέωση, δεν αλλάζουν υπόλοιπα και δεν στέλνεται email.</p>
      <button type="button" onClick={sample}>Ενδεικτικό παράδειγμα</button>{example&&<><p role="status">Ενδεικτικό παράδειγμα · δεν αφορά πραγματικούς πελάτες.</p><button type="button" onClick={reset}>Καθαρισμός παραδείγματος</button></>}
      {catalogueError&&<p role="alert">{catalogueError}</p>}
      <form aria-label="Υπολογισμός κοινών εξόδων" onSubmit={e=>{e.preventDefault();setPreview(null);setError('');try{const result=previewSharedCost({period,amount,reference,confirmed,participants},catalogue);setPreview({catalogueKey,result})}catch(e){setError(e.message)}}}>
        <label>Μήνας επιμερισμού <input type="month" value={period} min="2000-01" max="2099-12" onChange={e=>changed(()=>setPeriod(e.target.value))} required/></label>
        <label>Τεκμηριωμένο κοινό κόστος (€) <input inputMode="decimal" value={amount} maxLength={16} onChange={e=>changed(()=>setAmount(e.target.value))} required/></label>
        <label>Πηγή τεκμηρίωσης ποσού <input value={reference} maxLength={240} minLength={3} onChange={e=>changed(()=>setReference(e.target.value))} required/></label>
        <p>Χρησιμοποίησε επιβεβαιωμένο κόστος σε ευρώ. Οι εκτιμήσεις παρόχων και τα ποσά σε άλλο νόμισμα χρειάζονται πρώτα τεκμηριωμένη βάση EUR. Ήδη χρεωμένες κλήσεις και προπληρωμές AI δεν προστίθενται ξανά.</p>
        <fieldset><legend>Συμμετέχοντα εμπορικά καταστήματα</legend>
          <p>Επίλεξε μόνο καταστήματα με συμφωνημένη συμμετοχή. Το LAB και τα δοκιμαστικά καταστήματα δεν συμμετέχουν σε πραγματικό επιμερισμό.</p>
          {participants.map((row,index)=><div className="shared-cost-participant" key={index}>
            <label>Κατάστημα {index+1}<select value={row.storeId} onChange={e=>updateRow(index,'storeId',e.target.value)} required><option value="">Επίλεξε κατάστημα</option>{stores.map(store=><option key={store.storeId} value={store.storeId}>{store.companyName} · {store.storeName}</option>)}</select></label>
            <label>Ημέρες εξυπηρέτησης {index+1}<input type="number" min={1} max={maxDays} step={1} value={row.days} onChange={e=>updateRow(index,'days',e.target.value)} required/></label>
            <button type="button" disabled={participants.length===1} onClick={()=>changed(()=>setParticipants(rows=>rows.filter((_,i)=>i!==index)))}>Αφαίρεση καταστήματος {index+1}</button>
          </div>)}
          <button type="button" disabled={participants.length>=1000} onClick={()=>changed(()=>setParticipants(rows=>[...rows,emptyRow()]))}>Προσθήκη συμμετοχής</button>
        </fieldset>
        <label className="shared-cost-confirm"><input type="checkbox" checked={confirmed} onChange={e=>changed(()=>setConfirmed(e.target.checked))}/> Το ποσό είναι τεκμηριωμένο σε ευρώ, δεν περιλαμβάνει ήδη χρεωμένη χρήση ή προπληρωμές AI και τα επιλεγμένα καταστήματα συμμετέχουν βάσει συμφωνίας.</label>
        <button disabled={!confirmed||Boolean(catalogueError)}>Προεπισκόπηση επιμερισμού</button>
      </form>
      {error&&<p role="alert">{error}</p>}
      {preview&&!result&&<p role="status">Ο κατάλογος άλλαξε. Έλεγξε τις συμμετοχές και υπολόγισε ξανά.</p>}
      {result&&<section aria-label="Αποτέλεσμα επιμερισμού">
        <h3>{example?'Ενδεικτικός επιμερισμός':'Προεπισκόπηση επιμερισμού'} · {result.period}</h3>
        <p>Πηγή: {result.reference}</p>
        <dl><dt>Αρχικό κοινό κόστος</dt><dd>{euros(result.baseCents)}</dd><dt>Συμφωνημένη προσαύξηση 50% · μία φορά</dt><dd>{euros(result.markupCents)}</dd><dt>Συνολικό ποσό προς επιμερισμό</dt><dd>{euros(result.totalCents)}</dd><dt>Σύνολο ημερών εξυπηρέτησης</dt><dd>{result.totalDays}</dd></dl>
        <div className="shared-cost-table"><table aria-label="Επιμερισμός ανά κατάστημα"><thead><tr><th>Εταιρεία</th><th>Κατάστημα</th><th>Ημέρες</th><th>Ποσό</th></tr></thead><tbody>{result.stores.map(row=><tr key={row.storeId}><td>{row.companyName}</td><td>{row.storeName}</td><td>{row.days}</td><td>{euros(row.amountCents)}</td></tr>)}</tbody></table></div>
        <h3>Σύνολα ανά εταιρεία</h3><ul aria-label="Προεπισκόπηση ποσών ανά εταιρεία">{result.companies.map(row=><li key={row.companyId}>{row.companyName}: <strong>{euros(row.amountCents)}</strong> · {row.days} ημέρες εξυπηρέτησης</li>)}</ul>
        <p>Τα επιμερισμένα ποσά αθροίζουν ακριβώς το συνολικό ποσό. Τα λεπτά στρογγυλοποίησης κατανέμονται με το μεγαλύτερο υπόλοιπο και σταθερή σειρά σε ισοβαθμία.</p>
        <p><strong>Δεν έχει καταχωριστεί χρέωση ή οφειλή.</strong></p>
      </section>}
    </section>
    <style>{`.shared-cost-preview{max-width:1000px;margin:18px 0;border:1px solid #c8dce9;border-radius:12px;padding:14px;background:#f8fbfe}.shared-cost-preview summary{cursor:pointer;font-weight:700;min-height:44px;display:list-item;padding:10px}.shared-cost-preview fieldset{border:1px solid #c8dce9;border-radius:8px;padding:12px;min-width:0}.shared-cost-preview label{display:grid;gap:6px}.shared-cost-preview .shared-cost-confirm{display:flex;align-items:flex-start;gap:10px}.shared-cost-participant{display:grid;grid-template-columns:minmax(180px,1fr) minmax(100px,180px) auto;align-items:end;gap:10px;margin:12px 0}.shared-cost-preview input,.shared-cost-preview select{width:100%;min-height:44px}.shared-cost-preview input[type=checkbox]{width:auto;min-height:22px;flex-shrink:0}.shared-cost-preview dl{display:grid;grid-template-columns:minmax(160px,1fr) 1fr;gap:10px;max-width:700px}.shared-cost-preview dd{margin:0;font-weight:700}.shared-cost-table{overflow:auto}.shared-cost-preview table{width:100%;border-collapse:collapse}.shared-cost-preview th,.shared-cost-preview td{text-align:left;padding:10px;border-bottom:1px solid #d5e2ec}@media(max-width:700px){.shared-cost-participant{grid-template-columns:1fr}.shared-cost-preview dl{grid-template-columns:1fr}.shared-cost-preview summary{line-height:1.5}}`}</style>
  </details>;
}
