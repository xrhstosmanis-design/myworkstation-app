export function roundSupplierQuantity(quantity, pack) {
 if (!(quantity > 0) || !(pack > 1)) return quantity;
 return Number((Math.ceil(Number((quantity / pack).toPrecision(12))) * pack).toFixed(4));
}

export function applyProposalQuantities(report, edits = {}) {
 const remaining = new Set(Object.keys(edits));
 const rows = report.rows.map(row => {
  if (!remaining.delete(row.productId)) return row;
  const quantity = edits[row.productId];
  if (!Number.isFinite(quantity) || quantity < 0 || quantity > 100000000 ||
      Number(quantity.toFixed(4)) !== quantity) throw new Error('Μη έγκυρη ποσότητα πρότασης.');
  const warnings = (row.warnings || []).filter(w => w !== 'Χειροκίνητη ποσότητα.');
  if (quantity > 0 && roundSupplierQuantity(quantity, row.supplierPack) !== quantity) {
   warnings.push('Η ποσότητα δεν είναι πολλαπλάσιο της γνωστής συσκευασίας.');
  }
  return {...row, suggestedQuantity: quantity, warnings: [...warnings, 'Χειροκίνητη ποσότητα.']};
 });
 if (remaining.size) throw new Error('Βρέθηκε είδος εκτός της εμφανιζόμενης πρότασης.');
 return {...report, rows};
}

export function proposalSupplierTotals(rows) {
 const totals = new Map();
 for (const row of rows) {
  if (row.suggestedQuantity === 0) continue;
  const id = row.orderSupplierId ?? null;
  if (!totals.has(id)) totals.set(id, {id, name: row.orderSupplierName || 'Χωρίς προμηθευτή', cents: 0, missing: 0});
  const total = totals.get(id);
  if (!(row.suggestedQuantity > 0) || row.orderUnitCost == null) total.missing++;
  else total.cents += Math.round(row.suggestedQuantity * row.orderUnitCost * 100);
 }
 return [...totals.values()];
}
