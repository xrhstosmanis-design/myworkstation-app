import React, { useEffect, useMemo, useState } from "react";
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
  const [paymentForm, setPaymentForm] = useState({
    type: "OTHER_EXPENSE",
    amount: "",
    supplierId: "",
    description: "",
    subtractFromShift: true,
    file: null,
  });

  useEffect(() => {
    setQuery("");
    setRows([]);
    setNote("");
    setSelectedModifiers(new Set());
    setSelectedLine(cart[0]?.id || "");

    if (active === "HOLDS") loadHolds();
    if (active === "PAYMENTS") loadLedger();
    if (active === "PREP") loadModifiers();
    if (active === "MIXED") setMixedCash("0");
  }, [active]);

  const close = () => {
    if (!busy) onClose();
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
          items: cart.map((item) => ({
            productId: item.id,
            quantity: item.quantity,
          })),
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
      onClose();
    } catch (error) {
      setError(error.message);
    } finally {
      setBusy(false);
    }
  };

  const loadLedger = async () => {
    try {
      const result = await api(`/api/transactions/stores/${store.id}/overview`);
      setLedger(result);
    } catch (error) {
      setError(error.message);
    }
  };

  const submitPayment = async () => {
    const amount = num(paymentForm.amount);
    if (amount <= 0) {
      setError("Βάλε ποσό πληρωμής.");
      return;
    }
    if (!paymentForm.file) {
      setError("Βγάλε ή επίλεξε φωτογραφία παραστατικού.");
      return;
    }

    setBusy(true);
    try {
      const dataUrl = await fileToDataUrl(paymentForm.file);
      await api(`/api/transactions/stores/${store.id}`, {
        method: "POST",
        body: JSON.stringify({
          type: paymentForm.type,
          amount,
          description: paymentForm.description || null,
          supplierId:
            paymentForm.type === "SUPPLIER_PAYMENT"
              ? paymentForm.supplierId || null
              : null,
          subtractFromShift: Boolean(paymentForm.subtractFromShift),
          attachment: {
            dataUrl,
            filename: paymentForm.file.name || "parastatiko.jpg",
          },
        }),
      });
      setMessage("Η πληρωμή καταχωρίστηκε στη βάρδια και στο BackOffice.");
      onChanged?.();
      onClose();
    } catch (error) {
      setError(error.message);
    } finally {
      setBusy(false);
    }
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
    const modifiers = allModifiers.filter((modifier) =>
      selectedModifiers.has(modifier.id),
    );

    setBusy(true);
    try {
      await api(`/api/store-pos/stores/${store.id}/preparation`, {
        method: "POST",
        body: JSON.stringify({
          items: [
            {
              productId: line.id,
              quantity: line.quantity,
              modifiers: modifiers.map((modifier) => ({
                id: modifier.id,
                description: modifier.description,
                price: modifier.price,
              })),
            },
          ],
          note: note || null,
        }),
      });
      setMessage(
        `Το «${line.name}» μπήκε στην ουρά Παρασκευής με ${modifiers.length} modifiers.`,
      );
      onClose();
    } catch (error) {
      setError(error.message);
    } finally {
      setBusy(false);
    }
  };

  const waste = async () => {
    if (!cart.length) return;
    setBusy(true);
    try {
      const result = await api(`/api/store-pos/stores/${store.id}/waste`, {
        method: "POST",
        body: JSON.stringify({
          items: cart.map((item) => ({
            productId: item.id,
            quantity: item.quantity,
          })),
          note: note || null,
        }),
      });
      onCartCleared();
      setMessage(
        `Η Φύρα ${euro(result.total)} καταχωρίστηκε ως NON_FISCAL χωρίς απόδειξη και αφαιρέθηκε από stock.`,
      );
      onChanged?.();
      onClose();
    } catch (error) {
      setError(error.message);
    } finally {
      setBusy(false);
    }
  };

  const mixedCard = useMemo(
    () => Math.max(0, Number((total - num(mixedCash)).toFixed(2))),
    [total, mixedCash],
  );

  const doMixed = () => {
    const cash = num(mixedCash);
    if (cash < 0 || cash > total) {
      setError("Το ποσό μετρητών δεν είναι έγκυρο.");
      return;
    }
    onCheckout("MIXED", [
      { method: "CASH", amount: cash },
      { method: "CARD", amount: mixedCard },
    ]);
    onClose();
  };

  if (!active) return null;

  const title = {
    CUSTOMER: "Πελάτης",
    HOLDS: "Αναμονή συναλλαγής",
    PAYMENTS: "Πληρωμές",
    PREP: "Παρασκευή / Modifiers",
    WASTE: "Φύρα / Κατανάλωση προσωπικού",
    MIXED: "Μικτή πληρωμή",
  }[active] || "POS";

  const suppliers = ledger?.suppliers || [];

  return (
    <div
      className="pos-standard-modal"
      onMouseDown={(event) => event.target === event.currentTarget && close()}
    >
      <section>
        <header>
          <div>
            <small>MYWORKSTATION STANDARD POS</small>
            <h2>{title}</h2>
          </div>
          <button onClick={close}>
            <X />
          </button>
        </header>

        <main>
          {active === "CUSTOMER" && (
            <>
              <div className="pos-modal-search">
                <input
                  autoFocus
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  onKeyDown={(event) => event.key === "Enter" && searchCustomer()}
                  placeholder="Όνομα, ΑΦΜ, τηλέφωνο ή κάρτα"
                />
                <button onClick={searchCustomer}>
                  <Search /> Αναζήτηση
                </button>
              </div>
              <button
                className="pos-retail-customer"
                onClick={() => {
                  onCustomer(null);
                  onClose();
                }}
              >
                <UserRound /> <b>Πελάτης λιανικής</b>
              </button>
              <div className="pos-customer-results">
                {rows.map((row) => (
                  <button
                    key={row.id}
                    onClick={() => {
                      onCustomer(row);
                      onClose();
                    }}
                  >
                    <b>{row.name}</b>
                    <span>Έκπτωση {Number(row.discountPercent || 0)}%</span>
                    <span>Υπόλοιπο {euro(row.balance)}</span>
                    <span>Πίστωση {euro(row.creditLimit)}</span>
                  </button>
                ))}
              </div>
            </>
          )}

          {active === "HOLDS" && (
            <>
              <button
                className="pos-primary-action"
                disabled={!cart.length || busy}
                onClick={holdCurrent}
              >
                <PauseCircle /> Βάλε την τρέχουσα συναλλαγή σε Αναμονή
              </button>
              <div className="pos-hold-list">
                {holds.length ? (
                  holds.map((hold) => (
                    <article key={hold.id}>
                      <div>
                        <b>{euro(hold.total)}</b>
                        <span>{hold.customerName || "Πελάτης λιανικής"}</span>
                        <small>{new Date(hold.heldAt).toLocaleString("el-GR")}</small>
                      </div>
                      <button onClick={() => restore(hold.id)}>Επαναφορά</button>
                    </article>
                  ))
                ) : (
                  <p>Δεν υπάρχουν συναλλαγές σε αναμονή.</p>
                )}
              </div>
            </>
          )}

          {active === "PAYMENTS" && (
            <div className="pos-payment-form">
              <div className="pos-payment-types">
                <button
                  className={paymentForm.type === "OTHER_EXPENSE" ? "active" : ""}
                  onClick={() =>
                    setPaymentForm((current) => ({
                      ...current,
                      type: "OTHER_EXPENSE",
                    }))
                  }
                >
                  Λοιπά έξοδα
                </button>
                <button
                  className={
                    paymentForm.type === "SUPPLIER_PAYMENT" ? "active" : ""
                  }
                  onClick={() =>
                    setPaymentForm((current) => ({
                      ...current,
                      type: "SUPPLIER_PAYMENT",
                    }))
                  }
                >
                  Πληρωμή προμηθευτή
                </button>
              </div>

              {paymentForm.type === "SUPPLIER_PAYMENT" && (
                <label>
                  Προμηθευτής
                  <select
                    value={paymentForm.supplierId}
                    onChange={(event) =>
                      setPaymentForm((current) => ({
                        ...current,
                        supplierId: event.target.value,
                      }))
                    }
                  >
                    <option value="">Επίλεξε</option>
                    {suppliers.map((supplier) => (
                      <option key={supplier.id} value={supplier.id}>
                        {supplier.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              <label>
                Ποσό
                <input
                  inputMode="decimal"
                  value={paymentForm.amount}
                  onChange={(event) =>
                    setPaymentForm((current) => ({
                      ...current,
                      amount: event.target.value,
                    }))
                  }
                />
              </label>

              <label>
                Παρατηρήσεις
                <input
                  value={paymentForm.description}
                  onChange={(event) =>
                    setPaymentForm((current) => ({
                      ...current,
                      description: event.target.value,
                    }))
                  }
                />
              </label>

              <label className="pos-photo-input">
                <Camera /> Φωτογραφία παραστατικού
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={(event) =>
                    setPaymentForm((current) => ({
                      ...current,
                      file: event.target.files?.[0] || null,
                    }))
                  }
                />
                <b>{paymentForm.file?.name || "Δεν επιλέχθηκε"}</b>
              </label>

              <label className="pos-check">
                <input
                  type="checkbox"
                  checked={paymentForm.subtractFromShift}
                  onChange={(event) =>
                    setPaymentForm((current) => ({
                      ...current,
                      subtractFromShift: event.target.checked,
                    }))
                  }
                />
                Αφαίρεση από τα μετρητά της βάρδιας
              </label>

              <button
                className="pos-primary-action"
                disabled={busy}
                onClick={submitPayment}
              >
                <Wallet /> Καταχώριση πληρωμής
              </button>
            </div>
          )}

          {active === "PREP" && (
            <>
              <div className="pos-prep-lines">
                {cart.map((item) => (
                  <button
                    className={selectedLine === item.id ? "active" : ""}
                    key={item.id}
                    onClick={() => setSelectedLine(item.id)}
                  >
                    {item.quantity} × {item.name}
                  </button>
                ))}
              </div>

              <div className="pos-modifier-groups">
                {modifierGroups.length ? (
                  modifierGroups.map((group) => (
                    <section key={group.id}>
                      <h3>{group.description}</h3>
                      <div>
                        {(group.items || []).map((modifier) => (
                          <button
                            className={
                              selectedModifiers.has(modifier.id) ? "selected" : ""
                            }
                            key={modifier.id}
                            onClick={() =>
                              setSelectedModifiers((current) => {
                                const next = new Set(current);
                                if (next.has(modifier.id)) next.delete(modifier.id);
                                else next.add(modifier.id);
                                return next;
                              })
                            }
                          >
                            {modifier.description}
                            {Number(modifier.price || 0) !== 0 && (
                              <small>
                                {modifier.price > 0 ? "+" : ""}
                                {euro(modifier.price)}
                              </small>
                            )}
                          </button>
                        ))}
                      </div>
                    </section>
                  ))
                ) : (
                  <p>Δεν έχουν δημιουργηθεί ακόμη modifiers στο BackOffice.</p>
                )}
              </div>

              <label>
                Σημείωση παρασκευής
                <input
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  placeholder="π.χ. πολύ πάγο"
                />
              </label>

              <button
                className="pos-primary-action"
                disabled={!cart.length || busy}
                onClick={prep}
              >
                <Printer /> Αποστολή στην Παρασκευή
              </button>
            </>
          )}

          {active === "WASTE" && (
            <>
              <div className="pos-waste-summary">
                {cart.map((item) => (
                  <div key={item.id}>
                    <b>
                      {item.quantity} × {item.name}
                    </b>
                    <span>{euro(item.salePrice * item.quantity)}</span>
                  </div>
                ))}
              </div>

              <label>
                Αιτία / σημείωση
                <input
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  placeholder="Φύρα / κατανάλωση προσωπικού"
                />
              </label>

              <div className="pos-warning">
                Δεν εκδίδεται απόδειξη. Καταγράφεται NON_FISCAL, ως μετρητά, με
                κανονική αφαίρεση stock.
              </div>

              <button
                className="pos-danger-action"
                disabled={!cart.length || busy}
                onClick={waste}
              >
                <Trash2 /> Καταχώριση Φύρας {euro(total)}
              </button>
            </>
          )}

          {active === "MIXED" && (
            <div className="pos-mixed-payment">
              <strong>{euro(total)}</strong>
              <label>
                Μετρητά
                <input
                  autoFocus
                  inputMode="decimal"
                  value={mixedCash}
                  onChange={(event) => setMixedCash(event.target.value)}
                />
              </label>
              <div>
                <span>Κάρτα</span>
                <b>{euro(mixedCard)}</b>
              </div>
              <button
                className="pos-primary-action"
                disabled={!cart.length || busy}
                onClick={doMixed}
              >
                <CreditCard /> Αποστολή υπολοίπου στην κάρτα
              </button>
            </div>
          )}
        </main>
      </section>
    </div>
  );
}
