import crypto from 'node:crypto';
import {Prisma} from '@prisma/client';
import {invoiceToken,findInvoicePayment} from '../lib/invoice-payment-reuse.js';
import {lockInvoiceStore} from '../lib/invoice-common-draft.js';
import {assertLifecycleMutation} from './store-lifecycle-generation.js';
import {lifecycleContext} from './store-lifecycle-context.js';
import {requireMonthlyCaptureContext} from './monthly-inventory-capture-authorization.js';

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
 const capability=await pendingProbe(db,scope);
 if(!capability.jobs){if(capability.jobTable)fail('Η υπάρχουσα πηγή απαιτεί έλεγχο συμβατότητας.','PENDING_INVOICE_REVIEW_REQUIRED');return null;}
 const jobs=await db.$queryRaw`SELECT "id","attachmentId","purchaseDocumentId","status","resultJson" FROM "AiReaderJob" WHERE "companyId"=${scope.companyId} AND "storeId"=${scope.storeId} AND (("resultJson"->'posHandoff'->>'paymentTransactionId'=${row.id} AND COALESCE("resultJson"->'posHandoff'->>'pageIndex','0')='0') OR "resultJson"->'mydataPosReceipt'->>'paymentTransactionId'=${row.id}) ORDER BY "createdAt","id" LIMIT 2`;
 if(!jobs.length)return null;if(jobs.length>1)fail('Περισσότερες από μία πηγές απαιτούν έλεγχο.');
 if(!capability.full)fail('Η υπάρχουσα πηγή απαιτεί έλεγχο της αλυσίδας παραστατικού.','PENDING_INVOICE_REVIEW_REQUIRED');
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

// Catalog reads never initialize the optional AI intake schema. Absence is not
// cached: a later explicitly licensed intake may add its own capabilities.
async function pendingProbe(db,scope){
 const actor=operator(scope.user)&&!scope.sessionAll?scope.user.id:null,terminal=operator(scope.user)&&!scope.sessionAll?scope.terminalPos:null,sessionId=scope.sessionId||null;
 const rows=await db.$queryRaw`WITH required("relation","columns") AS (VALUES
 ('AiReaderJob',ARRAY['id','companyId','storeId','attachmentId','purchaseDocumentId','status','resultJson','createdAt']::text[]),
 ('PurchaseDocument',ARRAY['id','companyId','storeId','supplierId','documentType','documentNumber','documentDate','totalGross','status','purchaseOrderId','paymentTransactionId']::text[]),
 ('PurchaseOrder',ARRAY['id','companyId','storeId','status','sourceDocumentId']::text[]),
 ('DocumentAttachment',ARRAY['id','companyId','storeId','mimeType','checksum','contentData']::text[]),
 ('PosInvoiceBackgroundTask',ARRAY['jobId','companyId','storeId']::text[])
 ), capabilities AS (
 SELECT r."relation",cardinality(r."columns") AS wanted,COUNT(a.attname) AS present,
 to_regclass(format('%I.%I',current_schema(),r."relation")) IS NOT NULL AS "tableExists"
 FROM required r LEFT JOIN pg_attribute a ON a.attrelid=to_regclass(format('%I.%I',current_schema(),r."relation")) AND a.attname=ANY(r."columns") AND a.attnum>0 AND NOT a.attisdropped
 GROUP BY r."relation",r."columns"
 ) SELECT bool_and(present=wanted) AS full,bool_and(present=wanted) FILTER (WHERE "relation"='AiReaderJob') AS jobs,bool_or("tableExists") FILTER (WHERE "relation"='AiReaderJob') AS "jobTable",
 EXISTS(SELECT 1 FROM "StoreOperatorAudit" a JOIN "StoreTransaction" t ON t."id"=a."details"->>'transactionId' AND t."companyId"=a."companyId" AND t."storeId"=a."storeId"
 WHERE a."companyId"=${scope.companyId} AND a."storeId"=${scope.storeId} AND a."eventType"=${EVENT} AND a."details"->>'version'=${VERSION} AND t."type"='SUPPLIER_PAYMENT' AND t."reversedAt" IS NULL
 AND (${actor}::text IS NULL OR t."actorId"=${actor}) AND (${terminal}::text IS NULL OR a."details"->>'terminalPos'=${terminal}) AND (${sessionId}::text IS NULL OR a."details"->>'contextSessionId'=${sessionId})) AS "hasIntents" FROM capabilities`;
 return rows[0];
}

