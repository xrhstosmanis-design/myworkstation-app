import React,{useEffect,useState} from 'react';
import {buildStaffShiftReportCsv} from './staff-shift-report-csv.mjs';
import {printStaffShiftReport,staffShiftReportColumns,shiftAmount,shiftTimestamp} from './staff-shift-report-print.mjs';

const transactionLabels={
  SALE_CASH:'Πώληση με μετρητά',
  SALE_CARD:'Πώληση με κάρτα',
  SALE_IRIS:'Πώληση μέσω IRIS',
  CUSTOMER_RECEIPT_CASH:'Είσπραξη πελάτη με μετρητά',
  CUSTOMER_RECEIPT_CARD:'Είσπραξη πελάτη με κάρτα',
  SUPPLIER_PAYMENT:'Πληρωμή προμηθευτή',
  OTHER_EXPENSE:'Έξοδο'
};

export default function StaffShiftReport({api,storeId,canExport=false,canPrint=false,canForceClose=false}){
  const [revision,setRevision]=useState(0);
  const [loaded,setLoaded]=useState(null);
  const result=loaded?.api===api&&loaded.storeId===storeId&&loaded.revision===revision?loaded.data:null;
  const [error,setError]=useState('');
  const [selectedId,setSelectedId]=useState('');
  const [closing,setClosing]=useState(false);

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

  const printReport=()=>{
    if(!canPrint||!result?.recent.length)return;
    if(!printStaffShiftReport(window,result.store.name||storeId,result.recent)){
      setError('Δεν άνοιξε το παράθυρο εκτύπωσης βαρδιών.');
    }else{
      setError('');
    }
  };

  const selected=result?.recent.find(shift=>shift.id===selectedId);
  const submitAdministrativeClose=async event=>{
    event.preventDefault();
    if(!canForceClose||closing||selected?.status!=='OPEN')return;
    const reason=new FormData(event.currentTarget).get('reason').trim();
    if(reason.length<3)return;
    setClosing(true);
    setError('');
    try{
      const response=await api(`/api/owner-shifts/${encodeURIComponent(selected.id)}/force-close`,{method:'POST',body:JSON.stringify({reason})});
      if(response?.ok!==true)throw Error('Δεν επιβεβαιώθηκε το κλείσιμο.');
      setRevision(value=>value+1);
    }catch(error){setError(error.message)}
    finally{setClosing(false)}
  };
  const transactions=selected?result.recentTransactions.filter(transaction=>transaction.sessionId===selected.id):[];

  return <section className="panel staff-panel" aria-labelledby="staff-shift-report-title">
    <h3 id="staff-shift-report-title">Αναφορά βαρδιών</h3>
    <button type="button" onClick={()=>setRevision(value=>value+1)}>Ανανέωση αναφοράς βαρδιών</button>
    {canExport&&<button type="button" onClick={exportCsv} disabled={!result?.recent.length}>Εξαγωγή εμφανιζόμενων βαρδιών</button>}
    {canPrint&&<button type="button" onClick={printReport} disabled={!result?.recent.length}>Εκτύπωση εμφανιζόμενων βαρδιών</button>}
    {error&&<p role="alert">{error}</p>}
    {!result&&!error&&<p role="status">Φόρτωση αναφοράς βαρδιών…</p>}
    {result&&<p>Έως 20 πρόσφατες βάρδιες, από όλα τα ταμεία του καταστήματος.</p>}
    {result&&(!result.recent.length?<p>Δεν υπάρχουν καταγεγραμμένες βάρδιες.</p>:<>
      <div style={{overflowX:'auto'}}>
        <table aria-label="Πρόσφατες βάρδιες">
          <thead><tr>{staffShiftReportColumns.map(([label])=><th scope="col" key={label}>{label}</th>)}</tr></thead>
          <tbody>{result.recent.map(shift=><tr key={shift.id}>
            {staffShiftReportColumns.slice(0,-1).map(([label,read])=><td key={label}>{read(shift)}</td>)}
            <td><button type="button" aria-pressed={selectedId===shift.id} onClick={()=>setSelectedId(shift.id)}>
              {staffShiftReportColumns.at(-1)[1](shift)} · Προβολή
            </button></td>
          </tr>)}</tbody>
        </table>
      </div>
      {selected&&<div style={{overflowX:'auto'}}>
        <h4>Πρόσφατες συναλλαγές βάρδιας · {shiftTimestamp(selected.openedAt)}</h4>
        {canForceClose&&selected.status==='OPEN'&&<form key={selected.id} onSubmit={submitAdministrativeClose}>
          <p>Η βάρδια θα κλείσει με εκκρεμή καταμέτρηση.</p>
          <label>Αιτιολογία <input name="reason" required minLength={3} maxLength={500} disabled={closing}/></label>
          <button type="submit" disabled={closing}>Διοικητικό κλείσιμο χωρίς καταμέτρηση</button>
        </form>}
        {!transactions.length?<p>Δεν υπάρχουν διαθέσιμες πρόσφατες συναλλαγές για τη βάρδια.</p>:
          <table aria-label="Πρόσφατες συναλλαγές βάρδιας">
            <thead><tr><th scope="col">Ώρα</th><th scope="col">Τύπος</th><th scope="col">Περιγραφή</th>
              <th scope="col">Χειριστής</th><th scope="col">Ποσό</th><th scope="col">Κατάσταση</th>
            </tr></thead>
            <tbody>{transactions.map(transaction=><tr key={transaction.id}>
              <td>{shiftTimestamp(transaction.occurredAt)}</td><td>{transactionLabels[transaction.type]||transaction.type||'—'}</td>
              <td>{transaction.description||transaction.supplierName||'—'}</td><td>{transaction.actorName||'—'}</td>
              <td>{shiftAmount(transaction.amount)}</td><td>{transaction.reversedAt?'Αντιλογισμένη':'—'}</td>
            </tr>)}</tbody>
          </table>}
      </div>}
    </>)}
  </section>;
}
