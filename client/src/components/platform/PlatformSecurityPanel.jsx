import React,{useEffect,useState} from "react";
import {Laptop,RefreshCw,ShieldCheck,Smartphone,Trash2} from "lucide-react";

const eventLabels={
  PASSWORD_REJECTED:"Αποτυχημένος κωδικός",
  COMPANY_INACTIVE:"Ανενεργή εταιρεία",
  TOTP_SETUP_STARTED:"Έναρξη ενεργοποίησης 2FA",
  TOTP_SETUP_REJECTED:"Λάθος κωδικός ενεργοποίησης",
  TOTP_ENABLED_LOGIN_SUCCESS:"Ενεργοποίηση 2FA και σύνδεση",
  PASSWORD_ACCEPTED_MFA_REQUIRED:"Σωστός κωδικός — αναμονή 2FA",
  TOTP_REJECTED:"Λάθος κωδικός 2FA",
  TOTP_LOGIN_SUCCESS:"Επιτυχής σύνδεση 2FA",
  RECOVERY_LOGIN_SUCCESS:"Σύνδεση με κωδικό ανάκτησης",
  LOGIN_SUCCESS:"Επιτυχής σύνδεση",
  SESSION_REVOKED:"Ανάκληση συσκευής",
  OTHER_SESSIONS_REVOKED:"Αποσύνδεση άλλων συσκευών"
};
const dateTime=value=>value?new Date(value).toLocaleString("el-GR"):"—";

export default function PlatformSecurityPanel({request,onCurrentRevoked}){
  const [data,setData]=useState(null);
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState("");
  const [error,setError]=useState("");

  const load=async()=>{
    setLoading(true);setError("");
    try{setData(await request("/api/auth/security"))}catch(err){setError(err.message)}finally{setLoading(false)}
  };
  useEffect(()=>{load()},[]);

  const revoke=async session=>{
    setBusy(session.id);setError("");
    try{
      const result=await request(`/api/auth/sessions/${session.id}/revoke`,{method:"POST",body:"{}"});
      if(result.current){onCurrentRevoked();return}
      await load();
    }catch(err){setError(err.message)}finally{setBusy("")}
  };
  const revokeOthers=async()=>{
    setBusy("others");setError("");
    try{await request("/api/auth/sessions/revoke-others",{method:"POST",body:"{}"});await load()}catch(err){setError(err.message)}finally{setBusy("")}
  };

  if(loading)return <div className="security-loading">Έλεγχος ασφάλειας…</div>;
  return <div className="platform-security-panel">
    {error&&<div className="platform-error">{error}</div>}
    <div className="security-summary">
      <article><ShieldCheck/><div><b>Έλεγχος δύο βημάτων</b><span>{data?.totpEnabled?"Ενεργός":"Ανενεργός"}</span></div></article>
      <article><Smartphone/><div><b>Κωδικοί ανάκτησης</b><span>{data?.recoveryCount||0} διαθέσιμοι</span></div></article>
      <button onClick={revokeOthers} disabled={busy==="others"}>{busy==="others"?"Αποσύνδεση…":"Αποσύνδεση άλλων συσκευών"}</button>
      <button className="security-refresh" onClick={load}><RefreshCw/>Ανανέωση</button>
    </div>

    <section className="security-section">
      <h3>Συνδεδεμένες συσκευές</h3>
      <div className="security-list">{(data?.sessions||[]).map(session=>{
        const active=!session.revokedAt&&new Date(session.expiresAt)>new Date();
        return <article className={!active?"revoked":""} key={session.id}>
          <Laptop/>
          <div><b>{session.deviceName||"Άγνωστη συσκευή"}{session.current?" · ΑΥΤΗ Η ΣΥΣΚΕΥΗ":""}</b><span>Τελευταία χρήση: {dateTime(session.lastSeenAt)}</span><small>IP: {session.ipAddress||"—"} · Λήξη: {dateTime(session.expiresAt)}</small></div>
          <span className={`session-state ${active?"active":"inactive"}`}>{active?"ΕΝΕΡΓΗ":"ΚΛΕΙΣΤΗ"}</span>
          {active&&<button className="session-revoke" onClick={()=>revoke(session)} disabled={busy===session.id}><Trash2/>{session.current?"Αποσύνδεση":"Ανάκληση"}</button>}
        </article>
      })}</div>
    </section>

    <section className="security-section">
      <h3>Ιστορικό εισόδων</h3>
      <div className="audit-list">{(data?.audits||[]).map(item=><article key={item.id}>
        <span className={item.success?"audit-ok":"audit-fail"}></span>
        <div><b>{eventLabels[item.event]||item.event}</b><span>{item.deviceName||"Άγνωστη συσκευή"} · {item.ipAddress||"—"}</span></div>
        <time>{dateTime(item.createdAt)}</time>
      </article>)}</div>
    </section>
  </div>;
}
