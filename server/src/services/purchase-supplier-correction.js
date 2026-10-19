import crypto from "node:crypto";
import {z} from "zod";
import {lockInvoiceStore} from "../lib/invoice-common-draft.js";

const roles=new Set(["SUPER_ADMIN","OWNER","ADMIN","MANAGER"]);
const fail=(message,status=409)=>Object.assign(new Error(message),{status});
const raw=(db,sql,...values)=>db.$queryRawUnsafe(sql,...values);
const run=(db,sql,...values)=>db.$executeRawUnsafe(sql,...values);
const hash=value=>crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
const number=value=>String(value||"").trim().toLocaleUpperCase("el-GR").replace(/\s+/g,"");
const scopeSchema=z.object({storeId:z.string().min(1).max(160),supplierId:z.string().min(1).max(160)}).strict();
export const supplierCorrectionSchema=scopeSchema.extend({version:z.string().regex(/^[a-f0-9]{64}$/),reason:z.string().trim().min(5).max(500),confirmOriginal:z.literal(true),confirmPaymentSupplier:z.boolean().optional()}).strict();
export function requireSupplierCorrectionActor(actor,storeId){
 if(!actor?.id||!actor.companyId||actor.tokenType==="STORE_OPERATOR"||!roles.has(actor.role))throw fail("Η διόρθωση προμηθευτή επιτρέπεται μόνο σε εξουσιοδοτημένη διαχείριση BackOffice.",403);
 if(!storeId||actor.storeId&&String(actor.storeId)!==storeId)throw fail("Επίλεξε το επιτρεπόμενο κατάστημα της αγοράς.",403);
}
// Fence the older metadata form against an in-flight reviewed correction.
export async function lockPurchaseSupplierMetadata(tx,order){
 await lockInvoiceStore(tx,order.companyId,order.storeId);
 const [current]=await raw(tx,'SELECT "status","supplierId","updatedAt" FROM "PurchaseOrder" WHERE "id"=$1 AND "companyId"=$2 AND "storeId"=$3 FOR UPDATE',order.id,order.companyId,order.storeId);
 if(!current||current.status!==order.status||current.supplierId!==order.supplierId||new Date(current.updatedAt).getTime()!==new Date(order.updatedAt).getTime())throw fail("Η αγορά άλλαξε. Ανανέωσε πριν αποθηκεύσεις στοιχεία.");
}
async function exists(tx,name){return (await raw(tx,'SELECT to_regclass($1) IS NOT NULL AS "exists"','"'+name+'"'))[0]?.exists===true}
async function load(tx,actor,orderId,{storeId,supplierId}){
 const companyId=actor.companyId;
 const [order]=await raw(tx,`SELECT o.* FROM "PurchaseOrder" o JOIN "Store" s ON s."id"=o."storeId" AND s."companyId"=o."companyId" WHERE o."id"=$1 AND o."companyId"=$2 AND o."storeId"=$3 FOR UPDATE OF o`,orderId,companyId,storeId);
 if(!order)throw fail("Δεν βρέθηκε η αγορά στο επιλεγμένο κατάστημα.",404);
 if(order.sourceType!=="POS_OCR_DRAFT"||!order.sourceDocumentId||order.sourceDocumentId===order.id||!['NEW','FINAL','INVOICED'].includes(order.status)||Number(order.reopenVersion||0)>0)throw fail("Η συγκεκριμένη αγορά χρειάζεται χωριστό έλεγχο· δεν έγινε αλλαγή προμηθευτή.");
 const suppliers=await raw(tx,'SELECT "id","name","taxId","active" FROM "Supplier" WHERE "companyId"=$1 AND "id"=ANY($2::text[]) ORDER BY "id" FOR SHARE',companyId,[order.supplierId,supplierId].filter(Boolean));
 const target=suppliers.find(s=>s.id===supplierId),beforeSupplier=suppliers.find(s=>s.id===order.supplierId)||null;
 if(!target?.active||!/^\d{9}$/.test(String(target.taxId||'').trim()))throw fail("Επίλεξε ενεργό προμηθευτή της ίδιας εταιρείας με καταχωρισμένο εννιαψήφιο ΑΦΜ.",400);
 const documents=await raw(tx,`SELECT * FROM "PurchaseDocument" WHERE "companyId"=$1 AND ("id"=$2 OR "id"=$3 OR "purchaseOrderId"=$2) ORDER BY "id" FOR UPDATE`,companyId,orderId,order.sourceDocumentId);
 const source=documents.find(d=>d.id===order.sourceDocumentId),projection=documents.find(d=>d.id===orderId),posted=order.status!=="NEW";
 if(!source||source.storeId!==storeId||source.purchaseOrderId!==orderId||source.sourceType!=="POS_OCR_DRAFT"||source.status!=="DRAFT"||documents.length!==(posted?2:1)||posted&&(!projection||projection.storeId!==storeId||projection.sourceType!=="PURCHASE_ORDER"||projection.status!=="APPROVED")||documents.some(d=>d.supplierId!==order.supplierId||d.documentType!=="INVOICE"||number(d.documentNumber)!==number(order.invoiceNumber)||!(Number(d.totalGross)>0)))throw fail("Τα συνδεδεμένα παραστατικά δεν συμφωνούν με την ίδια αγορά. Δεν έγινε αλλαγή.");
 const ids=documents.map(d=>d.id);
 if(await exists(tx,'SupplierPaymentAllocation')){
  const allocated=await raw(tx,'SELECT "id" FROM "SupplierPaymentAllocation" WHERE "companyId"=$1 AND "purchaseDocumentId"=ANY($2::text[]) LIMIT 1',companyId,ids);
  if(allocated.length)throw fail("Υπάρχει κατανομή πληρωμής σε αυτό το παραστατικό. Χρειάζεται χωριστός έλεγχος.");
 }
 const lines=await raw(tx,'SELECT * FROM "PurchaseOrderLine" WHERE "orderId"=$1 ORDER BY "id" FOR UPDATE',orderId);
 const documentLines=await raw(tx,'SELECT * FROM "PurchaseDocumentLine" WHERE "purchaseDocumentId"=ANY($1::text[]) ORDER BY "id" FOR UPDATE',ids);
 if(lines.length>2500||documentLines.length>5000)throw fail("Το μεγάλο παραστατικό χρειάζεται χωριστό έλεγχο.");
 const postings=await raw(tx,'SELECT * FROM "PurchaseOrderPosting" WHERE "companyId"=$1 AND "orderId"=$2 FOR UPDATE',companyId,orderId);
 const stockPostings=await raw(tx,'SELECT * FROM "InvoiceStockPosting" WHERE "companyId"=$1 AND ("orderId"=$2 OR "sourceDocumentId"=$3) FOR UPDATE',companyId,orderId,source.id);
 if(posted?(postings.length!==1||postings[0].purchaseDocumentId!==orderId||postings[0].supplierId!==order.supplierId||stockPostings.length!==1||stockPostings[0].storeId!==storeId||stockPostings[0].orderId!==orderId||stockPostings[0].sourceDocumentId!==source.id||stockPostings[0].postedDocumentId!==orderId||stockPostings[0].path!=="PURCHASE_ORDER"):postings.length||stockPostings.length)throw fail("Το ιστορικό καταχώρισης δεν συμφωνεί. Δεν έγινε αλλαγή αποθήκης ή προμηθευτή.");
 if(await exists(tx,'PurchaseDocumentAdjustment')){
  const adjustments=await raw(tx,'SELECT "id" FROM "PurchaseDocumentAdjustment" WHERE "companyId"=$1 AND "purchaseDocumentId"=ANY($2::text[]) LIMIT 1',companyId,ids);
  if(adjustments.length)throw fail("Υπάρχει συνδεδεμένη διόρθωση παραστατικού. Χρειάζεται χωριστός έλεγχος.");
 }
 const paymentIds=[...new Set(documents.map(d=>d.paymentTransactionId).filter(Boolean))];
 if(paymentIds.length>1)throw fail("Υπάρχουν διαφορετικές πληρωμές. Δεν μεταβλήθηκε καμία πληρωμή.");
 let payment=null;
 if(paymentIds.length){
  [payment]=await raw(tx,'SELECT * FROM "StoreTransaction" WHERE "id"=$1 AND "companyId"=$2 FOR UPDATE',paymentIds[0],companyId);
  if(!payment||payment.storeId!==storeId||payment.supplierId!==order.supplierId||payment.type!=="SUPPLIER_PAYMENT"||payment.reversedAt||!(Number(payment.amount)>0)||number(payment.invoiceDocumentNumber)!==number(order.invoiceNumber)||Math.abs(Number(payment.amount)-Number(source.totalGross))>.050001)throw fail("Η αρχική πληρωμή χρειάζεται χωριστό έλεγχο. Δεν δημιουργήθηκε νέα χρέωση.");
  const offsets=await raw(tx,`SELECT a."id" FROM "StoreOperatorAudit" a JOIN "StoreTransaction" t ON t."id"=a."details"->>'transactionId' AND t."companyId"=a."companyId" AND t."storeId"=a."storeId" WHERE a."companyId"=$1 AND a."storeId"=$2 AND a."eventType"='SUPPLIER_CREDIT_CASH_APPLIED' AND a."details"->>'invoicePaymentId'=$3 AND t."reversedAt" IS NULL LIMIT 1`,companyId,storeId,payment.id);
  if(offsets.length)throw fail("Η αρχική πληρωμή έχει συνδεδεμένο συμψηφισμό πιστωτικού. Χρειάζεται χωριστός έλεγχος.");
  const linked=await raw(tx,'SELECT "id" FROM "PurchaseDocument" WHERE "paymentTransactionId"=$1 AND NOT ("id"=ANY($2::text[])) LIMIT 1',payment.id,ids);
  if(linked.length)throw fail("Η πληρωμή συνδέεται με άλλο παραστατικό. Δεν μεταβλήθηκε.");
  if(await exists(tx,'SupplierPaymentSettlement')){
   const settlements=await raw(tx,'SELECT "id" FROM "SupplierPaymentSettlement" WHERE "companyId"=$1 AND "transactionId"=$2 LIMIT 1',companyId,payment.id);
   if(settlements.length)throw fail("Η πληρωμή έχει ήδη διακανονισμό ή κατανομή. Χρειάζεται χωριστός έλεγχος.");
  }
 }
 const duplicate=await raw(tx,`SELECT "id" FROM "PurchaseOrder" WHERE "companyId"=$1 AND "supplierId"=$2 AND "id"<>$3 AND "status" IN ('NEW','FINAL','INVOICED') AND UPPER(REGEXP_REPLACE(TRIM(COALESCE("invoiceNumber",'')),'\\s+','','g'))=$4 UNION ALL SELECT "id" FROM "PurchaseDocument" WHERE "companyId"=$1 AND "supplierId"=$2 AND NOT ("id"=ANY($5::text[])) AND "status"='APPROVED' AND UPPER(REGEXP_REPLACE(TRIM(COALESCE("documentNumber",'')),'\\s+','','g'))=$4 LIMIT 1`,companyId,supplierId,orderId,number(order.invoiceNumber),ids);
 if(duplicate.length)throw fail("Υπάρχει ήδη παραστατικό με αυτόν τον αριθμό στον επιλεγμένο προμηθευτή. Χρειάζεται έλεγχος διπλών.");
 const snapshot={order,documents,lines,documentLines,postings,stockPostings,payment,beforeSupplier,target};
 return {snapshot,version:hash(snapshot)};
}
function publicPreview(data){const s=data.snapshot;return {version:data.version,orderId:s.order.id,storeId:s.order.storeId,invoiceNumber:s.order.invoiceNumber,status:s.order.status,beforeSupplier:s.beforeSupplier,targetSupplier:s.target,totalGross:Number(s.documents.find(d=>d.id===s.order.sourceDocumentId).totalGross),payment:s.payment?{id:s.payment.id,amount:Number(s.payment.amount),occurredAt:s.payment.occurredAt}:null,stockChanged:false,moneyChanged:false}}
export async function previewPurchaseSupplierCorrection(db,actor,orderId,input){
 const body=scopeSchema.parse(input);requireSupplierCorrectionActor(actor,body.storeId);
 return db.$transaction(async tx=>{await lockInvoiceStore(tx,actor.companyId,body.storeId);const data=await load(tx,actor,orderId,body);if(data.snapshot.order.supplierId===body.supplierId)throw fail("Ο προμηθευτής είναι ήδη επιλεγμένος.",400);return publicPreview(data)},{timeout:30000});
}
export async function correctPurchaseSupplier(db,actor,orderId,input){
 const body=supplierCorrectionSchema.parse(input);requireSupplierCorrectionActor(actor,body.storeId);
 return db.$transaction(async tx=>{
  await lockInvoiceStore(tx,actor.companyId,body.storeId);
  const data=await load(tx,actor,orderId,body),s=data.snapshot;
  const prior=await raw(tx,`SELECT "details" FROM "StoreOperatorAudit" WHERE "companyId"=$1 AND "storeId"=$2 AND "eventType"='PURCHASE_SUPPLIER_CORRECTED' AND "details"->>'orderId'=$3 AND "details"->>'version'=$4 LIMIT 1`,actor.companyId,body.storeId,orderId,body.version);
  if(prior[0]){const d=prior[0].details;if(d.supplierId!==body.supplierId||d.afterVersion!==data.version)throw fail("Η προηγούμενη διόρθωση ολοκληρώθηκε αλλά η αγορά άλλαξε ξανά. Ανανέωσε.");return {...d.result,idempotent:true}}
  if(data.version!==body.version||s.order.supplierId===body.supplierId)throw fail("Η αγορά, ο προμηθευτής ή η πληρωμή άλλαξε μετά την προεπισκόπηση. Άνοιξε νέα προεπισκόπηση.");
  if(s.payment&&!body.confirmPaymentSupplier)throw fail("Επιβεβαίωσε χωριστά τη σύνδεση της ίδιας αρχικής πληρωμής στον σωστό προμηθευτή, χωρίς νέα χρέωση.",400);
  const actorName=actor.fullName||actor.name||actor.id;
  await run(tx,'UPDATE "PurchaseOrder" SET "supplierId"=$1,"updatedByName"=$2,"updatedAt"=NOW() WHERE "id"=$3 AND "companyId"=$4 AND "storeId"=$5',body.supplierId,actorName,orderId,actor.companyId,body.storeId);
  await run(tx,'UPDATE "PurchaseDocument" SET "supplierId"=$1,"updatedAt"=NOW() WHERE "id"=ANY($2::text[]) AND "companyId"=$3 AND "storeId"=$4',body.supplierId,s.documents.map(d=>d.id),actor.companyId,body.storeId);
  if(s.payment)await run(tx,'UPDATE "StoreTransaction" SET "supplierId"=$1 WHERE "id"=$2 AND "companyId"=$3 AND "storeId"=$4',body.supplierId,s.payment.id,actor.companyId,body.storeId);
  if(s.postings.length){const fingerprint=crypto.createHash('sha256').update(`${actor.companyId}|${body.supplierId}|${number(s.order.invoiceNumber)}`).digest('hex');await run(tx,'UPDATE "PurchaseOrderPosting" SET "supplierId"=$1,"documentFingerprint"=$2,"updatedAt"=NOW() WHERE "orderId"=$3 AND "companyId"=$4',body.supplierId,fingerprint,orderId,actor.companyId)}
  const after=await load(tx,actor,orderId,body),result={ok:true,orderId,supplierId:body.supplierId,status:s.order.status,paymentAssociationChanged:Boolean(s.payment),moneyChanged:false,stockChanged:false,idempotent:false};
  const details={orderId,supplierId:body.supplierId,version:body.version,afterVersion:after.version,reason:body.reason,actorName,actorRole:actor.role,before:s,result};
  await run(tx,`INSERT INTO "StoreOperatorAudit" ("id","companyId","storeId","operatorId","actorId","eventType","details") VALUES ($1,$2,$3,NULL,$4,'PURCHASE_SUPPLIER_CORRECTED',$5::jsonb)`,crypto.randomUUID(),actor.companyId,body.storeId,actor.id,JSON.stringify(details));
  return result;
 },{timeout:30000});
}
