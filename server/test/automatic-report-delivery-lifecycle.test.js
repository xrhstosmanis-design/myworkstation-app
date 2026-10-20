import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createDeliverySlot, reconcileDeliverySlot, claimDelivery, startDelivery,
  completeDelivery, recoverDelivery,
} from '../src/services/automatic-report-delivery-lifecycle.js';

// Synthetic metadata only. No adapter, database, scheduler, mail, or LAB data.
const NOW = '2026-10-19T19:00:00.000Z';
const later = ms => new Date(Date.parse(NOW) + ms).toISOString();
const clone = value => structuredClone(value);
function input(overrides = {}) {
  return {
    companyId: 'synthetic-company', storeId: 'synthetic-store', reportType: 'CASH', frequency: 'DAILY',
    periodFrom: '2026-10-17T04:00:00.000Z', periodTo: '2026-10-18T04:00:00.000Z',
    recipient: 'fixture@example.invalid',
    snapshot: {
      settingsVersion: 1, recipientVersion: 2, consentRevision: 3, lifecycleGeneration: '4',
      sourceFingerprint: 'a'.repeat(64), payloadFingerprint: 'b'.repeat(64), policyFingerprint: 'c'.repeat(64),
      principalId: 'synthetic-principal', financialFinality: 'PROVISIONAL', financialReconciliationComplete: false,
    }, ...overrides,
  };
}
function current(i = input(), now = NOW, changes = {}) {
  return {
    ...clone(i), checkedAt: now, companyActive: true, storeActive: true, licenseActive: true,
    moduleActive: true, principalAuthorized: true, recipientVerified: true,
    dispatchEnabled: true, consentActive: true, sourceReady: true, policyAllowsProvisional: true, maintenanceBlocked: false,
    ...changes,
  };
}
function fresh(i = input()) { return createDeliverySlot(i, {now: NOW, current: current(i)}); }
function claimed(record = fresh(), token = 'lease-token-1', now = NOW, leaseMs = 1000) {
  return claimDelivery(record, {expectedVersion: record.version, token, now, leaseMs});
}
function attempting(record = claimed(), now = NOW) {
  return startDelivery(record, {expectedVersion: record.version, token: record.token, now, current: current(record.input, now)});
}
function code(fn, expected) {
  assert.throws(fn, error => error instanceof Error && error.code === expected, expected);
}
function rejects(fn) { assert.throws(fn, error => error instanceof Error && typeof error.code === 'string'); }

test('stable slot identity excludes all immutable snapshot fences and later source/settings revisions cannot authorize a duplicate', () => {
  const original = fresh();
  for (const [key, value] of Object.entries({
    settingsVersion: 5, recipientVersion: 6, consentRevision: 7, lifecycleGeneration: '8',
    sourceFingerprint: 'd'.repeat(64), payloadFingerprint: 'e'.repeat(64), policyFingerprint: 'f'.repeat(64),
    principalId: 'different-principal',
  })) {
    const i = input(); i.snapshot[key] = value;
    assert.equal(fresh(i).slotId, original.slotId, key);
    code(() => reconcileDeliverySlot(original, i), 'DELIVERY_CONFLICT');
  }
  assert.deepEqual(reconcileDeliverySlot(original, input()), original);
});

test('recipient, scope, frequency and exact period are separate slots; ordering of object fields is not identity', () => {
  const original = fresh();
  for (const changes of [
    {companyId: 'other-company'}, {storeId: 'other-store'}, {recipient: 'second@example.invalid'},
    {frequency: 'WEEKLY'}, {frequency: 'MONTHLY'},
    {periodFrom: '2026-10-16T04:00:00.000Z'}, {periodTo: '2026-10-19T04:00:00.000Z'},
  ]) assert.notEqual(fresh(input(changes)).slotId, original.slotId, JSON.stringify(changes));
  const reordered = Object.fromEntries(Object.entries(input()).reverse());
  reordered.snapshot = Object.fromEntries(Object.entries(reordered.snapshot).reverse());
  assert.equal(fresh(reordered).slotId, original.slotId);
  code(() => reconcileDeliverySlot(original, input({recipient: 'second@example.invalid'})), 'DELIVERY_CONFLICT');
});

