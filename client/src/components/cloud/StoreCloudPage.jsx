import React,{useEffect,useRef,useState} from "react";
import {ArrowLeft,RefreshCw} from "lucide-react";
import CashControlPanel from "./CashControlPanel.jsx";
import OwnerPaymentQuickActions from "./OwnerPaymentQuickActions.jsx";
import StoreTransactionsPanel from "../store/StoreTransactionsPanel.jsx";

const STORE_SYNC_KEY="myworkstation:store-sync";
const SERVER_SYNC_MS=2000;

const ledgerFingerprint=result=>{
  const summary=result?.summary||{};
  const session=result?.openSession||null;
  const latest=(result?.recent||[])[0]||null;
  return JSON.stringify({
    sessionId:session?.id||null,
    sessionStatus:session?.status||null,
    shiftLabel:session?.shiftLabel||null,
    openingOperational:Number(session?.openingOperational||0),
    cashSales:Number(summary.cashSales||0),
    cardSales:Number(summary.cardSales||0),
    expensesTotal:Number(summary.expensesTotal||0),
    latestId:latest?.id||null,
    latestAt:latest?.occurredAt||latest?.createdAt||null,
    recentCount:(result?.recent||[]).length
  });
};

export default function StoreCloudPage({api,store,onBack}){
  const [version,setVersion]=useState(0);
  const lastSyncValue=useRef(null);
  const lastServerFingerprint=useRef(null);
  const serverCheckBusy=useRef(false);
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
    const checkServerFingerprint=async()=>{
      if(serverCheckBusy.current)return;
      serverCheckBusy.current=true;
      try{
        const result=await api(`/api/transactions/stores/${store.id}/overview`);
        const next=ledgerFingerprint(result);
        if(lastServerFingerprint.current===null){lastServerFingerprint.current=next;return}
        if(next!==lastServerFingerprint.current){lastServerFingerprint.current=next;refresh()}
      }catch{}finally{serverCheckBusy.current=false}
    };

    try{lastSyncValue.current=localStorage.getItem(STORE_SYNC_KEY)}catch{}
    checkServerFingerprint();
    const localSignalWatch=window.setInterval(()=>{
      try{consumeSyncValue(localStorage.getItem(STORE_SYNC_KEY))}catch{}
    },750);
    const serverSignalWatch=window.setInterval(checkServerFingerprint,SERVER_SYNC_MS);
    window.addEventListener("storage",syncFromStoreMode);
    window.addEventListener("focus",refreshOnFocus);
    return ()=>{
      window.clearInterval(localSignalWatch);
      window.clearInterval(serverSignalWatch);
      window.removeEventListener("storage",syncFromStoreMode);
      window.removeEventListener("focus",refreshOnFocus);
    };
  },[api,store.id]);

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

    <OwnerPaymentQuickActions api={api} store={store} onChanged={refresh}/>

    <div id="backoffice-transactions" className="backoffice-anchor">
      <StoreTransactionsPanel key={`transactions-${version}`} api={api} store={store}/>
    </div>
    <div id="backoffice-cash" className="backoffice-anchor">
      <CashControlPanel key={`cash-${version}`} api={api} store={store}/>
    </div>
  </section>;
}
