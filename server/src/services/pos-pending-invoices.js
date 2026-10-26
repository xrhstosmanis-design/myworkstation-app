import crypto from 'node:crypto';
import {invoiceToken,findInvoicePayment} from '../lib/invoice-payment-reuse.js';
import {lockInvoiceStore} from '../lib/invoice-common-draft.js';
import {assertLifecycleMutation} from './store-lifecycle-generation.js';
import {lifecycleContext} from './store-lifecycle-context.js';

const VERSION='POS_DEFERRED_INVOICE_V1',EVENT='POS_INVOICE_PENDING_CREATED';
const hash=value=>crypto.createHash('sha256').update(typeof value==='string'||Buffer.isBuffer(value)?value:JSON.stringify(value)).digest('hex');
const fail=(message,code='PENDING_INVOICE_CONFLICT',status=409)=>{throw Object.assign(new Error(message),{status,code})};
const text=(value,max=180)=>typeof value==='string'&&value.trim()&&value.trim().length<=max&&!/[\u0000-\u001f\u007f]/.test(value)?value.trim():'';
const day=value=>{const s=text(value,10);return /^\d{4}-\d{2}-\d{2}$/.test(s)&&!Number.isNaN(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s?s:''};
const cents=value=>{const n=Number(value);return Number.isFinite(n)&&n>0&&n<=999999999&&Math.abs(n*100-Math.round(n*100))<.00001?Math.round(n*100):null};
const eventId=id=>'pi_pending_'+hash(id);
const operator=user=>user?.tokenType==='STORE_OPERATOR';
function scopeCheck(scope){if(!text(scope?.companyId)||!text(scope?.storeId)||!text(scope?.user?.id))fail('Απαιτείται προσωπική πρόσβαση και συγκεκριμένο κατάστημα.','PENDING_INVOICE_SCOPE',403)}
function readerCheck(scope,row){
 scopeCheck(scope);
 if(operator(scope.user)&&(scope.user.storeId!==scope.storeId||row&&(row.actorId!==scope.user.id||row.details?.terminalPos!==scope.terminalPos)))fail('Η εκκρεμότητα δεν ανήκει στον χειριστή και στο POS.','PENDING_INVOICE_SCOPE',403);
}
function header(body){
 const supplierId=text(body.supplierId),documentNumber=text(body.invoiceDocumentNumber||body.documentNumber,80).toLocaleUpperCase('el-GR').replace(/\s+/g,''),documentDate=day(body.deferredInvoice?.documentDate||body.documentDate),amountCents=cents(body.amount??body.totalGross);
 if(!supplierId||!documentNumber||!/[0-9]/.test(documentNumber)||!documentDate||amountCents===null)fail('Συμπλήρωσε πραγματικό προμηθευτή, αριθμό και ημερομηνία τιμολογίου και έγκυρο ποσό.','PENDING_INVOICE_FIELDS',400);
 return {supplierId,documentNumber,documentDate,amountCents};
}
function payloadFingerprint(scope,body,h){return hash([VERSION,scope.companyId,scope.storeId,scope.user.id,scope.terminalPos,h.supplierId,invoiceToken(h.documentNumber),h.documentDate,h.amountCents,body.paymentSource,body.paymentMethod,body.deferredInvoice?.sessionId])}

export async function createPendingInvoicePayment(db,scope,body){
 scopeCheck(scope);const h=header(body),key=text(body.idempotencyKey),sessionId=text(body.deferredInvoice?.sessionId);
 if(body.type!=='SUPPLIER_PAYMENT'||body.evidenceMode!=='NO_DOCUMENT'||body.attachment||body.purchaseDocumentId||!key||key.length<8||!sessionId||!['CASH_SHIFT','EXTERNAL'].includes(body.paymentSource)||!['CASH_SHIFT','CORPORATE_CARD','BANK_TRANSFER','EMPLOYEE_REIMBURSEMENT'].includes(body.paymentMethod)||((body.paymentSource==='CASH_SHIFT')!==(body.paymentMethod==='CASH_SHIFT')))fail('Μη έγκυρη ρητή πληρωμή με εκκρεμές τιμολόγιο.','PENDING_INVOICE_FIELDS',400);
 if(operator(scope.user)&&(!scope.user.permissions?.includes('SUPPLIER_PAYMENT')||(body.paymentSource==='CASH_SHIFT'&&!scope.user.permissions?.includes('SAME_SHIFT_PAYMENTS'))))fail('Δεν έχεις δικαίωμα της επιλεγμένης πληρωμής.','PENDING_INVOICE_SCOPE',403);
 const id='pay_'+hash(`${scope.companyId}:${scope.storeId}:${key}`),fingerprint=payloadFingerprint(scope,body,h);
 return db.$transaction(async tx=>{
  await assertLifecycleMutation(tx,scope,lifecycleContext()[scope.storeId]??'0');
  await lockInvoiceStore(tx,scope.companyId,scope.storeId);
  const prior=await tx.$queryRaw`SELECT t.*,a."details" FROM "StoreTransaction" t LEFT JOIN "StoreOperatorAudit" a ON a."id"=${eventId(id)} AND a."companyId"=t."companyId" AND a."storeId"=t."storeId" WHERE t."id"=${id} AND t."companyId"=${scope.companyId} AND t."storeId"=${scope.storeId} FOR UPDATE OF t`;
  if(prior[0]){if(prior[0].reversedAt||prior[0].details?.version!==VERSION||prior[0].details?.fingerprint!==fingerprint||prior[0].type!=='SUPPLIER_PAYMENT'||prior[0].actorId!==scope.user.id||prior[0].supplierId!==h.supplierId||invoiceToken(prior[0].invoiceDocumentNumber)!==invoiceToken(h.documentNumber)||cents(prior[0].amount)!==h.amountCents||prior[0].paymentMethod!==body.paymentMethod||prior[0].subtractFromShift!==(body.paymentSource==='CASH_SHIFT')||prior[0].sessionId!==(body.paymentSource==='CASH_SHIFT'?sessionId:null))fail('Το αναγνωριστικό πληρωμής έχει διαφορετικό ή ακυρωμένο περιεχόμενο.');return {transaction:prior[0],duplicate:true,pendingInvoiceId:id,fingerprint}}
  const stores=await tx.$queryRaw`SELECT "id" FROM "Store" WHERE "id"=${scope.storeId} AND "companyId"=${scope.companyId} AND "active"=true`;
  const suppliers=await tx.$queryRaw`SELECT "id","name","taxId" FROM "Supplier" WHERE "id"=${h.supplierId} AND "companyId"=${scope.companyId} AND "active"=true`;
  if(!stores[0]||!suppliers[0])fail('Δεν βρέθηκε ενεργό κατάστημα ή προμηθευτής.','PENDING_INVOICE_SCOPE',404);
  const supplierTaxId=String(suppliers[0].taxId||'').replace(/\D/g,''),invoicePaymentKey=`${scope.companyId}:${supplierTaxId?'VAT:'+supplierTaxId:'ID:'+h.supplierId}:${invoiceToken(h.documentNumber)}`;
  await tx.$queryRaw`SELECT (pg_advisory_xact_lock(hashtext(${`supplier-invoice-payment:${invoicePaymentKey}`})) IS NULL) AS locked`;
  const existing=await findInvoicePayment(tx,{companyId:scope.companyId,supplierId:h.supplierId,supplierTaxId,documentNumber:h.documentNumber});
  if(existing)fail('Η πληρωμή αυτού του τιμολογίου υπάρχει ήδη. Δεν έγινε δεύτερη πληρωμή.','DUPLICATE_INVOICE_PAYMENT');
  const shifts=await tx.$queryRaw`SELECT "id","openedBy","terminalPos" FROM "CashShiftSession" WHERE "id"=${sessionId} AND "companyId"=${scope.companyId} AND "storeId"=${scope.storeId} AND "terminalPos"=${scope.terminalPos} AND "status"='OPEN' FOR UPDATE`;
  if(!shifts[0]||operator(scope.user)&&shifts[0].openedBy!==scope.user.id)fail('Η αρχική βάρδια του χειριστή δεν είναι πλέον ενεργή.');
  const rows=await tx.$queryRaw`INSERT INTO "StoreTransaction" ("id","companyId","storeId","sessionId","type","amount","description","supplierId","supplierName","invoiceDocumentNumber","invoicePaymentKey","subtractFromShift","paymentMethod","actorId","actorName","attachmentChecksum") VALUES (${id},${scope.companyId},${scope.storeId},${body.paymentSource==='CASH_SHIFT'?sessionId:null},'SUPPLIER_PAYMENT',${h.amountCents/100},${`Τιμολόγιο ${h.documentNumber} — αναμονή ανεβάσματος παραστατικού`},${h.supplierId},${suppliers[0].name},${h.documentNumber},${invoicePaymentKey},${body.paymentSource==='CASH_SHIFT'},${body.paymentMethod},${scope.user.id},${scope.user.fullName||'Χειριστής'},${hash(`supplier-invoice:${invoicePaymentKey}`)}) RETURNING *`;
  const details={version:VERSION,transactionId:id,contextSessionId:sessionId,terminalPos:scope.terminalPos,supplierId:h.supplierId,documentNumber:h.documentNumber,documentDate:h.documentDate,amountCents:h.amountCents,paymentSource:body.paymentSource,paymentMethod:body.paymentMethod,fingerprint};
  await tx.$executeRaw`INSERT INTO "StoreOperatorAudit" ("id","companyId","storeId","operatorId","actorId","eventType","details") VALUES (${eventId(id)},${scope.companyId},${scope.storeId},${scope.user.operatorId||scope.user.id},${scope.user.id},${EVENT},${JSON.stringify(details)}::jsonb)`;
  return {transaction:rows[0],duplicate:false,pendingInvoiceId:id,fingerprint};
 });
}

async function intent(db,scope,id,{lock=false,sessionAll=false}={}){
 scopeCheck(scope);
 if(lock){
  const sessions=await db.$queryRaw`SELECT s."id" FROM "CashShiftSession" s JOIN "StoreOperatorAudit" a ON a."details"->>'contextSessionId'=s."id" AND a."companyId"=s."companyId" AND a."storeId"=s."storeId" WHERE a."id"=${eventId(id)} AND a."companyId"=${scope.companyId} AND a."storeId"=${scope.storeId} AND a."eventType"=${EVENT} FOR KEY SHARE OF s`;
  if(!sessions[0])fail('Δεν είναι διαθέσιμη η αρχική βάρδια της εκκρεμότητας.','PENDING_INVOICE_REVIEW_REQUIRED');
 }
 const rows=lock?await db.$queryRaw`SELECT t.*,a."details",a."actorId" AS "pendingActorId" FROM "StoreTransaction" t JOIN "StoreOperatorAudit" a ON a."id"=${eventId(id)} AND a."companyId"=t."companyId" AND a."storeId"=t."storeId" AND a."eventType"=${EVENT} WHERE t."id"=${id} AND t."companyId"=${scope.companyId} AND t."storeId"=${scope.storeId} FOR UPDATE OF t`:await db.$queryRaw`SELECT t.*,a."details",a."actorId" AS "pendingActorId" FROM "StoreTransaction" t JOIN "StoreOperatorAudit" a ON a."id"=${eventId(id)} AND a."companyId"=t."companyId" AND a."storeId"=t."storeId" AND a."eventType"=${EVENT} WHERE t."id"=${id} AND t."companyId"=${scope.companyId} AND t."storeId"=${scope.storeId}`;
 const row=rows[0];if(!row||row.details?.version!==VERSION||row.type!=='SUPPLIER_PAYMENT'||row.reversedAt||row.actorId!==row.pendingActorId||row.paymentMethod!==row.details.paymentMethod||row.subtractFromShift!==(row.details.paymentSource==='CASH_SHIFT')||row.sessionId!==(row.details.paymentSource==='CASH_SHIFT'?row.details.contextSessionId:null)||cents(row.amount)!==row.details.amountCents||row.supplierId!==row.details.supplierId||invoiceToken(row.invoiceDocumentNumber)!==invoiceToken(row.details.documentNumber))fail('Δεν βρέθηκε ενεργή εκκρεμότητα του αρχικού τιμολογίου.','PENDING_INVOICE_UNAVAILABLE');
 if(!sessionAll)readerCheck(scope,row);
 const deleted=await db.$queryRaw`SELECT "id" FROM "StoreOperatorAudit" WHERE "companyId"=${scope.companyId} AND "storeId"=${scope.storeId} AND "eventType"='PURCHASE_ORDER_DELETED' AND "details"->>'preservedPaymentTransactionId'=${row.id} LIMIT 1`;
 if(deleted[0])fail('Το αρχικό πρόχειρο διαγράφηκε σκόπιμα. Απαιτείται ξεχωριστός έλεγχος, όχι αυτόματη επαναδημιουργία.','PENDING_INVOICE_REVIEW_REQUIRED');
 return row;
}

export function invoicePageManifest(pages){
 if(!Array.isArray(pages)||!pages.length||pages.length>5)fail('Επίλεξε έως πέντε σελίδες του ίδιου τιμολογίου.','PENDING_INVOICE_FILE',400);
 let total=0;
 return pages.map(page=>{const mimeType=String(page?.mimeType||''),match=/^data:(image\/(?:jpeg|png|webp)|application\/pdf);base64,([A-Za-z0-9+/=]+)$/.exec(String(page?.dataUrl||''));if(!match||mimeType!==match[1])fail('Μη έγκυρο αρχείο τιμολογίου.','PENDING_INVOICE_FILE',400);const bytes=Buffer.from(match[2],'base64');total+=bytes.length;
  const signature=mimeType==='application/pdf'?bytes.subarray(0,5).toString()==='%PDF-':mimeType==='image/png'?bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):mimeType==='image/jpeg'?bytes[0]===255&&bytes[1]===216&&bytes[2]===255:bytes.subarray(0,4).toString()==='RIFF'&&bytes.subarray(8,12).toString()==='WEBP';
  if(!signature||bytes.length<100||total>6500000)fail('Το αρχείο δεν είναι έγκυρη εικόνα/PDF ή υπερβαίνει συνολικά τα 6,5 MB.','PENDING_INVOICE_FILE',400);
  return {checksum:hash(bytes),mimeType};
 });
}

