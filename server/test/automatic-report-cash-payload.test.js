import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {buildAutomaticCashPayload} from '../src/services/automatic-report-cash-payload.js';
import {readAutomaticCashPreview} from '../src/services/automatic-report-source.js';
import {cashPreviewPeriod, reportDayOffset, reportWallTime} from '../src/services/automatic-report-policy.js';

// Actual read-only producer -> HTTP JSON representation -> deterministic pure
// consumer. Synthetic transaction adapter; no financial writes or DB/LAB tests.
const configuration = {dayStartHour: 7, terminals: ['MAIN', {terminalPos: 'DELIVERY', requiredSlots: [1]}]};
const clone = value => structuredClone(value);
const wire = value => JSON.parse(JSON.stringify(value));
const invalid = fn => assert.throws(fn, {code: 'INVALID_CASH_PAYLOAD'});
function shifts(period) {
  const result = [];
  for (let day = period.fromDay; day <= period.toDay; day = reportDayOffset(day, 1)) {
    const start = reportWallTime(day, 7).getTime(), next = reportWallTime(reportDayOffset(day, 1), 7);
    for (let slot = 0; slot < 3; slot++) result.push({
      id: `${day}-main-${slot}`, companyId: 'fixture-company', storeId: 'fixture-store', terminalPos: 'MAIN',
      status: 'CLOSED', openedBy: slot === 0 ? 'opening-a' : 'opening-b', openedByName: slot === 0 ? 'Άννα' : 'Βασίλης',
      openedAt: new Date(start + slot * 8 * 3600000), closedAt: slot === 2 ? next : new Date(start + (slot + 1) * 8 * 3600000),
      variance: [-10, 8, 0][slot], updatedAt: next,
    });
    result.push({id: `${day}-delivery`, companyId: 'fixture-company', storeId: 'fixture-store', terminalPos: 'DELIVERY',
      status: 'CLOSED', openedBy: 'opening-a', openedByName: 'Άννα', openedAt: new Date(start),
      closedAt: reportWallTime(day, 12), variance: 20, updatedAt: next});
  }
  return result;
}
async function preview(frequency = 'DAILY', day = '2026-10-15', changeRows = rows => rows) {
  const period = cashPreviewPeriod(day, frequency, configuration);
  const rows = changeRows(shifts(period)), calls = [];
  const tx = {
    user: {findUnique: async () => ({id: 'sa', role: 'SUPER_ADMIN'})},
    store: {findFirst: async () => ({id: 'fixture-store', companyId: 'fixture-company', name: 'Δοκιμαστικό'})},
    $queryRaw: async (strings, ...values) => {
      const sql = strings.join('?'); calls.push({sql, values});
      if (sql.includes('FROM "CashControlStoreRule"')) return [{mode: 'FULL', deliveryTerminalPattern: 'DELIVERY', carryOverEnabled: true, posEftposEnabled: true}];
      if (sql.includes('FROM "AutomaticReportSettings"')) return [{version: 7}];
      assert.match(sql, /FROM "CashShiftSession"/); return rows;
    },
  };
  const db = {$transaction: async (fn, options) => {assert.equal(options.isolationLevel, 'RepeatableRead'); return fn(tx);}};
  const result = await readAutomaticCashPreview(db, {actorId: 'sa', companyId: 'fixture-company', storeId: 'fixture-store',
    day, frequency, configuration, settingsVersion: 7, now: new Date(period.to.getTime() + 3600000)});
  assert.ok(calls.every(({sql}) => !/\b(?:INSERT|UPDATE|DELETE|CREATE|DROP)\b/i.test(sql)));
  return result;
}
const build = (p, overrides = {}) => buildAutomaticCashPayload({preview: p, companyId: 'fixture-company', storeId: 'fixture-store', settingsVersion: 7, ...overrides});
function fingerprint(envelope) {
  assert.equal(envelope.format, 'MWS_AUTOMATIC_CASH_PAYLOAD_V1');
  assert.equal(envelope.contentType, 'application/json; charset=utf-8');
  assert.equal(envelope.byteLength, Buffer.byteLength(envelope.body, 'utf8'));
  assert.equal(envelope.payloadFingerprint, createHash('sha256').update(envelope.body, 'utf8').digest('hex'));
  assert.equal(envelope.financialFinality, 'PROVISIONAL');
  assert.deepEqual(envelope.scope, {companyId: 'fixture-company', storeId: 'fixture-store'});
  assert.equal(typeof JSON.parse(envelope.body), 'object');
}

