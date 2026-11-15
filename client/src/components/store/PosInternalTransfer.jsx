import React, { useEffect, useState } from "react";
import "./store-consumption-menu.css";

const money = new Intl.NumberFormat("el-GR", { style: "currency", currency: "EUR" });

export default function PosInternalTransfer({ api, storeId, scanCatalog, onClose, onDone }) {
  const path = `/api/store-pos/stores/${encodeURIComponent(storeId)}/internal-transfers`;
  const [selectedCredit, setSelectedCredit] = useState(null);
  const [bankReference, setBankReference] = useState("");
  const [cashReceipts, setCashReceipts] = useState([]);
  const [externalHistory, setExternalHistory] = useState([]);
  const [mailTransferId, setMailTransferId] = useState("");
  const [recipient, setRecipient] = useState("");
  const [notice, setNotice] = useState("");
  const [credit, setCredit] = useState([]);
  const [stores, setStores] = useState([]);
  const [destination, setDestination] = useState("");
  const [external, setExternal] = useState("");
  const [barcode, setBarcode] = useState("");
  const [items, setItems] = useState([]);
  const [quote, setQuote] = useState(null);
  const [pending, setPending] = useState(false);
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [error, setError] = useState("");
  const [idempotencyKey] = useState(() => crypto.randomUUID());

  useEffect(() => {
    let active = true;
    api(path + "/destinations").then(rows => {
      if (active) setStores(rows);
    }).catch(error => {
      if (active) setError(error.message);
    });
    api(path + "/credit").then(rows => {
      if (active) setCredit(rows);
    }).catch(error => {
      if (active) setError(error.message);
    });
    api(path + "/external-history").then(rows => {
      if (active) setExternalHistory(rows);
    }).catch(error => {
      if (active) setError(error.message);
    });
    api(path + "/pending-cash-receipts").then(rows => {
      if (active) setCashReceipts(rows);
    }).catch(error => {
      if (active) setError(error.message);
    });
    return () => { active = false; };
  }, [api, path]);

  function scan(event) {
    event.preventDefault();
    const product = scanCatalog.exact(barcode.trim(), { complete: true });
    if (!product) return setError("Δεν βρέθηκε προϊόν για αυτό το barcode.");
    const productId = product.productId || product.id;
    setItems(rows => rows.some(row => row.productId === productId)
      ? rows.map(row => row.productId === productId ? { ...row, quantity: row.quantity + 1 } : row)
      : [...rows, { productId, name: product.name, quantity: 1 }]);
    setBarcode("");
    setQuote(null);
    setError("");
  }

  async function submit(finalize) {
    setPending(true);
    setError("");
    if (finalize) setSubmitAttempted(true);
    try {
      const result = await api(path + (finalize ? "" : "/quote"), {
        method: "POST",
        body: JSON.stringify({
          ...(destination === "external" ? { externalDestinationName: external } : { destinationStoreId: destination }),
          items: items.map(({ productId, quantity }) => ({ productId, quantity })),
          idempotencyKey,
          ...(finalize && { expectedPayable: quote.payable }),
        }),
      });
      if (finalize) {
        onDone(result);
      } else {
        setQuote(result);
      }
    } catch (error) {
      setError(error.message);
      if (finalize && error.status >= 400 && error.status < 500) {
        setSubmitAttempted(false);
        setQuote(null);
      }
    } finally {
      setPending(false);
    }
  }

  async function settle(row, method) {
    setPending(true);
    setError("");
    setNotice("");
    try {
      const payment = await api(`${path}/${encodeURIComponent(row.id)}/${method}-settlement`, {
        method: "POST",
        body: JSON.stringify(method === "bank" ? { reference: bankReference.trim() } : {}),
      });
      setCredit(rows => rows.filter(item => item.id !== row.id));
      setSelectedCredit(null);
      setBankReference("");
      setNotice(`Καταχωρίστηκε εξόφληση ${money.format(payment.amount)}.`);
    } catch (error) {
      setError(error.message);
    } finally {
      setPending(false);
    }
  }

  async function receiveCash(row) {
    setPending(true);
    setError("");
    setNotice("");
    try {
      await api(`${path}/${encodeURIComponent(row.id)}/cash-receipt`, {
        method: "POST",
        body: "{}",
      });
      setCashReceipts(rows => rows.filter(item => item.id !== row.id));
      setNotice(`Καταχωρίστηκε είσπραξη ${money.format(row.amount)} στο ταμείο.`);
    } catch (error) {
      setError(error.message);
    } finally {
      setPending(false);
    }
  }

  async function sendTransferEmail(event) {
    event.preventDefault();
    if (pending || !mailTransferId) return;
    setPending(true);
    setError("");
    setNotice("");
    try {
      await api(`${path}/${encodeURIComponent(mailTransferId)}/email`, {
        method: "POST",
        body: JSON.stringify({ email: recipient.trim() }),
      });
      setNotice("Ο διακομιστής email δέχτηκε την αποστολή του PDF.");
      setMailTransferId("");
      setRecipient("");
    } catch (error) {
      setError(error.message);
    } finally {
      setPending(false);
    }
  }

  const locked = pending || submitAttempted;
  return <div className="store-consumption-overlay">
    <section className="store-consumption-menu" role="dialog" aria-modal="true" aria-label="Εσωτερική διακίνηση" style={{ maxHeight: "85vh", overflow: "auto" }}>
      <header>
        <h3>Εσωτερική διακίνηση</h3>
        <button type="button" disabled={pending} onClick={onClose}>Κλείσιμο</button>
      </header>
      <label>Προορισμός
        <select value={destination} disabled={locked} onChange={event => { setDestination(event.target.value); setQuote(null); }}>
          <option value="">Επίλεξε κατάστημα</option>
          {stores.map(store => <option key={store.id} value={store.id}>{store.name}</option>)}
          <option value="external">Εξωτερικό κατάστημα</option>
        </select>
      </label>
      {destination === "external" && <label>Όνομα καταστήματος
        <input value={external} maxLength={200} disabled={locked} onChange={event => { setExternal(event.target.value); setQuote(null); }}/>
      </label>}
      <form onSubmit={scan}>
        <label>Barcode <input autoFocus disabled={locked} value={barcode} onChange={event => setBarcode(event.target.value)}/></label>
        <button disabled={locked || !barcode.trim()}>Προσθήκη</button>
      </form>
      <ul>{items.map(row => {
        const priced = quote?.items.find(line => line.productId === row.productId);
        return <li key={row.productId}>
          {row.name} × {row.quantity}
          {priced && <> · {money.format(priced.unitCost)} ανά μονάδα · ΦΠΑ {money.format(priced.vat)}</>}
          <button type="button" disabled={locked} onClick={() => {
            setItems(rows => rows.filter(item => item.productId !== row.productId));
            setQuote(null);
          }}>Αφαίρεση</button>
        </li>;
      })}</ul>
      {notice && <p role="status">{notice}</p>}
      {error && <p role="alert">{error}</p>}
      {quote && <p>Καθαρή αξία {money.format(quote.net)} · ΦΠΑ {money.format(quote.vat)} · <strong>Πληρωτέο {money.format(quote.payable)}</strong></p>}
      <button type="button" disabled={locked || !items.length || !destination || (destination === "external" && !external.trim())} onClick={() => submit(false)}>Υπολογισμός αξίας</button>
      <button type="button" disabled={pending || !quote} onClick={() => submit(true)}>{submitAttempted ? "Επανάληψη καταχώρισης" : "Καταχώριση επί πιστώσει"}</button>
      <details>
        <summary>Ανεξόφλητες διακινήσεις ({credit.length})</summary>
        <ul>{credit.map(row => <li key={row.id}>
          {new Date(row.createdAt).toLocaleDateString("el-GR", { timeZone: "Europe/Athens" })}
          {" · "}{row.sourceName} → {row.destinationName} · {money.format(row.payable)}
          <button type="button" disabled={locked} onClick={() => {
            setSelectedCredit(row.id);
            setBankReference("");
          }}>Εξόφληση</button>
          {selectedCredit === row.id && <div>
            {row.canPayCash && <button type="button" disabled={locked} onClick={() => settle(row, "cash")}>Μετρητά</button>}
            <label>Αριθμός τραπεζικής συναλλαγής
              <input maxLength={200} value={bankReference} disabled={locked} onChange={event => setBankReference(event.target.value)}/>
            </label>
            <button type="button" disabled={locked || !bankReference.trim()} onClick={() => settle(row, "bank")}>Τραπεζική μεταφορά</button>
          </div>}
        </li>)}</ul>
      </details>
      {cashReceipts.length > 0 && <details>
        <summary>Εκκρεμείς εισπράξεις μετρητών ({cashReceipts.length})</summary>
        <ul>{cashReceipts.map(row => <li key={row.id}>
          {row.destinationName} · {money.format(row.amount)}
          <button type="button" disabled={locked} onClick={() => receiveCash(row)}>Καταχώριση είσπραξης</button>
        </li>)}</ul>
      </details>}
      <details>
        <summary>Διακινήσεις προς εξωτερικά καταστήματα</summary>
        <ul>{externalHistory.map(row => <li key={row.id}>
          {new Date(row.createdAt).toLocaleString("el-GR", { timeZone: "Europe/Athens" })} · {row.destinationName}
          <button type="button" disabled={locked} onClick={() => {
            setMailTransferId(row.id);
            setRecipient("");
          }}>Αποστολή PDF</button>
          {mailTransferId === row.id && <form onSubmit={sendTransferEmail}>
            <label>Email παραλήπτη <input type="email" required maxLength={254} value={recipient}
              disabled={pending} onChange={event => setRecipient(event.target.value)}/></label>
            <button disabled={pending}>Αποστολή στο email</button>
          </form>}
        </li>)}</ul>
      </details>
    </section>
  </div>;
}
