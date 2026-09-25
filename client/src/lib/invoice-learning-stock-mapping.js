// Learning stores unit rules, never a previous invoice's quantity or prices.
export function invoiceLearningStockMapping(line = {}) {
  const stockUnit = String(line.stockUnit || line.unit || 'PCS').trim() || 'PCS';
  const invoiceUnit = String(line.invoiceUnit || line.unit || '').trim();
  const factor = Number(line.stockUnitsPerInvoiceUnit ?? line.conversionFactor ?? line.unitsPerPackage);
  const explicitlyConverted = line.packageConversionApplied === true
    || Number(line.stockUnitsPerInvoiceUnit) > 1;
  const mapping = {stockUnit};
  // Package size alone can be catalogue metadata. It must not silently become
  // a multiplier on the next invoice, or already-piece quantities double-count.
  if (explicitlyConverted && Number.isFinite(factor) && factor > 1 && invoiceUnit) {
    mapping.stockConversion = {from: invoiceUnit, to: stockUnit, factor};
  }
  return mapping;
}
