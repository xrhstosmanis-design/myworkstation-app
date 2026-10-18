import crypto from "node:crypto";
import {z} from "zod";
import {lockInvoiceStore} from "../lib/invoice-common-draft.js";
import {mappingConfirmationUserId} from "../lib/supplier-mapping-confirmation-actor.js";

const roles=new Set(["SUPER_ADMIN","OWNER","ADMIN","MANAGER"]),schemas=new WeakMap();
const fail=(message,status=409)=>Object.assign(new Error(message),{status});
const n=v=>Number(v||0),round=v=>Math.round(v*10000)/10000;
const raw=(db,sql,...values)=>db.$queryRawUnsafe(sql,...values);
const run=(db,sql,...values)=>db.$executeRawUnsafe(sql,...values);
export const reopenSchema=z.object({storeId:z.string().min(1).max(160),version:z.string().regex(/^[a-f0-9]{64}$/),reason:z.string().trim().min(5).max(500),confirm:z.literal(true),confirmNegativeStock:z.boolean().optional()}).strict();
export function requireReopenActor(actor,storeId){
 if(!actor?.id||!actor.companyId||actor.tokenType==="STORE_OPERATOR"||!roles.has(actor.role))throw fail("Η επαναφορά επιτρέπεται μόνο σε Super Admin, Ιδιοκτήτη ή υπεύθυνο διαχείρισης.",403);
 if(!storeId||actor.storeId&&String(actor.storeId)!==storeId)throw fail("Επίλεξε το επιτρεπόμενο κατάστημα της παραγγελίας.",403);
}
export async function ensurePurchaseOrderReopenSchema(db){
 if(!schemas.has(db))schemas.set(db,(async()=>{
  await run(db,'ALTER TABLE "PurchaseOrder" ADD COLUMN IF NOT EXISTS "reopenVersion" INTEGER NOT NULL DEFAULT 0');
  await run(db,`CREATE TABLE IF NOT EXISTS "PurchaseOrderReopenAudit" (
   "id" TEXT PRIMARY KEY,"companyId" TEXT NOT NULL,"storeId" TEXT NOT NULL,"orderId" TEXT NOT NULL,
   "previewVersion" TEXT NOT NULL,"orderVersion" INTEGER NOT NULL,"reason" TEXT NOT NULL,"actorId" TEXT NOT NULL,"actorName" TEXT NOT NULL,"actorRole" TEXT NOT NULL,
   "snapshot" JSONB NOT NULL,"result" JSONB NOT NULL,"createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),UNIQUE("companyId","orderId","previewVersion"))`);
  await run(db,`CREATE TABLE IF NOT EXISTS "PurchaseOrderReopenMovement" (
   "movementId" TEXT PRIMARY KEY,"reopenId" TEXT NOT NULL REFERENCES "PurchaseOrderReopenAudit"("id"),"companyId" TEXT NOT NULL,"orderId" TEXT NOT NULL,"reversalMovementId" TEXT NOT NULL UNIQUE)`);
  await run(db,`CREATE INDEX IF NOT EXISTS "PurchaseOrderReopenAudit_order_idx" ON "PurchaseOrderReopenAudit"("companyId","orderId","orderVersion")`);
  await run(db,`CREATE TABLE IF NOT EXISTS "StoreOperatorAudit" ("id" TEXT PRIMARY KEY,"companyId" TEXT NOT NULL,"storeId" TEXT NOT NULL,"operatorId" TEXT,"actorId" TEXT NOT NULL,"eventType" TEXT NOT NULL,"details" JSONB NOT NULL DEFAULT '{}'::jsonb,"createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
 })().catch(e=>{schemas.delete(db);throw e}));return schemas.get(db);
}
async function tableExists(tx,name){return (await raw(tx,'SELECT to_regclass($1) IS NOT NULL AS "exists"','"'+name+'"'))[0]?.exists===true}
async function load(tx,actor,orderId,storeId){
 const companyId=actor.companyId;
 const [order]=await raw(tx,`SELECT o.* FROM "PurchaseOrder" o JOIN "Store" s ON s."id"=o."storeId" AND s."companyId"=o."companyId" WHERE o."id"=$1 AND o."companyId"=$2 AND o."storeId"=$3 FOR UPDATE OF o`,orderId,companyId,storeId);
 if(!order)throw fail("Δεν βρέθηκε η παραγγελία στο επιλεγμένο κατάστημα.",404);
 if(order.status!=="INVOICED")throw fail("Επαναφέρεται μόνο τιμολογημένη παραγγελία. Ανανέωσε την προβολή.");
 const postings=await raw(tx,'SELECT * FROM "PurchaseOrderPosting" WHERE "orderId"=$1 AND "companyId"=$2 FOR UPDATE',orderId,companyId);
 const stockPostings=await raw(tx,'SELECT * FROM "InvoiceStockPosting" WHERE "companyId"=$1 AND ("orderId"=$2 OR "sourceDocumentId"=$3) FOR UPDATE',companyId,orderId,order.sourceDocumentId||orderId);
 if(postings.length!==1||postings[0].purchaseDocumentId!==order.id||stockPostings.length!==1||stockPostings[0].storeId!==storeId||stockPostings[0].orderId!==orderId||stockPostings[0].postedDocumentId!==orderId||stockPostings[0].sourceDocumentId!==(order.sourceDocumentId||orderId)||stockPostings[0].path!=="PURCHASE_ORDER")throw fail("Η ιστορική καταχώριση αποθήκης χρειάζεται έλεγχο. Δεν έγινε επαναφορά.");
 const documents=await raw(tx,`SELECT "id","companyId","storeId","supplierId","documentType","documentNumber","documentDate","totalNet","totalVat","totalGross","status","sourceType","purchaseOrderId","paymentTransactionId","settlementMode","updatedAt" FROM "PurchaseDocument" WHERE "companyId"=$1 AND "storeId"=$2 AND ("id"=$3 OR "id"=$4 OR "purchaseOrderId"=$3) ORDER BY "id" FOR UPDATE`,companyId,storeId,order.id,order.sourceDocumentId||order.id);
 const document=documents.find(d=>d.id===order.id);
 if(!document||document.status!=="APPROVED"||document.sourceType!=="PURCHASE_ORDER"||document.documentType!=="INVOICE"||document.supplierId!==order.supplierId||documents.some(d=>d.documentType!=="INVOICE"||d.id!==order.id&&d.status!=="DRAFT"))throw fail("Η επαναφορά αφορά κανονικό εισερχόμενο τιμολόγιο με τεκμηριωμένη καταχώριση. Πιστωτικά ή διαφορετικές συνδεδεμένες εγκρίσεις χρειάζονται χωριστό έλεγχο.");
 if(order.sourceType==="POS_OCR_DRAFT"&&(!order.sourceDocumentId||order.sourceDocumentId===order.id||!documents.some(d=>d.id===order.sourceDocumentId&&d.purchaseOrderId===order.id)))throw fail("Δεν επιβεβαιώθηκε το αρχικό παραστατικό POS.");
 const documentIds=documents.map(d=>d.id);
 const lines=await raw(tx,'SELECT * FROM "PurchaseOrderLine" WHERE "orderId"=$1 ORDER BY "id" FOR UPDATE',orderId);
 const documentLines=await raw(tx,'SELECT * FROM "PurchaseDocumentLine" WHERE "purchaseDocumentId"=ANY($1::text[]) ORDER BY "id" FOR UPDATE',documentIds);
 if(lines.length>2500||documentLines.length>5000)throw fail("Το μεγάλο παραστατικό χρειάζεται χωριστό έλεγχο.");
 const movements=await raw(tx,`SELECT m.* FROM "StockMovement" m WHERE $1::text IS NOT NULL AND m."storeId"=$2 AND m."sourceType"='PURCHASE_ORDER' AND m."sourceId"=$3 AND NOT EXISTS (SELECT 1 FROM "PurchaseOrderReopenMovement" r WHERE r."movementId"=m."id") ORDER BY m."id" FOR UPDATE OF m`,companyId,storeId,orderId);
 if(!movements.length||movements.length>10000||movements.some(m=>!["PURCHASE","PURCHASE_PACK_CORRECTION"].includes(m.movementType)||!Number.isFinite(n(m.quantity))||n(m.quantity)<0))throw fail("Δεν επιβεβαιώθηκαν οι αρχικές κινήσεις και οι μετατροπές συσκευασίας. Δεν έγινε επαναφορά.");
 const expectedBase=new Map(),postedBase=new Map();
 for(const line of documentLines.filter(l=>l.purchaseDocumentId===order.id&&l.productId))expectedBase.set(line.productId,round((expectedBase.get(line.productId)||0)+n(line.quantity)));
 for(const m of movements.filter(m=>m.movementType==="PURCHASE"))postedBase.set(m.productId,round((postedBase.get(m.productId)||0)+n(m.quantity)));
 if(expectedBase.size!==postedBase.size||[...expectedBase].some(([productId,qty])=>!Number.isFinite(qty)||Math.abs(qty-(postedBase.get(productId)??NaN))>0.00001||!postedBase.has(productId)))throw fail("Οι αρχικές κινήσεις δεν συμφωνούν με τις καταχωρημένες γραμμές. Δεν έγινε επαναφορά.");
 const quantities=new Map();for(const m of movements)quantities.set(m.productId,round((quantities.get(m.productId)||0)+n(m.quantity)));
 const stocks=await raw(tx,`SELECT sp.*,p."name" AS "productName",p."sku" FROM "StoreProduct" sp JOIN "Product" p ON p."id"=sp."productId" AND p."companyId"=$1 WHERE sp."storeId"=$2 AND sp."productId"=ANY($3::text[]) ORDER BY sp."productId" FOR UPDATE OF sp`,companyId,storeId,[...quantities.keys()]);
 if(stocks.length!==quantities.size||stocks.some(s=>!Number.isFinite(n(s.currentStock))))throw fail("Δεν επιβεβαιώθηκαν όλα τα υπόλοιπα αποθήκης.");
 const hasPack=await tableExists(tx,"PurchaseOrderPackCorrection");
 const pack=hasPack?await raw(tx,'SELECT * FROM "PurchaseOrderPackCorrection" WHERE "orderId"=$1 AND "companyId"=$2 FOR UPDATE',orderId,companyId):[];
 if(pack.length){let details;try{details=JSON.parse(pack[0].details)}catch{throw fail("Η μετατροπή συσκευασίας δεν έχει ολοκληρωθεί.")}
  if(!Array.isArray(details)||details.length!==quantities.size||details.some(row=>!quantities.has(row.productId)||!Number.isFinite(n(row.stockQty))||Math.abs(n(row.stockQty)-quantities.get(row.productId))>0.00001))throw fail("Οι κινήσεις συσκευασίας δεν συμφωνούν με το καταγεγραμμένο ιστορικό.");
 }
 const adjustments=await tableExists(tx,"PurchaseDocumentAdjustment")?await raw(tx,'SELECT "id","status" FROM "PurchaseDocumentAdjustment" WHERE "companyId"=$1 AND "purchaseDocumentId"=ANY($2::text[]) AND "status"=\'APPROVED\' ORDER BY "id" FOR UPDATE',companyId,documentIds):[];
 if(adjustments.length)throw fail("Υπάρχει εγκεκριμένη επιστροφή ή προσαρμογή. Χρειάζεται πρώτα έλεγχος της συνδεδεμένης πράξης.");
 const paymentIds=documents.map(d=>d.paymentTransactionId).filter(Boolean);
 const payments=await raw(tx,`SELECT "id","storeId","supplierId","type","amount","occurredAt","invoiceDocumentNumber","attachmentFilename","reversedAt" FROM "StoreTransaction" WHERE "companyId"=$1 AND "storeId"=$2 AND ("id"=ANY($3::text[]) OR "attachmentFilename"=ANY($4::text[])) ORDER BY "id" FOR SHARE`,companyId,storeId,paymentIds,documentIds);
 const snapshot={order,postings,stockPostings,documents,lines,documentLines,movements,stocks,pack,payments};
 const version=crypto.createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");
 const stockChanges=stocks.map(s=>({productId:s.productId,name:s.productName||s.productId,sku:s.sku||"",before:n(s.currentStock),delta:-quantities.get(s.productId),after:round(n(s.currentStock)-quantities.get(s.productId))}));
 return {snapshot,version,stockChanges,hasPack,document,order};
}
function preview(data){return {orderId:data.order.id,storeId:data.order.storeId,invoiceNumber:data.order.invoiceNumber,status:data.order.status,reopenVersion:n(data.order.reopenVersion),version:data.version,stockChanges:data.stockChanges,negativeStockCount:data.stockChanges.filter(s=>s.after<0).length,expenseDelta:-n(data.document.totalGross),paymentChanged:false,paymentCount:data.snapshot.payments.length,catalogPricesChanged:false,sourceFilesPreserved:true};}
export async function previewPurchaseOrderReopen(db,actor,orderId,storeId){
 requireReopenActor(actor,storeId);await ensurePurchaseOrderReopenSchema(db);
 return db.$transaction(async tx=>{await lockInvoiceStore(tx,actor.companyId,storeId);return preview(await load(tx,actor,orderId,storeId))},{timeout:20000});
}
export async function reopenPurchaseOrder(db,actor,orderId,input){
 requireReopenActor(actor,input?.storeId);const body=reopenSchema.parse(input);await ensurePurchaseOrderReopenSchema(db);
 return db.$transaction(async tx=>{
  await lockInvoiceStore(tx,actor.companyId,body.storeId);
  const [prior]=await raw(tx,'SELECT "result" FROM "PurchaseOrderReopenAudit" WHERE "companyId"=$1 AND "storeId"=$2 AND "orderId"=$3 AND "previewVersion"=$4',actor.companyId,body.storeId,orderId,body.version);
  if(prior){const [current]=await raw(tx,'SELECT "status","reopenVersion" FROM "PurchaseOrder" WHERE "id"=$1 AND "companyId"=$2 AND "storeId"=$3',orderId,actor.companyId,body.storeId);if(current?.status!=="NEW"||n(current.reopenVersion)!==n(prior.result.reopenVersion))throw fail("Αυτή η επαναφορά έχει ήδη ολοκληρωθεί και η παραγγελία άλλαξε ξανά. Ανανέωσε την προβολή.");return {...prior.result,idempotent:true}}
  const data=await load(tx,actor,orderId,body.storeId);
  if(data.version!==body.version)throw fail("Η παραγγελία ή το απόθεμα άλλαξε μετά την προεπισκόπηση. Άνοιξε νέα προεπισκόπηση.");
  if(data.stockChanges.some(s=>s.after<0)&&!body.confirmNegativeStock)throw fail("Η επαναφορά θα αφήσει αρνητικό απόθεμα σε ορισμένα είδη. Χρειάζεται ρητή επιβεβαίωση.",400);
  const auditId=crypto.randomUUID(),reopenVersion=n(data.order.reopenVersion)+1,actorName=actor.fullName||actor.name||actor.email||actor.id;
  const result={ok:true,status:"NEW",orderId,storeId:body.storeId,reopenVersion,auditId,stockChanges:data.stockChanges,paymentChanged:false,catalogPricesChanged:false,idempotent:false};
  await run(tx,`INSERT INTO "PurchaseOrderReopenAudit" ("id","companyId","storeId","orderId","previewVersion","orderVersion","reason","actorId","actorName","actorRole","snapshot","result") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12::jsonb)`,auditId,actor.companyId,body.storeId,orderId,body.version,reopenVersion,body.reason,actor.id,actorName,actor.role,JSON.stringify(data.snapshot),JSON.stringify(result));
  const userId=await mappingConfirmationUserId(tx,{actor,companyId:actor.companyId});
  for(const m of data.snapshot.movements){const reversalId=crypto.randomUUID();await run(tx,`INSERT INTO "StockMovement" ("id","storeId","productId","movementType","quantity","unitCost","sourceType","sourceId","note","createdByUserId") VALUES ($1,$2,$3,'PURCHASE_REOPEN',$4::numeric,$5::numeric,'PURCHASE_ORDER_REOPEN',$6,$7,$8)`,reversalId,body.storeId,m.productId,String(-n(m.quantity)),String(m.unitCost??0),auditId,`Επαναφορά αγοράς ${data.order.invoiceNumber||orderId}: ${body.reason}`,userId);await run(tx,'INSERT INTO "PurchaseOrderReopenMovement" ("movementId","reopenId","companyId","orderId","reversalMovementId") VALUES ($1,$2,$3,$4,$5)',m.id,auditId,actor.companyId,orderId,reversalId)}
  for(const change of data.stockChanges)await run(tx,'UPDATE "StoreProduct" SET "currentStock"="currentStock"+$1::numeric,"updatedAt"=NOW() WHERE "storeId"=$2 AND "productId"=$3',String(change.delta),body.storeId,change.productId);
  // Internal approved projection is retained, not exposed as a second editable source draft.
  await run(tx,'UPDATE "PurchaseDocument" SET "status"=\'REOPENED\',"updatedAt"=NOW() WHERE "id"=$1 AND "companyId"=$2 AND "storeId"=$3',data.document.id,actor.companyId,body.storeId);
  await run(tx,'DELETE FROM "PurchaseOrderPosting" WHERE "orderId"=$1 AND "companyId"=$2',orderId,actor.companyId);
  await run(tx,'DELETE FROM "InvoiceStockPosting" WHERE "companyId"=$1 AND "sourceDocumentId"=$2 AND "storeId"=$3 AND "orderId"=$4',actor.companyId,data.order.sourceDocumentId||orderId,body.storeId,orderId);
  if(data.hasPack)await run(tx,'DELETE FROM "PurchaseOrderPackCorrection" WHERE "orderId"=$1 AND "companyId"=$2',orderId,actor.companyId);
  await run(tx,'UPDATE "PurchaseOrder" SET "status"=\'NEW\',"reopenVersion"=$1,"finalizedAt"=NULL,"invoicedAt"=NULL,"updatedByName"=$2,"updatedAt"=NOW() WHERE "id"=$3 AND "companyId"=$4 AND "storeId"=$5',reopenVersion,actorName,orderId,actor.companyId,body.storeId);
  await run(tx,`INSERT INTO "StoreOperatorAudit" ("id","companyId","storeId","operatorId","actorId","eventType","details") VALUES ($1,$2,$3,NULL,$4,'PURCHASE_ORDER_REOPENED',$5::jsonb)`,crypto.randomUUID(),actor.companyId,body.storeId,actor.id,JSON.stringify({orderId,invoiceNumber:data.order.invoiceNumber,auditId,reason:body.reason,actorName,actorRole:actor.role,before:"INVOICED",after:"NEW",reopenVersion,stockChanges:data.stockChanges,paymentChanged:false,catalogPricesChanged:false}));
  return result;
 },{timeout:30000});
}
export function assertReopenedIdentity(order,body){
 if(n(order.reopenVersion)>0&&((body.supplierId!=null&&body.supplierId!==order.supplierId)||(body.invoiceNumber!=null&&body.invoiceNumber!==order.invoiceNumber)))throw fail("Στην επαναφερμένη αγορά διατηρούνται ο αρχικός προμηθευτής και ο αριθμός παραστατικού. Διόρθωσε τις γραμμές του ίδιου τιμολογίου.");
}
export async function reuseReopenedPurchaseDocument(tx,order,{supplierId,invoiceNumber,totalNet,totalVat,totalGross}){
 const [audit]=await raw(tx,'SELECT "id" FROM "PurchaseOrderReopenAudit" WHERE "companyId"=$1 AND "orderId"=$2 AND "storeId"=$3 AND "orderVersion"=$4',order.companyId,order.id,order.storeId,n(order.reopenVersion));
 const [doc]=await raw(tx,'SELECT "id","status","sourceType","documentType" FROM "PurchaseDocument" WHERE "id"=$1 AND "companyId"=$2 AND "storeId"=$3 FOR UPDATE',order.id,order.companyId,order.storeId);
 if(!audit||doc?.status!=="REOPENED"||doc.sourceType!=="PURCHASE_ORDER"||doc.documentType!=="INVOICE")throw fail("Δεν επιβεβαιώθηκε το ιστορικό επαναφοράς για νέα οριστικοποίηση.");
 await run(tx,'DELETE FROM "PurchaseDocumentLine" WHERE "purchaseDocumentId"=$1',doc.id);
 await run(tx,'UPDATE "PurchaseDocument" SET "supplierId"=$1,"documentNumber"=$2,"totalNet"=$3,"totalVat"=$4,"totalGross"=$5,"status"=\'APPROVED\',"updatedAt"=NOW() WHERE "id"=$6 AND "companyId"=$7 AND "storeId"=$8',supplierId,invoiceNumber,totalNet,totalVat,totalGross,doc.id,order.companyId,order.storeId);
 return doc.id;
}

export async function lockEditableReopenedOrder(tx,order){
 await lockInvoiceStore(tx,order.companyId,order.storeId);
 const [current]=await raw(tx,'SELECT "status","reopenVersion" FROM "PurchaseOrder" WHERE "id"=$1 AND "companyId"=$2 AND "storeId"=$3 FOR UPDATE',order.id,order.companyId,order.storeId);
 if(current?.status!=="NEW"||n(current.reopenVersion)!==n(order.reopenVersion))throw fail("Η επαναφερμένη αγορά άλλαξε ή οριστικοποιήθηκε. Ανανέωσε πριν τη διόρθωση.");
}