test('actual producer DAILY/WEEKLY/MONTHLY snapshots survive wire JSON without dropping original differences or chain isolation', async () => {
  for (const frequency of ['DAILY', 'WEEKLY', 'MONTHLY']) {
    const p = await preview(frequency), before = JSON.stringify(p), result = build(wire(p));
    assert.equal(p.ready, true); fingerprint(result);
    assert.deepEqual(result, build(p)); assert.equal(JSON.stringify(p), before);
    const body = JSON.parse(result.body);
    assert.deepEqual(body.groups.map(g => [g.day, g.terminalPos, g.originalShortage, g.originalSurplus, g.offset, g.netVariance]).sort(),
      p.groups.map(g => [g.day, g.terminalPos, g.originalShortage, g.originalSurplus, g.offset, g.netVariance]).sort());
    assert.equal(body.groups.flatMap(g => g.rows).length, p.sourceCount);
    assert.ok(body.groups.every(g => g.employeeLiabilityAdjusted === false));
    assert.deepEqual(result.financialLimitations, p.financialLimitations);
    if (frequency === 'MONTHLY') assert.equal(body.openingOperatorSummary.operators.flatMap(o => o.sessions).length, p.sourceCount);
  }
});

test('actual producer periods preserve Athens DST hours for daily, weekly and monthly payloads', async () => {
  for (const [frequency, day, hours] of [
    ['DAILY', '2026-03-28', 23], ['DAILY', '2026-10-24', 25],
    ['WEEKLY', '2026-03-25', 167], ['WEEKLY', '2026-10-21', 169],
    ['MONTHLY', '2026-03-15', 743], ['MONTHLY', '2026-10-15', 745],
  ]) {
    const p = await preview(frequency, day); assert.equal(p.ready, true);
    const result = build(wire(p)); fingerprint(result);
    assert.equal((Date.parse(result.period.to) - Date.parse(result.period.from)) / 3600000, hours);
    assert.equal(result.period.from, p.period.from.toISOString()); assert.equal(result.period.to, p.period.to.toISOString());
  }
});

test('determinism survives object order, group/row/day/summary permutations and volatile generation time', async () => {
  const p = wire(await preview('MONTHLY')), original = build(p), reordered = wire(p);
  reordered.groups.reverse(); for (const g of reordered.groups) g.rows.reverse();
  reordered.dayReadiness.reverse(); for (const d of reordered.dayReadiness) d.sessionIds.reverse();
  reordered.openingOperatorSummary.operators.reverse();
  for (const o of reordered.openingOperatorSummary.operators) {o.sessions.reverse(); o.recordedNames.reverse();}
  reordered.generatedAt = new Date(Date.parse(p.generatedAt) + 60000).toISOString();
  const reversed = Object.fromEntries(Object.entries(reordered).reverse());
  assert.deepEqual(build(reversed), original);
});

test('payload is detached and deeply immutable, and changed real source amounts change its fingerprint', async () => {
  const p = wire(await preview()), result = build(p), before = result.body;
  p.store.name = 'mutated'; p.groups[0].rows[0].employeeName = 'mutated';
  assert.equal(result.body, before); assert.ok(Object.isFrozen(result)); assert.ok(Object.isFrozen(result.scope));
  assert.throws(() => {result.scope.storeId = 'foreign';}, TypeError);
  const changed = await preview('DAILY', '2026-10-15', rows => {rows[0].variance = -11; return rows;});
  assert.notEqual(build(changed).payloadFingerprint, result.payloadFingerprint);
});

test('actual producer HOLD and incomplete source are refused without inventing zero totals', async () => {
  const held = await preview('DAILY', '2026-10-15', rows => rows.filter(r => !r.id.endsWith('main-2')));
  assert.equal(held.ready, false); assert.equal(held.groups, null); invalid(() => build(wire(held)));
  const p = wire(await preview());
  for (const changes of [{ready: false}, {sourceReadiness: 'HOLD'}, {complete: false}, {holds: [{code: 'SOURCE_LIMIT_EXCEEDED'}]}, {groups: null}])
    invalid(() => build({...p, ...changes}));
});

