import crypto from "crypto";
import jwt from "jsonwebtoken";
import {Router} from "express";
import {prisma} from "../prisma.js";
import {requireCompanyModule} from "../middleware/module-access.js";
import {assertReusableInvoicePayment,findInvoicePayment} from "../lib/invoice-payment-reuse.js";
import coreRouter,{ensureV244IntakeSchema} from "./commerce-pos-v244-core.js";
import {callAzure,normalizeAzure,supplierMatch as azureSupplierMatch} from "./commerce-azure-invoice-reader.js";
import {claimsCompletePrintedTable,reconcileInvoiceLines,reusableVerifiedPrintedTable,reviewablePrintedTableForPersistence,verifiedPrintedTableForPersistence} from "../invoice-line-reconciliation.js";
import {finalizeV244ProductLines} from "../../../client/src/lib/invoice-v244.js";
import {verifyInvoiceDiscounts} from "../lib/invoice-discount-verifier.js";
import {recoverBalancedInvoicePayable,recoverVatSummaryInvoiceTotal} from "../lib/invoice-total-reading.js";
import {catastrophicUnverifiedInvoiceMismatch} from "../lib/pos-invoice-catastrophic-mismatch.js";

const router=Router();
// The POS must hand the invoice off quickly. Small OCR reconciliation differences
// remain visible for management review in BackOffice and do not block the operator.
const POS_HANDOFF_TOLERANCE=5;
const POS_STORED_LINES_TOLERANCE=0.05;
const POS_REPROCESS_STRATEGY="MANTZILAS_SINGLE_COMPLETE_VERIFIER_V15";
const POS_COMPLETE_TABLE_REPLAY_RECOVERY_STRATEGY="COMPLETE_TABLE_TRAILING_REPLAY_V16";
const POS_LEVENTOPOULOS_EMPTY_TABLE_RECOVERY_STRATEGY="LEVENTOPOULOS_EMPTY_COMPLETE_TABLE_V17";
const round2=value=>Math.round((Number(value||0)+Number.EPSILON)*100)/100;
const normalizeDocumentNumber=value=>String(value||"").trim().toLocaleUpperCase("el-GR").replace(/\s+/g,"");
const cleanTaxId=value=>String(value||"").replace(/\D/g,"");
const norm=value=>String(value||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLocaleUpperCase("el-GR").replace(/[^A-ZΑ-Ω0-9]/g,"");
const normalizeIntakeDate=value=>{const text=String(value||"").trim();if(!text)return null;if(/^\d{4}-\d{2}-\d{2}$/.test(text))return text;const m=text.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/);return m?`${m[3]}-${String(m[2]).padStart(2,"0")}-${String(m[1]).padStart(2,"0")}`:null};
const intakeNumber=value=>{const text=String(value??"").trim().replace(/\s/g,"");const normalized=text.includes(",")?text.replace(/\./g,"").replace(",","."):text;const n=Number(normalized.replace(/[^0-9.-]/g,""));return Number.isFinite(n)?n:0};
const canonicalSupplierCode=value=>String(value??"").trim().replace(/\D/g,"").replace(/^0+(?=\d)/,"");
function hasMantzilasLegacyAmbiguity(productLines){
  if(!Array.isArray(productLines))return false;
  const row9=productLines.find(line=>canonicalSupplierCode(line?.code)==="9");
  const row160=productLines.find(line=>canonicalSupplierCode(line?.code)==="160");
  const row433=productLines.find(line=>canonicalSupplierCode(line?.code)==="433");
  const mantzilasSignature=Boolean(row9&&row160&&/COCA\s*COLA\s*ZERO/i.test(String(row9.description||row9.rawText||""))&&/COCA\s*COLA/i.test(String(row160.description||row160.rawText||"")));
  const doubledNine=Boolean(row9&&row160&&Number(row9.quantity)===48&&Math.abs(Number(row9.discount1||0)-65.5)<=0.05&&Number(row160.quantity)===48&&Math.abs(Number(row160.discount1||0)-31)<=0.05);
  const staleSixPack=Boolean(row433&&/6\s*(?:P|PK|PACK)/i.test(String(row433.description||row433.rawText||""))&&Number(row433.supplierProfileEvidence?.stockQuantity||0)===6);
  return mantzilasSignature&&(doubledNine||staleSixPack);
}
async function hasPersistedMantzilasLegacyAmbiguity(companyId,job){
  if(!job?.purchaseDocumentId)return false;
  const rows=await prisma.$queryRaw`
    SELECT EXISTS (
      SELECT 1
      FROM "PurchaseDocument" d
      JOIN "Supplier" s ON s."id"=d."supplierId" AND s."companyId"=d."companyId"
      JOIN "PurchaseOrder" o ON o."id"=d."purchaseOrderId" AND o."companyId"=d."companyId"
      JOIN "PurchaseOrderLine" row9 ON row9."orderId"=o."id"
      JOIN "PurchaseOrderLine" row160 ON row160."orderId"=o."id"
      WHERE d."id"=${job.purchaseDocumentId} AND d."companyId"=${companyId}
        AND d."status"='DRAFT' AND d."sourceType"='POS_OCR_DRAFT'
        AND (s."name" ILIKE '%ΜΑΝΤΖΙΛΑΣ%' OR s."name" ILIKE '%MANTZILAS%')
        AND LTRIM(REGEXP_REPLACE(COALESCE(row9."supplierCode",''),'\\D','','g'),'0')='9'
        AND row9."description" ILIKE '%COCA%COLA%ZERO%'
        AND row9."quantity"=48 AND ABS(row9."discount1"-65.5)<=0.05
        AND LTRIM(REGEXP_REPLACE(COALESCE(row160."supplierCode",''),'\\D','','g'),'0')='160'
        AND row160."description" ILIKE '%COCA%COLA%'
    ) AS matches`;
  return rows[0]?.matches===true;
}
const id=()=>crypto.randomUUID();
const fastBackgroundWorkers=new Map();
// A POS handoff is intentionally fire-and-forget for the operator. The durable
// database task below is the single retry owner; do not nest another full OCR
// retry loop inside one lease or a failed provider call can look permanently
// stuck in POS_PROCESSING.
const FAST_AZURE_HEADER_TIMEOUT_MS=20000;
// A complete 16+ row structured table needs a little more time than the
// original four-field header. Keep one shared bounded deadline so the FAST
// reader can finish the table instead of silently handing an empty draft to
// the slower recovery worker.
const FAST_OPENAI_HEADER_TOTAL_TIMEOUT_MS=70000;
const FAST_OPENAI_HEADER_ATTEMPTS=2;
// The full-table fallback may legitimately use 70 seconds when Azure F0 has
// exhausted its call quota. Keep the durable background request bounded while
// allowing the extraction and safe draft write to complete.
const INTERNAL_COMMERCE_REQUEST_TIMEOUT_MS=180000;
const POS_BACKGROUND_TOKEN_ISSUER="myworkstation-pos-background";
const POS_BACKGROUND_TOKEN_AUDIENCE="commerce-pos-background";
const POS_BACKGROUND_LEASE_MS=90*1000;
const POS_BACKGROUND_HEARTBEAT_MS=30*1000;
const POS_BACKGROUND_SWEEP_MS=5000;
const POS_BACKGROUND_MAX_ATTEMPTS=3;
const POS_BACKGROUND_DURABLE_RETRY_DELAYS_MS=[30000,120000];
const POS_BACKGROUND_CONCURRENCY=2;
const posBackgroundWorkerId=`${process.env.RENDER_INSTANCE_ID||process.pid}:${crypto.randomUUID()}`;
let posBackgroundSweepTimer=null;
let posBackgroundSweepActive=false;
const isRetryableBackgroundError=error=>/fetch failed|ECONNRESET|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|AZURE_TIMEOUT|aborted due to timeout|TimeoutError|Η ενιαία ανάγνωση απέτυχε και δεν ανακτήθηκαν με ασφάλεια όλες οι σελίδες|Δεν επιβεβαιώθηκαν όλες οι πρόσθετες σελίδες του τιμολογίου|POS_BACKGROUND_AI_RECHECK:\s*(?:Παρουσιάστηκε εσωτερικό σφάλμα|AI_RECHECK_INTERNAL \[(?:table-recheck|discount-verification|invoice-total-reconciliation)[^\]]*\])/i.test(String(error?.message||error));
const isSafeInferiorRereadFailure=error=>/POS_BACKGROUND_AI_RECHECK:\s*Η νέα πλήρης ανάγνωση δεν βελτίωσε με ασφάλεια το πρόχειρο/i.test(String(error?.message||error));
const completeTableRecoveryStrategy=(job,supplierName="")=>{
  const profile=job?.resultJson?.supplierReadingProfile||{};
  const leventopoulosProfile=profile.ruleKey==="LEVENTOPOULOS_MM_POS1_COLUMNS"
    &&profile.requireCompletePrintedTableOnMismatch===true;
  const legacyLeventopoulosDraft=/ΛΕΒΕΝΤΟΠΟΥΛΟΣ|LEVENTOPOULOS/i.test(String(supplierName||""));
  if(leventopoulosProfile||legacyLeventopoulosDraft)return POS_LEVENTOPOULOS_EMPTY_TABLE_RECOVERY_STRATEGY;
  const completeTableProfile=["FRESH_SNACK_COMPLETE_PRINTED_TABLE","FRESH_DELICACIES_COMPLETE_PRINTED_TABLE"].includes(profile.ruleKey)
    &&profile.requireCompletePrintedTableOnMismatch===true;
  // Any centrally confirmed supplier layout that requires the complete printed
  // table must be recoverable from the same failed POS draft. DELTA/MANTZAVAS
  // use the exact Learning replay before this generic recovery, so this does
  // not authorize reuse of another supplier's economics.
  const genericCompleteTableProfile=profile.requireCompletePrintedTableOnMismatch===true;
  // Older failed jobs did not persist the profile. Their supplier is still
  // authoritative on the linked unapproved draft, so use it only with the
  // exact old failure text below.
  const legacyFreshSnackDraft=/FRESH\s+SNACK/i.test(String(supplierName||""));
  return completeTableProfile||genericCompleteTableProfile||legacyFreshSnackDraft?POS_COMPLETE_TABLE_REPLAY_RECOVERY_STRATEGY:"";
};
const isSafeCompleteTableReplayFailure=(job,error,supplierName="")=>{
  return Boolean(completeTableRecoveryStrategy(job,supplierName))
    &&/Η πλήρης ανάγνωση δεν έχει πλήρως επαληθευμένες τυπωμένες γραμμές\. Το υπάρχον πρόχειρο διατηρήθηκε χωρίς αλλοίωση\./i.test(String(error?.message||error));
};
async function linkedDraftSupplierName(companyId,job){
  if(!job?.purchaseDocumentId)return "";
  const rows=await prisma.$queryRaw`SELECT s."name" FROM "PurchaseDocument" d JOIN "Supplier" s ON s."id"=d."supplierId" AND s."companyId"=d."companyId" WHERE d."id"=${job.purchaseDocumentId} AND d."companyId"=${companyId} AND d."status"='DRAFT' AND d."sourceType"='POS_OCR_DRAFT' LIMIT 1`;
  return String(rows[0]?.name||"");
}

function posBackgroundAuthorization({companyId,storeId,jobId,path,method,body}){
  const bodyHash=crypto.createHash("sha256").update(JSON.stringify(body??null)).digest("hex");
  const token=jwt.sign({tokenType:"POS_BACKGROUND",companyId,storeId,jobId,path,method,bodyHash},process.env.JWT_SECRET,{expiresIn:"5m",issuer:POS_BACKGROUND_TOKEN_ISSUER,audience:POS_BACKGROUND_TOKEN_AUDIENCE});
  return `Bearer ${token}`;
}

async function renewFastBackgroundLease({companyId,jobId,leaseToken}){
  const leaseUntil=new Date(Date.now()+POS_BACKGROUND_LEASE_MS);
  return prisma.$executeRaw`UPDATE "PosInvoiceBackgroundTask" SET "leaseUntil"=${leaseUntil},"updatedAt"=CURRENT_TIMESTAMP WHERE "jobId"=${jobId} AND "companyId"=${companyId} AND "state"='RUNNING' AND "leaseToken"=${leaseToken}`;
}

async function internalCommerceRequest(path,{authorization,backgroundScope,method="GET",body,publicOrigin}={}){
  const localOrigin=`http://127.0.0.1:${process.env.PORT||8080}`;
  const origins=[localOrigin,...(publicOrigin&&publicOrigin!==localOrigin?[publicOrigin]:[])];
  const requestAuthorization=backgroundScope?posBackgroundAuthorization({...backgroundScope,path,method,body}):authorization;
  let lastError;
  for(const [originIndex,origin] of origins.entries())try{
    const response=await fetch(`${origin}/api/commerce${path}`,{method,headers:{Authorization:requestAuthorization,"Content-Type":"application/json"},signal:AbortSignal.timeout(INTERNAL_COMMERCE_REQUEST_TIMEOUT_MS),...(body===undefined?{}:{body:JSON.stringify(body)})});
    const text=await response.text();
    let payload={};
    if(text)try{payload=JSON.parse(text)}catch{payload={error:`Μη αναμενόμενη απάντηση server (${response.status}).`}};
    if(!response.ok){const error=new Error(payload?.error||`Σφάλμα server ${response.status}.`);error.status=response.status;error.internalHttpResponse=true;throw error;}
    return payload;
  }catch(error){
    lastError=error;
    const hasFallback=originIndex<origins.length-1;
    const timedOut=/TimeoutError|AbortError|aborted due to timeout/i.test(`${error?.name||""} ${error?.message||error}`);
    // A loopback connection refusal can safely try the public Render origin.
    // HTTP failures and timeouts mean the local handler was reached (and may
    // still be finishing); replaying them through the public origin duplicates
    // the same expensive OCR operation and extends POS_PROCESSING for minutes.
    if(!hasFallback||error?.internalHttpResponse||timedOut)throw error;
  }
  throw lastError||new Error("Η εσωτερική ανάγνωση τιμολογίου δεν ξεκίνησε.");
}

