import { randomUUID } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma.js";

import { recordCashTransfer } from "../lib/store-cash-transfer.js";
import { sendEmail } from "../services/mail.js";
import { internalTransferPdf } from "../services/pos-internal-transfer-pdf.js";
import storeTransactions from "./store-transactions.js";

const router = Router();
const transferInput = z.object({
  destinationStoreId: z.string().trim().min(1).optional(),
  externalDestinationName: z.string().trim().min(1).max(200).optional(),
  idempotencyKey: z.string().uuid(),
  expectedPayable: z.string().regex(/^\d+\.\d{2}$/).optional(),
  items: z.array(z.object({
    productId: z.string().min(1),
    quantity: z.number().positive().max(1000000).multipleOf(0.0001),
  })).min(1).max(200),
}).refine(body => Boolean(body.destinationStoreId) !== Boolean(body.externalDestinationName))
  .refine(body => new Set(body.items.map(item => item.productId)).size === body.items.length);

function conflict(message) {
  return Object.assign(new Error(message), { status: 409 });
}

async function transferTotals(db, transferId) {
  const [totals] = await db.$queryRaw`
      WITH net_lines AS (
        SELECT ROUND("quantity" * "unitCost", 2) AS net, "vatRate"
        FROM "PosInternalTransferLine" WHERE "transferId" = ${transferId}
      ), taxed_lines AS (
        SELECT net, ROUND(net * "vatRate" / 100, 2) AS vat
        FROM net_lines
      )
      SELECT SUM(net)::text AS net, SUM(vat)::text AS vat, SUM(net + vat)::text AS payable
      FROM taxed_lines
    `;
  return totals;
}

const transferPath = "/stores/:storeId/internal-transfers";

function canAccessStore(user, storeId) {
  if (!user?.companyId) return false;
  return user.tokenType === "STORE_OPERATOR"
    ? user.storeId === storeId
    : ["OWNER", "ADMIN"].includes(user.role) && !user.staffAccess;
}

