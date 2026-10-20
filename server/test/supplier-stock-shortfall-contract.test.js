import test from 'node:test';
import assert from 'node:assert/strict';
import {buildOrderSuggestions} from '../src/lib/order-suggestions.js';
import {buildSupplierOrderGroups} from '../src/lib/supplier-order-groups.js';
import {
  buildSupplierProposalCsv, validateCurrentStockShortfall, matchesCurrentStockShortfall,
} from '../../client/src/components/commerce/supplier-order-proposal-export.js';

// Actual unchanged quantity producer -> supplier grouping -> HTTP JSON shape ->
// shared UI/export contract. Synthetic rows only; no stock/order/DB/LAB writes.
const options = {historyDays: 30, coverageDays: 7, leadDays: 3};
const fields = ['currentStock', 'minStock', 'soldQuantity', 'returnedQuantity', 'netQuantity', 'dailyDemand', 'targetStock', 'suggestedQuantity'];
const wire = value => JSON.parse(JSON.stringify(value));
const raw = (productId, changes = {}) => ({productId, name: productId, sku: `sku-${productId}`, unit: 'PIECE', currentStock: 20,
  minStock: 10, soldQuantity: 0, returnedQuantity: 0, ...changes});
function pipeline(input = [
  raw('below', {currentStock: 3, minStock: 5}), raw('demand', {soldQuantity: 90}), raw('none'),
  raw('historical-negative', {currentStock: -71, minStock: 0, soldQuantity: 36, returnedQuantity: 5}),
  raw('recipe', {hasRecipe: true, currentStock: 3, minStock: 5}), raw('unknown-unit', {unit: 'UNCONFIRMED', currentStock: 3, minStock: 5}), raw('missing-stock', {currentStock: null}),
], evidenceOptions = {}) {
  const suggestions = buildOrderSuggestions(input, options);
  const evidence = suggestions.map(row => ({productId: row.productId, supplierId: 'candidate-a', supplierName: 'Υποψήφιος Α', documentId: `doc-${row.productId}`}));
  const grouped = buildSupplierOrderGroups(suggestions, evidence, evidenceOptions);
  return {suggestions, grouped, snapshot: wire({...grouped, storeId: 'synthetic-store', generatedAt: '2026-10-20T12:00:00.000Z',
    from: '2026-09-20T12:00:00.000Z', to: '2026-10-20T12:00:00.000Z', options})};
}
const byId = (rows, id) => rows.find(row => row.productId === id);
const filters = (stockShortfall = 'ALL') => ({query: '', supplier: 'all', onlyNeeded: false, stockShortfall});
function csvRecords(csv) {
  // RFC-style quoted CSV parser: handles doubled quotes and embedded newlines.
  const records = [], record = []; let cell = '', quoted = false;
  for (let i = csv.charCodeAt(0) === 0xfeff ? 1 : 0; i < csv.length; i++) {
    const c = csv[i];
    if (c === '"') {if (quoted && csv[i + 1] === '"') {cell += '"'; i++;} else quoted = !quoted;}
    else if (!quoted && c === ',') {record.push(cell); cell = '';}
    else if (!quoted && c === '\r' && csv[i + 1] === '\n') {record.push(cell); records.push([...record]); record.length = 0; cell = ''; i++;}
    else cell += c;
  }
  assert.equal(quoted, false); return records;
}

test('actual producer quantities and supplier assignment remain unchanged while shortage metadata survives JSON', () => {
  const {suggestions, grouped, snapshot} = pipeline();
  for (const original of suggestions) {
    const projected = byId(grouped.rows, original.productId), json = byId(snapshot.rows, original.productId);
    for (const field of fields) assert.equal(projected[field], original[field], `${original.productId}.${field}`);
    assert.deepEqual(validateCurrentStockShortfall(json), projected.currentStockShortfall);
    assert.equal(json.primarySupplierId, null); assert.equal(json.candidateSupplierId, 'candidate-a'); assert.equal(json.reviewRequired, true);
  }
  assert.equal(snapshot.automaticTransmission, false); assert.equal(snapshot.supplierBasis, 'APPROVED_DOCUMENT_FREQUENCY_PROXY');
  const below = validateCurrentStockShortfall(byId(snapshot.rows, 'below'));
  assert.equal(below.status, 'BELOW_MINIMUM'); assert.equal(below.quantity, 2);
  const demand = validateCurrentStockShortfall(byId(snapshot.rows, 'demand'));
  assert.equal(demand.status, 'DEMAND_REPLENISHMENT'); assert.equal(demand.quantity, 0);
  assert.equal(byId(snapshot.rows, 'demand').suggestedQuantity, 10);
  const none = validateCurrentStockShortfall(byId(snapshot.rows, 'none'));
  assert.equal(none.status, 'NO_SHORTAGE'); assert.equal(none.quantity, 0);
  for (const row of snapshot.rows) {const value = validateCurrentStockShortfall(row); assert.equal(value.basis, 'RECORDED_CURRENT_STOCK_MINIMUM'); assert.equal(value.stockVerified, false);}
});

