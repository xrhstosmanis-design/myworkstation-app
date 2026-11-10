export const CATALOG_APPEND = 'STORE_CATALOG_APPEND_V1';

function reject(message) {
  throw Object.assign(new Error(message), {status:400});
}

export function attachCatalogAppend(workbook, rows, XLSX) {
  const read = name => {
    if (!workbook.Sheets[name]) reject(`Λείπει το φύλλο ${name}.`);
    return XLSX.utils.sheet_to_json(workbook.Sheets[name], {defval:''});
  };
  const metadata = read('IMPORT_META');
  const {CompanyId, StoreId} = metadata[0] || {};
  if (metadata.length !== 1 || !CompanyId || !StoreId) reject('Λείπει η ταυτότητα του καταστήματος.');
  const byKey = new Map();
  const departments = new Map();
  for (const row of rows) {
    const key = row.SourceKey;
    const description = row['Τμήμα ΦΠΑ'];
    const rate = Number(row.ΦΠΑ);
    if (typeof key !== 'string' || !/^[\w.-]{1,80}$/.test(key) || byKey.has(key)) reject('Μη έγκυρη ή διπλή αναφορά είδους.');
    if (!description || String(row.ΦΠΑ).trim()==='' || !Number.isFinite(rate) || rate<0 || rate>100) reject('Μη έγκυρο τμήμα ΦΠΑ.');
    if (departments.has(description) && departments.get(description).vatRate !== rate) reject('Ασυμφωνία ΦΠΑ για το ίδιο τμήμα.');
    departments.set(description, {description, vatRate:rate});
    byKey.set(key, {row, codes:[], primary:null});
  }
  const seen = new Set();
  const aliases = read('BARCODES_IMPORT');
  if (aliases.length > 50000) reject('Υπερβολικός αριθμός barcode.');
  for (const entry of aliases) {
    const product = byKey.get(entry.SourceKey);
    const code = entry.Barcode;
    const role = entry['Ρόλος'];
    if (!product || typeof code !== 'string' || !/^\d{1,80}$/.test(code) || seen.has(code) ||
        !['ΚΥΡΙΟ','ΠΡΟΣΘΕΤΟ'].includes(role)) reject('Μη έγκυρο ή διπλό barcode.');
    if (role === 'ΚΥΡΙΟ') {
      if (product.primary !== null) reject('Δύο κύρια barcode για το ίδιο είδος.');
      product.primary = code;
    }
    seen.add(code);
    product.codes.push(code);
  }
  for (const {row,codes,primary} of byKey.values()) {
    if (!primary || row.Barcode !== primary) reject('Το κύριο barcode δεν συμφωνεί με το φύλλο ειδών.');
    Object.defineProperty(row,'sourceBarcodes',{value:[primary,...codes.filter(code=>code!==primary)]});
  }
  Object.defineProperty(rows,'sourceProfile',{value:{
    name:CATALOG_APPEND,departments:[...departments.values()],
    assertTarget(companyId,storeId) {
      if (companyId!==CompanyId || storeId!==StoreId) reject('Το αρχείο αφορά άλλο κατάστημα.');
    }
  }});
  return rows;
}
