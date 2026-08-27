import React,{useEffect,useState} from "react";
import QRCode from "qrcode";
import {Check,Copy,KeyRound,ShieldCheck,Smartphone} from "lucide-react";

async function call(path,body){
  const response=await fetch(path,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(data.error||"Παρουσιάστηκε σφάλμα σύνδεσης.");
  return data;
}

function defaultDeviceName(){
  const stored=localStorage.getItem("platformDeviceName");
  if(stored)return stored;
  const platform=navigator.userAgentData?.platform||navigator.platform||"";
  return /win/i.test(platform)?"Windows PC":"Προσωπική συσκευή";
}

export default function PlatformSecureLogin({onLogin}){
  const [step,setStep]=useState("password");
  const [email,setEmail]=useState("admin@myworkstationapp.gr");
  const [password,setPassword]=useState("");
  const [deviceName,setDeviceName]=useState(defaultDeviceName);
  const [code,setCode]=useState("");
  const [setup,setSetup]=useState(null);
  const [challengeToken,setChallengeToken]=useState("");
  const [qr,setQr]=useState("");
  const [recoveryCodes,setRecoveryCodes]=useState([]);
  const [pendingUser,setPendingUser]=useState(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [copied,setCopied]=useState(false);

  useEffect(()=>{
    if(!setup?.otpAuthUri)return;
    QRCode.toDataURL(setup.otpAuthUri,{width:230,margin:1,errorCorrectionLevel:"M"}).then(setQr).catch(()=>setQr(""));
  },[setup]);

  const saveResult=result=>{
    if(result.user?.role!=="SUPER_ADMIN")throw new Error("Ο λογαριασμός δεν είναι Platform Super Admin.");
    localStorage.setItem("token",result.token);
    localStorage.setItem("platformUser",JSON.stringify(result.user));
    localStorage.setItem("platformDeviceName",deviceName.trim()||"Προσωπική συσκευή");
  };

  const submitPassword=async event=>{
    event.preventDefault();setBusy(true);setError("");
    try{
      const result=await call("/api/auth/login",{email,password,deviceName});
      setPassword("");
      if(result.setupRequired){setSetup(result);setStep("setup");return}
      if(result.mfaRequired){setChallengeToken(result.challengeToken);setStep("verify");return}
      saveResult(result);onLogin(result.user);
    }catch(err){setError(err.message)}finally{setBusy(false)}
  };

  const enable=async event=>{
    event.preventDefault();setBusy(true);setError("");
    try{
      const result=await call("/api/auth/2fa/enable",{setupToken:setup.setupToken,code,deviceName});
      saveResult(result);
      setPendingUser(result.user);
      setRecoveryCodes(result.recoveryCodes||[]);
      setCode("");setStep("recovery");
    }catch(err){setError(err.message)}finally{setBusy(false)}
  };

  const verify=async event=>{
    event.preventDefault();setBusy(true);setError("");
    try{
      const result=await call("/api/auth/2fa/verify",{challengeToken,code,deviceName});
      saveResult(result);onLogin(result.user);
    }catch(err){setError(err.message)}finally{setBusy(false)}
  };

  const copyRecovery=async()=>{
    await navigator.clipboard.writeText(recoveryCodes.join("\n"));
    setCopied(true);setTimeout(()=>setCopied(false),1800);
  };

  const restart=()=>{setStep("password");setSetup(null);setChallengeToken("");setCode("");setQr("");setError("")};

  return <div className="platform-login-shell">
    <section className="platform-login-info">
      <div className="platform-logo">MW</div>
      <span>MYWORKSTATION PLATFORM</span>
      <h1>Κεντρική διαχείριση της εμπορικής πλατφόρμας</h1>
      <p>Πελάτες, καταστήματα, συνδρομές και λογαριασμοί ιδιοκτητών από μία ασφαλή οθόνη.</p>
      <div><ShieldCheck/><b>Πρόσβαση μόνο Platform Super Admin με 2FA</b></div>
    </section>

    {step==="password"&&<form className="platform-login-card" onSubmit={submitPassword}>
      <div className="platform-login-icon"><ShieldCheck/></div>
      <h2>Είσοδος ιδιοκτήτη πλατφόρμας</h2>
      <label>Email<input type="email" data-keyboard="off" value={email} onInput={e=>setEmail(e.currentTarget.value)} onChange={e=>setEmail(e.target.value)} required/></label>
      <label>Κωδικός<input type="password" data-keyboard="off" value={password} onInput={e=>setPassword(e.currentTarget.value)} onChange={e=>setPassword(e.target.value)} required/></label>
      <label>Όνομα αυτής της συσκευής<input data-keyboard="off" value={deviceName} onInput={e=>setDeviceName(e.currentTarget.value)} onChange={e=>setDeviceName(e.target.value)} maxLength="80" placeholder="π.χ. HOME PC" required/></label>
      {error&&<div className="platform-error">{error}</div>}
      <button disabled={busy}>{busy?"Έλεγχος…":"Συνέχεια"}</button>
      <a href="/">Κανονικό Backoffice</a>
    </form>}

    {step==="setup"&&<form className="platform-login-card secure-step" onSubmit={enable}>
      <div className="platform-login-icon"><Smartphone/></div>
      <h2>Ενεργοποίηση Authenticator</h2>
      <p>Άνοιξε στο κινητό το Google Authenticator ή Microsoft Authenticator και σκάναρε τον κωδικό.</p>
      {qr?<img className="totp-qr" src={qr} alt="QR ενεργοποίησης 2FA"/>:<div className="qr-loading">Δημιουργία QR…</div>}
      <details><summary>Χειροκίνητος κωδικός</summary><code className="totp-secret">{setup.secret}</code></details>
      <label>Εξαψήφιος κωδικός Authenticator<input data-keyboard="off" inputMode="numeric" autoComplete="one-time-code" value={code} onInput={e=>setCode(e.currentTarget.value.replace(/\D/g,"").slice(0,6))} onChange={e=>setCode(e.target.value.replace(/\D/g,"").slice(0,6))} minLength="6" maxLength="6" required autoFocus/></label>
      {error&&<div className="platform-error">{error}</div>}
      <button disabled={busy||code.length!==6}>{busy?"Επιβεβαίωση…":"Ενεργοποίηση 2FA"}</button>
      <button type="button" className="secondary-link" onClick={restart}>Ακύρωση</button>
    </form>}

    {step==="verify"&&<form className="platform-login-card secure-step" onSubmit={verify}>
      <div className="platform-login-icon"><KeyRound/></div>
      <h2>Δεύτερο βήμα ασφαλείας</h2>
      <p>Γράψε τον εξαψήφιο κωδικό που εμφανίζει τώρα η εφαρμογή Authenticator.</p>
      <label>Κωδικός 2FA ή κωδικός ανάκτησης<input data-keyboard="off" autoComplete="one-time-code" value={code} onInput={e=>setCode(e.currentTarget.value.toUpperCase().slice(0,20))} onChange={e=>setCode(e.target.value.toUpperCase().slice(0,20))} minLength="6" required autoFocus/></label>
      {error&&<div className="platform-error">{error}</div>}
      <button disabled={busy}>{busy?"Έλεγχος…":"Ασφαλής σύνδεση"}</button>
      <button type="button" className="secondary-link" onClick={restart}>Πίσω</button>
    </form>}

    {step==="recovery"&&<section className="platform-login-card secure-step recovery-card">
      <div className="platform-login-icon"><Check/></div>
      <h2>Το 2FA ενεργοποιήθηκε</h2>
      <p>Αποθήκευσε αυτούς τους κωδικούς σε ασφαλές σημείο. Κάθε κωδικός χρησιμοποιείται μόνο μία φορά αν χαθεί το κινητό.</p>
      <div className="recovery-codes">{recoveryCodes.map(item=><code key={item}>{item}</code>)}</div>
      <button type="button" onClick={copyRecovery}>{copied?<><Check/>Αντιγράφηκαν</>:<><Copy/>Αντιγραφή κωδικών</>}</button>
      <button type="button" className="recovery-continue" onClick={()=>onLogin(pendingUser)}>Τα αποθήκευσα — Είσοδος</button>
    </section>}
  </div>;
}
