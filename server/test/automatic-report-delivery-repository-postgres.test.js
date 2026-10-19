import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {createAutomaticReportDeliveryRepository} from '../src/services/automatic-report-delivery-repository.js';

// Native fixture only. Never import Prisma or issue DDL without this explicit
// isolated-test boundary. Synthetic gates below do NOT certify production auth.
const NOW = '2026-10-19T21:00:00.000Z';
const later = ms => new Date(Date.parse(NOW) + ms).toISOString();
const copy = value => structuredClone(value);
function isolatedDatabaseUrl(value, mode) {
  try {
    const u = new URL(value);
    return mode === 'test' && ['postgres:', 'postgresql:'].includes(u.protocol) &&
      ['127.0.0.1', 'localhost', 'postgres'].includes(u.hostname) && /test/i.test(decodeURIComponent(u.pathname));
  } catch { return false; }
}
const native = isolatedDatabaseUrl(process.env.DATABASE_URL, process.env.NODE_ENV);
function input(name = 'one', extra = {}) {
  return {
    companyId: `delivery-repository-test-${process.pid}`, storeId: 'selected-store', reportType: 'CASH', frequency: 'DAILY',
    periodFrom: '2026-10-17T04:00:00.000Z', periodTo: '2026-10-18T04:00:00.000Z', recipient: `${name}@example.invalid`,
    snapshot: {settingsVersion: 1, recipientVersion: 2, consentRevision: 3, lifecycleGeneration: '4',
      sourceFingerprint: 'a'.repeat(64), payloadFingerprint: 'b'.repeat(64), policyFingerprint: 'c'.repeat(64),
      principalId: 'synthetic-principal', financialFinality: 'PROVISIONAL', financialReconciliationComplete: false}, ...extra,
  };
}
function eligibility({input: i, now}) {
  return {...copy(i), checkedAt: now, companyActive: true, storeActive: true, licenseActive: true,
    moduleActive: true, principalAuthorized: true, recipientVerified: true, consentActive: true,
    dispatchEnabled: true, sourceReady: true, policyAllowsProvisional: true, maintenanceBlocked: false};
}
const scope = i => ({companyId: i.companyId, storeId: i.storeId});
const identified = r => ({...scope(r.input), slotId: r.slotId});
const claimOptions = (r, token = 'token-one', now = NOW) => ({expectedVersion: r.version, token, now, leaseMs: 1000});

test('native fixture boundary refuses production, nonloopback, wrong mode and malformed URLs', () => {
  for (const [url, mode] of [
    ['postgresql://u:p@production.example/test', 'test'], ['postgresql://u:p@127.0.0.1/live', 'test'],
    ['postgresql://u:p@localhost/test', 'production'], ['postgresql://u:p@localhost/test', undefined],
    ['not-a-url', 'test'], ['https://localhost/test', 'test'], ['postgresql://u:p@localhost/%ZZ', 'test'],
  ]) assert.equal(isolatedDatabaseUrl(url, mode), false);
  for (const host of ['127.0.0.1', 'localhost', 'postgres'])
    assert.equal(isolatedDatabaseUrl(`postgresql://u:p@${host}/delivery_test`, 'test'), true);
});

test('repository construction is dormant and validates required capabilities without touching DB', () => {
  let calls = 0;
  const db = {$transaction() { calls++; throw new Error('must not execute'); }};
  const repository = createAutomaticReportDeliveryRepository({db, readEligibility: async () => { calls++; }});
  for (const method of ['create', 'get', 'claim', 'start', 'complete', 'recover']) assert.equal(typeof repository[method], 'function');
  assert.equal(calls, 0);
  for (const options of [{}, {db}, {db, readEligibility: true}, {db: {}, readEligibility: eligibility}])
    assert.throws(() => createAutomaticReportDeliveryRepository(options));
  assert.equal(calls, 0);
});

test('unsafe scope and accessor configuration are refused without queries or getter evaluation', async () => {
  let queries = 0, getters = 0;
  const repository = createAutomaticReportDeliveryRepository({
    db: {$transaction() { queries++; throw new Error('must not query'); }}, readEligibility: eligibility,
  });
  const i = input(), unsafe = {};
  Object.defineProperty(unsafe, 'companyId', {enumerable: true, get() { getters++; return i.companyId; }});
  unsafe.storeId = i.storeId;
  await assert.rejects(repository.create(unsafe, i, {now: NOW}), {code: 'INVALID_INPUT'});
  const config = {};
  Object.defineProperty(config, 'now', {enumerable: true, get() { getters++; return NOW; }});
  await assert.rejects(repository.create(scope(i), i, config), {code: 'INVALID_INPUT'});
  await assert.rejects(repository.get({...scope(i), slotId: 'not-a-canonical-id'}), {code: 'INVALID_INPUT'});
  assert.equal(getters, 0); assert.equal(queries, 0);
});

