import assert from "node:assert/strict";
import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { PrismaClient } from "@prisma/client";
import { prepareCustomerDemo } from "../src/customer-demo.js";

// Fail before connecting or requesting unless both destinations are explicit CI-local fixtures.
const base = new URL(process.env.E2E_BASE_URL || "http://127.0.0.1:8080");
const database = new URL(process.env.DATABASE_URL);
assert.equal(process.env.NODE_ENV, "test");
assert.equal(process.env.MWS_CUSTOMER_DEMO_PREPARATION_ENABLED, "true");
for (const url of [base, database]) assert.ok(["localhost", "127.0.0.1"].includes(url.hostname), "Only loopback destinations are allowed");
assert.equal(base.protocol, "http:"); assert.equal(base.pathname, "/");
assert.equal(base.search, ""); assert.equal(base.hash, ""); assert.equal(base.username, ""); assert.equal(base.password, "");
assert.equal(database.pathname, "/myworkstation_test");
const db = new PrismaClient(), run = crypto.randomUUID();
const request = async (path, token, method = "GET", body) => {
  const res = await fetch(new URL(path, base), { method, redirect: "manual", headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body ? { "content-type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, body: await res.json() };
};
const root = "/api/platform/customer-demos";
let trigger;
try {
  const [identity] = await db.$queryRaw`SELECT current_database() AS name`;
  assert.equal(identity.name, "myworkstation_test");
  const control = await db.company.create({ data: { name: "Synthetic demo preparation control", active: true, licenseStatus: "ACTIVE" } });
  const controlStore = await db.store.create({ data: { name: "Untouched control", companyId: control.id, cashCloseEmailEnabled: false } });
  const actor = async role => {
    const user = await db.user.create({ data: { email: `demo-${role}-${run}@example.invalid`, fullName: "Synthetic lifecycle actor", role, companyId: control.id, passwordHash: "isolated-no-login", mustChangePassword: false } });
    const session = await db.userSession.create({ data: { userId: user.id, expiresAt: new Date(Date.now() + 86_400_000) } });
    return { user, token: jwt.sign({ id: user.id, email: user.email, companyId: control.id, role: role === "SUPER_ADMIN" ? "OWNER" : role, isSuperAdmin: role === "SUPER_ADMIN", ...(role === "SUPER_ADMIN" ? { platformRole: "SUPER_ADMIN" } : {}), sessionId: session.id, sessionVersion: user.sessionVersion }, process.env.JWT_SECRET, { expiresIn: "10m" }) };
  };
  const sa = await actor("SUPER_ADMIN"), owner = await actor("OWNER"), employee = await actor("EMPLOYEE");
  const before = await db.company.findUnique({ where: { id: control.id }, include: { stores: true } });
  for (const [token, status] of [[undefined, 401], [owner.token, 403], [employee.token, 403]]) {
    assert.equal((await request(root, token)).status, status);
    assert.equal((await request(root, token, "POST", { requestKey: run, displayName: "Denied", days: 14 })).status, status);
    assert.equal((await request(`${root}/${run}/revoke`, token, "POST", {})).status, status);
  }
  assert.equal((await request(root, sa.token)).body.enabled, true);
  const aInput = { requestKey: crypto.randomUUID(), displayName: "Demo A", days: 14 };
  const a = await request(root, sa.token, "POST", aInput); assert.equal(a.status, 201, JSON.stringify(a.body));
  const bInput = { requestKey: crypto.randomUUID(), displayName: "Demo B", days: 14 };
  const pair = await Promise.all([request(root, sa.token, "POST", bInput), request(root, sa.token, "POST", bInput)]);
  assert.deepEqual(pair.map(r => r.status).sort(), [200, 201]);
  assert.equal(pair[0].body.demo.demoId, pair[1].body.demo.demoId);
  const b = pair[0].body.demo;
  assert.notEqual(a.body.demo.companyId, b.companyId); assert.notEqual(a.body.demo.storeId, b.storeId);
  assert.equal((await request(root, sa.token, "POST", aInput)).body.demo.demoId, a.body.demo.demoId);
  assert.equal((await request(root, sa.token, "POST", { ...aInput, displayName: "Conflicting reuse" })).status, 409);
  for (const bad of [{ ...aInput, active: true }, { ...aInput, sourceCompanyId: control.id }, { ...aInput, days: 31 }, { ...aInput, requestKey: "real-company" }]) assert.equal((await request(root, sa.token, "POST", bad)).status, 400);
  for (const demo of [a.body.demo, b]) {
    assert.equal(demo.installable, false); assert.equal(demo.status, "PREPARED");
    const company = await db.company.findUnique({ where: { id: demo.companyId }, include: { stores: true, users: true, modules: true } });
    assert.equal(company.active, false); assert.equal(company.licenseStatus, "SUSPENDED");
    assert.equal(company.taxId, null); assert.equal(company.users.length, 0); assert.equal(company.modules.length, 0);
    assert.equal(company.stores.length, 1); assert.equal(company.stores[0].id, demo.storeId);
    assert.equal(company.stores[0].active, false); assert.equal(company.stores[0].cashCloseEmailEnabled, false);
    const rows = await db.$queryRaw`SELECT p."id",p."categoryId",p."sku",p."unit",(p."salePrice"*100) AS "priceCents",p."active",sp."storeId",sp."currentStock",sp."active" AS "storeActive" FROM "Product" p JOIN "StoreProduct" sp ON sp."productId"=p."id" WHERE p."companyId"=${demo.companyId} ORDER BY p."sku"`;
    const fixture = prepareCustomerDemo({ demoId: demo.demoId }).products;
    assert.equal(rows.length, 16);
    rows.forEach((p, i) => { assert.equal(p.id, fixture[i].id); assert.equal(Number(p.priceCents), fixture[i].priceCents); assert.equal(Number(p.currentStock), 100); assert.equal(p.storeId, demo.storeId); assert.equal(p.active, false); assert.equal(p.storeActive, false); assert.equal(p.unit, "PIECE"); assert.ok(p.categoryId.startsWith(demo.companyId + "-category-")); });
    const categories = await db.$queryRaw`SELECT "name","active" FROM "ProductCategory" WHERE "companyId"=${demo.companyId}`;
    assert.equal(categories.length, new Set(fixture.map(p => p.category)).size); assert.ok(categories.every(p => p.active === false));
    for (const [route, method] of [[`/api/platform/companies/${demo.companyId}`, "PATCH"], [`/api/platform/companies/${demo.companyId}/license`, "PUT"], [`/api/platform/companies/${demo.companyId}/stores/${demo.storeId}`, "PUT"], [`/api/platform/companies/${demo.companyId}/stores/${demo.storeId}/rbs-installation`, "PUT"], [`/api/platform/companies/${demo.companyId}/impersonate`, "POST"]]) assert.equal((await request(route, sa.token, method, { active: true })).status, 409);
    const [empty] = await db.$queryRaw`SELECT (SELECT COUNT(*)::int FROM "Sale" WHERE "companyId"=${demo.companyId}) AS sales,(SELECT COUNT(*)::int FROM "StockMovement" WHERE "storeId"=${demo.storeId}) AS movements,(SELECT COUNT(*)::int FROM "StoreFiscalDevice" WHERE "storeId"=${demo.storeId}) AS fiscal,(SELECT COUNT(*)::int FROM "StoreEftposDevice" WHERE "storeId"=${demo.storeId}) AS cards`;
    assert.deepEqual(empty, { sales: 0, movements: 0, fiscal: 0, cards: 0 });
  }
  assert.equal(await db.authAudit.count({ where: { userId: sa.user.id, event: "CUSTOMER_DEMO_PREPARED" } }), 2);
  const revoked = await request(`${root}/${a.body.demo.demoId}/revoke`, sa.token, "POST", {}); assert.equal(revoked.status, 200); assert.equal(revoked.body.demo.status, "REVOKED");
  const again = await request(`${root}/${a.body.demo.demoId}/revoke`, sa.token, "POST", {}); assert.deepEqual(again.body, revoked.body);
  assert.equal(await db.authAudit.count({ where: { userId: sa.user.id, event: "CUSTOMER_DEMO_REVOKED" } }), 1);
  assert.equal((await request(root, sa.token, "POST", aInput)).body.demo.status, "REVOKED");
  assert.equal((await request(`${root}/${run}/revoke`, sa.token, "POST", {})).status, 404);
  await db.customerDemo.update({ where: { id: b.demoId }, data: { createdAt: new Date(Date.now() - 15 * 86_400_000), expiresAt: new Date(Date.now() - 86_400_000) } });
  const list = await request(root, sa.token); assert.equal(list.body.demos.find(d => d.demoId === b.demoId).status, "EXPIRED"); assert.ok(list.body.demos.every(d => d.installable === false));

  // A late real SQL failure must roll back the company, store, catalog and lifecycle together.
  const name = `demo_fail_${run.replaceAll("-", "")}`; trigger = name;
  await db.$executeRawUnsafe(`CREATE FUNCTION "${name}"() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."companyId" LIKE 'customer-demo-%' AND NEW."sku" = 'DEMO-016' THEN RAISE EXCEPTION 'isolated demo rollback fixture'; END IF; RETURN NEW; END $$`);
  await db.$executeRawUnsafe(`CREATE TRIGGER "${name}" BEFORE INSERT ON "Product" FOR EACH ROW EXECUTE FUNCTION "${name}"()`);
  const counts = await db.company.count({ where: { id: { startsWith: "customer-demo-" } } });
  const failureKey = crypto.randomUUID();
  assert.equal((await request(root, sa.token, "POST", { requestKey: failureKey, displayName: "Rollback only", days: 14 })).status, 500);
  assert.equal(await db.company.count({ where: { id: { startsWith: "customer-demo-" } } }), counts);
  assert.equal(await db.customerDemo.count({ where: { createdBy: sa.user.id, requestKey: failureKey } }), 0);
  assert.equal(await db.authAudit.count({ where: { userId: sa.user.id, event: "CUSTOMER_DEMO_PREPARED" } }), 2);
  assert.deepEqual(await db.company.findUnique({ where: { id: control.id }, include: { stores: true } }), before);
  assert.deepEqual(await db.store.findUnique({ where: { id: controlStore.id } }), before.stores[0]);
  console.log("Customer demo preparation PostgreSQL + HTTP PASS: two inactive tenants, exact catalog/stock, SA-only access, concurrent idempotency, activation/provider lock, expiry/revocation, one audit/event, atomic rollback and untouched control. Runtime POS/Backoffice and Windows acceptance NOT TESTED.");
} finally {
  if (trigger) { await db.$executeRawUnsafe(`DROP TRIGGER IF EXISTS "${trigger}" ON "Product"`); await db.$executeRawUnsafe(`DROP FUNCTION IF EXISTS "${trigger}"()`); }
  await db.$disconnect();
}
