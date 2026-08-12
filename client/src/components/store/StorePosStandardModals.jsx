import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Camera,
  CreditCard,
  PauseCircle,
  Printer,
  Search,
  Trash2,
  UserRound,
  Wallet,
  X,
} from "lucide-react";
import "./store-pos-standard-modals.css";

const euro = (value) =>
  Number(value || 0).toLocaleString("el-GR", {
    style: "currency",
    currency: "EUR",
  });

const num = (value) => Number(String(value || "0").replace(",", ".")) || 0;

const fileToDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

function NumericPad({ value, onChange, allowDecimal = true, className = "" }) {
  const press = (key) => {
    const current = String(value ?? "");
    if (key === "⌫") return onChange(current.slice(0, -1));
    if (key === "C") return onChange("");
    if (key === ",") {
      if (!allowDecimal || current.includes(",") || current.includes(".")) return;
      return onChange(`${current || "0"},`);
    }
    onChange(`${current}${key}`.replace(/^0+(?=\d)/, ""));
  };

  return (
    <div className={`pos-inline-keypad ${className}`}>
      {[7, 8, 9, 4, 5, 6, 1, 2, 3, 0, allowDecimal ? "," : "C", "⌫"].map((key) => (
        <button key={key} type="button" onClick={() => press(String(key))}>
          {key}
        </button>
      ))}
      <button type="button" className="wide" onClick={() => press("C")}>
        ΚΑΘΑΡΙΣΜΟΣ
      </button>
    </div>
  );
}

