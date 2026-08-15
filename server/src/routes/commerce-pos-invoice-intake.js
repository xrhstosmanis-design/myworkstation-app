import crypto from "crypto";
import {Router} from "express";
import {z} from "zod";
import {prisma} from "../prisma.js";
import {requireCompanyModule} from "../middleware/module-access.js";

const router=Router();
const id=()=>crypto.randomUUID();
const normalizeDocumentNumber=value=>String(value||"").trim().toLocaleUpperCase("el-GR").replace(/\s+/g,"");

async function ensureColumns(){
  await prisma.$executeRawUnsafe(`ALTER TABLE "PurchaseDocument" ADD COLUMN IF NOT EXISTS "settlementMode" TEXT`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "PurchaseDocument" ADD COLUMN IF NOT EXISTS "paymentTransactionId" TEXT`);
}

async function duplicateInvoice(tx,{companyId,supplierId,documentNumber}){
  const normalized=normalizeDocumentNumber(documentNumber);
  if(!supplierId||!normalized)return null;
  const docs=await tx.$queryRaw`
    SELECT d."id",d."status",d."documentNumber",s."name" AS "storeName"
    FROM "PurchaseDocument" d
    LEFT JOIN "Store" s ON s."id"=d."storeId"
    WHERE d."companyId"=${companyId} AND d."supplierId"=${supplierId}
      AND d."status" IN ('DRAFT','APPROVED')
      AND UPPER(REGEXP_REPLACE(TRIM(COALESCE(d."documentNumber",'')),'\\s+','','g'))=${normalized}
    ORDER BY d."documentDate" DESC LIMIT 1`;
  if(docs[0])return docs[0];
  const orders=await tx.$queryRaw`
    SELECT o."id",o."status",o."invoiceNumber" AS "documentNumber",s."name" AS "storeName"
    FROM "PurchaseOrder" o
    LEFT JOIN "Store" s ON s."id"=o."storeId"
    WHERE o."companyId"=${companyId} AND o."supplierId"=${supplierId}
      AND o."status" IN ('NEW','FINAL','INVOICED')
      AND UPPER(REGEXP_REPLACE(TRIM(COALESCE(o."invoiceNumber",'')),'\\s+','','g'))=${normalized}
    ORDER BY o."updatedAt" DESC LIMIT 1`;
  return orders[0]||null;
}

router.post("/ai-reader/jobs/:jobId/pos-intake",requireCompanyModule("AI_READER"),requireCompanyModule("INVENTORY"),async(req,res,next)=>{
  try{
    await ensureColumns();
    const body=z.object({
      supplierId:z.string().min(1),
      documentNumber:z.string().trim().min(1).max(80),
      documentDate:z.coerce.date().optional().nullable(),
      totalGross:z.coerce.number().positive().max(999999999),
      settlementMode:z.enum(["PAID","CREDIT"]),
      note:z.string().trim().max(500).optional().nullable()
    }).parse(req.body||{});

    const jobs=await prisma.$queryRaw`
      SELECT "id","storeId","status","purchaseDocumentId"
      FROM "AiReaderJob"
      WHERE "id"=${req.params.jobId} AND "companyId"=${req.user.companyId}
      LIMIT 1`;
    const job=jobs[0];
    if(!job)return res.status(404).json({error:"Δεν βρέθηκε η ανάγνωση του τιμολογίου."});
    if(job.purchaseDocumentId||["AWAITING_APPROVAL","CONFIRMED"].includes(job.status))return res.status(409).json({error:"Το τιμολόγιο έχει ήδη σταλεί στις Παραγγελίες & Αγορές."});
    if(req.user?.tokenType==="STORE_OPERATOR"&&req.user.storeId!==job.storeId)return res.status(403).json({error:"Το τιμολόγιο δεν ανήκει στο κατάστημα του χειριστή."});

    const supplier=await prisma.$queryRaw`
      SELECT "id","name" FROM "Supplier"
      WHERE "id"=${body.supplierId} AND "companyId"=${req.user.companyId} AND "active"=true LIMIT 1`;
    if(!supplier[0])return res.status(404).json({error:"Δεν βρέθηκε ο προμηθευτής."});

    const result=await prisma.$transaction(async tx=>{
      const locked=await tx.$queryRaw`
        SELECT "status","purchaseDocumentId" FROM "AiReaderJob"
        WHERE "id"=${job.id} AND "companyId"=${req.user.companyId} FOR UPDATE`;
      if(!locked[0]||locked[0].purchaseDocumentId||["AWAITING_APPROVAL","CONFIRMED"].includes(locked[0].status)){
        const error=new Error("Το τιμολόγιο έχει ήδη σταλεί στις Παραγγελίες & Αγορές.");error.status=409;throw error;
      }
      const duplicate=await duplicateInvoice(tx,{companyId:req.user.companyId,supplierId:body.supplierId,documentNumber:body.documentNumber});
      if(duplicate){const error=new Error(`Το τιμολόγιο ${body.documentNumber} υπάρχει ήδη${duplicate.storeName?` στο ${duplicate.storeName}`:""} (${duplicate.status}). Δεν δημιουργήθηκε δεύτερη εγγραφή.`);error.status=409;throw error;}

      const documentId=id();
      await tx.$executeRaw`
        INSERT INTO "PurchaseDocument" (
          "id","companyId","storeId","supplierId","documentType","documentNumber","documentDate",
          "totalNet","totalVat","totalGross","sourceType","status","createdByUserId","settlementMode"
        ) VALUES (
          ${documentId},${req.user.companyId},${job.storeId},${body.supplierId},'INVOICE',${body.documentNumber},
          ${body.documentDate||new Date()},0,0,${body.totalGross},'POS_OCR_DRAFT','DRAFT',${req.user.id},${body.settlementMode}
        )`;

      let paymentTransactionId=null;
      if(body.settlementMode==="PAID"){
        paymentTransactionId=`pay_${crypto.createHash("sha256").update(`${req.user.companyId}:${job.storeId}:invoice:${documentId}`).digest("hex")}`;
        await tx.$executeRaw`
          INSERT INTO "StoreTransaction" (
            "id","companyId","storeId","sessionId","type","amount","description","supplierId","supplierName",
            "subtractFromShift","actorId","actorName","attachmentData","attachmentMimeType","attachmentFilename","attachmentChecksum"
          ) VALUES (
            ${paymentTransactionId},${req.user.companyId},${job.storeId},NULL,'SUPPLIER_PAYMENT',${body.totalGross},
            ${body.note||`Πληρωμένο τιμολόγιο ${body.documentNumber} — αναμονή ελέγχου BackOffice`},${body.supplierId},${supplier[0].name},
            false,${req.user.id},${req.user.fullName||"Χειριστής"},NULL,'application/vnd.myworkstation.purchase-document',${documentId},
            ${crypto.createHash("sha256").update(`invoice:${documentId}`).digest("hex")}
          )`;
        await tx.$executeRaw`UPDATE "PurchaseDocument" SET "paymentTransactionId"=${paymentTransactionId} WHERE "id"=${documentId}`;
      }

      await tx.$executeRaw`
        UPDATE "AiReaderJob" SET "status"='AWAITING_APPROVAL',"purchaseDocumentId"=${documentId},"updatedAt"=CURRENT_TIMESTAMP
        WHERE "id"=${job.id}`;
      return {documentId,paymentTransactionId};
    });

    res.status(201).json({
      ok:true,
      id:result.documentId,
      status:"DRAFT",
      settlementMode:body.settlementMode,
      paymentRecorded:Boolean(result.paymentTransactionId),
      paymentTransactionId:result.paymentTransactionId,
      subtractFromShift:false,
      stockUpdated:false,
      awaitingApproval:true,
      message:body.settlementMode==="PAID"
        ?"Το τιμολόγιο καταχωρίστηκε ως πληρωμένο και στάλθηκε για έλεγχο. Δεν αφαιρέθηκε ποσό από τη βάρδια."
        :"Το τιμολόγιο καταχωρίστηκε με πίστωση και στάλθηκε για έλεγχο. Δεν δημιουργήθηκε πληρωμή και δεν αφαιρέθηκε ποσό από τη βάρδια."
    });
  }catch(error){next(error)}
});

export default router;