test('historical negative stock -71 and proposal 82 are preserved, explicitly requiring review instead of shortage certification', () => {
  const {suggestions, snapshot} = pipeline(), original = byId(suggestions, 'historical-negative'), row = byId(snapshot.rows, original.productId);
  assert.deepEqual([row.currentStock, row.minStock, row.soldQuantity, row.returnedQuantity, row.netQuantity, row.dailyDemand, row.suggestedQuantity], [-71, 0, 36, 5, 31, 31 / 30, 82]);
  assert.deepEqual(row.warnings, original.warnings);
  const value = validateCurrentStockShortfall(row);
  assert.equal(value.status, 'REVIEW_REQUIRED'); assert.equal(value.quantity, null); assert.deepEqual(value.reviewReasons, ['NEGATIVE_RECORDED_STOCK']);
  assert.equal(matchesCurrentStockShortfall(row, 'REVIEW_REQUIRED'), true); assert.equal(matchesCurrentStockShortfall(row, 'BELOW_MINIMUM'), false);
});

test('actual recipe, unknown unit and missing numeric producers remain uncomputable through grouping and JSON', () => {
  const {snapshot} = pipeline();
  for (const id of ['recipe', 'unknown-unit', 'missing-stock']) {
    const row = byId(snapshot.rows, id), value = validateCurrentStockShortfall(row);
    assert.equal(row.suggestedQuantity, null); assert.equal(value.status, 'REVIEW_REQUIRED'); assert.equal(value.quantity, null);
    assert.deepEqual(value.reviewReasons, ['NUMERIC_SUGGESTION_UNAVAILABLE']);
  }
});

test('null/missing numeric producer fields take precedence over invalid arithmetic and negative stock', () => {
  const {suggestions} = pipeline([raw('base')]);
  for (const field of fields) for (const missing of ['null', 'omitted']) {
    const source = {...suggestions[0], currentStock: -71, targetStock: Infinity};
    if (missing === 'null') source[field] = null; else delete source[field];
    const row = wire(buildSupplierOrderGroups([source], []).rows[0]);
    assert.equal(row.currentStockShortfall.status, 'REVIEW_REQUIRED');
    assert.deepEqual(row.currentStockShortfall.reviewReasons, ['NUMERIC_SUGGESTION_UNAVAILABLE']);
    assert.deepEqual(validateCurrentStockShortfall(row), row.currentStockShortfall);
  }
});

test('nonfinite values become JSON null without falsely validating the original invalid-number diagnosis', () => {
  const {suggestions} = pipeline([raw('base')]);
  for (const field of fields) for (const value of [NaN, Infinity, -Infinity]) {
    const source = {...suggestions[0], [field]: value}, grouped = buildSupplierOrderGroups([source], []);
    assert.deepEqual(grouped.rows[0].currentStockShortfall.reviewReasons, ['INVALID_NUMERIC_SUGGESTION']);
    const row = wire(grouped.rows[0]); assert.equal(row[field], null);
    assert.throws(() => validateCurrentStockShortfall(row));
    assert.throws(() => matchesCurrentStockShortfall(row, 'ALL'));
  }
});

test('wrong numeric types and negative calculations remain review-only with consistent wire diagnostics', () => {
  const {suggestions} = pipeline([raw('base')]);
  for (const field of fields) {
    for (const value of ['1', true, ...(field === 'currentStock' ? [] : [-1])]) {
      const row = wire(buildSupplierOrderGroups([{...suggestions[0], [field]: value}], []).rows[0]);
      const meta = validateCurrentStockShortfall(row);
      assert.equal(meta.status, 'REVIEW_REQUIRED'); assert.equal(meta.quantity, null);
      assert.deepEqual(meta.reviewReasons, ['INVALID_NUMERIC_SUGGESTION']);
    }
  }
});

test('shared contract refuses forged statuses, quantities, verification and missing metadata on actual wire rows', () => {
  const {snapshot} = pipeline(), row = byId(snapshot.rows, 'below');
  for (const edit of [
    x => {delete x.currentStockShortfall;}, x => {x.currentStockShortfall.quantity = 0;},
    x => {x.currentStockShortfall.status = 'NO_SHORTAGE';}, x => {x.currentStockShortfall.stockVerified = true;},
    x => {x.currentStockShortfall.basis = 'PHYSICAL_COUNT';}, x => {x.currentStockShortfall.reviewReasons = ['invented'];},
    x => {x.currentStock = null;}, x => {x.targetStock = '10';}, x => {x.suggestedQuantity = -1;},
    x => {x.currentStockShortfall.unreviewed = true;},
  ]) {const changed = wire(row); edit(changed); assert.throws(() => validateCurrentStockShortfall(changed));}
});