async function readPendingInvoiceRows(db,scope,full=false){
 scopeCheck(scope);if(operator(scope.user)&&scope.user.storeId!==scope.storeId)fail('Δεν έχεις πρόσβαση στο κατάστημα.','PENDING_INVOICE_SCOPE',403);
 return readPendingInvoiceRowsCore(db,scope,full);
}

// Private SQL core: its only callers establish personal or opaque service scope.
async function readPendingInvoiceRowsCore(db,scope,full=false){
 const capability=await pendingProbe(db,scope);
 if(!capability.hasIntents)return {capability,value:{count:0,missingCount:0,uploadedCount:0,reviewCount:0,digest:'d41d8cd98f00b204e9800998ecf8427e',rows:[]}};
 const actor=operator(scope.user)&&!scope.sessionAll?scope.user.id:null,terminal=operator(scope.user)&&!scope.sessionAll?scope.terminalPos:null,sessionId=scope.sessionId||null;
 const jobRows=capability.jobs?Prisma.sql`SELECT "id","attachmentId","purchaseDocumentId","status","resultJson"->'posHandoff' AS h,"resultJson"->'mydataPosReceipt' AS r FROM "AiReaderJob" WHERE "companyId"=${scope.companyId} AND "storeId"=${scope.storeId}`:Prisma.sql`SELECT NULL::text AS "id",NULL::text AS "attachmentId",NULL::text AS "purchaseDocumentId",NULL::text AS "status",NULL::jsonb AS h,NULL::jsonb AS r WHERE FALSE`;
 const sourceFacts=capability.full?Prisma.sql`
 attachment_meta AS MATERIALIZED (
 SELECT "id","mimeType","checksum","contentData" IS NOT NULL AS present FROM "DocumentAttachment" WHERE "companyId"=${scope.companyId} AND "storeId"=${scope.storeId}
 ), document_chains AS MATERIALIZED (
 SELECT d."id",d."paymentTransactionId",d."supplierId",d."documentType",d."documentNumber",(d."documentDate" AT TIME ZONE 'UTC')::date::text AS "documentDay",d."totalGross",d."status",o."status" AS "orderStatus"
 FROM "PurchaseDocument" d JOIN "PurchaseOrder" o ON o."id"=d."purchaseOrderId" AND o."companyId"=d."companyId" AND o."storeId"=d."storeId" AND o."sourceDocumentId"=d."id"
 WHERE d."companyId"=${scope.companyId} AND d."storeId"=${scope.storeId}
 ), task_meta AS MATERIALIZED (
 SELECT DISTINCT "jobId" FROM "PosInvoiceBackgroundTask" WHERE "companyId"=${scope.companyId} AND "storeId"=${scope.storeId}
 ), handoff_pages AS MATERIALIZED (
 SELECT b."paymentId",b."sourceId",p."pageId",p.n,j.h->'pendingInvoiceManifest'->((p.n-1)::int) AS manifest,j.h->'pendingInvoiceManifest' IS NULL AS "legacyManifest"
 FROM primary_bindings b JOIN jobs j ON j."id"=b."sourceId"
 CROSS JOIN LATERAL jsonb_array_elements_text(CASE WHEN jsonb_typeof(j.h->'pageJobIds')='array' THEN j.h->'pageJobIds' ELSE '[]'::jsonb END) WITH ORDINALITY p("pageId",n)
 ), handoff_page_facts AS MATERIALIZED (
 SELECT d."paymentId",d."sourceId",COUNT(*) AS n,
 bool_and(COALESCE(p."id" IS NOT NULL AND p."status" NOT IN ('REJECTED','CANCELLED','DELETED') AND p.h->>'paymentTransactionId'=i."id" AND p.h->>'supplierId'=i."supplierId" AND p.h->>'documentNumber'=i."invoiceDocumentNumber" AND a.present AND a."checksum" ~ '^[0-9a-f]{64}$',FALSE)) AS valid,
 bool_and(COALESCE(d."legacyManifest" OR (a."checksum"=d.manifest->>'checksum' AND a."mimeType"=d.manifest->>'mimeType'),FALSE)) AS "manifestValid"
 FROM handoff_pages d JOIN intents i ON i."id"=d."paymentId" LEFT JOIN jobs p ON p."id"=d."pageId" LEFT JOIN attachment_meta a ON a."id"=p."attachmentId"
 GROUP BY d."paymentId",d."sourceId"
 ), receipt_pages AS MATERIALIZED (
 SELECT b."paymentId",b."sourceId",p."attachmentId" FROM primary_bindings b JOIN jobs j ON j."id"=b."sourceId"
 CROSS JOIN LATERAL jsonb_array_elements_text(CASE WHEN jsonb_typeof(j.r->'attachmentIds')='array' THEN j.r->'attachmentIds' ELSE '[]'::jsonb END) p("attachmentId")
 ), receipt_page_facts AS MATERIALIZED (
 SELECT p."paymentId",p."sourceId",COUNT(*) AS n,bool_and(COALESCE(a.present AND a."checksum" ~ '^[0-9a-f]{64}$',FALSE)) AS valid
 FROM receipt_pages p LEFT JOIN attachment_meta a ON a."id"=p."attachmentId" GROUP BY p."paymentId",p."sourceId"
 ), content_rows AS MATERIALIZED (
 SELECT b."paymentId",a.present AND a."checksum" ~ '^[0-9a-f]{64}$' AS present FROM all_bindings b JOIN jobs j ON j."id"=b."sourceId" JOIN attachment_meta a ON a."id"=j."attachmentId"
 UNION ALL SELECT p."paymentId",a.present AND a."checksum" ~ '^[0-9a-f]{64}$' FROM receipt_pages p JOIN attachment_meta a ON a."id"=p."attachmentId"
 ), source_content AS MATERIALIZED (SELECT "paymentId",bool_or(present) AS present FROM content_rows GROUP BY "paymentId"),
 source_headers AS MATERIALIZED (
 SELECT b."paymentId",b."sourceId",j."purchaseDocumentId",j."status",j.h,j.r,
 COALESCE(c."id" IS NOT NULL AND c."paymentTransactionId"=i."id" AND c."supplierId"=i."supplierId" AND c."documentType"='INVOICE' AND c."documentNumber"=i."invoiceDocumentNumber" AND c."documentDay"=i.details->>'documentDate' AND c."totalGross"=i."amount" AND c."status" IN ('DRAFT','APPROVED') AND c."orderStatus" IN ('NEW','FINAL','INVOICED'),FALSE) AS "chainValid",
 COALESCE(j.h->>'paymentTransactionId'=i."id" AND j.h->>'supplierId'=i."supplierId" AND j.h->>'documentNumber'=i."invoiceDocumentNumber" AND j.h->>'documentDate'=i.details->>'documentDate' AND j.h->>'totalGross'=i."amount"::float8::text,FALSE) AS "headerValid",
 COALESCE(jsonb_typeof(j.h->'pageJobIds')='array' AND jsonb_array_length(CASE WHEN jsonb_typeof(j.h->'pageJobIds')='array' THEN j.h->'pageJobIds' ELSE '[]'::jsonb END) BETWEEN 1 AND 5 AND j.h->>'pageCount'=hp.n::text AND hp.valid,FALSE) AS "handoffPagesValid",
 COALESCE(j.h->'pendingInvoiceManifest' IS NULL OR (jsonb_typeof(j.h->'pendingInvoiceManifest')='array' AND jsonb_array_length(CASE WHEN jsonb_typeof(j.h->'pendingInvoiceManifest')='array' THEN j.h->'pendingInvoiceManifest' ELSE '[]'::jsonb END)=hp.n AND hp."manifestValid"),FALSE) AS "manifestValid",
 COALESCE(jsonb_typeof(j.r->'attachmentIds')='array' AND rp.n BETWEEN 1 AND 5 AND rp.valid,FALSE) AS "receiptPagesValid",task."jobId" IS NOT NULL AS "hasTask"
 FROM primary_bindings b JOIN jobs j ON j."id"=b."sourceId" JOIN intents i ON i."id"=b."paymentId"
 LEFT JOIN document_chains c ON c."id"=j."purchaseDocumentId" LEFT JOIN task_meta task ON task."jobId"=j."id"
 LEFT JOIN handoff_page_facts hp ON hp."paymentId"=b."paymentId" AND hp."sourceId"=b."sourceId" LEFT JOIN receipt_page_facts rp ON rp."paymentId"=b."paymentId" AND rp."sourceId"=b."sourceId"
 ), source_facts AS MATERIALIZED (
 SELECT "paymentId","sourceId",
 "status" NOT IN ('REJECTED','CANCELLED','DELETED') AND "chainValid" AND "manifestValid" AND (("headerValid" AND "handoffPagesValid" AND ("status" IN ('AWAITING_APPROVAL','CONFIRMED') OR "hasTask")) OR (r->>'paymentTransactionId'="paymentId" AND "receiptPagesValid")) AS valid,
 "status" IN ('REJECTED','CANCELLED','DELETED') OR ("purchaseDocumentId" IS NULL AND "status" IN ('AWAITING_APPROVAL','CONFIRMED')) OR ("purchaseDocumentId" IS NOT NULL AND NOT "chainValid") OR (h->>'paymentTransactionId'="paymentId" AND (NOT "headerValid" OR NOT "handoffPagesValid" OR NOT "manifestValid")) OR (r->>'paymentTransactionId'="paymentId" AND NOT "receiptPagesValid") AS broken
 FROM source_headers
 )`:Prisma.sql`
 source_content AS MATERIALIZED (SELECT NULL::text AS "paymentId",FALSE AS present WHERE FALSE),
 source_facts AS MATERIALIZED (SELECT "paymentId","sourceId",FALSE AS valid,TRUE AS broken FROM primary_bindings)
 `;
 const projection=full?Prisma.sql`"id","supplierName","amount"::text AS "amount","documentNumber","documentDate",status,"occurredAt"`:Prisma.sql`*`;
 const bounded=Prisma.sql`octet_length("id")<=160 AND ("supplierName" IS NULL OR octet_length("supplierName")<=512) AND ("documentNumber" IS NULL OR octet_length("documentNumber")<=160) AND ("documentDate" IS NULL OR octet_length("documentDate")<=10) AND ("amount" IS NULL OR octet_length("amount"::text)<=32)`;
 const metadataRow=Prisma.sql`jsonb_build_object('id',"id",'companyId',${scope.companyId},'storeId',${scope.storeId},'supplierName',"supplierName",'documentNumber',"documentNumber",'documentDate',"documentDate",'status',status,'amount',"amount"::text)`;
 // Full mode preflights bounded fields before constructing any row JSON and
 // gates the aggregate in a scalar subquery. CASE around an aggregate alone
 // would still allocate that aggregate before checking its condition.
 const metadataLimits=full?Prisma.sql`, pending_count AS MATERIALIZED (SELECT COUNT(*) AS n FROM pending), metadata_limits AS MATERIALIZED (SELECT COUNT(*) AS n,COALESCE(bool_and(${bounded}),TRUE) AS valid,COALESCE(SUM(CASE WHEN (SELECT n<=20000 FROM pending_count) AND ${bounded} THEN octet_length(${metadataRow}::text)+1 ELSE 0 END),0) AS bytes FROM pending)`:Prisma.sql``;
 const metadataFlags=full?Prisma.sql`,(SELECT valid FROM metadata_limits) AS "_snapshotMetadataValid",(SELECT bytes::text FROM metadata_limits) AS "_snapshotBytes"`:Prisma.sql``;
 const rowSelection=full?Prisma.sql`CASE WHEN (SELECT n<=20000 AND valid AND bytes<=4193280 FROM metadata_limits) THEN (SELECT jsonb_agg(to_jsonb(p)-'occurredAt' ORDER BY p."occurredAt",p."id") FROM (SELECT ${projection} FROM pending ORDER BY "occurredAt","id" LIMIT 20001) p) ELSE '[]'::jsonb END`:Prisma.sql`(SELECT jsonb_agg(p ORDER BY p."occurredAt",p."id") FROM (SELECT * FROM pending ORDER BY "occurredAt","id" LIMIT 50) p)`;
 const result=await db.$queryRaw(Prisma.sql`WITH scoped_audits AS MATERIALIZED (
 SELECT "eventType","actorId","details" FROM "StoreOperatorAudit" WHERE "companyId"=${scope.companyId} AND "storeId"=${scope.storeId} AND "eventType" IN (${EVENT},${CAPTURE_EVENT},'PURCHASE_ORDER_DELETED')
 ), intents AS MATERIALIZED (
 SELECT t."id",t."supplierId",t."supplierName",t."amount",t."actorId",t."actorName",t."occurredAt",t."invoiceDocumentNumber",t."attachmentMimeType",t."attachmentFilename",t."attachmentChecksum",t."attachmentData" IS NOT NULL AS "hasAttachment",a."details" AS details,
 COALESCE(t."actorId"=a."actorId" AND t."paymentMethod"=a."details"->>'paymentMethod' AND t."subtractFromShift"=(a."details"->>'paymentSource'='CASH_SHIFT') AND ((a."details"->>'paymentSource'='CASH_SHIFT' AND t."sessionId"=a."details"->>'contextSessionId') OR (a."details"->>'paymentSource'='EXTERNAL' AND t."sessionId" IS NULL)) AND t."supplierId"=a."details"->>'supplierId' AND t."invoiceDocumentNumber"=a."details"->>'documentNumber' AND ROUND(t."amount"*100)::bigint::text=a."details"->>'amountCents',FALSE) AS "paymentValid"
 FROM scoped_audits a JOIN "StoreTransaction" t ON t."id"=a."details"->>'transactionId' AND t."companyId"=${scope.companyId} AND t."storeId"=${scope.storeId}
 WHERE a."eventType"=${EVENT} AND a."details"->>'version'=${VERSION} AND t."type"='SUPPLIER_PAYMENT' AND t."reversedAt" IS NULL
 AND (${actor}::text IS NULL OR t."actorId"=${actor}) AND (${terminal}::text IS NULL OR a."details"->>'terminalPos'=${terminal}) AND (${sessionId}::text IS NULL OR a."details"->>'contextSessionId'=${sessionId})
 ), tombstones AS MATERIALIZED (SELECT DISTINCT "details"->>'preservedPaymentTransactionId' AS "paymentId" FROM scoped_audits WHERE "eventType"='PURCHASE_ORDER_DELETED'),
 capture_facts AS MATERIALIZED (
 SELECT i."id",bool_or(COALESCE(c."details"->>'version'=${VERSION} AND c."details"->>'sourceKind'='PLAIN_CAPTURE' AND c."details"->>'fingerprint'=i.details->>'fingerprint' AND c."details"->>'supplierId'=i."supplierId" AND c."details"->>'documentNumber'=i."invoiceDocumentNumber" AND c."details"->>'documentDate'=i.details->>'documentDate' AND c."details"->>'amountCents'=ROUND(i."amount"*100)::bigint::text AND c."details"->>'contextSessionId'=i.details->>'contextSessionId' AND c."details"->>'originalActorId'=i."actorId" AND i."hasAttachment" AND i."attachmentChecksum" ~ '^[0-9a-f]{64}$' AND i."attachmentChecksum"=c."details"->>'checksum' AND i."attachmentMimeType"=c."details"->>'mimeType' AND i."attachmentFilename"=c."details"->>'filename' AND c."details"->'manifest'=jsonb_build_array(jsonb_build_object('checksum',i."attachmentChecksum",'mimeType',i."attachmentMimeType")),FALSE)) AS valid,TRUE AS present
 FROM scoped_audits c JOIN intents i ON i."id"=c."details"->>'transactionId' WHERE c."eventType"=${CAPTURE_EVENT} GROUP BY i."id"
 ), jobs AS MATERIALIZED (${jobRows}),
 primary_bindings AS MATERIALIZED (
 SELECT "id" AS "sourceId",h->>'paymentTransactionId' AS "paymentId" FROM jobs WHERE h->>'paymentTransactionId' IS NOT NULL AND COALESCE(h->>'pageIndex','0')='0'
 UNION SELECT "id",r->>'paymentTransactionId' FROM jobs WHERE r->>'paymentTransactionId' IS NOT NULL
 ), all_bindings AS MATERIALIZED (
 SELECT "id" AS "sourceId",h->>'paymentTransactionId' AS "paymentId" FROM jobs WHERE h->>'paymentTransactionId' IS NOT NULL
 UNION SELECT "id",r->>'paymentTransactionId' FROM jobs WHERE r->>'paymentTransactionId' IS NOT NULL
 ), source_counts AS MATERIALIZED (SELECT "paymentId",COUNT(*) AS n,MIN("sourceId") AS "sourceId" FROM primary_bindings GROUP BY "paymentId"),
 ${sourceFacts}, decisions AS MATERIALIZED (
 SELECT i.*,c.valid AS "captureValid",c.present AS "capturePresent",t."paymentId" IS NOT NULL AS tombstoned,COALESCE(s.n,0) AS "sourceCount",f.valid AS "sourceValid",f.broken AS "sourceBroken",content.present AS "sourcePresent"
 FROM intents i LEFT JOIN capture_facts c ON c."id"=i."id" LEFT JOIN tombstones t ON t."paymentId"=i."id"
 LEFT JOIN source_counts s ON s."paymentId"=i."id" LEFT JOIN source_facts f ON f."paymentId"=i."id" AND f."sourceId"=s."sourceId" LEFT JOIN source_content content ON content."paymentId"=i."id"
 ), pending AS (
 SELECT "id","supplierId","supplierName","amount","actorName","occurredAt",details->>'documentNumber' AS "documentNumber",details->>'documentDate' AS "documentDate",details->>'contextSessionId' AS "sessionId",details->>'terminalPos' AS "terminalPos",details->>'fingerprint' AS fingerprint,
 CASE WHEN NOT "paymentValid" OR tombstoned OR "sourceCount">1 OR "capturePresent" OR ${Boolean(capability.jobTable&&!capability.jobs)} OR COALESCE("sourceBroken",FALSE) THEN 'REVIEW_REQUIRED' WHEN "sourcePresent" THEN 'UPLOADED_AWAITING_REVIEW' ELSE 'AWAITING_INVOICE' END AS status
 FROM decisions WHERE NOT ("paymentValid" AND NOT tombstoned AND (COALESCE("captureValid",FALSE) OR ("sourceCount"=1 AND COALESCE("sourceValid",FALSE))))
 ) ${metadataLimits} SELECT COUNT(*)::int AS count,COUNT(*) FILTER (WHERE status='AWAITING_INVOICE')::int AS "missingCount",COUNT(*) FILTER (WHERE status='UPLOADED_AWAITING_REVIEW')::int AS "uploadedCount",COUNT(*) FILTER (WHERE status='REVIEW_REQUIRED')::int AS "reviewCount",md5(COALESCE(string_agg("id"||':'||fingerprint||':'||status,',' ORDER BY "id"),'')) AS digest,
 ${rowSelection} AS rows ${metadataFlags} FROM pending`);
 return {capability,value:result[0]||{count:0,digest:'',rows:[]}};
}

