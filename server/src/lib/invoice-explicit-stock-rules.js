const codeKey = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-ZΑ-Ω0-9]/g, '');

export function validateExplicitStockRules(input) {
  if (!Array.isArray(input) || !input.length || input.length > 500) throw new Error('Επίλεξε από 1 έως 500 κανόνες.');
  const seen = new Set();
  return input.map(rule => {
    const supplierItemCode = String(rule?.supplierItemCode || '').trim();
    const key = codeKey(supplierItemCode);
    const invoiceUnit = String(rule?.invoiceUnit || '').trim();
    const stockUnit = String(rule?.stockUnit || '').trim();
    const factor = Number(rule?.factor);
    if (!key || seen.has(key) || !invoiceUnit || !stockUnit || invoiceUnit.length > 30 || stockUnit.length > 30 || !Number.isFinite(factor) || factor < 1) throw new Error('Έλεγξε κωδικό, μονάδες και θετικό συντελεστή κάθε κανόνα.');
    seen.add(key);
    return {key, supplierItemCode, invoiceUnit, stockUnit, factor};
  });
}

export function applyExplicitStockRules(previous, rules) {
  const mappings = {...(previous?.mappings || {})};
  for (const rule of rules) {
    mappings[rule.key] = {...(mappings[rule.key] || {}), supplierItemCode:rule.supplierItemCode,
      invoiceUnit:rule.invoiceUnit, stockUnit:rule.stockUnit, unitsPerPackage:rule.factor,
      conversionFactor:rule.factor, stockConversion:{from:rule.invoiceUnit,to:rule.stockUnit,factor:rule.factor},
      verified:true, source:'SUPER_ADMIN_STOCK_RULE'};
  }
  return {...previous, mappings};
}
