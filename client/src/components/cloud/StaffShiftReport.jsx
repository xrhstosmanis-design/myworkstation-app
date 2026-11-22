import React,{useEffect,useState} from 'react';
import {buildStaffShiftReportCsv,formatShiftTimestamp} from './staff-shift-report-csv.mjs';

const euros=new Intl.NumberFormat('el-GR',{style:'currency',currency:'EUR'});
const timestamp=value=>formatShiftTimestamp(value)||'—';
const amount=value=>value==null||!Number.isFinite(Number(value))?'—':euros.format(Number(value));
const transactionLabels={
  SALE_CASH:'Πώληση με μετρητά',
  SALE_CARD:'Πώληση με κάρτα',
  SALE_IRIS:'Πώληση μέσω IRIS',
  CUSTOMER_RECEIPT_CASH:'Είσπραξη πελάτη με μετρητά',
  CUSTOMER_RECEIPT_CARD:'Είσπραξη πελάτη με κάρτα',
  SUPPLIER_PAYMENT:'Πληρωμή προμηθευτή',
  OTHER_EXPENSE:'Έξοδο'
};

export default function StaffShiftReport({api,storeId,canExport=false}){
  const [revision,setRevision]=useState(0);
  const [loaded,setLoaded]=useState(null);
  const result=loaded?.api===api&&loaded.storeId===storeId&&loaded.revision===revision?loaded.data:null;
  const [error,setError]=useState('');
  const [selectedId,setSelectedId]=useState('');

  useEffect(()=>{
    let current=true;
    setLoaded(null);
    setError('');
    api(`/api/cash-control/stores/${encodeURIComponent(storeId)}/reporting-overview`).then(data=>{
      if(!current)return;
      if(data?.store?.id!==storeId||!Array.isArray(data.recent)||!Array.isArray(data.openSessions)||!Array.isArray(data.recentTransactions)){
        throw Error('Δεν επιβεβαιώθηκε η αναφορά για το επιλεγμένο κατάστημα.');
      }
      setLoaded({api,storeId,revision,data});
    }).catch(error=>{
      if(current)setError(error.message||'Δεν φορτώθηκε η αναφορά βαρδιών.');
    });
    return ()=>{current=false};
  },[api,storeId,revision]);

  const exportCsv=()=>{
    if(!canExport||!result?.recent.length)return;
    const url=URL.createObjectURL(new Blob([buildStaffShiftReportCsv(result.recent)],{type:'text/csv;charset=utf-8'}));
    const link=document.createElement('a');
    link.href=url;
    link.download='anafora-vardion.csv';
    link.click();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  };

  const selected=result?.recent.find(shift=>shift.id===selectedId);
  const transactions=selected?result.recentTransactions.filter(transaction=>transaction.sessionId===selected.id):[];

  return <section className="panel staff-panel" aria-labelledby="staff-shift-report-title">
    <h3 id="staff-shift-report-title">Αναφορά βαρδιών</h3>
    <button type="button" onClick={()=>setRevision(value=>value+1)}>Ανανέωση αναφοράς βαρδιών</button>
    {canExport&&<button type="button" onClick={exportCsv} disabled={!result?.recent.length}>Εξαγωγή εμφανιζόμενων βαρδιών</button>}
    {error&&<p role="alert">{error}</p>}
    {!result&&!error&&<p role="status">Φόρτωση αναφοράς βαρδιών…</p>}
    {result&&<p>Έως 20 πρόσφατες βάρδιες, από όλα τα ταμεία του καταστήματος.</p>}
    {result&&(!result.recent.length?<p>Δεν υπάρχουν καταγεγραμμένες βάρδιες.</p>:<>
      <div style={{overflowX:'auto'}}>
        <table aria-label="Πρόσφατες βάρδιες">
          <thead><tr>
            <th scope="col">Χειριστής</th><th scope="col">Ταμείο</th><th scope="col">Βάρδια</th><th scope="col">Έναρξη</th><th scope="col">Λήξη</th>
            <th scope="col">Μετρητά POS</th><th scope="col">Κάρτες POS</th><th scope="col">EFTPOS</th>
            <th scope="col">Έξοδα</th><th scope="col">Αναμενόμενα μετρητά</th><th scope="col">Καταμέτρηση</th>
            <th scope="col">Διαφορά μετρητών</th><th scope="col">Διαφορά καρτών</th><th scope="col">Συναλλαγές</th>
          </tr></thead>
          <tbody>{result.recent.map(shift=><tr key={shift.id}>
            <td>{shift.openedByName||'—'}</td><td>{shift.terminalPos||'—'}</td><td>{shift.shiftLabel||'—'}</td>
            <td>{timestamp(shift.openedAt)}</td><td>{shift.status==='OPEN'?'Ανοιχτή':timestamp(shift.closedAt)}</td>
            <td>{amount(shift.cashSales)}</td><td>{amount(shift.cardSales)}</td><td>{amount(shift.status==='CLOSED'?shift.eftposTotal:null)}</td>
            <td>{amount(shift.expenses)}</td><td>{amount(shift.expectedOperational)}</td><td>{amount(shift.actualOperational)}</td>
            <td>{amount(shift.variance)}</td><td>{amount(shift.status==='CLOSED'?shift.cardVariance:null)}</td>
            <td><button type="button" aria-pressed={selectedId===shift.id} onClick={()=>setSelectedId(shift.id)}>
              {shift.transactionCount??0} · Προβολή
            </button></td>
          </tr>)}</tbody>
        </table>
      </div>
      {selected&&<div style={{overflowX:'auto'}}>
        <h4>Πρόσφατες συναλλαγές βάρδιας · {timestamp(selected.openedAt)}</h4>
        {!transactions.length?<p>Δεν υπάρχουν διαθέσιμες πρόσφατες συναλλαγές για τη βάρδια.</p>:
          <table aria-label="Πρόσφατες συναλλαγές βάρδιας">
            <thead><tr><th scope="col">Ώρα</th><th scope="col">Τύπος</th><th scope="col">Περιγραφή</th>
              <th scope="col">Χειριστής</th><th scope="col">Ποσό</th><th scope="col">Κατάσταση</th>
            </tr></thead>
            <tbody>{transactions.map(transaction=><tr key={transaction.id}>
              <td>{timestamp(transaction.occurredAt)}</td><td>{transactionLabels[transaction.type]||transaction.type||'—'}</td>
              <td>{transaction.description||transaction.supplierName||'—'}</td><td>{transaction.actorName||'—'}</td>
              <td>{amount(transaction.amount)}</td><td>{transaction.reversedAt?'Αντιλογισμένη':'—'}</td>
            </tr>)}</tbody>
          </table>}
      </div>}
    </>)}
  </section>;
}