const CAPTURE_EVENT='POS_INVOICE_PLAIN_CAPTURED';
const captureId=id=>'pi_capture_'+hash(id);
async function plainCaptureSource(db,scope,row){
 const proofs=await db.$queryRaw`SELECT "id","details" FROM "StoreOperatorAudit" WHERE "id"=${captureId(row.id)} AND "companyId"=${scope.companyId} AND "storeId"=${scope.storeId} AND "eventType"=${CAPTURE_EVENT}`;
 if(!proofs[0])return null;
 const proof=proofs[0],d=proof.details;
 if(d?.version!==VERSION||d.sourceKind!=='PLAIN_CAPTURE'||d.transactionId!==row.id||d.fingerprint!==row.details.fingerprint||d.supplierId!==row.supplierId||d.documentNumber!==row.details.documentNumber||d.documentDate!==row.details.documentDate||d.amountCents!==row.details.amountCents||d.contextSessionId!==row.details.contextSessionId||d.originalActorId!==row.actorId||!row.attachmentData||row.attachmentMimeType!==d.mimeType||row.attachmentChecksum!==d.checksum||row.attachmentFilename!==d.filename)fail('Η αποθηκευμένη σύνδεση πρωτοτύπου χρειάζεται έλεγχο.','PENDING_INVOICE_REVIEW_REQUIRED');
 const manifest=invoicePageManifest([{mimeType:row.attachmentMimeType,dataUrl:row.attachmentData}]);
 if(manifest[0].checksum!==d.checksum||JSON.stringify(manifest)!==JSON.stringify(d.manifest))fail('Το αποθηκευμένο πρωτότυπο άλλαξε.','PENDING_INVOICE_REVIEW_REQUIRED');
 return {sourceKind:'PLAIN_CAPTURE',attachmentId:row.id,proofId:proof.id,checksum:d.checksum,mimeType:d.mimeType,filename:d.filename,manifest};
}

