import crypto from "crypto";
import {Router} from "express";
import {z} from "zod";
import {prisma} from "../prisma.js";
import {requireCompanyModule} from "../middleware/module-access.js";

const router=Router();
const id=()=>crypto.randomUUID();
const normalizeDocumentNumber=value=>String(value||"").trim().toLocaleUpperCase("el-GR").replace(/\s+/g,"");
const norm=value=>String(value||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLocaleUpperCase("el-GR").replace(/[^A-ZΑ-Ω0-9]/g,"");
const num=value=>{const n=Number(String(value??"").replace(/\s/g,"").replace(/\.(?=\d{3}(?:\D|$))/g,"").replace(",",".").replace(/[^0-9.-]/g,""));return Number.isFinite(n)?n:null};

async function ensureColumns(){
  await prisma.$executeRawUnsafe(`ALTER TABLE "PurchaseDocument" ADD COLUMN IF NOT EXISTS "settlementMode" TEXT`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "PurchaseDocument" ADD COLUMN IF NOT EXISTS "paymentTransactionId" TEXT`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "PurchaseDocument" ADD COLUMN IF NOT EXISTS "purchaseOrderId" TEXT`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "PurchaseOrder" ADD COLUMN IF NOT EXISTS "sourceType" TEXT`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "PurchaseOrder" ADD COLUMN IF NOT EXISTS "sourceDocumentId" TEXT`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "PurchaseOrderLine" ADD COLUMN IF NOT EXISTS "ocrRawText" TEXT`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "PurchaseOrderLine" ADD COLUMN IF NOT EXISTS "ocrConfidence" NUMERIC(6,3)`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "PurchaseOrderLine" ADD COLUMN IF NOT EXISTS "resolutionStatus" TEXT NOT NULL DEFAULT 'MATCHED'`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "PurchaseOrderLine" ADD COLUMN IF NOT EXISTS "detectedBarcode" TEXT`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "PurchaseOrderLine" ADD COLUMN IF NOT EXISTS "ocrSequence" INTEGER`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "PurchaseOrderLine" ADD COLUMN IF NOT EXISTS "ocrLineType" TEXT NOT NULL DEFAULT 'PRODUCT'`);
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

function allOcrRows(resultJson){
  const source=Array.isArray(resultJson?.lines)?resultJson.lines:[];
  return source.map((entry,index)=>{
    const text=String(entry?.text||"").replace(/\s+/g," ").trim();
    if(!text)return null;
    const upper=norm(text);
    const barcode=(text.match(/(?:^|\D)(\d{8,14})(?:\D|$)/)||[])[1]||null;
    const amounts=(text.match(/\d{1,3}(?:\.\d{3})*(?:,\d{2,4})|\d+(?:[.,]\d{2,4})/g)||[]).map(num).filter(v=>v!==null&&v>=0);
    const infoPattern=/(ΤΙΜΟΛΟΓΙΟ|INVOICE|ΗΜΕΡΟΜΗΝΙΑ|DATE|ΑΦΜ|ΔΟΥ|ΕΠΩΝΥΜΙΑ|ΔΙΕΥΘΥΝΣΗ|ΤΗΛ|ΣΥΝΟΛΟ|SUBTOTAL|TOTAL|ΠΛΗΡΩΤΕΟ|ΚΑΘΑΡΗΑΞΙΑ|ΚΑΘΑΡΗ|ΑΞΙΑΦΠΑ|ΦΠΑ|VAT|ΕΚΠΤΩΣΗ|DISCOUNT|ΜΕΤΑΦΟΡΙΚΑ|ΠΑΡΑΤΗΡΗΣ)/;
    const productHints=Boolean(barcode)||(/[A-Za-zΑ-Ωα-ω]/.test(text)&&amounts.length>0&&!infoPattern.test(upper));
    const lineType=productHints?"PRODUCT":"INFO";
    let description=text;
    if(lineType==="PRODUCT"){
      description=text.replace(/(?:^|\D)\d{8,14}(?:\D|$)/g," ").replace(/\s+/g," ").trim()||text;
    }
    let quantity=1;
    const qMatch=text.match(/(?:^|\s)(\d{1,4}(?:[.,]\d{1,3})?)\s*(?:ΤΕΜ|ΤΜΧ|PCS|X|Χ)\b/i);
    if(qMatch){const q=num(qMatch[1]);if(q&&q>0)quantity=q;}
    const unitCost=lineType==="PRODUCT"&&amounts.length?Number(amounts[amounts.length-1]||0):0;
    return {sequence:index+1,text,description,barcode,unitCost,quantity,confidence:Number(entry?.confidence||0),lineType};
  }).filter(Boolean).slice(0,1000);
}

async function matchProducts(tx,companyId,rows){
  const products=await tx.$queryRaw`
    SELECT p."id",p."name",p."vatRate",p."salePrice",p."costPrice",
      COALESCE((SELECT json_agg(pb."barcode") FROM "ProductBarcode" pb WHERE pb."productId"=p."id"),'[]') AS "barcodes"
    FROM "Product" p WHERE p."companyId"=${companyId} AND p."active"=true`;
  const byBarcode=new Map();
  for(const p of products)for(const barcode of p.barcodes||[])byBarcode.set(String(barcode),p);
  for(const row of rows){
    if(row.lineType!=="PRODUCT"){row.product=null;continue;}
    let product=row.barcode?byBarcode.get(String(row.barcode)):null;
    if(!product){
      const key=norm(row.description);
      if(key.length>=4){
        const exact=products.find(p=>norm(p.name)===key);
        const contains=exact||products.find(p=>{const pk=norm(p.name);return key.length>=6&&pk.length>=6&&(pk.includes(key)||key.includes(pk));});
        product=contains||null;
      }
    }
    row.product=product||null;
  }
  return rows;
}

router.post("/ai-reader/jobs/:jobId/pos-intake",requireCompanyModule("AI_READER"),requireCompanyModule("INVENTORY"),async(req,res,next)=>{
  try{
    await ensureColumns();
    const body=z.object({supplierId:z.string().min(1),documentNumber:z.string().trim().min(1).max(80),documentDate:z.coerce.date().optional().nullable(),totalGross:z.coerce.number().positive().max(999999999),settlementMode:z.enum(["PAID","CREDIT"]),note:z.string().trim().max(500).optional().nullable()}).parse(req.body||{});
    const jobs=await prisma.$queryRaw`SELECT "id","storeId","status","purchaseDocumentId","resultJson" FROM "AiReaderJob" WHERE "id"=${req.params.jobId} AND "companyId"=${req.user.companyId} LIMIT 1`;
    const job=jobs[0];
    if(!job)return res.status(404).json({error:"Δεν βρέθηκε η ανάγνωση του τιμολογίου."});
    if(job.purchaseDocumentId||["AWAITING_APPROVAL","CONFIRMED"].includes(job.status))return res.status(409).json({error:"Το τιμολόγιο έχει ήδη σταλεί στις Παραγγελίες & Αγορές."});
    if(req.user?.tokenType==="STORE_OPERATOR"&&req.user.storeId!==job.storeId)return res.status(403).json({error:"Το τιμολόγιο δεν ανήκει στο κατάστημα του χειριστή."});
    const supplier=await prisma.$queryRaw`SELECT "id","name" FROM "Supplier" WHERE "id"=${body.supplierId} AND "companyId"=${req.user.companyId} AND "active"=true LIMIT 1`;
    if(!supplier[0])return res.status(404).json({error:"Δεν βρέθηκε ο προμηθευτής."});

    const result=await prisma.$transaction(async tx=>{
      const locked=await tx.$queryRaw`SELECT "status","purchaseDocumentId" FROM "AiReaderJob" WHERE "id"=${job.id} AND "companyId"=${req.user.companyId} FOR UPDATE`;
      if(!locked[0]||locked[0].purchaseDocumentId||["AWAITING_APPROVAL","CONFIRMED"].includes(locked[0].status)){const error=new Error("Το τιμολόγιο έχει ήδη σταλεί στις Παραγγελίες & Αγορές.");error.status=409;throw error;}
      const duplicate=await duplicateInvoice(tx,{companyId:req.user.companyId,supplierId:body.supplierId,documentNumber:body.documentNumber});
      if(duplicate){const error=new Error(`Το τιμολόγιο ${body.documentNumber} υπάρχει ήδη${duplicate.storeName?` στο ${duplicate.storeName}`:""} (${duplicate.status}). Δεν δημιουργήθηκε δεύτερη εγγραφή.`);error.status=409;throw error;}
      let shift=null;
      if(body.settlementMode==="PAID"){
        const shifts=await tx.$queryRaw`SELECT "id" FROM "CashShiftSession" WHERE "companyId"=${req.user.companyId} AND "storeId"=${job.storeId} AND "status"='OPEN' ORDER BY "openedAt" DESC LIMIT 1 FOR UPDATE`;
        shift=shifts[0]||null;if(!shift){const error=new Error("Δεν υπάρχει ανοιχτή βάρδια. Πληρωμένο με μετρητά τιμολόγιο δεν μπορεί να καταχωρηθεί χωρίς ενεργή βάρδια.");error.status=409;throw error;}
      }
      const documentId=id(),orderId=id(),actor=req.user.fullName||"Χειριστής",createdByUserId=req.user?.tokenType==="STORE_OPERATOR"?null:req.user.id;
      await tx.$executeRaw`INSERT INTO "PurchaseDocument" ("id","companyId","storeId","supplierId","documentType","documentNumber","documentDate","totalNet","totalVat","totalGross","sourceType","status","createdByUserId","settlementMode","purchaseOrderId") VALUES (${documentId},${req.user.companyId},${job.storeId},${body.supplierId},'INVOICE',${body.documentNumber},${body.documentDate||new Date()},0,0,${body.totalGross},'POS_OCR_DRAFT','DRAFT',${createdByUserId},${body.settlementMode},${orderId})`;
      await tx.$executeRaw`INSERT INTO "PurchaseOrder" ("id","companyId","storeId","supplierId","status","invoiceNumber","description","createdByUserId","createdByName","updatedByName","sourceType","sourceDocumentId") VALUES (${orderId},${req.user.companyId},${job.storeId},${body.supplierId},'NEW',${body.documentNumber},${body.note||`OCR τιμολόγιο ${body.documentNumber} — έλεγχος πριν την οριστικοποίηση`},${createdByUserId},${actor},${actor},'POS_OCR_DRAFT',${documentId})`;

      const ocrRows=await matchProducts(tx,req.user.companyId,allOcrRows(job.resultJson||{}));
      for(const row of ocrRows){
        const product=row.product,info=row.lineType!=="PRODUCT",vatRate=product?Number(product.vatRate||0):0;
        const quantity=info?1:Math.max(0.0001,Number(row.quantity||1)),unitCost=info?0:Math.max(0,Number(row.unitCost||0));
        const netAmount=quantity*unitCost,vatAmount=netAmount*vatRate/100,grossAmount=netAmount+vatAmount;
        const resolutionStatus=info?"INFO":product?"MATCHED":"UNRESOLVED";
        await tx.$executeRaw`INSERT INTO "PurchaseOrderLine" ("id","orderId","productId","description","quantity","unitCost","discount1","discount2","discount3","exciseTotal","vatRate","gift","initialUnitCost","markupPercent","proposedSalePrice","netAmount","vatAmount","grossAmount","ocrRawText","ocrConfidence","resolutionStatus","detectedBarcode","ocrSequence","ocrLineType") VALUES (${id()},${orderId},${product?.id||null},${row.description},${quantity},${unitCost},0,0,0,0,${vatRate},false,${unitCost},0,${Number(product?.salePrice||0)},${netAmount},${vatAmount},${grossAmount},${row.text},${row.confidence},${resolutionStatus},${row.barcode||null},${row.sequence},${row.lineType})`;
      }

      let paymentTransactionId=null;
      if(body.settlementMode==="PAID"){
        paymentTransactionId=`pay_${crypto.createHash("sha256").update(`${req.user.companyId}:${job.storeId}:invoice:${documentId}`).digest("hex")}`;
        await tx.$executeRaw`INSERT INTO "StoreTransaction" ("id","companyId","storeId","sessionId","type","amount","description","supplierId","supplierName","subtractFromShift","actorId","actorName","attachmentData","attachmentMimeType","attachmentFilename","attachmentChecksum") VALUES (${paymentTransactionId},${req.user.companyId},${job.storeId},${shift.id},'SUPPLIER_PAYMENT',${body.totalGross},${body.note||`Πληρωμένο με μετρητά τιμολόγιο ${body.documentNumber} — αναμονή ελέγχου BackOffice`},${body.supplierId},${supplier[0].name},true,${req.user.id},${actor},NULL,'application/vnd.myworkstation.purchase-document',${documentId},${crypto.createHash("sha256").update(`invoice:${documentId}`).digest("hex")})`;
        await tx.$executeRaw`UPDATE "PurchaseDocument" SET "paymentTransactionId"=${paymentTransactionId} WHERE "id"=${documentId}`;
      }
      await tx.$executeRaw`UPDATE "AiReaderJob" SET "status"='AWAITING_APPROVAL',"purchaseDocumentId"=${documentId},"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${job.id}`;
      return {documentId,orderId,paymentTransactionId,lineCount:ocrRows.length,unresolved:ocrRows.filter(r=>r.lineType==="PRODUCT"&&!r.product).length,infoLines:ocrRows.filter(r=>r.lineType!=="PRODUCT").length};
    });
    res.status(201).json({ok:true,id:result.documentId,purchaseOrderId:result.orderId,status:"DRAFT",purchaseOrderStatus:"NEW",settlementMode:body.settlementMode,paymentRecorded:Boolean(result.paymentTransactionId),paymentTransactionId:result.paymentTransactionId,subtractFromShift:body.settlementMode==="PAID",stockUpdated:false,awaitingApproval:true,lineCount:result.lineCount,unresolvedLines:result.unresolved,infoLines:result.infoLines,message:body.settlementMode==="PAID"?`Το τιμολόγιο καταχωρίστηκε ολόκληρο (${result.lineCount} OCR γραμμές), αφαιρέθηκε η πληρωμή από την ενεργή βάρδια και δημιουργήθηκε Νέα αγορά. ${result.unresolved} γραμμές ειδών χρειάζονται επίλυση. Η αποθήκη δεν ενημερώθηκε ακόμη.`:`Το τιμολόγιο καταχωρίστηκε ολόκληρο (${result.lineCount} OCR γραμμές) ως πίστωση και δημιουργήθηκε Νέα αγορά. ${result.unresolved} γραμμές ειδών χρειάζονται επίλυση. Δεν αφαιρέθηκε ποσό από τη βάρδια και η αποθήκη δεν ενημερώθηκε ακόμη.`});
  }catch(error){next(error)}
});

export default router;