async function rebuildLostFastHandoff(companyId,job){
  const storedLines=Array.isArray(job.resultJson?.productLines)?job.resultJson.productLines:[];
  if(!job.purchaseDocumentId||!job.createdAt||!storedLines.length)return null;
  const documents=await prisma.$queryRaw`
    SELECT d."documentType",d."supplierId",d."documentNumber",d."documentDate",d."totalGross",d."settlementMode",d."paymentTransactionId",o."description"
    FROM "PurchaseDocument" d JOIN "PurchaseOrder" o ON o."id"=d."purchaseOrderId" AND o."companyId"=d."companyId"
    WHERE d."id"=${job.purchaseDocumentId} AND d."companyId"=${companyId} AND d."storeId"=${job.storeId}
      AND d."sourceType"='POS_OCR_DRAFT' AND d."status"='DRAFT' LIMIT 1`;
  const document=documents[0];if(!document)return null;
  if(document.settlementMode==="PAID"&&!document.paymentTransactionId)return null;
  const expectedPageCount=Math.max(1,Math.min(5,Number(String(document.description||"").match(/(\d+)\s+σελίδ/)?.[1]||1)));
  const siblings=await prisma.$queryRaw`
    SELECT "id" FROM "AiReaderJob" WHERE "companyId"=${companyId} AND "storeId"=${job.storeId}
      AND "createdAt"=${job.createdAt} AND "status" NOT IN ('AWAITING_APPROVAL','CONFIRMED') ORDER BY "id"`;
  if(siblings.length!==expectedPageCount||!siblings.some(row=>row.id===job.id))return null;
  const pageJobIds=[job.id,...siblings.map(row=>row.id).filter(id=>id!==job.id)];
  const handoff={version:"POS_FAST_HANDOFF_REBUILT_V1",documentType:document.documentType||"INVOICE",supplierId:document.supplierId,documentNumber:document.documentNumber,documentDate:document.documentDate,totalGross:Number(document.totalGross||0),settlementMode:document.settlementMode,paymentTransactionId:document.paymentTransactionId||null,pageCount:pageJobIds.length,pageJobIds,primaryJobId:job.id,resumeStoredProductLines:true,rebuiltAt:new Date().toISOString()};
  await prisma.$executeRaw`UPDATE "AiReaderJob" SET "resultJson"=COALESCE("resultJson",'{}'::jsonb)||${JSON.stringify({posHandoff:handoff})}::jsonb,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${job.id} AND "companyId"=${companyId} AND "status"='POS_FAILED'`;
  return handoff;
}

function scheduleFastBackground({companyId,storeId,jobId,pageJobIds,handoff,publicOrigin,leaseToken,attemptCount}){
  if(!companyId||!storeId||!jobId||!leaseToken||fastBackgroundWorkers.has(jobId))return;
  const backgroundScope={companyId,storeId,jobId};
  const additionalPageJobIds=pageJobIds.filter(pageJobId=>pageJobId!==jobId);
  const leaseHeartbeat=setInterval(()=>{renewFastBackgroundLease({companyId,jobId,leaseToken}).catch(error=>console.warn("POS invoice lease heartbeat failed",{jobId,message:String(error?.message||error)}))},POS_BACKGROUND_HEARTBEAT_MS);
  leaseHeartbeat.unref?.();
  const task=(async()=>{
    try{
      await prisma.$executeRaw`UPDATE "AiReaderJob" SET "stage"='POS_BACKGROUND',"status"='POS_PROCESSING',"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${jobId} AND "companyId"=${companyId} AND "status" IN ('LOCAL_COMPLETE','POS_DRAFT_READY','POS_QUEUED','POS_PROCESSING','POS_REPROCESSING','AI_COMPLETE')`;
      let created,operationStage="prepare-lines";
      try{
          let sourceLines,previousLines=[],usingStoredProductLines=false,requiresCompletePrintedTable=false;
          if(!handoff.replaceExistingDraft){
            const rows=await prisma.$queryRaw`SELECT "resultJson" FROM "AiReaderJob" WHERE "id"=${jobId} AND "companyId"=${companyId} LIMIT 1`;
            const storedLines=Array.isArray(rows[0]?.resultJson?.productLines)?rows[0].resultJson.productLines:[];
            const storedReconciliation=reconcileInvoiceLines(finalizeV244ProductLines(storedLines),handoff.totalGross);
            const storedDifference=round2(Math.abs(storedReconciliation.grossTotal-Number(handoff.totalGross||0)));
            // Old POS handoffs did not always persist the resume flag. Reuse
            // their table only when its own arithmetic proves that it belongs
            // to the operator-confirmed invoice total.
            if((handoff.resumeStoredProductLines||storedLines.length&&storedDifference<=POS_STORED_LINES_TOLERANCE)&&reusableVerifiedPrintedTable(storedLines,handoff.totalGross)){sourceLines=storedLines;usingStoredProductLines=true}
            previousLines=storedLines;
            requiresCompletePrintedTable=rows[0]?.resultJson?.supplierReadingProfile?.requireCompletePrintedTableOnMismatch===true;
          }
          if(handoff.replaceExistingDraft){const rows=await prisma.$queryRaw`SELECT "resultJson" FROM "AiReaderJob" WHERE "id"=${jobId} AND "companyId"=${companyId} LIMIT 1`;previousLines=Array.isArray(rows[0]?.resultJson?.productLines)?rows[0].resultJson.productLines:[];requiresCompletePrintedTable=rows[0]?.resultJson?.supplierReadingProfile?.requireCompletePrintedTableOnMismatch===true;sourceLines=null}
          if(!sourceLines){operationStage="ai-recheck";const ai=await internalCommerceRequest(`/ai-reader/jobs/${encodeURIComponent(jobId)}/ai-recheck`,{backgroundScope,publicOrigin,method:"POST",body:{force:true,additionalPageJobIds}});sourceLines=ai?.result?.productLines;requiresCompletePrintedTable=ai?.result?.supplierReadingProfile?.requireCompletePrintedTableOnMismatch===true}
          // A repeated POS intake can legitimately reuse the same failed job
          // after its draft was deleted. In that case the browser may send
          // only the four FAST header fields, while the durable job still has
          // the complete table. Verify that stored table again before reuse so
          // it neither calls unavailable providers nor loses printed discounts.
          if(usingStoredProductLines&&Array.isArray(sourceLines)&&sourceLines.length)await verifyInvoiceDiscounts({productLines:sourceLines,apiKey:null});
          const sourceProductLines=Array.isArray(sourceLines)?sourceLines:[];
          const verifiedProductLines=verifiedPrintedTableForPersistence(sourceProductLines,handoff.totalGross);
          // An operator-triggered correction may replace a linked draft only
          // with a complete table proved against this image and its footer.
          // A better aggregate or a partially verified reread is insufficient.
          if(handoff.aiCorrectExistingDraft===true&&!verifiedProductLines)throw new Error("Η διόρθωση AI δεν επαλήθευσε όλες τις τυπωμένες γραμμές και το σύνολο. Το υπάρχον πρόχειρο διατηρήθηκε.");
          const sourceTableGross=round2(sourceProductLines.reduce((sum,line)=>sum+Number(line?.grossAmount||0),0));
          const verifiedAtOwnTotal=sourceTableGross>0?verifiedPrintedTableForPersistence(sourceProductLines,sourceTableGross):null;
          const reviewableProductLines=requiresCompletePrintedTable?reviewablePrintedTableForPersistence(sourceProductLines,handoff.totalGross):null;
          // A complete printed table may be perfectly valid while its header
          // total is still different. Keep those rows so BackOffice can show
          // a reviewable draft; the intake route records the difference and
          // blocks approval/stock until the operator corrects it. Reject only
          // a table whose own row arithmetic is corrupted.
          if(claimsCompletePrintedTable(sourceProductLines)&&!verifiedProductLines&&!verifiedAtOwnTotal&&!reviewableProductLines)throw new Error("Οι επαληθευμένες τυπωμένες γραμμές αλλοιώθηκαν πριν από την καταχώριση (ποσότητα, έκπτωση ή ΦΠΑ). Το πρόχειρο δεν ενημερώθηκε.");
          // Do not run a verified printed table through the legacy finalizer:
          // it can reinterpret printed piece units or discounts. A table that
          // is valid on its own arithmetic is safe to retain even when the
          // invoice header total needs manual reconciliation.
          const productLines=verifiedProductLines||verifiedAtOwnTotal||reviewableProductLines||finalizeV244ProductLines(sourceProductLines);
          if(!productLines.length)throw new Error("Δεν βρέθηκαν ασφαλείς γραμμές προϊόντων στο τιμολόγιο.");
          if(catastrophicUnverifiedInvoiceMismatch({requiresCompletePrintedTable,verifiedProductLines,verifiedAtOwnTotal,reviewableProductLines,productLines,expectedGross:handoff.totalGross})){
            throw new Error(`Η ανάγνωση έδωσε ακραία απόκλιση από το τιμολόγιο (${productLines.length} γραμμές). Οι μη επαληθευμένες γραμμές δεν αποθηκεύτηκαν στο πρόχειρο.`);
          }
          // Persist recognizable rows as a DRAFT even if their arithmetic
          // does not reconcile with the invoice header. The purchase-order
          // FINAL guard prevents ordinary posting and stock changes while the
          // header disagrees; privileged overrides require an audited reason.
          // An OCR failure must remain visible to the operator as actual
          // reviewable rows, rather than an empty failed order in BackOffice.
          if(handoff.replaceExistingDraft){
            const before=reconcileInvoiceLines(finalizeV244ProductLines(previousLines),handoff.totalGross);
            const after=reconcileInvoiceLines(productLines,handoff.totalGross);
            const beforeDiff=round2(Math.abs(before.grossTotal-Number(handoff.totalGross||0)));
            const afterDiff=round2(Math.abs(after.grossTotal-Number(handoff.totalGross||0)));
            if(afterDiff>POS_HANDOFF_TOLERANCE&&!(productLines.length>previousLines.length&&afterDiff<beforeDiff))throw new Error(`Η νέα πλήρης ανάγνωση δεν βελτίωσε με ασφάλεια το πρόχειρο (${productLines.length} γραμμές, διαφορά ${afterDiff.toFixed(2)} €). Οι υπάρχουσες γραμμές διατηρήθηκαν.`);
          }
          operationStage="save-product-lines";
          await internalCommerceRequest(`/ai-reader/jobs/${encodeURIComponent(jobId)}/product-lines`,{backgroundScope,publicOrigin,method:"PUT",body:{source:"V2.4.4",productLines}});
          operationStage="purchase-intake";
          created=await internalCommerceRequest(`/ai-reader/jobs/${encodeURIComponent(jobId)}/pos-intake`,{backgroundScope,publicOrigin,method:"POST",body:{
            documentType:handoff.documentType||"INVOICE",
            supplierId:handoff.supplierId,
            documentNumber:handoff.documentNumber,
            documentDate:handoff.documentDate,
            totalGross:handoff.totalGross,
            settlementMode:handoff.settlementMode,
            paymentTransactionId:handoff.settlementMode==="PAID"?handoff.paymentTransactionId:null,
            replaceExistingDraft:Boolean(handoff.replaceExistingDraft),
            additionalPageJobIds,
            note:`Γρήγορη καταχώριση με AI • ${pageJobIds.length} ${pageJobIds.length===1?"σελίδα":"σελίδες"} • ${handoff.settlementMode==="PAID"?"ΠΛΗΡΩΜΕΝΟ":"ΜΕ ΠΙΣΤΩΣΗ"}`
          }});
      }catch(error){
        const stagedError=new Error(`POS_BACKGROUND_${operationStage.toUpperCase().replace(/-/g,"_")}: ${String(error?.message||error)}`);stagedError.status=error?.status;throw stagedError;
      }
      await prisma.$transaction(async tx=>{
        const completed=await tx.$executeRaw`UPDATE "PosInvoiceBackgroundTask" SET "state"='COMPLETED',"leaseToken"=NULL,"leaseOwner"=NULL,"leaseUntil"=NULL,"lastError"=NULL,"completedAt"=CURRENT_TIMESTAMP,"updatedAt"=CURRENT_TIMESTAMP WHERE "jobId"=${jobId} AND "companyId"=${companyId} AND "leaseToken"=${leaseToken}`;
        if(!completed)return;
        await tx.$executeRaw`UPDATE "AiReaderJob" SET "stage"='POS_BACKGROUND_COMPLETE',"resultJson"=COALESCE("resultJson",'{}'::jsonb)||${JSON.stringify({posBackground:{status:"COMPLETED",completedAt:new Date().toISOString(),archived:created?.archived!==false,reconciliationRequired:Boolean(created?.reconciliationRequired),reconciliationDifference:Number(created?.reconciliationDifference||0),lineCount:Number(created?.lineCount||0),pageCount:Number(created?.pageCount||pageJobIds.length)}})}::jsonb,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${jobId} AND "companyId"=${companyId}`;
      });
    }catch(error){
      const message=String(error?.message||error).slice(0,700);
      const terminalRows=await prisma.$queryRaw`SELECT "status" FROM "AiReaderJob" WHERE "id"=${jobId} AND "companyId"=${companyId} LIMIT 1`;
      if(["AWAITING_APPROVAL","CONFIRMED"].includes(terminalRows[0]?.status)){
        await prisma.$executeRaw`UPDATE "PosInvoiceBackgroundTask" SET "state"='COMPLETED',"leaseToken"=NULL,"leaseOwner"=NULL,"leaseUntil"=NULL,"lastError"=NULL,"completedAt"=CURRENT_TIMESTAMP,"updatedAt"=CURRENT_TIMESTAMP WHERE "jobId"=${jobId} AND "companyId"=${companyId} AND "leaseToken"=${leaseToken}`;
        return;
      }
      const retryable=isRetryableBackgroundError(error)&&attemptCount<POS_BACKGROUND_MAX_ATTEMPTS;
      if(retryable){
        const retryDelay=POS_BACKGROUND_DURABLE_RETRY_DELAYS_MS[Math.min(attemptCount-1,POS_BACKGROUND_DURABLE_RETRY_DELAYS_MS.length-1)];
        const availableAt=new Date(Date.now()+retryDelay);
        const recovering={status:"RECOVERING",recoveredAt:new Date().toISOString(),previousError:message,durableAttempt:attemptCount};
        await prisma.$transaction(async tx=>{
          const released=await tx.$executeRaw`UPDATE "PosInvoiceBackgroundTask" SET "state"='QUEUED',"availableAt"=${availableAt},"leaseToken"=NULL,"leaseOwner"=NULL,"leaseUntil"=NULL,"lastError"=${message},"updatedAt"=CURRENT_TIMESTAMP WHERE "jobId"=${jobId} AND "companyId"=${companyId} AND "leaseToken"=${leaseToken}`;
          if(released)await tx.$executeRaw`UPDATE "AiReaderJob" SET "stage"='POS_RECOVERING',"status"='POS_QUEUED',"resultJson"=COALESCE("resultJson",'{}'::jsonb)||${JSON.stringify({posBackground:recovering})}::jsonb,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${jobId} AND "companyId"=${companyId} AND "status" NOT IN ('AWAITING_APPROVAL','CONFIRMED')`;
        });
        console.warn("POS fast invoice durable retry queued",{jobId,attempt:attemptCount,delayMs:retryDelay,message});
      }else{
        await prisma.$transaction(async tx=>{
          const failed=await tx.$executeRaw`UPDATE "PosInvoiceBackgroundTask" SET "state"='FAILED',"leaseToken"=NULL,"leaseOwner"=NULL,"leaseUntil"=NULL,"lastError"=${message},"updatedAt"=CURRENT_TIMESTAMP WHERE "jobId"=${jobId} AND "companyId"=${companyId} AND "leaseToken"=${leaseToken}`;
          if(failed)await tx.$executeRaw`UPDATE "AiReaderJob" SET "stage"='POS_BACKGROUND_FAILED',"status"='POS_FAILED',"resultJson"=COALESCE("resultJson",'{}'::jsonb)||${JSON.stringify({posBackground:{status:"FAILED",failedAt:new Date().toISOString(),error:message}})}::jsonb,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${jobId} AND "companyId"=${companyId} AND "status" NOT IN ('AWAITING_APPROVAL','CONFIRMED')`;
        });
        console.error("POS fast invoice background failed",{jobId,message});
      }
    }finally{clearInterval(leaseHeartbeat);fastBackgroundWorkers.delete(jobId);setImmediate(runPosInvoiceBackgroundSweep)}
  })();
  fastBackgroundWorkers.set(jobId,task);
  task.catch(error=>console.error("POS fast invoice worker crashed",{jobId,message:String(error?.message||error)}));
}