router.get(transferPath + "/destinations", async (req, res, next) => {
  const { storeId } = req.params;
  if (!canAccessStore(req.user, storeId)) return res.sendStatus(403);
  try {
    const stores = await prisma.store.findMany({
      where: { companyId: req.user.companyId, active: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });
    if (!stores.some(store => store.id === storeId)) return res.sendStatus(404);
    res.json(stores.filter(store => store.id !== storeId));
  } catch (error) {
    next(error);
  }
});

router.get(transferPath + "/credit", async (req, res, next) => {
  const { storeId } = req.params;
  if (!canAccessStore(req.user, storeId)) return res.sendStatus(403);
  try {
    const transfers = await prisma.$queryRaw`
      SELECT t."id", t."createdAt", origin."name" AS "sourceName",
             COALESCE(destination."name", t."externalDestinationName") AS "destinationName",
             COALESCE(t."destinationStoreId", t."sourceStoreId") = ${storeId} AS "canPayCash",
             amounts.payable::text AS payable
      FROM "PosInternalTransfer" t
      JOIN "Store" origin ON origin."id" = t."sourceStoreId"
      LEFT JOIN "Store" destination ON destination."id" = t."destinationStoreId"
      LEFT JOIN "PosInternalTransferSettlement" payment ON payment."transferId" = t."id"
      CROSS JOIN LATERAL (
        SELECT SUM(net + ROUND(net * "vatRate" / 100, 2)) AS payable
        FROM (
          SELECT ROUND("quantity" * "unitCost", 2) AS net, "vatRate"
          FROM "PosInternalTransferLine" WHERE "transferId" = t."id"
        ) lines
      ) amounts
      WHERE t."companyId" = ${req.user.companyId} AND payment."transferId" IS NULL
        AND (t."sourceStoreId" = ${storeId} OR t."destinationStoreId" = ${storeId})
      ORDER BY t."createdAt" DESC, t."id"
    `;
    res.json(transfers);
  } catch (error) {
    next(error);
  }
});

router.post([transferPath, transferPath + "/quote"], async (req, res, next) => {
  const quoteOnly = req.path.endsWith("/quote");
  const sourceStoreId = req.params.storeId;
  const { companyId, id: userId } = req.user;
  if (!canAccessStore(req.user, sourceStoreId)) return res.status(403).json({ error: "Δεν επιτρέπεται διακίνηση από αυτό το κατάστημα." });
  const parsed = transferInput.safeParse(req.body);
  if (!parsed.success || parsed.data.destinationStoreId === sourceStoreId || (!quoteOnly && !parsed.data.expectedPayable)) {
    return res.status(400).json({ error: "Έλεγξε τον προορισμό και τις ποσότητες." });
  }
  const { destinationStoreId = null, externalDestinationName = null, idempotencyKey, items } = parsed.data;

  try {
    const result = await prisma.$transaction(async tx => {
      const storeIds = [sourceStoreId, destinationStoreId].filter(Boolean).sort();
      const stores = await tx.$queryRaw`
        SELECT "id" FROM "Store"
        WHERE "id" = ANY(${storeIds}::text[]) AND "companyId" = ${companyId} AND "active" = TRUE
        ORDER BY "id" FOR UPDATE
      `;
      if (stores.length !== storeIds.length) throw conflict("Δεν βρέθηκε ενεργό κατάστημα της εταιρείας.");
      if (quoteOnly) {
        const lines = await tx.$queryRaw`
          WITH priced AS (
            SELECT p."id" AS "productId", p."name", requested.quantity,
                   p."costPrice"::numeric(14,6) AS "unitCost",
                   p."vatRate"::numeric(7,4) AS "vatRate"
            FROM jsonb_to_recordset(${JSON.stringify(items)}::jsonb)
              AS requested("productId" text, quantity numeric(14,4))
            JOIN "Product" p ON p."id" = requested."productId"
            JOIN "StoreProduct" sp ON sp."productId" = p."id"
            WHERE p."companyId" = ${companyId} AND p."active" = TRUE
              AND sp."storeId" = ${sourceStoreId} AND sp."active" = TRUE
              AND sp."currentStock" >= requested.quantity
              AND p."costPrice" > 0 AND p."vatRate" BETWEEN 0 AND 100
          ), net_lines AS (
            SELECT *, ROUND(quantity * "unitCost", 2) AS net FROM priced
          ), taxed_lines AS (
            SELECT *, ROUND(net * "vatRate" / 100, 2) AS vat FROM net_lines
          )
          SELECT *, (net + vat)::text AS payable, SUM(net) OVER ()::text AS "totalNet",
            SUM(vat) OVER ()::text AS "totalVat", SUM(net + vat) OVER ()::text AS "totalPayable"
          FROM taxed_lines ORDER BY "productId"
        `;
        if (lines.length !== items.length) {
          throw conflict("Έλεγξε το απόθεμα, την τιμή αγοράς και τον ΦΠΑ των ειδών.");
        }
        const { totalNet: net, totalVat: vat, totalPayable: payable } = lines[0];
        return { net, vat, payable, items: lines.map(({ totalNet, totalVat, totalPayable, ...line }) => line) };
      }
      const transferId = randomUUID();
      const inserted = await tx.$queryRaw`
        INSERT INTO "PosInternalTransfer"
          ("id","companyId","sourceStoreId","destinationStoreId","externalDestinationName","createdByUserId","idempotencyKey")
        VALUES (${transferId},${companyId},${sourceStoreId},${destinationStoreId},${externalDestinationName},${userId},${idempotencyKey})
        ON CONFLICT ("companyId","sourceStoreId","idempotencyKey") DO NOTHING RETURNING "id"
      `;
      if (!inserted.length) {
        if (!bank && storeId !== (transfer.destinationStoreId ?? transfer.sourceStoreId)) return null;
      const bankReference = bank ? reference.data : null;
      const [existing] = await tx.$queryRaw`
          SELECT "id" FROM "PosInternalTransfer"
          WHERE "companyId" = ${companyId} AND "sourceStoreId" = ${sourceStoreId} AND "idempotencyKey" = ${idempotencyKey}
        `;
        return { transferId: existing.id, duplicate: true, ...await transferTotals(tx, existing.id) };
      }
      const productIds = items.map(item => item.productId);
      const products = await tx.$queryRaw`
        SELECT p."id",p."name",p."costPrice",p."vatRate",p."salePrice"
        FROM "Product" p JOIN "StoreProduct" sp ON sp."productId" = p."id"
        WHERE p."id" = ANY(${productIds}::text[]) AND p."companyId" = ${companyId}
          AND p."active" = TRUE AND sp."active" = TRUE AND sp."storeId" = ${sourceStoreId}
      `;
      const byId = new Map(products.map(product => [product.id, product]));
      for (const { productId, quantity } of items.sort((left, right) => left.productId.localeCompare(right.productId))) {
        const product = byId.get(productId);
        if (!product || product.costPrice == null || Number(product.costPrice) <= 0 || product.vatRate == null) {
          throw conflict(`Λείπει ενεργό είδος, τιμή αγοράς ή ΦΠΑ: ${product?.name ?? productId}.`);
        }
        const changed = await tx.$executeRaw`
          UPDATE "StoreProduct" SET "currentStock" = "currentStock" - ${quantity}, "updatedAt" = NOW()
          WHERE "storeId" = ${sourceStoreId} AND "productId" = ${productId}
            AND "active" = TRUE AND "currentStock" >= ${quantity}
        `;
        if (!changed) throw conflict(`Μη επαρκές απόθεμα: ${product.name}.`);
        if (destinationStoreId) {
          await tx.$executeRaw`
            INSERT INTO "StoreProduct" ("id","storeId","productId","salePrice","currentStock","active")
            VALUES (${randomUUID()},${destinationStoreId},${productId},${product.salePrice},${quantity},TRUE)
            ON CONFLICT ("storeId","productId") DO UPDATE
            SET "currentStock" = COALESCE("StoreProduct"."currentStock",0) + EXCLUDED."currentStock", "updatedAt" = NOW()
          `;
        }
        await tx.$executeRaw`
          INSERT INTO "PosInternalTransferLine" ("transferId","productId","quantity","unitCost","vatRate")
          VALUES (${transferId},${productId},${quantity},${product.costPrice},${product.vatRate})
        `;
        for (const [storeId, movementType, delta] of [
          [sourceStoreId, "TRANSFER_OUT", -quantity],
          ...(destinationStoreId ? [[destinationStoreId, "TRANSFER_IN", quantity]] : []),
        ]) {
          await tx.$executeRaw`
            INSERT INTO "StockMovement"
              ("id","storeId","productId","movementType","quantity","unitCost","sourceType","sourceId","note","createdByUserId","idempotencyKey")
            VALUES (${randomUUID()},${storeId},${productId},${movementType},${delta},${product.costPrice},
                    'POS_INTERNAL_TRANSFER',${transferId},${externalDestinationName},${userId},${`${transferId}:${productId}:${movementType}`})
          `;
        }
      }
      const totals = await transferTotals(tx, transferId);
      if (totals.payable !== parsed.data.expectedPayable) {
        throw conflict("Η αξία άλλαξε. Υπολόγισε ξανά το πληρωτέο πριν από την καταχώριση.");
      }
      return { transferId, duplicate: false, ...totals };
    });
    res.status(quoteOnly || result.duplicate ? 200 : 201).json(result);
  } catch (error) {
    if ([403, 409].includes(error.status)) return res.status(error.status).json({ error: error.message });
    next(error);
  }
});

router.post([
  transferPath + "/:transferId/bank-settlement",
  transferPath + "/:transferId/cash-settlement",
], async (req, res, next) => {
  const bank = req.path.endsWith("/bank-settlement");
  const method = bank ? "BANK_TRANSFER" : "CASH";
  const { storeId, transferId } = req.params;
  if (!canAccessStore(req.user, storeId)) return res.sendStatus(403);
  const reference = z.string().trim().min(1).max(200).safeParse(req.body?.reference);
  if (bank && !reference.success) return res.status(400).json({ error: "Συμπλήρωσε τον αριθμό τραπεζικής συναλλαγής." });
  try {
    const settlement = await prisma.$transaction(async tx => {
      const [transfer] = await tx.$queryRaw`
        SELECT "id", "destinationStoreId", "sourceStoreId" FROM "PosInternalTransfer"
        WHERE "id" = ${transferId} AND "companyId" = ${req.user.companyId}
          AND ("sourceStoreId" = ${storeId} OR "destinationStoreId" = ${storeId})
        FOR UPDATE
      `;
      if (!transfer) return null;
      if (!bank && storeId !== (transfer.destinationStoreId ?? transfer.sourceStoreId)) return null;
      const bankReference = bank ? reference.data : null;
      const [existing] = await tx.$queryRaw`
        SELECT "method", "amount"::text AS "amount", "bankReference"
        FROM "PosInternalTransferSettlement" WHERE "transferId" = ${transferId}
      `;
      if (existing) {
        if (existing.method !== method || existing.bankReference !== bankReference) {
          throw conflict("Η διακίνηση έχει ήδη εξοφληθεί.");
        }
        return existing;
      }
      const totals = await transferTotals(tx, transferId);
      if (!bank && transfer.destinationStoreId && Number(totals.payable) > 0) {
        const terminalPos = await storeTransactions.resolveTerminal(req);
        const [session] = await tx.$queryRaw`
          SELECT "id" FROM "CashShiftSession"
          WHERE "companyId" = ${req.user.companyId} AND "storeId" = ${storeId}
            AND "terminalPos" = ${terminalPos} AND "status" = 'OPEN'
          ORDER BY "openedAt" DESC LIMIT 1
        `;
        if (!session) throw conflict("Δεν υπάρχει ανοιχτή βάρδια σε αυτό το ταμείο.");
        await recordCashTransfer(prisma, {
          user: req.user, storeId, terminalPos,
          body: {
            direction: "OUT",
            sessionId: session.id,
            amount: Number(totals.payable),
            reason: `Εξόφληση εσωτερικής διακίνησης ${transferId}`,
            idempotencyKey: `pos-transfer-${transferId}`,
          },
        }, tx);
      }
      const [recorded] = await tx.$queryRaw`
        INSERT INTO "PosInternalTransferSettlement"
          ("transferId","method","amount","bankReference","recordedByUserId")
        VALUES (${transferId},${method},${totals.payable}::numeric,${bankReference},${req.user.id})
        RETURNING "method", "amount"::text AS "amount", "bankReference"
      `;
      return recorded;
    });
    if (!settlement) return res.status(404).json({ error: "Δεν βρέθηκε η διακίνηση." });
    res.json(settlement);
  } catch (error) {
    if ([403, 409].includes(error.status)) return res.status(error.status).json({ error: error.message });
    next(error);
  }
});

router.get(transferPath + "/pending-cash-receipts", async (req, res, next) => {
  const { storeId } = req.params;
  if (!canAccessStore(req.user, storeId)) return res.sendStatus(403);
  if (req.user.tokenType === "STORE_OPERATOR") return res.json([]);
  try {
    res.json(await prisma.$queryRaw`
      SELECT t."id", COALESCE(destination."name", t."externalDestinationName") AS "destinationName",
        s."amount"::text AS amount
      FROM "PosInternalTransfer" t
      JOIN "PosInternalTransferSettlement" s ON s."transferId" = t."id"
      LEFT JOIN "Store" destination ON destination."id" = t."destinationStoreId"
      WHERE t."companyId" = ${req.user.companyId} AND t."sourceStoreId" = ${storeId}
        AND s."method" = 'CASH' AND s."cashReceiptTransactionId" IS NULL
      ORDER BY s."recordedAt" DESC
    `);
  } catch (error) {
    next(error);
  }
});

router.post(transferPath + "/:transferId/cash-receipt", async (req, res, next) => {
  const { storeId, transferId } = req.params;
  if (!canAccessStore(req.user, storeId) || !["OWNER", "ADMIN"].includes(req.user.role) ||
      req.user.tokenType === "STORE_OPERATOR") return res.sendStatus(403);

  try {
    const terminalPos = await storeTransactions.resolveTerminal(req);
    const result = await prisma.$transaction(async tx => {
      const [settlement] = await tx.$queryRaw`
        SELECT s."method", s."amount", s."cashReceiptTransactionId"
        FROM "PosInternalTransferSettlement" s
        JOIN "PosInternalTransfer" t ON t."id" = s."transferId"
        WHERE t."id" = ${transferId} AND t."companyId" = ${req.user.companyId}
          AND t."sourceStoreId" = ${storeId}
        FOR UPDATE OF s
      `;
      if (!settlement) return null;
      if (settlement.method !== "CASH") throw conflict("Η εξόφληση δεν έγινε με μετρητά.");
      if (settlement.cashReceiptTransactionId) {
        return { transactionId: settlement.cashReceiptTransactionId, duplicate: true };
      }
      const [session] = await tx.$queryRaw`
        SELECT "id" FROM "CashShiftSession"
        WHERE "companyId" = ${req.user.companyId} AND "storeId" = ${storeId}
          AND "terminalPos" = ${terminalPos} AND "status" = 'OPEN'
        ORDER BY "openedAt" DESC LIMIT 1
      `;
      if (!session) throw conflict("Δεν υπάρχει ανοιχτή βάρδια σε αυτό το ταμείο.");
      const { transaction } = await recordCashTransfer(prisma, {
        user: req.user, storeId, terminalPos,
        descriptionPrefix: "Είσπραξη εσωτερικής διακίνησης",
        body: { direction: "IN", sessionId: session.id, amount: Number(settlement.amount),
          reason: transferId, idempotencyKey: `pos-transfer-receipt-${transferId}` },
      }, tx);
      await tx.$executeRaw`
        UPDATE "PosInternalTransferSettlement" SET "cashReceiptTransactionId" = ${transaction.id}
        WHERE "transferId" = ${transferId}
      `;
      return { transactionId: transaction.id, duplicate: false };
    });
    if (!result) return res.status(404).json({ error: "Δεν βρέθηκε εξόφληση για τη διακίνηση." });
    res.json(result);
  } catch (error) {
    if ([403, 409].includes(error.status)) return res.status(error.status).json({ error: error.message });
    next(error);
  }
});

router.get(transferPath + "/external-history", async (req, res, next) => {
  const { storeId } = req.params;
  if (!canAccessStore(req.user, storeId)) return res.sendStatus(403);
  try {
    res.json(await prisma.$queryRaw`
      SELECT "id", "externalDestinationName" AS "destinationName", "createdAt"
      FROM "PosInternalTransfer"
      WHERE "companyId" = ${req.user.companyId} AND "sourceStoreId" = ${storeId}
        AND "externalDestinationName" IS NOT NULL
      ORDER BY "createdAt" DESC, "id" LIMIT 100
    `);
  } catch (error) {
    next(error);
  }
});

router.post(transferPath + "/:transferId/email", async (req, res, next) => {
  const { storeId, transferId } = req.params;
  if (!canAccessStore(req.user, storeId)) return res.sendStatus(403);
  const recipient = z.string().trim().max(254).email().safeParse(req.body?.email);
  if (!recipient.success) return res.status(400).json({ error: "Έλεγξε τη διεύθυνση email του παραλήπτη." });
  try {
    const [transfer] = await prisma.$queryRaw`
      SELECT t."id", t."createdAt", t."externalDestinationName" AS "destinationName",
        origin."name" AS "sourceName", payment."method"
      FROM "PosInternalTransfer" t
      JOIN "Store" origin ON origin."id" = t."sourceStoreId"
      LEFT JOIN "PosInternalTransferSettlement" payment ON payment."transferId" = t."id"
      WHERE t."companyId" = ${req.user.companyId} AND t."sourceStoreId" = ${storeId}
        AND t."id" = ${transferId} AND t."externalDestinationName" IS NOT NULL
    `;
    if (!transfer) return res.status(404).json({ error: "Δεν βρέθηκε διακίνηση προς εξωτερικό κατάστημα." });
    const lines = await prisma.$queryRaw`
      WITH net_lines AS (
        SELECT p."name", p."sku", barcode."barcode", l."quantity", l."unitCost", l."vatRate",
          ROUND(l."quantity" * l."unitCost", 2) AS net
        FROM "PosInternalTransferLine" l
        LEFT JOIN "Product" p ON p."id" = l."productId" AND p."companyId" = ${req.user.companyId}
        LEFT JOIN LATERAL (
          SELECT b."barcode" FROM "ProductBarcode" b WHERE b."productId" = p."id"
          ORDER BY b."barcode" LIMIT 1
        ) barcode ON TRUE
        WHERE l."transferId" = ${transferId}
      )
      SELECT *, ROUND(net * "vatRate" / 100, 2) AS vat,
        net + ROUND(net * "vatRate" / 100, 2) AS payable
      FROM net_lines ORDER BY "name", "sku"
    `;
    const pdf = await internalTransferPdf(transfer, lines, await transferTotals(prisma, transferId));
    await sendEmail({
      to: recipient.data, companyId: req.user.companyId, storeId,
      subject: "Εσωτερική διακίνηση προϊόντων",
      text: `Συνημμένα θα βρείτε τη διακίνηση από ${transfer.sourceName} προς ${transfer.destinationName}, με τους κωδικούς, τις ποσότητες και τις τιμές αγοράς για την καταχώρισή σας.`,
      attachments: [{ filename: `diakinisi-${transferId}.pdf`, content: pdf, contentType: "application/pdf" }],
    });
    res.json({ accepted: true });
  } catch (error) {
    next(error);
  }
});

export default router;
