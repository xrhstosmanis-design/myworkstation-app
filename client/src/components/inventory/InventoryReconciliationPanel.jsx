import React, {useEffect,useRef,useState} from 'react';
const amount = x => x === null ? 'Άγνωστο' : Number(x).toLocaleString('el-GR',{maximumFractionDigits:4});
const date = x => x ? new Date(x).toLocaleString('el-GR') : 'Άγνωστο';
const labels = {
  MISSING_PREVIOUS_COUNT:'Λείπει προηγούμενη καταμέτρηση',MISSING_CURRENT_COUNT:'Λείπει νέα καταμέτρηση',
  INVALID_COUNT_TIME:'Μη έγκυρη χρονική βάση',MISSING_COUNT_EVENT:'Λείπει συμβάν καταμέτρησης',COUNT_EVENT_MISMATCH:'Ασυμφωνία ιστορικού καταμέτρησης',
  INVALID_MOVEMENT_QUANTITY:'Μη έγκυρη ποσότητα κίνησης',MISSING_MOVEMENT_REFERENCE:'Κίνηση χωρίς σύνδεση',DUPLICATE_POSTING_KEY:'Επανάληψη ταυτότητας κίνησης',
  LATE_DOCUMENT:'Εκπρόθεσμο παραστατικό',NON_PHYSICAL_ADJUSTMENT:'Διόρθωση συστήματος',MISSING_OR_ZERO_COST:'Άγνωστο ή μηδενικό κόστος',
  LEDGER_COUNT_EXPECTED_MISMATCH:'Οι κινήσεις δεν συμφωνούν με το θεωρητικό της καταμέτρησης'
};
export default function InventoryReconciliationPanel({api,stocktakeId,storeId}) {
  const [report,setReport]=useState(null),[previous,setPrevious]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const generation=useRef(0),alive=useRef(true);
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;generation.current++;};},[]);
  useEffect(()=>{generation.current++;setReport(null);setPrevious('');setError('');setBusy(false);},[stocktakeId,storeId]);
  const load=async(selected=previous)=>{
    const request=++generation.current;setReport(null);setBusy(true);setError('');
    try {
      const result=await api(`/api/inventory-v2/stocktakes/${encodeURIComponent(stocktakeId)}/reconciliation${selected?`?previousStocktakeId=${encodeURIComponent(selected)}`:''}`);
      if(!alive.current||request!==generation.current)return;
      if(result.current?.id!==stocktakeId||result.current?.storeId!==storeId)throw new Error('Η αναφορά δεν αντιστοιχεί στην επιλεγμένη απογραφή.');
      setPrevious(result.previous.id);setReport(result);
    } catch(e){if(alive.current&&request===generation.current)setError(e.message);}
    finally {if(alive.current&&request===generation.current)setBusy(false);}
  };
  const download=async(format)=>{
    if(!report||busy)return;
    const request=++generation.current;setBusy(true);setError('');
    try {
      const file=await api(`/api/inventory-v2/stocktakes/${encodeURIComponent(stocktakeId)}/reconciliation?previousStocktakeId=${encodeURIComponent(report.previous.id)}&format=${format}&expectedFingerprint=${report.fingerprint}`);
      if(!alive.current||request!==generation.current)return;
      const bytes=Uint8Array.from(atob(file.base64),c=>c.charCodeAt(0)),url=URL.createObjectURL(new Blob([bytes],{type:file.mimeType}));
      const link=document.createElement('a');link.href=url;link.download=file.filename;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    } catch(e){if(alive.current&&request===generation.current)setError(e.message);}
    finally{if(alive.current&&request===generation.current)setBusy(false);}
  };
  return <section className="inv2-investigation" aria-label="Συμφωνία δύο απογραφών">
    <h3>Συμφωνία δύο απογραφών</h3>
    <button disabled={busy} onClick={()=>load()}>Έλεγχος προηγούμενης απογραφής</button>
    {error&&<p role="alert">{error}</p>}
    {busy&&<p role="status">Υπολογισμός αναφοράς…</p>}
    {report&&<>
      <label>Προηγούμενη απογραφή <select value={previous} disabled={busy} onChange={e=>{setPrevious(e.target.value);load(e.target.value);}}>
        {report.candidates.map(x=><option key={x.id} value={x.id}>{x.name} · {date(x.finalizedAt)}</option>)}
      </select></label>
      <p>{report.explanation}</p><p>{report.costMethod}</p>
      <p>Οι αντιστοιχίσεις διαφορετικών κωδικών, μεταγενέστερες επιβεβαιωμένες διορθώσεις και ο πλήρης έλεγχος παραστατικών και συμβάντων δεν περιλαμβάνονται ακόμη.</p>
      <p>Ελλείμματα προς έλεγχο: <b>{amount(report.summary.shortageQuantity)} τμχ · {amount(report.summary.shortageValue)} €</b> · Πλεονάσματα: <b>{amount(report.summary.surplusQuantity)} τμχ · {amount(report.summary.surplusValue)} €</b> · Καθαρή διαφορά: <b>{amount(report.summary.netQuantity)} τμχ · {amount(report.summary.netValue)} €</b></p>
      <p>Χωρίς υπολογισμό: {report.summary.uncomputedItems} · Χωρίς κόστος: {report.summary.missingCostItems}</p>
      <button disabled={busy} onClick={()=>download('pdf')}>PDF</button> <button disabled={busy} onClick={()=>download('xlsx')}>Excel</button>
      {report.rows.map(row=><details key={row.productId}>
        <summary>{row.sku} · {row.name} · Διαφορά προς έλεγχο: {amount(row.difference)} · Αξία: {amount(row.differenceValue)} €</summary>
        <p>{date(row.from)} → {date(row.to)}</p>
        <p>{amount(row.previousCountedQuantity)} + {amount(row.incoming)} − {amount(row.outgoing)} + διορθώσεις συστήματος {amount(row.systemAdjustments)} = {amount(row.expectedQuantity)} · Καταμέτρηση {amount(row.countedQuantity)}</p>
        <p>{row.findings.map(x=>labels[x]||x).join(' · ')}</p>
        <div style={{overflowX:'auto'}}><table><thead><tr><th>Καταχώρηση</th><th>Κίνηση</th><th>Ποσότητα</th><th>Πριν</th><th>Μετά</th><th>Χειριστής</th><th>Παραστατικό</th></tr></thead>
          <tbody>{row.movements.map(m=><tr key={m.id}><td>{date(m.postedAt)}</td><td>{m.movementType}{!m.included?' · Βάση απογραφής':''}</td><td>{amount(m.quantity)}</td><td>{amount(m.balanceBefore)}</td><td>{amount(m.balanceAfter)}</td><td>{m.actorName||'—'}</td><td>{m.documentNumber||m.sourceId||'—'}{m.documentDate&&` · ${date(m.documentDate)}`}</td></tr>)}</tbody>
        </table></div>
      </details>)}
    </>}
  </section>;
}