export async function capturePendingInvoice(db,scope,body){
 scopeCheck(scope);
 if(operator(scope.user)&&!scope.user.permissions?.includes('SUPPLIER_PAYMENT'))fail('Δεν έχεις δικαίωμα πληρωμών προμηθευτή.','PENDING_INVOICE_SCOPE',403);
 if(body.sourceKind!=='PLAIN_CAPTURE'||!body.attachment)fail('Απαιτείται το πρωτότυπο παραστατικό χωρίς ανάγνωση AI.','PENDING_INVOICE_FIELDS',400);
 const attachment=body.attachment,manifest=invoicePageManifest([attachment]),filename=text(attachment.filename,180);
 if(!filename)fail('Απαιτείται όνομα πρωτοτύπου αρχείου.','PENDING_INVOICE_FIELDS',400);
 return db.$transaction(async tx=>{
  await assertLifecycleMutation(tx,scope,lifecycleContext()[scope.storeId]??'0');
  await lockInvoiceStore(tx,scope.companyId,scope.storeId);
  const binding=await assertExpectedPendingInvoice(tx,scope,{...body,pages:[attachment]},{lock:true}),{row,source}=binding;
  if(source){if(source.sourceKind!=='PLAIN_CAPTURE')fail('Το πρωτότυπο ανήκει ήδη σε υπάρχουσα ροή ανάγνωσης. Απαιτείται έλεγχος της ίδιας πηγής.','PENDING_INVOICE_SOURCE_KIND');return {ok:true,captured:true,duplicate:true,paymentTransactionId:row.id,...source};}
  if(row.attachmentData)fail('Η πληρωμή έχει ήδη διαφορετικό συνημμένο. Δεν αντικαταστάθηκε.','PENDING_INVOICE_REVIEW_REQUIRED');
  const checksum=manifest[0].checksum,mimeType=manifest[0].mimeType;
  await tx.$executeRaw`UPDATE "StoreTransaction" SET "attachmentData"=${attachment.dataUrl},"attachmentMimeType"=${mimeType},"attachmentFilename"=${filename},"attachmentChecksum"=${checksum} WHERE "id"=${row.id} AND "companyId"=${scope.companyId} AND "storeId"=${scope.storeId}`;
  const proofId=captureId(row.id),details={version:VERSION,sourceKind:'PLAIN_CAPTURE',transactionId:row.id,fingerprint:row.details.fingerprint,supplierId:row.supplierId,documentNumber:row.details.documentNumber,documentDate:row.details.documentDate,amountCents:row.details.amountCents,contextSessionId:row.details.contextSessionId,terminalPos:row.details.terminalPos,originalActorId:row.actorId,checksum,mimeType,filename,manifest};
  await tx.$executeRaw`INSERT INTO "StoreOperatorAudit" ("id","companyId","storeId","operatorId","actorId","eventType","details") VALUES (${proofId},${scope.companyId},${scope.storeId},${scope.user.operatorId||scope.user.id},${scope.user.id},${CAPTURE_EVENT},${JSON.stringify(details)}::jsonb)`;
  return {ok:true,captured:true,duplicate:false,paymentTransactionId:row.id,sourceKind:'PLAIN_CAPTURE',attachmentId:row.id,proofId,checksum,mimeType,filename,manifest};
 });
}

