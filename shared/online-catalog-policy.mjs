// Explicit store choices take precedence over the automatic stock catalogue.
export function enoughOnlineStock(product, quantity = 1) {
  const stock = Number(product?.currentStock ?? 0), requested = Number(quantity);
  return Number.isFinite(stock) && Number.isFinite(requested) && requested > 0 && stock >= requested;
}

export function automaticCatalogIncludes(product) {
  if (product?.visibilityOverride === false) return false;
  return product?.visibilityOverride === true || product?.availabilityMode === 'ALWAYS' ||
    (Number.isFinite(Number(product?.currentStock)) && Number(product.currentStock) > 0);
}

export function automaticOnlineAvailable(product, quantity = 1) {
  const requested = Number(quantity);
  return automaticCatalogIncludes(product) && Number.isFinite(requested) && requested > 0 &&
    (product?.availabilityMode === 'ALWAYS' || enoughOnlineStock(product, requested));
}