test('creation and transitions preserve input snapshots and prior records without shared mutable aliases', () => {
  const i = input(), gate = current(i), r = createDeliverySlot(i, {now: NOW, current: gate});
  const before = clone(r); i.snapshot.payloadFingerprint = 'e'.repeat(64); gate.snapshot.settingsVersion = 99;
  assert.deepEqual(r, before);
  const c = claimed(r); assert.deepEqual(r, before); assert.equal(c.version, r.version + 1);
  assert.equal(c.input.snapshot.financialFinality, 'PROVISIONAL');
  assert.equal(c.input.snapshot.financialReconciliationComplete, false);
  const cBefore = clone(c); const a = attempting(c); assert.deepEqual(c, cBefore);
  const aBefore = clone(a);
  const accepted = completeDelivery(a, {expectedVersion: a.version, token: a.token, now: later(1), outcome: 'ACCEPTED', messageId: 'synthetic-message-id'});
  assert.deepEqual(a, aBefore); assert.equal(accepted.status, 'ACCEPTED');
  assert.equal(accepted.input.snapshot.financialReconciliationComplete, false);
  assert.equal(accepted.input.snapshot.financialFinality, 'PROVISIONAL');
  assert.ok(Object.isFrozen(r) && Object.isFrozen(r.input) && Object.isFrozen(r.input.snapshot));
});

test('no implicit activation: each explicit current gate fails closed at creation and again immediately before dispatch', () => {
  for (const name of ['companyActive', 'storeActive', 'licenseActive', 'moduleActive', 'principalAuthorized',
    'recipientVerified', 'dispatchEnabled', 'consentActive', 'sourceReady', 'policyAllowsProvisional']) {
    const i = input(); code(() => createDeliverySlot(i, {now: NOW, current: current(i, NOW, {[name]: false})}), 'DELIVERY_BLOCKED');
    const c = claimed(); const before = clone(c);
    code(() => startDelivery(c, {expectedVersion: c.version, token: c.token, now: NOW,
      current: current(c.input, NOW, {[name]: false})}), 'DELIVERY_BLOCKED');
    assert.deepEqual(c, before, name);
  }
  const i = input(); code(() => createDeliverySlot(i, {now: NOW, current: current(i, NOW, {maintenanceBlocked: true})}), 'DELIVERY_BLOCKED');
  const c = claimed(); code(() => startDelivery(c, {expectedVersion: c.version, token: c.token, now: NOW,
    current: current(c.input, NOW, {maintenanceBlocked: true})}), 'DELIVERY_BLOCKED');
});

test('freshness and every immutable snapshot fence are rechecked before starting, including removal/revocation revisions', () => {
  const c = claimed();
  const variants = [current(c.input, later(-1)), current(c.input, NOW, {storeId: 'wrong-store'}),
    current(c.input, NOW, {companyId: 'wrong-company'}), current(c.input, NOW, {recipient: 'other@example.invalid'})];
  for (const [key, value] of Object.entries({settingsVersion: 2, recipientVersion: 3, consentRevision: 4,
    lifecycleGeneration: '5', sourceFingerprint: 'd'.repeat(64), payloadFingerprint: 'e'.repeat(64),
    policyFingerprint: 'f'.repeat(64), principalId: 'revoked-principal'})) {
    const gate = current(c.input); gate.snapshot[key] = value; variants.push(gate);
  }
  for (const gate of variants) code(() => startDelivery(c, {expectedVersion: c.version, token: c.token, now: NOW, current: gate}), 'STALE_GATE');
});

test('missing or nonboolean gate evidence and financial certification cannot pass by truthiness', () => {
  for (const value of [undefined, null, 1, 'true', {}, []]) {
    const gate = current(); gate.dispatchEnabled = value;
    rejects(() => createDeliverySlot(input(), {now: NOW, current: gate}));
  }
  const gate = current(); delete gate.recipientVerified;
  rejects(() => createDeliverySlot(input(), {now: NOW, current: gate}));
  for (const consentActive of [undefined, null, false, 'true', 1]) {
    const consentGate = current();
    if (consentActive === undefined) delete consentGate.consentActive;
    else consentGate.consentActive = consentActive;
    rejects(() => createDeliverySlot(input(), {now: NOW, current: consentGate}));
    const c = claimed();
    rejects(() => startDelivery(c, {expectedVersion: c.version, token: c.token, now: NOW, current: consentGate}));
  }
  const i = input(); i.snapshot.financialFinality = 'FINAL'; rejects(() => fresh(i));
  const reconciled = input(); reconciled.snapshot.financialReconciliationComplete = true; rejects(() => fresh(reconciled));
});