// These are existing durable invoice sources, never a generic payment proof.
export async function pendingInvoiceSource(db,scope,row){
 const plain=await plainCaptureSource(db,scope,row);if(plain)return plain;
 const jobs=await db.$queryRaw`SELECT "id","attachmentId","purchaseDocumentId","status","resultJson" FROM "AiReaderJob" WHERE "companyId"=${scope.companyId} AND "storeId"=${scope.storeId} AND (("resultJson"->'posHandoff'->>'paymentTransactionId'=${row.id} AND COALESCE("resultJson"->'posHandoff'->>'pageIndex','0')='0') OR "resultJson"->'mydataPosReceipt'->>'paymentTransactionId'=${row.id}) ORDER BY "createdAt","id" LIMIT 2`;
 if(!jobs.length)return null;if(jobs.length>1)fail('Περισσότερες από μία πηγές απαιτούν έλεγχο.');
 const job=jobs[0],h=job.resultJson?.posHandoff,receipt=job.resultJson?.mydataPosReceipt;
 if(['REJECTED','CANCELLED','DELETED'].includes(job.status)||!job.purchaseDocumentId&&['AWAITING_APPROVAL','CONFIRMED'].includes(job.status))fail('Η αρχική αλυσίδα παραστατικού δεν είναι διαθέσιμη για επανάληψη.','PENDING_INVOICE_REVIEW_REQUIRED');
 if(job.purchaseDocumentId){
  const chain=await db.$queryRaw`SELECT d."id",d."documentNumber",d."documentDate",d."totalGross" FROM "PurchaseDocument" d JOIN "PurchaseOrder" o ON o."id"=d."purchaseOrderId" AND o."companyId"=d."companyId" AND o."storeId"=d."storeId" AND o."sourceDocumentId"=d."id" WHERE d."id"=${job.purchaseDocumentId} AND d."companyId"=${scope.companyId} AND d."storeId"=${scope.storeId} AND d."paymentTransactionId"=${row.id} AND d."supplierId"=${row.supplierId} AND d."documentType"='INVOICE' AND d."status" IN ('DRAFT','APPROVED') AND o."status" IN ('NEW','FINAL','INVOICED')`;
  if(!chain[0]||invoiceToken(chain[0].documentNumber)!==invoiceToken(row.details.documentNumber)||day(chain[0].documentDate instanceof Date?chain[0].documentDate.toISOString().slice(0,10):String(chain[0].documentDate||'').slice(0,10))!==row.details.documentDate||cents(chain[0].totalGross)!==row.details.amountCents)fail('Το αρχικό πρόχειρο ή η αγορά έχουν διαγραφεί ή αλλάξει.','PENDING_INVOICE_REVIEW_REQUIRED');
 }
 let attachments=[];
 if(receipt?.receivedAt&&Array.isArray(receipt.attachmentIds)){
  const documents=await db.$queryRaw`SELECT "supplierId","documentNumber","documentDate","totalGross","documentType","paymentTransactionId" FROM "PurchaseDocument" WHERE "id"=${job.purchaseDocumentId||''} AND "companyId"=${scope.companyId} AND "storeId"=${scope.storeId} AND "paymentTransactionId"=${row.id} AND "status" IN ('DRAFT','APPROVED')`;
  const document=documents[0],documentDay=document?.documentDate instanceof Date?document.documentDate.toISOString().slice(0,10):day(String(document?.documentDate||''));
  if(!document||document.documentType!=='INVOICE'||document.supplierId!==row.supplierId||invoiceToken(document.documentNumber)!==invoiceToken(row.details.documentNumber)||documentDay!==row.details.documentDate||cents(document.totalGross)!==row.details.amountCents)fail('Η αγορά myDATA δεν συμφωνεί με την αρχική πληρωμή. Απαιτείται έλεγχος.');
  if(!receipt.attachmentIds.length||receipt.attachmentIds.length>5)fail('Η αποθηκευμένη παραλαβή έχει περισσότερες από πέντε σελίδες.');
  for(const id of receipt.attachmentIds.slice(0,6)){const a=await db.$queryRaw`SELECT "id","mimeType","checksum","contentData" FROM "DocumentAttachment" WHERE "id"=${id} AND "companyId"=${scope.companyId} AND "storeId"=${scope.storeId}`;if(a[0])attachments.push(a[0]);}
  if(attachments.length!==receipt.attachmentIds.length)fail('Λείπουν σελίδες του πρωτοτύπου.','PENDING_INVOICE_REVIEW_REQUIRED');
 }else if(h&&h.paymentTransactionId===row.id){
  if(invoiceToken(h.documentNumber)!==invoiceToken(row.details.documentNumber)||day(h.documentDate)!==row.details.documentDate||h.supplierId!==row.supplierId||cents(h.totalGross)!==row.details.amountCents)fail('Η αποθηκευμένη πηγή δεν συμφωνεί με την εκκρεμότητα.');
  const ids=Array.isArray(h.pageJobIds)?h.pageJobIds:[];
  if(!ids.length||ids.length>5||Number(h.pageCount)!==ids.length)fail('Ασυνεπής αριθμός σελίδων.','PENDING_INVOICE_REVIEW_REQUIRED');
  for(const id of ids.slice(0,6)){const a=await db.$queryRaw`SELECT a."id",a."mimeType",a."checksum",a."contentData" FROM "AiReaderJob" j JOIN "DocumentAttachment" a ON a."id"=j."attachmentId" AND a."companyId"=j."companyId" AND a."storeId"=j."storeId" WHERE j."id"=${id} AND j."companyId"=${scope.companyId} AND j."storeId"=${scope.storeId} AND j."resultJson"->'posHandoff'->>'paymentTransactionId'=${row.id}`;if(a[0])attachments.push(a[0]);}
  if(attachments.length!==ids.length)fail('Λείπουν σελίδες του πρωτοτύπου.','PENDING_INVOICE_REVIEW_REQUIRED');
 }
 if(!attachments.length)fail('Δεν υπάρχει έγκυρο πρωτότυπο.','PENDING_INVOICE_REVIEW_REQUIRED');
 const manifest=invoicePageManifest(attachments.map(a=>({mimeType:a.mimeType,dataUrl:a.contentData})));
 if(h?.pendingInvoiceManifest&&JSON.stringify(h.pendingInvoiceManifest)!==JSON.stringify(manifest))fail('Το πρωτότυπο άλλαξε από την αρχική παραλαβή.','PENDING_INVOICE_REVIEW_REQUIRED');
 if(manifest.some((m,i)=>m.checksum!==attachments[i].checksum))fail('Το πρωτότυπο αρχείο χρειάζεται έλεγχο ακεραιότητας.');
 const tasks=await db.$queryRaw`SELECT "state" FROM "PosInvoiceBackgroundTask" WHERE "jobId"=${job.id} AND "companyId"=${scope.companyId} AND "storeId"=${scope.storeId}`;
 return {sourceKind:'AI_HANDOFF',jobId:job.id,purchaseDocumentId:job.purchaseDocumentId||null,status:job.status,manifest,handoffReady:Boolean(receipt?.receivedAt)||Boolean(tasks[0])||['AWAITING_APPROVAL','CONFIRMED'].includes(job.status)};
}

