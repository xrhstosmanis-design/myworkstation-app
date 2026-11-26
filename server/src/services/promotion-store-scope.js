function overlapSqlDateEnd(value) {
  return value || new Date("9999-12-31T23:59:59.999Z");
}
export async function findOverlap(
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
export async function lockScope(
  tx,
  { companyId, productId, promotionType, storeIds },
) {
  for (const storeId of [...new Set(storeIds)].sort()) {
    const key = `promo:${companyId}:${productId}:${promotionType}:${storeId}`;
    await tx.$queryRaw`SELECT (pg_advisory_xact_lock(hashtext(${key})) IS NULL) AS locked`;
  }
}
