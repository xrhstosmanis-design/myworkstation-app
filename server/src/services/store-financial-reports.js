import {Prisma} from '@prisma/client';
import {greeceRangeDate} from '../../../shared/greece-time.mjs';

const dayMs = 86400000;
const reports = new Set(['monthly', 'categories', 'category-items', 'suppliers', 'supplier-items', 'products', 'product-days']);

export function financialReportFilters(query) {
  const {from, to, report, key = '', search = ''} = query;
  const dateOnly = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
  const invalid = () => Object.assign(new Error('Μη έγκυρα φίλτρα οικονομικής αναφοράς.'), {status:400});
  if (!dateOnly(from) || !dateOnly(to) || !reports.has(report) ||
      typeof key !== 'string' || typeof search !== 'string' || key.length > 250 || search.length > 120) throw invalid();
  const days = (Date.parse(to) - Date.parse(from)) / dayMs + 1;
  if (!(days >= 1 && days <= 366)) throw invalid();
  const start = greeceRangeDate(from);
  greeceRangeDate(to);
  return {
    start,
    end: greeceRangeDate(new Date(Date.parse(to) + dayMs).toISOString().slice(0,10)),
    days, report, key, search: search.trim()
  };
}

export async function readStoreFinancialReport(db, companyId, storeId, {start,end,days,report,key,search}) {
  const sales = Prisma.sql`
    SELECT s."id", s."total", s."source",
      to_char((s."occurredAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Athens', 'YYYY-MM-DD') AS day
    FROM "Sale" s
    WHERE s."companyId"=${companyId} AND s."storeId"=${storeId}
      AND s."status"='COMPLETED' AND s."source" IN ('POS','POS_REVERSAL')
      AND COALESCE(s."transactionMode",'NORMAL') <> 'CREDIT'
      AND s."occurredAt">=${start.toISOString().slice(0,-1)}::timestamp
      AND s."occurredAt"<${end.toISOString().slice(0,-1)}::timestamp
  `;
  if (report === 'monthly') {
    const rows = await db.$queryRaw`WITH sales AS (${sales})
      SELECT day, COUNT(*) FILTER (WHERE "source"='POS')::int AS sales, SUM("total") AS revenue FROM sales GROUP BY day ORDER BY day`;
    return {days, rows};
  }

  const lines = Prisma.sql`
    WITH sales AS (${sales}), lines AS (
      SELECT s.day, l."productId", l."description", l."quantity", l."lineTotal",
        p."name", p."sku", p."id" AS product,
        json_build_array(c."id")::text AS parent, c."name" AS "parentName",
        json_build_array(c."id", sub."id")::text AS category, sub."id" AS subcategory,
        concat_ws(' / ', COALESCE(c."name",'Χωρίς κατηγορία'), sub."name") AS "categoryName"
      FROM sales s JOIN "SaleLine" l ON l."saleId"=s."id"
      LEFT JOIN "Product" p ON p."id"=l."productId" AND p."companyId"=${companyId}
      LEFT JOIN "ProductCategory" c ON c."id"=p."categoryId" AND c."companyId"=${companyId}
      LEFT JOIN "ProductSubcategory" sub ON sub."id"=p."subcategoryId"
        AND sub."companyId"=${companyId} AND sub."categoryId"=c."id"
    )
  `;
  let query;
  switch (report) {
    case 'categories':
      query = Prisma.sql`SELECT
        CASE WHEN GROUPING(category)=1 THEN parent ELSE category END AS id,
        CASE WHEN GROUPING(category)=1 THEN "parentName"
          ELSE "categoryName" END AS name,
        SUM("quantity") AS quantity, SUM("lineTotal") AS revenue
        FROM lines GROUP BY GROUPING SETS ((parent,"parentName"),(parent,"parentName",category,subcategory,"categoryName"))
        HAVING (GROUPING(category)=1 AND "parentName" IS NOT NULL)
          OR (GROUPING(category)=0 AND ("parentName" IS NULL OR subcategory IS NOT NULL))
        ORDER BY COALESCE("parentName",'Χωρίς κατηγορία'), GROUPING(category) DESC, name, id`;
      break;
    case 'category-items':
      query = Prisma.sql`SELECT COALESCE(product,'') AS id, COALESCE("name","description") AS name,
        "sku", SUM("quantity") AS quantity, SUM("lineTotal") AS revenue
        FROM lines WHERE category=${key} OR parent=${key} GROUP BY 1,2,3 ORDER BY 2,1`;
      break;
    case 'suppliers':
      query = Prisma.sql`SELECT DISTINCT sup."id", sup."name" FROM "Supplier" sup
        JOIN "SupplierProductLink" link ON link."supplierId"=sup."id" AND link."companyId"=${companyId} AND link."active"
        JOIN lines ON lines.product=link."productId" WHERE sup."companyId"=${companyId}
        ORDER BY sup."name", sup."id"`;
      break;
    case 'supplier-items':
      query = Prisma.sql`SELECT product AS id, "name", "sku",
        SUM("quantity") AS quantity, SUM("lineTotal") AS revenue
        FROM lines WHERE EXISTS (
          SELECT 1 FROM "SupplierProductLink" link
          JOIN "Supplier" sup ON sup."id"=link."supplierId" AND sup."companyId"=${companyId}
          WHERE link."companyId"=${companyId} AND link."active"
            AND link."productId"=lines.product AND link."supplierId"=${key}
        ) GROUP BY 1,2,3 ORDER BY 2,1`;
      break;
    case 'products':
      query = Prisma.sql`SELECT DISTINCT product AS id, "name", "sku" FROM lines
        WHERE product IS NOT NULL AND (strpos(lower("name"), lower(${search}))>0 OR "sku"=${search}
          OR EXISTS (SELECT 1 FROM "ProductBarcode" b WHERE b."productId"=lines.product AND b."barcode"=${search}))
        ORDER BY "name", product LIMIT 100`;
      break;
    case 'product-days':
      query = Prisma.sql`SELECT day, SUM("quantity") AS quantity, SUM("lineTotal") AS revenue
        FROM lines WHERE product=${key} GROUP BY day ORDER BY day`;
  }
  return {days, rows:await db.$queryRaw(Prisma.sql`${lines} ${query}`)};
}