export async function assertExpectedPendingInvoice(db,scope,body,{lock=false,allowAbsent=false}={}){
 const expected=body.expectedPendingInvoice;
 if(!expected){if(allowAbsent)return null;fail('Λείπει η αρχική εκκρεμότητα.','PENDING_INVOICE_FIELDS',400)}
 if(!text(expected.id)||!text(expected.fingerprint,64))fail('Μη έγκυρη εκκρεμότητα.','PENDING_INVOICE_FIELDS',400);
 const row=await intent(db,scope,expected.id,{lock}),h=header(body);
 if(row.details.fingerprint!==expected.fingerprint||body.paymentTransactionId!==row.id||body.settlementMode!=='PAID'||body.documentType!=='INVOICE'||h.supplierId!==row.supplierId||invoiceToken(h.documentNumber)!==invoiceToken(row.details.documentNumber)||h.documentDate!==row.details.documentDate||h.amountCents!==row.details.amountCents)fail('Τα στοιχεία δεν συμφωνούν με την αρχική πληρωμή. Δεν έγινε νέα εργασία.');
 const source=await pendingInvoiceSource(db,scope,row);
 if(source&&body.pages){if(JSON.stringify(invoicePageManifest(body.pages))!==JSON.stringify(source.manifest))fail('Το τιμολόγιο έχει ήδη ανέβει με διαφορετικό αρχείο. Χρησιμοποίησε τον ξεχωριστό ελεγχόμενο επανέλεγχο.');}
 return {row,source};
}

export async function pendingIntentForPayment(db,scope,paymentId){
 const rows=await db.$queryRaw`SELECT "details" FROM "StoreOperatorAudit" WHERE "id"=${eventId(paymentId)} AND "companyId"=${scope.companyId} AND "storeId"=${scope.storeId} AND "eventType"=${EVENT}`;
 return rows[0]?.details?.version===VERSION?{id:paymentId,fingerprint:rows[0].details.fingerprint}:null;
}

