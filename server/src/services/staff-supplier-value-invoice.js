import crypto from "node:crypto";
import {z} from "zod";
import {lockInvoiceStore} from "../lib/invoice-common-draft.js";
import {requireStaffAction,staffError} from "./backoffice-staff-access.js";

const amount=z.number().min(0).max(999999999.99).refine(value=>Math.abs(value-Math.round(value*100)/100)<1e-8);
const date=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value=>{
  const parsed=new Date(value);
  return Number.isFinite(parsed.getTime())&&parsed.toISOString().slice(0,10)===value;
});
const schema=z.object({
  storeId:z.string().min(1).max(160),
  documentNumber:z.string().trim().min(1).max(80),
  documentDate:date,
  totalNet:amount,
  totalVat:amount,
  notes:z.string().trim().max(300).optional(),
  idempotencyKey:z.string().uuid()
}).strict().refine(value=>value.totalNet+value.totalVat>0);

export async function createStaffSupplierValueInvoice(db,req,supplierId,input,{verify=requireStaffAction}={}){
  const data=schema.parse(input);
  const {storeId,documentNumber,documentDate,totalNet,totalVat,idempotencyKey}=data;
  const {companyId,id:actorId}=req.user;
  if(req.user.staffAccess!==true||req.user.storeId!==storeId)throw staffError();
  const reference=documentNumber.toUpperCase().replace(/\s/g,"");
  if(!reference||!supplierId||supplierId.length>160)throw staffError(400,"INVALID_VALUE_INVOICE","Έλεγξε τον αριθμό τιμολογίου και τον προμηθευτή.");
  const gross=Math.round(totalNet*100+totalVat*100)/100;
  const id=crypto.createHash("sha256").update(JSON.stringify(["staff-value-invoice",companyId,storeId,actorId,idempotencyKey])).digest("hex");
  const fingerprint=crypto.createHash("sha256").update(JSON.stringify([supplierId,data])).digest("hex");
  return db.$transaction(async tx=>{
    await lockInvoiceStore(tx,companyId,storeId);
    await verify(tx,req,storeId,"invoices.value-only");
    const [supplier]=await tx.$queryRaw`
      SELECT "id" FROM "Supplier" WHERE "id"=${supplierId} AND "companyId"=${companyId} AND "active"=true FOR SHARE`;
    if(!supplier)throw staffError(404,"STAFF_OBJECT_NOT_FOUND","Δεν βρέθηκε ενεργός προμηθευτής στην εταιρεία.");
    const [receipt]=await tx.$queryRaw`
      SELECT a."details"->>'fingerprint' AS "fingerprint", d."id" AS "documentId"
      FROM "StoreOperatorAudit" a LEFT JOIN "PurchaseDocument" d
        ON d."id"=a."id" AND d."companyId"=a."companyId" AND d."storeId"=a."storeId"
      WHERE a."id"=${id} AND a."companyId"=${companyId} AND a."storeId"=${storeId}
        AND a."actorId"=${actorId} AND a."eventType"='SUPPLIER_VALUE_INVOICE_DRAFT_CREATED'`;
    if(receipt){
      if(receipt.fingerprint!==fingerprint||!receipt.documentId)
        throw staffError(409,"VALUE_INVOICE_REQUEST_CHANGED","Η καταχώριση έχει ήδη χρησιμοποιηθεί. Ανανέωσε πριν συνεχίσεις.");
      return {id,totalGross:gross,reused:true};
    }
    await tx.$queryRaw`SELECT (pg_advisory_xact_lock(hashtext(${JSON.stringify(["supplier-value-invoice",companyId,supplier.id,reference])})) IS NULL) AS "locked"`;
    const [duplicate]=await tx.$queryRaw`
      SELECT "id" FROM "PurchaseDocument"
      WHERE "companyId"=${companyId} AND "supplierId"=${supplier.id} AND "documentType"='INVOICE'
        AND "status" IN ('DRAFT','APPROVED') AND upper(regexp_replace("documentNumber",'[[:space:]]','','g'))=${reference}
      LIMIT 1`;
    if(duplicate)throw staffError(409,"SUPPLIER_VALUE_INVOICE_EXISTS","Υπάρχει ήδη καταχώριση με αυτόν τον προμηθευτή και αριθμό.");
    await tx.$executeRaw`
      INSERT INTO "PurchaseDocument" ("id","companyId","storeId","supplierId","documentType","documentNumber","documentDate",
        "totalNet","totalVat","totalGross","sourceType","status","createdByUserId")
      VALUES (${id},${companyId},${storeId},${supplier.id},'INVOICE',${documentNumber},${new Date(documentDate)},
        ${totalNet},${totalVat},${gross},'MANUAL','DRAFT',${actorId})`;
    await tx.$executeRaw`
      INSERT INTO "StoreOperatorAudit" ("id","companyId","storeId","actorId","eventType","details")
      VALUES (${id},${companyId},${storeId},${actorId},'SUPPLIER_VALUE_INVOICE_DRAFT_CREATED',
        ${JSON.stringify({supplierId:supplier.id,documentNumber,documentDate,fingerprint,notes:data.notes||null})}::jsonb)`;
    return {id,totalGross:gross,reused:false};
  });
}
