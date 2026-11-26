import React, {useEffect, useRef, useState} from "react";

const messages = {
  ACCEPTED:"Η σήμανση έγινε δεκτή στο δοκιμαστικό ΕΡΓΑΝΗ.",
  PENDING:"Η σήμανση εκκρεμεί.",
  UNKNOWN:"Η σήμανση χρειάζεται επιβεβαίωση από τον υπεύθυνο.",
  REJECTED:"Το δοκιμαστικό ΕΡΓΑΝΗ απέρριψε τη σήμανση."
};

export default function PosDigitalWorkCardClock({api, storeId}) {
  const url = `/api/digital-work-card/stores/${encodeURIComponent(storeId)}/trial-clock`;
  const [state, setState] = useState(null);
  const [notice, setNotice] = useState("");
  const [reason, setReason] = useState("");
  const [restConfirmed, setRestConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const pending = useRef(null);

  useEffect(() => {
    let active = true;
    api(url).then(result => { if (active) setState(result); }).catch(() => {});
    return () => { active = false; };
  }, [api, url]);

  if (!state) return null;
  const session = state.session;
  const canEnter = !session || (!session.reasonPending
    && (session.departureStatus === "ACCEPTED" || session.entryStatus === "REJECTED"));
  const canLeave = session?.entryStatus === "ACCEPTED" && !session.departureStatus;
  const type = canEnter ? "IN" : "OUT";

  async function submit() {
    if (busy || (!canEnter && !canLeave)) return;
    if (type === "IN" && state.restDay && !restConfirmed) {
      setRestConfirmed(true);
      return;
    }
    const request = pending.current || {
      type, requestId:crypto.randomUUID(), ...(type === "OUT" ? {sessionId:session.id} : {})
    };
    pending.current = request;
    setBusy(true);
    setNotice("");
    try {
      const response = await api(url, {method:"POST", body:JSON.stringify(request)});
      const updated = await api(url);
      pending.current = null;
      setRestConfirmed(false);
      setState(updated);
      setNotice(messages[response.status]);
    } catch (error) {
      setNotice(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function saveReason(event) {
    event.preventDefault();
    if (busy || !reason.trim()) return;
    setBusy(true);
    try {
      await api(`${url}/reason`, {method:"PATCH", body:JSON.stringify({sessionId:session.id, reason})});
      setState(current => ({...current, session:{...current.session, reasonPending:false}}));
      setReason("");
      setNotice("Ο λόγος αποχώρησης καταγράφηκε.");
    } catch (error) {
      setNotice(error.message);
    } finally {
      setBusy(false);
    }
  }

  return <section className="store-pos-alert" aria-label="Δοκιμαστική Ψηφιακή Κάρτα Εργασίας">
    <strong>Ψηφιακή Κάρτα Εργασίας · Δοκιμή</strong>{" "}
    {restConfirmed && canEnter && <div role="alert">
      <strong>ΣΗΜΕΡΑ ΕΧΕΙΣ ΔΗΛΩΜΕΝΟ ΡΕΠΟ</strong>
      <button type="button" disabled={busy} onClick={() => setRestConfirmed(false)}>Όχι</button>
    </div>}
    <button type="button" disabled={busy || (!canEnter && !canLeave)} onClick={submit}>
      {type === "IN" ? "Χτυπάω προσέλευση" : "Χτυπάω αποχώρηση"}
    </button>
    {session?.reasonPending && <form onSubmit={saveReason}>
      <label><strong>ΠΡΟΩΡΗ ΑΠΟΧΩΡΗΣΗ</strong><br/>
        Συμπλήρωσε τον λόγο αποχώρησης.
        <input required maxLength={500} value={reason} onChange={event => setReason(event.target.value)}/>
      </label>
      <button disabled={busy || !reason.trim()}>Καταχώριση λόγου</button>
    </form>}
    <div role="status">{notice || messages[session?.departureStatus ?? session?.entryStatus]}</div>
  </section>;
}
