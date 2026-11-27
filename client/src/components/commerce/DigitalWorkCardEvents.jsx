import React, {useEffect, useRef, useState} from "react";
import {greeceDateInput, greeceDateTimeToIso} from "../../../../shared/greece-time.mjs";

const statusLabels = {
  ACCEPTED: "Έγινε δεκτή",
  PENDING: "Εκκρεμεί",
  REJECTED: "Απορρίφθηκε",
  UNKNOWN: "Αναμονή επιβεβαίωσης"
};
const formatTime = value => value ? new Date(value).toLocaleString("el-GR", {
  timeZone:"Europe/Athens", day:"2-digit", month:"2-digit", hour:"2-digit", minute:"2-digit", hour12:false
}) : "—";

function issuesFor(event) {
  const issues = [];
  if (event.declaredRestDay) issues.push("Σήμανση σε ρεπό");
  else if (!event.declaredStartAt || !event.declaredEndAt) issues.push("Χωρίς δηλωμένη βάρδια");
  if (event.departure.reasonPending) issues.push("Εκκρεμεί αιτιολόγηση");
  else if (event.departure.requiresReason) issues.push("Πρόωρη αποχώρηση");
  if (event.departure.showReminder) issues.push("Εκκρεμεί αποχώρηση");
  if (event.departureAt && event.declaredEndAt && Date.parse(event.departureAt) > Date.parse(event.declaredEndAt)) {
    const minutes = Math.floor((Date.parse(event.departureAt) - Date.parse(event.declaredEndAt)) / 60_000);
    if (minutes > 0) issues.push(`Αποχώρηση ${minutes}΄ μετά τη δηλωμένη λήξη`);
  }
  if (event.entryStatus !== "ACCEPTED" || (event.departureStatus && event.departureStatus !== "ACCEPTED")) {
    issues.push("Σήμανση χωρίς επιβεβαίωση");
  }
  return issues;
}

function dateRange(day) {
  const following = new Date(`${day}T00:00:00Z`);
  following.setUTCDate(following.getUTCDate() + 1);
  return {
    from:greeceDateTimeToIso(`${day}T00:00:00`),
    to:greeceDateTimeToIso(`${following.toISOString().slice(0,10)}T00:00:00`)
  };
}

export default function DigitalWorkCardEvents({api, storeId}) {
  const [day, setDay] = useState(() => greeceDateInput(new Date()));
  const [onlyIssues, setOnlyIssues] = useState(false);
  const [rows, setRows] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const sequence = useRef(0);

  async function load(beforeId) {
    if (!storeId || !day) return;
    const requestId = ++sequence.current;
    setBusy(true);
    setError("");
    if (!beforeId) {
      setRows([]);
      setCursor(null);
    }
    try {
      const params = new URLSearchParams(dateRange(day));
      if (beforeId) params.set("beforeId", beforeId);
      const page = await api(`/api/digital-work-card/stores/${encodeURIComponent(storeId)}/events?${params}`);
      if (requestId !== sequence.current) return;
      setRows(previous => beforeId ? [...previous, ...page.events] : page.events);
      setCursor(page.nextBeforeId);
    } catch (failure) {
      if (requestId === sequence.current) setError(failure.message);
    } finally {
      if (requestId === sequence.current) setBusy(false);
    }
  }

  useEffect(() => {
    load();
    return () => { sequence.current += 1; };
  }, [storeId, day]);

  const visible = rows.map(event => ({event, issues:issuesFor(event)}))
    .filter(row => !onlyIssues || row.issues.length);

  return <section className="attendance-admin">
    <header>
      <h2>Ψηφιακή Κάρτα Εργασίας</h2>
      <button type="button" disabled={busy || !day || !storeId} onClick={() => load()}>Ανανέωση</button>
    </header>
    <div className="attendance-filters">
      <label>Ημερομηνία<input type="date" value={day} required onChange={event => {
        if (event.target.value) setDay(event.target.value);
      }}/></label>
      <label><input type="checkbox" checked={onlyIssues} onChange={event => setOnlyIssues(event.target.checked)}/> Μόνο εκκρεμότητες</label>
    </div>
    {error && <p role="alert" className="commerce-error">{error}</p>}
    {busy && <p role="status">Φόρτωση συμβάντων…</p>}
    {!busy && !error && !visible.length && <p>{storeId ? "Δεν υπάρχουν συμβάντα για εμφάνιση." : "Επίλεξε κατάστημα."}</p>}
    {visible.length > 0 && <div style={{overflowX:"auto"}}>
      <table>
        <thead><tr><th>Εργαζόμενος</th><th>Δηλωμένο ωράριο</th><th>Προσέλευση</th><th>Αποχώρηση</th><th>Λόγος αποχώρησης</th><th>Συμβάντα</th></tr></thead>
        <tbody>{visible.map(({event, issues}) => <tr key={event.id}>
          <th scope="row">{event.employee.fullName}</th>
          <td>{event.declaredRestDay ? "Ρεπό" : `${formatTime(event.declaredStartAt)} – ${formatTime(event.declaredEndAt)}`}</td>
          <td>{formatTime(event.entryAt)}<br/>{statusLabels[event.entryStatus]}{event.entryError && <><br/>{event.entryError}</>}</td>
          <td>{formatTime(event.departureAt)}<br/>{statusLabels[event.departureStatus]}{event.departureError && <><br/>{event.departureError}</>}</td>
          <td>{event.departureReason || (event.departure.reasonPending ? "Εκκρεμεί αιτιολόγηση" : "—")}</td>
          <td>{issues.join(" · ") || "—"}</td>
        </tr>)}</tbody>
      </table>
    </div>}
    {cursor && <button type="button" disabled={busy} onClick={() => load(cursor)}>Περισσότερα συμβάντα</button>}
  </section>;
}
