import React, {useRef, useState} from 'react';

export default function StoreWorkforceStatusAction({api, path, row, onChanged, disabled}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const sending = useRef(false);
  const active = !row.active;
  const label = active ? 'Ενεργοποίηση' : 'Απενεργοποίηση';

  async function submit(event) {
    event.preventDefault();
    if (sending.current || disabled || reason.trim().length < 3) return;
    sending.current = true;
    setBusy(true);
    setError('');
    try {
      const result = await api(`${path}/${encodeURIComponent(row.id)}/status`, {
        method: 'PATCH',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({active, confirmed: true, reason: reason.trim()})
      });
      if (result?.item?.id !== row.id || result.item.active !== active) {
        throw new Error('Η αλλαγή δεν επιβεβαιώθηκε. Ανανέωσε την προβολή πριν προσπαθήσεις ξανά.');
      }
      onChanged();
    } catch (failure) {
      setError(failure.message || 'Η αλλαγή κατάστασης απέτυχε.');
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }

  if (!open) return <button type="button" className="secondary" disabled={disabled} onClick={() => setOpen(true)}>{label}</button>;
  return <form onSubmit={submit} className="workforce-row-actions">
    <label>Αιτιολογία για {label.toLocaleLowerCase('el-GR')}
      <input required minLength={3} maxLength={500} value={reason} disabled={busy} onChange={event => setReason(event.target.value)}/>
    </label>
    <button type="submit" disabled={busy || disabled || reason.trim().length < 3}>Επιβεβαίωση</button>
    <button type="button" className="secondary" disabled={busy} onClick={() => {setOpen(false); setReason(''); setError('');}}>Ακύρωση</button>
    {error && <p role="alert">{error}</p>}
  </form>;
}
