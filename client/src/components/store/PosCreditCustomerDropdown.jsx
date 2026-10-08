import React, {useEffect, useRef, useState} from "react";
import "./pos-credit-customer.css";

const euro = value => Number(value || 0).toLocaleString("el-GR", {style:"currency", currency:"EUR"});

export default function PosCreditCustomerDropdown({api, storeId, label="Πελάτης", customer, cardOnly=false, disabled=false, onSelect}) {
  const [open, setOpen] = useState(false), [query, setQuery] = useState("");
  const [rows, setRows] = useState([]), [loading, setLoading] = useState(false), [selecting, setSelecting] = useState(false), [error, setError] = useState("");
  const [placement,setPlacement]=useState({});
  const host = useRef(null);
  useEffect(() => {setOpen(false); setRows([]); setQuery(""); setError("");}, [storeId]);
  useEffect(() => {if (disabled) setOpen(false);}, [disabled]);
  useEffect(() => {
    if (!open) return;
    const fit=()=>{const rect=host.current?.getBoundingClientRect();if(rect)setPlacement({left:Math.min(0,window.innerWidth-18-rect.left-Math.min(440,window.innerWidth-36)),maxHeight:Math.max(60,Math.min(420,window.innerHeight-rect.bottom-22))})};
    fit();window.addEventListener("resize",fit);
    const outside = event => {if (!host.current?.contains(event.target)) setOpen(false);};
    const escape = event => {if (event.key === "Escape") setOpen(false);};
    document.addEventListener("pointerdown", outside); document.addEventListener("keydown", escape);
    return () => {document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", escape);window.removeEventListener("resize",fit);};
  }, [open]);
  useEffect(() => {
    let active = true;
    setRows([]); setError("");
    if (!open || (query.trim().length > 0 && query.trim().length < 2) || (cardOnly && query.trim().length < 2)) {setLoading(false); return;}
    setLoading(true);
    const timer = setTimeout(() => {
      api(`/api/store-pos/stores/${encodeURIComponent(storeId)}/customers?creditOnly=1&q=${encodeURIComponent(query.trim())}`)
        .then(result => {if (active) {setRows(result.items || []); setLoading(false);}})
        .catch(err => {if (active) {setError(err.message); setLoading(false);}});
    }, query ? 180 : 0);
    return () => {active = false; clearTimeout(timer);};
  }, [api, storeId, open, query, cardOnly]);
  const select = async row => {
    if (selecting || disabled) return;
    setSelecting(true); setError("");
    try {await onSelect(row); setOpen(false);} catch (err) {setError(err.message);} finally {setSelecting(false);}
  };
  return <div className="pos-credit-customer" ref={host}>
    <button type="button" disabled={disabled || selecting} aria-haspopup="dialog" aria-expanded={open} onClick={() => {setQuery(""); setOpen(value => !value);}}>{label}{customer ? ` — ${customer.name}` : ""} ▾</button>
    {open && <section className="pos-credit-customer-popdown" style={placement} role="dialog" aria-label="Πελάτες πίστωσης">
      <header><b>Πελάτες πίστωσης</b><button type="button" aria-label="Κλείσιμο επιλογής πελάτη" onClick={() => setOpen(false)}>×</button></header>
      {cardOnly && <p>Ο χειριστής επιλέγει πελάτη μόνο με αριθμό κάρτας.</p>}
      <input autoFocus aria-label="Αναζήτηση πελάτη πίστωσης" maxLength={160} placeholder={cardOnly ? "Σκάναρε ή γράψε αριθμό κάρτας" : "Αναζήτηση ονόματος, ΑΦΜ, τηλεφώνου ή κάρτας"} value={query} onChange={e => setQuery(e.target.value)}/>
      <button type="button" disabled={selecting} onClick={() => select(null)}>Πελάτης λιανικής / χωρίς πίστωση</button>
      {loading && <p role="status">Φόρτωση πελατών…</p>}
      {error && <p role="alert">{error}</p>}
      <div className="pos-credit-customer-list">
        {rows.map(row => <button type="button" key={row.id} disabled={selecting} onClick={() => select(row)}><b>{row.name}</b><span>Υπόλοιπο {euro(row.balance)} · Όριο {euro(row.creditLimit)}</span></button>)}
      </div>
      {!loading && !error && !rows.length && <p>{cardOnly && query.trim().length < 2 ? "Σκάναρε την κάρτα για επιλογή." : query.trim().length === 1 ? "Γράψε τουλάχιστον 2 χαρακτήρες." : "Δεν βρέθηκαν πελάτες πίστωσης."}</p>}
      {!cardOnly && rows.length === 30 && <small>Εμφανίζονται οι πρώτοι 30. Χρησιμοποίησε αναζήτηση για περισσότερους.</small>}
    </section>}
  </div>;
}
