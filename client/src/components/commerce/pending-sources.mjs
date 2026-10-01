const pendingInvoice = new Set(['RECEIVED', 'IN_REVIEW']);
const pendingPayment = new Set(['PENDING_REVIEW', 'DISCREPANCY']);
export const sourceLabels = {INVOICE: 'Τιμολόγια', PAYMENT: 'Πληρωμές προμηθευτών', STOCK: 'Απόθεμα'};

// Each request reuses the existing endpoint's tenant, role and module guards.
// Limits and failures must remain visible rather than implying a complete empty queue.
export async function loadPendingSources({api, stores, storeId = '', modules = []}) {
  const rows = [], warnings = [];
  const selected = stores.filter(store => !storeId || store.id === storeId);
  if (!selected.length) return {rows, warnings: ['Δεν υπάρχει διαθέσιμο κατάστημα για τις πρόσθετες πηγές.']};
  const active = new Set(modules);
  if (!active.has('DOCUMENTS')) warnings.push('Τιμολόγια: το module δεν είναι ενεργό.');
  if (!active.has('INVENTORY')) warnings.push('Απόθεμα: το module δεν είναι ενεργό.');
  // Sequential stores bound concurrent load independently of company size.
  for (const store of selected) {
    const context = {storeId: store.id, storeName: store.name};
    const tasks = [];
    const run = (source, fn) => tasks.push((async () => {
      try { await fn(); }
      catch (error) { warnings.push(`${store.name} · ${sourceLabels[source]}: ${error.message || 'Αποτυχία φόρτωσης'}`); }
    })());
    if (active.has('DOCUMENTS')) run('INVOICE', async () => {
      const seen = new Set(); let offset = 0, total = 0;
      do {
        const data = await api(`/api/commerce/documents/inbox/archive?${new URLSearchParams({storeId: store.id, offset: String(offset)})}`, {cache: 'no-store'});
        if (!Array.isArray(data.items) || !Number.isFinite(Number(data.total))) throw new Error('Μη έγκυρη απάντηση θυρίδας.');
        total = Number(data.total);
        for (const item of data.items) {
          if (seen.has(item.id)) continue;
          seen.add(item.id);
          if (pendingInvoice.has(item.status)) rows.push({...context, id: `INVOICE:${store.id}:${item.id}`, sourceId: item.id, source: 'INVOICE', priority: 'NORMAL', title: item.supplierName || 'Χωρίς προμηθευτή', detail: `${item.documentNumber || item.filename || item.id} · ${item.status === 'IN_REVIEW' ? 'Σε έλεγχο' : 'Προς έλεγχο'}`, createdAt: item.receivedAt});
        }
        offset += data.items.length;
        if (!data.items.length && offset < total) { warnings.push(`${store.name} · Τιμολόγια: ατελής φόρτωση. Ανοίξτε τη θυρίδα.`); break; }
      } while (offset < total && offset < 1000);
      if (offset < total && offset >= 1000) warnings.push(`${store.name} · Τιμολόγια: ελέγχθηκαν μόνο οι πρώτες ${offset} από ${total} εγγραφές. Ανοίξτε τη θυρίδα για πλήρη εικόνα.`);
    });
    run('PAYMENT', async () => {
      const data = await api(`/api/transactions/supplier-settlements/review?${new URLSearchParams({storeId: store.id})}`, {cache: 'no-store'});
      if (!Array.isArray(data.items)) throw new Error('Μη έγκυρη απάντηση πληρωμών.');
      for (const item of data.items) if (pendingPayment.has(item.status)) rows.push({...context, id: `PAYMENT:${store.id}:${item.id}`, sourceId: item.id, source: 'PAYMENT', priority: item.status === 'DISCREPANCY' ? 'HIGH' : 'NORMAL', title: item.supplierName || 'Πληρωμή προμηθευτή', detail: `${Number(item.amount || 0).toLocaleString('el-GR', {style: 'currency', currency: 'EUR'})} · ${item.status === 'DISCREPANCY' ? 'Απόκλιση' : 'Αναμονή ελέγχου'}`, createdAt: item.paidAt || item.createdAt});
      if (data.items.length >= 500) warnings.push(`${store.name} · Πληρωμές: φτάσαμε στο όριο 500 εγγραφών της πηγής. Η εικόνα μπορεί να είναι μερική.`);
    });
    if (active.has('INVENTORY')) run('STOCK', async () => {
      const data = await api(`/api/commerce/inventory?${new URLSearchParams({storeId: store.id})}`, {cache: 'no-store'});
      if (!Array.isArray(data.rows)) throw new Error('Μη έγκυρη απάντηση αποθήκης.');
      for (const item of data.rows) {
        const quantity = Number(item.currentStock), minimum = item.minStock == null ? null : Number(item.minStock);
        if (!item.trackStock || !Number.isFinite(quantity) || !(quantity < 0 || (minimum != null && Number.isFinite(minimum) && quantity <= minimum))) continue;
        rows.push({...context, id: `STOCK:${store.id}:${item.id}`, sourceId: item.id, source: 'STOCK', priority: quantity < 0 ? 'HIGH' : 'NORMAL', title: item.name, detail: `SKU ${item.sku || '—'} · Απόθεμα ${quantity}${minimum != null ? ` · Ελάχιστο ${minimum}` : ''}`, createdAt: null});
      }
    });
    await Promise.all(tasks);
  }
  rows.sort((a, b) => (a.priority === 'HIGH' ? 0 : 1) - (b.priority === 'HIGH' ? 0 : 1) || String(a.storeName).localeCompare(String(b.storeName), 'el') || a.id.localeCompare(b.id));
  return {rows, warnings};
}
