import { prepareCustomerDemo } from "../customer-demo.js";

export const demoPreparationEnabled = () => process.env.MWS_CUSTOMER_DEMO_PREPARATION_ENABLED === "true";

export function demoView(row, now = new Date()) {
  return {
    demoId: row.id, companyId: row.companyId, storeId: row.storeId,
    displayName: row.displayName,
    status: row.status === "REVOKED" ? "REVOKED" : row.status !== "PREPARED" ? "INVALID" : row.expiresAt <= now ? "EXPIRED" : "PREPARED",
    createdAt: row.createdAt, expiresAt: row.expiresAt, revokedAt: row.revokedAt,
    installable: false, productCount: 16, label: { widthMm: 50, heightMm: 40 }
  };
}

function error(code, status) {
  const e = new Error(code); e.code = code; e.status = status; throw e;
}

function actorId(actor) {
  if (!actor?.id || !(actor.isSuperAdmin === true || actor.platformRole === "SUPER_ADMIN")) error("DEMO_SUPER_ADMIN_REQUIRED", 403);
  return actor.id;
}

async function audit(tx, actor, event, demoId) {
  await tx.authAudit.create({ data: { userId: actor.id, email: actor.email || "super-admin", event, success: true, deviceName: `customer-demo:${demoId}` } });
}

export async function createDemoPreparation(db, actor, input) {
  const id = actorId(actor);
  // The route validates input; namespace and dates are created by the server.
  const plan = prepareCustomerDemo();
  const categories = [...new Set(plan.products.map(p => p.category))];
  const expiresAt = new Date(Date.parse(plan.createdAt) + input.days * 86_400_000);
  return db.$transaction(async tx => {
    await tx.$queryRaw`SELECT (pg_advisory_xact_lock(hashtext(${`customer-demo:${id}:${input.requestKey}`})) IS NULL) AS locked`;
    const existing = await tx.customerDemo.findUnique({ where: { createdBy_requestKey: { createdBy: id, requestKey: input.requestKey } } });
    if (existing) {
      if (existing.displayName !== input.displayName || existing.expiresAt.getTime() - existing.createdAt.getTime() !== input.days * 86_400_000) error("DEMO_REQUEST_CONFLICT", 409);
      return { created: false, demo: demoView(existing) };
    }
    await tx.company.create({ data: { id: plan.companyId, name: "MyWorkStation DEMO", active: false, taxId: null, licenseStatus: "SUSPENDED", plan: "TRIAL", trialEndsAt: expiresAt } });
    await tx.store.create({ data: { ...plan.store, responsibleEmail: null } });
    for (const [index, name] of categories.entries()) {
      await tx.$executeRaw`INSERT INTO "ProductCategory" ("id","companyId","name","sortOrder","active") VALUES (${`${plan.companyId}-category-${index + 1}`},${plan.companyId},${name},${index},FALSE)`;
    }
    for (const p of plan.products) {
      const price = `${Math.floor(p.priceCents / 100)}.${String(p.priceCents % 100).padStart(2, "0")}`;
      const categoryId = `${plan.companyId}-category-${categories.indexOf(p.category) + 1}`;
      await tx.$executeRaw`INSERT INTO "Product" ("id","companyId","categoryId","sku","name","unit","vatRate","salePrice","costPrice","trackStock","active") VALUES (${p.id},${plan.companyId},${categoryId},${p.sku},${p.name},'PIECE',${p.vatRate},${price}::numeric,0,TRUE,FALSE)`;
      await tx.$executeRaw`INSERT INTO "StoreProduct" ("id","storeId","productId","salePrice","currentStock","minStock","active") VALUES (${`${p.id}-store`},${plan.storeId},${p.id},${price}::numeric,100,0,FALSE)`;
    }
    const row = await tx.customerDemo.create({ data: {
      id: plan.demoId, companyId: plan.companyId, storeId: plan.storeId, displayName: input.displayName,
      schemaVersion: plan.schemaVersion, requestKey: input.requestKey, createdBy: id,
      createdAt: new Date(plan.createdAt), expiresAt, status: "PREPARED"
    } });
    await audit(tx, actor, "CUSTOMER_DEMO_PREPARED", row.id);
    return { created: true, demo: demoView(row) };
  }, { timeout: 15_000 });
}

export async function revokeDemoPreparation(db, actor, demoId) {
  actorId(actor);
  return db.$transaction(async tx => {
    await tx.$queryRaw`SELECT (pg_advisory_xact_lock(hashtext(${`customer-demo-revoke:${demoId}`})) IS NULL) AS locked`;
    const row = await tx.customerDemo.findUnique({ where: { id: demoId } });
    if (!row) error("DEMO_NOT_FOUND", 404);
    const plan = prepareCustomerDemo({ demoId: row.id, createdAt: row.createdAt.toISOString(), expiresAt: row.expiresAt.toISOString() });
    if (row.companyId !== plan.companyId || row.storeId !== plan.storeId || row.schemaVersion !== plan.schemaVersion) error("DEMO_IDENTITY_MISMATCH", 409);
    if (row.status === "REVOKED") return demoView(row);
    await tx.company.update({ where: { id: row.companyId }, data: { active: false } });
    await tx.store.update({ where: { id: row.storeId }, data: { active: false } });
    const revoked = await tx.customerDemo.update({ where: { id: demoId }, data: { status: "REVOKED", revokedAt: new Date(), revokedBy: actor.id } });
    await audit(tx, actor, "CUSTOMER_DEMO_REVOKED", row.id);
    return demoView(revoked);
  });
}
