import React, { useEffect, useRef, useState } from "react";
import { X, RefreshCw } from "lucide-react";

const date = value => new Date(value).toLocaleDateString("el-GR", { timeZone: "Europe/Athens" });
const status = { PREPARED: "Αποθηκευμένη προετοιμασία", EXPIRED: "Έληξε", REVOKED: "Ανακλήθηκε" };

export default function CustomerDemoCenter({ request, onClose }) {
  const [data, setData] = useState(null), [error, setError] = useState("");
  const [name, setName] = useState(""), [days, setDays] = useState(14);
  const [busy, setBusy] = useState(false), [notice, setNotice] = useState("");
  const key = useRef(null), live = useRef(true), inFlight = useRef(false);
  const load = async () => {
    try { const result = await request("/api/platform/customer-demos"); if (live.current) setData(result); }
    catch (e) { if (live.current) setError(e.message); }
  };
  useEffect(() => { live.current = true; load(); return () => { live.current = false; }; }, []);
  const create = async event => {
    event.preventDefault(); if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setError(""); setNotice("");
    try {
      key.current ||= crypto.randomUUID();
      await request("/api/platform/customer-demos", { method: "POST", body: JSON.stringify({ requestKey: key.current, displayName: name.trim(), days }) });
      key.current = null;
      if (live.current) { setName(""); setNotice("Η προετοιμασία αποθηκεύτηκε. Η εγκατάσταση POS και Backoffice εκκρεμεί."); await load(); }
    } catch (e) { if (live.current) setError(e.message); }
    finally { inFlight.current = false; if (live.current) setBusy(false); }
  };
  const revoke = async demo => {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setError(""); setNotice("");
    try {
      await request(`/api/platform/customer-demos/${demo.demoId}/revoke`, { method: "POST", body: "{}" });
      if (live.current) { setNotice(`Το demo «${demo.displayName}» ανακλήθηκε.`); await load(); }
    } catch (e) { if (live.current) setError(e.message); }
    finally { inFlight.current = false; if (live.current) setBusy(false); }
  };
  return <div className="platform-modal"><section className="platform-security-dialog">
    <button type="button" className="modal-close" aria-label="Κλείσιμο" onClick={onClose}><X /></button>
    <h2>Demo πελατών · POS και Backoffice</h2>
    <p>Ξεχωριστό εικονικό κατάστημα ανά πελάτη, με 16 είδη σούπερ μάρκετ και καρτέλες 50 × 40 mm.</p>
    <p>Η προετοιμασία παραμένει ανενεργή. Το πακέτο Windows θα διατεθεί μετά τον έλεγχο της εγκατάστασης.</p>
    {error && <div className="platform-alert error" role="alert">{error}</div>}
    {notice && <div className="platform-alert success" role="status">{notice}</div>}
    {!data ? <p>Φόρτωση…</p> : !data.enabled ? <p>Η δημιουργία demo δεν είναι διαθέσιμη ακόμη.</p> : <>
      <form className="small" onSubmit={create}>
        <label>Όνομα demo<input value={name} onChange={e => setName(e.target.value)} required minLength={2} maxLength={100} disabled={busy} /></label>
        <label>Διάρκεια σε ημέρες<input type="number" value={days} onChange={e => setDays(Number(e.target.value))} min={1} max={30} required disabled={busy} /></label>
        <button disabled={busy}>{busy ? "Αποθήκευση…" : "Αποθήκευση προετοιμασίας"}</button>
      </form>
      <div style={{ overflowX: "auto" }}><table><thead><tr><th>Demo</th><th>Κατάσταση</th><th>Λήξη</th><th>Ενέργεια</th></tr></thead><tbody>
        {data.demos.map(demo => <tr key={demo.demoId}><td>{demo.displayName}</td><td>{status[demo.status] || demo.status}</td><td>{date(demo.expiresAt)}</td><td><button type="button" className="danger" disabled={busy || demo.status === "REVOKED"} onClick={() => revoke(demo)}>Ανάκληση</button></td></tr>)}
      </tbody></table></div>
      {!data.demos.length && <p>Δεν υπάρχουν αποθηκευμένα demo.</p>}
    </>}
    <button type="button" className="secondary" disabled={busy} onClick={load}><RefreshCw />Ανανέωση</button>
  </section></div>;
}
