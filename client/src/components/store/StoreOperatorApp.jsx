import React,{useEffect,useMemo,useRef,useState} from "react";
import {BadgeEuro,ContactRound,KeyRound,LogOut,ScanLine,ShieldCheck,Store,Wifi} from "lucide-react";
import CashControlPanel from "../cloud/CashControlPanel.jsx";
import "./store-operator.css";

export default function StoreOperatorApp({api,storeId}){
  const [directory,setDirectory]=useState(null);
  const [session,setSession]=useState(()=>{
    try{
      const saved=JSON.parse(localStorage.getItem("storeOperatorSession")||"null");
      return saved?.store?.id===storeId?saved:null;
    }catch{return null}
  });
  const [method,setMethod]=useState("PIN");
  const [employeeId,setEmployeeId]=useState("");
  const [pin,setPin]=useState("");
  const [cardCode,setCardCode]=useState("");
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const cardRef=useRef(null);

  const loadDirectory=async()=>{
    setLoading(true);setError("");
    try{
      const result=await api(`/api/operators/stores/${storeId}/directory`);
      setDirectory(result);
      const firstPin=result.operators.find(row=>row.hasPin);
      if(firstPin)setEmployeeId(current=>current||firstPin.employeeId);
    }catch(err){setError(err.message)}finally{setLoading(false)}
  };
  useEffect(()=>{if(!session)loadDirectory()},[storeId,session]);
  useEffect(()=>{if(method==="CARD")setTimeout(()=>cardRef.current?.focus(),50)},[method]);

  const pinOperators=useMemo(()=>directory?.operators?.filter(row=>row.hasPin)||[],[directory]);
  const cardEnabled=useMemo(()=>directory?.operators?.some(row=>row.hasCard)||false,[directory]);

  const remember=result=>{
    const next={user:result.user,store:result.store,company:result.company};
    localStorage.setItem("token",result.token);
    localStorage.setItem("storeOperatorSession",JSON.stringify(next));
    setSession(next);setPin("");setCardCode("");
  };

  const loginPin=async event=>{
    event.preventDefault();setBusy(true);setError("");
    try{
      const result=await api("/api/operators/login/pin",{method:"POST",body:JSON.stringify({storeId,employeeId,pin})});
      remember(result);
    }catch(err){setError(err.message)}finally{setBusy(false)}
  };
  const loginCard=async event=>{
    event.preventDefault();setBusy(true);setError("");
    try{
      const result=await api("/api/operators/login/card",{method:"POST",body:JSON.stringify({storeId,cardCode})});
      remember(result);
    }catch(err){setError(err.message);setCardCode("");setTimeout(()=>cardRef.current?.focus(),50)}finally{setBusy(false)}
  };
  const logout=()=>{
    localStorage.removeItem("token");localStorage.removeItem("storeOperatorSession");localStorage.removeItem("user");setSession(null);setDirectory(null);
  };

  if(session)return <div className="store-mode-shell">
    <header className="store-mode-header">
      <div className="store-mode-brand"><div className="store-mode-mark">MW</div><div><b>MyWorkStation Store Mode</b><span>{session.company?.name}</span></div></div>
      <div className="store-mode-store"><Store/><div><small>Κατάστημα</small><b>{session.store.name}</b></div></div>
      <div className="store-mode-user"><ContactRound/><div><small>Συνδεδεμένος</small><b>{session.user.fullName}</b><span>{session.user.role==="MANAGER"?"Υπεύθυνος":"Εργαζόμενος"}</span></div><button onClick={logout}><LogOut/>Έξοδος</button></div>
    </header>
    <div className="store-pilot-banner"><ShieldCheck/><div><b>ΕΜΠΟΡΙΚΗ ΠΙΛΟΤΙΚΗ ΔΟΚΙΜΗ — ΜΗ ΦΟΡΟΛΟΓΙΚΗ ΛΕΙΤΟΥΡΓΙΑ</b><span>Η καταχώριση γίνεται παράλληλα. Οι αποδείξεις συνεχίζουν να εκδίδονται αποκλειστικά από το υπάρχον Kiosk Manager και την ταμειακή.</span></div></div>
    <main className="store-mode-main">
      <div className="store-mode-title"><div><span>LIVE OPERATIONS</span><h1>Έλεγχος Ταμείου</h1><p>Άνοιγμα, κλείσιμο και παράδοση βάρδιας με προσωπικό audit.</p></div><div className="store-online"><Wifi/>Online</div></div>
      <CashControlPanel api={api} store={session.store}/>
    </main>
  </div>;

  return <div className="operator-login-shell">
    <div className="operator-login-side">
      <div className="operator-login-logo">MW</div>
      <span>MYWORKSTATION — STORE MODE</span>
      <h1>{directory?.store?.name||"Είσοδος καταστήματος"}</h1>
      <p>Συνδέσου με την προσωπική σου κάρτα ή το προσωπικό PIN. Κάθε ενέργεια καταγράφεται ονομαστικά.</p>
      <div className="operator-login-safe"><ShieldCheck/><div><b>Ασφαλής πιλοτική λειτουργία</b><span>Δεν επηρεάζει την ταμειακή, το Kiosk Manager ή το CapDriver.</span></div></div>
    </div>
    <div className="operator-login-main">
      <div className="operator-login-card">
        <div className="operator-login-icon"><BadgeEuro/></div>
        <h2>Ανάληψη βάρδιας</h2>
        <p>{loading?"Έλεγχος καταστήματος…":directory?.store?.companyName||"MyWorkStation"}</p>
        <div className="operator-methods">
          <button className={method==="PIN"?"active":""} onClick={()=>setMethod("PIN")}><KeyRound/>PIN</button>
          <button className={method==="CARD"?"active":""} onClick={()=>setMethod("CARD")} disabled={!cardEnabled}><ScanLine/>Κάρτα</button>
        </div>
        {error&&<div className="operator-login-error">{error}</div>}
        {loading?<div className="operator-login-loading">Φόρτωση…</div>:method==="PIN"?<form onSubmit={loginPin}>
          {pinOperators.length===0?<div className="operator-login-empty">Δεν έχει ενεργοποιηθεί ακόμη προσωπικό PIN. Ο ιδιοκτήτης πρέπει να το ορίσει από το Backoffice.</div>:<>
            <label>Εργαζόμενος<select value={employeeId} onChange={e=>setEmployeeId(e.target.value)} required>{pinOperators.map(row=><option key={row.employeeId} value={row.employeeId}>{row.displayName}</option>)}</select></label>
            <label>Προσωπικό PIN<input type="password" inputMode="numeric" autoComplete="off" maxLength="8" value={pin} onChange={e=>setPin(e.target.value.replace(/\D/g,""))} placeholder="••••" required/></label>
            <button disabled={busy||pin.length<4}>{busy?"Έλεγχος…":"Είσοδος"}</button>
          </>}
        </form>:<form onSubmit={loginCard}>
          <label>Σκάναρε την προσωπική κάρτα<input ref={cardRef} value={cardCode} onChange={e=>setCardCode(e.target.value)} placeholder="ΠΕΡΙΜΕΝΕΙ ΚΑΡΤΑ" autoComplete="off" required/></label>
          <button disabled={busy||cardCode.trim().length<3}>{busy?"Έλεγχος…":"Είσοδος με κάρτα"}</button>
        </form>}
        <small className="operator-login-note">Ο προσωπικός κωδικός δεν εμφανίζεται και δεν αποθηκεύεται στον υπολογιστή.</small>
      </div>
    </div>
  </div>;
}
