import React, { useState } from "react";

const date = value => value ? new Intl.DateTimeFormat("el-GR", {
  dateStyle: "short", timeStyle: "short", timeZone: "Europe/Athens",
}).format(new Date(value)) : "—";
const money = value => value == null ? "Άγνωστο" : new Intl.NumberFormat("el-GR", {
  style: "currency", currency: "EUR",
}).format(Number(value));

function downloadReport(report) {
  const rows = [
    ["Κατάστημα", report.storeName],
    ["Κατάσταση", report.completedAt ? "Τελική" : "Προσωρινή"],
    ["Έναρξη", date(report.startedAt)],
    ["Ολοκλήρωση", date(report.completedAt)],
    ["Σύνολο λιανικής γνωστών τιμών (€)", report.retailTotal],
    ["Σύνολο κόστους γνωστών τιμών (€)", report.costTotal],
    ["Είδη χωρίς λιανική", report.missingRetail],
    ["Είδη χωρίς κόστος", report.missingCost],
    [],
    ["Απογραφή", "Έναρξη", "Οριστικοποίηση"],
    ...report.stocktakes.map(s => [s.name, date(s.startedAt), date(s.finalizedAt)]),
    [],
    ["SKU", "Είδος", "Ποσότητα", "Λιανική αξία (€)", "Αξία κόστους (€)", "Τελευταία καταμέτρηση"],
    ...report.items.map(item => [item.sku, item.name, item.quantity, item.retailValue, item.costValue, date(item.countedAt)]),
  ];
  const csv = rows.map(row => row.map(value => {
    const text = String(value ?? "");
    const safe = typeof value === "string" && /^\s*[=+@-]/.test(text) && !/^-\d+(\.\d+)?$/.test(text)
      ? "'" + text : text;
    return '"' + safe.replaceAll('"', '""') + '"';
  }).join(";")).join("\r\n");
  const url = URL.createObjectURL(new Blob(["\uFEFF", csv], {type:"text/csv;charset=utf-8"}));
  const link = document.createElement("a");
  link.href = url;
  link.download = "inventory-valuation.csv";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function InventoryValuationReport({api, stocktakes, storeId}) {
  const eligible = stocktakes.filter(s => ["DRAFT", "FINALIZED"].includes(s.status));
  const stores = [...new Map(eligible.map(s => [s.storeId, s.storeName]))];
  const [selectedStore, setSelectedStore] = useState(storeId || stores[0]?.[0] || "");
  const [selected, setSelected] = useState([]);
  const [report, setReport] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const available = eligible.filter(s => s.storeId === selectedStore);
  const chosen = available.filter(s => selected.includes(s.id));

  async function loadReport(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setReport(null);
    try {
      setReport(await api("/api/inventory-v2/stocktakes/valuation-report", {
        method:"POST", body:JSON.stringify({storeId:selectedStore,stocktakeIds:chosen.map(s => s.id)}),
      }));
    } catch (error) {
      setError(error.message);
    } finally {
      setBusy(false);
    }
  }

  return <section className="op-box inv2-work">
    <h3>Συγκεντρωτική αναφορά απογραφών</h3>
    <p>Επίλεξε τις επιμέρους απογραφές της ίδιας εργασίας. Για κάθε είδος κρατάμε την τελευταία καταμέτρηση.</p>
    <form onSubmit={loadReport}>
      <label>Κατάστημα <select value={selectedStore} disabled={busy} onChange={event => {
        setSelectedStore(event.target.value);
        setSelected([]);
        setReport(null);
      }}>
        <option value="">Επίλεξε κατάστημα</option>
        {stores.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
      </select></label>
      <fieldset disabled={busy}>
        <legend>Απογραφές για την αναφορά</legend>
        {available.map(s => <div key={s.id}><label>
          <input type="checkbox" checked={selected.includes(s.id)} onChange={event => {
            const checked = event.target.checked;
            setSelected(ids => checked ? [...ids, s.id] : ids.filter(id => id !== s.id));
            setReport(null);
          }}/>
          {s.name} · {date(s.startedAt)} · {s.status === "FINALIZED" ? "Οριστικοποιημένη" : "Ανοιχτή"}
        </label></div>)}
      </fieldset>
      <button type="submit" disabled={busy || !chosen.length}>{busy ? "Υπολογισμός…" : "Προβολή αναφοράς"}</button>
    </form>
    {error && <p role="alert">{error}</p>}
    {report && <>
      <h4>{report.completedAt ? "Τελική αποτίμηση" : "Προσωρινή αποτίμηση"} · {report.storeName}</h4>
      <p>Έναρξη {date(report.startedAt)} · Ολοκλήρωση {date(report.completedAt)} · {report.stocktakes.length} απογραφές · {report.items.length} είδη</p>
      <p><strong>{report.missingRetail ? "Μερικό σύνολο λιανικής" : "Συνολική λιανική αξία"} {money(report.retailTotal)}</strong>{report.missingRetail > 0 && ` · ${report.missingRetail} είδη χωρίς τιμή`}</p>
      <p><strong>{report.missingCost ? "Μερικό σύνολο κόστους" : "Συνολική χονδρική αξία / κόστος"} {money(report.costTotal)}</strong>{report.missingCost > 0 && ` · ${report.missingCost} είδη χωρίς κόστος`}</p>
      <p>Η λιανική υπολογίζεται με τις τρέχουσες τιμές του καταστήματος. Το κόστος προέρχεται από την τελευταία καταμέτρηση.</p>
      <button type="button" onClick={() => downloadReport(report)}>Λήψη αναφοράς CSV</button>
      <div style={{overflowX:"auto"}}>
        <table>
          <thead><tr><th>SKU</th><th>Είδος</th><th>Ποσότητα</th><th>Λιανική αξία</th><th>Κόστος</th></tr></thead>
          <tbody>{report.items.map(item => <tr key={item.id}>
            <td>{item.sku}</td><td>{item.name}</td><td>{item.quantity}</td>
            <td>{money(item.retailValue)}</td><td>{money(item.costValue)}</td>
          </tr>)}</tbody>
        </table>
      </div>
    </>}
  </section>;
}
