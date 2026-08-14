import React,{useEffect,useRef,useState} from "react";
import {ArrowLeft,RefreshCw} from "lucide-react";
import CashControlPanel from "./CashControlPanel.jsx";
import OwnerPaymentQuickActions from "./OwnerPaymentQuickActions.jsx";
import StoreTransactionsPanel from "../store/StoreTransactionsPanel.jsx";

const STORE_SYNC_KEY="myworkstation:store-sync";

export default function StoreCloudPage({api,store,onBack}){
  const [version,setVersion]=useState(0);
  const lastSyncValue=useRef(null);
  const refresh=()=>setVersion(value=>value+1);

  useEffect(()=>{
    const consumeSyncValue=value=>{
      if(!value||value===lastSyncValue.current)return;
      lastSyncValue.current=value;
      try{const payload=JSON.parse(value);if(payload.storeId===store.id)refresh()}catch{}
    };
    const syncFromStoreMode=event=>{
      if(event.key!==STORE_SYNC_KEY||!event.newValue)return;
      consumeSyncValue(event.newValue);
    };
    const refreshOnFocus=()=>refresh();
    try{lastSyncValue.current=localStorage.getItem(STORE_SYNC_KEY)}catch{}
    const localSignalWatch=window.setInterval(()=>{
      try{consumeSyncValue(localStorage.getItem(STORE_SYNC_KEY))}catch{}
    },750);
    window.addEventListener("storage",syncFromStoreMode);
    window.addEventListener("focus",refreshOnFocus);
    return ()=>{
      window.clearInterval(localSignalWatch);
      window.removeEventListener("storage",syncFromStoreMode);
      window.removeEventListener("focus",refreshOnFocus);
    };
  },[store.id]);

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
