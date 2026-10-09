import { randomUUID } from "node:crypto";

// Preparation only. No route, database write, login or provider is enabled here.
// Callers must load lifecycle records from the server and use existing verified
// sessions; request bodies, store names and client DEMO flags are never evidence.
const VERSION = "MWS_CUSTOMER_DEMO_V1";
const DAY = 86_400_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const ACTIONS = new Set([
  "catalog.read", "catalog.write", "stock.read", "stock.write",
  "sale.cash", "shift.read", "shift.write", "report.read", "label.preview"
]);

const CATALOG = [
  ["Γάλα επίδειξης 1L", "Γαλακτοκομικά", 149, 13],
  ["Γιαούρτι επίδειξης 200g", "Γαλακτοκομικά", 89, 13],
  ["Τυρί επίδειξης 200g", "Γαλακτοκομικά", 279, 13],
  ["Ψωμί επίδειξης 500g", "Αρτοποιία", 169, 13],
  ["Φρυγανιές επίδειξης 250g", "Αρτοποιία", 129, 13],
  ["Ρύζι επίδειξης 500g", "Τρόφιμα", 159, 13],
  ["Ζυμαρικά επίδειξης 500g", "Τρόφιμα", 99, 13],
  ["Αλεύρι επίδειξης 1kg", "Τρόφιμα", 119, 13],
  ["Ζάχαρη επίδειξης 1kg", "Τρόφιμα", 139, 13],
  ["Ελαιόλαδο επίδειξης 1L", "Τρόφιμα", 749, 13],
  ["Νερό επίδειξης 1.5L", "Ποτά", 45, 13],
  ["Χυμός επίδειξης 1L", "Ποτά", 189, 13],
  ["Αναψυκτικό επίδειξης 330ml", "Ποτά", 79, 24],
  ["Μπισκότα επίδειξης 200g", "Σνακ", 149, 13],
  ["Απορρυπαντικό επίδειξης 1L", "Καθαριστικά", 399, 24],
  ["Χαρτί κουζίνας επίδειξης", "Καθαριστικά", 249, 24]
];

function fail(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

function instant(value) {
  if (typeof value !== "string") fail("DEMO_INVALID_TIME");
  const time = Date.parse(value);
  if (!Number.isFinite(time) || new Date(time).toISOString() !== value) fail("DEMO_INVALID_TIME");
  return time;
}

function identity(demoId) {
  if (typeof demoId !== "string" || !UUID.test(demoId)) fail("DEMO_INVALID_ID");
  return { demoId, companyId: `customer-demo-${demoId}`, storeId: `customer-demo-store-${demoId}` };
}

function lifetime(createdAt, expiresAt) {
  const start = instant(createdAt), end = instant(expiresAt);
  if (end <= start || end - start > 30 * DAY) fail("DEMO_INVALID_LIFETIME");
  return { start, end };
}

function freeze(value) {
  if (value && typeof value === "object") {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

export function prepareCustomerDemo({ demoId = randomUUID(), createdAt = new Date().toISOString(), expiresAt } = {}) {
  const ids = identity(demoId);
  const end = expiresAt ?? new Date(instant(createdAt) + 14 * DAY).toISOString();
  lifetime(createdAt, end);
  const products = CATALOG.map(([name, category, priceCents, vatRate], index) => ({
    id: `${ids.companyId}-product-${index + 1}`,
    companyId: ids.companyId,
    sku: `DEMO-${String(index + 1).padStart(3, "0")}`,
    name, category, priceCents, vatRate, unit: "PCS"
  }));
  return freeze({
    schemaVersion: VERSION,
    status: "PREPARATION_ONLY",
    installable: false,
    ...ids, createdAt, expiresAt: end,
    company: { id: ids.companyId, name: "MyWorkStation DEMO", taxId: null, active: false },
    store: { id: ids.storeId, companyId: ids.companyId, name: "Σούπερ μάρκετ επίδειξης", active: false, cashCloseEmailEnabled: false },
    products,
    openingStock: products.map(product => ({ storeId: ids.storeId, productId: product.id, quantity: 100 })),
    // No copied LAB history, contact details, credentials or real-device setup.
    users: [], sessions: [], sales: [], payments: [], shifts: [], movements: [],
    providers: [], fiscalDevices: [], eftposDevices: [],
    label: { widthMm: 50, heightMm: 40, watermark: "DEMO" },
    requirements: ["persisted-lifecycle", "existing-auth-and-license", "all-route-and-worker-outbound-guards", "shared-pos-backoffice-context", "windows-acceptance"]
  });
}

// This predicate is a future integration building block, not a replacement for
// existing tenant/store/auth/module/license checks and not installer readiness.
export function assertCustomerDemoAction({ record, session, storeId, action, now = new Date().toISOString() } = {}) {
  if (!record || record.schemaVersion !== VERSION) fail("DEMO_RECORD_REQUIRED");
  const ids = identity(record.demoId);
  if (record.companyId !== ids.companyId || record.storeId !== ids.storeId) fail("DEMO_IDENTITY_MISMATCH");
  const { start, end } = lifetime(record.createdAt, record.expiresAt);
  const time = instant(now);
  if (record.status !== "ACTIVE" || time < start || time >= end) fail("DEMO_INACTIVE");
  if (!session?.id || session.companyId !== ids.companyId || storeId !== ids.storeId) fail("DEMO_SCOPE_MISMATCH");
  if (session.role !== "OWNER" && session.role !== "STORE_OPERATOR") fail("DEMO_ROLE_DENIED");
  if ((session.role === "STORE_OPERATOR" && session.storeId !== ids.storeId) || (session.storeId && session.storeId !== ids.storeId)) fail("DEMO_SCOPE_MISMATCH");
  if (!ACTIONS.has(action)) fail("DEMO_ACTION_DENIED");
  return freeze({ ...ids, action });
}
