import React,{useEffect,useRef,useState} from "react";
import {ArrowLeft,BriefcaseBusiness,Barcode,Copy,KeyRound,RefreshCw,ShieldCheck,Users,WalletCards} from "lucide-react";
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

export default function StoreCloudPage(props){
  return <StoreWorkspace key={props.store.id} {...props}/>;
}

function StoreWorkspace({api,store,onBack,onWorkforce}){
  const [version,setVersion]=useState(0);
  const lastSyncValue=useRef(null);
  const lastServerFingerprint=useRef(null);
  const serverCheckBusy=useRef(false);
  const refresh=()=>setVersion(value=>value+1);
  const [pairing,setPairing]=useState(null);
  const [pairingBusy,setPairingBusy]=useState(false);
  const [pairingError,setPairingError]=useState("");
  const [pairingCopied,setPairingCopied]=useState(false);
  const [writerState,setWriterState]=useState({loading:true,configured:false,online:false,lastSeenAt:null});
  const [toolOpen,setToolOpen]=useState("");
  const [primary,setPrimary]=useState("shifts");

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

  useEffect(()=>{
    let stopped=false;
    const checkWriter=async()=>{
      try{
        const result=await api(`/api/cloud/v1/stores/${encodeURIComponent(store.id)}/overview?writer=${Date.now()}`,{cache:"no-store"});
        const devices=(result.devices||[]).filter(device=>device.platform==="WINDOWS_RBS_CAPDRIVER_V1"&&device.status==="ACTIVE");
        const writer=devices.sort((a,b)=>Date.parse(b.lastSeenAt||0)-Date.parse(a.lastSeenAt||0))[0]||null;
        if(!stopped)setWriterState({loading:false,configured:Boolean(writer),online:Boolean(writer?.writerOnline),lastSeenAt:writer?.lastSeenAt||null});
      }catch{if(!stopped)setWriterState(current=>({...current,loading:false,online:false}));}
    };
    checkWriter();
    const timer=window.setInterval(checkWriter,5000);
    return ()=>{stopped=true;window.clearInterval(timer)};
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

    <nav className="owner-primary-nav" aria-label="Βάρδιες και πληρωμές">
      <button type="button" aria-pressed={primary==="shifts"} onClick={()=>setPrimary("shifts")}><WalletCards/>Βάρδιες & ταμεία</button>
      <button type="button" aria-pressed={primary==="payments"} onClick={()=>setPrimary("payments")}><BriefcaseBusiness/>Πληρωμές Ιδιοκτήτη / Διαχειριστή</button>
    </nav>
    {primary==="shifts"&&<section aria-label="Βάρδιες και έλεγχος ταμείων">
      <div id="backoffice-transactions" className="backoffice-anchor"><StoreTransactionsPanel key={`transactions-${version}`} api={api} store={store}/></div>
      <details className="owner-cash-details">
        <summary>Αυτόματος έλεγχος και κλεισμένες βάρδιες</summary>
        <div id="backoffice-cash" className="backoffice-anchor"><CashControlPanel key={`cash-${version}`} api={api} store={store}/></div>
      </details>
    </section>}
    {primary==="payments"&&<div className="store-operations-actions"><OwnerPaymentQuickActions api={api} store={store} onChanged={refresh}/></div>}
    <details className="owner-store-tools">
      <summary>Πρόσθετες λειτουργίες</summary>
      <div className="owner-store-tool-grid">

        {onWorkforce&&<button type="button" onClick={onWorkforce}><Users/><b>Προσωπικό & Πρόγραμμα</b><span>Εργαζόμενοι, κάρτες και QR</span></button>}
        <button type="button" aria-expanded={toolOpen==="rbs"} className={toolOpen==="rbs"?"active":""} onClick={()=>setToolOpen(v=>v==="rbs"?"":"rbs")}><KeyRound/><b>Σύνδεση RBS</b><span>CAP Driver / Writer</span></button>
        <button type="button" onClick={()=>window.dispatchEvent(new CustomEvent("mws:commerce-open",{detail:{view:"operations",storeId:store.id}}))}><BriefcaseBusiness/><b>Λοιπές εμπορικές λειτουργίες</b><span>Λειτουργίες και modules καταστήματος</span></button>
        <button type="button" aria-expanded={toolOpen==="barcode"} className={toolOpen==="barcode"?"active":""} onClick={()=>setToolOpen(v=>v==="barcode"?"":"barcode")}><Barcode/><b>Barcode & Online Ράδιο</b><span>Τιμές, αναφορές και σταθμοί</span></button>
        <button type="button" aria-expanded={toolOpen==="approvals"} className={toolOpen==="approvals"?"active":""} onClick={()=>setToolOpen(v=>v==="approvals"?"":"approvals")}><ShieldCheck/><b>Εκκρεμείς επιβεβαιώσεις</b><span>Πληρωμές και αποδεικτικά</span></button>
      </div>
    {toolOpen&&<button className="owner-tool-close" type="button" onClick={()=>setToolOpen("")}>Κλείσιμο πρόσθετης λειτουργίας</button>}
    {toolOpen==="barcode"&&<BarcodeRadioManagement api={api} store={store}/>}
    {toolOpen==="approvals"&&<OwnerPendingApprovals api={api} store={store} onChanged={refresh} refreshToken={version}/>}
    {toolOpen==="rbs"&&<section aria-label="Σύνδεση RBS CAP Driver" style={{background:"#fff",border:"1px solid #dce5ef",borderRadius:18,padding:18,margin:"0 0 18px",boxShadow:"0 8px 24px rgba(15,23,42,.05)"}}>
      <div style={{display:"flex",alignItems:"center",gap:10}}>
        <KeyRound aria-hidden="true" size={20}/>
        <h3 style={{margin:0}}>Σύνδεση RBS CAP Driver v1</h3>
        <strong role="status" style={{marginLeft:"auto",padding:"6px 10px",borderRadius:999,background:writerState.online?"#dcfce7":writerState.configured?"#fee2e2":"#f1f5f9",color:writerState.online?"#166534":writerState.configured?"#991b1b":"#475569"}}>{writerState.loading?"ΕΛΕΓΧΟΣ…":writerState.online?"WRITER ONLINE":writerState.configured?"WRITER OFFLINE":"ΔΕΝ ΕΧΕΙ ΣΥΝΔΕΘΕΙ"}</strong>
      </div>
      <p style={{margin:"10px 0",color:"#475569"}}>Δημιουργεί κωδικό μίας χρήσης, διάρκειας 15 λεπτών, για τον writer αυτού του καταστήματος. Δεν στέλνει εντολή στην ταμειακή και δεν εκδίδει απόδειξη.</p>
      {writerState.configured&&<p style={{margin:"8px 0",fontWeight:700,color:writerState.online?"#166534":"#991b1b"}}>{writerState.online?"Η εφαρμογή λαμβάνει πραγματικό heartbeat από τον Writer.":"Μην εκτελέσεις πώληση για απόδειξη. Ο Writer δεν επικοινώνησε τα τελευταία 15 δευτερόλεπτα."}{writerState.lastSeenAt?` Τελευταία επικοινωνία: ${new Intl.DateTimeFormat("el-GR",{dateStyle:"short",timeStyle:"medium",timeZone:"Europe/Athens"}).format(new Date(writerState.lastSeenAt))}.`:""}</p>}
      <button type="button" onClick={createPairingCode} disabled={pairingBusy} style={{border:0,borderRadius:10,padding:"10px 14px",background:"#087eb8",color:"#fff",fontWeight:700,cursor:pairingBusy?"wait":"pointer"}}>
        {pairingBusy?"Δημιουργία…":pairing?"Δημιουργία νέου κωδικού":"Δημιουργία κωδικού ζεύξης"}
      </button>
      {pairing&&<div role="status" style={{marginTop:12,padding:14,borderRadius:12,background:"#eff8ff",border:"1px solid #bfdbfe"}}>
        <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
          <code style={{fontSize:22,fontWeight:800,letterSpacing:2,color:"#0f172a"}}>{pairing.code}</code>
          <button type="button" onClick={copyPairingCode} style={{display:"inline-flex",alignItems:"center",gap:6,border:"1px solid #cbd5e1",borderRadius:8,padding:"8px 10px",background:"#fff",cursor:"pointer"}}><Copy size={16}/>{pairingCopied?"Αντιγράφηκε":"Αντιγραφή κωδικού"}</button>
        </div>
        <p style={{margin:"8px 0 0"}}>Λήγει: {new Intl.DateTimeFormat("el-GR",{dateStyle:"short",timeStyle:"short",timeZone:"Europe/Athens"}).format(new Date(pairing.expiresAt))} · Χρησιμοποιείται μία φορά.</p>
        <small style={{display:"block",marginTop:8,color:"#475569"}}>Στον υπολογιστή του POS, εκτέλεσε το Pair.ps1 με τον ίδιο χρήστη Windows και βάλε τον κωδικό στην προτροπή. Έπειτα εκτέλεσε Test-Connection.ps1, ξεκίνησε το Writer.ps1 και περίμενε να εμφανιστεί WRITER ONLINE πριν από οποιαδήποτε δοκιμή. Κλείνοντας αυτή τη σελίδα, ο κωδικός δεν θα εμφανίζεται ξανά.</small>
        <a href="https://github.com/xrhstosmanis-design/myworkstation-app/tree/main/tools/windows-rbs-capdriver-v1" target="_blank" rel="noreferrer" style={{display:"inline-block",marginTop:8,color:"#0369a1",fontWeight:700}}>Οδηγίες και αρχεία Pair.ps1 / Test-Connection.ps1 / Writer.ps1</a>
      </div>}
      {pairingError&&<p role="alert" style={{margin:"10px 0 0",color:"#b42318"}}>{pairingError}</p>}
    </section>}

    </details>
    <style>{`.owner-store-tools{background:#fff;border:1px solid #dce5ef;border-radius:18px;padding:18px;margin:0 0 18px}.owner-store-tools>summary,.owner-cash-details>summary{font-size:18px;font-weight:800;cursor:pointer;padding:12px 0;min-height:44px;box-sizing:border-box}.owner-store-tools[open]>summary{margin-bottom:14px}.owner-cash-details{margin:14px 0 18px;background:#fff;border:1px solid #dce5ef;border-radius:16px;padding:0 18px}.owner-tool-close{min-height:44px;padding:10px 14px;margin:14px 0;border:1px solid #cddae6;border-radius:10px;background:#fff;font-weight:700;cursor:pointer}.owner-primary-nav{display:flex;flex-wrap:wrap;gap:12px;margin:0 0 18px}.owner-primary-nav button{flex:1 1 240px;min-width:0;min-height:64px;display:flex;align-items:center;justify-content:center;gap:10px;padding:14px;border:1px solid #cddae6;border-radius:14px;background:#fff;color:#123b5d;font-size:18px;font-weight:800;cursor:pointer}.owner-primary-nav button[aria-pressed="true"]{background:#123b5d;color:#fff;border-color:#123b5d}.owner-primary-nav svg{flex-shrink:0;width:24px;height:24px}.owner-primary-nav button:focus-visible,.owner-store-tools summary:focus-visible,.owner-cash-details summary:focus-visible{outline:3px solid #087eb8;outline-offset:3px}.owner-store-tool-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.owner-store-tool-grid button{min-height:112px;border:1px solid #cddae6;border-radius:16px;background:#f8fbff;padding:16px;display:grid;grid-template-columns:30px 1fr;grid-template-rows:auto auto;text-align:left;align-items:center;gap:5px 10px;cursor:pointer}.owner-store-tool-grid button.active{border:2px solid #087eb8;background:#eef8ff}.owner-store-tool-grid svg{grid-row:1/3;width:26px;height:26px}.owner-store-tool-grid b{font-size:18px}.owner-store-tool-grid span{font-size:15px;color:#526276}.store-operations-front .cloud-hero h2{font-size:32px}.store-operations-front .cloud-hero p{font-size:17px;line-height:1.5}.owner-store-secondary-actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}@media(max-width:850px){.owner-store-tool-grid{grid-template-columns:1fr}.owner-store-tool-grid button{min-height:90px}.owner-store-secondary-actions{grid-template-columns:1fr}}`}</style>
  </section>;
}
