import React,{useEffect,useRef,useState} from "react";
import {ArrowLeft,BriefcaseBusiness,Copy,KeyRound,RefreshCw} from "lucide-react";
import ScreenRecorderWindowLauncher from "../commerce/ScreenRecorderWindowLauncher.jsx";
import CashControlPanel from "./CashControlPanel.jsx";
import OwnerPaymentQuickActions from "./OwnerPaymentQuickActions.jsx";
import OwnerPendingApprovals from "./OwnerPendingApprovals.jsx";
import BarcodeRadioManagement from "./BarcodeRadioManagement.jsx";
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
  const [pairing,setPairing]=useState(null);
  const [pairingBusy,setPairingBusy]=useState(false);
  const [pairingError,setPairingError]=useState("");
  const [pairingCopied,setPairingCopied]=useState(false);

  const createPairingCode=async()=>{
    if(pairing&&Date.parse(pairing.expiresAt)>Date.now()&&!window.confirm("Θα ακυρωθεί ο προηγούμενος κωδικός, αν δεν έχει ήδη χρησιμοποιηθεί. Να δημιουργηθεί νέος;"))return;
    setPairingBusy(true);setPairingError("");setPairingCopied(false);
    try{
      const result=await api(`/api/cloud/v1/stores/${encodeURIComponent(store.id)}/pairing-code`,{method:"POST",body:JSON.stringify({minutes:15})});
      setPairing(result);
    }catch(error){setPairingError(error.message||"Δεν δημιουργήθηκε κωδικός ζεύξης.");}
    finally{setPairingBusy(false);}
  };

  const copyPairingCode=async()=>{
    if(!pairing?.code)return;
    setPairingError("");
    try{
      await navigator.clipboard.writeText(pairing.code);
      setPairingCopied(true);window.setTimeout(()=>setPairingCopied(false),1800);
    }catch{
      setPairingError("Δεν έγινε αντιγραφή. Επίλεξε τον κωδικό και κάνε αντιγραφή χειροκίνητα.");
    }
  };

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
    const checkServerFingerprint=async()=>{
      if(serverCheckBusy.current)return;
      serverCheckBusy.current=true;
      try{
        const result=await api(`/api/transactions/stores/${store.id}/overview?sync=${Date.now()}`,{cache:"no-store"});
        const next=ledgerFingerprint(result);
        if(lastServerFingerprint.current===null){lastServerFingerprint.current=next;refresh();return}
        if(next!==lastServerFingerprint.current){lastServerFingerprint.current=next;refresh()}
      }catch{}finally{serverCheckBusy.current=false}
    };
    const refreshOnFocus=()=>checkServerFingerprint();
    const refreshOnVisibility=()=>{if(document.visibilityState==="visible")checkServerFingerprint()};
    const refreshOnPageShow=()=>checkServerFingerprint();

    try{lastSyncValue.current=localStorage.getItem(STORE_SYNC_KEY)}catch{}
    checkServerFingerprint();
    const localSignalWatch=window.setInterval(()=>{
      try{consumeSyncValue(localStorage.getItem(STORE_SYNC_KEY))}catch{}
    },750);
    const serverSignalWatch=window.setInterval(checkServerFingerprint,SERVER_SYNC_MS);
    window.addEventListener("storage",syncFromStoreMode);
    window.addEventListener("focus",refreshOnFocus);
    document.addEventListener("visibilitychange",refreshOnVisibility);
    window.addEventListener("pageshow",refreshOnPageShow);
    return ()=>{
      window.clearInterval(localSignalWatch);
      window.clearInterval(serverSignalWatch);
      window.removeEventListener("storage",syncFromStoreMode);
      window.removeEventListener("focus",refreshOnFocus);
      document.removeEventListener("visibilitychange",refreshOnVisibility);
      window.removeEventListener("pageshow",refreshOnPageShow);
    };
  },[api,store.id]);

  return <section className="cloud-page store-operations-front">
    <div className="cloud-titlebar">
      <button className="cloud-back" onClick={onBack}><ArrowLeft/>Πίσω στα καταστήματα</button>
      <div className="cloud-titlebar-actions">
        <button className="cloud-refresh" onClick={refresh}><RefreshCw/>Ανανέωση</button>
        <button className="cloud-refresh" type="button" onClick={()=>window.dispatchEvent(new Event("mws:commerce-open"))}><BriefcaseBusiness/>Εμπορική λειτουργία</button>
        <ScreenRecorderWindowLauncher/>
      </div>
    </div>

    <div className="cloud-hero">
      <div>
        <span className="cloud-kicker">MYWORKSTATION · BACKOFFICE</span>
        <h2>{store.name}</h2>
        <p>Ενεργή βάρδια, συναλλαγές, έλεγχος ταμείου και πληρωμές Ιδιοκτήτη / Διαχειριστή. Όλα χρησιμοποιούν την υπάρχουσα Εμπορική λειτουργία και την ενιαία βάση.</p>
      </div>
    </div>

    <section aria-label="Σύνδεση RBS CAP Driver" style={{background:"#fff",border:"1px solid #dce5ef",borderRadius:18,padding:18,margin:"0 0 18px",boxShadow:"0 8px 24px rgba(15,23,42,.05)"}}>
      <div style={{display:"flex",alignItems:"center",gap:10}}>
        <KeyRound aria-hidden="true" size={20}/>
        <h3 style={{margin:0}}>Σύνδεση RBS CAP Driver v1</h3>
      </div>
      <p style={{margin:"10px 0",color:"#475569"}}>Δημιουργεί κωδικό μίας χρήσης, διάρκειας 15 λεπτών, για τον writer αυτού του καταστήματος. Δεν στέλνει εντολή στην ταμειακή και δεν εκδίδει απόδειξη.</p>
      <button type="button" onClick={createPairingCode} disabled={pairingBusy} style={{border:0,borderRadius:10,padding:"10px 14px",background:"#087eb8",color:"#fff",fontWeight:700,cursor:pairingBusy?"wait":"pointer"}}>
        {pairingBusy?"Δημιουργία…":pairing?"Δημιουργία νέου κωδικού":"Δημιουργία κωδικού ζεύξης"}
      </button>
      {pairing&&<div role="status" style={{marginTop:12,padding:14,borderRadius:12,background:"#eff8ff",border:"1px solid #bfdbfe"}}>
        <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
          <code style={{fontSize:22,fontWeight:800,letterSpacing:2,color:"#0f172a"}}>{pairing.code}</code>
          <button type="button" onClick={copyPairingCode} style={{display:"inline-flex",alignItems:"center",gap:6,border:"1px solid #cbd5e1",borderRadius:8,padding:"8px 10px",background:"#fff",cursor:"pointer"}}><Copy size={16}/>{pairingCopied?"Αντιγράφηκε":"Αντιγραφή κωδικού"}</button>
        </div>
        <p style={{margin:"8px 0 0"}}>Λήγει: {new Intl.DateTimeFormat("el-GR",{dateStyle:"short",timeStyle:"short",timeZone:"Europe/Athens"}).format(new Date(pairing.expiresAt))} · Χρησιμοποιείται μία φορά.</p>
        <small style={{display:"block",marginTop:8,color:"#475569"}}>Στον υπολογιστή του POS, εκτέλεσε το Pair.ps1 με τον ίδιο χρήστη Windows και βάλε τον κωδικό στην προτροπή. Έπειτα ξεκίνησε το Writer.ps1 και άφησέ το να εκτελείται. Κλείνοντας αυτή τη σελίδα, ο κωδικός δεν θα εμφανίζεται ξανά.</small>
      </div>}
      {pairingError&&<p role="alert" style={{margin:"10px 0 0",color:"#b42318"}}>{pairingError}</p>}
    </section>

    <div id="backoffice-transactions" className="backoffice-anchor">
      <StoreTransactionsPanel key={`transactions-${version}`} api={api} store={store}/>
    </div>
    <div id="backoffice-cash" className="backoffice-anchor">
      <CashControlPanel key={`cash-${version}`} api={api} store={store}/>
    </div>
    <div className="store-operations-actions">
      <BarcodeRadioManagement api={api} store={store}/>
      <OwnerPaymentQuickActions api={api} store={store} onChanged={refresh}/>
      <OwnerPendingApprovals api={api} store={store} onChanged={refresh} refreshToken={version}/>
    </div>
  </section>;
}
