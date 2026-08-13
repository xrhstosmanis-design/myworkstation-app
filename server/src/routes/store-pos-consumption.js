import { Router } from "express";
import crypto from "crypto";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { auth } from "../middleware/auth.js";

const router = Router();
router.use(auth);
const money = (value) => Number(value || 0);
const round2 = (value) => Number(Number(value || 0).toFixed(2));

const schema = z.object({
  kind: z.enum(["WASTE", "SELF_CONSUMPTION"]),
  items: z.array(z.object({ productId: z.string().min(1), quantity: z.coerce.number().positive().max(999) })).min(1).max(200),
  note: z.string().trim().max(500).optional().nullable(),
});

function assertStore(req, storeId) {
  if (req.user?.tokenType === "STORE_OPERATOR" && req.user.storeId !== storeId) {
    const error = new Error("Η πρόσβαση ισχύει μόνο για το δικό σου κατάστημα.");
    error.status = 403;
    throw error;
  }
}

router.post("/stores/:storeId/consumption", async (req, res, next) => {
  try {
    assertStore(req, req.params.storeId);
    const body = schema.parse(req.body || {});
    const store = await prisma.store.findFirst({ where: { id: req.params.storeId, companyId: req.user.companyId, active: true }, select: { id: true } });
    if (!store) return res.status(404).json({ error: "Δεν βρέθηκε ενεργό κατάστημα." });
    const shift = (await prisma.$queryRaw`SELECT "id" FROM "CashShiftSession" WHERE "companyId"=${req.user.companyId} AND "storeId"=${store.id} AND "status"='OPEN' ORDER BY "openedAt" DESC LIMIT 1`)[0];
    if (!shift) return res.status(409).json({ error: "Δεν υπάρχει ανοιχτή βάρδια." });
    const ids = [...new Set(body.items.map((item) => item.productId))];
    const rows = await prisma.$queryRaw`SELECT p."id",p."name",p."sku",p."vatRate",COALESCE(sp."salePrice",p."salePrice") AS "salePrice" FROM "Product" p JOIN "StoreProduct" sp ON sp."productId"=p."id" WHERE p."companyId"=${req.user.companyId} AND p."active"=true AND sp."storeId"=${store.id} AND sp."active"=true AND p."id"=ANY(${ids}::text[])`;
    if (rows.length !== ids.length) return res.status(400).json({ error: "Ένα ή περισσότερα προϊόντα δεν είναι ενεργά στο κατάστημα." });
    const byId = new Map(rows.map((row) => [row.id, row]));
    const items = body.items.map((item) => {
      const product = byId.get(item.productId);
      const quantity = money(item.quantity);
      const unitPrice = money(product.salePrice);
      return { productId: item.productId, name: product.name, sku: product.sku, quantity, unitPrice, vatRate: money(product.vatRate), lineTotal: round2(quantity * unitPrice) };
    });
    const total = round2(items.reduce((sum, item) => sum + item.lineTotal, 0));
    const saleId = crypto.randomUUID();
    const actor = req.user.fullName || "Πωλητής";
    const label = body.kind === "WASTE" ? "ΦΥΡΑ" : "ΙΔΙΑ ΚΑΤΑΝΑΛΩΣΗ";
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`INSERT INTO "Sale" ("id","companyId","storeId","operatorEmployeeId","fiscalStatus","subtotal","discount","total","status","source") VALUES (${saleId},${req.user.companyId},${store.id},${req.user.employeeId || null},'NON_FISCAL',${total},0,${total},'COMPLETED',${body.kind})`;
      for (const item of items) {
        await tx.$executeRaw`INSERT INTO "SaleLine" ("id","saleId","productId","description","quantity","unitPrice","discount","vatRate","lineTotal") VALUES (${crypto.randomUUID()},${saleId},${item.productId},${item.name},${item.quantity},${item.unitPrice},0,${item.vatRate},${item.lineTotal})`;
        await tx.$executeRaw`UPDATE "StoreProduct" SET "currentStock"=COALESCE("currentStock",0)-${item.quantity} WHERE "storeId"=${store.id} AND "productId"=${item.productId}`;
      }
      if (body.kind === "WASTE") {
        await tx.$executeRaw`INSERT INTO "Payment" ("id","saleId","method","amount") VALUES (${crypto.randomUUID()},${saleId},'CASH',${total})`;
        await tx.$executeRaw`INSERT INTO "StoreTransaction" ("id","companyId","storeId","sessionId","type","amount","description","actorId","actorName") VALUES (${crypto.randomUUID()},${req.user.companyId},${store.id},${shift.id},'SALE_CASH',${total},${`POS ΦΥΡΑ · ${saleId}${body.note ? ` · ${body.note}` : ""}`},${req.user.id},${actor})`;
      }
      await tx.$executeRaw`INSERT INTO "PosOperationalEvent" ("id","companyId","storeId","sessionId","operatorId","operatorName","type","itemsJson","detailsJson","total") VALUES (${crypto.randomUUID()},${req.user.companyId},${store.id},${shift.id},${req.user.id},${actor},${body.kind},${JSON.stringify(items)}::jsonb,${JSON.stringify({ note: body.note || null, noReceipt: true, countsInCashTurnover: body.kind === "WASTE" })}::jsonb,${total})`;
      await tx.$executeRaw`INSERT INTO "PosSaleActionAudit" ("id","companyId","storeId","saleId","actionType","reason","actorId","actorName","details") VALUES (${crypto.randomUUID()},${req.user.companyId},${store.id},${saleId},${body.kind},${body.note || null},${req.user.id || null},${actor},${JSON.stringify({ items, total, receipt: false, cashTurnover: body.kind === "WASTE" })}::jsonb)`;
    });
    res.status(201).json({ ok: true, saleId, kind: body.kind, label, total, fiscalStatus: "NON_FISCAL", receipt: false, cashTurnover: body.kind === "WASTE", items });
  } catch (error) {
    if (error?.name === "ZodError") return res.status(400).json({ error: "Επίλεξε Φύρα ή Ίδια κατανάλωση και έλεγξε τις ποσότητες.", details: error.issues });
    next(error);
  }
});

export default router;
