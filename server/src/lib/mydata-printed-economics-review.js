import crypto from 'node:crypto';

const VERSION = 'MYDATA_PRINTED_ECONOMICS_V1';
const MAX_ROWS = 250;
const PROFILE = 'E_INVOICING_DETAILED_LINE_AMOUNT_V1';
const numericFields = ['quantity','unitCost','initialUnitCost','discount1','discount2','discount3','exciseTotal','vatRate','netAmount','vatAmount','grossAmount','stockUnitsPerInvoiceUnit'];
const textFields = ['id','productId','supplierCode','description','invoiceUnit'];
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const id = value => typeof value === 'string' && value.length > 0 && value.length <= 200;
const sha = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);

// Do not round fingerprint inputs through Number. PostgreSQL numerics are read
// as strings below, so a one-in-the-eighth-decimal edit invalidates the proof.
function decimal(value) {
  if (value === null || value === undefined || typeof value === 'boolean') return null;
  const input = String(value);
  if (input.length > 100 || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d{1,3})?$/i.test(input)) return null;
  const [coefficient, exponentText = '0'] = input.toLowerCase().split('e');
  const exponent = Number(exponentText);
  if (Math.abs(exponent) > 80) return null;
  const negative = coefficient.startsWith('-');
  const unsigned = coefficient.replace(/^[+-]/, '');
  const [whole, fraction = ''] = unsigned.split('.');
  let digits = (whole || '0') + fraction;
  let scale = fraction.length - exponent;
  if (scale < 0) { digits += '0'.repeat(-scale); scale = 0; }
  if (digits.length <= scale) digits = '0'.repeat(scale - digits.length + 1) + digits;
  let integer = (scale ? digits.slice(0, -scale) : digits).replace(/^0+(?=\d)/, '');
  const tail = (scale ? digits.slice(-scale) : '').replace(/0+$/, '');
  const output = integer + (tail ? '.' + tail : '');
  return (negative && output !== '0' ? '-' : '') + output;
}

