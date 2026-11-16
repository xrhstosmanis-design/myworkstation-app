import {buildSupplierPriceComparison} from "../lib/supplier-price-comparison.js";

export async function readSupplierComparison(db,{companyId,storeId,month}) {
    if (month !== undefined && (typeof month !== "string" || !/^[1-9]\d{3}-(0[1-9]|1[0-2])$/.test(month))) {
      throw Object.assign(new Error("Μη έγκυρος μήνας"), {status:400});
    }
    const fromDay = month ? month + "-01" : null;
    const lines = await db.$queryRaw`
      SELECT l."id" AS "lineId",l."quantity",l."unit",l."unitsPerPackage",l."netAmount",
        p."id" AS "productId",p."name" AS "productName",p."sku",p."unit" AS "productUnit",
        s."id" AS "supplierId",s."name" AS "supplierName",
        d."id" AS "documentId",d."documentNumber",d."documentDate",
        d."createdAt" AS "documentCreatedAt",d."sourceType",
        correction."id" AS "correctionId",correction."unitCost" AS "correctedUnitCost",
        original."baseQuantity" AS "orderBaseQuantity",original."netAmount" AS "orderNetAmount",
        original."invalidUnits" AS "orderInvalidUnits"
      FROM "PurchaseDocumentLine" l
      JOIN "PurchaseDocument" d ON d."id"=l."purchaseDocumentId"
      JOIN "Product" p ON p."id"=l."productId" AND p."companyId"=${companyId}
      JOIN "Supplier" s ON s."id"=d."supplierId" AND s."companyId"=${companyId}
      LEFT JOIN LATERAL (
        SELECT sm."id",sm."unitCost" FROM "StockMovement" sm
        WHERE d."sourceType"='PURCHASE_ORDER' AND sm."sourceType"='PURCHASE_ORDER'
          AND sm."sourceId"=d."id" AND sm."storeId"=${storeId}
          AND sm."productId"=p."id" AND sm."movementType"='PURCHASE_PACK_CORRECTION'
        ORDER BY sm."createdAt" DESC,sm."id" DESC LIMIT 1
      ) correction ON true
      LEFT JOIN LATERAL (
        SELECT SUM(pl."quantity"*pl."stockUnitsPerInvoiceUnit") AS "baseQuantity",
          SUM(pl."netAmount"+COALESCE(pl."exciseTotal",0)) AS "netAmount",
          COUNT(*) FILTER (WHERE pl."stockUnitsPerInvoiceUnit" IS NULL
            OR pl."stockUnitsPerInvoiceUnit"<=0 OR pl."quantity"<=0 OR pl."netAmount"<0
            OR UPPER(TRIM(COALESCE(pl."invoiceUnit",''))) NOT IN ('PIECE','ΤΜΧ','PACKAGE'))::int AS "invalidUnits"
        FROM "PurchaseOrder" po JOIN "PurchaseOrderLine" pl ON pl."orderId"=po."id"
        WHERE po."id"=d."id" AND po."companyId"=${companyId} AND po."storeId"=${storeId}
          AND po."status" IN ('FINAL','INVOICED') AND pl."productId"=p."id"
      ) original ON d."sourceType"='PURCHASE_ORDER'
      WHERE d."companyId"=${companyId} AND d."storeId"=${storeId}
        AND d."status"='APPROVED' AND d."documentType"='INVOICE'
        AND (${fromDay}::date IS NULL OR (d."documentDate">=${fromDay}::date
          AND d."documentDate"<${fromDay}::date + INTERVAL '1 month'))
      ORDER BY p."name",s."name",d."documentDate" DESC,d."createdAt" DESC,d."id",l."id"
    `;
    const suppliers = buildSupplierPriceComparison(lines);
    if (!month) return suppliers;

    const products = Map.groupBy(suppliers, supplier => supplier.productId);
    return [...products.values()].filter(group => group.length >= 2).map(group => {
      const {productId,productName,unitLabel} = group[0];
      const comparable = group.filter(supplier => supplier.lastCost > 0);
      const lowestCost = comparable.length >= 2 ? Math.min(...comparable.map(supplier => supplier.lastCost)) : null;
      return {productId,productName,unitLabel,suppliers:group.map(supplier => ({
        ...supplier,
        differenceFromLowestCost: lowestCost !== null && supplier.lastCost > 0 ? supplier.lastCost-lowestCost : null
      }))};
    });
}
