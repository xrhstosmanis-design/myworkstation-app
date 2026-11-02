import React, {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import InventoryReviewControls from './InventoryReviewControls.jsx';
import InventorySourceEvidence from './InventorySourceEvidence.jsx';
const amount = x => x === null || x === undefined ? 'Άγνωστο' : Number(x).toLocaleString('el-GR',{maximumFractionDigits:4});
const date = x => x ? new Date(x).toLocaleString('el-GR') : 'Άγνωστο';
const labels = {
  MISSING_PREVIOUS_COUNT:'Λείπει προηγούμενη καταμέτρηση',MISSING_CURRENT_COUNT:'Λείπει νέα καταμέτρηση',
  INVALID_COUNT_TIME:'Μη έγκυρη χρονική βάση',MISSING_COUNT_EVENT:'Λείπει συμβάν καταμέτρησης',COUNT_EVENT_MISMATCH:'Ασυμφωνία ιστορικού καταμέτρησης',
  INVALID_MOVEMENT_QUANTITY:'Μη έγκυρη ποσότητα κίνησης',MISSING_MOVEMENT_REFERENCE:'Κίνηση χωρίς σύνδεση',DUPLICATE_POSTING_KEY:'Επανάληψη ταυτότητας κίνησης',
  LATE_DOCUMENT:'Εκπρόθεσμο παραστατικό',NON_PHYSICAL_ADJUSTMENT:'Διόρθωση συστήματος',MISSING_OR_ZERO_COST:'Άγνωστο ή μηδενικό κόστος',
  LEDGER_COUNT_EXPECTED_MISMATCH:'Οι κινήσεις δεν συμφωνούν με το θεωρητικό της καταμέτρησης',STALE_REVIEW_CORRECTION:'Άλλαξαν οι πηγές μιας επιβεβαιωμένης διόρθωσης· απαιτείται νέος έλεγχος',
  TRANSACTION_CROSSES_COUNT_TIME:'Αναδρομική συναλλαγή διασχίζει την ώρα καταμέτρησης',TRANSACTION_WITHOUT_VERIFIED_STOCK_EFFECT:'Δεν επιβεβαιώνεται η επίδραση συναλλαγής στο stock',TRANSACTION_POSTING_QUANTITY_MISMATCH:'Ασυμφωνία ποσότητας συναλλαγής και κίνησης',LATE_DOCUMENT_PHYSICAL_TIME_UNKNOWN:'Εκπρόθεσμο παραστατικό χωρίς πραγματική ώρα παραλαβής',INVOICE_QUANTITY_CHECK_UNRESOLVED:'Ανοιχτός έλεγχος ποσότητας παραστατικού'
};
export default function InventoryReconciliationPanel({api,stocktakeId,storeId,onReviewLockChange}) {
  const [report,setReport]=useState(null),[previous,setPrevious]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const generation=useRef(0),alive=useRef(true);
  const [reviewLocked,setReviewLocked]=useState(false),reviewLockRef=useRef(false);
  const codes=useMemo(()=>new Map((report?.rows||[]).map(r=>[r.productId,r.sku])),[report?.rows]);
  const code=id=>codes.get(id)||id;
  const actionLabel=action=>action.kind==='LINK'?`Σύνδεση ${action.productIds.map(code).join(' + ')} · κύριος ${code(action.canonicalProductId)}`:action.kind==='CORRECTION'?`Διόρθωση ${code(action.productId)} · ${amount(action.quantity)} τμχ`:'Ανάκληση προηγούμενης επιβεβαίωσης';
  const reviewLock=useCallback(value=>{reviewLockRef.current=value;setReviewLocked(value);onReviewLockChange?.(value);},[onReviewLockChange]);
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;generation.current++;};},[]);
  useEffect(()=>{generation.current++;setReport(null);setPrevious('');setError('');setBusy(false);},[stocktakeId,storeId]);
  const load=async(selected=previous)=>{
    if(reviewLockRef.current)return;
    const request=++generation.current;setReport(null);setBusy(true);setError('');
    try {
      const result=await api(`/api/inventory-v2/stocktakes/${encodeURIComponent(stocktakeId)}/reconciliation?reportVersion=2${selected?`&previousStocktakeId=${encodeURIComponent(selected)}`:''}`);
      if(!alive.current||request!==generation.current)return;
      if(result.current?.id!==stocktakeId||result.current?.storeId!==storeId||selected&&result.previous?.id!==selected)throw new Error('Η αναφορά δεν αντιστοιχεί στην επιλεγμένη απογραφή.');
      setPrevious(result.previous.id);setReport(result);
    } catch(e){if(alive.current&&request===generation.current)setError(e.message);}
    finally {if(alive.current&&request===generation.current)setBusy(false);}
  };
  const download=async(format)=>{
    if(!report||busy||reviewLockRef.current)return;
    const request=++generation.current;setBusy(true);setError('');
    try {
      const file=await api(`/api/inventory-v2/stocktakes/${encodeURIComponent(stocktakeId)}/reconciliation?reportVersion=2&previousStocktakeId=${encodeURIComponent(report.previous.id)}&format=${format}&expectedFingerprint=${report.fingerprint}`);
      if(!alive.current||request!==generation.current)return;
      const bytes=Uint8Array.from(atob(file.base64),c=>c.charCodeAt(0)),url=URL.createObjectURL(new Blob([bytes],{type:file.mimeType}));
      const link=document.createElement('a');link.href=url;link.download=file.filename;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    } catch(e){if(alive.current&&request===generation.current)setError(e.message);}
    finally{if(alive.current&&request===generation.current)setBusy(false);}
  };
  return <section className="inv2-investigation" aria-label="Συμφωνία δύο απογραφών">
    <h3>Συμφωνία δύο απογραφών</h3>
    <button disabled={busy||reviewLocked} onClick={()=>load()}>Έλεγχος προηγούμενης απογραφής</button>
    {error&&<p role="alert">{error}</p>}
    {busy&&<p role="status">Υπολογισμός αναφοράς…</p>}
    {report&&<>
      <label>Προηγούμενη απογραφή <select value={previous} disabled={busy||reviewLocked} onChange={e=>{if(reviewLockRef.current)return;setPrevious(e.target.value);load(e.target.value);}}>
        {report.candidates.map(x=><option key={x.id} value={x.id}>{x.name} · {date(x.finalizedAt)}</option>)}
      </select></label>
      <p>{report.explanation}</p><p>{report.costMethod}</p>
      {report.stockScope&&<p>{report.stockScope.explanation}</p>}
      <p>Περίοδος: {date(report.previous.startedAt)} → {date(report.current.finalizedAt)}. Έναρξη νέας: {date(report.current.startedAt)} · χειριστής {report.current.createdByUserId||'Άγνωστος'} · οριστικοποίηση {report.current.finalizedByUserId||'Άγνωστος'}.</p>
      <p>Ο πλήρης έλεγχος παραστατικών, συμβάντων και πραγματικών χρόνων διακίνησης παραμένει χωριστός από τον υπολογισμό των καταγεγραμμένων κινήσεων.</p>
      <p>Ελλείμματα προς έλεγχο: <b>{amount(report.summary.shortageQuantity)} τμχ · {amount(report.summary.shortageValue)} €</b> · Πλεονάσματα: <b>{amount(report.summary.surplusQuantity)} τμχ · {amount(report.summary.surplusValue)} €</b> · Καθαρή διαφορά: <b>{amount(report.summary.netQuantity)} τμχ · {amount(report.summary.netValue)} €</b></p>
      <p>Χωρίς υπολογισμό: {report.summary.uncomputedItems} · Χωρίς κόστος: {report.summary.missingCostItems}</p>
      <button disabled={busy||reviewLocked} onClick={()=>download('pdf')}>PDF</button> <button disabled={busy||reviewLocked} onClick={()=>download('xlsx')}>Excel</button>
      {report.groups&&<div style={{overflowX:'auto'}}><h4>Αρχική διαφορά, επιβεβαιωμένες διορθώσεις και τελικό αποτέλεσμα</h4><table><thead><tr><th>Προϊόν / ομάδα</th><th>Αρχική διαφορά</th><th>Διόρθωση</th><th>Τελική διαφορά</th><th>Κόστος</th><th>Τελική αξία</th></tr></thead><tbody>
        {report.groups.map(g=><tr key={g.id}><td>{g.sku} · {g.name}<br/>{g.productIds.map(code).join(', ')}</td><td>{amount(g.initialDifference)}</td><td>{amount(g.correctionQuantity)}</td><td>{amount(g.finalDifference)}</td><td>{amount(g.unitCost)}</td><td>{amount(g.finalValue)} €{g.staleCorrectionIds.length>0&&<p>{labels.STALE_REVIEW_CORRECTION}</p>}</td></tr>)}
      </tbody></table></div>}
      {report.review?.canWrite&&<InventoryReviewControls key={`${report.previous.id}:${report.viewerId}:${report.generation}`} api={api} report={report} stocktakeId={stocktakeId} storeId={storeId} onRefresh={()=>load(report.previous.id)} onLockChange={reviewLock}/>}
      {report.review?.history?.length>0&&<details><summary>Ιστορικό επιβεβαιώσεων και διορθώσεων ({report.review.history.length})</summary>{report.review.history.map(r=><p key={r.id}>{date(r.createdAt)} · {r.actorName} · {actionLabel(r.action)} · {r.action.reason} · {r.action.evidence} · {r.active?'Ενεργή':'Ιστορική'}</p>)}</details>}
      {report.sourceEvidence&&<InventorySourceEvidence evidence={report.sourceEvidence} rows={report.rows}/>}
      <h4>Αρχικές καταμετρήσεις και αναλυτικές κινήσεις ανά κωδικό</h4>
      {report.rows.map(row=><details key={row.productId}>
        <summary>{row.sku} · {row.name} · Αρχική διαφορά: {amount(row.difference)} · Αρχική αξία: {amount(row.differenceValue)} €</summary>
        <p>{date(row.from)} → {date(row.to)}</p>
        <p>Φυσικό: {amount(row.previousCountedQuantity)} + {amount(row.incoming)} − {amount(row.outgoing)} = {amount(row.expectedQuantity)} · Καταμέτρηση {amount(row.countedQuantity)}</p>
        <p>Χωριστές διορθώσεις συστήματος: {amount(row.systemAdjustments)} · ανακατασκευασμένο λογιστικό υπόλοιπο: {amount(row.recordedExpectedQuantity)} · λογιστική διαφορά: {amount(row.recordedDifference)}. Οι διορθώσεις δεν παρουσιάζονται ως φυσικές παραλαβές.</p>
        <p>{row.findings.map(x=>labels[x]||x).join(' · ')}</p>
        <div style={{overflowX:'auto'}}><table><thead><tr><th>Καταχώρηση</th><th>Χρόνος συναλλαγής / φυσικής κίνησης</th><th>Κίνηση</th><th>Ποσότητα</th><th>Φυσικό πριν</th><th>Φυσικό μετά</th><th>Λογιστικό πριν / μετά</th><th>Χειριστής</th><th>Παραστατικό</th></tr></thead>
          <tbody>{row.movements.map(m=><tr key={m.id}><td>{date(m.postedAt)}</td><td>{date(m.transactionOccurredAt||m.physicalAt)}{m.quantityBasis&&<p>{m.quantityBasis}</p>}</td><td>{m.movementType}{!m.included?' · Βάση απογραφής':''}</td><td>{amount(m.quantity)}</td><td>{amount(m.balanceBefore)}</td><td>{amount(m.balanceAfter)}</td><td>{amount(m.recordedBalanceBefore)} / {amount(m.recordedBalanceAfter)}</td><td>{m.actorName||m.actorId||'—'}</td><td>{m.documentNumber||m.sourceId||'—'}{m.documentDate&&` · ${date(m.documentDate)}`}</td></tr>)}</tbody>
        </table></div>
        {report.sourceEvidence&&<InventorySourceEvidence evidence={report.sourceEvidence} rows={report.rows} productId={row.productId}/>}
      </details>)}
    </>}
  </section>;
}
