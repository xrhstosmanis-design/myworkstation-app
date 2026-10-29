// ADD COLUMN IF NOT EXISTS still takes AccessExclusiveLock before checking
// the column. Avoid that lock for the audited, already-installed hot columns.
// Keep this deliberately narrow: unknown/multi-action SQL uses its old path.
const hotColumnStatement=/^ALTER TABLE "(Product|ProductBarcode|PurchaseDocument|StoreTransaction)" ADD COLUMN IF NOT EXISTS "([A-Za-z_][A-Za-z0-9_]*)" (?:TEXT|BOOLEAN|INTEGER|(?:DECIMAL|NUMERIC)\(\d+,\d+\)|TIMESTAMPTZ)(?: NOT NULL)?(?: DEFAULT (?:false|true|0|NOW\(\)))?;?\s*$/;

// Audited definitions from routes/store-transactions.js. Other ledger DDL
// keeps its old execution path; this is not a general schema readiness cache.
const storeTransactionColumns=new Map([
  ["attachmentData","TEXT"],["attachmentMimeType","TEXT"],
  ["attachmentFilename","TEXT"],["attachmentChecksum","TEXT"],
  ["paymentMethod","TEXT"],["subtractFromShift","BOOLEAN NOT NULL DEFAULT false"],
  ["supplierId","TEXT"],["invoiceDocumentNumber","TEXT"],["invoicePaymentKey","TEXT"]
]);

export async function executeHotTableBootstrap(client,statement){
  const column=hotColumnStatement.exec(statement);
  if(column && (column[1]!=="StoreTransaction" ||
    statement===`ALTER TABLE "StoreTransaction" ADD COLUMN IF NOT EXISTS "${column[2]}" ${storeTransactionColumns.get(column[2])}`)){
    const relation=`"${column[1]}"`;
    // Resolve the same relation/search path as the original unqualified ALTER.
    // Use this client's transaction, not a separate global connection/cache.
    const rows=await client.$queryRaw`
      SELECT EXISTS (
        SELECT 1 FROM pg_catalog.pg_attribute
        WHERE attrelid=pg_catalog.to_regclass(${relation})
          AND attname=${column[2]} AND attnum>0 AND NOT attisdropped
      ) AS present`;
    if(rows[0]?.present===true)return 0;
  }
  // Missing columns keep the exact original definition and concurrency guard.
  // Errors are propagated; all non-target statements remain unchanged.
  return client.$executeRawUnsafe(statement);
}
