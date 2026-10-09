import test from "node:test";
import assert from "node:assert/strict";
import { prepareCustomerDemo, assertCustomerDemoAction } from "../src/customer-demo.js";

const demoId = "11111111-1111-4111-8111-111111111111";
const createdAt = "2026-10-09T00:00:00.000Z";
const now = "2026-10-10T00:00:00.000Z";
const plan = () => prepareCustomerDemo({ demoId, createdAt });
const context = () => {
  const record = { ...plan(), status: "ACTIVE" };
  return { record, session: { id: "verified-session", companyId: record.companyId, role: "OWNER" }, storeId: record.storeId, action: "catalog.read", now };
};
function rejected(input, code) {
  assert.throws(() => assertCustomerDemoAction(input), error => error.code === code);
}

test("each preparation has a fresh independent company/store/catalog and no operational history", () => {
  const a = prepareCustomerDemo({ createdAt }), b = prepareCustomerDemo({ createdAt });
  assert.notEqual(a.companyId, b.companyId);
  assert.notEqual(a.storeId, b.storeId);
  assert.equal(a.status, "PREPARATION_ONLY");
  assert.equal(a.installable, false);
  assert.equal(a.company.active, false);
  assert.equal(a.store.active, false);
  const foreign = new Set(b.products.map(p => p.id));
  for (const p of a.products) {
    assert.equal(p.companyId, a.companyId);
    assert.equal(foreign.has(p.id), false);
    const stock = a.openingStock.find(s => s.productId === p.id);
    assert.equal(stock.storeId, a.storeId);
    assert.equal(stock.quantity, 100);
    assert.ok(Number.isSafeInteger(p.priceCents) && p.priceCents > 0);
  }
  for (const key of ["users", "sessions", "sales", "payments", "shifts", "movements", "providers", "fiscalDevices", "eftposDevices"]) assert.deepEqual(a[key], []);
  assert.equal(a.store.cashCloseEmailEnabled, false);
  assert.equal(a.company.taxId, null);
  assert.deepEqual(a.label, { widthMm: 50, heightMm: 40, watermark: "DEMO" });
});

test("synthetic plan is reproducible and cannot be mutated into live setup", () => {
  assert.deepEqual(plan(), plan());
  assert.throws(() => { plan().products[0].companyId = "real-company"; }, TypeError);
  assert.throws(() => { plan().openingStock.push({}); }, TypeError);
  assert.throws(() => { plan().installable = true; }, TypeError);
});

test("preparation rejects real IDs, malformed timestamps and excessive or reversed lifetime", () => {
  for (const id of ["real-company", "", null, "11111111-1111-1111-1111-111111111111"]) assert.throws(() => prepareCustomerDemo({ demoId: id, createdAt }), /DEMO_INVALID_ID/);
  for (const date of ["2026-10-09", "invalid", null, "2026-02-30T00:00:00.000Z"]) assert.throws(() => prepareCustomerDemo({ demoId, createdAt: date }), /DEMO_INVALID_TIME/);
  for (const expiresAt of [createdAt, "2026-10-08T00:00:00.000Z", "2026-11-09T00:00:00.000Z"]) assert.throws(() => prepareCustomerDemo({ demoId, createdAt, expiresAt }), /DEMO_INVALID_LIFETIME/);
});

test("exact integer cents preserve basket values without decimal rounding", () => {
  const p = plan().products;
  assert.equal(3 * p[0].priceCents + 2 * p[10].priceCents + p[12].priceCents, 616);
});

test("lifecycle predicate rejects inactive preparation and revoked or expired records", () => {
  rejected({ ...context(), record: plan() }, "DEMO_INACTIVE");
  rejected({ ...context(), record: null }, "DEMO_RECORD_REQUIRED");
  for (const status of ["REVOKED", "EXPIRED", undefined]) rejected({ ...context(), record: { ...context().record, status } }, "DEMO_INACTIVE");
  rejected({ ...context(), now: createdAt.replace("09T", "08T") }, "DEMO_INACTIVE");
  rejected({ ...context(), now: plan().expiresAt }, "DEMO_INACTIVE");
});

test("owner and store-bound operator contexts resolve the same explicit demo scope", () => {
  const c = context();
  assert.equal(assertCustomerDemoAction(c).companyId, c.record.companyId);
  assert.equal(assertCustomerDemoAction({ ...c, session: { ...c.session, role: "STORE_OPERATOR", storeId: c.storeId }, action: "sale.cash" }).storeId, c.storeId);
  rejected({ ...c, session: null }, "DEMO_SCOPE_MISMATCH");
  rejected({ ...c, session: { ...c.session, role: "STORE_OPERATOR" } }, "DEMO_SCOPE_MISMATCH");
  for (const role of ["PLATFORM_ADMIN", "CUSTOMER", undefined]) rejected({ ...c, session: { ...c.session, role } }, "DEMO_ROLE_DENIED");
});

test("a second demo or real store cannot be addressed by either demo role", () => {
  const c = context(), other = prepareCustomerDemo({ createdAt });
  for (const storeId of [other.storeId, "real-store", "", undefined]) rejected({ ...c, storeId }, "DEMO_SCOPE_MISMATCH");
  rejected({ ...c, session: { ...c.session, companyId: other.companyId } }, "DEMO_SCOPE_MISMATCH");
  rejected({ ...c, session: { ...c.session, storeId: other.storeId } }, "DEMO_SCOPE_MISMATCH");
  rejected({ ...c, record: { ...c.record, companyId: "real-company" } }, "DEMO_IDENTITY_MISMATCH");
  rejected({ ...c, record: { ...c.record, storeId: other.storeId } }, "DEMO_IDENTITY_MISMATCH");
});

test("provider, payment, tax, email, settings and unknown actions always fail closed", () => {
  for (const action of ["sale.card", "sale.iris", "fiscal.execute", "mydata.submit", "email.send", "ocr.execute", "bank.connect", "provider.configure", "settings.write", "sale.refund", "future.action", "", null]) rejected({ ...context(), action }, "DEMO_ACTION_DENIED");
});