async function ensureFastHandoffSchema(){
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "MyDataInboundDocument" (
    "id" TEXT PRIMARY KEY,"companyId" TEXT NOT NULL,"storeId" TEXT NOT NULL,"inboxId" TEXT NOT NULL,
    "mark" TEXT NOT NULL,"uid" TEXT,"issuerVat" TEXT,"counterpartVat" TEXT,"series" TEXT,"documentNumber" TEXT,
    "issueDate" DATE,"invoiceType" TEXT,"currency" TEXT,"totalNet" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "totalVat" DECIMAL(14,4) NOT NULL DEFAULT 0,"totalGross" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "rawPayload" JSONB NOT NULL,"fetchedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE ("companyId","mark"), UNIQUE ("inboxId"))`);
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "PosInvoiceBackgroundTask" (
    "jobId" TEXT PRIMARY KEY REFERENCES "AiReaderJob"("id") ON DELETE CASCADE,
    "companyId" TEXT NOT NULL,"storeId" TEXT NOT NULL,"state" TEXT NOT NULL DEFAULT 'QUEUED',
    "availableAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),"attemptCount" INTEGER NOT NULL DEFAULT 0,
    "leaseToken" TEXT,"leaseOwner" TEXT,"leaseUntil" TIMESTAMPTZ,"publicOrigin" TEXT,"lastError" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),"updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),"completedAt" TIMESTAMPTZ)`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "PosInvoiceBackgroundTask_dispatch_idx" ON "PosInvoiceBackgroundTask" ("state","availableAt","leaseUntil")`);
  await prisma.$executeRawUnsafe(`UPDATE "PosInvoiceBackgroundTask" SET "state"='QUEUED',"availableAt"=NOW(),"leaseToken"=NULL,"leaseOwner"=NULL,"leaseUntil"=NULL,"updatedAt"=NOW()
    WHERE "state"='RUNNING' AND ("leaseUntil" IS NULL OR "leaseToken" IS NULL OR "leaseOwner" IS NULL)`);
  await prisma.$executeRawUnsafe(`INSERT INTO "PosInvoiceBackgroundTask" ("jobId","companyId","storeId","state","availableAt")
    SELECT j."id",j."companyId",j."storeId",'QUEUED',NOW() FROM "AiReaderJob" j
    WHERE j."status" IN ('LOCAL_COMPLETE','POS_QUEUED','POS_DRAFT_READY','POS_PROCESSING','POS_REPROCESSING','AI_COMPLETE')
      AND j."resultJson"->'posHandoff' IS NOT NULL
    ON CONFLICT ("jobId") DO UPDATE SET
      "companyId"=EXCLUDED."companyId","storeId"=EXCLUDED."storeId","state"='QUEUED',"availableAt"=NOW(),"attemptCount"=0,
      "leaseToken"=NULL,"leaseOwner"=NULL,"leaseUntil"=NULL,"lastError"=NULL,"completedAt"=NULL,"updatedAt"=NOW()
    WHERE NOT ("PosInvoiceBackgroundTask"."state"='RUNNING' AND "PosInvoiceBackgroundTask"."leaseUntil">NOW() AND "PosInvoiceBackgroundTask"."leaseToken" IS NOT NULL AND "PosInvoiceBackgroundTask"."leaseOwner" IS NOT NULL)
      OR "PosInvoiceBackgroundTask"."companyId"<>EXCLUDED."companyId"
      OR "PosInvoiceBackgroundTask"."storeId"<>EXCLUDED."storeId"`);

  // A completed mismatched or lossy-packaging draft can predate the current
  // persistence deployment,
  // so POS polling has already stopped. Claim only a recent, still-unapproved
  // MANTZILAS draft once for the new strategy and reuse its durable handoff.
  const candidates=await prisma.$queryRaw`
    SELECT j."id",j."companyId",j."storeId",j."resultJson"
    FROM "AiReaderJob" j
    JOIN "PurchaseDocument" d ON d."id"=j."purchaseDocumentId" AND d."companyId"=j."companyId"
    JOIN "Supplier" s ON s."id"=d."supplierId" AND s."companyId"=d."companyId"
    WHERE j."status"='AWAITING_APPROVAL'
      AND j."updatedAt">CURRENT_TIMESTAMP-INTERVAL '48 hours'
      AND j."resultJson"->'posHandoff' IS NOT NULL
      AND j."resultJson"->'posBackground'->>'status'='COMPLETED'
      AND (COALESCE((j."resultJson"->'posBackground'->>'reconciliationRequired')::boolean,false)=true OR EXISTS (
        SELECT 1 FROM "PurchaseOrder" o JOIN "PurchaseOrderLine" l ON l."orderId"=o."id"
        WHERE o."sourceDocumentId"=d."id" AND o."companyId"=d."companyId"
          AND COALESCE(l."stockUnitsPerInvoiceUnit",1)<=1
          AND (l."description" ILIKE '%4pack%' OR l."description" ILIKE '%6pack%'
            OR l."description" ILIKE '%0,5LT%ΚΟΥΤΙ%' OR l."description" ILIKE '%0,33LT%ΚΟΥΤΙ%'
            OR l."description" ILIKE '%0,5LT%ΦΙΑΛΗ%')
      ))
      AND COALESCE(j."resultJson"->'posReprocess'->>'strategy','')<>${POS_REPROCESS_STRATEGY}
      AND d."status"='DRAFT' AND d."sourceType"='POS_OCR_DRAFT'
      AND (s."name" ILIKE '%ΜΑΝΤΖΙΛΑΣ%' OR s."name" ILIKE '%MANTZILAS%')
    ORDER BY j."updatedAt" DESC LIMIT 3`;
  for(const job of candidates){
    const background=job.resultJson?.posBackground||{};
    const handoff={...job.resultJson.posHandoff,resumeStoredProductLines:false,replaceExistingDraft:true};
    const marker={mode:"RECONCILIATION_REREAD",strategy:POS_REPROCESS_STRATEGY,attemptedAt:new Date().toISOString(),reason:"STARTUP_TOTAL_OR_PACKAGING_RESTORE",trigger:"SERVER_STARTUP",previousLineCount:Number(background.lineCount||job.resultJson?.productLines?.length||0),previousDifference:Number(background.reconciliationDifference||0)};
    await prisma.$transaction(async tx=>{
      const claimed=await tx.$executeRaw`UPDATE "AiReaderJob" SET "stage"='POS_REPROCESSING',"status"='POS_REPROCESSING',"resultJson"=COALESCE("resultJson",'{}'::jsonb)||${JSON.stringify({posReprocess:marker,posHandoff:handoff})}::jsonb,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${job.id} AND "companyId"=${job.companyId} AND "status"='AWAITING_APPROVAL' AND COALESCE("resultJson"->'posReprocess'->>'strategy','')<>${POS_REPROCESS_STRATEGY}`;
      if(!claimed)return;
      await tx.$executeRaw`INSERT INTO "PosInvoiceBackgroundTask" ("jobId","companyId","storeId","state","availableAt") VALUES (${job.id},${job.companyId},${job.storeId},'QUEUED',CURRENT_TIMESTAMP)
        ON CONFLICT ("jobId") DO UPDATE SET "companyId"=EXCLUDED."companyId","storeId"=EXCLUDED."storeId","state"='QUEUED',"availableAt"=CURRENT_TIMESTAMP,"attemptCount"=0,"leaseToken"=NULL,"leaseOwner"=NULL,"leaseUntil"=NULL,"lastError"=NULL,"completedAt"=NULL,"updatedAt"=CURRENT_TIMESTAMP`;
    });
  }

  // POS_FAILED jobs do not keep a browser poll alive. A complete-table profile
  // may retry its durable image once after a safe trailing-replay fix lands.
  const replayCandidates=await prisma.$queryRaw`
    SELECT j."id",j."companyId",j."storeId",j."resultJson",s."name" AS "supplierName"
    FROM "AiReaderJob" j JOIN "PurchaseDocument" d ON d."id"=j."purchaseDocumentId" AND d."companyId"=j."companyId"
      JOIN "Supplier" s ON s."id"=d."supplierId" AND s."companyId"=d."companyId"
    WHERE j."status"='POS_FAILED' AND j."updatedAt">CURRENT_TIMESTAMP-INTERVAL '48 hours'
      AND j."resultJson"->'posHandoff' IS NOT NULL
      AND ((j."resultJson"->'supplierReadingProfile'->>'ruleKey' IN ('FRESH_SNACK_COMPLETE_PRINTED_TABLE','FRESH_DELICACIES_COMPLETE_PRINTED_TABLE','LEVENTOPOULOS_MM_POS1_COLUMNS')
        AND COALESCE(j."resultJson"->'supplierReadingProfile'->>'requireCompletePrintedTableOnMismatch','false')='true')
        OR s."name" ILIKE '%FRESH%SNACK%' OR s."name" ILIKE '%ΛΕΒΕΝΤΟΠΟΥΛΟΣ%' OR s."name" ILIKE '%LEVENTOPOULOS%')
      AND d."status"='DRAFT' AND d."sourceType"='POS_OCR_DRAFT'
    ORDER BY j."updatedAt" DESC LIMIT 3`;
  for(const job of replayCandidates){
    const background=job.resultJson?.posBackground||{};
    if(!isSafeCompleteTableReplayFailure(job,background.error,job.supplierName))continue;
    const recoveryStrategy=completeTableRecoveryStrategy(job,job.supplierName);
    if(job.resultJson?.posReprocess?.strategy===recoveryStrategy)continue;
    const handoff={...job.resultJson.posHandoff,resumeStoredProductLines:false,replaceExistingDraft:true};
    const marker={mode:"RECONCILIATION_REREAD",strategy:recoveryStrategy,attemptedAt:new Date().toISOString(),reason:recoveryStrategy===POS_LEVENTOPOULOS_EMPTY_TABLE_RECOVERY_STRATEGY?"LEVENTOPOULOS_EMPTY_COMPLETE_TABLE":"COMPLETE_TABLE_TRAILING_REPLAY",trigger:"SERVER_STARTUP",previousLineCount:Number(background.lineCount||job.resultJson?.productLines?.length||0),previousDifference:Number(background.reconciliationDifference||0)};
    await prisma.$transaction(async tx=>{
      const claimed=await tx.$executeRaw`UPDATE "AiReaderJob" SET "stage"='POS_REPROCESSING',"status"='POS_REPROCESSING',"resultJson"=COALESCE("resultJson",'{}'::jsonb)||${JSON.stringify({posReprocess:marker,posHandoff:handoff})}::jsonb,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${job.id} AND "companyId"=${job.companyId} AND "status"='POS_FAILED' AND COALESCE("resultJson"->'posReprocess'->>'strategy','')<>${recoveryStrategy}`;
      if(!claimed)return;
      await tx.$executeRaw`INSERT INTO "PosInvoiceBackgroundTask" ("jobId","companyId","storeId","state","availableAt") VALUES (${job.id},${job.companyId},${job.storeId},'QUEUED',CURRENT_TIMESTAMP)
        ON CONFLICT ("jobId") DO UPDATE SET "companyId"=EXCLUDED."companyId","storeId"=EXCLUDED."storeId","state"='QUEUED',"availableAt"=CURRENT_TIMESTAMP,"attemptCount"=0,"leaseToken"=NULL,"leaseOwner"=NULL,"leaseUntil"=NULL,"lastError"=NULL,"completedAt"=NULL,"updatedAt"=CURRENT_TIMESTAMP`;
    });
  }
}

async function enqueueFastBackground({companyId,storeId,jobId,publicOrigin}){
  if(!companyId||!storeId||!jobId)return false;
  const queued=await prisma.$executeRaw`INSERT INTO "PosInvoiceBackgroundTask" ("jobId","companyId","storeId","state","availableAt","publicOrigin") VALUES (${jobId},${companyId},${storeId},'QUEUED',CURRENT_TIMESTAMP,${publicOrigin||null})
    ON CONFLICT ("jobId") DO UPDATE SET "companyId"=EXCLUDED."companyId","storeId"=EXCLUDED."storeId","state"=CASE WHEN "PosInvoiceBackgroundTask"."state"='RUNNING' AND "PosInvoiceBackgroundTask"."leaseUntil">CURRENT_TIMESTAMP THEN 'RUNNING' ELSE 'QUEUED' END,"availableAt"=CASE WHEN "PosInvoiceBackgroundTask"."state"='RUNNING' AND "PosInvoiceBackgroundTask"."leaseUntil">CURRENT_TIMESTAMP THEN "PosInvoiceBackgroundTask"."availableAt" ELSE CURRENT_TIMESTAMP END,"attemptCount"=CASE WHEN "PosInvoiceBackgroundTask"."state" IN ('FAILED','COMPLETED') THEN 0 ELSE "PosInvoiceBackgroundTask"."attemptCount" END,"leaseToken"=CASE WHEN "PosInvoiceBackgroundTask"."state"='RUNNING' AND "PosInvoiceBackgroundTask"."leaseUntil">CURRENT_TIMESTAMP THEN "PosInvoiceBackgroundTask"."leaseToken" ELSE NULL END,"leaseOwner"=CASE WHEN "PosInvoiceBackgroundTask"."state"='RUNNING' AND "PosInvoiceBackgroundTask"."leaseUntil">CURRENT_TIMESTAMP THEN "PosInvoiceBackgroundTask"."leaseOwner" ELSE NULL END,"leaseUntil"=CASE WHEN "PosInvoiceBackgroundTask"."state"='RUNNING' AND "PosInvoiceBackgroundTask"."leaseUntil">CURRENT_TIMESTAMP THEN "PosInvoiceBackgroundTask"."leaseUntil" ELSE NULL END,"publicOrigin"=COALESCE(EXCLUDED."publicOrigin","PosInvoiceBackgroundTask"."publicOrigin"),"lastError"=NULL,"completedAt"=NULL,"updatedAt"=CURRENT_TIMESTAMP`;
  setImmediate(runPosInvoiceBackgroundSweep);
  return Boolean(queued);
}

async function claimFastBackground(){
  const leaseToken=crypto.randomUUID(),leaseUntil=new Date(Date.now()+POS_BACKGROUND_LEASE_MS);
  const rows=await prisma.$queryRaw`WITH candidate AS (
      SELECT t."jobId" FROM "PosInvoiceBackgroundTask" t
      JOIN "AiReaderJob" j ON j."id"=t."jobId" AND j."companyId"=t."companyId" AND j."storeId"=t."storeId"
      WHERE ((t."state"='QUEUED' AND t."availableAt"<=CURRENT_TIMESTAMP) OR (t."state"='RUNNING' AND (t."leaseUntil" IS NULL OR t."leaseUntil"<CURRENT_TIMESTAMP)))
        AND j."status" IN ('LOCAL_COMPLETE','POS_QUEUED','POS_DRAFT_READY','POS_PROCESSING','POS_REPROCESSING','AI_COMPLETE')
        AND j."resultJson"->'posHandoff' IS NOT NULL
      ORDER BY t."availableAt",t."createdAt" FOR UPDATE OF t SKIP LOCKED LIMIT 1
    ) UPDATE "PosInvoiceBackgroundTask" t SET "state"='RUNNING',"attemptCount"=t."attemptCount"+1,"leaseToken"=${leaseToken},"leaseOwner"=${posBackgroundWorkerId},"leaseUntil"=${leaseUntil},"updatedAt"=CURRENT_TIMESTAMP
    FROM candidate c WHERE t."jobId"=c."jobId"
    RETURNING t."jobId",t."companyId",t."storeId",t."attemptCount",t."publicOrigin",t."leaseToken"`;
  const claimed=rows[0];if(!claimed)return null;
  const jobs=await prisma.$queryRaw`SELECT "resultJson","status" FROM "AiReaderJob" WHERE "id"=${claimed.jobId} AND "companyId"=${claimed.companyId} AND "storeId"=${claimed.storeId} LIMIT 1`;
  const handoff=jobs[0]?.resultJson?.posHandoff;
  if(!handoff||!["LOCAL_COMPLETE","POS_QUEUED","POS_DRAFT_READY","POS_PROCESSING","POS_REPROCESSING","AI_COMPLETE"].includes(jobs[0]?.status)){
    await prisma.$executeRaw`UPDATE "PosInvoiceBackgroundTask" SET "state"='FAILED',"leaseToken"=NULL,"leaseOwner"=NULL,"leaseUntil"=NULL,"lastError"='MISSING_OR_TERMINAL_HANDOFF',"updatedAt"=CURRENT_TIMESTAMP WHERE "jobId"=${claimed.jobId} AND "leaseToken"=${leaseToken}`;
    return null;
  }
  const pageJobIds=Array.isArray(handoff.pageJobIds)&&handoff.pageJobIds.includes(claimed.jobId)?handoff.pageJobIds:[claimed.jobId];
  return {...claimed,handoff,pageJobIds,attemptCount:Number(claimed.attemptCount||1)};
}

async function repairStaleRecoveringTasks(){
  // A retry marker without a live lease must never remain operator-visible for
  // hours. Reconcile the durable task from the authoritative active job; the
  // existing attempt counter and worker guards still bound provider retries.
  await prisma.$executeRaw`UPDATE "PosInvoiceBackgroundTask" t SET "state"='QUEUED',"availableAt"=CURRENT_TIMESTAMP,"leaseToken"=NULL,"leaseOwner"=NULL,"leaseUntil"=NULL,"updatedAt"=CURRENT_TIMESTAMP
    FROM "AiReaderJob" j
    WHERE j."id"=t."jobId" AND j."companyId"=t."companyId" AND j."storeId"=t."storeId"
      AND j."status"='POS_QUEUED' AND j."stage"='POS_RECOVERING'
      AND j."updatedAt"<CURRENT_TIMESTAMP-INTERVAL '3 minutes'
      AND j."resultJson"->'posHandoff' IS NOT NULL
      AND NOT (t."state"='RUNNING' AND t."leaseUntil">CURRENT_TIMESTAMP AND t."leaseToken" IS NOT NULL AND t."leaseOwner" IS NOT NULL)`;
}

async function runPosInvoiceBackgroundSweep(){
  if(posBackgroundSweepActive)return;
  posBackgroundSweepActive=true;
  try{
    await repairStaleRecoveringTasks();
    while(fastBackgroundWorkers.size<POS_BACKGROUND_CONCURRENCY){
      const claimed=await claimFastBackground();
      if(!claimed)break;
      scheduleFastBackground({companyId:claimed.companyId,storeId:claimed.storeId,jobId:claimed.jobId,pageJobIds:claimed.pageJobIds,handoff:claimed.handoff,publicOrigin:claimed.publicOrigin,leaseToken:claimed.leaseToken,attemptCount:claimed.attemptCount});
    }
  }catch(error){console.error("POS invoice durable worker sweep failed",{message:String(error?.message||error)})}
  finally{posBackgroundSweepActive=false}
}

export async function ensurePosInvoiceBackgroundWorkerSchema(){await ensureFastHandoffSchema()}
export function startPosInvoiceBackgroundWorker(){
  if(posBackgroundSweepTimer)return;
  posBackgroundSweepTimer=setInterval(runPosInvoiceBackgroundSweep,POS_BACKGROUND_SWEEP_MS);
  posBackgroundSweepTimer.unref?.();
  setImmediate(runPosInvoiceBackgroundSweep);
}

function outputText(response){
  if(typeof response?.output_text==="string"&&response.output_text.trim())return response.output_text;
  for(const item of response?.output||[])for(const part of item?.content||[])if(part?.type==="output_text"&&part.text)return part.text;
  return "";
}

async function callFastOpenAiHeader({prompt,filePart}){
  let lastError;const deadline=Date.now()+FAST_OPENAI_HEADER_TOTAL_TIMEOUT_MS;
  for(let attempt=1;attempt<=FAST_OPENAI_HEADER_ATTEMPTS;attempt++){
    try{
      const remainingMs=deadline-Date.now();if(remainingMs<1000)break;
      const response=await fetch("https://api.openai.com/v1/responses",{method:"POST",headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`,"Content-Type":"application/json"},signal:AbortSignal.timeout(remainingMs),body:JSON.stringify({
        model:process.env.OPENAI_INVOICE_FAST_MODEL||process.env.OPENAI_INVOICE_MODEL||"gpt-5-mini",
        input:[{role:"user",content:[{type:"input_text",text:prompt},filePart]}],
        text:{format:{type:"json_schema",name:"invoice_fast_header",strict:true,schema:fastHeaderSchema}}
      })});
      if(!response.ok){const detail=await response.text();throw new Error(`HTTP ${response.status}: ${detail.slice(0,160)}`)}
      const raw=outputText(await response.json());
      if(!raw.trim())throw new Error("empty structured response");
      const parsed=JSON.parse(raw);
      if(!parsed||typeof parsed!=="object"||Array.isArray(parsed))throw new Error("invalid structured response");
      return parsed;
    }catch(error){
      lastError=error;
      console.warn("FAST OpenAI header attempt failed",{attempt,message:String(error?.message||error)});
    }
  }
  const wrapped=new Error("Η γρήγορη ανάγνωση δεν επέστρεψε έγκυρα βασικά στοιχεία μετά από ασφαλή επανάληψη. Η πληρωμή δεν έγινε.");
  wrapped.status=502;wrapped.cause=lastError;throw wrapped;
}

async function matchSupplier(companyId,candidate={}){
  const taxId=cleanTaxId(candidate.taxId);
  if(taxId){
    const rows=await prisma.$queryRaw`SELECT "id","name","taxId" FROM "Supplier" WHERE "companyId"=${companyId} AND "active"=true AND REGEXP_REPLACE(COALESCE("taxId",''),'\\D','','g')=${taxId} LIMIT 1`;
    if(rows[0])return rows[0];
  }
  const key=norm(candidate.name);
  if(key.length>=4){
    const rows=await prisma.$queryRaw`SELECT "id","name","taxId" FROM "Supplier" WHERE "companyId"=${companyId} AND "active"=true ORDER BY "name"`;
    const exact=rows.find(row=>norm(row.name)===key);if(exact)return exact;
    const close=rows.find(row=>{const k=norm(row.name);return key.length>=7&&k.length>=7&&(k.includes(key)||key.includes(k));});if(close)return close;
  }
  return null;
}

// Keep the operator-facing request limited to the fields required before a
// payment choice. Asking the FAST model for the full item table made a clear
// one-page invoice exhaust the request budget before the four header fields
// could be returned. Product extraction remains in the durable background
// flow (or in Azure when Azure already returned a fully reconciled table).
const fastHeaderSchema={type:"object",additionalProperties:false,properties:{
  confidence:{type:"number",minimum:0,maximum:100},
  documentType:{type:"string",enum:["INVOICE","CREDIT_NOTE"]},
  supplierName:{type:"string"},
  supplierTaxId:{type:"string"},
  documentNumber:{type:"string"},
  documentDate:{type:"string"},
  totalGross:{type:"number",minimum:0}
},required:["confidence","documentType","supplierName","supplierTaxId","documentNumber","documentDate","totalGross"]};
const reconciledFastProductLines=(lines,totalGross)=>{
  const productLines=finalizeV244ProductLines(Array.isArray(lines)?lines:[]).slice(0,500);
  if(!productLines.length||!(Number(totalGross)>0))return [];
  const difference=round2(Math.abs(reconcileInvoiceLines(productLines,totalGross).grossTotal-Number(totalGross)));
  return difference<=POS_STORED_LINES_TOLERANCE?productLines:[];
};

router.get("/ai-reader/capability",requireCompanyModule("AI_READER"),(req,res)=>{
  res.json({enabled:true,moduleKey:"AI_READER"});
});

router.post("/ai-reader/fast-header",requireCompanyModule("AI_READER"),async(req,res,next)=>{
  try{
    const storeId=String(req.body?.storeId||"");
    const filename=String(req.body?.filename||"invoice.jpg").slice(0,180);
    const mimeType=String(req.body?.mimeType||"image/jpeg");
    const dataUrl=String(req.body?.dataUrl||"");
    if(!storeId||!dataUrl)return res.status(400).json({error:"Δεν βρέθηκε το αρχείο του τιμολογίου."});
    const store=await prisma.store.findFirst({where:{id:storeId,companyId:req.user.companyId},select:{id:true}});
    if(!store)return res.status(404).json({error:"Δεν βρέθηκε το κατάστημα."});
    if(req.user?.tokenType==="STORE_OPERATOR"&&String(req.user.storeId)!==storeId)return res.status(403).json({error:"Δεν έχεις πρόσβαση σε αυτό το κατάστημα."});
    const isPdf=mimeType==="application/pdf";
    if(!isPdf&&!/^data:image\/(jpeg|png|webp);base64,/i.test(dataUrl))return res.status(400).json({error:"Το PREMIUM FAST υποστηρίζει εικόνα ή PDF."});
    if(isPdf&&!/^data:application\/pdf;base64,/i.test(dataUrl))return res.status(400).json({error:"Μη έγκυρο PDF."});
    // A repeated POS attempt may already have a complete durable reading for
    // this exact file even when the external FAST providers are unavailable.
    // Reuse is read-only and requires both exact attachment identity and
    // invoice-total arithmetic; otherwise continue through the normal reader.
    const fileBytes=Buffer.from(String(dataUrl).split(",").pop()||"","base64");
    const attachmentChecksum=crypto.createHash("sha256").update(fileBytes).digest("hex");
    const durableRows=await prisma.$queryRaw`
      SELECT j."resultJson",s."id" AS "supplierId",s."name" AS "supplierName",s."taxId" AS "supplierTaxId"
      FROM "DocumentAttachment" a
      JOIN "AiReaderJob" j ON j."attachmentId"=a."id" AND j."companyId"=a."companyId" AND j."storeId"=a."storeId"
      JOIN "Supplier" s ON s."id"=(j."resultJson"->'posHandoff'->>'supplierId') AND s."companyId"=j."companyId" AND s."active"=true
      WHERE a."companyId"=${req.user.companyId} AND a."storeId"=${storeId} AND a."checksum"=${attachmentChecksum}
        AND j."status" IN ('LOCAL_COMPLETE','POS_QUEUED','POS_DRAFT_READY','POS_PROCESSING','POS_FAILED','AI_COMPLETE')
      ORDER BY j."updatedAt" DESC LIMIT 5`;
    for(const row of durableRows){
      const handoff=row.resultJson?.posHandoff&&typeof row.resultJson.posHandoff==="object"?row.resultJson.posHandoff:{};
      const productLines=finalizeV244ProductLines(Array.isArray(row.resultJson?.productLines)?row.resultJson.productLines:[]);
      const documentNumber=String(handoff.documentNumber||"").trim(),documentDate=normalizeIntakeDate(handoff.documentDate),totalGross=round2(handoff.totalGross||0);
      const reconciliation=reconcileInvoiceLines(productLines,totalGross);
      const difference=round2(Math.abs(reconciliation.grossTotal-totalGross));
      if(!row.supplierId||!documentNumber||!documentDate||!(totalGross>0)||!productLines.length||difference>POS_STORED_LINES_TOLERANCE||!reusableVerifiedPrintedTable(row.resultJson?.productLines,totalGross))continue;
      return res.json({confidence:100,supplierId:row.supplierId,supplierName:row.supplierName||"",supplierTaxId:row.supplierTaxId||"",documentNumber,documentDate,totalGross,documentType:row.resultJson?.documentType==="CREDIT_NOTE"||handoff.documentType==="CREDIT_NOTE"?"CREDIT_NOTE":"INVOICE",provider:"DURABLE_POS_JOB",productLines});
    }
    let azureHeaderFallback=null,azureRawText="",azureCandidateProductLines=[];
    if(process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT&&process.env.AZURE_DOCUMENT_INTELLIGENCE_KEY){
      try{
        const parsed=normalizeAzure(await callAzure({contentData:dataUrl,mimeType,timeoutMs:FAST_AZURE_HEADER_TIMEOUT_MS}));
        azureRawText=String(parsed.rawText||"");
        azureCandidateProductLines=Array.isArray(parsed.productLines)?parsed.productLines:[];
        const supplier=await azureSupplierMatch(req.user.companyId,parsed.supplier);
        const azureTotalGross=round2(recoverVatSummaryInvoiceTotal(azureRawText)||recoverBalancedInvoicePayable(azureRawText)||parsed.totalGross||0);
        const azureProductLines=reconciledFastProductLines(parsed.productLines,azureTotalGross);
        const azureHeader={confidence:Number(parsed.aiConfidence||0),supplierId:supplier?.id||"",supplierName:supplier?.name||parsed.supplier?.name||"",supplierTaxId:supplier?.taxId||parsed.supplier?.taxId||"",documentNumber:/\d/.test(String(parsed.documentNumber||""))?String(parsed.documentNumber):"",documentDate:/^\d{4}-\d{2}-\d{2}$/.test(String(parsed.documentDate||""))?String(parsed.documentDate):"",totalGross:azureTotalGross,documentType:parsed.documentType==="CREDIT_NOTE"||/ΠΙΣΤΩΤΙΚ|CREDIT\s*NOTE/i.test(azureRawText)?"CREDIT_NOTE":"INVOICE",provider:"AZURE_DOCUMENT_INTELLIGENCE",productLines:azureProductLines};
        const azureHasUsefulHeader=Boolean(azureHeader.supplierId||cleanTaxId(azureHeader.supplierTaxId)||norm(azureHeader.supplierName).length>=4||azureHeader.documentNumber||azureHeader.documentDate||azureHeader.totalGross>0);
        if(azureHasUsefulHeader&&azureProductLines.length)return res.json(azureHeader);
        if(azureHasUsefulHeader)azureHeaderFallback=azureHeader;
        console.warn("FAST Azure header incomplete; trying configured fallback",{confidence:azureHeader.confidence});
        if(!process.env.OPENAI_API_KEY){if(azureHeaderFallback)return res.json(azureHeaderFallback);const wrapped=new Error("Η γρήγορη ανάγνωση Azure δεν επέστρεψε ασφαλή βασικά στοιχεία και δεν υπάρχει διαθέσιμο FAST fallback. Η πληρωμή δεν έγινε.");wrapped.status=502;throw wrapped;}
      }catch(error){
        if(String(error?.message||"").includes("δεν επέστρεψε ασφαλή βασικά στοιχεία"))throw error;
        console.error("FAST Azure header failed; trying configured fallback",{message:String(error?.message||error)});
        if(!process.env.OPENAI_API_KEY){const wrapped=new Error("Η γρήγορη ανάγνωση Azure δεν είναι προσωρινά διαθέσιμη. Η πληρωμή δεν έγινε.");wrapped.status=502;throw wrapped;}
      }
    }
    if(!process.env.OPENAI_API_KEY)return res.status(503).json({error:"Δεν έχει συνδεθεί ο AI provider για PREMIUM FAST ανάγνωση.",code:"AI_PROVIDER_NOT_CONFIGURED"});
    const filePart=isPdf
      ?{type:"input_file",filename,file_data:dataUrl.split(",").pop()}
      :{type:"input_image",image_url:dataUrl,detail:"high"};
    const prompt=`Είσαι FAST ελεγκτής ελληνικού τιμολογίου προμηθευτή για πληρωμή στο POS. Κοίτα ολόκληρο το πρωτότυπο παραστατικό, ιδίως την επάνω περιοχή για στοιχεία εκδότη/παραστατικού, τον πίνακα ειδών και την κάτω περιοχή για τα τελικά σύνολα.

Χρειάζομαι αυτά τα 6 βασικά στοιχεία:
0. documentType = CREDIT_NOTE αν γράφει ΠΙΣΤΩΤΙΚΟ ή CREDIT NOTE, αλλιώς INVOICE. Μη θεωρήσεις την πίστωση ως τρόπο πληρωμής ένδειξη πιστωτικού.
1. supplierName = ο ΕΚΔΟΤΗΣ/ΠΡΟΜΗΘΕΥΤΗΣ του παραστατικού, όχι ο πελάτης/παραλήπτης.
2. supplierTaxId = το ΑΦΜ του εκδότη/προμηθευτή.
3. documentNumber = ο ακριβής αριθμός/σειρά παραστατικού. Μπορεί να εμφανίζεται ως Αρ. Παραστατικού, Αριθμός, ΤΙΜ, ΤΔΑ, Invoice No, Σειρά/Αριθμός. ΠΡΕΠΕΙ να περιέχει τουλάχιστον ένα ψηφίο. Μην βάλεις λέξη κεφαλίδας.
4. documentDate = η ημερομηνία έκδοσης του παραστατικού σε YYYY-MM-DD. Μην χρησιμοποιήσεις σημερινή ημερομηνία αν δεν φαίνεται στο χαρτί.
5. totalGross = το ΤΕΛΙΚΟ ΠΛΗΡΩΤΕΟ ποσό με ΦΠΑ του ΤΙΜΟΛΟΓΙΟΥ. Αν παρακάτω υπάρχει ξεχωριστή «ΑΠΟΔΕΙΞΗ ΕΙΣΠΡΑΞΗΣ» ή PAYMENT RECEIPT, αγνόησε το ποσό της απόδειξης: μπορεί να διαφέρει από το πληρωτέο του τιμολογίου. Ψάξε ενδείξεις όπως ΠΛΗΡΩΤΕΟ, ΓΕΝΙΚΟ ΣΥΝΟΛΟ, ΤΕΛΙΚΟ ΣΥΝΟΛΟ, ΣΥΝΟΛΟ, TOTAL DUE, GRAND TOTAL. Μην χρησιμοποιήσεις καθαρή αξία, αξία ΦΠΑ ή ενδιάμεσο subtotal. ΠΟΤΕ μην επιλέξεις ΠΡΟΗΓΟΥΜΕΝΟ ΥΠΟΛΟΙΠΟ, ΝΕΟ ΥΠΟΛΟΙΠΟ, ΥΠΟΛΟΙΠΟ ΛΟΓΑΡΙΑΣΜΟΥ, BALANCE ή αξία/υπόλοιπο εγγυοδοσίας. Αν υπάρχει «ΑΝΑΛΥΣΗ ΥΠΟΛΟΓΙΣΜΟΥ Φ.Π.Α.», προτίμησε το μικτό ποσό της γραμμής «ΣΥΝΟΛΑ» που αποδεικνύεται από καθαρή αξία + ΦΠΑ.

Αν ένα βασικό στοιχείο δεν φαίνεται καθαρά, επέστρεψε κενό string ή 0. ΜΗΝ εφευρίσκεις στοιχεία. confidence = συνολική βεβαιότητα για το αποτέλεσμα.`;
    let parsed;
    try{parsed=await callFastOpenAiHeader({prompt,filePart})}
    catch(error){if(azureHeaderFallback)return res.json(azureHeaderFallback);throw error}
    const supplierName=String(parsed.supplierName||azureHeaderFallback?.supplierName||"");
    const supplierTaxId=String(parsed.supplierTaxId||azureHeaderFallback?.supplierTaxId||"");
    const supplier=await matchSupplier(req.user.companyId,{name:supplierName,taxId:supplierTaxId});
    const parsedDocumentNumber=String(parsed.documentNumber||"").trim();
    const documentNumber=/\d/.test(parsedDocumentNumber)?parsedDocumentNumber:String(azureHeaderFallback?.documentNumber||"");
    const parsedDocumentDate=String(parsed.documentDate||"");
    const documentDate=/^\d{4}-\d{2}-\d{2}$/.test(parsedDocumentDate)?parsedDocumentDate:String(azureHeaderFallback?.documentDate||"");
    const parsedTotalGross=round2(parsed.totalGross||0);
    // A printed VAT-analysis TOTALS equation belongs to the invoice rather
    // than an adjacent receipt or the customer's running balance. Apply the
    // existing cent-balanced footer proof to every supplier when Azure has
    // actually transcribed it; an absent/unbalanced footer still falls back
    // to the FAST header and leaves the normal review path intact.
    const verifiedVatSummaryTotal=recoverVatSummaryInvoiceTotal(azureRawText);
    const verifiedPayableTotal=recoverBalancedInvoicePayable(azureRawText);
    const totalGross=verifiedVatSummaryTotal>0?verifiedVatSummaryTotal:verifiedPayableTotal>0?verifiedPayableTotal:parsedTotalGross>0?parsedTotalGross:round2(azureHeaderFallback?.totalGross||0);
    // FAST rows may bypass the unavailable full-table provider only when the
    // complete table proves itself against the printed/confirmed invoice total.
    // A partial table is discarded and the existing fail-closed background
    // path remains authoritative.
    // Azure may have read a complete table while choosing a footer account
    // balance as its header total. Keep those current-image rows until the
    // independently verified final total is known, then reconcile once more.
    // This never accepts a partial table and avoids a second provider pass for
    // a table that already proves itself against the invoice.
    const providerLines=Array.isArray(parsed.productLines)&&parsed.productLines.length?parsed.productLines:azureCandidateProductLines;
    const productLines=reconciledFastProductLines(providerLines,totalGross);
    res.json({
      confidence:Number(parsed.confidence||0),
      supplierId:supplier?.id||"",
      supplierName:supplier?.name||supplierName,
      supplierTaxId:supplier?.taxId||supplierTaxId,
      documentNumber:/\d/.test(documentNumber)?documentNumber:"",
      documentDate,
      documentType:parsed.documentType==="CREDIT_NOTE"||azureHeaderFallback?.documentType==="CREDIT_NOTE"?"CREDIT_NOTE":"INVOICE",
      totalGross:totalGross>0?totalGross:0,
      productLines
    });
  }catch(error){next(error)}
});

router.post("/ai-reader/fast-duplicate-check",requireCompanyModule("AI_READER"),async(req,res,next)=>{
  try{
    const companyId=req.user.companyId;
    const storeId=String(req.body?.storeId||"");
    const supplierId=String(req.body?.supplierId||"");
    const documentNumber=normalizeDocumentNumber(req.body?.documentNumber);
    const documentToken=norm(req.body?.documentNumber);
    const dataUrl=String(req.body?.dataUrl||"");
    if(!storeId||!supplierId||!documentNumber)return res.status(400).json({error:"Χρειάζονται κατάστημα, προμηθευτής και αριθμός τιμολογίου για τον γρήγορο έλεγχο duplicate."});
    const store=await prisma.store.findFirst({where:{id:storeId,companyId},select:{id:true}});
    if(!store)return res.status(404).json({error:"Δεν βρέθηκε το κατάστημα."});
    if(req.user?.tokenType==="STORE_OPERATOR"&&String(req.user.storeId)!==storeId)return res.status(403).json({error:"Δεν έχεις πρόσβαση σε αυτό το κατάστημα."});
    const supplierRows=await prisma.$queryRaw`SELECT "id","taxId" FROM "Supplier" WHERE "id"=${supplierId} AND "companyId"=${companyId} AND "active"=true LIMIT 1`;
    if(!supplierRows[0])return res.status(404).json({error:"Δεν βρέθηκε ο προμηθευτής."});
    const supplierTaxId=cleanTaxId(supplierRows[0].taxId);
    await ensureV244IntakeSchema();
    const payment=await findInvoicePayment(prisma,{companyId,supplierId,supplierTaxId,documentNumber:req.body.documentNumber});
    if(payment)assertReusableInvoicePayment(payment,{companyId,storeId,supplierId,supplierTaxId,documentNumber:req.body.documentNumber,totalGross:intakeNumber(req.body.totalGross)});
    let resume=null;
    const fileMatch=/^data:(application\/pdf|image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
    const checksum=fileMatch?crypto.createHash("sha256").update(Buffer.from(fileMatch[2],"base64")).digest("hex"):null;
    if(checksum){
      const attachments=await prisma.$queryRaw`
        SELECT a."id",a."filename",i."id" AS "inboxId",j."id" AS "jobId",d."id" AS "purchaseDocumentId",COALESCE(i."status",j."status",'UPLOADED') AS "status",
          COALESCE(i."receivedAt",j."createdAt",a."createdAt") AS "receivedAt"
        FROM "DocumentAttachment" a
        LEFT JOIN "DocumentInbox" i ON i."attachmentId"=a."id" AND i."companyId"=a."companyId"
        LEFT JOIN "AiReaderJob" j ON j."attachmentId"=a."id" AND j."companyId"=a."companyId"
        LEFT JOIN "PurchaseDocument" d ON d."id"=j."purchaseDocumentId" AND d."companyId"=j."companyId"
        WHERE a."companyId"=${companyId} AND a."storeId"=${storeId} AND a."checksum"=${checksum}
        ORDER BY (d."id" IS NOT NULL) DESC, COALESCE(i."receivedAt",j."createdAt",a."createdAt") DESC LIMIT 1`;
      const paymentByFile=await prisma.$queryRaw`
        SELECT t."id",t."occurredAt",t."amount",t."description"
        FROM "StoreTransaction" t
        WHERE t."companyId"=${companyId} AND t."storeId"=${storeId} AND t."supplierId"=${supplierId}
          AND t."type"='SUPPLIER_PAYMENT' AND t."reversedAt" IS NULL AND t."attachmentChecksum"=${checksum}
        ORDER BY t."occurredAt" DESC LIMIT 1`;
      if(attachments[0]?.purchaseDocumentId)return res.status(409).json({error:"Η ίδια φωτογραφία/PDF τιμολογίου έχει ήδη καταχωριστεί. Δεν έγινε νέα πληρωμή ή πίστωση.",code:"DUPLICATE_INVOICE_FILE",existing:attachments[0]});
      if(attachments[0]?.jobId&&!["AWAITING_APPROVAL","CONFIRMED"].includes(attachments[0].status))resume={resumable:true,resumeJobId:attachments[0].jobId,resumeStatus:attachments[0].status};
      // Legacy file-only evidence without an exact invoice identity must be reviewed.
      if(paymentByFile[0]&&!payment)return res.status(409).json({error:"Υπάρχει πληρωμή για το αρχείο χωρίς επιβεβαιωμένο αριθμό τιμολογίου. Χρειάζεται έλεγχος στο BackOffice.",code:"DUPLICATE_INVOICE_PAYMENT"});
    }
    const docs=await prisma.$queryRaw`
      SELECT d."id",d."status",d."documentNumber",d."documentDate",s."name" AS "storeName"
      FROM "PurchaseDocument" d
      LEFT JOIN "Store" s ON s."id"=d."storeId"
      WHERE d."companyId"=${companyId} AND d."supplierId"=${supplierId}
        AND d."status" IN ('DRAFT','APPROVED')
        AND UPPER(REGEXP_REPLACE(TRIM(COALESCE(d."documentNumber",'')),'\\s+','','g'))=${documentNumber}
      ORDER BY d."documentDate" DESC LIMIT 1`;
    if(docs[0])return res.status(409).json({error:"Το ίδιο τιμολόγιο υπάρχει ήδη και η δεύτερη καταχώριση μπλοκαρίστηκε.",code:"DUPLICATE_INVOICE",existing:docs[0]});
    const orders=await prisma.$queryRaw`
      SELECT o."id",o."status",o."invoiceNumber" AS "documentNumber",o."updatedAt",s."name" AS "storeName"
      FROM "PurchaseOrder" o
      LEFT JOIN "Store" s ON s."id"=o."storeId"
      WHERE o."companyId"=${companyId} AND o."supplierId"=${supplierId}
        AND o."status" IN ('NEW','FINAL','INVOICED')
        AND UPPER(REGEXP_REPLACE(TRIM(COALESCE(o."invoiceNumber",'')),'\\s+','','g'))=${documentNumber}
      ORDER BY o."updatedAt" DESC LIMIT 1`;
    if(orders[0])return res.status(409).json({error:"Το ίδιο τιμολόγιο υπάρχει ήδη και η δεύτερη καταχώριση μπλοκαρίστηκε.",code:"DUPLICATE_INVOICE",existing:orders[0]});
    res.json({ok:true,duplicate:false,...resume,paymentTransactionId:payment?.id||null,paymentReused:Boolean(payment),
      ...(payment?{settlementMode:"PAID",message:"Η υπάρχουσα πληρωμή διατηρείται. Θα γίνει μόνο νέα ανάγνωση του τιμολογίου."}:{})});
  }catch(error){next(error)}
});

// Durable POS handoff: the till may close immediately after this response. Every
// source page and the operator-confirmed header are already stored on the server.
// Full line recognition remains a BackOffice concern and may safely be retried.
router.post("/ai-reader/fast-handoff",requireCompanyModule("AI_READER"),async(req,res,next)=>{
  try{
    const companyId=req.user.companyId,storeId=String(req.body?.storeId||""),supplierId=String(req.body?.supplierId||"");
    const documentNumber=String(req.body?.documentNumber||"").trim().slice(0,80),documentDate=normalizeIntakeDate(req.body?.documentDate);
    const totalGross=round2(intakeNumber(req.body?.totalGross));
    const documentType=req.body?.documentType;
    const pages=Array.isArray(req.body?.pages)?req.body.pages.slice(0,5):[];
    if(!["INVOICE","CREDIT_NOTE"].includes(documentType)||documentType==="INVOICE"&&pages.some(page=>page?.documentType==="CREDIT_NOTE"))return res.status(409).json({error:"Ο τύπος παραστατικού δεν συμφωνεί με την ανάγνωση. Δεν έγινε καταχώριση ή πληρωμή.",code:"POS_DOCUMENT_TYPE_CONFLICT"});
    if(documentType==="CREDIT_NOTE"&&(req.body?.settlementMode!=="CREDIT"||req.body?.paymentTransactionId))return res.status(409).json({error:"Το πιστωτικό συμψηφίζεται με το υπόλοιπο του προμηθευτή, χωρίς πληρωμή POS.",code:"POS_CREDIT_NOTE_PAYMENT_FORBIDDEN"});
    let settlementMode=req.body?.settlementMode==="PAID"?"PAID":"CREDIT";
    let paymentTransactionId=req.body?.paymentTransactionId?String(req.body.paymentTransactionId).slice(0,180):null;
    if(!storeId||!supplierId||!documentNumber||!documentDate||!(totalGross>0)||!pages.length)return res.status(400).json({error:"Λείπουν στοιχεία για την ασφαλή παραλαβή του τιμολογίου."});
    const store=await prisma.store.findFirst({where:{id:storeId,companyId},select:{id:true}});
    if(!store)return res.status(404).json({error:"Δεν βρέθηκε το κατάστημα."});
    if(req.user?.tokenType==="STORE_OPERATOR"&&String(req.user.storeId)!==storeId)return res.status(403).json({error:"Δεν έχεις πρόσβαση σε αυτό το κατάστημα."});
    const supplierRows=await prisma.$queryRaw`SELECT "id","taxId" FROM "Supplier" WHERE "id"=${supplierId} AND "companyId"=${companyId} AND "active"=true LIMIT 1`;
    const supplier=supplierRows[0];if(!supplier)return res.status(404).json({error:"Δεν βρέθηκε ο προμηθευτής."});
    await ensureV244IntakeSchema();
    const existingPayment=documentType==="INVOICE"?await findInvoicePayment(prisma,{companyId,supplierId,supplierTaxId:cleanTaxId(supplier.taxId),documentNumber}):null;
    if(existingPayment){
      assertReusableInvoicePayment(existingPayment,{companyId,storeId,supplierId,supplierTaxId:cleanTaxId(supplier.taxId),documentNumber,totalGross});
      if(paymentTransactionId&&paymentTransactionId!==existingPayment.id)return res.status(409).json({error:"Η πληρωμή δεν είναι η αρχική πληρωμή αυτού του τιμολογίου."});
      paymentTransactionId=existingPayment.id;settlementMode="PAID";
    }else if(paymentTransactionId||settlementMode==="PAID")return res.status(409).json({error:"Δεν βρέθηκε ενεργή πληρωμή που συμφωνεί με το τιμολόγιο. Δεν έγινε νέα χρέωση."});
    const normalizedPages=pages.map((page,index)=>{
      const filename=String(page?.filename||`timologio-selida-${index+1}.jpg`).slice(0,180),mimeType=String(page?.mimeType||"image/jpeg"),dataUrl=String(page?.dataUrl||"");
      const escaped=mimeType.replace("/","\\/");const match=new RegExp(`^data:${escaped};base64,([A-Za-z0-9+/=]+)$`).exec(dataUrl);
      if(!["image/jpeg","image/png","image/webp","application/pdf"].includes(mimeType)||!match)throw Object.assign(new Error(`Μη έγκυρη σελίδα ${index+1}.`),{status:400});
      const bytes=Buffer.from(match[1],"base64");if(bytes.length<100||bytes.length>6500000)throw Object.assign(new Error(`Η σελίδα ${index+1} πρέπει να είναι έως 6,5 MB.`),{status:400});
      const cachedProductLines=finalizeV244ProductLines(Array.isArray(page?.productLines)?page.productLines:[]).slice(0,500);
      return {filename,mimeType,dataUrl,checksum:crypto.createHash("sha256").update(bytes).digest("hex"),cachedProductLines};
    });
    // The browser can correctly recover the four FAST fields from an older
    // exact-file job while the newest job for that attachment is an empty
    // failed shell. Hydrate the handoff server-side so React timing or job
    // ordering can never force another provider call.
    for(const page of normalizedPages){
      if(page.cachedProductLines.length)continue;
      const durableCandidates=await prisma.$queryRaw`
        SELECT j."resultJson" FROM "DocumentAttachment" a
        JOIN "AiReaderJob" j ON j."attachmentId"=a."id" AND j."companyId"=a."companyId" AND j."storeId"=a."storeId"
        WHERE a."companyId"=${companyId} AND a."storeId"=${storeId} AND a."checksum"=${page.checksum}
          AND j."status" IN ('LOCAL_COMPLETE','POS_QUEUED','POS_DRAFT_READY','POS_PROCESSING','POS_FAILED','AI_COMPLETE')
        ORDER BY j."updatedAt" DESC LIMIT 10`;
      for(const candidate of durableCandidates){
        const candidateHandoff=candidate.resultJson?.posHandoff&&typeof candidate.resultJson.posHandoff==="object"?candidate.resultJson.posHandoff:{};
        const candidateLines=finalizeV244ProductLines(Array.isArray(candidate.resultJson?.productLines)?candidate.resultJson.productLines:[]).slice(0,500);
        const sameInvoice=String(candidateHandoff.supplierId||"")===supplierId
          &&normalizeDocumentNumber(candidateHandoff.documentNumber)===normalizeDocumentNumber(documentNumber)
          &&normalizeIntakeDate(candidateHandoff.documentDate)===documentDate
          &&Math.abs(round2(candidateHandoff.totalGross||0)-totalGross)<=POS_STORED_LINES_TOLERANCE;
        if(!sameInvoice||!candidateLines.length)continue;
        const candidateDifference=round2(Math.abs(reconcileInvoiceLines(candidateLines,totalGross).grossTotal-totalGross));
        if(candidateDifference>POS_STORED_LINES_TOLERANCE||!reusableVerifiedPrintedTable(candidate.resultJson?.productLines,totalGross))continue;
        page.cachedProductLines=candidateLines;
        break;
      }
      if(page.cachedProductLines.length)continue;
      // Client-side image optimization may produce different bytes for the
      // same photographed invoice. Fall back to its confirmed business
      // identity, still inside the same tenant/store and with the same strict
      // line-total proof used by exact-checksum recovery.
      const identityCandidates=await prisma.$queryRaw`
        SELECT j."resultJson" FROM "AiReaderJob" j
        WHERE j."companyId"=${companyId} AND j."storeId"=${storeId}
          AND j."resultJson"->'posHandoff'->>'supplierId'=${supplierId}
          AND j."status" IN ('LOCAL_COMPLETE','POS_QUEUED','POS_DRAFT_READY','POS_PROCESSING','POS_FAILED','AI_COMPLETE')
        ORDER BY j."updatedAt" DESC LIMIT 50`;
      for(const candidate of identityCandidates){
        const candidateHandoff=candidate.resultJson?.posHandoff&&typeof candidate.resultJson.posHandoff==="object"?candidate.resultJson.posHandoff:{};
        const candidateLines=finalizeV244ProductLines(Array.isArray(candidate.resultJson?.productLines)?candidate.resultJson.productLines:[]).slice(0,500);
        const sameInvoice=normalizeDocumentNumber(candidateHandoff.documentNumber)===normalizeDocumentNumber(documentNumber)
          &&normalizeIntakeDate(candidateHandoff.documentDate)===documentDate
          &&Math.abs(round2(candidateHandoff.totalGross||0)-totalGross)<=POS_STORED_LINES_TOLERANCE;
        if(!sameInvoice||!candidateLines.length)continue;
        const candidateDifference=round2(Math.abs(reconcileInvoiceLines(candidateLines,totalGross).grossTotal-totalGross));
        if(candidateDifference>POS_STORED_LINES_TOLERANCE||!reusableVerifiedPrintedTable(candidate.resultJson?.productLines,totalGross))continue;
        page.cachedProductLines=candidateLines;
        break;
      }
    }
    const hasCompleteCachedProductLines=normalizedPages.length===1&&normalizedPages.every(page=>reusableVerifiedPrintedTable(page.cachedProductLines,totalGross));
    if(hasCompleteCachedProductLines){
      // FAST Azure can return a complete table while exposing the discounted
      // net unit price as UnitPrice. Recover printed price/discount pairs from
      // each raw row before the cached lines can bypass the full provider.
      for(const page of normalizedPages)await verifyInvoiceDiscounts({productLines:page.cachedProductLines,apiKey:null});
    }
    const cachedProductLines=hasCompleteCachedProductLines?normalizedPages.flatMap((page,pageIndex)=>finalizeV244ProductLines(page.cachedProductLines).map(line=>({...line,sourceFileIndex:pageIndex}))):[];
    await ensureFastHandoffSchema();
    const taxId=cleanTaxId(supplier.taxId),normalizedNumber=normalizeDocumentNumber(documentNumber);
    const myDataRows=taxId?await prisma.$queryRaw`
      SELECT m."id",m."inboxId",m."mark",m."documentNumber",m."issueDate",m."totalGross"
      FROM "MyDataInboundDocument" m
      WHERE m."companyId"=${companyId} AND m."storeId"=${storeId}
        AND REGEXP_REPLACE(COALESCE(m."issuerVat",''),'\\D','','g')=${taxId}
        AND UPPER(REGEXP_REPLACE(TRIM(COALESCE(m."documentNumber",'')),'\\s+','','g'))=${normalizedNumber}
        AND (m."issueDate" IS NULL OR m."issueDate"=${new Date(`${documentDate}T00:00:00Z`)})
        AND ABS(COALESCE(m."totalGross",0)-${totalGross})<=0.05
      ORDER BY m."fetchedAt" DESC LIMIT 1`:[];
    const myData=myDataRows[0]||null;
    const result=await prisma.$transaction(async tx=>{
      const jobs=[];
      for(const [index,page] of normalizedPages.entries()){
        const existingAttachments=await tx.$queryRaw`SELECT "id" FROM "DocumentAttachment" WHERE "companyId"=${companyId} AND "storeId"=${storeId} AND "checksum"=${page.checksum} LIMIT 1`;
        const attachmentId=existingAttachments[0]?.id||id();
        if(!existingAttachments[0])await tx.$executeRaw`INSERT INTO "DocumentAttachment" ("id","companyId","storeId","documentType","filename","mimeType","storageKey","checksum","contentData") VALUES (${attachmentId},${companyId},${storeId},'AI_READER_SOURCE',${page.filename},${page.mimeType},${`DATABASE:${page.checksum}`},${page.checksum},${page.dataUrl})`;
        const activeSources=await tx.$queryRaw`
          SELECT j."id" FROM "AiReaderJob" j
          WHERE j."companyId"=${companyId} AND j."storeId"=${storeId} AND j."attachmentId"=${attachmentId}
            AND j."status" IN ('AWAITING_APPROVAL','CONFIRMED')
            AND (EXISTS (SELECT 1 FROM "PurchaseDocument" d WHERE d."companyId"=j."companyId" AND d."id"=j."purchaseDocumentId")
              OR EXISTS (SELECT 1 FROM "PurchaseOrder" o WHERE o."companyId"=j."companyId" AND o."sourceDocumentId"=j."purchaseDocumentId")) LIMIT 1`;
        if(activeSources[0])throw Object.assign(new Error("Η ίδια φωτογραφία/PDF ανήκει σε καταχωρισμένο τιμολόγιο. Δεν έγινε νέα πληρωμή ή πίστωση."),{status:409,code:"DUPLICATE_INVOICE_FILE"});
        // Reuse an unfinished shell as well as an unattached job. A retry must
        // resume the same draft and payment, never turn into a duplicate file.
        const existingJobs=await tx.$queryRaw`SELECT "id","status" FROM "AiReaderJob" WHERE "companyId"=${companyId} AND "storeId"=${storeId} AND "attachmentId"=${attachmentId} AND ("purchaseDocumentId" IS NULL OR "status" IN ('POS_DRAFT_READY','POS_PROCESSING','POS_FAILED')) AND "status" NOT IN ('AWAITING_APPROVAL','CONFIRMED') ORDER BY "createdAt" DESC LIMIT 1`;
        const jobId=existingJobs[0]?.id||id();
        const handoff={version:"POS_FAST_HANDOFF_V1",documentType,supplierId,documentNumber,documentDate,totalGross,settlementMode,paymentTransactionId,pageIndex:index,pageCount:normalizedPages.length,myDataInboundId:myData?.id||null,myDataInboxId:myData?.inboxId||null,queuedAt:new Date().toISOString()};
        if(existingJobs[0])await tx.$executeRaw`UPDATE "AiReaderJob" SET "resultJson"=COALESCE("resultJson",'{}'::jsonb)||${JSON.stringify({posHandoff:handoff})}::jsonb,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${jobId} AND "companyId"=${companyId}`;
        else await tx.$executeRaw`INSERT INTO "AiReaderJob" ("id","companyId","storeId","attachmentId","stage","status","localConfidence","resultJson","requestedByUserId") VALUES (${jobId},${companyId},${storeId},${attachmentId},'LOCAL','POS_QUEUED',0,${JSON.stringify({rawText:"",lines:[],pageCount:normalizedPages.length,posHandoff:handoff})}::jsonb,${req.user?.tokenType==="STORE_OPERATOR"?null:req.user.id})`;
        const existingInbox=await tx.$queryRaw`SELECT "id" FROM "DocumentInbox" WHERE "companyId"=${companyId} AND "attachmentId"=${attachmentId} LIMIT 1 FOR UPDATE`;
        const inboxId=existingInbox[0]?.id||id();
        const inboxNote=`Παραλήφθηκε από POS • Τιμολόγιο ${documentNumber} • αναμονή πλήρους ανάγνωσης`;
        if(existingInbox[0])await tx.$executeRaw`UPDATE "DocumentInbox" SET "supplierId"=${supplierId},"status"='IN_REVIEW',"note"=${inboxNote},"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${inboxId} AND "companyId"=${companyId}`;
        else await tx.$executeRaw`INSERT INTO "DocumentInbox" ("id","companyId","storeId","supplierId","attachmentId","status","note","responsibleName","createdByUserId") VALUES (${inboxId},${companyId},${storeId},${supplierId},${attachmentId},'IN_REVIEW',${inboxNote},${req.user.fullName||"Χειριστής"},${req.user?.tokenType==="STORE_OPERATOR"?null:req.user.id})`;
        jobs.push({id:jobId,status:existingJobs[0]?.status||"POS_QUEUED"});
      }
      const pageJobIds=jobs.map(job=>job.id);
      const primaryHandoff={version:"POS_FAST_HANDOFF_V1",documentType,supplierId,documentNumber,documentDate,totalGross,settlementMode,paymentTransactionId,pageIndex:0,pageCount:normalizedPages.length,pageJobIds,primaryJobId:pageJobIds[0],resumeStoredProductLines:hasCompleteCachedProductLines,myDataInboundId:myData?.id||null,myDataInboxId:myData?.inboxId||null,queuedAt:new Date().toISOString()};
      await tx.$executeRaw`UPDATE "AiReaderJob" SET "resultJson"=COALESCE("resultJson",'{}'::jsonb)||${JSON.stringify({posHandoff:primaryHandoff,...(hasCompleteCachedProductLines?{productLines:cachedProductLines}: {})})}::jsonb,"stage"='LOCAL',"status"='POS_QUEUED',"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${pageJobIds[0]} AND "companyId"=${companyId} AND ("purchaseDocumentId" IS NULL OR "status" IN ('LOCAL_COMPLETE','POS_DRAFT_READY','POS_PROCESSING','POS_FAILED'))`;
      if(myData?.inboxId)await tx.$executeRaw`UPDATE "DocumentInbox" SET "supplierId"=${supplierId},"status"='IN_REVIEW',"note"=${`Συνδέθηκε με παραλαβή POS • ${documentNumber} • ${settlementMode==='PAID'?'Πληρωμένο':'Με πίστωση'}${paymentTransactionId?` • Πληρωμή ${paymentTransactionId}`:''}`},"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${myData.inboxId} AND "companyId"=${companyId}`;
      return jobs;
    });
    const pageJobIds=result.map(job=>job.id),jobId=pageJobIds[0];
    const handoff={documentType,supplierId,documentNumber,documentDate,totalGross,settlementMode,paymentTransactionId,pageCount:pageJobIds.length,pageJobIds,primaryJobId:jobId,resumeStoredProductLines:hasCompleteCachedProductLines};
    const publicOrigin=`${req.get("x-forwarded-proto")||req.protocol}://${req.get("host")}`;
    const draft=await internalCommerceRequest(`/ai-reader/jobs/${encodeURIComponent(jobId)}/pos-draft`,{authorization:req.get("authorization"),publicOrigin,method:"POST",body:{documentType,supplierId,documentNumber,documentDate,totalGross,settlementMode,paymentTransactionId,note:`POS πρόχειρο ${documentType==="CREDIT_NOTE"?"πιστωτικό":"τιμολόγιο"} • ${result.length} ${result.length===1?"σελίδα":"σελίδες"} • αναμονή πλήρους ανάγνωσης`}});
    await enqueueFastBackground({companyId,storeId,jobId,publicOrigin});
    const handoffMessage=myData
      ?"Το πληρωμένο τιμολόγιο εμφανίστηκε αμέσως στα Πρόχειρα BackOffice και συνδέθηκε με το υπάρχον myDATA. Η πλήρης ανάγνωση συνεχίζεται χωρίς νέα χρέωση."
      :"Το πληρωμένο τιμολόγιο εμφανίστηκε αμέσως στα Πρόχειρα BackOffice. Θα συνδεθεί αυτόματα όταν εμφανιστεί στο myDATA. Η πλήρης ανάγνωση συνεχίζεται χωρίς νέα χρέωση.";
    res.status(202).json({ok:true,accepted:true,jobId,jobs:result,purchaseDocumentId:draft.documentId,draftReady:true,myDataMatched:Boolean(myData),myDataInboundId:myData?.id||null,myDataInboxId:myData?.inboxId||null,message:handoffMessage});
  }catch(error){next(error)}
});

