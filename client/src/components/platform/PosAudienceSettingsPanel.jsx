import React, {useEffect, useRef, useState} from "react";
import "./pos-audience-settings.css";
import {AUDIENCE_KEYS, normalizeAudienceSettings} from "../../../../shared/pos-audience-settings.mjs";

export default function PosAudienceSettingsPanel({request, stores}) {
  const requester=useRef(request); requester.current=request;
  const [storeId, setStoreId] = useState("");
  const [settings, setSettings] = useState(() => normalizeAudienceSettings());
  const [loadedStoreId, setLoadedStoreId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  useEffect(() => {
    let active = true;
    setLoadedStoreId(""); setSettings(normalizeAudienceSettings()); setError(""); setMessage("");
    if (!storeId) return;
    requester.current(`/api/platform/pos-designer-fixed/audience-settings/${encodeURIComponent(storeId)}`)
      .then(result => {if (active) {setSettings(normalizeAudienceSettings(result.settings)); setLoadedStoreId(storeId);}})
      .catch(err => {if (active) setError(err.message);});
    return () => {active = false;};
  }, [storeId]);
  const save = async () => {
    if (!storeId || loadedStoreId !== storeId || busy) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const result = await request(`/api/platform/pos-designer-fixed/audience-settings/${encodeURIComponent(storeId)}`, {method:"PUT", body:JSON.stringify(settings)});
      setSettings(normalizeAudienceSettings(result.settings));
      setMessage("Αποθηκεύτηκαν οι δικαιούχοι για το επιλεγμένο κατάστημα. Κάνε ανανέωση στο POS.");
    } catch (err) {setError(err.message);} finally {setBusy(false);}
  };
  return <details className="pos-audience-settings-panel">
    <summary>Δικαιούχοι έκπτωσης ανά κατάστημα</summary>
    <p>Ενεργοποίησε τις ομάδες μόνο όπου χρειάζονται, π.χ. σε κυλικείο νοσοκομείου. Η επιλογή πελάτη πίστωσης παραμένει διαθέσιμη σε κάθε POS.</p>
    <label>Κατάστημα δικαιούχων<select value={storeId} disabled={busy} onChange={e => setStoreId(e.target.value)}>
      <option value="">Επίλεξε κατάστημα</option>
      {stores.map(store => <option key={store.id} value={store.id}>{store.companyName} — {store.name}</option>)}
    </select></label>
    {storeId && loadedStoreId !== storeId && !error && <p role="status">Φόρτωση ρυθμίσεων…</p>}
    {loadedStoreId === storeId && storeId && <fieldset disabled={busy}>
      <label className="toggle"><input type="checkbox" checked={settings.enabled} onChange={e => setSettings(current => ({...current, enabled:e.target.checked}))}/>Εμφάνιση δικαιούχων και κάρτας δικαιούχου στο POS</label>
      {AUDIENCE_KEYS.map(key => <label key={key}>Ονομασία {settings.labels[key]}<input aria-label={`Ονομασία δικαιούχου ${key}`} maxLength={60} value={settings.labels[key]} onChange={e => setSettings(current => ({...current, labels:{...current.labels, [key]:e.target.value}}))}/></label>)}
      <button type="button" onClick={save}>Αποθήκευση δικαιούχων καταστήματος</button>
    </fieldset>}
    {error && <p role="alert" className="pos-designer-alert error">{error}</p>}
    {message && <p role="status" className="pos-designer-alert success">{message}</p>}
  </details>;
}
