import React,{useCallback,useEffect,useState} from "react";
import {Activity,Eye,RefreshCw,ShieldCheck} from "lucide-react";
import "./connector-observer.css";

const date=value=>value?new Date(value).toLocaleString("el-GR"):"—";

export default function ConnectorObserverPanel({api,storeId}){
  const [status,setStatus]=useState(null),[events,setEvents]=useState([]),[source,setSource]=useState(""),[error,setError]=useState("");
  const load=useCallback(async()=>{if(!storeId)return;setError("");try{const suffix=`storeId=${encodeURIComponent(storeId)}`;const [nextStatus,nextEvents]=await Promise.all([api(`/api/connector-observer/status?${suffix}`),api(`/api/connector-observer/events?${suffix}${source?`&source=${source}`:""}`)]);setStatus(nextStatus);setEvents(nextEvents)}catch(e){setError(e.message)}},[api,storeId,source]);
  useEffect(()=>{load()},[load]);
  return <section className="observer-panel">
    <div className="observer-banner"><ShieldCheck/><div><strong>RBS / CapDriver Observer — ΜΟΝΟ ΑΝΑΓΝΩΣΗ</strong><p>Παρακολουθεί αποκλειστικά τεχνικά μεταδεδομένα. Δεν αποθηκεύει ωμό περιεχόμενο, δεν στέλνει εντολές και δεν εκδίδει φορολογικά παραστατικά.</p></div></div>
    <div className="observer-toolbar"><label>Πηγή <select value={source} onChange={e=>setSource(e.target.value)}><option value="">Όλες</option><option value="CAPDRIVER">CapDriver</option><option value="RBS">RBS</option><option value="KIOSK_MANAGER">Kiosk Manager</option></select></label><button onClick={load}><RefreshCw/> Ανανέωση</button></div>
    {error&&<div className="commerce-error">{error}</div>}
    <div className="observer-grid"><div className="commerce-box"><h3><Activity/> Κατάσταση Observer</h3>{!status?.devices?.length?<div className="observer-empty">Δεν έχει συνδεθεί ακόμη Observer σε αυτό το κατάστημα. Η σύνδεση γίνεται με τον υπάρχοντα κωδικό Cloud Store Connector και απαιτεί τεχνική ενεργοποίηση του module.</div>:status.devices.map(device=><article className="observer-device" key={device.id}><div><b>{device.deviceName}</b><span className={device.online?"online":"offline"}>{device.online?"Συνδεδεμένο":"Εκτός σύνδεσης"}</span></div><dl><dt>Έκδοση</dt><dd>{device.version||"—"}</dd><dt>Τελευταία επαφή</dt><dd>{date(device.lastSeenAt)}</dd><dt>Τελευταία παρατήρηση</dt><dd>{date(device.lastObservedAt)}</dd><dt>Συμβάντα</dt><dd>{device.eventCount||0}</dd><dt>Λειτουργία</dt><dd>{device.observerMode}</dd></dl></article>)}</div>
      <div className="commerce-box"><h3><Eye/> Όρια ασφαλείας</h3><ul className="observer-limits"><li>Μόνο hash και τεχνικό μέγεθος μηνύματος</li><li>Καμία αποθήκευση raw payload</li><li>Καμία εξερχόμενη εντολή προς RBS/CapDriver</li><li>Καμία έκδοση ή ακύρωση απόδειξης</li></ul><div className="commerce-notice"><b>Μοναδική φορολογική διαδρομή:</b> Kiosk Manager / RBS. Το MyWorkStation παραμένει παρατηρητής μέχρι την πιστοποιημένη διασύνδεση.</div></div></div>
    <div className="commerce-box"><h3>Πρόσφατα τεχνικά συμβάντα</h3><div className="observer-events"><div className="observer-event head"><span>Χρόνος</span><span>Πηγή</span><span>Κατεύθυνση</span><span>Τύπος / Μέγεθος</span><span>Hash</span><span>Κατάσταση</span></div>{events.map(event=><div className="observer-event" key={event.id}><span>{date(event.observedAt)}</span><span>{event.source}</span><span>{event.direction}</span><span>{event.messageType||"—"} · {event.byteLength} bytes</span><code>{event.payloadHash?.slice(0,16)}…</code><span>{event.success?"OK":event.errorText||"ERROR"}</span></div>)}{!events.length&&<div className="observer-empty">Δεν υπάρχουν καταγεγραμμένα τεχνικά συμβάντα.</div>}</div></div>
  </section>;
}