test('strict positive recorded gap remains below minimum even below display rounding precision', () => {
  const {snapshot} = pipeline([raw('tiny', {currentStock: 0.999999999999, minStock: 1})]);
  const row = snapshot.rows[0], value = validateCurrentStockShortfall(row);
  assert.equal(value.status, 'BELOW_MINIMUM'); assert.equal(value.quantity, row.minStock - row.currentStock); assert.ok(value.quantity > 0);
  assert.equal(matchesCurrentStockShortfall(row, 'BELOW_MINIMUM'), true);
});

test('shared shortage filter selects exact actual rows without changing candidate evidence or quantities', () => {
  const {snapshot} = pipeline(), before = JSON.stringify(snapshot);
  const ids = filter => snapshot.rows.filter(row => matchesCurrentStockShortfall(row, filter)).map(row => row.productId).sort();
  assert.deepEqual(ids('ALL'), snapshot.rows.map(row => row.productId).sort());
  assert.deepEqual(ids('BELOW_MINIMUM'), ['below']); assert.deepEqual(ids('DEMAND_REPLENISHMENT'), ['demand']);
  assert.deepEqual(ids('REVIEW_REQUIRED'), ['historical-negative', 'missing-stock', 'recipe', 'unknown-unit']);
  assert.throws(() => matchesCurrentStockShortfall(snapshot.rows[0], 'NO_SHORTAGE'));
  assert.equal(JSON.stringify(snapshot), before);
  const incomplete = pipeline(undefined, {complete: false}).snapshot;
  assert.ok(incomplete.rows.every(row => row.candidateSupplierId === null && row.supplierReviewReason === 'INCOMPLETE_EVIDENCE'));
  assert.equal(validateCurrentStockShortfall(byId(incomplete.rows, 'below')).status, 'BELOW_MINIMUM');
});

test('CSV appends six shortage columns after the original 32 and preserves historical raw quantities', () => {
  const {snapshot} = pipeline(), records = csvRecords(buildSupplierProposalCsv({snapshot, rows: snapshot.rows, filters: filters()}));
  const header = records[0]; assert.equal(header.length, 38);
  assert.deepEqual(header.slice(32), ['Φίλτρο τρέχοντος ελλείμματος', 'Κατάσταση τρέχοντος αποθέματος', 'Έλλειμμα κάτω από ελάχιστο', 'Βάση ελλείμματος', 'Φυσικό απόθεμα επαληθευμένο', 'Αιτίες ελέγχου ελλείμματος']);
  for (const record of records.slice(1)) {assert.equal(record.length, 38); assert.equal(record[9], 'YES'); assert.equal(record[10], 'NO'); assert.equal(record[32], 'ALL'); assert.equal(record[35], 'RECORDED_CURRENT_STOCK_MINIMUM'); assert.equal(record[36], 'NO');}
  const negative = records.find(record => record[15] === 'historical-negative');
  assert.deepEqual([negative[19], negative[20], negative[21], negative[22], negative[23], negative[25]], ['-71', '0', '36', '5', '31', '82']);
  assert.deepEqual(negative.slice(33), ['REVIEW_REQUIRED', '', 'RECORDED_CURRENT_STOCK_MINIMUM', 'NO', 'NEGATIVE_RECORDED_STOCK']);
  const below = records.find(record => record[15] === 'below'); assert.equal(below[34], '2');
});

test('CSV honors exact canonical filtered identities and rejects contradictory post-wire metadata', () => {
  const {snapshot} = pipeline(), selected = snapshot.rows.filter(row => matchesCurrentStockShortfall(row, 'BELOW_MINIMUM'));
  const csv = buildSupplierProposalCsv({snapshot, rows: selected, filters: filters('BELOW_MINIMUM')});
  const records = csvRecords(csv); assert.equal(records.length, 2); assert.equal(records[1][15], 'below'); assert.equal(records[1][32], 'BELOW_MINIMUM');
  assert.throws(() => buildSupplierProposalCsv({snapshot, rows: [{...selected[0]}], filters: filters()}));
  const malformed = wire(snapshot); byId(malformed.rows, 'below').currentStockShortfall.stockVerified = true;
  assert.throws(() => buildSupplierProposalCsv({snapshot: malformed, rows: malformed.rows, filters: filters()}));
});