test('OCC and tokens fence stale branches; pure competing proposals still require future durable atomic CAS', () => {
  const p = fresh(); const one = claimed(p, 'worker-one'); const two = claimed(p, 'worker-two');
  // Pure immutable proposals both exist. Only a durable version-CAS adapter may commit one.
  assert.equal(one.version, two.version); assert.notEqual(one.token, two.token); assert.equal(p.status, 'PENDING');
  code(() => claimDelivery(one, {expectedVersion: p.version, token: 'worker-two', now: NOW, leaseMs: 1000}), 'STALE_VERSION');
  code(() => startDelivery(one, {expectedVersion: p.version, token: one.token, now: NOW, current: current(one.input)}), 'STALE_VERSION');
  rejects(() => startDelivery(one, {expectedVersion: one.version, token: two.token, now: NOW, current: current(one.input)}));
});

test('pre-dispatch expiration recovers safely at exact lease boundary and fences the former token forever', () => {
  const c = claimed(); const before = clone(c);
  rejects(() => startDelivery(c, {expectedVersion: c.version, token: c.token, now: later(1000), current: current(c.input, later(1000))}));
  const p = recoverDelivery(c, {expectedVersion: c.version, now: later(1000)});
  assert.equal(p.status, 'PENDING'); assert.equal(p.version, c.version + 1); assert.deepEqual(c, before);
  rejects(() => claimDelivery(p, {expectedVersion: p.version, token: c.token, now: later(1000), leaseMs: 1000}));
  const next = claimed(p, 'lease-token-2', later(1000));
  rejects(() => startDelivery(next, {expectedVersion: next.version, token: c.token, now: later(1001), current: current(next.input, later(1001))}));
  assert.equal(attempting(next, later(1001)).status, 'ATTEMPTING');
});

test('a lease one millisecond before expiry may start; after-start crash recovers UNKNOWN without transport replay', () => {
  const c = claimed(); const a = attempting(c, later(999));
  assert.equal(a.status, 'ATTEMPTING');
  const u = recoverDelivery(a, {expectedVersion: a.version, now: later(1000)});
  assert.equal(u.status, 'UNKNOWN');
  rejects(() => claimDelivery(u, {expectedVersion: u.version, token: 'never-retry', now: later(2000), leaseMs: 1000}));
  rejects(() => startDelivery(u, {expectedVersion: u.version, token: a.token, now: later(2000), current: current(u.input, later(2000))}));
});

test('late accepted callback after lease expiry is fenced and needs UNKNOWN reconciliation, never another send', () => {
  const a = attempting();
  code(() => completeDelivery(a, {expectedVersion: a.version, token: a.token, now: later(1000), outcome: 'ACCEPTED', messageId: 'actual-late-receipt'}), 'DELIVERY_CONFLICT');
  const u = recoverDelivery(a, {expectedVersion: a.version, now: later(1000)});
  assert.equal(u.status, 'UNKNOWN');
  rejects(() => completeDelivery(u, {expectedVersion: u.version, token: a.token, now: later(1001), outcome: 'ACCEPTED', messageId: 'late-receipt'}));
});

test('transport ACCEPTED and uncertain UNKNOWN are terminal and cannot imply delivered or final financial reconciliation', () => {
  for (const outcome of ['ACCEPTED', 'UNKNOWN']) {
    const a = attempting(); const terminal = completeDelivery(a, {expectedVersion: a.version, token: a.token, now: later(1), outcome,
      ...(outcome === 'ACCEPTED' ? {messageId: 'synthetic-receipt'} : {})});
    assert.equal(terminal.status, outcome); assert.equal(terminal.version, a.version + 1);
    assert.equal(terminal.input.snapshot.financialFinality, 'PROVISIONAL');
    assert.equal('delivered' in terminal, false);
    rejects(() => claimDelivery(terminal, {expectedVersion: terminal.version, token: 'retry-token', now: later(2), leaseMs: 1000}));
    rejects(() => startDelivery(terminal, {expectedVersion: terminal.version, token: a.token, now: later(2), current: current(a.input, later(2))}));
    assert.deepEqual(completeDelivery(terminal, {expectedVersion: terminal.version, token: a.token, now: later(2000), outcome,
      ...(outcome === 'ACCEPTED' ? {messageId: 'synthetic-receipt'} : {})}), terminal);
    code(() => completeDelivery(terminal, {expectedVersion: terminal.version, token: 'other-token', now: later(2), outcome,
      ...(outcome === 'ACCEPTED' ? {messageId: 'synthetic-receipt'} : {})}), 'DELIVERY_CONFLICT');
    rejects(() => completeDelivery(terminal, {expectedVersion: terminal.version, token: a.token, now: later(2),
      outcome: outcome === 'ACCEPTED' ? 'UNKNOWN' : 'ACCEPTED', ...(outcome === 'UNKNOWN' ? {messageId: 'new-receipt'} : {})}));
    code(() => completeDelivery(terminal, {expectedVersion: a.version, token: a.token, now: later(2), outcome,
      ...(outcome === 'ACCEPTED' ? {messageId: 'synthetic-receipt'} : {})}), 'STALE_VERSION');
    assert.deepEqual(reconcileDeliverySlot(terminal, input()), terminal);
  }
});

