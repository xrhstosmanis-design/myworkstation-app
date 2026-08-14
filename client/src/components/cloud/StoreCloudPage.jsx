import React,{useState} from "react";
import {ArrowLeft,RefreshCw} from "lucide-react";
import StoreTransactionsPanel from "../store/StoreTransactionsPanel.jsx";

export default function StoreCloudPage({api,store,onBack}){
  const [version,setVersion]=useState(0);
  const refresh=()=>setVersion(value=>value+1);
  return <section className="cloud-page store-operations-front">
    <div className="cloud-titlebar">
      <button className="cloud-back" onClick={onBack}><ArrowLeft/>Πίσω στα καταστήματα</button>
      <button className="cloud-refresh" onClick={refresh}><RefreshCw/>Ανανέωση</button>
    </div>
    <div className="cloud-hero"><div><span className="cloud-kicker">MYWORKSTATION · BACKOFFICE</span><h2>{store.name}</h2><p>Ζωντανή εικόνα της ενεργής βάρδιας. Όλο το ιστορικό, οι χειριστές και οι αναλυτικές αναφορές παραμένουν στην Εμπορική λειτουργία.</p></div></div>
    <div id="backoffice-transactions" className="backoffice-anchor"><StoreTransactionsPanel key={`transactions-${version}`} api={api} store={store}/></div>
  </section>;
}
