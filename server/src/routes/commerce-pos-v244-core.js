import crypto from "crypto";
import {assertReusableInvoicePayment,findInvoicePayment} from "../lib/invoice-payment-reuse.js";
import {Router} from "express";
import {z} from "zod";
import {prisma} from "../prisma.js";
import {requireCompanyModule} from "../middleware/module-access.js";
import {stockConversionFromDescription} from "../lib/invoice-column-reading.js";
import {reviewStatusForInvoiceLine} from "../lib/invoice-line-review.js";
import {exactLearnedInvoiceCandidate,hasLearnedInvoiceIdentity} from "../lib/invoice-learning-exact-document.js";

const router=Router();
const id=()=>crypto.randomUUID();
const normalizeDocumentNumber=value=>String(value||"").trim().toLocaleUpperCase("el-GR").replace(/\s+/g,"");
const norm=value=>String(value||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLocaleUpperCase("el-GR").replace(/[^A-ZΑ-Ω0-9]/g,"");
const clamp=(v,min,max)=>Math.max(min,Math.min(max,Number(v||0)));
const money2=value=>Math.round((Number(value||0)+Number.EPSILON)*100)/100;
const productLinesGross=lines=>money2((Array.isArray(lines)?lines:[]).reduce((sum,line)=>sum+Number(line?.grossAmount||0),0));
const printedPieceUnit=unit=>/^(?:ΤΜΧ|ΤΕΜ|TEM|TMX|PC|PCS|PIECE)$/.test(String(unit||"").trim().toUpperCase().replace(/[.·]$/,""));

export function reconcileCentRoundingResidual(lines,invoiceTotal,tolerance=0.05){
  const source=Array.isArray(lines)?lines:[],expected=money2(invoiceTotal),actual=productLinesGross(source),residual=money2(expected-actual);
  if(!source.length||Math.abs(residual)<0.005||Math.abs(residual)>tolerance+Number.EPSILON)return {lines:source,applied:false,residual};
  const index=source.findLastIndex(line=>Number(line?.grossAmount||0)>0);
  if(index<0)return {lines:source,applied:false,residual};
  const line=source[index],net=Math.max(0,Number(line?.netAmount||0)),excise=Math.max(0,Number(line?.exciseTotal||0)),gross=money2(Number(line?.grossAmount||0)+residual);
  if(gross+Number.EPSILON<net+excise)return {lines:source,applied:false,residual};
  const adjusted=source.map((row,rowIndex)=>rowIndex===index?{...row,grossAmount:gross,vatAmount:money2(gross-net-excise),centRoundingResidual:residual}:row);
  return productLinesGross(adjusted)===expected?{lines:adjusted,applied:true,residual,index}:{lines:source,applied:false,residual};
}

export function stockMultiplierForPersistedInvoiceLine(line){
  const invoiceUnit=String(line?.invoiceUnit||line?.unit||'ΤΜΧ');
  const invoiceIsPackage=/(PACKAGE|PACK|BOX|CASE|ΚΙΒ|ΚΒ|ΠΑΚ)/i.test(invoiceUnit);
  const invoiceIsWeight=/(KG|KGR|ΚΙΛ)/i.test(invoiceUnit);
  const invoiceIsPiece=printedPieceUnit(invoiceUnit);
  // A raw stockUnitsPerInvoiceUnit value is not proof of a package mapping:
  // older OCR output filled it from 1LT/450ML in the description. A printed
  // piece row must always stay one stock piece unless the invoice itself says
  // PACKAGE/KIB or a user-confirmed package flag is present.
  if(invoiceIsPiece&&!line?.packageConversionApplied&&!line?.confirmedPackMapping)return 1;
  const explicitlyVerified=Boolean(line?.packageConversionApplied||line?.confirmedPackMapping||line?.packRule);
  // A package capacity printed in a product name (1LT, 450ML) is not a count
  // of stock pieces. Plain TEM/TMX invoice rows therefore remain one piece
  // unless a learned/confirmed conversion explicitly says otherwise.
  const supplied=explicitlyVerified||invoiceIsPackage||invoiceIsWeight?Number(line?.stockUnitsPerInvoiceUnit||line?.unitsPerPackage||0):0;
  const conversion=stockConversionFromDescription(line?.description,supplied,invoiceUnit);
  if(conversion.multiplier>1)return conversion.multiplier;
  return invoiceIsPackage&&Number(line?.unitsPerPackage||0)>1?Number(line.unitsPerPackage):1;
}

export function normalizePersistedInvoiceEconomics(line){
  const quantity=Number(line?.quantity||0),unitCost=Number(line?.unitCost||0),netAmount=Number(line?.netAmount||0),grossAmount=Number(line?.grossAmount||0);
  let discount1=Number(line?.discount1||0),discount2=Number(line?.discount2||0),discount3=Number(line?.discount3||0),vatRate=Number(line?.vatRate||0);
  const initial=quantity*unitCost;
  const factor=[discount1,discount2,discount3].reduce((value,discount)=>value*(1-discount/100),1);
  const discountsMatch=initial>0&&netAmount>0&&Math.abs(initial*factor-netAmount)<=Math.max(.03,netAmount*.005);
  if(!discountsMatch&&initial>netAmount&&netAmount>0){
    const inferred=(1-netAmount/initial)*100,rounded=Math.round(inferred);
    if(inferred>0&&inferred<60&&Math.abs(inferred-rounded)<=.35){discount1=rounded;discount2=0;discount3=0;}
  }
  const canonicalVat=[0,6,13,24];
  const vatMatches=netAmount>0&&grossAmount>=netAmount&&Math.abs(netAmount*(1+vatRate/100)-grossAmount)<=Math.max(.03,grossAmount*.003);
  if(!vatMatches&&netAmount>0&&grossAmount>=netAmount){
    const inferred=(grossAmount/netAmount-1)*100,nearest=canonicalVat.reduce((best,value)=>Math.abs(value-inferred)<Math.abs(best-inferred)?value:best,canonicalVat[0]);
    if(Math.abs(nearest-inferred)<=.6)vatRate=nearest;
  }
  return {...line,discount1,discount2,discount3,vatRate};
}

export function shouldApplyLearnedPack(line,learnedPack){
  const unit=String(line?.invoiceUnit||line?.unit||'').trim();
  const verifiedPrintedPieces=line?.sourceColumnsVerified===true&&printedPieceUnit(unit);
  return Number(learnedPack||0)>1&&Number(line?.unitsPerPackage||0)<=1&&!verifiedPrintedPieces;
}

// Last-resort POS safeguard for a printed line that OCR collapsed because it
// is identical to another line. Restore it only when exactly one existing line
// matches the whole invoice gap and the restored total reconciles within five
// cents. Ambiguous gaps remain untouched and visible for manual review.
function restoreUniqueExactGrossGap(lines,invoiceTotal){
  const source=Array.isArray(lines)?lines:[];
  const expected=money2(invoiceTotal),gap=money2(expected-productLinesGross(source));
  if(!(gap>0.05))return {lines:source,restored:false};
  const candidates=source.filter(line=>Math.abs(Number(line?.grossAmount||0)-gap)<=0.05);
  if(candidates.length!==1)return {lines:source,restored:false};
  const restored=[...source,{...candidates[0],finalIntakeExactGapRestored:true}];
  if(Math.abs(productLinesGross(restored)-expected)>0.05+Number.EPSILON)return {lines:source,restored:false};
  return {lines:restored,restored:true,gap,code:String(candidates[0]?.code||"")};
}

// The POS V2.4.4 routes are mounted before the legacy intake routes.  They
// therefore cannot rely on the legacy route's per-request compatibility
// bootstrap.  Without these columns an uploaded invoice reaches the document
// inbox but fails while the draft purchase order is being created.
let intakeSchemaPromise;
export async function ensureV244IntakeSchema(){
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
        `ALTER TABLE "PurchaseOrderLine" ADD COLUMN IF NOT EXISTS "ocrLineType" TEXT NOT NULL DEFAULT 'PRODUCT'`,
        `ALTER TABLE "PurchaseOrderLine" ADD COLUMN IF NOT EXISTS "invoiceUnit" TEXT`,
        `ALTER TABLE "PurchaseOrderLine" ADD COLUMN IF NOT EXISTS "stockUnitsPerInvoiceUnit" NUMERIC(14,4)`,
        `ALTER TABLE "PurchaseOrderLine" ADD COLUMN IF NOT EXISTS "ocrReviewReasons" TEXT`,
        `ALTER TABLE "StoreTransaction" ADD COLUMN IF NOT EXISTS "invoiceDocumentNumber" TEXT`,
        `ALTER TABLE "StoreTransaction" ADD COLUMN IF NOT EXISTS "invoicePaymentKey" TEXT`,
        `CREATE UNIQUE INDEX IF NOT EXISTS "StoreTransaction_active_invoice_payment_unique" ON "StoreTransaction" ("companyId","invoicePaymentKey") WHERE "type"='SUPPLIER_PAYMENT' AND "reversedAt" IS NULL AND "invoicePaymentKey" IS NOT NULL`
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
  retailPrice:z.coerce.number().min(0).max(10000000).optional().default(0),
  initialAmount:z.coerce.number().min(0).max(1000000000).optional().default(0),
  discount1:z.coerce.number().min(0).max(100).optional().default(0),
  discount1Amount:z.coerce.number().min(0).max(1000000000).optional().default(0),
  discount2:z.coerce.number().min(0).max(100).optional().default(0),
  discount2Amount:z.coerce.number().min(0).max(1000000000).optional().default(0),
  discount3:z.coerce.number().min(0).max(100).optional().default(0),
  discount3Amount:z.coerce.number().min(0).max(1000000000).optional().default(0),
  netAmount:z.coerce.number().min(0).max(1000000000),
  exciseTotal:z.coerce.number().min(0).max(1000000000).optional().default(0),
  vatRate:z.coerce.number().min(0).max(100),
  grossAmount:z.coerce.number().min(0).max(1000000000),
  confidence:z.coerce.number().min(0).max(100).optional().default(0),
  sourceColumnsVerified:z.boolean().optional().default(false),
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
  const mappings=await tx.$queryRaw`SELECT "supplierItemCode","productId","unitsPerPackage" FROM "SupplierProductMapping" WHERE "companyId"=${companyId} AND "supplierId"=${supplierId}`;
  const bySupplierCode=new Map(mappings.map(m=>[norm(m.supplierItemCode),m]));
  const byId=new Map(products.map(p=>[p.id,p]));
  return lines.map(line=>{
    let product=null;
    const learned=line.code?bySupplierCode.get(norm(line.code)):null;
    if(learned)product=byId.get(learned.productId)||null;
    if(!product&&line.barcode)product=byBarcode.get(String(line.barcode))||null;
    if(!product){const key=norm(line.description);if(key.length>=4)product=products.find(p=>norm(p.name)===key)||products.find(p=>{const pk=norm(p.name);return key.length>=6&&pk.length>=6&&(pk.includes(key)||key.includes(pk))})||null;}
    const learnedPack=Math.max(0,Number(learned?.unitsPerPackage||0)),useLearnedPack=shouldApplyLearnedPack(line,learnedPack);
    return {...line,product,...(useLearnedPack?{unit:"PACKAGE",unitsPerPackage:learnedPack,packRule:`LEARNED_SUPPLIER_CODE_${learnedPack}`}:{})};
  });
}

router.use(async(req,res,next)=>{try{await ensureV244IntakeSchema();next()}catch(error){next(error)}});

// The POS has already recorded (or safely reused) the supplier payment before
// full OCR starts.  Create the BackOffice shell in the same durable handoff so
// an OCR failure can never hide that paid invoice from the Drafts list.
router.post("/ai-reader/jobs/:jobId/pos-draft",requireCompanyModule("AI_READER"),requireCompanyModule("INVENTORY"),async(req,res,next)=>{
  try{
    const body=z.object({documentType:z.enum(["INVOICE","CREDIT_NOTE"]).default("INVOICE"),supplierId:z.string().min(1),documentNumber:z.string().trim().min(1).max(80),documentDate:z.coerce.date(),totalGross:z.coerce.number().positive().max(999999999),settlementMode:z.enum(["PAID","CREDIT"]),paymentTransactionId:z.string().trim().min(1).max(180).optional().nullable(),note:z.string().trim().max(500).optional().nullable()}).parse(req.body||{});
    if(body.documentType==="CREDIT_NOTE"&&(body.settlementMode!=="CREDIT"||body.paymentTransactionId))return res.status(409).json({error:"Πιστωτικό χωρίς κίνηση ταμείου: επιτρέπεται μόνο συμψηφισμός προμηθευτή."});
    const result=await prisma.$transaction(async tx=>{
      const jobs=await tx.$queryRaw`SELECT "id","storeId","purchaseDocumentId" FROM "AiReaderJob" WHERE "id"=${req.params.jobId} AND "companyId"=${req.user.companyId} LIMIT 1 FOR UPDATE`;
      const job=jobs[0];
      if(!job)throw Object.assign(new Error("Δεν βρέθηκε η ανάγνωση του τιμολογίου."),{status:404});
      if(req.user?.tokenType==="STORE_OPERATOR"&&req.user.storeId!==job.storeId)throw Object.assign(new Error("Το τιμολόγιο δεν ανήκει στο κατάστημα του χειριστή."),{status:403});
      if(job.purchaseDocumentId){const linked=await tx.$queryRaw`SELECT "documentType" FROM "PurchaseDocument" WHERE "id"=${job.purchaseDocumentId} AND "companyId"=${req.user.companyId} LIMIT 1`;if(linked[0]?.documentType!==body.documentType)throw Object.assign(new Error("Το υπάρχον πρόχειρο έχει διαφορετικό τύπο παραστατικού."),{status:409});return {documentId:job.purchaseDocumentId,reused:true};}
      const suppliers=await tx.$queryRaw`SELECT "id","name","taxId" FROM "Supplier" WHERE "id"=${body.supplierId} AND "companyId"=${req.user.companyId} AND "active"=true LIMIT 1`;
      const supplier=suppliers[0];if(!supplier)throw Object.assign(new Error("Δεν βρέθηκε ο προμηθευτής."),{status:404});
      const payment=body.settlementMode==="PAID"?await findInvoicePayment(tx,{companyId:req.user.companyId,supplierId:body.supplierId,supplierTaxId:String(supplier.taxId||"").replace(/\D/g,""),documentNumber:body.documentNumber}):null;
      if(body.settlementMode==="PAID"){
        assertReusableInvoicePayment(payment,{companyId:req.user.companyId,storeId:job.storeId,supplierId:body.supplierId,supplierTaxId:String(supplier.taxId||"").replace(/\D/g,""),documentNumber:body.documentNumber,totalGross:body.totalGross});
        if(body.paymentTransactionId&&body.paymentTransactionId!==payment.id)throw Object.assign(new Error("Η πληρωμή δεν είναι η αρχική πληρωμή του τιμολογίου."),{status:409});
      }
      const duplicate=await duplicateInvoice(tx,{companyId:req.user.companyId,supplierId:body.supplierId,documentNumber:body.documentNumber});
      if(duplicate)throw Object.assign(new Error(`Το τιμολόγιο ${body.documentNumber} υπάρχει ήδη (${duplicate.status}). Δεν δημιουργήθηκε δεύτερη εγγραφή.`),{status:409});
      const documentId=id(),orderId=id(),actor=req.user.fullName||"Χειριστής",createdByUserId=req.user?.tokenType==="STORE_OPERATOR"?null:req.user.id;
      await tx.$executeRaw`INSERT INTO "PurchaseDocument" ("id","companyId","storeId","supplierId","documentType","documentNumber","documentDate","totalNet","totalVat","totalGross","sourceType","status","createdByUserId","settlementMode","purchaseOrderId","paymentTransactionId") VALUES (${documentId},${req.user.companyId},${job.storeId},${body.supplierId},${body.documentType},${body.documentNumber},${body.documentDate},0,0,${body.totalGross},'POS_OCR_DRAFT','DRAFT',${createdByUserId},${body.settlementMode},${orderId},${payment?.id||null})`;
      await tx.$executeRaw`INSERT INTO "PurchaseOrder" ("id","companyId","storeId","supplierId","status","invoiceNumber","description","createdByUserId","createdByName","updatedByName","sourceType","sourceDocumentId") VALUES (${orderId},${req.user.companyId},${job.storeId},${body.supplierId},'NEW',${body.documentNumber},${body.note||`POS πρόχειρο ${body.documentNumber} — αναμονή πλήρους ανάγνωσης`},${createdByUserId},${actor},${actor},'POS_OCR_DRAFT',${documentId})`;
      if(payment)await tx.$executeRaw`UPDATE "StoreTransaction" SET "attachmentMimeType"='application/vnd.myworkstation.purchase-document',"attachmentFilename"=${documentId},"invoiceDocumentNumber"=${body.documentNumber} WHERE "id"=${payment.id} AND "companyId"=${req.user.companyId}`;
      await tx.$executeRaw`UPDATE "AiReaderJob" SET "stage"='POS_DRAFT_READY',"status"='POS_DRAFT_READY',"purchaseDocumentId"=${documentId},"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${job.id} AND "companyId"=${req.user.companyId}`;
      return {documentId,orderId,reused:false};
    });
    res.status(result.reused?200:201).json({ok:true,status:"DRAFT",stockUpdated:false,awaitingApproval:true,...result});
  }catch(error){next(error)}
});

router.put("/ai-reader/jobs/:jobId/product-lines",requireCompanyModule("AI_READER"),async(req,res,next)=>{
  try{
    const body=z.object({productLines:z.array(lineSchema).min(1).max(500),source:z.literal("V2.4.4").optional()}).parse(req.body||{});
    const jobs=await prisma.$queryRaw`SELECT "id","storeId","status","purchaseDocumentId","resultJson" FROM "AiReaderJob" WHERE "id"=${req.params.jobId} AND "companyId"=${req.user.companyId} LIMIT 1`;
    const job=jobs[0];
    if(!job)return res.status(404).json({error:"Δεν βρέθηκε η ανάγνωση."});
    if(req.user?.tokenType==="STORE_OPERATOR"&&req.user.storeId!==job.storeId)return res.status(403).json({error:"Δεν έχεις πρόσβαση σε αυτό το τιμολόγιο."});
    if(job.purchaseDocumentId&&!["POS_DRAFT_READY","POS_PROCESSING","POS_FAILED","AI_COMPLETE"].includes(job.status))return res.status(409).json({error:"Το τιμολόγιο έχει ήδη σταλεί για έλεγχο."});
    const productLines=body.productLines.map(line=>({...line,quantity:Number(line.quantity),unitCost:Number(line.unitCost),retailPrice:Number(line.retailPrice||0),initialAmount:Number(line.initialAmount||0),discount1:clamp(line.discount1,0,100),discount1Amount:Number(line.discount1Amount||0),discount2:clamp(line.discount2,0,100),discount2Amount:Number(line.discount2Amount||0),discount3:clamp(line.discount3,0,100),discount3Amount:Number(line.discount3Amount||0),netAmount:Number(line.netAmount),exciseTotal:Number(line.exciseTotal||0),vatRate:clamp(line.vatRate,0,100),grossAmount:Number(line.grossAmount),confidence:clamp(line.confidence,0,100),sourceColumnsVerified:Boolean(line.sourceColumnsVerified),v244:true}));
    const previous=job.resultJson&&typeof job.resultJson==="object"?job.resultJson:{};
    const resultJson={...previous,productLines,v244Finalized:true,v244FinalizedAt:new Date().toISOString(),v244Source:"KAT_INVOICE_LAB_V2_4_4"};
    await prisma.$executeRaw`UPDATE "AiReaderJob" SET "resultJson"=${JSON.stringify(resultJson)}::jsonb,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${job.id} AND "companyId"=${req.user.companyId}`;
    res.json({ok:true,id:job.id,lineCount:productLines.length,productLines,message:`Αποθηκεύτηκαν ${productLines.length} τελικές γραμμές V2.4.4.`});
  }catch(error){next(error)}
});

router.post("/ai-reader/jobs/:jobId/pos-intake",requireCompanyModule("AI_READER"),requireCompanyModule("INVENTORY"),async(req,res,next)=>{
  let stage="validation";
  try{
    const body=z.object({documentType:z.enum(["INVOICE","CREDIT_NOTE"]).default("INVOICE"),supplierId:z.string().min(1),documentNumber:z.string().trim().min(1).max(80),documentDate:z.coerce.date().optional().nullable(),totalGross:z.coerce.number().positive().max(999999999),settlementMode:z.enum(["PAID","CREDIT"]),paymentTransactionId:z.string().trim().min(1).max(180).optional().nullable(),note:z.string().trim().max(500).optional().nullable(),reconciliationRequired:z.boolean().optional().default(false),reconciliationDifference:z.coerce.number().min(0).optional().default(0),additionalPageJobIds:z.array(z.string().min(1)).max(4).optional().default([]),replaceExistingDraft:z.boolean().optional().default(false)}).parse(req.body||{});
    if(body.documentType==="CREDIT_NOTE"&&(body.settlementMode!=="CREDIT"||body.paymentTransactionId))return res.status(400).json({error:"Το πιστωτικό συμψηφίζεται χωρίς πληρωμή POS."});
    stage="load-ai-job";
    const jobs=await prisma.$queryRaw`SELECT "id","storeId","attachmentId","status","purchaseDocumentId","resultJson" FROM "AiReaderJob" WHERE "id"=${req.params.jobId} AND "companyId"=${req.user.companyId} LIMIT 1`;
    const job=jobs[0];
    if(!job)return res.status(404).json({error:"Δεν βρέθηκε η ανάγνωση του τιμολογίου."});
    if(job.resultJson?.posHandoff?.documentType&&job.resultJson.posHandoff.documentType!==body.documentType||job.resultJson?.documentType==="CREDIT_NOTE"&&body.documentType!=="CREDIT_NOTE")return res.status(409).json({error:"Το είδος παραστατικού δεν συμφωνεί με την αρχική ανάγνωση. Το πρόχειρο διατηρήθηκε χωρίς οικονομική κίνηση."});
    const replacementAuthorized=body.replaceExistingDraft===true&&job.purchaseDocumentId&&job.resultJson?.posReprocess?.mode==="RECONCILIATION_REREAD";
    if(!replacementAuthorized&&((job.purchaseDocumentId&&!["POS_DRAFT_READY","POS_PROCESSING","POS_FAILED","AI_COMPLETE"].includes(job.status))||["AWAITING_APPROVAL","CONFIRMED"].includes(job.status)))return res.status(409).json({error:"Το τιμολόγιο έχει ήδη σταλεί στις Παραγγελίες & Αγορές."});
    if(req.user?.tokenType==="STORE_OPERATOR"&&req.user.storeId!==job.storeId)return res.status(403).json({error:"Το τιμολόγιο δεν ανήκει στο κατάστημα του χειριστή."});
    const rawLines=Array.isArray(job.resultJson?.productLines)?job.resultJson.productLines:[];
    if(job.resultJson?.v244Finalized!==true||rawLines.length===0)return res.status(409).json({error:"Δεν υπάρχουν τελικές γραμμές προϊόντων V2.4.4. Η καταχώριση σταμάτησε για να μη μεταφερθούν raw OCR/IBAN/headers ως προϊόντα."});
    const parsedLines=z.array(lineSchema).min(1).max(500).parse(rawLines);
    const finalGapRecovery=restoreUniqueExactGrossGap(parsedLines,body.totalGross);
    let lines=finalGapRecovery.lines;
    stage="validate-supplier";
    const supplier=await prisma.$queryRaw`SELECT "id","name","taxId" FROM "Supplier" WHERE "id"=${body.supplierId} AND "companyId"=${req.user.companyId} AND "active"=true LIMIT 1`;
    if(!supplier[0])return res.status(404).json({error:"Δεν βρέθηκε ο προμηθευτής."});
    // Re-resolve the exact learned physical invoice at the final persistence
    // boundary. The AI/background stage can be retried or an older resultJson
    // can survive on the durable job; neither may override a centrally learned
    // invoice that independently matches supplier, document number, total and
    // every verified line equation.
    const workspaceRows=await prisma.$queryRawUnsafe(`SELECT "state" FROM "InvoiceLearningWorkspaceState" WHERE "scopeKey"='PLATFORM_GLOBAL' LIMIT 1`).catch(()=>[]);
    const exactLearning=exactLearnedInvoiceCandidate(workspaceRows?.[0]?.state,{
      supplier:supplier[0],documentNumber:body.documentNumber,totalGross:body.totalGross
    });
    if(String(supplier[0].taxId||"").replace(/\D/g,"")==="800802293"&&!exactLearning&&
      hasLearnedInvoiceIdentity(workspaceRows?.[0]?.state,{supplier:supplier[0],documentNumber:body.documentNumber})){
      return res.status(409).json({error:"Η εκμάθηση TALOS του ίδιου τιμολογίου δεν επαληθεύεται οικονομικά. Οι υπάρχουσες γραμμές διατηρήθηκαν για έλεγχο.",code:"POS_LEARNED_INVOICE_MISMATCH"});
    }
    if(exactLearning)lines=exactLearning.lines;
    const invoiceReference=norm(body.documentNumber),supplierTaxId=String(supplier[0].taxId||"").replace(/\D/g,"");
    const invoiceSupplierKey=supplierTaxId?`VAT:${supplierTaxId}`:`ID:${body.supplierId}`;
    const invoicePaymentKey=`${req.user.companyId}:${invoiceSupplierKey}:${invoiceReference}`;
    const invoicePaymentChecksum=crypto.createHash("sha256").update(`supplier-invoice:${invoicePaymentKey}`).digest("hex");

    const result=await prisma.$transaction(async tx=>{
      stage="lock-ai-job";
      const locked=await tx.$queryRaw`SELECT "status","purchaseDocumentId","resultJson" FROM "AiReaderJob" WHERE "id"=${job.id} AND "companyId"=${req.user.companyId} FOR UPDATE`;
      const lockedReplacement=body.replaceExistingDraft===true&&locked[0]?.purchaseDocumentId&&locked[0]?.resultJson?.posReprocess?.mode==="RECONCILIATION_REREAD";
      if(!locked[0]||(!lockedReplacement&&(((locked[0].purchaseDocumentId)&&!["POS_DRAFT_READY","POS_PROCESSING","POS_FAILED","AI_COMPLETE"].includes(locked[0].status))||["AWAITING_APPROVAL","CONFIRMED"].includes(locked[0].status)))){const error=new Error("Το τιμολόγιο έχει ήδη σταλεί στις Παραγγελίες & Αγορές.");error.status=409;throw error;}
      const skeletonDocumentId=locked[0].purchaseDocumentId||null;
      if(body.documentType==="INVOICE")await tx.$queryRaw`SELECT (pg_advisory_xact_lock(hashtext(${`supplier-invoice-payment:${invoicePaymentKey}`})) IS NULL) AS locked`;
      const pageJobIds=[...new Set(body.additionalPageJobIds)].filter(pageJobId=>pageJobId!==job.id);
      const additionalPageJobs=[];
      for(const pageJobId of pageJobIds){
        const pageJobs=await tx.$queryRaw`SELECT "id","storeId","attachmentId","status","purchaseDocumentId" FROM "AiReaderJob" WHERE "companyId"=${req.user.companyId} AND "id"=${pageJobId} LIMIT 1 FOR UPDATE`;
        if(pageJobs[0])additionalPageJobs.push(pageJobs[0]);
      }
      // During a reconciliation reread, a secondary page can legitimately be
      // unlinked: the safe shell is created on the primary job before OCR. It
      // may join this locked invoice only when it is still unclaimed or is
      // already linked to the same shell; a link to any other document remains
      // a hard conflict.
      if(additionalPageJobs.length!==pageJobIds.length||additionalPageJobs.some(pageJob=>pageJob.storeId!==job.storeId||(!lockedReplacement&&pageJob.purchaseDocumentId)||(lockedReplacement&&pageJob.purchaseDocumentId&&pageJob.purchaseDocumentId!==skeletonDocumentId)||!pageJob.attachmentId)){const error=new Error("Δεν επιβεβαιώθηκαν όλες οι πρόσθετες σελίδες του τιμολογίου. Δεν έγινε καταχώριση.");error.status=409;throw error;}
      const duplicate=await duplicateInvoice(tx,{companyId:req.user.companyId,supplierId:body.supplierId,documentNumber:body.documentNumber});
      if(duplicate&&duplicate.id!==skeletonDocumentId){const error=new Error(`Το τιμολόγιο ${body.documentNumber} υπάρχει ήδη (${duplicate.status}). Δεν δημιουργήθηκε δεύτερη εγγραφή.`);error.status=409;throw error;}
      let shift=null,existingPayment=null;
      // Shared POS/BackOffice intake: a reread of an already paid invoice must
      // not turn it into new credit or require the original operator's shift.
      if(body.documentType==="INVOICE"){
        const priorPayment=await findInvoicePayment(tx,{companyId:req.user.companyId,supplierId:body.supplierId,supplierTaxId,documentNumber:body.documentNumber});
        if(priorPayment){
          assertReusableInvoicePayment(priorPayment,{companyId:req.user.companyId,storeId:job.storeId,supplierId:body.supplierId,supplierTaxId,documentNumber:body.documentNumber,totalGross:body.totalGross});
          if(body.paymentTransactionId&&body.paymentTransactionId!==priorPayment.id)throw Object.assign(new Error("Η πληρωμή δεν είναι η αρχική πληρωμή του τιμολογίου."),{status:409});
          body.paymentTransactionId=priorPayment.id;body.settlementMode="PAID";
        }
      }
      if(body.settlementMode==="PAID"&&body.paymentTransactionId){
        stage="validate-existing-payment";
        const payments=await tx.$queryRaw`
          SELECT t."id",t."companyId",t."storeId",t."supplierId",t."type",t."amount",t."subtractFromShift",t."reversedAt",t."description",t."invoiceDocumentNumber",t."invoicePaymentKey",s."taxId" AS "supplierTaxId"
          FROM "StoreTransaction" t
          LEFT JOIN "Supplier" s ON s."id"=t."supplierId" AND s."companyId"=t."companyId"
          WHERE t."id"=${body.paymentTransactionId} AND t."companyId"=${req.user.companyId} LIMIT 1 FOR UPDATE OF t`;
        existingPayment=payments[0]||null;
        assertReusableInvoicePayment(existingPayment,{companyId:req.user.companyId,storeId:job.storeId,supplierId:body.supplierId,supplierTaxId,documentNumber:body.documentNumber,totalGross:body.totalGross});
        const linked=await tx.$queryRaw`SELECT "id" FROM "PurchaseDocument" WHERE "companyId"=${req.user.companyId} AND "paymentTransactionId"=${existingPayment.id} AND "status" IN ('DRAFT','APPROVED') LIMIT 1`;
        if(linked[0]&&linked[0].id!==skeletonDocumentId)throw Object.assign(new Error("Η πληρωμή είναι ήδη συνδεδεμένη με καταχωρισμένο τιμολόγιο."),{status:409});
      }else if(body.settlementMode==="PAID"){
        const duplicatePayments=await tx.$queryRaw`
          SELECT t."id",t."storeId",t."amount",t."occurredAt"
          FROM "StoreTransaction" t
          LEFT JOIN "Supplier" s ON s."id"=t."supplierId" AND s."companyId"=t."companyId"
          WHERE t."companyId"=${req.user.companyId} AND t."type"='SUPPLIER_PAYMENT' AND t."reversedAt" IS NULL
            AND (t."supplierId"=${body.supplierId} OR (${supplierTaxId}<>'' AND REGEXP_REPLACE(COALESCE(s."taxId",''),'\\D','','g')=${supplierTaxId}))
            AND (t."invoicePaymentKey"=${invoicePaymentKey} OR POSITION(${invoiceReference} IN UPPER(REGEXP_REPLACE(COALESCE(t."description",''),'[^A-ZΑ-Ω0-9]','','g')))>0)
          ORDER BY t."occurredAt" ASC LIMIT 1`;
        if(duplicatePayments[0]){const error=new Error(`Η πληρωμή του τιμολογίου ${body.documentNumber} υπάρχει ήδη. Δεν δημιουργήθηκε δεύτερη οικονομική κίνηση.`);error.status=409;throw error;}
        stage="lock-cash-shift";
        const shifts=await tx.$queryRaw`SELECT "id" FROM "CashShiftSession" WHERE "companyId"=${req.user.companyId} AND "storeId"=${job.storeId} AND "status"='OPEN' ORDER BY "openedAt" DESC LIMIT 1 FOR UPDATE`;
        shift=shifts[0]||null;if(!shift){const error=new Error("Δεν υπάρχει ανοιχτή βάρδια. Πληρωμένο τιμολόγιο δεν μπορεί να καταχωρηθεί χωρίς ενεργή βάρδια.");error.status=409;throw error;}
      }
      stage="match-products";
      const matchedRows=await productsForLines(tx,req.user.companyId,body.supplierId,lines);
      const centReconciliation=reconcileCentRoundingResidual(matchedRows,body.totalGross);
      const matched=centReconciliation.lines;
      const skeletonRows=skeletonDocumentId?await tx.$queryRaw`SELECT "id","purchaseOrderId","documentType" FROM "PurchaseDocument" WHERE "id"=${skeletonDocumentId} AND "companyId"=${req.user.companyId} AND "status"='DRAFT' LIMIT 1 FOR UPDATE`:[];
      if(skeletonDocumentId&&!skeletonRows[0])throw Object.assign(new Error("Το πρόχειρο BackOffice δεν είναι διαθέσιμο για συμπλήρωση."),{status:409});
      if(skeletonRows[0]&&skeletonRows[0].documentType!==body.documentType)throw Object.assign(new Error("Το πρόχειρο έχει διαφορετικό τύπο παραστατικού. Δεν έγινε μετατροπή αγοράς σε πιστωτικό."),{status:409});
      const documentId=skeletonRows[0]?.id||id(),orderId=skeletonRows[0]?.purchaseOrderId||id(),actor=req.user.fullName||"Χειριστής",createdByUserId=req.user?.tokenType==="STORE_OPERATOR"?null:req.user.id;
      const totalNet=money2(matched.reduce((s,l)=>s+Number(l.netAmount||0)+Number(l.exciseTotal||0),0)),totalVat=money2(Number(body.totalGross)-totalNet);
      stage="create-purchase-document";
      if(skeletonRows[0])await tx.$executeRaw`UPDATE "PurchaseDocument" SET "documentDate"=${body.documentDate||new Date()},"totalNet"=${totalNet},"totalVat"=${totalVat},"totalGross"=${body.totalGross},"settlementMode"=${body.settlementMode} WHERE "id"=${documentId} AND "companyId"=${req.user.companyId}`;
      else await tx.$executeRaw`INSERT INTO "PurchaseDocument" ("id","companyId","storeId","supplierId","documentType","documentNumber","documentDate","totalNet","totalVat","totalGross","sourceType","status","createdByUserId","settlementMode","purchaseOrderId") VALUES (${documentId},${req.user.companyId},${job.storeId},${body.supplierId},${body.documentType},${body.documentNumber},${body.documentDate||new Date()},${totalNet},${totalVat},${body.totalGross},'POS_OCR_DRAFT','DRAFT',${createdByUserId},${body.settlementMode},${orderId})`;
      stage="create-purchase-order";
      if(skeletonRows[0])await tx.$executeRaw`UPDATE "PurchaseOrder" SET "description"=${body.note||`OCR V2.4.4 τιμολόγιο ${body.documentNumber} — έλεγχος πριν την οριστικοποίηση`},"updatedByName"=${actor},"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${orderId} AND "companyId"=${req.user.companyId}`;
      else await tx.$executeRaw`INSERT INTO "PurchaseOrder" ("id","companyId","storeId","supplierId","status","invoiceNumber","description","createdByUserId","createdByName","updatedByName","sourceType","sourceDocumentId") VALUES (${orderId},${req.user.companyId},${job.storeId},${body.supplierId},'NEW',${body.documentNumber},${body.note||`OCR V2.4.4 ${body.documentType==="CREDIT_NOTE"?"πιστωτικό":"τιμολόγιο"} ${body.documentNumber} — έλεγχος πριν την οριστικοποίηση`},${createdByUserId},${actor},${actor},'POS_OCR_DRAFT',${documentId})`;
      // A linked POS OCR document is one mutable draft, not an append-only
      // import. Every successful fill/reread replaces its OCR lines atomically
      // while the document is still DRAFT, so retries cannot double the order.
      if(skeletonRows[0]){stage="replace-purchase-lines";await tx.$executeRaw`DELETE FROM "PurchaseOrderLine" WHERE "orderId"=${orderId}`;}
      if(skeletonRows[0]&&body.documentType==="CREDIT_NOTE")await tx.$executeRaw`DELETE FROM "PurchaseDocumentLine" WHERE "purchaseDocumentId"=${documentId}`;
      for(const [index,rawLine] of matched.entries()){
        const line=normalizePersistedInvoiceEconomics(rawLine);
        const net=Math.max(0,Number(line.netAmount||0)),exciseTotal=Math.max(0,Number(line.exciseTotal||0)),gross=Math.max(net+exciseTotal,Number(line.grossAmount||0)),vatAmount=Math.max(0,gross-net-exciseTotal);
        const invoiceUnit=String(line.unit||'ΤΜΧ');
        const stockUnitsPerInvoiceUnit=stockMultiplierForPersistedInvoiceLine({...line,invoiceUnit});
        const review=reviewStatusForInvoiceLine({...line,invoiceUnit,stockUnitsPerInvoiceUnit},{matched:Boolean(line.product)});
        stage=`create-purchase-line-${index+1}`;
        await tx.$executeRaw`INSERT INTO "PurchaseOrderLine" ("id","orderId","productId","description","quantity","unitCost","discount1","discount2","discount3","exciseTotal","vatRate","gift","initialUnitCost","markupPercent","proposedSalePrice","netAmount","vatAmount","grossAmount","ocrRawText","ocrConfidence","resolutionStatus","ocrReviewReasons","detectedBarcode","ocrSequence","ocrLineType","supplierCode","invoiceUnit","stockUnitsPerInvoiceUnit") VALUES (${id()},${orderId},${line.product?.id||null},${line.description},${line.quantity},${line.unitCost},${line.discount1||0},${line.discount2||0},${line.discount3||0},${exciseTotal},${line.vatRate},false,${line.unitCost},0,${Number(line.retailPrice||line.product?.salePrice||0)},${net},${vatAmount},${gross},${line.rawText||line.description},${line.confidence||0},${review.resolutionStatus},${review.reasons.join(" · ")||null},${line.barcode||null},${index+1},'PRODUCT',${line.code||null},${invoiceUnit},${stockUnitsPerInvoiceUnit})`;
        if(body.documentType==="CREDIT_NOTE")await tx.$executeRaw`INSERT INTO "PurchaseDocumentLine" ("id","purchaseDocumentId","productId","supplierItemCode","description","quantity","unit","unitsPerPackage","unitCost","netAmount","vatRate","vatAmount","grossAmount") VALUES (${id()},${documentId},${line.product?.id||null},${line.code||null},${line.description},${line.quantity},'PIECE',NULL,${line.unitCost},${net+exciseTotal},${line.vatRate},${vatAmount},${gross})`;
      }
      let paymentTransactionId=null;
      if(body.settlementMode==="PAID"){
        if(existingPayment){
          stage="link-existing-payment";
          paymentTransactionId=existingPayment.id;
          await tx.$executeRaw`UPDATE "StoreTransaction" SET "attachmentMimeType"='application/vnd.myworkstation.purchase-document',"attachmentFilename"=${documentId},"invoiceDocumentNumber"=${body.documentNumber},"invoicePaymentKey"=${invoicePaymentKey},"attachmentChecksum"=${invoicePaymentChecksum} WHERE "id"=${paymentTransactionId} AND "companyId"=${req.user.companyId}`;
        }else{
          stage="create-payment";
          paymentTransactionId=`pay_${crypto.createHash("sha256").update(`${req.user.companyId}:${job.storeId}:invoice:${documentId}`).digest("hex")}`;
          await tx.$executeRaw`INSERT INTO "StoreTransaction" ("id","companyId","storeId","sessionId","type","amount","description","supplierId","supplierName","invoiceDocumentNumber","invoicePaymentKey","subtractFromShift","actorId","actorName","attachmentData","attachmentMimeType","attachmentFilename","attachmentChecksum") VALUES (${paymentTransactionId},${req.user.companyId},${job.storeId},${shift.id},'SUPPLIER_PAYMENT',${body.totalGross},${body.note||`Πληρωμένο τιμολόγιο ${body.documentNumber} — αναμονή ελέγχου BackOffice`},${body.supplierId},${supplier[0].name},${body.documentNumber},${invoicePaymentKey},true,${req.user.id},${actor},NULL,'application/vnd.myworkstation.purchase-document',${documentId},${invoicePaymentChecksum})`;
        }
        stage="link-payment-document";
        await tx.$executeRaw`UPDATE "PurchaseDocument" SET "paymentTransactionId"=${paymentTransactionId} WHERE "id"=${documentId}`;
      }
      stage="confirm-ai-job";
      await tx.$executeRaw`UPDATE "AiReaderJob" SET "status"='AWAITING_APPROVAL',"purchaseDocumentId"=${documentId},"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${job.id}`;
      for(const pageJob of additionalPageJobs)await tx.$executeRaw`UPDATE "AiReaderJob" SET "status"='MERGED_PAGE',"purchaseDocumentId"=${documentId},"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${pageJob.id} AND "companyId"=${req.user.companyId}`;
      let inboxId=null;
      const inboxIds=[];
      const archiveJobs=[job,...pageJobIds.map(pageJobId=>additionalPageJobs.find(pageJob=>pageJob.id===pageJobId)).filter(Boolean)];
      try{ for(const [pageIndex,pageJob] of archiveJobs.entries())if(pageJob.attachmentId){
        stage="archive-after-registration";
        const existingInbox=await tx.$queryRaw`SELECT "id" FROM "DocumentInbox" WHERE "companyId"=${req.user.companyId} AND "attachmentId"=${pageJob.attachmentId} LIMIT 1 FOR UPDATE`;
        const pageInboxId=existingInbox[0]?.id||id();
        if(pageIndex===0)inboxId=pageInboxId;
        inboxIds.push(pageInboxId);
        const pageLabel=archiveJobs.length>1?` • Σελίδα ${pageIndex+1}/${archiveJobs.length}`:"";
        const archiveNote=`Καταχωρίστηκε στις Παραγγελίες & Αγορές • Τιμολόγιο ${body.documentNumber}${pageLabel} • Αγορά ${orderId}${paymentTransactionId?` • Πληρωμή ${paymentTransactionId}`:" • Με πίστωση"}`;
        if(existingInbox[0])await tx.$executeRaw`UPDATE "DocumentInbox" SET "storeId"=${job.storeId},"supplierId"=${body.supplierId},"status"='PROCESSED',"processedAt"=CURRENT_TIMESTAMP,"note"=${archiveNote},"responsibleName"=${actor},"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${pageInboxId} AND "companyId"=${req.user.companyId}`;
        else await tx.$executeRaw`INSERT INTO "DocumentInbox" ("id","companyId","storeId","supplierId","attachmentId","status","processedAt","note","responsibleName","createdByUserId") VALUES (${pageInboxId},${req.user.companyId},${job.storeId},${body.supplierId},${pageJob.attachmentId},'PROCESSED',CURRENT_TIMESTAMP,${archiveNote},${actor},${createdByUserId})`;
      } }catch(archiveError){
        // Registration and payment must not be rolled back because an older
        // DocumentInbox schema cannot archive the attachment metadata.
        console.error("V2.4.4 archive warning",{jobId:job.id,message:archiveError?.message||String(archiveError)});
        inboxId=null; inboxIds.length=0;
      }
      return {documentId,orderId,paymentTransactionId,inboxId,inboxIds,lineCount:matched.length,unresolved:matched.filter(l=>!l.product).length,pageCount:archiveJobs.length};
    });
    res.status(201).json({ok:true,id:result.documentId,purchaseOrderId:result.orderId,inboxId:result.inboxId,inboxIds:result.inboxIds,pageCount:result.pageCount,archived:Boolean(result.inboxId),status:"DRAFT",settlementMode:body.settlementMode,paymentRecorded:Boolean(result.paymentTransactionId),paymentTransactionId:result.paymentTransactionId,reconciliationRequired:body.reconciliationRequired,reconciliationDifference:body.reconciliationDifference,subtractFromShift:body.settlementMode==="PAID",stockUpdated:false,awaitingApproval:true,lineCount:result.lineCount,unresolvedLines:result.unresolved,v244:true,message:`Το τιμολόγιο πέρασε με ${result.lineCount} πραγματικές γραμμές V2.4.4 από ${result.pageCount} ${result.pageCount===1?"σελίδα":"σελίδες"} και μετά αρχειοθετήθηκε στη Θυρίδα. ${result.unresolved} χρειάζονται αντιστοίχιση. Η αποθήκη δεν ενημερώθηκε.`});
  }catch(error){
    console.error("V2.4.4 invoice intake failed",{jobId:req.params.jobId,stage,message:error?.message||String(error),code:error?.code||null,metaCode:error?.meta?.code||null});
    if(error?.status)return next(error);
    const safeError=new Error(`Η καταχώριση τιμολογίου απέτυχε στο στάδιο ${stage}. Η πληρωμή διατηρήθηκε και δεν πρέπει να επαναληφθεί.`);
    safeError.status=500;safeError.code="V244_INTAKE_INTERNAL";
    next(safeError);
  }
});

export default router;