export async function readPendingInvoices(db,scope){
 const {value}=await readPendingInvoiceRows(db,scope);
 return {rows:(value.rows||[]).map(row=>({...row,amount:Number(row.amount)})),count:Number(value.count),missingCount:Number(value.missingCount||0),uploadedCount:Number(value.uploadedCount||0),reviewCount:Number(value.reviewCount||0),truncated:Number(value.count)>50,fingerprint:hash([Number(value.count),value.digest])};
}

// Internal metadata mode for an already authorized caller-held source snapshot.
// The payment/source decisions above are shared with the unchanged POS reader.
export async function readPendingInvoiceSnapshotRows(db,scope){
 if(!scope?.user||scope.user.companyId!==scope.companyId||scope.user.storeId&&scope.user.storeId!==scope.storeId||scope.user.tokenType&&scope.user.tokenType!=='BACKOFFICE_USER'||!['SUPER_ADMIN','OWNER','ADMIN','MANAGER'].includes(scope.user.role))fail('Απαιτείται εξουσιοδοτημένη διαχείριση BackOffice.','PENDING_SNAPSHOT_DENIED',403);
 return readPendingInvoiceSnapshotCore(db,()=>readPendingInvoiceRows(db,scope,true));
}

export async function readPendingInvoiceSnapshotRowsForAutomationInTransaction(tx,context){
 if(arguments.length!==2)fail('Μη έγκυρη ανάθεση απογραφής.','PENDING_SNAPSHOT_DENIED',403);
 const authority=await requireMonthlyCaptureContext(tx,context,'SOURCE');
 const scope={companyId:authority.companyId,storeId:authority.storeId};
 return readPendingInvoiceSnapshotCore(tx,()=>readPendingInvoiceRowsCore(tx,scope,true));
}