// A POS handoff is durable in the database. BackOffice refresh reclaims a stale
// worker after a browser/server interruption; it never creates another payment.
router.post("/ai-reader/fast-recover",requireCompanyModule("AI_READER"),async(req,res,next)=>{
  try{
    const storeId=String(req.body?.storeId||"").trim();
    const staleBefore=new Date(Date.now()-60*1000);
    const rows=await prisma.$queryRaw`
      SELECT "id","storeId","status","resultJson","purchaseDocumentId","createdAt"
      FROM "AiReaderJob"
      WHERE "companyId"=${req.user.companyId}
        AND ("status" IN ('LOCAL_COMPLETE','POS_QUEUED','POS_DRAFT_READY','POS_FAILED','AI_COMPLETE') OR ("status"='POS_PROCESSING' AND "updatedAt"<${staleBefore}) OR "status"='AWAITING_APPROVAL')
        AND (${storeId}='' OR "storeId"=${storeId})
      ORDER BY CASE WHEN "status"='AWAITING_APPROVAL' THEN 0 ELSE 1 END,
        CASE WHEN "status"='AWAITING_APPROVAL' THEN "updatedAt" END DESC,
        "updatedAt" ASC LIMIT 50`;
    const recovered=[];let skippedOperatorScope=0,skippedNoHandoff=0,skippedNonRetryable=0;
    for(const job of rows){
      if(recovered.length>=3)break;
      if(req.user?.tokenType==="STORE_OPERATOR"&&String(req.user.storeId)!==String(job.storeId)){skippedOperatorScope++;continue}
      let handoff=job.resultJson?.posHandoff&&typeof job.resultJson.posHandoff==="object"?job.resultJson.posHandoff:null;
      if(handoff&&!Array.isArray(handoff.pageJobIds)&&Number(handoff.pageCount||0)===1){
        handoff={...handoff,pageJobIds:[job.id],primaryJobId:job.id,repairedAt:new Date().toISOString()};
        await prisma.$executeRaw`UPDATE "AiReaderJob" SET "resultJson"=COALESCE("resultJson",'{}'::jsonb)||${JSON.stringify({posHandoff:handoff})}::jsonb,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${job.id} AND "companyId"=${req.user.companyId}`;
      }
      if(!handoff&&job.status==="POS_FAILED")handoff=await rebuildLostFastHandoff(req.user.companyId,job);
      if(!handoff||!Array.isArray(handoff.pageJobIds)||!handoff.pageJobIds.length){skippedNoHandoff++;continue}
      const background=job.resultJson?.posBackground&&typeof job.resultJson.posBackground==="object"?job.resultJson.posBackground:{};
      const reprocess=job.resultJson?.posReprocess&&typeof job.resultJson.posReprocess==="object"?job.resultJson.posReprocess:{};
      const storedBackgroundError=String(background.error||"");
      const linkedSupplierName=job.status==="POS_FAILED"?await linkedDraftSupplierName(req.user.companyId,job):"";
      const completeRecoveryStrategy=completeTableRecoveryStrategy(job,linkedSupplierName);
      const eligibleLegacyDraft=job.status==="AWAITING_APPROVAL"&&background.status==="COMPLETED"&&reprocess.strategy!==POS_REPROCESS_STRATEGY;
      const needsLegacyAmbiguityReread=eligibleLegacyDraft&&(hasMantzilasLegacyAmbiguity(job.resultJson?.productLines)||await hasPersistedMantzilasLegacyAmbiguity(req.user.companyId,job));
      const needsReconciliationReread=job.status==="AWAITING_APPROVAL"&&background.status==="COMPLETED"&&Number(background.reconciliationDifference)>POS_HANDOFF_TOLERANCE&&reprocess.strategy!==POS_REPROCESS_STRATEGY;
      const needsFailedRereadAdvance=job.status==="POS_FAILED"&&Boolean(job.purchaseDocumentId)&&reprocess.strategy!==POS_REPROCESS_STRATEGY&&isSafeInferiorRereadFailure(storedBackgroundError);
      const needsCompleteTableReplayRecovery=job.status==="POS_FAILED"&&Boolean(job.purchaseDocumentId)&&reprocess.strategy!==completeRecoveryStrategy&&isSafeCompleteTableReplayFailure(job,storedBackgroundError,linkedSupplierName);
      const needsDraftReread=needsReconciliationReread||needsLegacyAmbiguityReread||needsFailedRereadAdvance||needsCompleteTableReplayRecovery;
      const hasStoredAiLines=Array.isArray(job.resultJson?.productLines)&&job.resultJson.productLines.length>0;
      if(job.status==="AWAITING_APPROVAL"&&!needsDraftReread)continue;
      if(job.status==="POS_FAILED"&&!needsFailedRereadAdvance&&!needsCompleteTableReplayRecovery&&!isRetryableBackgroundError(storedBackgroundError)){skippedNonRetryable++;continue}
      if(needsDraftReread){
        const marker={mode:"RECONCILIATION_REREAD",strategy:needsCompleteTableReplayRecovery?completeRecoveryStrategy:POS_REPROCESS_STRATEGY,attemptedAt:new Date().toISOString(),reason:needsCompleteTableReplayRecovery?(completeRecoveryStrategy===POS_LEVENTOPOULOS_EMPTY_TABLE_RECOVERY_STRATEGY?"LEVENTOPOULOS_EMPTY_COMPLETE_TABLE":"COMPLETE_TABLE_TRAILING_REPLAY"):needsFailedRereadAdvance?"PREVIOUS_SAFE_INFERIOR_REREAD":needsLegacyAmbiguityReread?"MANTZILAS_LEGACY_AMBIGUITY":null,previousLineCount:Number(background.lineCount||job.resultJson?.productLines?.length||0),previousDifference:Number(background.reconciliationDifference||0)};
        const claimed=await prisma.$executeRaw`UPDATE "AiReaderJob" SET "stage"='POS_REPROCESSING',"status"='POS_REPROCESSING',"resultJson"=COALESCE("resultJson",'{}'::jsonb)||${JSON.stringify({posReprocess:marker})}::jsonb,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${job.id} AND "companyId"=${req.user.companyId} AND "status" IN ('AWAITING_APPROVAL','POS_FAILED')`;
        if(!claimed)continue;
        handoff={...handoff,resumeStoredProductLines:false,replaceExistingDraft:true};
      }else{
        if(reprocess.mode==="RECONCILIATION_REREAD")handoff={...handoff,resumeStoredProductLines:false,replaceExistingDraft:true};
        else if(hasStoredAiLines)handoff={...handoff,resumeStoredProductLines:true};
        const recoveryBackground={status:"RECOVERING",recoveredAt:new Date().toISOString(),previousError:storedBackgroundError||null};
        await prisma.$executeRaw`UPDATE "AiReaderJob" SET "stage"='POS_RECOVERING',"status"='POS_QUEUED',"resultJson"=COALESCE("resultJson",'{}'::jsonb)||${JSON.stringify({posBackground:recoveryBackground})}::jsonb,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${job.id} AND "companyId"=${req.user.companyId} AND "status" IN ('LOCAL_COMPLETE','POS_QUEUED','POS_DRAFT_READY','POS_PROCESSING','POS_FAILED','AI_COMPLETE')`;
      }
      const publicOrigin=`${req.get("x-forwarded-proto")||req.protocol}://${req.get("host")}`;
      await prisma.$executeRaw`UPDATE "AiReaderJob" SET "resultJson"=COALESCE("resultJson",'{}'::jsonb)||${JSON.stringify({posHandoff:handoff})}::jsonb,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${job.id} AND "companyId"=${req.user.companyId} AND "status" NOT IN ('AWAITING_APPROVAL','CONFIRMED')`;
      await enqueueFastBackground({companyId:req.user.companyId,storeId:job.storeId,jobId:job.id,publicOrigin});
      recovered.push(job.id);
    }
    res.status(202).json({ok:true,scanned:rows.length,recovered:recovered.length,jobIds:recovered,skipped:{operatorScope:skippedOperatorScope,noHandoff:skippedNoHandoff,nonRetryable:skippedNonRetryable}});
  }catch(error){next(error)}
});

