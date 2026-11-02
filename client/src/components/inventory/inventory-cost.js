// Read-only valuation: an absent/nonpositive cost is not a zero economic value.
export function inventoryUnitCost(value) {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  const cost = Number(value);
  return Number.isFinite(cost) && cost > 0 ? cost : null;
}

export function inventoryCostValue(line) {
  const cost = inventoryUnitCost(line.unitCost);
  if (cost === null) return null;
  const value = Number(line.countedQuantity || 0) * cost;
  return Number.isFinite(value) ? value : null;
}