export async function readPendingInvoices(db,scope){
 scopeCheck(scope);if(operator(scope.user)&&scope.user.storeId!==scope.storeId)fail('Δεν έχεις πρόσβαση στο κατάστημα.','PENDING_INVOICE_SCOPE',403);
 const actor=operator(scope.user)&&!scope.sessionAll?scope.user.id:null,terminal=operator(scope.user)&&!scope.sessionAll?scope.terminalPos:null,sessionId=scope.sessionId||null;
 const result=await db.$queryRaw`WITH pending AS (
 SELECT t."id",t."supplierId",t."supplierName",t."amount",t."actorName",t."occurredAt",a."details"->>'documentNumber' AS "documentNumber",a."details"->>'documentDate' AS "documentDate",a."details"->>'contextSessionId' AS "sessionId",a."details"->>'terminalPos' AS "terminalPos",a."details"->>'fingerprint' AS fingerprint,
 CASE WHEN t."actorId"=a."actorId" AND t."paymentMethod"=a."details"->>'paymentMethod' AND t."subtractFromShift"=(a."details"->>'paymentSource'='CASH_SHIFT') AND ((a."details"->>'paymentSource'='CASH_SHIFT' AND t."sessionId"=a."details"->>'contextSessionId') OR (a."details"->>'paymentSource'='EXTERNAL' AND t."sessionId" IS NULL)) AND t."supplierId"=a."details"->>'supplierId' AND t."invoiceDocumentNumber"=a."details"->>'documentNumber' AND ROUND(t."amount"*100)::bigint::text=a."details"->>'amountCents' AND NOT EXISTS(SELECT 1 FROM "StoreOperatorAudit" deleted WHERE deleted."companyId"=t."companyId" AND deleted."storeId"=t."storeId" AND deleted."eventType"='PURCHASE_ORDER_DELETED' AND deleted."details"->>'preservedPaymentTransactionId'=t."id") THEN CASE WHEN (SELECT COUNT(*) FROM "AiReaderJob" primarysource WHERE primarysource."companyId"=t."companyId" AND primarysource."storeId"=t."storeId" AND ((primarysource."resultJson"->'posHandoff'->>'paymentTransactionId'=t."id" AND COALESCE(primarysource."resultJson"->'posHandoff'->>'pageIndex','0')='0') OR primarysource."resultJson"->'mydataPosReceipt'->>'paymentTransactionId'=t."id"))>1 THEN 'REVIEW_REQUIRED' WHEN EXISTS(SELECT 1 FROM "StoreOperatorAudit" invalidcapture WHERE invalidcapture."companyId"=t."companyId" AND invalidcapture."storeId"=t."storeId" AND invalidcapture."eventType"='POS_INVOICE_PLAIN_CAPTURED' AND invalidcapture."details"->>'transactionId'=t."id") THEN 'REVIEW_REQUIRED' WHEN EXISTS(SELECT 1 FROM "AiReaderJob" broken WHERE broken."companyId"=t."companyId" AND broken."storeId"=t."storeId" AND ((broken."resultJson"->'posHandoff'->>'paymentTransactionId'=t."id" AND COALESCE(broken."resultJson"->'posHandoff'->>'pageIndex','0')='0') OR broken."resultJson"->'mydataPosReceipt'->>'paymentTransactionId'=t."id") AND
 (broken."status" IN ('REJECTED','CANCELLED','DELETED') OR
 (broken."purchaseDocumentId" IS NOT NULL AND NOT EXISTS(SELECT 1 FROM "PurchaseDocument" bd JOIN "PurchaseOrder" bo ON bo."id"=bd."purchaseOrderId" AND bo."companyId"=bd."companyId" AND bo."storeId"=bd."storeId" AND bo."sourceDocumentId"=bd."id" WHERE bd."id"=broken."purchaseDocumentId" AND bd."companyId"=t."companyId" AND bd."storeId"=t."storeId" AND bd."paymentTransactionId"=t."id" AND bd."supplierId"=t."supplierId" AND bd."documentType"='INVOICE' AND bd."documentNumber"=t."invoiceDocumentNumber" AND (bd."documentDate" AT TIME ZONE 'UTC')::date::text=a."details"->>'documentDate' AND bd."totalGross"=t."amount" AND bd."status" IN ('DRAFT','APPROVED') AND bo."status" IN ('NEW','FINAL','INVOICED'))) OR
 (broken."resultJson"->'posHandoff'->>'paymentTransactionId'=t."id" AND
 (COALESCE(jsonb_typeof(broken."resultJson"->'posHandoff'->'pageJobIds'),'null')<>'array' OR broken."resultJson"->'posHandoff'->>'pageCount' IS DISTINCT FROM jsonb_array_length(CASE WHEN jsonb_typeof(broken."resultJson"->'posHandoff'->'pageJobIds')='array' THEN broken."resultJson"->'posHandoff'->'pageJobIds' ELSE '[]'::jsonb END)::text OR
 EXISTS(SELECT 1 FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(broken."resultJson"->'posHandoff'->'pageJobIds')='array' THEN broken."resultJson"->'posHandoff'->'pageJobIds' ELSE '[]'::jsonb END) member(id) WHERE NOT EXISTS(SELECT 1 FROM "AiReaderJob" bj JOIN "DocumentAttachment" ba ON ba."id"=bj."attachmentId" AND ba."companyId"=bj."companyId" AND ba."storeId"=bj."storeId" WHERE bj."id"=member.id AND bj."companyId"=t."companyId" AND bj."storeId"=t."storeId" AND bj."resultJson"->'posHandoff'->>'paymentTransactionId'=t."id" AND ba."contentData" IS NOT NULL AND ba."checksum" ~ '^[0-9a-f]{64}$')))) OR
 (broken."resultJson"->'mydataPosReceipt'->>'paymentTransactionId'=t."id" AND
 (COALESCE(jsonb_typeof(broken."resultJson"->'mydataPosReceipt'->'attachmentIds'),'null')<>'array' OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(broken."resultJson"->'mydataPosReceipt'->'attachmentIds')='array' THEN broken."resultJson"->'mydataPosReceipt'->'attachmentIds' ELSE '[]'::jsonb END) member(id) WHERE NOT EXISTS(SELECT 1 FROM "DocumentAttachment" ba WHERE ba."id"=member.id AND ba."companyId"=t."companyId" AND ba."storeId"=t."storeId" AND ba."contentData" IS NOT NULL AND ba."checksum" ~ '^[0-9a-f]{64}$')))))) THEN 'REVIEW_REQUIRED' WHEN EXISTS(SELECT 1 FROM "AiReaderJob" uploaded JOIN "DocumentAttachment" original ON original."companyId"=uploaded."companyId" AND original."storeId"=uploaded."storeId" AND (original."id"=uploaded."attachmentId" OR uploaded."resultJson"->'mydataPosReceipt'->'attachmentIds' ? original."id") WHERE uploaded."companyId"=t."companyId" AND uploaded."storeId"=t."storeId" AND original."contentData" IS NOT NULL AND original."checksum" ~ '^[0-9a-f]{64}$' AND (uploaded."resultJson"->'posHandoff'->>'paymentTransactionId'=t."id" OR uploaded."resultJson"->'mydataPosReceipt'->>'paymentTransactionId'=t."id")) THEN 'UPLOADED_AWAITING_REVIEW' ELSE 'AWAITING_INVOICE' END ELSE 'REVIEW_REQUIRED' END AS status
 FROM "StoreOperatorAudit" a JOIN "StoreTransaction" t ON t."id"=a."details"->>'transactionId' AND t."companyId"=a."companyId" AND t."storeId"=a."storeId"
 WHERE a."companyId"=${scope.companyId} AND a."storeId"=${scope.storeId} AND a."eventType"=${EVENT} AND a."details"->>'version'=${VERSION} AND t."type"='SUPPLIER_PAYMENT' AND t."reversedAt" IS NULL
 AND (${actor}::text IS NULL OR t."actorId"=${actor}) AND (${terminal}::text IS NULL OR a."details"->>'terminalPos'=${terminal}) AND (${sessionId}::text IS NULL OR a."details"->>'contextSessionId'=${sessionId})
 AND NOT EXISTS(SELECT 1 FROM "StoreOperatorAudit" capture WHERE capture."companyId"=t."companyId" AND capture."storeId"=t."storeId" AND capture."eventType"='POS_INVOICE_PLAIN_CAPTURED'
 AND capture."details"->>'version'=${VERSION} AND capture."details"->>'sourceKind'='PLAIN_CAPTURE' AND capture."details"->>'transactionId'=t."id" AND capture."details"->>'fingerprint'=a."details"->>'fingerprint'
 AND capture."details"->>'supplierId'=t."supplierId" AND capture."details"->>'documentNumber'=t."invoiceDocumentNumber" AND capture."details"->>'documentDate'=a."details"->>'documentDate' AND capture."details"->>'amountCents'=ROUND(t."amount"*100)::bigint::text
 AND capture."details"->>'contextSessionId'=a."details"->>'contextSessionId' AND capture."details"->>'originalActorId'=t."actorId" AND t."actorId"=a."actorId" AND t."paymentMethod"=a."details"->>'paymentMethod' AND t."subtractFromShift"=(a."details"->>'paymentSource'='CASH_SHIFT') AND ((a."details"->>'paymentSource'='CASH_SHIFT' AND t."sessionId"=a."details"->>'contextSessionId') OR (a."details"->>'paymentSource'='EXTERNAL' AND t."sessionId" IS NULL))
 AND t."attachmentData" IS NOT NULL AND t."attachmentChecksum" ~ '^[0-9a-f]{64}$' AND t."attachmentChecksum"=capture."details"->>'checksum' AND t."attachmentMimeType"=capture."details"->>'mimeType' AND t."attachmentFilename"=capture."details"->>'filename'
 AND capture."details"->'manifest'=jsonb_build_array(jsonb_build_object('checksum',t."attachmentChecksum",'mimeType',t."attachmentMimeType"))
 AND NOT EXISTS(SELECT 1 FROM "StoreOperatorAudit" deleted WHERE deleted."companyId"=t."companyId" AND deleted."storeId"=t."storeId" AND deleted."eventType"='PURCHASE_ORDER_DELETED' AND deleted."details"->>'preservedPaymentTransactionId'=t."id"))
 AND ((SELECT COUNT(*) FROM "AiReaderJob" primarysource WHERE primarysource."companyId"=t."companyId" AND primarysource."storeId"=t."storeId" AND ((primarysource."resultJson"->'posHandoff'->>'paymentTransactionId'=t."id" AND COALESCE(primarysource."resultJson"->'posHandoff'->>'pageIndex','0')='0') OR primarysource."resultJson"->'mydataPosReceipt'->>'paymentTransactionId'=t."id"))<>1 OR NOT EXISTS (SELECT 1 FROM "AiReaderJob" j JOIN "DocumentAttachment" f ON f."companyId"=j."companyId" AND f."storeId"=j."storeId" AND (f."id"=j."attachmentId" OR j."resultJson"->'mydataPosReceipt'->'attachmentIds' ? f."id")
 LEFT JOIN "PurchaseDocument" d ON d."id"=j."purchaseDocumentId" AND d."companyId"=j."companyId" AND d."storeId"=j."storeId" AND d."paymentTransactionId"=t."id"
 WHERE j."companyId"=t."companyId" AND j."storeId"=t."storeId" AND f."contentData" IS NOT NULL AND f."checksum" ~ '^[0-9a-f]{64}$'
 AND t."actorId"=a."actorId" AND t."paymentMethod"=a."details"->>'paymentMethod' AND t."subtractFromShift"=(a."details"->>'paymentSource'='CASH_SHIFT') AND ((a."details"->>'paymentSource'='CASH_SHIFT' AND t."sessionId"=a."details"->>'contextSessionId') OR (a."details"->>'paymentSource'='EXTERNAL' AND t."sessionId" IS NULL)) AND t."supplierId"=a."details"->>'supplierId' AND t."invoiceDocumentNumber"=a."details"->>'documentNumber' AND ROUND(t."amount"*100)::bigint::text=a."details"->>'amountCents'
 AND j."status" NOT IN ('REJECTED','CANCELLED','DELETED') AND NOT EXISTS(SELECT 1 FROM "StoreOperatorAudit" deleted WHERE deleted."companyId"=t."companyId" AND deleted."storeId"=t."storeId" AND deleted."eventType"='PURCHASE_ORDER_DELETED' AND deleted."details"->>'preservedPaymentTransactionId'=t."id")
 AND (j."purchaseDocumentId" IS NULL OR EXISTS(SELECT 1 FROM "PurchaseDocument" chain JOIN "PurchaseOrder" original ON original."id"=chain."purchaseOrderId" AND original."companyId"=chain."companyId" AND original."storeId"=chain."storeId" AND original."sourceDocumentId"=chain."id" WHERE chain."id"=j."purchaseDocumentId" AND chain."companyId"=t."companyId" AND chain."storeId"=t."storeId" AND chain."paymentTransactionId"=t."id" AND chain."supplierId"=t."supplierId" AND chain."documentType"='INVOICE' AND chain."documentNumber"=t."invoiceDocumentNumber" AND (chain."documentDate" AT TIME ZONE 'UTC')::date::text=a."details"->>'documentDate' AND chain."totalGross"=t."amount" AND chain."status" IN ('DRAFT','APPROVED') AND original."status" IN ('NEW','FINAL','INVOICED')))
 AND (j."resultJson"->'posHandoff'->'pendingInvoiceManifest' IS NULL OR
 (jsonb_typeof(j."resultJson"->'posHandoff'->'pendingInvoiceManifest')='array'
 AND jsonb_array_length(CASE WHEN jsonb_typeof(j."resultJson"->'posHandoff'->'pendingInvoiceManifest')='array' THEN j."resultJson"->'posHandoff'->'pendingInvoiceManifest' ELSE '[]'::jsonb END)=jsonb_array_length(CASE WHEN jsonb_typeof(j."resultJson"->'posHandoff'->'pageJobIds')='array' THEN j."resultJson"->'posHandoff'->'pageJobIds' ELSE '[]'::jsonb END)
 AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(j."resultJson"->'posHandoff'->'pendingInvoiceManifest')='array' THEN j."resultJson"->'posHandoff'->'pendingInvoiceManifest' ELSE '[]'::jsonb END) WITH ORDINALITY manifest(value,n)
 WHERE NOT EXISTS(SELECT 1 FROM "AiReaderJob" mj JOIN "DocumentAttachment" ma ON ma."id"=mj."attachmentId" AND ma."companyId"=mj."companyId" AND ma."storeId"=mj."storeId"
 WHERE mj."id"=j."resultJson"->'posHandoff'->'pageJobIds'->>((manifest.n-1)::int) AND mj."companyId"=j."companyId" AND mj."storeId"=j."storeId" AND ma."checksum"=manifest.value->>'checksum' AND ma."mimeType"=manifest.value->>'mimeType'))))
 AND ((j."resultJson"->'mydataPosReceipt'->>'paymentTransactionId'=t."id"
 AND jsonb_typeof(j."resultJson"->'mydataPosReceipt'->'attachmentIds')='array'
 AND jsonb_array_length(CASE WHEN jsonb_typeof(j."resultJson"->'mydataPosReceipt'->'attachmentIds')='array' THEN j."resultJson"->'mydataPosReceipt'->'attachmentIds' ELSE '[]'::jsonb END) BETWEEN 1 AND 5
 AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(j."resultJson"->'mydataPosReceipt'->'attachmentIds')='array' THEN j."resultJson"->'mydataPosReceipt'->'attachmentIds' ELSE '[]'::jsonb END) expected(id)
 WHERE NOT EXISTS(SELECT 1 FROM "DocumentAttachment" page WHERE page."id"=expected.id AND page."companyId"=j."companyId" AND page."storeId"=j."storeId" AND page."contentData" IS NOT NULL AND page."checksum" ~ '^[0-9a-f]{64}$')))
 OR (j."resultJson"->'posHandoff'->>'paymentTransactionId'=t."id"
 AND jsonb_typeof(j."resultJson"->'posHandoff'->'pageJobIds')='array'
 AND jsonb_array_length(CASE WHEN jsonb_typeof(j."resultJson"->'posHandoff'->'pageJobIds')='array' THEN j."resultJson"->'posHandoff'->'pageJobIds' ELSE '[]'::jsonb END) BETWEEN 1 AND 5
 AND (j."resultJson"->'posHandoff'->>'pageCount')=jsonb_array_length(CASE WHEN jsonb_typeof(j."resultJson"->'posHandoff'->'pageJobIds')='array' THEN j."resultJson"->'posHandoff'->'pageJobIds' ELSE '[]'::jsonb END)::text
 AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(j."resultJson"->'posHandoff'->'pageJobIds')='array' THEN j."resultJson"->'posHandoff'->'pageJobIds' ELSE '[]'::jsonb END) expected(id)
 WHERE NOT EXISTS(SELECT 1 FROM "AiReaderJob" pagejob JOIN "DocumentAttachment" page ON page."id"=pagejob."attachmentId" AND page."companyId"=pagejob."companyId" AND page."storeId"=pagejob."storeId"
 WHERE pagejob."id"=expected.id AND pagejob."companyId"=j."companyId" AND pagejob."storeId"=j."storeId" AND pagejob."status" NOT IN ('REJECTED','CANCELLED','DELETED') AND pagejob."resultJson"->'posHandoff'->>'paymentTransactionId'=t."id" AND pagejob."resultJson"->'posHandoff'->>'supplierId'=t."supplierId" AND pagejob."resultJson"->'posHandoff'->>'documentNumber'=t."invoiceDocumentNumber" AND page."contentData" IS NOT NULL AND page."checksum" ~ '^[0-9a-f]{64}$'))))
 AND ((j."resultJson"->'posHandoff'->>'paymentTransactionId'=t."id" AND j."purchaseDocumentId" IS NOT NULL AND (j."status" IN ('AWAITING_APPROVAL','CONFIRMED') OR EXISTS(SELECT 1 FROM "PosInvoiceBackgroundTask" task WHERE task."jobId"=j."id" AND task."companyId"=j."companyId" AND task."storeId"=j."storeId")) AND j."resultJson"->'posHandoff'->>'supplierId'=t."supplierId" AND j."resultJson"->'posHandoff'->>'documentNumber'=t."invoiceDocumentNumber" AND j."resultJson"->'posHandoff'->>'documentDate'=a."details"->>'documentDate' AND j."resultJson"->'posHandoff'->>'totalGross'=t."amount"::float8::text)
 OR (j."resultJson"->'mydataPosReceipt'->>'paymentTransactionId'=t."id" AND d."documentType"='INVOICE' AND d."status" IN ('DRAFT','APPROVED') AND d."supplierId"=t."supplierId" AND d."documentNumber"=t."invoiceDocumentNumber" AND (d."documentDate" AT TIME ZONE 'UTC')::date::text=a."details"->>'documentDate' AND d."totalGross"=t."amount")))
 )
 ) SELECT COUNT(*)::int AS count,COUNT(*) FILTER (WHERE status='AWAITING_INVOICE')::int AS "missingCount",COUNT(*) FILTER (WHERE status='UPLOADED_AWAITING_REVIEW')::int AS "uploadedCount",COUNT(*) FILTER (WHERE status='REVIEW_REQUIRED')::int AS "reviewCount",md5(COALESCE(string_agg("id"||':'||fingerprint||':'||status,',' ORDER BY "id"),'')) AS digest,
 (SELECT jsonb_agg(p ORDER BY p."occurredAt",p."id") FROM (SELECT * FROM pending ORDER BY "occurredAt","id" LIMIT 50) p) AS rows FROM pending`;
 const value=result[0]||{count:0,digest:'',rows:[]};
 return {rows:(value.rows||[]).map(row=>({...row,amount:Number(row.amount)})),count:Number(value.count),missingCount:Number(value.missingCount||0),uploadedCount:Number(value.uploadedCount||0),reviewCount:Number(value.reviewCount||0),truncated:Number(value.count)>50,fingerprint:hash([Number(value.count),value.digest])};
}

