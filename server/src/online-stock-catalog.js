export const automaticStockCatalog = config => config?.autoStockCatalogEnabled === true;

export function enoughOnlineStock(product, quantity = 1) {
  const stock = Number(product?.currentStock ?? 0), requested = Number(quantity);
  return Number.isFinite(stock) && Number.isFinite(requested) && requested > 0 && stock >= requested;
}

// Read current own-store stock on every request. This never changes stock or visibility.
export async function readAutomaticStockCatalog(db, store, productIds = []) {
  const rows = await db.$queryRaw`SELECT
    CASE WHEN EXISTS(SELECT 1 FROM "StoreBakedBalance" bs WHERE bs."companyId"=p."companyId" AND bs."storeId"=sp."storeId" AND bs."productId"=p."id" AND bs."enabled"=TRUE) THEN 'BAKED_SAME' ELSE bp."mode" END AS "availabilityMode",
    p."id",p."sku",p."name",p."vatRate",p."trackStock",FALSE AS "hasRecipe",
    COALESCE(sp."salePrice",p."salePrice",0) AS "storePrice",
    COALESCE((SELECT bs."bakedQuantity" FROM "StoreBakedBalance" bs WHERE bs."companyId"=p."companyId" AND bs."storeId"=sp."storeId" AND bs."productId"=p."id" AND bs."enabled"=TRUE),sp."currentStock",0) AS "currentStock"
    FROM "StoreProduct" sp JOIN "Product" p ON p."id"=sp."productId" AND p."companyId"=${store.companyId}
    LEFT JOIN "StoreBakingPolicy" bp ON bp."storeId"=sp."storeId" AND bp."productId"=p."id" AND bp."companyId"=p."companyId"
    WHERE sp."storeId"=${store.id} AND sp."active"=TRUE AND p."active"=TRUE
    AND (cardinality(${productIds}::text[])=0 OR p."id"=ANY(${productIds}::text[]))
    AND COALESCE((SELECT bs."bakedQuantity" FROM "StoreBakedBalance" bs WHERE bs."companyId"=p."companyId" AND bs."storeId"=sp."storeId" AND bs."productId"=p."id" AND bs."enabled"=TRUE),sp."currentStock",0)>0
    ORDER BY p."name",p."id"`;
  return rows.filter(row => Number.isFinite(Number(row.currentStock)) && Number(row.currentStock) > 0);
}