test('explicit scope, version, kind and provisional financial disclosures cannot be forged or omitted', async () => {
  const p = wire(await preview());
  for (const overrides of [{companyId: 'foreign'}, {storeId: 'foreign'}, {settingsVersion: 8}, {storeId: ''}]) invalid(() => build(p, overrides));
  for (const changes of [
    {store: {...p.store, companyId: 'foreign'}}, {store: {...p.store, id: 'foreign'}}, {settingsVersion: null},
    {kind: 'WEEKLY_CASH_PREVIEW'}, {financialFinality: 'FINAL'}, {financialReconciliationComplete: true},
    {employeeLiabilityAdjusted: true}, {deliveryStatus: 'SENT'}, {financialLimitations: []},
    {financialLimitations: [...p.financialLimitations, 'UNPROVEN']},
  ]) invalid(() => build({...p, ...changes}));
});

test('malformed groups, rows, cross-store leakage, duplicate identities and cent totals fail closed', async () => {
  const p = wire(await preview());
  for (const edit of [
    x => {x.groups[0].companyId = 'foreign';}, x => {x.groups[0].storeId = 'foreign';},
    x => {x.groups[0].cashChain = 'ALL';}, x => {x.groups[0].day = '2026-10-14';},
    x => {x.groups[0].rows[0].variance = null;}, x => {x.groups[0].rows[0].variance = 0.001;},
    x => {x.groups[0].originalShortage += 1;}, x => {x.groups[0].originalSurplus += 1;},
    x => {x.groups[0].offset += 1;}, x => {x.groups[0].netVariance += 1;},
    x => {x.groups[0].rows[0].sessionId = x.groups[1].rows[0].sessionId;},
    x => {x.groups.push(clone(x.groups[0]));}, x => {x.sourceCount += 1;},
    x => {x.groups[0].employeeLiabilityAdjusted = true;},
  ]) {const changed = clone(p); edit(changed); invalid(() => build(changed));}
});

test('per-day readiness identity, completeness and actual period bounds are independently checked', async () => {
  const p = wire(await preview('WEEKLY'));
  for (const edit of [
    x => {x.dayReadiness.pop();}, x => {x.dayReadiness.push(clone(x.dayReadiness[0]));},
    x => {x.dayReadiness[0].sessionIds.pop();}, x => {x.dayReadiness[0].sessionIds[0] = 'unknown';},
    x => {x.dayReadiness[0].ready = false;}, x => {x.dayReadiness[0].holds = [{code: 'SHIFT_NOT_CLOSED'}];},
    x => {x.dayReadiness[0].period.to = x.dayReadiness[0].period.from;},
    x => {x.period.to = new Date(Date.parse(x.period.to) + 3600000).toISOString();},
    x => {x.period.timeZone = 'UTC';}, x => {x.period.endExclusive = false;},
    x => {x.generatedAt = x.period.from;},
  ]) {const changed = clone(p); edit(changed); invalid(() => build(changed));}
});

test('monthly opening-user summary must exactly describe original rows and never certify payroll liability', async () => {
  const p = wire(await preview('MONTHLY'));
  for (const edit of [
    x => {x.openingOperatorSummary = null;}, x => {x.openingOperatorSummary.complete = false;},
    x => {x.openingOperatorSummary.operators[0].sessionCount += 1;},
    x => {x.openingOperatorSummary.operators[0].originalShortage += 1;},
    x => {x.openingOperatorSummary.operators[0].companyId = 'foreign';},
    x => {x.openingOperatorSummary.operators[0].operatorId = 'invented-payroll-person';},
    x => {x.openingOperatorSummary.operators[0].sessions.pop();},
    x => {x.openingOperatorSummary.operators[0].employeeLiabilityAdjusted = true;},
  ]) {const changed = clone(p); edit(changed); invalid(() => build(changed));}
});

test('complete recorded zero differences remain zero rather than unknown or fabricated shortage', async () => {
  const p = await preview('DAILY', '2026-10-15', rows => rows.map(r => ({...r, variance: 0})));
  const result = build(wire(p)), body = JSON.parse(result.body); fingerprint(result);
  assert.ok(body.groups.every(g => g.originalShortage === 0 && g.originalSurplus === 0 && g.offset === 0 && g.netVariance === 0));
});

