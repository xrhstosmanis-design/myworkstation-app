import XLSX from "xlsx";
import { efoodLeafletPrices } from "./bundle-promotion-pricing.js";
import { prisma } from "./prisma.js";

export async function buildEfoodPromotionWorkbook(companyId, storeId) {
  const rows = await prisma.$queryRaw`
    SELECT p.sku, p.name, p."efoodPrice", COALESCE(sp."salePrice", p."salePrice") AS "storePrice",
           pr.name AS "promotionName", pr."offerMode"::text, pr."offerPrice", pr."discountPercent",
           pr."discountAmount", pr."validFrom", pr."validUntil", p."efoodEnabled"
    FROM "PriceCatalogPromotionStore" ps
    JOIN "PriceCatalogPromotion" pr ON pr.id = ps."promotionId" AND pr."companyId" = ps."companyId"
    JOIN "Product" p ON p.id = pr."productId" AND p."companyId" = pr."companyId"
    JOIN "StoreProduct" sp ON sp."productId" = p.id AND sp."storeId" = ps."storeId"
    WHERE ps."companyId" = ${companyId} AND ps."storeId" = ${storeId}
      AND pr.active AND pr."promotionType" = 'LEAFLET'
      AND pr."validFrom" <= NOW() AND (pr."validUntil" IS NULL OR pr."validUntil" >= NOW())
      AND p.active AND sp.active
    UNION ALL
    SELECT p.sku, p.name, p."efoodPrice", COALESCE(sp."salePrice", p."salePrice") AS "storePrice",
           pr.name AS "promotionName",
           CASE pr."promotionType" WHEN 'PERCENT' THEN 'DISCOUNT_PERCENT' ELSE 'FIXED_PRICE' END AS "offerMode",
           pr."fixedPrice" AS "offerPrice", pr."percentOff" AS "discountPercent",
           NULL AS "discountAmount", pr."startsAt" AS "validFrom", pr."endsAt" AS "validUntil",
           p."efoodEnabled"
    FROM "PromotionStore" ps
    JOIN "Promotion" pr ON pr.id = ps."promotionId"
    JOIN "Product" p ON p.id = pr."productId" AND p."companyId" = pr."companyId"
    JOIN "StoreProduct" sp ON sp."productId" = p.id AND sp."storeId" = ps."storeId"
    WHERE pr."companyId" = ${companyId} AND ps."storeId" = ${storeId}
      AND pr.active AND pr."promotionType" IN ('PERCENT', 'FIXED_PRICE')
      AND pr."startsAt" <= NOW() AND (pr."endsAt" IS NULL OR pr."endsAt" >= NOW())
      AND p.active AND sp.active
    ORDER BY name, "validFrom", sku
  `;
  const headers = ["SKU","Είδος","Προσφορά","Τιμή καταστήματος","Προσφορά καταστήματος",
    "Τιμή efood","Έκπτωση ανά τεμάχιο","Τελική τιμή efood","Από","Έως"];
  const workbook = XLSX.utils.book_new();
  const exportRows = [];
  const skipped = [];
  for (const row of rows) {
    if (!row.efoodEnabled) {
      skipped.push([row.sku,row.name,"Το είδος δεν είναι ενεργό στο efood"]);
      continue;
    }
    const prices = efoodLeafletPrices(row);
    if (!prices) {
      skipped.push([row.sku,row.name,"Ελλιπής τιμή ή μη έγκυρη έκπτωση για efood"]);
      continue;
    }
    exportRows.push([row.sku,row.name,row.promotionName,Number(row.storePrice),prices.storeOffer,
      Number(row.efoodPrice),prices.discount,prices.finalPrice,row.validFrom.toISOString(),row.validUntil?.toISOString() || ""]);
  }
  XLSX.utils.book_append_sheet(workbook,XLSX.utils.aoa_to_sheet([headers,...exportRows]),"Προσφορές efood");
  if (skipped.length) {
    XLSX.utils.book_append_sheet(workbook,XLSX.utils.aoa_to_sheet([["SKU","Είδος","Αιτία"],...skipped]),"Προς έλεγχο");
  }
  return {
    xlsx:XLSX.write(workbook,{type:"base64",bookType:"xlsx",compression:true}),
    exported:exportRows.length, skipped:skipped.length,
  };

}
