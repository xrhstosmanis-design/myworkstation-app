import crypto from "node:crypto";
import {z} from "zod";
import {lockInvoiceStore} from "../lib/invoice-common-draft.js";
import {invoiceIssuerName,invoiceSummary} from "../mydata-xml.js";
import {requireStaffAction,staffError} from "./backoffice-staff-access.js";

const issuerSupplierBody=z.object({storeId:z.string().min(1).max(160)}).strict();

export async function findInvoiceSupplier(db,companyId,taxId,{includeInactive=false}={}){
  const rows=await db.$queryRaw`
    SELECT "id","name","taxId","active" FROM "Supplier"
    WHERE "companyId"=${companyId} AND (${includeInactive} OR "active"=true)
      AND regexp_replace(COALESCE("taxId",''),'[^0-9]','','g')=${taxId}
    ORDER BY "id" LIMIT 2`;
  if(rows.length>1)throw staffError(409,"SUPPLIER_AFM_AMBIGUOUS","Βρέθηκαν πολλοί προμηθευτές με αυτό το ΑΦΜ. Χρειάζεται έλεγχος της καρτέλας.");
  const row=rows[0];
  if(row&&!row.active)throw staffError(409,"SUPPLIER_INACTIVE","Υπάρχει ανενεργός προμηθευτής με αυτό το ΑΦΜ.");
  return row?{id:row.id,name:row.name,taxId:row.taxId}:null;
}

export async function createInvoiceIssuerSupplier(db,req,orderId,rawBody,{verify=requireStaffAction}={}){
  const {storeId}=issuerSupplierBody.parse(rawBody);
  const {companyId,id:actorId}=req.user;
  if(req.user.staffAccess!==true||req.user.storeId!==storeId)throw staffError();
  return db.$transaction(async tx=>{
    await verify(tx,req,storeId,"invoices.supplier-create");
    await lockInvoiceStore(tx,companyId,storeId);
    const source=await tx.$queryRaw`
      SELECT m."id" AS "sourceId",m."issuerVat",m."rawPayload"->>'xml' AS "xml"
      FROM "PurchaseOrder" o JOIN "MyDataInboundDocument" m
        ON m."companyId"=o."companyId" AND m."storeId"=o."storeId"
        AND m."rawPayload"->>'mydataDraftOrderId'=o."id"
      WHERE o."id"=${orderId} AND o."companyId"=${companyId} AND o."storeId"=${storeId}
        AND o."sourceType"='POS_OCR_DRAFT' AND o."status"='NEW'
        AND o."supplierId" IS NULL AND COALESCE(o."reopenVersion",0)=0
      ORDER BY m."id" LIMIT 2 FOR UPDATE OF o,m`;
    if(source.length!==1)throw staffError(409,"INVOICE_ISSUER_NOT_VERIFIED","Χρειάζεται ένα επιβεβαιωμένο myDATA πρωτότυπο για το συγκεκριμένο πρόχειρο.");
    const taxId=String(source[0].issuerVat||"");
    const name=invoiceIssuerName(source[0].xml)?.slice(0,180);
    if(!/^\d{9}$/.test(taxId)||invoiceSummary(source[0].xml).issuerVat!==taxId||!name)
      throw staffError(409,"INVOICE_ISSUER_NOT_VERIFIED","Δεν επιβεβαιώθηκαν η επωνυμία και το ΑΦΜ του εκδότη από το myDATA.");
    await tx.$queryRaw`SELECT (pg_advisory_xact_lock(hashtext(${`invoice-issuer-supplier:${companyId}:${taxId}`})) IS NULL) AS "locked"`;
    const existing=await findInvoiceSupplier(tx,companyId,taxId,{includeInactive:true});
    if(existing)return {...existing,created:false};
    const [supplier]=await tx.$queryRaw`
      INSERT INTO "Supplier" ("id","companyId","name","taxId")
      VALUES (${crypto.randomUUID()},${companyId},${name},${taxId})
      ON CONFLICT ("companyId","taxId") WHERE "taxId" IS NOT NULL DO NOTHING
      RETURNING "id","name","taxId"`;
    if(!supplier){
      const concurrent=await findInvoiceSupplier(tx,companyId,taxId,{includeInactive:true});
      if(!concurrent)throw staffError(409,"SUPPLIER_AFM_CHANGED","Ο προμηθευτής άλλαξε. Δοκίμασε ξανά.");
      return {...concurrent,created:false};
    }
    await tx.$executeRaw`
      INSERT INTO "StoreOperatorAudit" ("id","companyId","storeId","actorId","eventType","details")
      VALUES (${crypto.randomUUID()},${companyId},${storeId},${actorId},'INVOICE_ISSUER_SUPPLIER_CREATED',
        ${JSON.stringify({orderId,sourceId:source[0].sourceId,supplierId:supplier.id})}::jsonb)`;
    return {...supplier,created:true};
  });
}
