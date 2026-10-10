import crypto from "crypto";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { parsePromotionDate } from "../promotion-time.js";

const router = Router();
const roles = new Set(["SUPER_ADMIN", "OWNER", "ADMIN", "MANAGER"]);
const id = () => crypto.randomUUID();
const n = (value) => Number(value || 0);
const round4 = (value) => Number(Number(value || 0).toFixed(4));
let offerModeReady = false;
let promotionNameReady = false;
async function ensurePromotionName() {
  if (!promotionNameReady) {
    await prisma.$executeRawUnsafe(`ALTER TABLE "PriceCatalogPromotion" ADD COLUMN IF NOT EXISTS "name" TEXT`);
    promotionNameReady = true;
  }
}
async function ensurePromotionUsageColumns() {
  await prisma.$executeRawUnsafe(
    `ALTER TABLE "SaleLine" ADD COLUMN IF NOT EXISTS "promotionId" TEXT`,
  );
  await prisma.$executeRawUnsafe(
    `ALTER TABLE "SaleLine" ADD COLUMN IF NOT EXISTS "promotionType" TEXT`,
  );
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "SaleLine_promotionId_idx" ON "SaleLine"("promotionId")`,
  );
}

function requireAccess(req, res, next) {
  if (req.user?.tokenType === "STORE_OPERATOR" || !roles.has(req.user?.role))
    return res
      .status(403)
      .json({
        error:
          "Η διαχείριση προσφορών είναι διαθέσιμη μόνο σε Super Admin, Ιδιοκτήτη, Admin ή Manager.",
      });
  next();
}
router.use(requireAccess);
router.use(async (req, res, next) => {
  try {
    if (!offerModeReady) {
      await prisma.$executeRawUnsafe(
        `ALTER TABLE "PriceCatalogPromotion" ADD COLUMN IF NOT EXISTS "offerMode" TEXT NOT NULL DEFAULT 'FIXED_PRICE'`,
      );
      await prisma.$executeRawUnsafe(
        `ALTER TABLE "PriceCatalogPromotion" ADD COLUMN IF NOT EXISTS "discountAmount" NUMERIC(14,4) NOT NULL DEFAULT 0`,
      );
      await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "PriceCatalogPromotionGiftProduct" ("promotionId" TEXT NOT NULL,"companyId" TEXT NOT NULL,"productId" TEXT NOT NULL,"createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),PRIMARY KEY("promotionId","productId"))`);
      await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "PriceCatalogPromotionGiftProduct_company_product_idx" ON "PriceCatalogPromotionGiftProduct"("companyId","productId","promotionId")`);
      await ensurePromotionName();
      offerModeReady = true;
    }
    next();
  } catch (error) {
    next(error);
  }
});

const storeIdsSchema = z.array(z.string().min(1)).max(200).default([]);
const commonFields = {
  name: z.string().trim().min(1).max(180).optional(),
  offerMode: z
    .enum(["DISCOUNT_PERCENT", "DISCOUNT_AMOUNT", "FIXED_PRICE"])
    .optional(),
  offerPrice: z.coerce.number().min(0).nullable().optional(),
  discountPercent: z.coerce.number().min(0).max(100).optional(),
  discountAmount: z.coerce.number().min(0).max(999999).optional(),
  saleQuantity: z.coerce.number().positive().max(9999).optional(),
  bonusQuantity: z.coerce.number().min(0).max(9999).optional(),
  customerPoints: z.coerce.number().min(0).max(999999).optional(),
  validFrom: z.union([z.string(), z.date()]).optional(),
  validUntil: z.union([z.string(), z.date()]).nullable().optional(),
  active: z.boolean().optional(),
  storeIds: storeIdsSchema,
  giftProductIds: z.array(z.string().min(1)).max(200).default([]),
};
const createBody = z.object({
  productId: z.string().min(1),
  promotionType: z.enum(["LEAFLET", "GIFT"]),
  ...commonFields,
  validFrom: z.union([z.string(), z.date()]),
  active: z.boolean().default(true),
  discountPercent: z.coerce.number().min(0).max(100).default(0),
  saleQuantity: z.coerce.number().positive().max(9999).default(1),
  bonusQuantity: z.coerce.number().min(0).max(9999).default(0),
  customerPoints: z.coerce.number().min(0).max(999999).default(0),
});
const bulkCreateBody = createBody
  .omit({ productId: true })
  .extend({ productIds: z.array(z.string().min(1)).min(1).max(200) });
const patchBody = z.object(commonFields);
const scopeBody = z.object({ storeIds: storeIdsSchema });
const asDate = (value, required = false) => {
  if (value === null || value === undefined || value === "") {
    if (required) {
      const e = new Error("Λείπει η έναρξη ισχύος.");
      e.status = 400;
      throw e;
    }
    return null;
  }
  const date = parsePromotionDate(value);
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    const e = new Error("Μη έγκυρη ημερομηνία προσφοράς.");
    e.status = 400;
    throw e;
  }
  return date;
};

async function ownedProduct(companyId, productId) {
  const rows =
    await prisma.$queryRaw`SELECT "id","name","salePrice" FROM "Product" WHERE "companyId"=${companyId} AND "id"=${productId} AND "active"=true LIMIT 1`;
  return rows[0] || null;
}
async function ownedPromotion(companyId, promotionId) {
  const rows =
    await prisma.$queryRaw`SELECT * FROM "PriceCatalogPromotion" WHERE "companyId"=${companyId} AND "id"=${promotionId} LIMIT 1`;
  return rows[0] || null;
}
async function storesFor(companyId, values) {
  const ids = [
    ...new Set(
      (values || []).map((v) => String(v || "").trim()).filter(Boolean),
    ),
  ];
  if (!ids.length) return [];
  const stores = await prisma.store.findMany({
    where: { companyId, active: true, id: { in: ids } },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  if (stores.length !== ids.length) {
    const e = new Error(
      "Ένα ή περισσότερα καταστήματα δεν ανήκουν στην εταιρεία ή δεν είναι ενεργά.",
    );
    e.status = 400;
    throw e;
  }
  return stores;
}
function overlapSqlDateEnd(value) {
  return value || new Date("9999-12-31T23:59:59.999Z");
}
async function findOverlap(
  db,
  {
    companyId,
    productId,
    promotionType,
    validFrom,
    validUntil,
    storeIds,
    excludePromotionId = null,
  },
) {
  if (!storeIds.length) return [];
  return db.$queryRaw`SELECT DISTINCT pr."id",pr."productId",pr."promotionType",pr."validFrom",pr."validUntil",ps."storeId" FROM "PriceCatalogPromotion" pr JOIN "PriceCatalogPromotionStore" ps ON ps."promotionId"=pr."id" AND ps."companyId"=pr."companyId" WHERE pr."companyId"=${companyId} AND pr."productId"=${productId} AND pr."promotionType"=${promotionType} AND pr."active"=true AND (${excludePromotionId}::text IS NULL OR pr."id"<>${excludePromotionId}) AND ps."storeId"=ANY(${storeIds}::text[]) AND pr."validFrom"<=${overlapSqlDateEnd(validUntil)} AND COALESCE(pr."validUntil",'infinity'::timestamptz)>=${validFrom}`;
}
async function lockScope(
  tx,
  { companyId, productId, promotionType, storeIds },
) {
  for (const storeId of [...new Set(storeIds)].sort()) {
    const key = `promo:${companyId}:${productId}:${promotionType}:${storeId}`;
    await tx.$queryRaw`SELECT (pg_advisory_xact_lock(hashtext(${key})) IS NULL) AS locked`;
  }
}
function overlapError(rows) {
  const error = new Error("PROMOTION_STORE_OVERLAP");
  error.status = 409;
  error.code = "PROMOTION_STORE_OVERLAP";
  error.rows = rows;
  return error;
}
function overlapResponse(res, rows) {
  const storeIds = [...new Set(rows.map((r) => r.storeId))],
    promotionIds = [...new Set(rows.map((r) => r.id))];
  return res
    .status(409)
    .json({
      error: `Υπάρχει ήδη ενεργή προσφορά ίδιου τύπου που επικαλύπτεται σε ${storeIds.length} κατάστημα/τα. Απενεργοποίησε ή άλλαξε το διάστημα της προηγούμενης προσφοράς.`,
      code: "PROMOTION_STORE_OVERLAP",
      storeIds,
      promotionIds,
    });
}
async function replaceStores(tx, companyId, promotionId, stores) {
  await tx.$executeRaw`DELETE FROM "PriceCatalogPromotionStore" WHERE "companyId"=${companyId} AND "promotionId"=${promotionId}`;
  for (const store of stores)
    await tx.$executeRaw`INSERT INTO "PriceCatalogPromotionStore" ("promotionId","companyId","storeId") VALUES (${promotionId},${companyId},${store.id}) ON CONFLICT ("promotionId","storeId") DO NOTHING`;
}
async function giftProductsFor(companyId, values) {
  const ids = [...new Set((values || []).map((value) => String(value || "").trim()).filter(Boolean))];
  if (!ids.length) return [];
  const rows = await prisma.$queryRaw`SELECT "id","name" FROM "Product" WHERE "companyId"=${companyId} AND "active"=true AND "id"=ANY(${ids}::text[]) ORDER BY "id"`;
  if (rows.length !== ids.length) {
    const error = new Error("Ένα ή περισσότερα επιτρεπόμενα δώρα δεν ανήκουν στην εταιρεία ή δεν είναι ενεργά.");
    error.status = 400;
    throw error;
  }
  return rows;
}
async function replaceGiftProducts(tx, companyId, promotionId, products) {
  await tx.$executeRaw`DELETE FROM "PriceCatalogPromotionGiftProduct" WHERE "companyId"=${companyId} AND "promotionId"=${promotionId}`;
  for (const product of products)
    await tx.$executeRaw`INSERT INTO "PriceCatalogPromotionGiftProduct" ("promotionId","companyId","productId") VALUES (${promotionId},${companyId},${product.id}) ON CONFLICT ("promotionId","productId") DO NOTHING`;
}
function routeError(res, next, error, message) {
  if (error?.code === "PROMOTION_STORE_OVERLAP")
    return overlapResponse(res, error.rows || []);
  if (error?.name === "ZodError")
    return res.status(400).json({ error: message, details: error.issues });
  next(error);
}

router.post("/promotions/scoped", async (req, res, next) => {
  try {
    const companyId = req.user.companyId,
      b = createBody.parse(req.body || {}),
      product = await ownedProduct(companyId, b.productId);
    if (!product)
      return res.status(404).json({ error: "Δεν βρέθηκε ενεργό προϊόν." });
    const stores = await storesFor(companyId, b.storeIds),
      giftProducts = await giftProductsFor(companyId, b.giftProductIds);
    if (b.promotionType === "GIFT" && !giftProducts.length)
      return res.status(400).json({ error: "Επίλεξε τουλάχιστον ένα επιτρεπόμενο προϊόν δώρου." });
    if (b.active && !stores.length)
      return res
        .status(400)
        .json({
          error: "Επίλεξε τουλάχιστον ένα κατάστημα POS για ενεργή προσφορά.",
        });
    const validFrom = asDate(b.validFrom, true),
      validUntil = asDate(b.validUntil, false);
    if (validUntil && validUntil < validFrom)
      return res
        .status(400)
        .json({
          error: "Η λήξη προσφοράς δεν μπορεί να είναι πριν από την έναρξη.",
        });
    const offerMode =
        b.promotionType === "LEAFLET"
          ? b.offerMode || "FIXED_PRICE"
          : "FIXED_PRICE",
      originalPrice = n(product.salePrice),
      offerPrice =
        b.promotionType === "LEAFLET"
          ? offerMode === "FIXED_PRICE"
            ? round4(
                b.offerPrice ??
                  Math.max(0, originalPrice * (1 - b.discountPercent / 100)),
              )
            : null
          : null,
      discount =
        b.promotionType === "LEAFLET"
          ? offerMode === "DISCOUNT_PERCENT"
            ? b.discountPercent
            : originalPrice > 0
              ? round4(((originalPrice - n(offerPrice)) / originalPrice) * 100)
              : 0
          : b.discountPercent,
      promotionId = id(),
      actor = req.user.fullName || req.user.email || "Χρήστης",
      storeIds = stores.map((s) => s.id);
    await prisma.$transaction(async (tx) => {
      await lockScope(tx, {
        companyId,
        productId: product.id,
        promotionType: b.promotionType,
        storeIds,
      });
      const overlaps = b.active
        ? await findOverlap(tx, {
            companyId,
            productId: product.id,
            promotionType: b.promotionType,
            validFrom,
            validUntil,
            storeIds,
          })
        : [];
      if (overlaps.length) throw overlapError(overlaps);
      await tx.$executeRaw`INSERT INTO "PriceCatalogPromotion" ("id","companyId","productId","promotionType","offerMode","originalPrice","offerPrice","discountPercent","discountAmount","saleQuantity","bonusQuantity","customerPoints","validFrom","validUntil","active","createdByUserId","createdByName") VALUES (${promotionId},${companyId},${product.id},${b.promotionType},${offerMode},${originalPrice},${offerPrice},${discount},${b.discountAmount || 0},${b.saleQuantity},${b.bonusQuantity},${b.customerPoints},${validFrom},${validUntil},${b.active},${req.user.id},${actor})`;
      await replaceStores(tx, companyId, promotionId, stores);
      if (b.promotionType === "GIFT") await replaceGiftProducts(tx, companyId, promotionId, giftProducts);
    });
    res
      .status(201)
      .json({
        id: promotionId,
        storeIds,
        posActive: b.active && stores.length > 0,
      });
  } catch (error) {
    routeError(
      res,
      next,
      error,
      "Ελέγξτε τα στοιχεία και τα καταστήματα της προσφοράς.",
    );
  }
});

export async function createScopedPromotionBatch(user, bodies) {
  if (user?.tokenType === "STORE_OPERATOR" || !roles.has(user?.role)) throw Object.assign(new Error("Δεν επιτρέπεται η διαχείριση προσφορών."), {status:403});
  if (!bodies.length || bodies.length > 1000) throw Object.assign(new Error("Απαιτούνται 1 έως 1.000 γραμμές προσφορών."), {status:400});
  await ensurePromotionName();
  const entries = [];
  for (const body of bodies) {
    const companyId = user.companyId,
      b = bulkCreateBody.parse(body || {}),
      productIds = [...new Set(b.productIds)],
      stores = await storesFor(companyId, b.storeIds),
      giftProducts = await giftProductsFor(companyId, b.giftProductIds);
    if (b.promotionType === "GIFT" && !giftProducts.length)
      throw Object.assign(new Error("Επίλεξε τουλάχιστον ένα επιτρεπόμενο προϊόν δώρου."), {status: 400});
    if (b.active && !stores.length)
      throw Object.assign(new Error("Επίλεξε τουλάχιστον ένα κατάστημα POS για ενεργή προσφορά."), {status: 400});
    if (productIds.length * stores.length > 10000)
      throw Object.assign(new Error("Η μαζική προσφορά ξεπερνά το ασφαλές όριο των 10.000 συνδυασμών προϊόντος/καταστήματος."), {status: 400});
    if (
      b.promotionType === "LEAFLET" &&
      (b.offerMode || "FIXED_PRICE") === "FIXED_PRICE" &&
      productIds.length > 1
    )
      throw Object.assign(new Error("Η κοινή τελική τιμή επιτρέπεται μόνο για ένα προϊόν. Για πολλά προϊόντα χρησιμοποίησε ποσοστό ή έκπτωση σε ευρώ."), {status: 400});
    const products =
      await prisma.$queryRaw`SELECT "id","name","salePrice" FROM "Product" WHERE "companyId"=${companyId} AND "active"=true AND "id"=ANY(${productIds}::text[]) ORDER BY "id"`;
    if (products.length !== productIds.length)
      throw Object.assign(new Error("Ένα ή περισσότερα προϊόντα δεν ανήκουν στην εταιρεία ή δεν είναι ενεργά."), {status: 400});
    const validFrom = asDate(b.validFrom, true),
      validUntil = asDate(b.validUntil, false);
    if (validUntil && validUntil < validFrom)
      throw Object.assign(new Error("Η λήξη προσφοράς δεν μπορεί να είναι πριν από την έναρξη."), {status: 400});
    for (const product of products) entries.push({product,b,stores,giftProducts,validFrom,validUntil});
  }
  if (entries.reduce((total,row)=>total+row.stores.length,0)>10000) throw Object.assign(new Error("Ξεπεράστηκε το όριο συνδυασμών προϊόντος/καταστήματος."),{status:400});
  const companyId=user.companyId, actor=user.fullName||user.email||"Χρήστης", created=[];
  entries.sort((a,b)=>`${a.product.id}:${a.b.promotionType}`.localeCompare(`${b.product.id}:${b.b.promotionType}`));
  await prisma.$transaction(async tx=>{
    for (const {product,b,stores} of entries) await lockScope(tx,{companyId,productId:product.id,promotionType:b.promotionType,storeIds:stores.map(store=>store.id)});
    for (const {product,b,stores,giftProducts,validFrom,validUntil} of entries) {
      const storeIds=stores.map(store=>store.id);
      const overlaps=b.active?await findOverlap(tx,{companyId,productId:product.id,promotionType:b.promotionType,validFrom,validUntil,storeIds}):[];
      if(overlaps.length)throw overlapError(overlaps);
        const promotionId = id(),
          offerMode =
            b.promotionType === "LEAFLET"
              ? b.offerMode || "FIXED_PRICE"
              : "FIXED_PRICE",
          originalPrice = n(product.salePrice),
          offerPrice =
            b.promotionType === "LEAFLET"
              ? offerMode === "FIXED_PRICE"
                ? round4(
                    b.offerPrice ??
                      Math.max(
                        0,
                        originalPrice * (1 - b.discountPercent / 100),
                      ),
                  )
                : null
              : null,
          discount =
            b.promotionType === "LEAFLET"
              ? offerMode === "DISCOUNT_PERCENT"
                ? b.discountPercent
                : originalPrice > 0
                  ? round4(
                      ((originalPrice - n(offerPrice)) / originalPrice) * 100,
                    )
                  : 0
              : b.discountPercent;
        await tx.$executeRaw`INSERT INTO "PriceCatalogPromotion" ("id","companyId","productId","name","promotionType","offerMode","originalPrice","offerPrice","discountPercent","discountAmount","saleQuantity","bonusQuantity","customerPoints","validFrom","validUntil","active","createdByUserId","createdByName") VALUES (${promotionId},${companyId},${product.id},${b.name || null},${b.promotionType},${offerMode},${originalPrice},${offerPrice},${discount},${b.discountAmount || 0},${b.saleQuantity},${b.bonusQuantity},${b.customerPoints},${validFrom},${validUntil},${b.active},${user.id},${actor})`;
        await replaceStores(tx, companyId, promotionId, stores);
        if (b.promotionType === "GIFT")
          await replaceGiftProducts(tx, companyId, promotionId, giftProducts);
        created.push({ id: promotionId, productId: product.id });
    }
  });
  return {created:created.length,items:created,storeIds:[...new Set(entries.flatMap(row=>row.stores.map(store=>store.id)))],giftProductIds:[...new Set(entries.flatMap(row=>row.giftProducts.map(product=>product.id)))],posActive:entries.some(row=>row.b.active&&row.stores.length>0)};
}

router.post("/promotions/scoped/barcode", async (req,res,next)=>{
  try {
    const barcode=z.string().trim().min(3).max(80).parse(req.body?.barcode);
    const rows=await prisma.$queryRaw`SELECT DISTINCT p."id" FROM "Product" p JOIN "ProductBarcode" b ON b."productId"=p."id" WHERE p."companyId"=${req.user.companyId} AND p."active"=true AND b."barcode"=${barcode} LIMIT 2`;
    if(rows.length!==1)return res.status(400).json({error:rows.length?"Το barcode έχει πολλαπλές αντιστοιχίσεις. Χρειάζεται έλεγχος.":"Δεν βρέθηκε ενεργό προϊόν με αυτό το barcode."});
    const name=z.string().trim().min(1).max(180).parse(req.body?.name);
    res.status(201).json(await createScopedPromotionBatch(req.user,[{...req.body,name,productIds:[rows[0].id]}]));
  }catch(error){routeError(res,next,error,"Ελέγξτε το barcode και την προσφορά.");}
});

router.post("/promotions/scoped/bulk", async (req,res,next)=>{
  try { res.status(201).json(await createScopedPromotionBatch(req.user,[req.body||{}])); }
  catch(error){routeError(res,next,error,"Ελέγξτε τα προϊόντα, την έκπτωση και τα καταστήματα της μαζικής προσφοράς.");}
});

router.patch("/promotions/:promotionId/scoped", async (req, res, next) => {
  try {
    const companyId = req.user.companyId,
      old = await ownedPromotion(companyId, req.params.promotionId);
    if (!old) return res.status(404).json({ error: "Δεν βρέθηκε η προσφορά." });
    const b = patchBody.parse(req.body || {}),
      stores = await storesFor(companyId, b.storeIds),
      active = b.active === undefined ? old.active : b.active;
    if (active && !stores.length)
      return res
        .status(400)
        .json({
          error: "Επίλεξε τουλάχιστον ένα κατάστημα POS για ενεργή προσφορά.",
        });
    const validFrom =
        b.validFrom === undefined
          ? new Date(old.validFrom)
          : asDate(b.validFrom, true),
      validUntil =
        b.validUntil === undefined
          ? old.validUntil
            ? new Date(old.validUntil)
            : null
          : asDate(b.validUntil, false);
    if (validUntil && validUntil < validFrom)
      return res
        .status(400)
        .json({
          error: "Η λήξη προσφοράς δεν μπορεί να είναι πριν από την έναρξη.",
        });
    const product = await ownedProduct(companyId, old.productId);
    if (!product)
      return res
        .status(404)
        .json({ error: "Δεν βρέθηκε το προϊόν της προσφοράς." });
    const offerMode =
        old.promotionType === "LEAFLET"
          ? b.offerMode || old.offerMode || "FIXED_PRICE"
          : "FIXED_PRICE",
      originalPrice = n(old.originalPrice || product.salePrice),
      offerPrice =
        old.promotionType === "LEAFLET"
          ? offerMode === "FIXED_PRICE"
            ? b.offerPrice === undefined
              ? old.offerPrice === null
                ? null
                : n(old.offerPrice)
              : round4(b.offerPrice)
            : null
          : null,
      discount =
        old.promotionType === "LEAFLET"
          ? offerMode === "DISCOUNT_PERCENT"
            ? b.discountPercent === undefined
              ? n(old.discountPercent)
              : b.discountPercent
            : offerPrice !== null && originalPrice > 0
              ? round4(((originalPrice - n(offerPrice)) / originalPrice) * 100)
              : 0
          : b.discountPercent === undefined
            ? n(old.discountPercent)
            : b.discountPercent,
      storeIds = stores.map((s) => s.id);
    await prisma.$transaction(async (tx) => {
      await lockScope(tx, {
        companyId,
        productId: old.productId,
        promotionType: old.promotionType,
        storeIds,
      });
      const overlaps = active
        ? await findOverlap(tx, {
            companyId,
            productId: old.productId,
            promotionType: old.promotionType,
            validFrom,
            validUntil,
            storeIds,
            excludePromotionId: old.id,
          })
        : [];
      if (overlaps.length) throw overlapError(overlaps);
      await tx.$executeRaw`UPDATE "PriceCatalogPromotion" SET "offerMode"=${offerMode},"offerPrice"=${offerPrice},"discountPercent"=${discount},"discountAmount"=${b.discountAmount === undefined ? n(old.discountAmount) : b.discountAmount},"saleQuantity"=${b.saleQuantity === undefined ? n(old.saleQuantity) : b.saleQuantity},"bonusQuantity"=${b.bonusQuantity === undefined ? n(old.bonusQuantity) : b.bonusQuantity},"customerPoints"=${b.customerPoints === undefined ? n(old.customerPoints) : b.customerPoints},"validFrom"=${validFrom},"validUntil"=${validUntil},"active"=${active},"updatedAt"=NOW() WHERE "id"=${old.id} AND "companyId"=${companyId}`;
      await replaceStores(tx, companyId, old.id, stores);
    });
    res.json({
      ok: true,
      id: old.id,
      storeIds,
      posActive: active && stores.length > 0,
    });
  } catch (error) {
    routeError(
      res,
      next,
      error,
      "Ελέγξτε τα στοιχεία και τα καταστήματα της προσφοράς.",
    );
  }
});

router.put("/promotions/:promotionId/stores", async (req, res, next) => {
  try {
    const companyId = req.user.companyId,
      promotion = await ownedPromotion(companyId, req.params.promotionId);
    if (!promotion)
      return res.status(404).json({ error: "Δεν βρέθηκε η προσφορά." });
    const b = scopeBody.parse(req.body || {}),
      stores = await storesFor(companyId, b.storeIds),
      validFrom = new Date(promotion.validFrom),
      validUntil = promotion.validUntil ? new Date(promotion.validUntil) : null,
      storeIds = stores.map((s) => s.id);
    await prisma.$transaction(async (tx) => {
      await lockScope(tx, {
        companyId,
        productId: promotion.productId,
        promotionType: promotion.promotionType,
        storeIds,
      });
      const overlaps = promotion.active
        ? await findOverlap(tx, {
            companyId,
            productId: promotion.productId,
            promotionType: promotion.promotionType,
            validFrom,
            validUntil,
            storeIds,
            excludePromotionId: promotion.id,
          })
        : [];
      if (overlaps.length) throw overlapError(overlaps);
      await replaceStores(tx, companyId, promotion.id, stores);
    });
    res.json({
      ok: true,
      storeIds,
      posActive: promotion.active && stores.length > 0,
    });
  } catch (error) {
    routeError(res, next, error, "Μη έγκυρη επιλογή καταστημάτων.");
  }
});

router.get("/promotions/scoped", async (req, res, next) => {
  try {
    const companyId = req.user.companyId;
    const rows =
      await prisma.$queryRaw`SELECT pr."id",pr."name",pr."productId",p."name" AS "productName",p."sku",pr."promotionType",pr."offerMode",pr."originalPrice",pr."offerPrice",pr."discountPercent",pr."discountAmount",pr."saleQuantity",pr."bonusQuantity",pr."validFrom",pr."validUntil",pr."active",pr."createdAt",pr."createdByName",COALESCE(json_agg(json_build_object('id',s."id",'name',s."name")) FILTER (WHERE s."id" IS NOT NULL),'[]'::json) AS "stores"
    FROM "PriceCatalogPromotion" pr
    JOIN "Product" p ON p."id"=pr."productId" AND p."companyId"=pr."companyId"
    LEFT JOIN "PriceCatalogPromotionStore" ps ON ps."promotionId"=pr."id" AND ps."companyId"=pr."companyId"
    LEFT JOIN "Store" s ON s."id"=ps."storeId" AND s."companyId"=pr."companyId"
    WHERE pr."companyId"=${companyId}
    GROUP BY pr."id",p."name",p."sku"
    ORDER BY pr."validFrom" DESC,pr."createdAt" DESC LIMIT 1000`;
    res.json({ items: rows, count: rows.length });
  } catch (error) {
    next(error);
  }
});

router.get("/promotions/analysis", async (req, res, next) => {
  try {
    await ensurePromotionUsageColumns();
    const companyId = req.user.companyId;
    const rows =
      await prisma.$queryRaw`SELECT pr."id",p."name" AS "productName",pr."promotionType",pr."active",pr."validFrom",pr."validUntil",
    COUNT(DISTINCT sl."saleId") FILTER (WHERE s."id" IS NOT NULL AND sl."quantity">0)::int AS "salesCount",
    COALESCE(SUM(CASE WHEN s."id" IS NOT NULL AND sl."quantity">0 THEN sl."quantity" ELSE 0 END),0) AS "soldQuantity",
    COALESCE(SUM(CASE WHEN s."id" IS NOT NULL AND sl."quantity">0 THEN sl."lineTotal" ELSE 0 END),0) AS "salesAmount",
    COALESCE(SUM(CASE WHEN s."id" IS NOT NULL AND sl."quantity">0 THEN sl."discount" ELSE 0 END),0) AS "discountAmount",
    COALESCE(SUM(CASE WHEN s."id" IS NOT NULL AND sl."quantity"<0 THEN -sl."quantity" ELSE 0 END),0) AS "returnedQuantity",
    COALESCE(SUM(CASE WHEN s."id" IS NOT NULL AND sl."quantity"<0 THEN -sl."lineTotal" ELSE 0 END),0) AS "returnedAmount"
    FROM "PriceCatalogPromotion" pr
    JOIN "Product" p ON p."id"=pr."productId" AND p."companyId"=pr."companyId"
    LEFT JOIN "SaleLine" sl ON sl."promotionId"=pr."id"
    LEFT JOIN "Sale" s ON s."id"=sl."saleId" AND s."companyId"=pr."companyId" AND s."status"='COMPLETED'
    WHERE pr."companyId"=${companyId}
    GROUP BY pr."id",p."name"
    ORDER BY "salesAmount" DESC,pr."validFrom" DESC
    LIMIT 1000`;
    const totals = rows.reduce(
      (sum, row) => ({
        salesCount: sum.salesCount + Number(row.salesCount || 0),
        soldQuantity: sum.soldQuantity + Number(row.soldQuantity || 0),
        salesAmount: sum.salesAmount + Number(row.salesAmount || 0),
        discountAmount: sum.discountAmount + Number(row.discountAmount || 0),
        returnedQuantity:
          sum.returnedQuantity + Number(row.returnedQuantity || 0),
        returnedAmount: sum.returnedAmount + Number(row.returnedAmount || 0),
      }),
      {
        salesCount: 0,
        soldQuantity: 0,
        salesAmount: 0,
        discountAmount: 0,
        returnedQuantity: 0,
        returnedAmount: 0,
      },
    );
    res.json({
      items: rows,
      totals,
      captureStartsNow: true,
      note: "Η ανάλυση συνδέει μόνο πωλήσεις που καταγράφηκαν με συγκεκριμένο promotionId. Παλαιότερες πωλήσεις δεν αποδίδονται αναδρομικά σε προσφορά.",
    });
  } catch (error) {
    next(error);
  }
});

export default router;