test('no completion before start; unproved rejection/error/retry outcome cannot reopen an attempt', () => {
  for (const r of [fresh(), claimed()]) rejects(() => completeDelivery(r, {expectedVersion: r.version, token: r.token, now: NOW, outcome: 'ACCEPTED'}));
  const a = attempting();
  for (const outcome of ['DELIVERED', 'FAILED', 'RETRY', 'REJECTED', '', null, true]) rejects(() => completeDelivery(a, {expectedVersion: a.version, token: a.token, now: later(1), outcome}));
  rejects(() => completeDelivery(a, {expectedVersion: a.version, token: 'wrong-token', now: later(1), outcome: 'UNKNOWN'}));
  code(() => completeDelivery(a, {expectedVersion: a.version - 1, token: a.token, now: later(1), outcome: 'UNKNOWN'}), 'STALE_VERSION');
});

test('periods and timestamps must be canonical, finite, ended and ordered; offsets/invalid dates are rejected', () => {
  for (const changes of [
    {periodFrom: '2026-10-17T07:00:00+03:00'}, {periodFrom: '2026-02-30T04:00:00.000Z'},
    {periodTo: input().periodFrom}, {periodFrom: input().periodTo},
    {periodTo: '2026-10-20T04:00:00.000Z'}, {periodFrom: '2026-10-17'},
  ]) rejects(() => fresh(input(changes)));
  for (const now of [undefined, null, 0, NaN, new Date(NOW), 'invalid', '2026-10-19T22:00:00+03:00'])
    rejects(() => createDeliverySlot(input(), {now, current: current(input(), now)}));
});

test('one mailbox follows existing trim/lower normalization; multi-recipient and header injection fail', () => {
  const canonical = fresh();
  for (const recipient of ['FIXTURE@example.invalid', ' fixture@example.invalid', 'fixture@example.invalid ']) {
    const r = fresh(input({recipient})); assert.equal(r.slotId, canonical.slotId);
    assert.equal(r.input.recipient, 'fixture@example.invalid');
    assert.deepEqual(reconcileDeliverySlot(canonical, input({recipient})), canonical);
  }
  for (const recipient of ['first@example.invalid,second@example.invalid', 'first@example.invalid;second@example.invalid',
    '.a@b.com', 'a.@b.com', 'foo..x@example.invalid', 'a@b.-c.com', 'a@b-.com',
    `${'a'.repeat(65)}@example.invalid`, `a@${'b'.repeat(64)}.com`,
    'name <fixture@example.invalid>', 'fixture@example.invalid\r\nBcc:evil@example.invalid', '', null])
    rejects(() => fresh(input({recipient})));
  assert.equal(fresh(input({recipient: ' A-B@EXAMPLE-DOMAIN.INVALID '})).input.recipient, 'a-b@example-domain.invalid');
});

test('strict metadata rejects unsupported scope, unsafe counters, unknown keys and prototype-bearing objects', () => {
  for (const changes of [{reportType: 'INVOICE'}, {frequency: 'HOURLY'}, {companyId: ''}, {storeId: ''}, {extra: 'ignored'}])
    rejects(() => fresh(input(changes)));
  for (const key of ['settingsVersion', 'recipientVersion', 'consentRevision'])
    for (const value of [0, -1, .5, Number.MAX_SAFE_INTEGER + 1, '1', null]) {
      const i = input(); i.snapshot[key] = value; rejects(() => fresh(i));
    }
  for (const value of ['', 'a'.repeat(63), 'A'.repeat(64), 'g'.repeat(64)]) {
    const i = input(); i.snapshot.sourceFingerprint = value; rejects(() => fresh(i));
  }
  const i = input(); i.snapshot.extra = true; rejects(() => fresh(i));
  const inherited = Object.assign(Object.create({hidden: true}), input()); rejects(() => fresh(inherited));
});

test('lease duration and version inputs reject unsafe values; a live lease cannot be opportunistically recovered', () => {
  const p = fresh();
  for (const leaseMs of [0, -1, .1, 300001, Number.MAX_SAFE_INTEGER, Infinity, '1000'])
    rejects(() => claimDelivery(p, {expectedVersion: p.version, token: 'token', now: NOW, leaseMs}));
  for (const expectedVersion of [undefined, null, 0, -1, .5, '1', Number.MAX_SAFE_INTEGER + 1])
    rejects(() => claimDelivery(p, {expectedVersion, token: 'token', now: NOW, leaseMs: 1000}));
  const c = claimed(); rejects(() => recoverDelivery(c, {expectedVersion: c.version, now: later(999)}));
  code(() => recoverDelivery(c, {expectedVersion: c.version - 1, now: later(1000)}), 'STALE_VERSION');
  rejects(() => claimDelivery(p, {expectedVersion: p.version, token: '', now: NOW, leaseMs: 1000}));
});

