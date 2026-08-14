import React,{useState} from "react";
import {ArrowLeft,RefreshCw} from "lucide-react";
import CashControlPanel from "./CashControlPanel.jsx";
import OwnerPaymentQuickActions from "./OwnerPaymentQuickActions.jsx";
import StoreTransactionsPanel from "../store/StoreTransactionsPanel.jsx";

export default function StoreCloudPage({api,store,onBack}){
  const [version,setVersion]=useState(0);
  const refresh=()=>setVersion(value=>value+1);

  return <section className="cloud-page store-operations-front">
    <div className="cloud-titlebar">
      <button className="cloud-back" onClick={onBack}><ArrowLeft/>Πίσω στα καταστήματα</button>
      <button className="cloud-refresh" onClick={refresh}><RefreshCw/>Ανανέωση</button>
    </div>

    <div className="cloud-hero">
      <div>
        <span className="cloud-kicker">MYWORKSTATION · BACKOFFICE</span>
        <h2>{store.name}</h2>
        <p>Ενεργή βάρδια, συναλλαγές, έλεγχος ταμείου και πληρωμές Ιδιοκτήτη / Διαχειριστή. Όλα χρησιμοποιούν την υπάρχουσα Εμπορική λειτουργία και την ενιαία βάση.</p>
      </div>
    </div>

    <OwnerPaymentQuickActions key={`owner-payments-${version}`} api={api} store={store} onChanged={refresh}/>

    <div id="backoffice-transactions" className="backoffice-anchor">
      <StoreTransactionsPanel key={`transactions-${version}`} api={api} store={store}/>
    </div>
    <div id="backoffice-cash" className="backoffice-anchor">
      <CashControlPanel key={`cash-${version}`} api={api} store={store}/>
    </div>
  </section>;
}