export default function StorePosStandardModals({
  active,
  onClose,
  api,
  store,
  cart,
  total,
  customer,
  onCustomer,
  onRestore,
  onCartCleared,
  onChanged,
  onCheckout,
  setMessage,
  setError,
  onHoldCount,
}) {
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState([]);
  const [busy, setBusy] = useState(false);
  const [holds, setHolds] = useState([]);
  const [ledger, setLedger] = useState(null);
  const [modifierGroups, setModifierGroups] = useState([]);
  const [mixedCash, setMixedCash] = useState("0");
  const [note, setNote] = useState("");
  const [selectedLine, setSelectedLine] = useState("");
  const [selectedModifiers, setSelectedModifiers] = useState(new Set());
  const [capabilities, setCapabilities] = useState({ invoiceAi: false, invoicePhoto: true });
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraStream, setCameraStream] = useState(null);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [paymentForm, setPaymentForm] = useState({
    type: "OTHER_EXPENSE",
    amount: "",
    supplierId: "",
    description: "",
    subtractFromShift: true,
    file: null,
  });
  const [wasteSelectedId, setWasteSelectedId] = useState("");
  const [wasteQty, setWasteQty] = useState({});
  const [recentSales, setRecentSales] = useState([]);
  const [returnSale, setReturnSale] = useState(null);
  const [returnMode, setReturnMode] = useState("TRANSACTION");
  const [returnReason, setReturnReason] = useState("Επιστροφή από πελάτη");
  const [returnLines, setReturnLines] = useState({});

  const stopCamera = () => {
    cameraStream?.getTracks?.().forEach((track) => track.stop());
    setCameraStream(null);
    setCameraOpen(false);
  };

  useEffect(() => () => stopCamera(), [cameraStream]);

  useEffect(() => {
    setQuery("");
    setRows([]);
    setNote("");
    setSelectedModifiers(new Set());
    setSelectedLine(cart[0]?.id || "");

    if (active === "HOLDS") loadHolds();
    if (active === "PAYMENTS") {
      loadLedger();
      loadCapabilities();
    }
    if (active === "PREP") loadModifiers();
    if (active === "MIXED") setMixedCash("0");
    if (active === "WASTE") {
      setWasteSelectedId(cart[0]?.id || "");
      setWasteQty(Object.fromEntries(cart.map((item) => [item.id, String(item.quantity || 1)])));
    }
    if (active === "RETURN") loadRecentSales();
  }, [active]);

  const close = () => {
    if (!busy) {
      stopCamera();
      onClose();
    }
  };

  const searchCustomer = async () => {
    if (query.trim().length < 2) return;
    setBusy(true);
    try {
      const result = await api(
        `/api/store-pos/stores/${store.id}/customers?q=${encodeURIComponent(query.trim())}`,
      );
      setRows(result.items || []);
    } catch (error) {
      setError(error.message);
    } finally {
      setBusy(false);
    }
  };

  const loadHolds = async () => {
    try {
      const result = await api(`/api/store-pos/stores/${store.id}/holds`);
      setHolds(result.rows || []);
      onHoldCount?.((result.rows || []).length);
    } catch (error) {
      setError(error.message);
    }
  };

  const holdCurrent = async () => {
    if (!cart.length) return;
    setBusy(true);
    try {
      await api(`/api/store-pos/stores/${store.id}/holds`, {
        method: "POST",
        body: JSON.stringify({
          customerId: customer?.id || null,
          items: cart.map((item) => ({ productId: item.id, quantity: item.quantity })),
        }),
      });
      onCartCleared();
      setMessage("Η συναλλαγή μπήκε σε Αναμονή.");
      await loadHolds();
    } catch (error) {
      setError(error.message);
    } finally {
      setBusy(false);
    }
  };

  const restore = async (id) => {
    setBusy(true);
    try {
      const result = await api(`/api/store-pos/stores/${store.id}/holds/${id}/restore`, {
        method: "POST",
      });
      onRestore(result);
      setMessage("Η συναλλαγή επανήλθε από την Αναμονή.");
      await loadHolds();
      onClose();
    } catch (error) {
      setError(error.message);
    } finally {
      setBusy(false);
    }
  };

  const loadLedger = async () => {
    try {
      setLedger(await api(`/api/transactions/stores/${store.id}/overview`));
    } catch (error) {
      setError(error.message);
    }
  };

  const loadCapabilities = async () => {
    try {
      setCapabilities(await api(`/api/store-pos/stores/${store.id}/capabilities`));
    } catch {
      setCapabilities({ invoiceAi: false, invoicePhoto: true });
    }
  };

  const startCamera = async () => {
    try {
      stopCamera();
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
      setCameraStream(stream);
      setCameraOpen(true);
      setTimeout(() => {
        if (videoRef.current) videoRef.current.srcObject = stream;
      }, 0);
    } catch (error) {
      setError("Δεν μπόρεσε να ανοίξει η κάμερα. Έλεγξε την άδεια κάμερας του browser.");
    }
  };

  const captureCamera = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => {
      if (!blob) return;
      const file = new File([blob], `timologio-${Date.now()}.jpg`, { type: "image/jpeg" });
      setPaymentForm((current) => ({ ...current, file }));
      stopCamera();
    }, "image/jpeg", 0.9);
  };

  const submitPayment = async () => {
    const amount = num(paymentForm.amount);
    if (amount <= 0) return setError("Βάλε ποσό πληρωμής.");
    if (!paymentForm.file) return setError("Βγάλε ή επίλεξε φωτογραφία παραστατικού.");

    setBusy(true);
    try {
      const dataUrl = await fileToDataUrl(paymentForm.file);
      await api(`/api/transactions/stores/${store.id}`, {
        method: "POST",
        body: JSON.stringify({
          type: paymentForm.type,
          amount,
          description: paymentForm.description || null,
          supplierId: paymentForm.type === "SUPPLIER_PAYMENT" ? paymentForm.supplierId || null : null,
          subtractFromShift: Boolean(paymentForm.subtractFromShift),
          attachment: { dataUrl, filename: paymentForm.file.name || "parastatiko.jpg" },
        }),
      });
      setMessage(`Η πληρωμή ${euro(amount)} καταχωρίστηκε στη βάρδια και στο BackOffice.`);
      onChanged?.();
      onClose();
    } catch (error) {
      setError(error.message);
    } finally {
      setBusy(false);
    }
  };

  const runInvoiceAi = () => {
    if (!capabilities.invoiceAi) return;
    if (!paymentForm.file) return setError("Βγάλε πρώτα φωτογραφία του τιμολογίου.");
    setMessage("Το module OCR + AI είναι ενεργό και το παραστατικό είναι έτοιμο για ανάγνωση. Η αυτόματη εξαγωγή στοιχείων θα συνδεθεί με τον Invoice Reader connector.");
  };

  const loadModifiers = async () => {
    try {
      const result = await api(`/api/store-pos/stores/${store.id}/modifiers`);
      setModifierGroups(result.groups || []);
    } catch (error) {
      setError(error.message);
    }
  };

  const prep = async () => {
    const line = cart.find((item) => item.id === selectedLine) || cart[0];
    if (!line) return;
    const allModifiers = modifierGroups.flatMap((group) => group.items || []);
    const modifiers = allModifiers.filter((modifier) => selectedModifiers.has(modifier.id));
    setBusy(true);
    try {
      await api(`/api/store-pos/stores/${store.id}/preparation`, {
        method: "POST",
        body: JSON.stringify({
          items: [{ productId: line.id, quantity: line.quantity, modifiers: modifiers.map((modifier) => ({ id: modifier.id, description: modifier.description, price: modifier.price })) }],
          note: note || null,
        }),
      });
      setMessage(`Το «${line.name}» μπήκε στην ουρά Παρασκευής με ${modifiers.length} modifiers.`);
      onClose();
    } catch (error) {
      setError(error.message);
    } finally {
      setBusy(false);
    }
  };

  const wasteItems = useMemo(
    () => cart.map((item) => ({ ...item, wasteQuantity: Math.max(0, num(wasteQty[item.id])) })).filter((item) => item.wasteQuantity > 0),
    [cart, wasteQty],
  );
  const wasteTotal = useMemo(
    () => wasteItems.reduce((sum, item) => sum + Number(item.salePrice || 0) * item.wasteQuantity, 0),
    [wasteItems],
  );

  const waste = async () => {
    if (!wasteItems.length) return setError("Βάλε ποσότητα φύρας.");
    setBusy(true);
    try {
      const result = await api(`/api/store-pos/stores/${store.id}/waste`, {
        method: "POST",
        body: JSON.stringify({
          items: wasteItems.map((item) => ({ productId: item.id, quantity: item.wasteQuantity })),
          note: note || null,
        }),
      });
      onCartCleared();
      setMessage(`Η Φύρα ${euro(result.total)} καταχωρίστηκε ως NON_FISCAL χωρίς απόδειξη και αφαιρέθηκε από stock.`);
      onChanged?.();
      onClose();
    } catch (error) {
      setError(error.message);
    } finally {
      setBusy(false);
    }
  };

  const mixedCard = useMemo(() => Math.max(0, Number((total - num(mixedCash)).toFixed(2))), [total, mixedCash]);
  const doMixed = () => {
    const cash = num(mixedCash);
    if (cash < 0 || cash > total) return setError("Το ποσό μετρητών δεν είναι έγκυρο.");
    onCheckout("MIXED", [
      { method: "CASH", amount: cash },
      { method: "CARD", amount: mixedCard },
    ]);
    onClose();
  };

  const loadRecentSales = async () => {
    setBusy(true);
    try {
      const result = await api(`/api/store-pos/stores/${store.id}/sales/recent`);
      const items = (result.rows || []).filter((sale) => !sale.reversalState);
      setRecentSales(items);
      setReturnSale(items[0] || null);
      setReturnLines({});
    } catch (error) {
      setError(error.message);
    } finally {
      setBusy(false);
    }
  };

  const toggleReturnLine = (line) => {
    setReturnLines((current) => {
      const next = { ...current };
      if (next[line.id]) delete next[line.id];
      else next[line.id] = String(Math.min(1, Number(line.quantity || 1)));
      return next;
    });
  };

  const submitReturn = async () => {
    if (!returnSale) return setError("Επίλεξε συναλλαγή.");
    setBusy(true);
    try {
      if (returnMode === "TRANSACTION") {
        const result = await api(`/api/store-pos/stores/${store.id}/sales/${returnSale.id}/reverse`, {
          method: "POST",
          body: JSON.stringify({ kind: "RETURN", reason: returnReason }),
        });
        setMessage(`Καταχωρίστηκε αρνητική επιστροφή ${euro(-Math.abs(Number(result.total ?? returnSale.total ?? 0)))} και τα προϊόντα επέστρεψαν στην αποθήκη.`);
      } else {
        const items = Object.entries(returnLines)
          .map(([lineId, quantity]) => ({ lineId, quantity: num(quantity) }))
          .filter((item) => item.quantity > 0);
        if (!items.length) {
          setBusy(false);
          return setError("Επίλεξε τουλάχιστον ένα προϊόν για επιστροφή.");
        }
        const result = await api(`/api/store-pos/stores/${store.id}/sales/${returnSale.id}/return-items`, {
          method: "POST",
          body: JSON.stringify({ items, reason: returnReason }),
        });
        setMessage(`Καταχωρίστηκε αρνητική επιστροφή ${euro(-Math.abs(Number(result.total || 0)))} και το stock επανήλθε.`);
      }
      onChanged?.();
      onClose();
    } catch (error) {
      setError(error.message);
    } finally {
      setBusy(false);
    }
  };

  if (!active) return null;

  const title = {
    CUSTOMER: "Πελάτης",
    HOLDS: "Αναμονή συναλλαγής",
    PAYMENTS: "Πληρωμές",
    PREP: "Παρασκευή / Modifiers",
    WASTE: "Φύρα / Κατανάλωση προσωπικού",
    MIXED: "Μικτή πληρωμή",
    RETURN: "Επιστροφή",
  }[active] || "POS";
  const suppliers = ledger?.suppliers || [];
  const selectedWaste = cart.find((item) => item.id === wasteSelectedId) || cart[0];

  return (
    <div className="pos-standard-modal" onMouseDown={(event) => event.target === event.currentTarget && close()}>
      <section>
        <header>
          <div><small>MYWORKSTATION STANDARD POS</small><h2>{title}</h2></div>
          <button onClick={close}><X /></button>
        </header>
        <main>
          {active === "CUSTOMER" && <>
            <div className="pos-modal-search"><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => event.key === "Enter" && searchCustomer()} placeholder="Όνομα, ΑΦΜ, τηλέφωνο ή κάρτα"/><button onClick={searchCustomer}><Search /> Αναζήτηση</button></div>
            <button className="pos-retail-customer" onClick={() => { onCustomer(null); onClose(); }}><UserRound /> <b>Πελάτης λιανικής</b></button>
            <div className="pos-customer-results">{rows.map((row) => <button key={row.id} onClick={() => { onCustomer(row); onClose(); }}><b>{row.name}</b><span>Έκπτωση {Number(row.discountPercent || 0)}%</span><span>Υπόλοιπο {euro(row.balance)}</span><span>Πίστωση {euro(row.creditLimit)}</span></button>)}</div>
          </>}

          {active === "HOLDS" && <>
            <button className="pos-primary-action" disabled={!cart.length || busy} onClick={holdCurrent}><PauseCircle /> Βάλε την τρέχουσα συναλλαγή σε Αναμονή</button>
            <div className="pos-hold-count"><b>{holds.length}</b><span>συναλλαγές σε αναμονή</span></div>
            <div className="pos-hold-list">{holds.length ? holds.map((hold, index) => <article key={hold.id}><div><b>Αναμονή {index + 1} · {euro(hold.total)}</b><span>{hold.customerName || "Πελάτης λιανικής"}</span><small>{new Date(hold.heldAt).toLocaleString("el-GR")}</small></div><button onClick={() => restore(hold.id)}>Επαναφορά</button></article>) : <p>Δεν υπάρχουν συναλλαγές σε αναμονή.</p>}</div>
          </>}

          {active === "PAYMENTS" && <div className="pos-payment-form">
            <div className="pos-payment-types"><button className={paymentForm.type === "OTHER_EXPENSE" ? "active" : ""} onClick={() => setPaymentForm((current) => ({ ...current, type: "OTHER_EXPENSE" }))}>Λοιπά έξοδα</button><button className={paymentForm.type === "SUPPLIER_PAYMENT" ? "active" : ""} onClick={() => setPaymentForm((current) => ({ ...current, type: "SUPPLIER_PAYMENT" }))}>Πληρωμή προμηθευτή</button></div>
            {paymentForm.type === "SUPPLIER_PAYMENT" && <label>Προμηθευτής<select value={paymentForm.supplierId} onChange={(event) => setPaymentForm((current) => ({ ...current, supplierId: event.target.value }))}><option value="">Επίλεξε</option>{suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select></label>}
            <label>Ποσό<input readOnly inputMode="decimal" value={paymentForm.amount} /></label>
            <NumericPad value={paymentForm.amount} onChange={(amount) => setPaymentForm((current) => ({ ...current, amount }))} />
            <label>Παρατηρήσεις<input value={paymentForm.description} onChange={(event) => setPaymentForm((current) => ({ ...current, description: event.target.value }))}/></label>
            <div className="pos-photo-actions"><button type="button" onClick={startCamera}><Camera /> Λήψη από κάμερα</button><label><Camera /> Επιλογή αρχείου<input type="file" accept="image/*" onChange={(event) => setPaymentForm((current) => ({ ...current, file: event.target.files?.[0] || null }))}/></label><b>{paymentForm.file?.name || "Δεν επιλέχθηκε φωτογραφία"}</b></div>
            {cameraOpen && <div className="pos-camera-live"><video ref={videoRef} autoPlay playsInline/><canvas ref={canvasRef} hidden/><div><button type="button" onClick={captureCamera}><Camera /> Φωτογράφιση</button><button type="button" onClick={stopCamera}>Κλείσιμο κάμερας</button></div></div>}
            {capabilities.invoiceAi ? <button className="pos-ai-reader" type="button" disabled={!paymentForm.file} onClick={runInvoiceAi}>OCR + AI Επανέλεγχος παραστατικού</button> : <small className="pos-module-note">OCR + AI εμφανίζεται μόνο σε κατάστημα με ενεργό και πληρωμένο AI Reader module.</small>}
            <label className="pos-check"><input type="checkbox" checked={paymentForm.subtractFromShift} onChange={(event) => setPaymentForm((current) => ({ ...current, subtractFromShift: event.target.checked }))}/>Αφαίρεση από τα μετρητά της βάρδιας</label>
            <button className="pos-primary-action" disabled={busy} onClick={submitPayment}><Wallet /> Καταχώριση πληρωμής</button>
          </div>}

          {active === "PREP" && <>
            <div className="pos-prep-lines">{cart.map((item) => <button className={selectedLine === item.id ? "active" : ""} key={item.id} onClick={() => setSelectedLine(item.id)}>{item.quantity} × {item.name}</button>)}</div>
            <div className="pos-modifier-groups">{modifierGroups.length ? modifierGroups.map((group) => <section key={group.id}><h3>{group.description}</h3><div>{(group.items || []).map((modifier) => <button className={selectedModifiers.has(modifier.id) ? "selected" : ""} key={modifier.id} onClick={() => setSelectedModifiers((current) => { const next = new Set(current); next.has(modifier.id) ? next.delete(modifier.id) : next.add(modifier.id); return next; })}>{modifier.description}{Number(modifier.price || 0) !== 0 && <small>{modifier.price > 0 ? "+" : ""}{euro(modifier.price)}</small>}</button>)}</div></section>) : <p>Δεν έχουν δημιουργηθεί ακόμη modifiers στο BackOffice.</p>}</div>
            <label>Σημείωση παρασκευής<input value={note} onChange={(event) => setNote(event.target.value)} placeholder="π.χ. πολύ πάγο"/></label>
            <button className="pos-primary-action" disabled={!cart.length || busy} onClick={prep}><Printer /> Αποστολή στην Παρασκευή</button>
          </>}

          {active === "WASTE" && <>
            <div className="pos-waste-summary">{cart.map((item) => <button type="button" key={item.id} className={wasteSelectedId === item.id ? "selected" : ""} onClick={() => setWasteSelectedId(item.id)}><b>{item.name}</b><span>{wasteQty[item.id] || "0"} × {euro(item.salePrice)}</span></button>)}</div>
            {selectedWaste && <div className="pos-waste-qty"><b>Ποσότητα φύρας: {selectedWaste.name}</b><input readOnly value={wasteQty[selectedWaste.id] || ""}/><NumericPad allowDecimal={false} value={wasteQty[selectedWaste.id] || ""} onChange={(value) => setWasteQty((current) => ({ ...current, [selectedWaste.id]: value }))}/></div>}
            <label>Αιτία / σημείωση<input value={note} onChange={(event) => setNote(event.target.value)} placeholder="Φύρα / κατανάλωση προσωπικού"/></label>
            <div className="pos-warning">Δεν εκδίδεται απόδειξη. Καταγράφεται NON_FISCAL, ως μετρητά, με κανονική αφαίρεση stock.</div>
            <button className="pos-danger-action" disabled={!wasteItems.length || busy} onClick={waste}><Trash2 /> Καταχώριση Φύρας {euro(wasteTotal)}</button>
          </>}

          {active === "MIXED" && <div className="pos-mixed-payment"><strong>{euro(total)}</strong><label>Μετρητά<input readOnly value={mixedCash}/></label><div><span>Κάρτα</span><b>{euro(mixedCard)}</b></div><NumericPad value={mixedCash} onChange={setMixedCash}/><button className="pos-primary-action" disabled={!cart.length || busy} onClick={doMixed}><CreditCard /> Αποστολή υπολοίπου στην κάρτα</button></div>}

          {active === "RETURN" && <div className="pos-return-flow">
            <div className="pos-return-sales"><h3>Πρόσφατες συναλλαγές</h3>{recentSales.length ? recentSales.map((sale) => <button key={sale.id} className={returnSale?.id === sale.id ? "active" : ""} onClick={() => { setReturnSale(sale); setReturnLines({}); }}><b>{euro(sale.total)}</b><span>{sale.paymentMethod || sale.paymentSummary || "Πληρωμή"}</span><small>{sale.occurredAt ? new Date(sale.occurredAt).toLocaleString("el-GR") : sale.id}</small></button>) : <p>Δεν βρέθηκαν πρόσφατες συναλλαγές.</p>}</div>
            <div className="pos-return-details">{returnSale ? <><div className="pos-return-modes"><button className={returnMode === "TRANSACTION" ? "active" : ""} onClick={() => setReturnMode("TRANSACTION")}>Ολόκληρη συναλλαγή</button><button className={returnMode === "ITEMS" ? "active" : ""} onClick={() => setReturnMode("ITEMS")}>Συγκεκριμένα προϊόντα</button></div><div className="pos-negative-total">ΑΡΝΗΤΙΚΗ ΠΛΗΡΩΜΗ: <b>{euro(-Math.abs(Number(returnSale.total || 0)))}</b></div>{returnMode === "ITEMS" && <div className="pos-return-lines">{(returnSale.lines || returnSale.items || []).map((line) => <label key={line.id}><input type="checkbox" checked={Boolean(returnLines[line.id])} onChange={() => toggleReturnLine(line)}/><span><b>{line.description || line.name}</b><small>{euro(line.unitPrice)} × {line.quantity}</small></span>{returnLines[line.id] && <input inputMode="numeric" value={returnLines[line.id]} onChange={(event) => setReturnLines((current) => ({ ...current, [line.id]: event.target.value }))}/>}</label>)}</div>}<label>Αιτιολογία<select value={returnReason} onChange={(event) => setReturnReason(event.target.value)}><option>Επιστροφή από πελάτη</option><option>Λάθος από χειριστή</option><option>Δοκιμή</option><option>Άλλη αιτία</option></select></label><button className="pos-danger-action" disabled={busy} onClick={submitReturn}>Καταχώριση αρνητικής επιστροφής & επαναφορά stock</button></> : <p>Επίλεξε συναλλαγή.</p>}</div>
          </div>}
        </main>
      </section>
    </div>
  );
}
