import React,{useState} from "react";
import {ArrowLeft,RefreshCw,WalletCards} from "lucide-react";
import CashControlPanel from "./CashControlPanel.jsx";
import StoreTransactionsPanel from "../store/StoreTransactionsPanel.jsx";
import OwnerStorePaymentsModal from "./OwnerStorePaymentsModal.jsx";

export default function StoreCloudPage({api,store,onBack}){
  const [version,setVersion]=useState(0);
  const [payments,setPayments]=useState(false);
  const refresh=()=>setVersion(value=>value+1);

  return <section className="cloud-page store-operations-front">
    <div className="cloud-titlebar">
      <button className="cloud-back" onClick={onBack}><ArrowLeft/>Πίσω στα καταστήματα</button>
      <div className="store-front-actions">
        <button className="cloud-payment" onClick={()=>setPayments(true)}><WalletCards/>Πληρωμές</button>
        <button className="cloud-refresh" onClick={refresh}><RefreshCw/>Ανανέωση</button>
      </div>
    </div>

    <div className="cloud-hero"><div><span className="cloud-kicker">MYWORKSTATION · BACKOFFICE</span><h2>{store.name}</h2><p>Ζωντανή εικόνα της ενεργής βάρδιας. Οι κινήσεις εμφανίζονται πρώτες και ο έλεγχος ταμείου παραμένει διαθέσιμος στην ίδια σελίδα χωρίς δεύτερο σύστημα. Το πλήρες ιστορικό και οι αναφορές παραμένουν στην Εμπορική λειτουργία.</p></div></div>

    <div id="backoffice-transactions" className="backoffice-anchor"><StoreTransactionsPanel key={`transactions-${version}`} api={api} store={store}/></div>
    <div id="backoffice-cash" className="backoffice-anchor"><CashControlPanel key={`cash-${version}`} api={api} store={store}/></div>

    {payments&&<OwnerStorePaymentsModal api={api} store={store} onClose={()=>setPayments(false)} onChanged={()=>{setPayments(false);refresh()}}/>}
  </section>;
}