router.get("/ai-reader/fast-status/:jobId",requireCompanyModule("AI_READER"),async(req,res,next)=>{
  try{
    const rows=await prisma.$queryRaw`SELECT "id","storeId","stage","status","purchaseDocumentId","resultJson","updatedAt" FROM "AiReaderJob" WHERE "id"=${req.params.jobId} AND "companyId"=${req.user.companyId} LIMIT 1`;
    const job=rows[0];
    if(!job)return res.status(404).json({error:"Δεν βρέθηκε η εργασία ανάγνωσης."});
    if(req.user?.tokenType==="STORE_OPERATOR"&&String(req.user.storeId)!==String(job.storeId))return res.status(403).json({error:"Δεν έχεις πρόσβαση σε αυτό το τιμολόγιο."});
    const background=job.resultJson?.posBackground&&typeof job.resultJson.posBackground==="object"?job.resultJson.posBackground:{};
    const handoff=job.resultJson?.posHandoff&&typeof job.resultJson.posHandoff==="object"?job.resultJson.posHandoff:null;
    const hasRecoverableHandoff=handoff&&Array.isArray(handoff.pageJobIds)&&handoff.pageJobIds.length;
    const reprocess=job.resultJson?.posReprocess&&typeof job.resultJson.posReprocess==="object"?job.resultJson.posReprocess:{};
    const storedBackgroundError=String(background.error||"");
    const linkedSupplierName=job.status==="POS_FAILED"?await linkedDraftSupplierName(req.user.companyId,job):"";
    const completeRecoveryStrategy=completeTableRecoveryStrategy(job,linkedSupplierName);
    const retryableFailed=job.status==="POS_FAILED"&&isRetryableBackgroundError(storedBackgroundError);
    const eligibleLegacyDraft=job.status==="AWAITING_APPROVAL"&&background.status==="COMPLETED"&&reprocess.strategy!==POS_REPROCESS_STRATEGY;
    const needsLegacyAmbiguityReread=eligibleLegacyDraft&&(hasMantzilasLegacyAmbiguity(job.resultJson?.productLines)||await hasPersistedMantzilasLegacyAmbiguity(req.user.companyId,job));
    const needsAutomaticReread=job.status==="AWAITING_APPROVAL"&&background.status==="COMPLETED"&&Number(background.reconciliationDifference)>POS_HANDOFF_TOLERANCE&&reprocess.strategy!==POS_REPROCESS_STRATEGY;
    const needsFailedRereadAdvance=job.status==="POS_FAILED"&&Boolean(job.purchaseDocumentId)&&reprocess.strategy!==POS_REPROCESS_STRATEGY&&isSafeInferiorRereadFailure(storedBackgroundError);
    const needsCompleteTableReplayRecovery=job.status==="POS_FAILED"&&Boolean(job.purchaseDocumentId)&&reprocess.strategy!==completeRecoveryStrategy&&isSafeCompleteTableReplayFailure(job,storedBackgroundError,linkedSupplierName);
    const needsDraftReread=needsAutomaticReread||needsLegacyAmbiguityReread||needsFailedRereadAdvance||needsCompleteTableReplayRecovery;
    const staleProcessing=job.status==="POS_PROCESSING"&&new Date(job.updatedAt).getTime()<Date.now()-60*1000;
    let scheduledHandoff=handoff,rereadClaimed=false,retryClaimed=false;
    const hasStoredAiLines=Array.isArray(job.resultJson?.productLines)&&job.resultJson.productLines.length>0;
    const completedAiNeedsHandoff=job.status==="AI_COMPLETE"&&hasStoredAiLines&&background.status!=="COMPLETED";
    if(hasStoredAiLines&&(completedAiNeedsHandoff||staleProcessing))scheduledHandoff={...handoff,resumeStoredProductLines:true};
    let shouldSchedule=hasRecoverableHandoff&&(["POS_QUEUED","POS_DRAFT_READY"].includes(job.status)||staleProcessing||completedAiNeedsHandoff);
    if(hasRecoverableHandoff&&needsDraftReread){
      const marker={mode:"RECONCILIATION_REREAD",strategy:needsCompleteTableReplayRecovery?completeRecoveryStrategy:POS_REPROCESS_STRATEGY,attemptedAt:new Date().toISOString(),reason:needsCompleteTableReplayRecovery?(completeRecoveryStrategy===POS_LEVENTOPOULOS_EMPTY_TABLE_RECOVERY_STRATEGY?"LEVENTOPOULOS_EMPTY_COMPLETE_TABLE":"COMPLETE_TABLE_TRAILING_REPLAY"):needsFailedRereadAdvance?"PREVIOUS_SAFE_INFERIOR_REREAD":needsLegacyAmbiguityReread?"MANTZILAS_LEGACY_AMBIGUITY":null,previousLineCount:Number(background.lineCount||job.resultJson?.productLines?.length||0),previousDifference:Number(background.reconciliationDifference||0),trigger:"POS_STATUS"};
      const claimed=await prisma.$executeRaw`UPDATE "AiReaderJob" SET "stage"='POS_REPROCESSING',"status"='POS_REPROCESSING',"resultJson"=COALESCE("resultJson",'{}'::jsonb)||${JSON.stringify({posReprocess:marker})}::jsonb,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${job.id} AND "companyId"=${req.user.companyId} AND "status" IN ('AWAITING_APPROVAL','POS_FAILED')`;
      rereadClaimed=Boolean(claimed);
      if(rereadClaimed){scheduledHandoff={...handoff,resumeStoredProductLines:false,replaceExistingDraft:true};shouldSchedule=true}
    }
    if(hasRecoverableHandoff&&retryableFailed){
      const recoveryBackground={status:"RECOVERING",recoveredAt:new Date().toISOString(),previousError:String(background.error||"")||null};
      const reclaimed=await prisma.$executeRaw`UPDATE "AiReaderJob" SET "stage"='POS_RECOVERING',"status"='POS_QUEUED',"resultJson"=COALESCE("resultJson",'{}'::jsonb)||${JSON.stringify({posBackground:recoveryBackground})}::jsonb,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${job.id} AND "companyId"=${req.user.companyId} AND "status"='POS_FAILED'`;
      retryClaimed=Boolean(reclaimed);shouldSchedule=retryClaimed;
    }
    if(shouldSchedule){
      const publicOrigin=`${req.get("x-forwarded-proto")||req.protocol}://${req.get("host")}`;
      await prisma.$executeRaw`UPDATE "AiReaderJob" SET "resultJson"=COALESCE("resultJson",'{}'::jsonb)||${JSON.stringify({posHandoff:scheduledHandoff})}::jsonb,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${job.id} AND "companyId"=${req.user.companyId} AND "status" NOT IN ('AWAITING_APPROVAL','CONFIRMED')`;
      await enqueueFastBackground({companyId:req.user.companyId,storeId:job.storeId,jobId:job.id,publicOrigin});
    }
    const lineCount=Number(background.lineCount||job.resultJson?.productLines?.length||0);
    const done=background.status==="COMPLETED"&&job.status==="AWAITING_APPROVAL"&&!rereadClaimed&&lineCount>0;
    res.json({id:job.id,stage:rereadClaimed?"POS_REPROCESSING":retryClaimed?"POS_RECOVERING":job.stage,status:rereadClaimed?"POS_REPROCESSING":retryClaimed?"POS_QUEUED":job.status,draftReady:Boolean(job.purchaseDocumentId),done,failed:job.status==="POS_FAILED"&&!retryClaimed,purchaseDocumentId:job.purchaseDocumentId||null,updatedAt:job.updatedAt,error:retryClaimed?null:background.error||null,archived:background.archived,reconciliationRequired:Boolean(background.reconciliationRequired),reconciliationDifference:Number(background.reconciliationDifference||0),lineCount,pageCount:Number(background.pageCount||handoff?.pageCount||0)});
  }catch(error){next(error)}
});