export function myDataPrintedEconomicsRowsFingerprint(rows) {
  if (!Array.isArray(rows) || !rows.length || rows.length > MAX_ROWS) return null;
  const seen = new Set();
  const canonical = [];
  for (const row of rows) {
    if (!row || !id(row.id) || seen.has(row.id)) return null;
    seen.add(row.id);
    const output = {};
    for (const key of textFields) {
      const value = row[key];
      if (value === null && ['productId','supplierCode'].includes(key)) output[key] = null;
      else if (typeof value === 'string' && value.length <= (key === 'description' ? 1000 : 200)) output[key] = value;
      else return null;
    }
    for (const key of numericFields) {
      const value = decimal(row[key]);
      if (value === null) return null;
      output[key] = value;
    }
    canonical.push(output);
  }
  canonical.sort((a,b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  return hash(JSON.stringify(canonical));
}

const required = {
  PurchaseOrder:['id','companyId','storeId','supplierId','status','sourceType','sourceDocumentId'],
  PurchaseDocument:['id','companyId','storeId','status','sourceType'],
  PurchaseOrderLine:['id','orderId',...textFields.slice(1),...numericFields],
  MyDataInboundDocument:['id','companyId','storeId','inboxId','mark','rawPayload'],
  DocumentInbox:['id','companyId','storeId','attachmentId'],
  DocumentAttachment:['id','companyId','storeId','checksum','mimeType'],
  AiReaderJob:['id','companyId','storeId','attachmentId','purchaseDocumentId','resultJson'],
};

/** Optional, bounded and read-only. Never creates the optional myDATA schema. */
export async function readMyDataPrintedEconomicsReview(db, {companyId,storeId,orderId} = {}) {
  if (![companyId,storeId,orderId].every(id)) return null;
  const columns = await db.$queryRaw`SELECT table_name,column_name FROM information_schema.columns WHERE table_schema=current_schema() AND table_name=ANY(${Object.keys(required)}::text[])`;
  const found = new Set(columns.map(row => row.table_name + '.' + row.column_name));
  if (Object.entries(required).some(([table,keys]) => keys.some(key => !found.has(table+'.'+key)))) return null;
  const sources = await db.$queryRaw`
    SELECT m."id" AS "inboundId",m."inboxId",m."mark",m."rawPayload"->'printedEconomicsReview' AS marker,
      CASE WHEN length(m."rawPayload"->>'xml')<=1000000 THEN m."rawPayload"->>'xml' ELSE NULL END AS xml,
      m."rawPayload"->>'mydataDraftOrderId' AS "draftOrderId",m."rawPayload"->>'mydataDraftDocumentId' AS "draftDocumentId",
      o."supplierId",d."id" AS "documentId",a."id" AS "attachmentId",a."checksum",a."mimeType",
      j."id" AS "jobId",CASE WHEN length(j."resultJson"::text)<=220000 THEN j."resultJson" ELSE NULL END AS "resultJson"
    FROM "PurchaseOrder" o
    JOIN "PurchaseDocument" d ON d."id"=o."sourceDocumentId" AND d."companyId"=o."companyId" AND d."storeId"=o."storeId"
    JOIN "MyDataInboundDocument" m ON m."companyId"=o."companyId" AND m."storeId"=o."storeId"
      AND m."rawPayload"->'printedEconomicsReview'->>'orderId'=o."id"
    JOIN "DocumentInbox" i ON i."id"=m."inboxId" AND i."companyId"=m."companyId" AND i."storeId"=m."storeId"
    JOIN "DocumentAttachment" a ON a."id"=i."attachmentId" AND a."companyId"=i."companyId" AND a."storeId"=i."storeId"
    JOIN "AiReaderJob" j ON j."id"=m."rawPayload"->'printedEconomicsReview'->>'jobId'
      AND j."companyId"=o."companyId" AND j."storeId"=o."storeId" AND j."attachmentId"=a."id" AND j."purchaseDocumentId"=d."id"
    WHERE o."id"=${orderId} AND o."companyId"=${companyId} AND o."storeId"=${storeId}
      AND o."status"='NEW' AND o."sourceType"='POS_OCR_DRAFT' AND d."status"='DRAFT' AND d."sourceType"='POS_OCR_DRAFT'
      AND COALESCE(to_jsonb(o)->>'reopenVersion','0')='0' LIMIT 2`;
  if (sources.length !== 1) return null;
  const source = sources[0], marker = source.marker;
  if (!marker || marker.version !== VERSION || !['VERIFIED','UNKNOWN'].includes(marker.state)
    || marker.companyId !== companyId || marker.storeId !== storeId || marker.orderId !== orderId
    || marker.inboxId !== source.inboxId || marker.mark !== source.mark || marker.documentId !== source.documentId
    || marker.jobId !== source.jobId || marker.attachmentId !== source.attachmentId
    || !Number.isSafeInteger(marker.lineCount) || marker.lineCount < 1) return null;
  const output = {version:VERSION,orderId,storeId,state:'UNKNOWN',lineCount:marker.lineCount,reason:'STALE_SOURCE'};
  if ((marker.supplierId ?? null) !== (source.supplierId ?? null)
    || (source.draftOrderId && source.draftOrderId !== orderId)
    || (source.draftDocumentId && source.draftDocumentId !== source.documentId)
    || source.mimeType !== 'application/pdf' || !sha(marker.attachmentChecksum) || marker.attachmentChecksum !== source.checksum
    || !sha(marker.xmlSHA256) || typeof source.xml !== 'string' || marker.xmlSHA256 !== hash(source.xml)) return output;
  const [count] = await db.$queryRaw`SELECT COUNT(*)::int AS count FROM "PurchaseOrderLine" WHERE "orderId"=${orderId}`;
  if (count.count !== marker.lineCount) return {...output,reason:'STALE_ROWS'};
  if (count.count > MAX_ROWS) return {...output,reason:'ROW_LIMIT'};
  const persisted = await db.$queryRaw`
    SELECT (SELECT jsonb_object_agg(e.key,CASE WHEN jsonb_typeof(e.value)='number' THEN to_jsonb(e.value::text) ELSE e.value END)
      FROM jsonb_each(to_jsonb(l)) e) AS row FROM "PurchaseOrderLine" l WHERE l."orderId"=${orderId} ORDER BY l."id" LIMIT 251`;
  const fingerprint = myDataPrintedEconomicsRowsFingerprint(persisted.map(item => item.row));
  if (!sha(marker.rowsFingerprint) || !fingerprint || fingerprint !== marker.rowsFingerprint) return {...output,reason:'STALE_ROWS'};
  if (marker.state === 'UNKNOWN') return {...output,reason:typeof marker.reason === 'string' && /^[A-Z_]{1,80}$/.test(marker.reason) ? marker.reason : 'PRINTED_ECONOMICS_NOT_PROVEN'};
  const result = source.resultJson, proof = result?.providerOriginalTextProof;
  if (!result || result.source !== 'MYDATA_PROVIDER_ORIGINAL' || result.myDataMark !== source.mark
    || typeof result.rawText !== 'string' || !result.rawText || result.rawText.length > 200000
    || !sha(marker.rawTextSHA256) || marker.rawTextSHA256 !== hash(result.rawText)
    || !proof || proof.version !== 'SERVER_PROVIDER_PDF_V1' || proof.profile !== PROFILE
    || proof.pageCount !== 1 || result.pageCount !== 1 || proof.pdfChecksum !== source.checksum
    || proof.rawTextSHA256 !== marker.rawTextSHA256) return output;
  const discount = decimal(marker.discountAmountTotal);
  if (discount === null || discount.startsWith('-') || !/^\d{1,12}(?:\.\d{1,2})?$/.test(discount)) return output;
  return {...output,state:'VERIFIED',reason:'PRINTED_LINE_AMOUNT_CONFIRMED',discountAmountTotal:discount};
}
