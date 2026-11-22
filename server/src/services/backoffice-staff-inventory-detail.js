import {staffError} from './backoffice-staff-access.js';
import {personalInventoryLine} from './backoffice-staff-inventory-read.js';

const pageSize = 200;

export function inventoryDetailQuery(query) {
  if (!Object.keys(query).length) return null;
  const {after = null, code = null} = query;
  if (Object.keys(query).some(key => !['after', 'code', 'paged'].includes(key))
    || query.paged !== '1'
    || (after !== null && (typeof after !== 'string' || !/^[A-Za-z0-9_-]{1,120}$/.test(after)))
    || (code !== null && (typeof code !== 'string' || !code.trim() || code.length > 180))) {
    throw staffError(400, 'STAFF_INVALID_PAGE', 'Ανανέωσε τις γραμμές της απογραφής.');
  }
  return {after, code: code?.trim() ?? null};
}

export async function personalInventoryDetailPage(db, user, stocktakeId, onlyCounted, canSeeExpected, {after, code}) {
  const rows = await db.$queryRaw`
    WITH visible AS (
      SELECT sl."id", sl."productId", p."name", p."sku",
        sl."expectedQuantity", sl."countedQuantity", sl."countVersion", sl."recountRequired"
      FROM "StocktakeLine" sl
      JOIN "Product" p ON p."id" = sl."productId" AND p."companyId" = ${user.companyId}
      WHERE sl."stocktakeId" = ${stocktakeId}
        AND (NOT ${onlyCounted} OR sl."countedQuantity" IS NOT NULL)
        AND (${code}::text IS NULL OR p."sku" = ${code}
          OR EXISTS (SELECT 1 FROM "ProductBarcode" pb WHERE pb."productId" = p."id" AND pb."barcode" = ${code}))
    ), anchor AS (
      SELECT "name", "id" FROM visible WHERE "id" = ${after}
    ), page AS (
      SELECT v.* FROM visible v
      WHERE ${after}::text IS NULL OR EXISTS (
        SELECT 1 FROM anchor a WHERE (v."name", v."id") > (a."name", a."id")
      )
      ORDER BY v."name", v."id" LIMIT ${pageSize + 1}
    )
    SELECT page.*, COALESCE((
      SELECT json_agg(pb."barcode" ORDER BY pb."createdAt")
      FROM "ProductBarcode" pb WHERE pb."productId" = page."productId"
    ), '[]') AS "barcodes"
    FROM page ORDER BY page."name", page."id"
  `;
  if (after !== null && !rows.length) {
    throw staffError(409, 'STAFF_PAGE_CHANGED', 'Άλλαξαν οι γραμμές. Ανανέωσε την απογραφή.');
  }
  const page = rows.slice(0, pageSize);
  return {
    lines: page.map(line => personalInventoryLine(line, canSeeExpected)),
    nextCursor: rows.length > pageSize ? page.at(-1).id : null,
  };
}
