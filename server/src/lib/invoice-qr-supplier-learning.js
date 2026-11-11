// A supplier QR *format* is learned centrally for the company, across stores.
// Never store the QR token itself, use a supplier VAT as the verified identity,
// or treat an unverified link as a trusted provider.
const FORMATS = new Set(["canonical", "impact-view", "epsilon", "aade-mydata"]);
const schemaByDatabase = new WeakMap();

function ensureSchema(database) {
  if (!schemaByDatabase.has(database)) {
    const job = database.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "InvoiceQrSupplierLearning" (
      "companyId" TEXT NOT NULL,
      "supplierVat" TEXT NOT NULL,
      "providerFormat" TEXT NOT NULL,
      "supplierName" TEXT,
      "verifiedCount" INTEGER NOT NULL DEFAULT 0,
      "firstVerifiedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "lastVerifiedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY ("companyId","supplierVat","providerFormat")
    )`).catch(error => {
      schemaByDatabase.delete(database);
      throw error;
    });
    schemaByDatabase.set(database, job);
  }
  return schemaByDatabase.get(database);
}

export async function learnVerifiedInvoiceQrSupplier(database, {
  companyId, supplierVat, supplierName, format, mark
}) {
  const vat = String(supplierVat || "").replace(/^EL/i, "");
  if (!companyId || !/^\d{9}$/.test(vat) || !FORMATS.has(format)
      || !/^\d+$/.test(String(mark || ""))) return false;
  if (!database || typeof database.$executeRawUnsafe !== "function"
      || typeof database.$executeRaw !== "function") return false;
  const name = String(supplierName || "").replace(/\s+/g, " ").trim().slice(0, 250) || null;
  await ensureSchema(database);
  await database.$executeRaw`
    INSERT INTO "InvoiceQrSupplierLearning"
      ("companyId","supplierVat","providerFormat","supplierName","verifiedCount")
    VALUES (${companyId},${vat},${format},${name},1)
    ON CONFLICT ("companyId","supplierVat","providerFormat")
    DO UPDATE SET
      "verifiedCount"="InvoiceQrSupplierLearning"."verifiedCount"+1,
      "supplierName"=COALESCE(EXCLUDED."supplierName","InvoiceQrSupplierLearning"."supplierName"),
      "lastVerifiedAt"=NOW()`;
  return true;
}