// The invoice UI labels finalized Azure lines with AZURE_DOCUMENT_INTELLIGENCE,
// while the stable V2.4.4 core expects the legacy V2.4.4 source label. Normalize
// only this transport label; the actual line values remain unchanged.
router.use("/ai-reader/jobs/:jobId/product-lines",(req,res,next)=>{
  if(req.method==="PUT"&&req.body?.source==="AZURE_DOCUMENT_INTELLIGENCE")req.body.source="V2.4.4";
  next();
});

router.post("/ai-reader/jobs/:jobId/pos-intake",async(req,res,next)=>{
  try{
    const jobs=await prisma.$queryRaw`SELECT "resultJson" FROM "AiReaderJob" WHERE "id"=${req.params.jobId} AND "companyId"=${req.user.companyId} LIMIT 1`;
    const result=jobs[0]?.resultJson&&typeof jobs[0].resultJson==="object"?jobs[0].resultJson:{};
    const source=req.body&&typeof req.body==="object"?req.body:{};
    const totalFromRequest=intakeNumber(source.totalGross);
    const totalFromResult=intakeNumber(result.totalGross);
    const documentNumber=String(source.documentNumber||result.documentNumber||"").trim().slice(0,80);
    const documentDate=normalizeIntakeDate(source.documentDate)||normalizeIntakeDate(result.documentDate)||null;
    const supplierId=String(source.supplierId||"").trim();
    const settlementMode=source.settlementMode==="PAID"?"PAID":"CREDIT";
    const note=source.note==null?null:String(source.note).trim().slice(0,500);
    const requestedTotal=totalFromRequest>0?totalFromRequest:totalFromResult;
    req.body={documentType:source.documentType||result.posHandoff?.documentType||"INVOICE",supplierId,documentNumber,documentDate,totalGross:requestedTotal,settlementMode,paymentTransactionId:source.paymentTransactionId||null,note,additionalPageJobIds:Array.isArray(source.additionalPageJobIds)?source.additionalPageJobIds:[],replaceExistingDraft:source.replaceExistingDraft===true};
    const missing=[];
    if(!supplierId)missing.push("Προμηθευτής");
    if(!documentNumber)missing.push("Αρ. τιμολογίου");
    if(!(requestedTotal>0))missing.push("Σύνολο με ΦΠΑ");
    if(missing.length)return res.status(400).json({error:`Λείπουν υποχρεωτικά στοιχεία: ${missing.join(", ")}.`,code:"POS_INTAKE_FIELDS_MISSING",fields:missing});
    const lines=Array.isArray(result.productLines)?result.productLines:[];
    if(!lines.length)return res.status(409).json({error:"Δεν υπάρχουν ασφαλείς structured γραμμές V2.4.4. Η καταχώριση μπλοκαρίστηκε."});

    // Never trust a stale Azure grossAmount when netAmount + canonical VAT are known.
    // The verified discounts are already reflected in netAmount; therefore gross must
    // be rebuilt from that net. This also repairs older jobs already saved in resultJson.
    const reconciliation=reconcileInvoiceLines(lines,requestedTotal);
    const normalizedLines=reconciliation.normalizedLines;
    const correctedGrossLines=reconciliation.correctedLines;
    const structuredGross=reconciliation.grossTotal;
    const structuredNet=reconciliation.netTotal;
    if(!(structuredGross>0))return res.status(409).json({error:"Οι γραμμές V2.4.4 δεν έχουν έγκυρα σύνολα. Απαιτείται επανέλεγχος του τιμολογίου."});
    const diff=round2(Math.abs(structuredGross-requestedTotal));
    // Five euros is the bounded handoff/recovery guard, not permission to tell
    // the operator that mismatched economics are OK.  The POS status follows
    // the same five-cent accounting tolerance shown in BackOffice.
    const reconciliationRequired=diff>POS_STORED_LINES_TOLERANCE;
    if(reconciliationRequired){
      const reviewNote=`⚠️ ΕΛΕΓΧΟΣ BACKOFFICE: σύνολο γραμμών ${structuredGross.toFixed(2)} €, τιμολόγιο ${requestedTotal.toFixed(2)} €, διαφορά ${diff.toFixed(2)} €. Διόρθωσε τις γραμμές πριν από την έγκριση και την ενημέρωση αποθήκης.`;
      req.body.note=[note,reviewNote].filter(Boolean).join(" • ").slice(0,500);
      req.body.reconciliationRequired=true;
      req.body.reconciliationDifference=diff;
    }else{
      req.body.reconciliationRequired=false;
      req.body.reconciliationDifference=0;
    }

    if(correctedGrossLines>0){
      const repaired={...result,productLines:normalizedLines,grossNormalizedAt:new Date().toISOString(),grossNormalization:reconciliation.strategy};
      await prisma.$executeRaw`UPDATE "AiReaderJob" SET "resultJson"=${JSON.stringify(repaired)}::jsonb,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${req.params.jobId} AND "companyId"=${req.user.companyId}`;
    }
    next();
  }catch(error){next(error)}
});

router.use(coreRouter);
export default router;
