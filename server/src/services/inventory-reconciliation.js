// A read-only projection of recorded stock postings. Never posts stock, charges
// people, merges product cards or treats a possible duplicate as proven loss.
const value = x => x === null || x === undefined || x === '' ? null : Number.isFinite(Number(x)) ? Number(x) : null;
const time = x => x ? new Date(x).getTime() : NaN;
const round = x => Math.round((x + Number.EPSILON) * 10000) / 10000;
const adjustment = type => /ADJUST|CORRECTION|OPENING|INITIAL/.test(type || '');
export function reconcileInventory({previous, current, previousLines, currentLines, events = [], movements = [],sourceFindings={}}) {
  if (previous.companyId !== current.companyId || previous.storeId !== current.storeId || previous.id === current.id ||
      previous.status !== 'FINALIZED' || current.status !== 'FINALIZED' || !(time(previous.finalizedAt) <= time(current.startedAt))) {
    throw Object.assign(new Error('Απαιτούνται δύο διαδοχικές, οριστικοποιημένες απογραφές του ίδιου καταστήματος.'), {status: 409});
  }
  const old = new Map(previousLines.map(x => [x.productId, x]));
  const next = new Map(currentLines.map(x => [x.productId, x]));
  const eventMap = new Map(), historyMap = new Map();
  for (const event of [...events].sort((a,b) => time(a.createdAt)-time(b.createdAt) || a.id.localeCompare(b.id))) {
    if (!historyMap.has(event.lineId)) historyMap.set(event.lineId, []);
    historyMap.get(event.lineId).push(event);
    if (['COUNT','RECOUNT','CLEAR'].includes(event.eventType)) eventMap.set(`${event.stocktakeId}:${event.lineId}`, event);
  }
  const movementMap = new Map();
  for (const movement of movements) {
    if (!movementMap.has(movement.productId)) movementMap.set(movement.productId, []);
    movementMap.get(movement.productId).push(movement);
  }
  const rows = [...new Set([...old.keys(), ...next.keys()])].sort().map(productId => {
    const before = old.get(productId), after = next.get(productId), line = after || before;
    const fromEvent = before && eventMap.get(`${previous.id}:${before.id}`);
    const toEvent = after && eventMap.get(`${current.id}:${after.id}`);
    const from = fromEvent?.createdAt || before?.countedAt, to = toEvent?.createdAt || after?.countedAt;
    const findings = [...(Object.hasOwn(sourceFindings,productId)?sourceFindings[productId]:[])];
    if (!before || value(before.countedQuantity) === null || fromEvent?.eventType === 'CLEAR') findings.push('MISSING_PREVIOUS_COUNT');
    if (!after || value(after.countedQuantity) === null || toEvent?.eventType === 'CLEAR') findings.push('MISSING_CURRENT_COUNT');
    if (!(time(from) < time(to)) || time(from) > time(previous.finalizedAt) || time(to) > time(current.finalizedAt)) findings.push('INVALID_COUNT_TIME');
    if (!fromEvent || !toEvent) findings.push('MISSING_COUNT_EVENT');
    if (fromEvent && value(fromEvent.countedQuantity) !== value(before?.countedQuantity) || toEvent && value(toEvent.countedQuantity) !== value(after?.countedQuantity)) findings.push('COUNT_EVENT_MISMATCH');
    const countValid = !findings.some(x=>['MISSING_PREVIOUS_COUNT','MISSING_CURRENT_COUNT','INVALID_COUNT_TIME','MISSING_COUNT_EVENT','COUNT_EVENT_MISMATCH'].includes(x));
    const all = (movementMap.get(productId) || []).filter(m => time(m.createdAt) > time(from) && time(m.createdAt) <= time(to))
      .sort((a,b) => time(a.createdAt)-time(b.createdAt) || a.id.localeCompare(b.id));
    let balance = countValid ? value(before.countedQuantity) : null;
    let recordedBalance=balance;
    let incoming = 0, outgoing = 0, systemAdjustments = 0;
    const keys = new Set();
    const ledger = all.map(m => {
      // The opening stocktake's own posting installs the measured baseline;
      // including it again would count the same discrepancy twice.
      const baseline = m.sourceType === 'INVENTORY_V2' && m.sourceId === previous.id;
      const quantity = value(m.quantity);
      const beforeQuantity = balance;
      const recordedBefore=recordedBalance;
      const flags = [];
      if (quantity === null) flags.push('INVALID_MOVEMENT_QUANTITY');
      if (!m.sourceId) flags.push('MISSING_MOVEMENT_REFERENCE');
      if (m.idempotencyKey) {
        if (keys.has(m.idempotencyKey)) flags.push('DUPLICATE_POSTING_KEY');
        keys.add(m.idempotencyKey);
      }
      const system = adjustment(m.movementType);
      if (!baseline && quantity !== null) {
        if(recordedBalance!==null)recordedBalance=round(recordedBalance+quantity);
        if (balance !== null&&!system) balance = round(balance + quantity);
        if (system) systemAdjustments = round(systemAdjustments + quantity);
        else if (quantity >= 0) incoming = round(incoming + quantity);
        else outgoing = round(outgoing - quantity);
      }
      if (m.documentDate && time(m.documentDate) < time(from)) flags.push('LATE_DOCUMENT');
      if (!baseline && system) flags.push('NON_PHYSICAL_ADJUSTMENT');
      // createdAt is the posting timestamp; do not invent a physical receipt date.
      return {...m, quantity, included: !baseline, classification: baseline ? 'BASELINE_POSTING' : system ? 'SYSTEM_ADJUSTMENT' : 'POSTED_MOVEMENT',
        postedAt: m.createdAt, physicalAt: m.physicalAt||null, balanceBefore: beforeQuantity, balanceAfter: balance,recordedBalanceBefore:recordedBefore,recordedBalanceAfter:recordedBalance,findings: flags};
    });
    for (const m of ledger) for (const flag of m.findings) if (!findings.includes(flag)) findings.push(flag);
    const uncertain=findings.some(x=>['INVALID_MOVEMENT_QUANTITY','DUPLICATE_POSTING_KEY','LATE_DOCUMENT','TRANSACTION_CROSSES_COUNT_TIME','INVALID_TRANSACTION_QUANTITY','TRANSACTION_POSTING_QUANTITY_MISMATCH','TRANSACTION_WITHOUT_VERIFIED_STOCK_EFFECT','STOCK_POSTING_FOR_INCOMPLETE_TRANSACTION','LATE_DOCUMENT_PHYSICAL_TIME_UNKNOWN','INVOICE_QUANTITY_CHECK_UNRESOLVED'].includes(x));
    const expected = uncertain?null:balance;
    if(uncertain)for(const m of ledger){m.balanceBefore=null;m.balanceAfter=null;}
    const difference = countValid && expected !== null ? round(value(after.countedQuantity) - expected) : null;
    const unitCost = value(after?.unitCost);
    if (!(unitCost > 0)) findings.push('MISSING_OR_ZERO_COST');
    // Count-time expected value provides an independent cross-check, not a
    // substitute for the intervening posting ledger.
    const observedExpected = value(toEvent?.expectedQuantity);
    if (recordedBalance !== null && observedExpected !== null && Math.abs(recordedBalance-observedExpected) > 0.0001) findings.push('LEDGER_COUNT_EXPECTED_MISMATCH');
    return {productId, name: line.name, sku: line.sku, from, to,
      previousCountedQuantity: value(before?.countedQuantity), countedQuantity: value(after?.countedQuantity),
      incoming, outgoing, systemAdjustments, expectedQuantity: expected,recordedExpectedQuantity:recordedBalance,recordedDifference:countValid&&recordedBalance!==null?round(value(after.countedQuantity)-recordedBalance):null,observedExpectedQuantity: observedExpected,
      difference, unitCost: unitCost > 0 ? unitCost : null,
      differenceValue: difference === null || !(unitCost > 0) ? null : round(difference * unitCost),
      status: 'REVIEW_REQUIRED', findings, movements: ledger,
      countHistory: [...(historyMap.get(before?.id) || []),...(historyMap.get(after?.id) || [])]};
  });
  const total = field => round(rows.reduce((s,x) => s+(x[field] || 0),0));
  const shortage = rows.filter(x => x.difference < 0), surplus = rows.filter(x => x.difference > 0);
  const completeQuantity = rows.every(x => x.difference !== null);
  const completeCost = rows.every(x => x.difference === 0 || x.differenceValue !== null);
  const shortageValue = completeCost ? round(-shortage.reduce((s,x) => s+x.differenceValue,0)) : null;
  const surplusValue = completeCost ? round(surplus.reduce((s,x) => s+x.differenceValue,0)) : null;
  return {version: 1, readOnly: true, status: 'REVIEW_REQUIRED',
    coverage: {source: 'RECORDED_STOCK_MOVEMENTS', physicalTimesAvailable: false, identityGrouping: false, reviewedCorrections: false,
      invoiceAuditComplete: false, systemEventAuditComplete: false},
    explanation: 'Προηγούμενη καταμέτρηση + τεκμηριωμένες εισαγωγές − εξαγωγές = αναμενόμενο φυσικό υπόλοιπο. Οι μη φυσικές διορθώσεις παρουσιάζονται χωριστά στο λογιστικό υπόλοιπο. Αβέβαιος χρόνος ή ελλιπής πηγή δεν παράγει επιβεβαιωμένη απώλεια.',
    costMethod: 'Κόστος μονάδας αποθηκευμένο στη νεότερη απογραφή. Μηδενικό ή άγνωστο κόστος δεν αποτιμάται.',
    previous, current, rows, summary: {itemCount: rows.length, movementCount: rows.reduce((s,x) => s+x.movements.length,0),
      shortageQuantity: completeQuantity ? round(-shortage.reduce((s,x) => s+x.difference,0)) : null, surplusQuantity: completeQuantity ? round(surplus.reduce((s,x) => s+x.difference,0)) : null,
      netQuantity: completeQuantity ? total('difference') : null, uncomputedItems: rows.filter(x => x.difference === null).length,
      missingCostItems: rows.filter(x => x.unitCost === null).length, shortageValue, surplusValue,
      netValue: completeCost ? round(surplusValue-shortageValue) : null}};
}
