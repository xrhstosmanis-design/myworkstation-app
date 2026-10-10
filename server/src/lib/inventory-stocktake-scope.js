// An unbound company owner can use the central inventory screen. An existing
// authenticated store binding can never be replaced by a request parameter.
export function inventoryStoreScopeAllowed(user, storeId) {
  return Boolean(storeId) && (!user.storeId || user.storeId === storeId);
}
export function inventoryStocktakeScopeAllowed(user, stocktake) {
  if (!stocktake || stocktake.companyId !== user.companyId || !inventoryStoreScopeAllowed(user, stocktake.storeId)) return false;
  if (user.tokenType === 'INVENTORY_COUNTER') return Boolean(user.stocktakeId && user.storeId && user.stocktakeId === stocktake.id);
  return true;
}
