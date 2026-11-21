import crypto from 'node:crypto';

const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
const fail=()=>{throw Object.assign(new Error('Το αρχικό αποδεικτικό της πληρωμής άλλαξε. Απαιτείται έλεγχος του ίδιου πρωτοτύπου.'),{status:409,code:'INVOICE_RECOVERY_ORIGINAL_CHANGED'})};
const cents=value=>Math.round(Number(value)*100);
const token=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-ZΑ-Ω0-9]/g,'');

// Called inside the existing, authorized draft transaction. A saved original
// is evidence, never authority to create a draft, spend on AI or post stock.
export async function retainCapturedPaymentOriginal(db,scope,paymentId){
 const meta=await db.$queryRaw`SELECT to_regclass(format('%I.%I',current_schema(),'StoreOperatorAudit'))::text AS "relation"`;
 if(!meta[0]?.relation)return false;
 const suffix=hash(paymentId);
 const proofs=await db.$queryRaw`SELECT "details" FROM "StoreOperatorAudit" WHERE "id"=${'pi_capture_'+suffix} AND "companyId"=${scope.companyId} AND "storeId"=${scope.storeId} AND "eventType"='POS_INVOICE_PLAIN_CAPTURED' FOR SHARE`;
 if(!proofs.length)return false;
 const rows=await db.$queryRaw`SELECT "type","reversedAt","amount","supplierId","invoiceDocumentNumber","actorId","attachmentData","attachmentMimeType","attachmentFilename","attachmentChecksum" FROM "StoreTransaction" WHERE "id"=${paymentId} AND "companyId"=${scope.companyId} AND "storeId"=${scope.storeId} FOR UPDATE`;
 const intents=await db.$queryRaw`SELECT "actorId","details" FROM "StoreOperatorAudit" WHERE "id"=${'pi_pending_'+suffix} AND "companyId"=${scope.companyId} AND "storeId"=${scope.storeId} AND "eventType"='POS_INVOICE_PENDING_CREATED' FOR SHARE`;
 const row=rows[0],proof=proofs[0].details,intent=intents[0],h=intent?.details;
 const day=scope.documentDate instanceof Date?scope.documentDate.toISOString().slice(0,10):String(scope.documentDate||'').slice(0,10);
 if(proofs.length!==1||!row||intents.length!==1||row.type!=='SUPPLIER_PAYMENT'||row.reversedAt||proof?.sourceKind!=='PLAIN_CAPTURE'||proof.version!=='POS_DEFERRED_INVOICE_V1'||h?.version!==proof.version||proof.transactionId!==paymentId||h.transactionId!==paymentId||proof.fingerprint!==h.fingerprint||!proof.fingerprint||proof.originalActorId!==row.actorId||intent.actorId!==row.actorId||proof.contextSessionId!==h.contextSessionId||proof.supplierId!==row.supplierId||proof.supplierId!==h.supplierId||proof.supplierId!==scope.supplierId||proof.documentNumber!==h.documentNumber||token(proof.documentNumber)!==token(row.invoiceDocumentNumber)||token(proof.documentNumber)!==token(scope.documentNumber)||proof.documentDate!==h.documentDate||proof.documentDate!==day||proof.amountCents!==h.amountCents||proof.amountCents!==cents(row.amount)||proof.amountCents!==cents(scope.totalGross))fail();
 if(proof.mimeType!==row.attachmentMimeType||proof.filename!==row.attachmentFilename||proof.checksum!==row.attachmentChecksum||!Array.isArray(proof.manifest)||proof.manifest.length!==1||proof.manifest[0].mimeType!==proof.mimeType||proof.manifest[0].checksum!==proof.checksum||!['application/pdf','image/jpeg','image/png','image/webp'].includes(proof.mimeType)||!/^[a-f0-9]{64}$/.test(proof.checksum||''))fail();
 const prefix=`data:${proof.mimeType};base64,`,data=row.attachmentData;
 if(typeof data!=='string'||!data.startsWith(prefix)||data.length>9000000)fail();
 const encoded=data.slice(prefix.length);
 if(!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded))fail();
 const bytes=Buffer.from(encoded,'base64');
 if(bytes.length<100||bytes.length>6500000||bytes.toString('base64')!==encoded||hash(bytes)!==proof.checksum)fail();
 return true;
}

// The caller owns admission and transaction boundaries. Read only the exact
// retained original; never accept replacement pages or a header from a client.
export async function readCapturedPaymentOriginal(db,scope,paymentId){
 const suffix=hash(paymentId);
 if(!await retainCapturedPaymentOriginal(db,scope,paymentId))fail();
 const intents=await db.$queryRaw`SELECT "details" FROM "StoreOperatorAudit" WHERE "id"=${'pi_pending_'+suffix} AND "companyId"=${scope.companyId} AND "storeId"=${scope.storeId} AND "eventType"='POS_INVOICE_PENDING_CREATED' FOR SHARE`;
 const rows=await db.$queryRaw`SELECT "attachmentData","attachmentMimeType","attachmentFilename","attachmentChecksum" FROM "StoreTransaction" WHERE "id"=${paymentId} AND "companyId"=${scope.companyId} AND "storeId"=${scope.storeId} FOR UPDATE`;
 const original=rows[0],intent=intents[0]?.details;
 if(rows.length!==1||intents.length!==1||!intent?.fingerprint)fail();
 return {transactionId:paymentId,proofId:'pi_capture_'+suffix,fingerprint:intent.fingerprint,
  header:{supplierId:intent.supplierId,documentNumber:intent.documentNumber,documentDate:intent.documentDate,totalGross:intent.amountCents/100},
  pages:[{filename:original.attachmentFilename,mimeType:original.attachmentMimeType,contentData:original.attachmentData,checksum:original.attachmentChecksum}]};
}