test('native PostgreSQL delivery persistence: independent clients, transactions and client reconnect fences', {skip: !native}, async t => {
  const {PrismaClient} = await import('@prisma/client');
  const admin = new PrismaClient();
  const schema = `delivery_repo_test_${randomBytes(12).toString('hex')}`;
  assert.match(schema, /^delivery_repo_test_[a-f0-9]{24}$/);
  const databaseUrl = new URL(process.env.DATABASE_URL);
  databaseUrl.searchParams.set('schema', schema);
  const a = new PrismaClient({datasources: {db: {url: databaseUrl.toString()}}});
  const b = new PrismaClient({datasources: {db: {url: databaseUrl.toString()}}});
  let schemaCreated = false;
  const make = (db = a, readEligibility = eligibility) => createAutomaticReportDeliveryRepository({db, readEligibility});
  const ra = make(), rb = make(b);
  let sequence = 0;
  const fresh = async (repo = ra, extra = {}) => {
    const i = input(`case-${++sequence}`, extra);
    return (await repo.create(scope(i), i, {now: NOW})).record;
  };
  const claimed = async (repo = ra) => { const r = await fresh(repo); return repo.claim(identified(r), claimOptions(r)); };
  const attempting = async (repo = ra) => { const r = await claimed(repo); return repo.start(identified(r), {expectedVersion: r.version, token: r.token, now: NOW}); };
  const rows = () => a.$queryRaw`SELECT "slotId", "companyId", "storeId", "version", "status", "token", "record" FROM "AutomaticReportDeliverySlot" ORDER BY "slotId"`;
  try {
    await admin.$connect();
    // PostgreSQL identifiers cannot be bound parameters. Only this internally
    // generated, strictly validated identifier is interpolated; no scope data.
    await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
    schemaCreated = true;
    await Promise.all([a.$connect(), b.$connect()]);
    const absent = await a.$queryRaw`SELECT table_name FROM information_schema.tables WHERE table_schema = ${schema} AND table_name = 'AutomaticReportDeliverySlot'`;
    assert.deepEqual(absent, []);
    await a.$executeRaw`CREATE TABLE "AutomaticReportDeliverySlot" (
      "slotId" TEXT PRIMARY KEY, "companyId" TEXT NOT NULL, "storeId" TEXT NOT NULL,
      "version" BIGINT NOT NULL CHECK ("version" > 0 AND "version" <= 9007199254740991),
      "status" TEXT NOT NULL CHECK ("status" IN ('PENDING', 'CLAIMED', 'ATTEMPTING', 'ACCEPTED', 'UNKNOWN')),
      "token" TEXT, "record" JSONB NOT NULL
    )`;
    const control = await fresh(ra, {companyId: `control-company-${process.pid}`, storeId: 'control-store'});
    const controlBefore = (await rows()).find(r => r.slotId === control.slotId);

    await t.test('concurrent clients create exactly one logical slot and reject changed immutable snapshot', async () => {
      const i = input(`concurrent-${++sequence}`);
      const result = await Promise.all([ra.create(scope(i), i, {now: NOW}), rb.create(scope(i), copy(i), {now: NOW})]);
      assert.equal(result.filter(r => r.created).length, 1);
      assert.deepEqual(result[0].record, result[1].record);
      assert.equal((await rows()).filter(r => r.slotId === result[0].record.slotId).length, 1);
      const changed = copy(i); changed.snapshot.payloadFingerprint = 'd'.repeat(64);
      await assert.rejects(rb.create(scope(i), changed, {now: NOW}), {code: 'DELIVERY_CONFLICT'});
      assert.deepEqual(await ra.get(identified(result[0].record)), result[0].record);
    });

    await t.test('concurrent CAS claims have one winner and stale version cannot overwrite committed state', async () => {
      const r = await fresh();
      const results = await Promise.allSettled([ra.claim(identified(r), claimOptions(r, 'race-a')), rb.claim(identified(r), claimOptions(r, 'race-b'))]);
      assert.equal(results.filter(v => v.status === 'fulfilled').length, 1);
      assert.equal(results.filter(v => v.status === 'rejected').length, 1);
      const winner = results.find(v => v.status === 'fulfilled').value;
      assert.deepEqual(await rb.get(identified(r)), winner);
      await assert.rejects(ra.claim(identified(r), claimOptions(r, 'late')));
      assert.deepEqual(await ra.get(identified(r)), winner);
    });

    await t.test('selected scope fences all reads and mutations, including SQL metacharacters', async () => {
      const r = await claimed(); const before = await rows();
      for (const foreign of [
        {...identified(r), companyId: 'foreign'}, {...identified(r), storeId: 'foreign'},
        {...identified(r), companyId: "' OR 1=1 --"},
      ]) {
        assert.equal(await rb.get(foreign), null);
        await assert.rejects(rb.claim(foreign, claimOptions(r)));
        await assert.rejects(rb.start(foreign, {expectedVersion: r.version, token: r.token, now: NOW}));
        await assert.rejects(rb.recover(foreign, {expectedVersion: r.version, now: later(1000)}));
        await assert.rejects(rb.complete(foreign, {expectedVersion: r.version, token: r.token, now: NOW, outcome: 'UNKNOWN'}));
      }
      await assert.rejects(rb.get({...identified(r), slotId: "' OR 1=1 --"}));
      await assert.rejects(rb.create({companyId: 'foreign', storeId: r.input.storeId}, r.input, {now: NOW}));
      assert.deepEqual(await rows(), before);
    });

    await t.test('hostile but valid scope strings are bound as literal values, never SQL', async () => {
      const r = await fresh(ra, {companyId: "test-company' OR 1=1 --", storeId: "test-store'; SELECT 1; --"});
      assert.deepEqual(await rb.get(identified(r)), r);
      const next = await rb.claim(identified(r), claimOptions(r));
      assert.equal(next.version, 2);
      assert.deepEqual(await ra.get(identified(r)), next);
    });

    await t.test('prestart lease recovery persists token history and rejects stale owner and reused token', async () => {
      const r = await claimed();
      const recovered = await rb.recover(identified(r), {expectedVersion: r.version, now: later(1000)});
      assert.equal(recovered.status, 'PENDING'); assert.deepEqual(recovered.usedTokens, [r.token]);
      await assert.rejects(ra.claim(identified(r), claimOptions(recovered, r.token, later(1000))));
      const next = await rb.claim(identified(r), claimOptions(recovered, 'fresh-token', later(1000)));
      await assert.rejects(ra.start(identified(r), {expectedVersion: r.version, token: r.token, now: later(1000)}));
      assert.deepEqual(next.usedTokens, [r.token, 'fresh-token']);
      assert.deepEqual(await ra.get(identified(r)), next);
    });

    await t.test('fresh gate executes inside transaction and denied or thrown gate rolls back create/start', async () => {
      let calls = 0;
      const deny = make(a, async args => {
        calls++; assert.equal(typeof args.tx.$queryRaw, 'function');
        const assertion = eligibility(args); assertion.consentActive = false; return assertion;
      });
      const i = input(`denied-${++sequence}`), before = await rows();
      await assert.rejects(deny.create(scope(i), i, {now: NOW}), {code: 'DELIVERY_BLOCKED'});
      assert.deepEqual(await rows(), before);
      const r = await claimed(), claimBefore = await rows();
      await assert.rejects(deny.start(identified(r), {expectedVersion: r.version, token: r.token, now: NOW}), {code: 'DELIVERY_BLOCKED'});
      assert.equal(calls, 2); assert.deepEqual(await rows(), claimBefore);
      const broken = make(b, async () => { throw new Error('synthetic gate unavailable'); });
      await assert.rejects(broken.start(identified(r), {expectedVersion: r.version, token: r.token, now: NOW}), /synthetic gate unavailable/);
      await assert.rejects(broken.create(scope(i), i, {now: NOW}), /synthetic gate unavailable/);
      assert.deepEqual(await rows(), claimBefore);
    });

    await t.test('failure after SQL and before commit exposes no record or acceptance receipt', async () => {
      const fault = make({$transaction: (fn, ...options) => a.$transaction(async tx => {
        await fn(tx); throw new Error('synthetic before-commit failure');
      }, ...options)});
      const i = input(`rollback-${++sequence}`), before = await rows();
      await assert.rejects(fault.create(scope(i), i, {now: NOW}), /synthetic before-commit failure/);
      assert.deepEqual(await rows(), before);
      const claim = await claimed(), claimBefore = await rows();
      await assert.rejects(fault.start(identified(claim), {expectedVersion: claim.version, token: claim.token, now: NOW}), /synthetic before-commit failure/);
      assert.deepEqual(await rows(), claimBefore);
      assert.equal((await rb.get(identified(claim))).status, 'CLAIMED');
      const r = await attempting(), startedBefore = await rows();
      await assert.rejects(fault.complete(identified(r), {expectedVersion: r.version, token: r.token, now: later(1), outcome: 'ACCEPTED', messageId: 'uncommitted-receipt'}), /synthetic before-commit failure/);
      assert.deepEqual(await rows(), startedBefore);
      assert.equal((await rb.get(identified(r))).messageId, null);
    });

    await t.test('disconnect/reconnect preserves claim and started attempt expires UNKNOWN without resend permission', async () => {
      const r = await claimed(); await a.$disconnect(); await a.$connect();
      assert.deepEqual(await ra.get(identified(r)), r);
      const recovered = await ra.recover(identified(r), {expectedVersion: r.version, now: later(1000)});
      assert.equal(recovered.status, 'PENDING');
      const started = await attempting(); await b.$disconnect(); await b.$connect();
      assert.deepEqual(await rb.get(identified(started)), started);
      const unknown = await rb.recover(identified(started), {expectedVersion: started.version, now: later(1000)});
      assert.equal(unknown.status, 'UNKNOWN'); assert.equal(unknown.messageId, null);
      await assert.rejects(ra.claim(identified(unknown), claimOptions(unknown, 'forbidden-retry', later(1000))));
      assert.deepEqual(await ra.recover(identified(unknown), {expectedVersion: unknown.version, now: later(2000)}), unknown);
    });

    await t.test('committed ACCEPTED receipt is durable and only identical current acknowledgement is idempotent', async () => {
      const r = await attempting();
      const accepted = await ra.complete(identified(r), {expectedVersion: r.version, token: r.token, now: later(1), outcome: 'ACCEPTED', messageId: 'synthetic-transport-accepted'});
      assert.equal(accepted.status, 'ACCEPTED'); await a.$disconnect(); await a.$connect();
      assert.deepEqual(await rb.get(identified(r)), accepted);
      assert.deepEqual(await rb.complete(identified(r), {expectedVersion: accepted.version, token: accepted.token, now: later(2), outcome: 'ACCEPTED', messageId: accepted.messageId}), accepted);
      for (const changes of [{expectedVersion: r.version}, {token: 'wrong-token'}, {messageId: 'conflicting-receipt'}, {outcome: 'UNKNOWN', messageId: undefined}]) {
        const options = {expectedVersion: accepted.version, token: accepted.token, now: later(2), outcome: 'ACCEPTED', messageId: accepted.messageId, ...changes};
        if (options.messageId === undefined) delete options.messageId;
        await assert.rejects(ra.complete(identified(r), options));
      }
      await assert.rejects(rb.claim(identified(r), claimOptions(accepted, 'no-resend', later(2))));
      assert.deepEqual(await rb.get(identified(r)), accepted);
    });

    await t.test('SQL projection and JSON corruption fail closed without overwriting evidence', async () => {
      for (const field of ['version', 'status', 'token', 'slotId', 'companyId', 'storeId', 'input']) {
        const r = await fresh(); const corrupted = copy(r);
        if (field === 'input') corrupted.input.snapshot.lifecycleGeneration = '01';
        else corrupted[field] = field === 'version' ? 99 : `corrupted-${field}`;
        const json = JSON.stringify(corrupted);
        await a.$executeRaw`UPDATE "AutomaticReportDeliverySlot" SET "record" = ${json}::jsonb WHERE "slotId" = ${r.slotId}`;
        const before = await rows();
        await assert.rejects(rb.get(identified(r)), {code: 'DELIVERY_CORRUPT'});
        await assert.rejects(rb.claim(identified(r), claimOptions(r)), {code: 'DELIVERY_CORRUPT'});
        assert.deepEqual(await rows(), before);
      }
      const r = await fresh();
      await a.$executeRaw`UPDATE "AutomaticReportDeliverySlot" SET "version" = 9007199254740991 WHERE "slotId" = ${r.slotId}`;
      await assert.rejects(rb.get(identified(r)), {code: 'DELIVERY_CORRUPT'});
      const badStatus = await fresh();
      await a.$executeRaw`UPDATE "AutomaticReportDeliverySlot" SET "status" = 'ACCEPTED' WHERE "slotId" = ${badStatus.slotId}`;
      await assert.rejects(rb.get(identified(badStatus)), {code: 'DELIVERY_CORRUPT'});
      const badToken = await fresh();
      await a.$executeRaw`UPDATE "AutomaticReportDeliverySlot" SET "token" = 'unrecorded-token' WHERE "slotId" = ${badToken.slotId}`;
      await assert.rejects(rb.get(identified(badToken)), {code: 'DELIVERY_CORRUPT'});
    });

    await t.test('independent control tenant row remains byte-for-byte unchanged', async () => {
      assert.deepEqual((await rows()).find(r => r.slotId === control.slotId), controlBefore);
    });
  } finally {
    try { await Promise.all([a.$disconnect(), b.$disconnect()]); }
    finally {
      try { if (schemaCreated) await admin.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`); }
      finally { await admin.$disconnect(); }
    }
  }
});
