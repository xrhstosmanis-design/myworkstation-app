import crypto from "crypto";
import {Router} from "express";
import {z} from "zod";
import {prisma} from "../prisma.js";
import {requireCompanyModule} from "../middleware/module-access.js";

const router=Router();
const id=()=>crypto.randomUUID();
const normalizeDocumentNumber=value=>String(value||"").trim().toLocaleUpperCase("el-GR").replace(/\s+/g,"");
const norm=value=>String(value||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLocaleUpperCase("el-GR").replace(/[^A-ZΑ-Ω0-9]/g,"");
const clamp=(v,min,max)=>Math.max(min,Math.min(max,Number(v||0)));

// The POS V2.4.4 routes are mounted before the legacy intake routes.  They
// therefore cannot rely on the legacy route's per-request compatibility
// bootstrap.  Without these columns an uploaded invoice reaches the document
// inbox but fails while the draft purchase order is being created.
let intakeSchemaPromise;
async function ensureV244IntakeSchema(){
  if(!intakeSchemaPromise){
    intakeSchemaPromise=(async()=>{
      const statements=[
        `ALTER TABLE "PurchaseDocument" ADD COLUMN IF NOT EXISTS "settlementMode" TEXT`,
        `ALTER TABLE "PurchaseDocument" ADD COLUMN IF NOT EXISTS "paymentTransactionId" TEXT`,
        `ALTER TABLE "PurchaseDocument" ADD COLUMN IF NOT EXISTS "purchaseOrderId" TEXT`,
        `ALTER TABLE "PurchaseOrder" ADD COLUMN IF NOT EXISTS "sourceType" TEXT`,
        `ALTER TABLE "PurchaseOrder" ADD COLUMN IF NOT EXISTS "sourceDocumentId" TEXT`,
        `ALTER TABLE "PurchaseOrderLine" ADD COLUMN IF NOT EXISTS "supplierCode" TEXT`,
        `ALTER TABLE "PurchaseOrderLine" ADD COLUMN IF NOT EXISTS "ocrRawText" TEXT`,
        `ALTER TABLE "PurchaseOrderLine" ADD COLUMN IF NOT EXISTS "ocrConfidence" NUMERIC(6,3)`,
        `ALTER TABLE "PurchaseOrderLine" ADD COLUMN IF NOT EXISTS "resolutionStatus" TEXT NOT NULL DEFAULT 'MATCHED'`,
        `ALTER TABLE "PurchaseOrderLine" ADD COLUMN IF NOT EXISTS "detectedBarcode" TEXT`,
        `ALTER TABLE "PurchaseOrderLine" ADD COLUMN IF NOT EXISTS "ocrSequence" INTEGER`,
        `ALTER TABLE "PurchaseOrderLine" ADD COLUMN IF NOT EXISTS "ocrLineType" TEXT NOT NULL DEFAULT 'PRODUCT'`
      ];
      for(const statement of statements)await prisma.$executeRawUnsafe(statement);
    })().catch(error=>{intakeSchemaPromise=undefined;throw error});
  }
  return intakeSchemaPromise;
}

const lineSchema=z.object({
  rawText:z.string().max(4000).optional().default(""),
  code:z.string().trim().max(80).optional().default(""),
  barcode:z.string().trim().max(80).optional().default(""),
  description:z.string().trim().min(1).max(500),
  quantity:z.coerce.number().positive().max(1000000),
  unit:z.string().trim().max(40).optional().default("ΤΜΧ"),
  unitsPerPackage:z.coerce.number().min(0).max(100000).optional().default(0),
  unitCost:z.coerce.number().positive().max(10000000),
  initialAmount:z.coerce.number().min(0).max(1000000000).optional().default(0),
  discount1:z.coerce.number().min(0).max(100).optional().default(0),
  discount1Amount:z.coerce.number().min(0).max(1000000000).optional().default(0),
  discount2:z.coerce.number().min(0).max(100).optional().default(0),
  discount2Amount:z.coerce.number().min(0).max(1000000000).optional().default(0),
  discount3:z.coerce.number().min(0).max(100).optional().default(0),
  discount3Amount:z.coerce.number().min(0).max(1000000000).optional().default(0),
  netAmount:z.coerce.number().min(0).max(1000000000),
  vatRate:z.coerce.number().min(0).max(100),
  grossAmount:z.coerce.number().min(0).max(1000000000),
  confidence:z.coerce.number().min(0).max(100).optional().default(0),
  packRule:z.string().max(120).optional().default("")
});

async function duplicateInvoice(tx,{companyId,supplierId,documentNumber}){
  const normalized=normalizeDocumentNumber(documentNumber);
  if(!normalized)return null;
  const rows=await tx.$queryRaw`
    SELECT d."id",d."status",d."documentNumber"
    FROM "PurchaseDocument" d
    WHERE d."companyId"=${companyId} AND d."supplierId"=${supplierId}
      AND d."status" IN ('DRAFT','APPROVED')
      AND UPPER(REGEXP_REPLACE(TRIM(COALESCE(d."documentNumber",'')),'\\s+','','g'))=${normalized}
    ORDER BY d."documentDate" DESC LIMIT 1`;
  if(rows[0])return rows[0];
  const orders=await tx.$queryRaw`
    SELECT o."id",o."status",o."invoiceNumber" AS "documentNumber"
    FROM "PurchaseOrder" o
    WHERE o."companyId"=${companyId} AND o."supplierId"=${supplierId}
      AND o."status" IN ('NEW','FINAL','INVOICED')
      AND UPPER(REGEXP_REPLACE(TRIM(COALESCE(o."invoiceNumber",'')),'\\s+','','g'))=${normalized}
    ORDER BY o."updatedAt" DESC LIMIT 1`;
  return orders[0]||null;
}

async function productsForLines(tx,companyId,supplierId,lines){
  const products=await tx.$queryRaw`
    SELECT p."id",p."name",p."vatRate",p."salePrice",p."costPrice",
      COALESCE((SELECT json_agg(pb."barcode") FROM "ProductBarcode" pb WHERE pb."productId"=p."id"),'[]') AS "barcodes"
    FROM "Product" p WHERE p."companyId"=${companyId} AND p."active"=true`;
  const byBarcode=new Map();
  for(const p of products)for(const barcode of p.barcodes||[])byBarcode.set(String(barcode),p);
  const mappings=await tx.$queryRaw`SELECT "supplierItemCode","productId" FROM "SupplierProductMapping" WHERE "companyId"=${companyId} AND "supplierId"=${supplierId}`;
  const bySupplierCode=new Map(mappings.map(m=>[norm(m.supplierItemCode),m.productId]));
  const byId=new Map(products.map(p=>[p.id,p]));
  return lines.map(line=>{
    let product=null;
    if(line.code){const mapped=bySupplierCode.get(norm(line.code));if(mapped)product=byId.get(mapped)||null;}
    if(!product&&line.barcode)product=byBarcode.get(String(line.barcode))||null;
    if(!product){const key=norm(line.description);if(key.length>=4)product=products.find(p=>norm(p.name)===key)||products.find(p=>{const pk=norm(p.name);return key.length>=6&&pk.length>=6&&(pk.includes(key)||key.includes(pk))})||null;}
    return {...line,product};
  });
}

router.use(async(req,res,next)=>{try{await ensureV244IntakeSchema();next()}catch(error){next(error)}});

router.put("/ai-reader/jobs/:jobId/product-lines",requireCompanyModule("AI_READER"),async(req,res,next)=>{
  try{
    const body=z.object({productLines:z.array(lineSchema).min(1).max(500),source:z.literal("V2.4.4").optional()}).parse(req.body||{});
    const jobs=await prisma.$queryRaw`SELECT "id","storeId","purchaseDocumentId","resultJson" FROM "AiReaderJob" WHERE "id"=${req.params.jobId} AND "companyId"=${req.user.companyId} LIMIT 1`;
    const job=jobs[0];
    if(!job)return res.status(404).json({error:"Δεν βρέθηκε η ανάγνωση."});
    if(req.user?.tokenType==="STORE_OPERATOR"&&req.user.storeId!==job.storeId)return res.status(403).json({error:"Δεν έχεις πρόσβαση σε αυτό το τιμολόγιο."});
    if(job.purchaseDocumentId)return res.status(409).json({error:"Το τιμολόγιο έχει ήδη σταλεί για έλεγχο."});
    const productLines=body.productLines.map(line=>({...line,quantity:Number(line.quantity),unitCost:Number(line.unitCost),initialAmount:Number(line.initialAmount||0),discount1:clamp(line.discount1,0,100),discount1Amount:Number(line.discount1Amount||0),discount2:clamp(line.discount2,0,100),discount2Amount:Number(line.discount2Amount||0),discount3:clamp(line.discount3,0,100),discount3Amount:Number(line.discount3Amount||0),netAmount:Number(line.netAmount),vatRate:clamp(line.vatRate,0,100),grossAmount:Number(line.grossAmount),confidence:clamp(line.confidence,0,100),v244:true}));
    const previous=job.resultJson&&typeof job.resultJson==="object"?job.resultJson:{};
    const resultJson={...previous,productLines,v244Finalized:true,v244FinalizedAt:new Date().toISOString(),v244Source:"KAT_INVOICE_LAB_V2_4_4"};
    await prisma.$executeRaw`UPDATE "AiReaderJob" SET "resultJson"=${JSON.stringify(resultJson)}::jsonb,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${job.id} AND "companyId"=${req.user.companyId}`;
    res.json({ok:true,id:job.id,lineCount:productLines.length,productLines,message:`Αποθηκεύτηκαν ${productLines.length} τελικές γραμμές V2.4.4.`});
  }catch(error){next(error)}
});

router.post("/ai-reader/jobs/:jobId/pos-intake",requireCompanyModule("AI_READER"),requireCompanyModule("INVENTORY"),async(req,res,next)=>{
  let stage="validation";
  try{
    const body=z.object({supplierId:z.string().min(1),documentNumber:z.string().trim().min(1).max(80),documentDate:z.coerce.date().optional().nullable(),totalGross:z.coerce.number().positive().max(999999999),settlementMode:z.enum(["PAID","CREDIT"]),paymentTransactionId:z.string().trim().min(1).max(180).optional().nullable(),note:z.string().trim().max(500).optional().nullable()}).parse(req.body||{});
    stage="load-ai-job";
    const jobs=await prisma.$queryRaw`SELECT "id","storeId","status","purchaseDocumentId","resultJson" FROM "AiReaderJob" WHERE "id"=${req.params.jobId} AND "companyId"=${req.user.companyId} LIMIT 1`;
    const job=jobs[0];
    if(!job)return res.status(404).json({error:"Δεν βρέθηκε η ανάγνωση του τιμολογίου."});
    if(job.purchaseDocumentId||["AWAITING_APPROVAL","CONFIRMED"].includes(job.status))return res.status(409).json({error:"Το τιμολόγιο έχει ήδη σταλεί στις Παραγγελίες & Αγορές."});
    if(req.user?.tokenType==="STORE_OPERATOR"&&req.user.storeId!==job.storeId)return res.status(403).json({error:"Το τιμολόγιο δεν ανήκει στο κατάστημα του χειριστή."});
    const rawLines=Array.isArray(job.resultJson?.productLines)?job.resultJson.productLines:[];
    if(job.resultJson?.v244Finalized!==true||rawLines.length===0)return res.status(409).json({error:"Δεν υπάρχουν τελικές γραμμές προϊόντων V2.4.4. Η καταχώριση σταμάτησε για να μη μεταφερθούν raw OCR/IBAN/headers ως προϊόντα."});
    const lines=z.array(lineSchema).min(1).max(500).parse(rawLines);
    stage="validate-supplier";
    const supplier=await prisma.$queryRaw`SELECT "id","name" FROM "Supplier" WHERE "id"=${body.supplierId} AND "companyId"=${req.user.companyId} AND "active"=true LIMIT 1`;
    if(!supplier[0])return res.status(404).json({error:"Δεν βρέθηκε ο προμηθευτής."});

    const result=await prisma.$transaction(async tx=>{
      stage="lock-ai-job";
      const locked=await tx.$queryRaw`SELECT "status","purchaseDocumentId" FROM "AiReaderJob" WHERE "id"=${job.id} AND "companyId"=${req.user.companyId} FOR UPDATE`;
      if(!locked[0]||locked[0].purchaseDocumentId||["AWAITING_APPROVAL","CONFIRMED"].includes(locked[0].status)){const error=new Error("Το τιμολόγιο έχει ήδη σταλεί στις Παραγγελίες & Αγορές.");error.status=409;throw error;}
      const duplicate=await duplicateInvoice(tx,{companyId:req.user.companyId,supplierId:body.supplierId,documentNumber:body.documentNumber});
      if(duplicate){const error=new Error(`Το τιμολόγιο ${body.documentNumber} υπάρχει ήδη (${duplicate.status}). Δεν δημιουργήθηκε δεύτερη εγγραφή.`);error.status=409;throw error;}
      let shift=null,existingPayment=null;
      if(body.settlementMode==="PAID"&&body.paymentTransactionId){
        stage="validate-existing-payment";
        const payments=await tx.$queryRaw`
          SELECT "id","storeId","supplierId","type","amount","subtractFromShift","reversedAt"
          FROM "StoreTransaction"
          WHERE "id"=${body.paymentTransactionId} AND "companyId"=${req.user.companyId} LIMIT 1`;
        existingPayment=payments[0]||null;
        const valid=existingPayment&&existingPayment.type==='SUPPLIER_PAYMENT'&&!existingPayment.reversedAt&&Boolean(existingPayment.subtractFromShift)&&existingPayment.storeId===job.storeId&&existingPayment.supplierId===body.supplierId&&Math.abs(Number(existingPayment.amount||0)-Number(body.totalGross||0))<=0.05;
        if(!valid){const error=new Error("Η υπάρχουσα FAST πληρωμή δεν συμφωνεί με κατάστημα, προμηθευτή ή ποσό του τιμολογίου.");error.status=409;throw error;}
      }else if(body.settlementMode==="PAID"){
        stage="lock-cash-shift";
        const shifts=await tx.$queryRaw`SELECT "id" FROM "CashShiftSession" WHERE "companyId"=${req.user.companyId} AND "storeId"=${job.storeId} AND "status"='OPEN' ORDER BY "openedAt" DESC LIMIT 1 FOR UPDATE`;
        shift=shifts[0]||null;if(!shift){const error=new Error("Δεν υπάρχει ανοιχτή βάρδια. Πληρωμένο τιμολόγιο δεν μπορεί να καταχωρηθεί χωρίς ενεργή βάρδια.");error.status=409;throw error;}
      }
      stage="match-products";
      const matched=await productsForLines(tx,req.user.companyId,body.supplierId,lines);
      const documentId=id(),orderId=id(),actor=req.user.fullName||"Χειριστής",createdByUserId=req.user?.tokenType==="STORE_OPERATOR"?null:req.user.id;
      const totalNet=matched.reduce((s,l)=>s+Number(l.netAmount||0),0),totalVat=matched.reduce((s,l)=>s+Math.max(0,Number(l.grossAmount||0)-Number(l.netAmount||0)),0);
      stage="create-purchase-document";
      await tx.$executeRaw`INSERT INTO "PurchaseDocument" ("id","companyId","storeId","supplierId","documentType","documentNumber","documentDate","totalNet","totalVat","totalGross","sourceType","status","createdByUserId","settlementMode","purchaseOrderId") VALUES (${documentId},${req.user.companyId},${job.storeId},${body.supplierId},'INVOICE',${body.documentNumber},${body.documentDate||new Date()},${totalNet},${totalVat},${body.totalGross},'POS_OCR_DRAFT','DRAFT',${createdByUserId},${body.settlementMode},${orderId})`;
      stage="create-purchase-order";
      await tx.$executeRaw`INSERT INTO "PurchaseOrder" ("id","companyId","storeId","supplierId","status","invoiceNumber","description","createdByUserId","createdByName","updatedByName","sourceType","sourceDocumentId") VALUES (${orderId},${req.user.companyId},${job.storeId},${body.supplierId},'NEW',${body.documentNumber},${body.note||`OCR V2.4.4 τιμολόγιο ${body.documentNumber} — έλεγχος πριν την οριστικοποίηση`},${createdByUserId},${actor},${actor},'POS_OCR_DRAFT',${documentId})`;
      for(const [index,line] of matched.entries()){
        const net=Math.max(0,Number(line.netAmount||0)),gross=Math.max(net,Number(line.grossAmount||0)),vatAmount=Math.max(0,gross-net);
        stage=`create-purchase-line-${index+1}`;
        await tx.$executeRaw`INSERT INTO "PurchaseOrderLine" ("id","orderId","productId","description","quantity","unitCost","discount1","discount2","discount3","exciseTotal","vatRate","gift","initialUnitCost","markupPercent","proposedSalePrice","netAmount","vatAmount","grossAmount","ocrRawText","ocrConfidence","resolutionStatus","detectedBarcode","ocrSequence","ocrLineType","supplierCode") VALUES (${id()},${orderId},${line.product?.id||null},${line.description},${line.quantity},${line.unitCost},${line.discount1||0},${line.discount2||0},${line.discount3||0},0,${line.vatRate},false,${line.unitCost},0,${Number(line.product?.salePrice||0)},${net},${vatAmount},${gross},${line.rawText||line.description},${line.confidence||0},${line.product?'MATCHED':'UNRESOLVED'},${line.barcode||null},${index+1},'PRODUCT',${line.code||null})`;
      }
      let paymentTransactionId=null;
      if(body.settlementMode==="PAID"){
        if(existingPayment){
          stage="link-existing-payment";
          paymentTransactionId=existingPayment.id;
          await tx.$executeRaw`UPDATE "StoreTransaction" SET "attachmentMimeType"='application/vnd.myworkstation.purchase-document',"attachmentFilename"=${documentId} WHERE "id"=${paymentTransactionId} AND "companyId"=${req.user.companyId}`;
        }else{
          stage="create-payment";
          paymentTransactionId=`pay_${crypto.createHash("sha256").update(`${req.user.companyId}:${job.storeId}:invoice:${documentId}`).digest("hex")}`;
          await tx.$executeRaw`INSERT INTO "StoreTransaction" ("id","companyId","storeId","sessionId","type","amount","description","supplierId","supplierName","subtractFromShift","actorId","actorName","attachmentData","attachmentMimeType","attachmentFilename","attachmentChecksum") VALUES (${paymentTransactionId},${req.user.companyId},${job.storeId},${shift.id},'SUPPLIER_PAYMENT',${body.totalGross},${body.note||`Πληρωμένο τιμολόγιο ${body.documentNumber} — αναμονή ελέγχου BackOffice`},${body.supplierId},${supplier[0].name},true,${req.user.id},${actor},NULL,'application/vnd.myworkstation.purchase-document',${documentId},${crypto.createHash("sha256").update(`invoice:${documentId}`).digest("hex")})`;
        }
        stage="link-payment-document";
        await tx.$executeRaw`UPDATE "PurchaseDocument" SET "paymentTransactionId"=${paymentTransactionId} WHERE "id"=${documentId}`;
      }
      stage="confirm-ai-job";
      await tx.$executeRaw`UPDATE "AiReaderJob" SET "status"='AWAITING_APPROVAL',"purchaseDocumentId"=${documentId},"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${job.id}`;
      return {documentId,orderId,paymentTransactionId,lineCount:matched.length,unresolved:matched.filter(l=>!l.product).length};
    });
    res.status(201).json({ok:true,id:result.documentId,purchaseOrderId:result.orderId,status:"DRAFT",settlementMode:body.settlementMode,paymentRecorded:Boolean(result.paymentTransactionId),paymentTransactionId:result.paymentTransactionId,subtractFromShift:body.settlementMode==="PAID",stockUpdated:false,awaitingApproval:true,lineCount:result.lineCount,unresolvedLines:result.unresolved,v244:true,message:`Το τιμολόγιο πέρασε με ${result.lineCount} πραγματικές γραμμές V2.4.4. ${result.unresolved} χρειάζονται αντιστοίχιση. Η αποθήκη δεν ενημερώθηκε.`});
  }catch(error){
    console.error("V2.4.4 invoice intake failed",{jobId:req.params.jobId,stage,message:error?.message||String(error),code:error?.code||null,metaCode:error?.meta?.code||null});
    next(error);
  }
});

export default router;
