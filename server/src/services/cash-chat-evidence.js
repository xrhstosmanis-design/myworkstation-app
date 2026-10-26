// Discovery only. A chat upload is not a dated receipt or an approved explanation.
export const cashChatEvidenceLimit = 50;
const supported = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);
const nonempty = value => typeof value === 'string' && value.trim().length > 0;
const unavailable = reason => ({status:'UNAVAILABLE', reason, sources:[], documentAssociation:'UNVERIFIED', readOnly:true});

export async function readCashChatEvidence(db, {companyId, storeId}) {
  if (!nonempty(companyId) || !nonempty(storeId)) return unavailable('MISSING_STORE_SCOPE');
  try {
    // Do not read binary bytes, invoke invoice intake, mark messages read or call AI.
    // Latest uploads are only discovery candidates, including late-uploaded papers.
    const rows = await db.$queryRaw`
      SELECT "id", "companyId", "storeId", "category", "createdAt",
        "attachmentName", "attachmentMimeType", "attachmentSize", "attachmentChecksum"
      FROM "StoreChatMessage"
      WHERE "companyId"=${companyId} AND "storeId"=${storeId}
        AND "attachmentData" IS NOT NULL
        AND "attachmentMimeType" IN ('image/jpeg','image/png','image/webp','application/pdf')
      ORDER BY "createdAt" DESC, "id" DESC LIMIT 51`;
    if (!Array.isArray(rows) || rows.some(row => row.companyId !== companyId || row.storeId !== storeId || !nonempty(row.id) || !supported.has(row.attachmentMimeType))) return unavailable('INVALID_SOURCE_SCOPE');
    const sources = [], byChecksum = new Map(), ids = new Set();
    for (const row of rows.slice(0, cashChatEvidenceLimit)) {
      if (ids.has(row.id)) return unavailable('DUPLICATE_MESSAGE_ID');
      ids.add(row.id);
      const checksum = /^[a-f0-9]{64}$/i.test(row.attachmentChecksum || '') ? row.attachmentChecksum.toLowerCase() : null;
      const reference = {messageId:row.id, uploadedAt:row.createdAt, category:row.category, filename:String(row.attachmentName || '').slice(0,180)};
      if (checksum && byChecksum.has(checksum)) { byChecksum.get(checksum).references.push(reference); continue; }
      const source = {sourceId:checksum ? `SHA256:${checksum}` : `MESSAGE:${row.id}`, checksum, mimeType:row.attachmentMimeType,
        references:[reference], readingStatus:'NOT_READ', documentDate:null, sessionId:null, associationStatus:'UNVERIFIED'};
      sources.push(source);
      if (checksum) byChecksum.set(checksum,source);
    }
    return {status:rows.length > cashChatEvidenceLimit ? 'LIMITED' : sources.length ? 'AWAITING_READING' : 'NO_ATTACHMENTS_IN_DISCOVERY',
      sources, limit:cashChatEvidenceLimit, discoveryScope:'LATEST_STORE_UPLOADS', documentAssociation:'UNVERIFIED',
      complete:false, reason:'UPLOAD_TIME_IS_NOT_DOCUMENT_DATE', readOnly:true};
  } catch { return unavailable('CHAT_SOURCE_UNAVAILABLE'); }
}