export async function checkClosePendingInvoices(tx,{companyId,storeId,user,session,acknowledged,expectedFingerprint}){
 const snapshot=await readPendingInvoices(tx,{companyId,storeId,user,sessionId:session.id,terminalPos:session.terminalPos,sessionAll:true});
 return {...snapshot,confirmationRequired:snapshot.count>0&&(!acknowledged||expectedFingerprint!==snapshot.fingerprint)};
}
export async function recordClosePendingInvoices(tx,{companyId,storeId,user,session,snapshot}){
 if(!snapshot?.count)return;
 const details={version:VERSION,sessionId:session.id,terminalPos:session.terminalPos,pendingCount:snapshot.count,missingInvoiceCount:snapshot.missingCount,uploadedAwaitingReviewCount:snapshot.uploadedCount,reviewCount:snapshot.reviewCount,pendingFingerprint:snapshot.fingerprint,transactionIds:snapshot.rows.map(row=>row.id),truncated:snapshot.truncated,decision:'CLOSED_WITH_PENDING_INVOICES'};
 await tx.$executeRaw`INSERT INTO "StoreOperatorAudit" ("id","companyId","storeId","operatorId","actorId","eventType","details") VALUES (${'pi_close_'+hash(session.id)},${companyId},${storeId},${user.operatorId||user.id},${user.id},'SHIFT_CLOSED_WITH_PENDING_INVOICES',${JSON.stringify(details)}::jsonb) ON CONFLICT ("id") DO NOTHING`;
}
