const numeric = value => value === null || value === undefined || String(value).trim() === "" ? null : Number(value);
const positive = value => Number.isFinite(value) && value > 0;
const normalize = value => String(value || "").normalize("NFD").replace(/[\u0300-\u036f.\s]/g, "").toUpperCase();

export function comparisonUnit(value) {
  const unit = normalize(value);
  if (["PIECE", "PCS", "PC", "ΤΜΧ", "ΤΕΜ", "ΤΕΜΑΧΙΟ", "ΤΕΜΑΧΙΑ"].includes(unit)) return {base: "PIECE", factor: 1, label: "τεμ."};
  if (["KG", "KGR", "ΚΙΛΟ", "ΚΙΛΑ", "ΚG"].includes(unit)) return {base: "KG", factor: 1, label: "κιλό"};
  if (["G", "GR", "GRAM", "ΓΡ", "ΓΡΑΜΜΑΡΙΟ"].includes(unit)) return {base: "KG", factor: 0.001, label: "κιλό"};
  if (["L", "LT", "LITER", "LITRE", "ΛΙΤΡΟ", "ΛΙΤΡΑ"].includes(unit)) return {base: "L", factor: 1, label: "λίτρο"};
  if (["ML", "ΜΛ"].includes(unit)) return {base: "L", factor: 0.001, label: "λίτρο"};
  return null;
}

function documentCost(document, unit) {
  const first = document.lines[0];
  if (!unit) return {cost: null, reason: "Άγνωστη μονάδα προϊόντος"};
  // A posted order preserves financial quantities in PurchaseDocumentLine.
  // Prefer its recorded conversion/cost, never infer packs from a description.
  if (first.sourceType === "PURCHASE_ORDER") {
    if (unit.base !== "PIECE") return {cost: null, reason: "Η μετατροπή αγοράς σε μονάδα προϊόντος χρειάζεται έλεγχο"};
    const corrected = numeric(first.correctedUnitCost);
    if (first.correctionId) return positive(corrected)
      ? {cost: corrected, note: "Καταγεγραμμένη διόρθωση συσκευασίας", evidenceId: first.correctionId}
      : {cost: null, reason: "Μη έγκυρο κόστος διόρθωσης συσκευασίας"};
    const quantity = numeric(first.orderBaseQuantity), net = numeric(first.orderNetAmount);
    if (Number(first.orderInvalidUnits) === 0 && positive(quantity) && positive(net)) return {cost: net / quantity, note: "Αποθηκευμένη μετατροπή αγοράς"};
    return {cost: null, reason: "Λείπει επιβεβαιωμένη μετατροπή συσκευασίας στην αγορά"};
  }
  let quantity = 0, net = 0;
  for (const line of document.lines) {
    const q = numeric(line.quantity), amount = numeric(line.netAmount);
    if (!positive(q) || !Number.isFinite(amount) || amount < 0) return {cost: null, reason: "Ελλιπής ποσότητα ή καθαρή αξία γραμμής"};
    let conversion = comparisonUnit(line.unit);
    if (normalize(line.unit) === "PACKAGE") {
      const pack = numeric(line.unitsPerPackage);
      if (unit.base !== "PIECE" || !positive(pack)) return {cost: null, reason: "Λείπει έγκυρος αριθμός τεμαχίων ανά συσκευασία"};
      conversion = {base: "PIECE", factor: pack};
    }
    if (!conversion || conversion.base !== unit.base) return {cost: null, reason: "Μονάδες που δεν μπορούν να συγκριθούν"};
    quantity += q * conversion.factor;
    net += amount;
  }
  if (!positive(net) || !positive(quantity)) return {cost: null, reason: "Μηδενική αξία αγοράς — δεν αποτελεί τιμή προμηθευτή"};
  return {cost: net / quantity, note: "Καθαρή αξία γραμμών / κοινή μονάδα"};
}

export function buildSupplierPriceComparison(lines) {
  const groups = new Map();
  for (const line of lines) {
    const key = JSON.stringify([line.productId, line.supplierId]);
    if (!groups.has(key)) groups.set(key, {first: line, documents: new Map()});
    const group = groups.get(key);
    if (!group.documents.has(line.documentId)) group.documents.set(line.documentId, {id: line.documentId, number: line.documentNumber, date: line.documentDate, createdAt: line.documentCreatedAt, lines: []});
    group.documents.get(line.documentId).lines.push(line);
  }
  return [...groups.values()].map(({first, documents}) => {
    const unit = comparisonUnit(first.productUnit);
    const purchases = [...documents.values()].sort((a, b) => new Date(b.date) - new Date(a.date) || new Date(b.createdAt) - new Date(a.createdAt) || String(b.id).localeCompare(String(a.id)));
    const costs = purchases.map(document => ({...document, ...documentCost(document, unit)}));
    const last = costs[0], comparable = costs.filter(row => positive(row.cost));
    const best = comparable.reduce((current, row) => !current || row.cost < current.cost ? row : current, null);
    return {
      productId: first.productId, productName: first.productName, sku: first.sku,
      supplierId: first.supplierId, supplierName: first.supplierName,
      baseUnit: unit?.base || null, unitLabel: unit?.label || "μονάδα",
      lastCost: last.cost, bestCost: comparable.length ? Math.min(...comparable.map(row => row.cost)) : null,
      lastPurchaseAt: last.date, lastDocumentId: last.id, lastDocumentNumber: last.number,
      bestPurchaseAt: best?.date || null, bestDocumentId: best?.id || null, bestDocumentNumber: best?.number || null,
      purchaseCount: costs.length, comparablePurchaseCount: comparable.length,
      excludedPurchaseCount: costs.length - comparable.length,
      reason: last.reason || null, normalizationNote: last.note || null, evidenceId: last.evidenceId || null
    };
  }).sort((a, b) => String(a.productName).localeCompare(String(b.productName), "el") || String(a.supplierName).localeCompare(String(b.supplierName), "el"));
}