test('getters, hostile prototypes, control text and unsafe metadata are rejected before evaluation', async () => {
  const p = wire(await preview()); let getterCalls = 0;
  const getter = clone(p); Object.defineProperty(getter.groups[0].rows[0], 'employeeName', {enumerable: true, get() {getterCalls++; return 'unsafe';}});
  invalid(() => build(getter)); assert.equal(getterCalls, 0);
  const prototype = clone(p); Object.setPrototypeOf(prototype.groups[0], {inherited: true}); invalid(() => build(prototype));
  const controls = clone(p); controls.groups[0].rows[0].employeeName = 'name\r\nInjected'; invalid(() => build(controls));
  const overflow = clone(p); overflow.groups[0].rows[0].variance = Number.MAX_SAFE_INTEGER; invalid(() => build(overflow));
});

test('actual producer missing opening identities survive JSON omission as unattributed sessions, never invented payroll users', async () => {
  const p = await preview('MONTHLY', '2026-10-15', rows => rows.map(r => ({...r, openedBy: undefined, openedByName: undefined})));
  const native = build(p), serialized = build(wire(p));
  assert.deepEqual(serialized, native);
  const body = JSON.parse(serialized.body);
  assert.ok(body.groups.flatMap(g => g.rows).every(r => r.employeeId === null && r.employeeName === null));
  assert.ok(body.openingOperatorSummary.operators.every(o => o.operatorId === null && o.identityStatus === 'UNATTRIBUTED'));
  assert.equal(body.openingOperatorSummary.operators.length, p.sourceCount);
});

test('payload allowlist omits safe private preview extras and preserves explicit Greek provisional disclosures', async () => {
  const p = wire(await preview()), original = build(p);
  p.responsibleEmail = 'private-recipient@example.invalid'; p.attachment = 'private-photo-reference';
  p.groups[0].rows[0].closingNote = 'private operator note';
  const result = build(p); assert.deepEqual(result, original);
  assert.doesNotMatch(result.body, /private-recipient|private-photo|private operator|responsibleEmail|closingNote|generatedAt/);
  const body = JSON.parse(result.body);
  assert.ok(body.disclosures.some(text => text.includes('ΠΡΟΣΩΡΙΝΗ ΑΝΑΦΟΡΑ')));
  assert.equal(body.financialReconciliationComplete, false); assert.equal(body.employeeLiabilityAdjusted, false);
});

test('aggregate UTF-8 values and metadata keys are bounded even when omitted from the output allowlist', async () => {
  const p = wire(await preview());
  // Each value is within the individual string limit and the array/node
  // limits. Its combined UTF-8 size exceeds the four-MiB copy budget.
  const ascii = {...p, ignoredMetadata: Array.from({length: 600}, () => 'x'.repeat(8192))};
  invalid(() => build(ascii));
  const greek = {...p, ignoredMetadata: Array.from({length: 300}, () => 'α'.repeat(8192))};
  invalid(() => build(greek));
  const hugeKey = {...p, ignoredMetadata: {['k'.repeat(4 * 1024 * 1024 + 1)]: 0}};
  invalid(() => build(hugeKey));
  invalid(() => build({...p, ignoredMetadata: {['k'.repeat(257)]: 0}}));
  invalid(() => build({...p, ignoredMetadata: {['κ'.repeat(129)]: 0}}));
  invalid(() => build({...p, ignoredMetadata: Object.fromEntries(Array.from({length: 1001}, (_, i) => [`field-${i}`, 0]))}));
  invalid(() => build({...p, ignoredMetadata: Array(1001).fill(0)}));
  let getters = 0;
  Object.defineProperty(ascii, 'lateAccessor', {enumerable: true, get() {getters++; return 'must not evaluate';}});
  invalid(() => build(ascii)); assert.equal(getters, 0);
  const manyKeys = Object.fromEntries(Array.from({length: 1001}, (_, i) => [`field-${i}`, 0]));
  Object.defineProperty(manyKeys, 'field-0', {enumerable: true, get() {getters++; return 'must not evaluate';}});
  invalid(() => build({...p, ignoredMetadata: manyKeys})); assert.equal(getters, 0);
});