// The reader closure is private and constructed only after the corresponding
// personal or transaction-bound service admission; no caller can inject it.
async function readPendingInvoiceSnapshotCore(db,readRows){
 const state=await db.$queryRawUnsafe(`SELECT current_setting('transaction_read_only') AS "readOnly",current_setting('transaction_isolation') AS isolation`);
 if(state[0]?.readOnly!=='on'||!['repeatable read','serializable'].includes(state[0]?.isolation))fail('Απαιτείται κοινό στιγμιότυπο μόνο ανάγνωσης.','PENDING_SNAPSHOT_TRANSACTION_REQUIRED',422);
 const {capability,value}=await readRows(),count=Number(value.count),rows=value.rows||[];
 if(!Number.isSafeInteger(count)||count<0||count>20000||!Array.isArray(rows)||rows.length>20000)fail('Η πηγή υπερβαίνει το ασφαλές όριο.','PENDING_SNAPSHOT_LIMIT',422);
 if(value._snapshotMetadataValid===false)fail('Η πηγή περιέχει υπερμεγέθη μεταδεδομένα.','PENDING_SNAPSHOT_TEXT_LIMIT',422);
 if(value._snapshotBytes!==undefined&&(!/^\d+$/.test(value._snapshotBytes)||BigInt(value._snapshotBytes)>4193280n))fail('Η πηγή υπερβαίνει το ασφαλές μέγεθος.','PENDING_SNAPSHOT_PAYLOAD_LIMIT',422);
 if(rows.length!==count)fail('Δεν επιβεβαιώθηκε πλήρης ανάγνωση εκκρεμοτήτων.','PENDING_SNAPSHOT_COUNT_MISMATCH',502);
 const counts={total:count,missingOriginal:Number(value.missingCount||0),uploadedAwaitingReview:Number(value.uploadedCount||0),reviewRequired:Number(value.reviewCount||0)};
 if(Object.values(counts).some(n=>!Number.isSafeInteger(n)||n<0)||counts.missingOriginal+counts.uploadedAwaitingReview+counts.reviewRequired!==count)fail('Δεν επιβεβαιώθηκαν τα πλήρη σύνολα.','PENDING_SNAPSHOT_COUNT_MISMATCH',502);
 return {period:'ALL_MONTHS',coverage:{complete:capability.full===true,unavailable:capability.full===true?[]:['PENDING_SOURCE_SCHEMA_INCOMPLETE'],sourceLimit:20000},counts,rows,fingerprint:hash([count,value.digest])};
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