test('metadata validators do not execute accessors, accept hidden fields, or recurse unbounded through cycles', () => {
  let executed = false;
  const getter = input(), gate = current(); Object.defineProperty(getter, 'companyId', {enumerable: true, get() {executed = true; return 'synthetic-company';}});
  rejects(() => createDeliverySlot(getter, {now: NOW, current: gate})); assert.equal(executed, false);
  const hidden = input(); Object.defineProperty(hidden, 'hidden', {value: true}); rejects(() => fresh(hidden));
  const cyclic = input(); cyclic.snapshot.loop = cyclic; rejects(() => fresh(cyclic));
  const polluted = input(); Object.defineProperty(polluted.snapshot, '__proto__', {value: {}, enumerable: true}); rejects(() => fresh(polluted));
});

test('backwards time, exhausted versions and malformed persisted identity fail without mutating the record', () => {
  const p = fresh(), original = clone(p);
  rejects(() => claimDelivery(p, {expectedVersion: p.version, token: 'backwards', now: later(-1), leaseMs: 1000}));
  const exhausted = clone(p); exhausted.version = Number.MAX_SAFE_INTEGER;
  code(() => claimDelivery(exhausted, {expectedVersion: exhausted.version, token: 'exhausted', now: NOW, leaseMs: 1000}), 'DELIVERY_CONFLICT');
  const forged = clone(p); forged.slotId = '0'.repeat(64);
  rejects(() => claimDelivery(forged, {expectedVersion: forged.version, token: 'forged', now: NOW, leaseMs: 1000}));
  assert.deepEqual(p, original);
});

test('post-start UNKNOWN recovery is idempotent, preserving the original attempt and not manufacturing another lease', () => {
  const a = attempting(), u = recoverDelivery(a, {expectedVersion: a.version, now: later(1000)});
  const again = recoverDelivery(u, {expectedVersion: u.version, now: later(2000)});
  assert.deepEqual(again, u); assert.equal(again.attemptStartedAt, a.attemptStartedAt);
  assert.deepEqual(again.usedTokens, a.usedTokens);
  assert.equal(again.messageId, null);
});

test('accepted acknowledgement requires a receipt and conflicting receipt cannot rewrite terminal evidence', () => {
  const a = attempting();
  rejects(() => completeDelivery(a, {expectedVersion: a.version, token: a.token, now: later(1), outcome: 'ACCEPTED'}));
  const t = completeDelivery(a, {expectedVersion: a.version, token: a.token, now: later(1), outcome: 'ACCEPTED', messageId: 'actual-receipt'});
  code(() => completeDelivery(t, {expectedVersion: t.version, token: t.token, now: later(2), outcome: 'ACCEPTED', messageId: 'different-receipt'}), 'DELIVERY_CONFLICT');
  rejects(() => completeDelivery(a, {expectedVersion: a.version, token: a.token, now: later(1), outcome: 'UNKNOWN', messageId: 'unproved'}));
});

test('persisted attempt cannot claim a start before creation even when other fields look valid', () => {
  const a = clone(attempting()); a.attemptStartedAt = later(-1);
  rejects(() => completeDelivery(a, {expectedVersion: a.version, token: a.token, now: later(1), outcome: 'UNKNOWN'}));
});

test('lifecycle generation matches native canonical decimal-string int64 semantics, including zero, without precision coercion', () => {
  for (const generation of ['0', '9223372036854775807']) {
    const i = input(); i.snapshot.lifecycleGeneration = generation;
    const r = fresh(i); assert.equal(r.input.snapshot.lifecycleGeneration, generation);
    assert.equal(attempting(claimed(r)).status, 'ATTEMPTING');
  }
  for (const generation of [-1, 0, 4, '01', '+1', '-1', '1.0', ' 1', '1 ', '', '9223372036854775808']) {
    const i = input(); i.snapshot.lifecycleGeneration = generation; rejects(() => fresh(i));
  }
  const c = claimed(), gate = current(c.input); gate.snapshot.lifecycleGeneration = '5';
  code(() => startDelivery(c, {expectedVersion: c.version, token: c.token, now: NOW, current: gate}), 'STALE_GATE');
});
