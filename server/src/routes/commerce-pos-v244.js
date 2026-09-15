import crypto from "crypto";
import {Router} from "express";
import {prisma} from "../prisma.js";
import {requireCompanyModule} from "../middleware/module-access.js";
import {assertReusableInvoicePayment,findInvoicePayment} from "../lib/invoice-payment-reuse.js";
import coreRouter,{ensureV244IntakeSchema} from "./commerce-pos-v244-core.js";
import {callAzure,normalizeAzure,supplierMatch as azureSupplierMatch} from "./commerce-azure-invoice-reader.js";
import {reconcileInvoiceLines} from "../invoice-line-reconciliation.js";
import {finalizeV244ProductLines} from "../../../client/src/lib/invoice-v244.js";

const router=Router();
// The POS must hand the invoice off quickly. Small OCR reconciliation differences
// remain visible for management review in BackOffice and do not block the operator.
const POS_HANDOFF_TOLERANCE=5;
const POS_REPROCESS_STRATEGY="PRINTED_REPEAT_AND_STOCK_UNITS_V3";
const round2=value=>Math.round((Number(value||0)+Number.EPSILON)*100)/100;
const normalizeDocumentNumber=value=>String(value||"").trim().toLocaleUpperCase("el-GR").replace(/\s+/g,"");
const cleanTaxId=value=>String(value||"").replace(/\D/g,"");
const norm=value=>String(value||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLocaleUpperCase("el-GR").replace(/[^A-ZΑ-Ω0-9]/g,"");
const normalizeIntakeDate=value=>{const text=String(value||"").trim();if(!text)return null;if(/^\d{4}-\d{2}-\d{2}$/.test(text))return text;const m=text.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/);return m?`${m[3]}-${String(m[2]).padStart(2,"0")}-${String(m[1]).padStart(2,"0")}`:null};
const intakeNumber=value=>{const text=String(value??"").trim().replace(/\s/g,"");const normalized=text.includes(",")?text.replace(/\./g,"").replace(",","."):text;const n=Number(normalized.replace(/[^0-9.-]/g,""));return Number.isFinite(n)?n:0};
const id=()=>crypto.randomUUID();
const fastBackgroundWorkers=new Map();
const fastBackgroundSuccessors=new Map();
// A POS handoff is intentionally fire-and-forget for the operator. Render can
// briefly refuse a loopback/public request while a worker is waking up, so the
// server retries the same durable job before it is ever reported as failed.
const FAST_BACKGROUND_RETRY_DELAYS_MS=[0,3000,12000,30000];
const FAST_AZURE_HEADER_TIMEOUT_MS=40000;
const FAST_OPENAI_HEADER_TIMEOUT_MS=15000;
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const isRetryableBackgroundError=error=>/fetch failed|ECONNRESET|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|AZURE_TIMEOUT|aborted due to timeout|TimeoutError|Η ενιαία ανάγνωση απέτυχε και δεν ανακτήθηκαν με ασφάλεια όλες οι σελίδες|Δεν επιβεβαιώθηκαν όλες οι πρόσθετες σελίδες του τιμολογίου|POS_BACKGROUND_AI_RECHECK:\s*(?:Παρουσιάστηκε εσωτερικό σφάλμα|AI_RECHECK_INTERNAL \[table-recheck\])/i.test(String(error?.message||error));

async function internalCommerceRequest(path,{authorization,method="GET",body,publicOrigin}={}){
  const localOrigin=`http://127.0.0.1:${process.env.PORT||8080}`;
  const origins=[localOrigin,...(publicOrigin&&publicOrigin!==localOrigin?[publicOrigin]:[])];
  let lastError;
  for(const origin of origins)try{
    const response=await fetch(`${origin}/api/commerce${path}`,{method,headers:{Authorization:authorization,"Content-Type":"application/json"},...(body===undefined?{}:{body:JSON.stringify(body)})});
    const text=await response.text();
    let payload={};
    if(text)try{payload=JSON.parse(text)}catch{payload={error:`Μη αναμενόμενη απάντηση server (${response.status}).`}};
    if(!response.ok){const error=new Error(payload?.error||`Σφάλμα server ${response.status}.`);error.status=response.status;throw error;}
    return payload;
  }catch(error){lastError=error}
  throw lastError||new Error("Η εσωτερική ανάγνωση τιμολογίου δεν ξεκίνησε.");
}

async function rebuildLostFastHandoff(companyId,job){
  const storedLines=Array.isArray(job.resultJson?.productLines)?job.resultJson.productLines:[];
  if(!job.purchaseDocumentId||!job.createdAt||!storedLines.length)return null;
  const documents=await prisma.$queryRaw`
    SELECT d."supplierId",d."documentNumber",d."documentDate",d."totalGross",d."settlementMode",d."paymentTransactionId",o."description"
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
  const handoff={version:"POS_FAST_HANDOFF_REBUILT_V1",supplierId:document.supplierId,documentNumber:document.documentNumber,documentDate:document.documentDate,totalGross:Number(document.totalGross||0),settlementMode:document.settlementMode,paymentTransactionId:document.paymentTransactionId||null,pageCount:pageJobIds.length,pageJobIds,primaryJobId:job.id,resumeStoredProductLines:true,rebuiltAt:new Date().toISOString()};
  await prisma.$executeRaw`UPDATE "AiReaderJob" SET "resultJson"=COALESCE("resultJson",'{}'::jsonb)||${JSON.stringify({posHandoff:handoff})}::jsonb,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${job.id} AND "companyId"=${companyId} AND "status"='POS_FAILED'`;
  return handoff;
}

function scheduleFastBackground({authorization,companyId,jobId,pageJobIds,handoff,publicOrigin}){
  if(!authorization||!jobId)return;
  const activeWorker=fastBackgroundWorkers.get(jobId);
  if(activeWorker){
    // Recovery may have moved the durable row back to POS_QUEUED while an
    // older in-memory attempt is still finishing. Always attach a successor;
    // otherwise the queued row can be left without any worker.
    const waiting=fastBackgroundSuccessors.has(jobId);
    fastBackgroundSuccessors.set(jobId,{authorization,companyId,jobId,pageJobIds,handoff,publicOrigin});
    if(!waiting)activeWorker.finally(()=>{const successor=fastBackgroundSuccessors.get(jobId);fastBackgroundSuccessors.delete(jobId);if(successor&&!fastBackgroundWorkers.has(jobId))scheduleFastBackground(successor)});
    return;
  }
  const additionalPageJobIds=pageJobIds.filter(pageJobId=>pageJobId!==jobId);
  const task=(async()=>{
    try{
      await prisma.$executeRaw`UPDATE "AiReaderJob" SET "stage"='POS_BACKGROUND',"status"='POS_PROCESSING',"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${jobId} AND "companyId"=${companyId} AND "status" IN ('LOCAL_COMPLETE','POS_DRAFT_READY','POS_QUEUED','POS_PROCESSING','POS_REPROCESSING')`;
      let created,lastError,operationStage="prepare-lines";
      for(const [attempt,delay] of FAST_BACKGROUND_RETRY_DELAYS_MS.entries()){
        if(delay)await wait(delay);
        try{
          let sourceLines,previousLines=[];
          if(handoff.resumeStoredProductLines){const rows=await prisma.$queryRaw`SELECT "resultJson" FROM "AiReaderJob" WHERE "id"=${jobId} AND "companyId"=${companyId} LIMIT 1`;sourceLines=rows[0]?.resultJson?.productLines;previousLines=Array.isArray(sourceLines)?sourceLines:[]}
          if(handoff.replaceExistingDraft){const rows=await prisma.$queryRaw`SELECT "resultJson" FROM "AiReaderJob" WHERE "id"=${jobId} AND "companyId"=${companyId} LIMIT 1`;previousLines=Array.isArray(rows[0]?.resultJson?.productLines)?rows[0].resultJson.productLines:[];sourceLines=null}
          if(!sourceLines){operationStage="ai-recheck";const ai=await internalCommerceRequest(`/ai-reader/jobs/${encodeURIComponent(jobId)}/ai-recheck`,{authorization,publicOrigin,method:"POST",body:{force:true,additionalPageJobIds}});sourceLines=ai?.result?.productLines}
          const productLines=finalizeV244ProductLines(Array.isArray(sourceLines)?sourceLines:[]);
          if(!productLines.length)throw new Error("Δεν βρέθηκαν ασφαλείς γραμμές προϊόντων στο τιμολόγιο.");
          if(handoff.replaceExistingDraft){
            const before=reconcileInvoiceLines(finalizeV244ProductLines(previousLines),handoff.totalGross);
            const after=reconcileInvoiceLines(productLines,handoff.totalGross);
            const beforeDiff=round2(Math.abs(before.grossTotal-Number(handoff.totalGross||0)));
            const afterDiff=round2(Math.abs(after.grossTotal-Number(handoff.totalGross||0)));
            if(afterDiff>POS_HANDOFF_TOLERANCE&&!(productLines.length>previousLines.length&&afterDiff<beforeDiff))throw new Error(`Η νέα πλήρης ανάγνωση δεν βελτίωσε με ασφάλεια το πρόχειρο (${productLines.length} γραμμές, διαφορά ${afterDiff.toFixed(2)} €). Οι υπάρχουσες γραμμές διατηρήθηκαν.`);
          }
          operationStage="save-product-lines";
          await internalCommerceRequest(`/ai-reader/jobs/${encodeURIComponent(jobId)}/product-lines`,{authorization,publicOrigin,method:"PUT",body:{source:"V2.4.4",productLines}});
          operationStage="purchase-intake";
          created=await internalCommerceRequest(`/ai-reader/jobs/${encodeURIComponent(jobId)}/pos-intake`,{authorization,publicOrigin,method:"POST",body:{
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
          lastError=null;
          break;
        }catch(error){
          const stagedError=new Error(`POS_BACKGROUND_${operationStage.toUpperCase().replace(/-/g,"_")}: ${String(error?.message||error)}`);stagedError.status=error?.status;lastError=stagedError;
          console.warn("POS fast invoice background retry",{jobId,attempt:attempt+1,message:String(error?.message||error)});
          // A missing AI key, unsafe OCR result or payment mismatch will not be
          // repaired by waiting. Only transient transport failures retry.
          if(!isRetryableBackgroundError(error))break;
        }
      }
      if(lastError)throw lastError;
      await prisma.$executeRaw`UPDATE "AiReaderJob" SET "stage"='POS_BACKGROUND_COMPLETE',"resultJson"=COALESCE("resultJson",'{}'::jsonb)||${JSON.stringify({posBackground:{status:"COMPLETED",completedAt:new Date().toISOString(),archived:created?.archived!==false,reconciliationRequired:Boolean(created?.reconciliationRequired),reconciliationDifference:Number(created?.reconciliationDifference||0),lineCount:Number(created?.lineCount||0),pageCount:Number(created?.pageCount||pageJobIds.length)}})}::jsonb,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${jobId} AND "companyId"=${companyId}`;
    }catch(error){
      const message=String(error?.message||error).slice(0,700);
      await prisma.$executeRaw`UPDATE "AiReaderJob" SET "stage"='POS_BACKGROUND_FAILED',"status"='POS_FAILED',"resultJson"=COALESCE("resultJson",'{}'::jsonb)||${JSON.stringify({posBackground:{status:"FAILED",failedAt:new Date().toISOString(),error:message}})}::jsonb,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${jobId} AND "companyId"=${companyId}`;
      console.error("POS fast invoice background failed",{jobId,message});
    }finally{fastBackgroundWorkers.delete(jobId)}
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
}

function outputText(response){
  if(typeof response?.output_text==="string"&&response.output_text.trim())return response.output_text;
  for(const item of response?.output||[])for(const part of item?.content||[])if(part?.type==="output_text"&&part.text)return part.text;
  return "";
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

const fastHeaderSchema={type:"object",additionalProperties:false,properties:{
  confidence:{type:"number",minimum:0,maximum:100},
  supplierName:{type:"string"},
  supplierTaxId:{type:"string"},
  documentNumber:{type:"string"},
  documentDate:{type:"string"},
  totalGross:{type:"number",minimum:0}
},required:["confidence","supplierName","supplierTaxId","documentNumber","documentDate","totalGross"]};

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
    if(process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT&&process.env.AZURE_DOCUMENT_INTELLIGENCE_KEY){
      try{
        const parsed=normalizeAzure(await callAzure({contentData:dataUrl,mimeType,timeoutMs:FAST_AZURE_HEADER_TIMEOUT_MS}));
        const supplier=await azureSupplierMatch(req.user.companyId,parsed.supplier);
        const azureHeader={confidence:Number(parsed.aiConfidence||0),supplierId:supplier?.id||"",supplierName:supplier?.name||parsed.supplier?.name||"",supplierTaxId:supplier?.taxId||parsed.supplier?.taxId||"",documentNumber:/\d/.test(String(parsed.documentNumber||""))?String(parsed.documentNumber):"",documentDate:/^\d{4}-\d{2}-\d{2}$/.test(String(parsed.documentDate||""))?String(parsed.documentDate):"",totalGross:Number(parsed.totalGross||0),provider:"AZURE_DOCUMENT_INTELLIGENCE"};
        const azureHasUsefulHeader=Boolean(azureHeader.supplierId||cleanTaxId(azureHeader.supplierTaxId)||norm(azureHeader.supplierName).length>=4||azureHeader.documentNumber||azureHeader.documentDate||azureHeader.totalGross>0);
        if(azureHasUsefulHeader)return res.json(azureHeader);
        console.warn("FAST Azure header incomplete; trying configured fallback",{confidence:azureHeader.confidence});
        if(!process.env.OPENAI_API_KEY){const wrapped=new Error("Η γρήγορη ανάγνωση Azure δεν επέστρεψε ασφαλή βασικά στοιχεία και δεν υπάρχει διαθέσιμο FAST fallback. Η πληρωμή δεν έγινε.");wrapped.status=502;throw wrapped;}
      }catch(error){
        if(String(error?.message||"").includes("δεν επέστρεψε ασφαλή βασικά στοιχεία"))throw error;
        console.error("FAST Azure header failed; trying configured fallback",{message:String(error?.message||error)});
        if(!process.env.OPENAI_API_KEY){const wrapped=new Error("Η γρήγορη ανάγνωση Azure δεν είναι προσωρινά διαθέσιμη. Η πληρωμή δεν έγινε.");wrapped.status=502;throw wrapped;}
      }
    }
    if(!process.env.OPENAI_API_KEY)return res.status(503).json({error:"Δεν έχει συνδεθεί ο AI provider για PREMIUM FAST ανάγνωση.",code:"AI_PROVIDER_NOT_CONFIGURED"});
    const filePart=isPdf
      ?{type:"input_file",filename,file_data:dataUrl.split(",").pop()}
      :{type:"input_image",image_url:dataUrl,detail:"low"};
    const prompt=`Είσαι FAST ελεγκτής ελληνικού τιμολογίου προμηθευτή για πληρωμή στο POS. Κοίτα ολόκληρο το πρωτότυπο παραστατικό, ιδίως την επάνω περιοχή για στοιχεία εκδότη/παραστατικού και την κάτω περιοχή για τα τελικά σύνολα. ΜΗΝ αναλύσεις προϊόντα και ΜΗΝ επιστρέψεις γραμμές ειδών.

Χρειάζομαι ΜΟΝΟ αυτά τα 5 στοιχεία:
1. supplierName = ο ΕΚΔΟΤΗΣ/ΠΡΟΜΗΘΕΥΤΗΣ του παραστατικού, όχι ο πελάτης/παραλήπτης.
2. supplierTaxId = το ΑΦΜ του εκδότη/προμηθευτή.
3. documentNumber = ο ακριβής αριθμός/σειρά παραστατικού. Μπορεί να εμφανίζεται ως Αρ. Παραστατικού, Αριθμός, ΤΙΜ, ΤΔΑ, Invoice No, Σειρά/Αριθμός. ΠΡΕΠΕΙ να περιέχει τουλάχιστον ένα ψηφίο. Μην βάλεις λέξη κεφαλίδας.
4. documentDate = η ημερομηνία έκδοσης του παραστατικού σε YYYY-MM-DD. Μην χρησιμοποιήσεις σημερινή ημερομηνία αν δεν φαίνεται στο χαρτί.
5. totalGross = το ΤΕΛΙΚΟ ΠΛΗΡΩΤΕΟ ποσό με ΦΠΑ. Ψάξε ενδείξεις όπως ΠΛΗΡΩΤΕΟ, ΓΕΝΙΚΟ ΣΥΝΟΛΟ, ΤΕΛΙΚΟ ΣΥΝΟΛΟ, ΣΥΝΟΛΟ, TOTAL DUE, GRAND TOTAL. Μην χρησιμοποιήσεις καθαρή αξία, αξία ΦΠΑ ή ενδιάμεσο subtotal.

Αν ένα από αυτά δεν φαίνεται καθαρά, επέστρεψε κενό string ή 0. ΜΗΝ εφευρίσκεις στοιχεία. confidence = συνολική βεβαιότητα μόνο για αυτά τα βασικά πεδία.`;
    const aiResponse=await fetch("https://api.openai.com/v1/responses",{method:"POST",headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`,"Content-Type":"application/json"},signal:AbortSignal.timeout(FAST_OPENAI_HEADER_TIMEOUT_MS),body:JSON.stringify({
      model:process.env.OPENAI_INVOICE_FAST_MODEL||process.env.OPENAI_INVOICE_MODEL||"gpt-5-mini",
      input:[{role:"user",content:[{type:"input_text",text:prompt},filePart]}],
      text:{format:{type:"json_schema",name:"invoice_fast_header",strict:true,schema:fastHeaderSchema}}
    })});
    if(!aiResponse.ok){const text=await aiResponse.text();const error=new Error(`PREMIUM FAST AI απέτυχε (${aiResponse.status}). ${text.slice(0,300)}`);error.status=502;throw error;}
    const parsed=JSON.parse(outputText(await aiResponse.json())||"{}");
    const supplier=await matchSupplier(req.user.companyId,{name:parsed.supplierName,taxId:parsed.supplierTaxId});
    const documentNumber=String(parsed.documentNumber||"").trim();
    const documentDate=/^\d{4}-\d{2}-\d{2}$/.test(String(parsed.documentDate||""))?String(parsed.documentDate):"";
    const totalGross=round2(parsed.totalGross||0);
    res.json({
      confidence:Number(parsed.confidence||0),
      supplierId:supplier?.id||"",
      supplierName:supplier?.name||String(parsed.supplierName||""),
      supplierTaxId:supplier?.taxId||String(parsed.supplierTaxId||""),
      documentNumber:/\d/.test(documentNumber)?documentNumber:"",
      documentDate,
      totalGross:totalGross>0?totalGross:0
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
    let settlementMode=req.body?.settlementMode==="PAID"?"PAID":"CREDIT";
    let paymentTransactionId=req.body?.paymentTransactionId?String(req.body.paymentTransactionId).slice(0,180):null;
    const pages=Array.isArray(req.body?.pages)?req.body.pages.slice(0,5):[];
    if(!storeId||!supplierId||!documentNumber||!documentDate||!(totalGross>0)||!pages.length)return res.status(400).json({error:"Λείπουν στοιχεία για την ασφαλή παραλαβή του τιμολογίου."});
    const store=await prisma.store.findFirst({where:{id:storeId,companyId},select:{id:true}});
    if(!store)return res.status(404).json({error:"Δεν βρέθηκε το κατάστημα."});
    if(req.user?.tokenType==="STORE_OPERATOR"&&String(req.user.storeId)!==storeId)return res.status(403).json({error:"Δεν έχεις πρόσβαση σε αυτό το κατάστημα."});
    const supplierRows=await prisma.$queryRaw`SELECT "id","taxId" FROM "Supplier" WHERE "id"=${supplierId} AND "companyId"=${companyId} AND "active"=true LIMIT 1`;
    const supplier=supplierRows[0];if(!supplier)return res.status(404).json({error:"Δεν βρέθηκε ο προμηθευτής."});
    await ensureV244IntakeSchema();
    const existingPayment=await findInvoicePayment(prisma,{companyId,supplierId,supplierTaxId:cleanTaxId(supplier.taxId),documentNumber});
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
      return {filename,mimeType,dataUrl,checksum:crypto.createHash("sha256").update(bytes).digest("hex")};
    });
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
        const handoff={version:"POS_FAST_HANDOFF_V1",supplierId,documentNumber,documentDate,totalGross,settlementMode,paymentTransactionId,pageIndex:index,pageCount:normalizedPages.length,myDataInboundId:myData?.id||null,myDataInboxId:myData?.inboxId||null,queuedAt:new Date().toISOString()};
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
      const primaryHandoff={version:"POS_FAST_HANDOFF_V1",supplierId,documentNumber,documentDate,totalGross,settlementMode,paymentTransactionId,pageIndex:0,pageCount:normalizedPages.length,pageJobIds,primaryJobId:pageJobIds[0],myDataInboundId:myData?.id||null,myDataInboxId:myData?.inboxId||null,queuedAt:new Date().toISOString()};
      await tx.$executeRaw`UPDATE "AiReaderJob" SET "resultJson"=COALESCE("resultJson",'{}'::jsonb)||${JSON.stringify({posHandoff:primaryHandoff})}::jsonb,"stage"='LOCAL',"status"='POS_QUEUED',"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${pageJobIds[0]} AND "companyId"=${companyId} AND ("purchaseDocumentId" IS NULL OR "status" IN ('LOCAL_COMPLETE','POS_DRAFT_READY','POS_PROCESSING','POS_FAILED'))`;
      if(myData?.inboxId)await tx.$executeRaw`UPDATE "DocumentInbox" SET "supplierId"=${supplierId},"status"='IN_REVIEW',"note"=${`Συνδέθηκε με παραλαβή POS • ${documentNumber} • ${settlementMode==='PAID'?'Πληρωμένο':'Με πίστωση'}${paymentTransactionId?` • Πληρωμή ${paymentTransactionId}`:''}`},"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${myData.inboxId} AND "companyId"=${companyId}`;
      return jobs;
    });
    const pageJobIds=result.map(job=>job.id),jobId=pageJobIds[0];
    const handoff={supplierId,documentNumber,documentDate,totalGross,settlementMode,paymentTransactionId};
    const publicOrigin=`${req.get("x-forwarded-proto")||req.protocol}://${req.get("host")}`;
    const draft=await internalCommerceRequest(`/ai-reader/jobs/${encodeURIComponent(jobId)}/pos-draft`,{authorization:req.get("authorization"),publicOrigin,method:"POST",body:{supplierId,documentNumber,documentDate,totalGross,settlementMode,paymentTransactionId,note:`POS πρόχειρο • ${result.length} ${result.length===1?"σελίδα":"σελίδες"} • αναμονή πλήρους ανάγνωσης`}});
    const handoffMessage=myData
      ?"Το πληρωμένο τιμολόγιο εμφανίστηκε αμέσως στα Πρόχειρα BackOffice και συνδέθηκε με το υπάρχον myDATA. Η πλήρης ανάγνωση συνεχίζεται χωρίς νέα χρέωση."
      :"Το πληρωμένο τιμολόγιο εμφανίστηκε αμέσως στα Πρόχειρα BackOffice. Θα συνδεθεί αυτόματα όταν εμφανιστεί στο myDATA. Η πλήρης ανάγνωση συνεχίζεται χωρίς νέα χρέωση.";
    res.status(202).json({ok:true,accepted:true,jobId,jobs:result,purchaseDocumentId:draft.documentId,draftReady:true,myDataMatched:Boolean(myData),myDataInboundId:myData?.id||null,myDataInboxId:myData?.inboxId||null,message:handoffMessage});
    setImmediate(()=>scheduleFastBackground({authorization:req.get("authorization"),companyId,jobId,pageJobIds,handoff,publicOrigin}));
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
        AND ("status" IN ('LOCAL_COMPLETE','POS_QUEUED','POS_DRAFT_READY','POS_FAILED') OR ("status"='POS_PROCESSING' AND "updatedAt"<${staleBefore}) OR "status"='AWAITING_APPROVAL')
        AND (${storeId}='' OR "storeId"=${storeId})
      ORDER BY "updatedAt" ASC LIMIT 50`;
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
      const needsReconciliationReread=job.status==="AWAITING_APPROVAL"&&background.status==="COMPLETED"&&background.reconciliationRequired===true&&reprocess.strategy!==POS_REPROCESS_STRATEGY;
      if(job.status==="AWAITING_APPROVAL"&&!needsReconciliationReread)continue;
      const storedBackgroundError=String(job.resultJson?.posBackground?.error||"");
      if(job.status==="POS_FAILED"&&!isRetryableBackgroundError(storedBackgroundError)){skippedNonRetryable++;continue}
      if(needsReconciliationReread){
        const marker={mode:"RECONCILIATION_REREAD",strategy:POS_REPROCESS_STRATEGY,attemptedAt:new Date().toISOString(),previousLineCount:Number(background.lineCount||job.resultJson?.productLines?.length||0),previousDifference:Number(background.reconciliationDifference||0)};
        const claimed=await prisma.$executeRaw`UPDATE "AiReaderJob" SET "stage"='POS_REPROCESSING',"status"='POS_REPROCESSING',"resultJson"=COALESCE("resultJson",'{}'::jsonb)||${JSON.stringify({posReprocess:marker})}::jsonb,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${job.id} AND "companyId"=${req.user.companyId} AND "status"='AWAITING_APPROVAL'`;
        if(!claimed)continue;
        handoff={...handoff,resumeStoredProductLines:false,replaceExistingDraft:true};
      }else{
        if(reprocess.mode==="RECONCILIATION_REREAD")handoff={...handoff,resumeStoredProductLines:false,replaceExistingDraft:true};
        await prisma.$executeRaw`UPDATE "AiReaderJob" SET "stage"='POS_RECOVERING',"status"='POS_QUEUED',"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${job.id} AND "companyId"=${req.user.companyId} AND "status" IN ('LOCAL_COMPLETE','POS_QUEUED','POS_DRAFT_READY','POS_PROCESSING','POS_FAILED')`;
      }
      const publicOrigin=`${req.get("x-forwarded-proto")||req.protocol}://${req.get("host")}`;
      setImmediate(()=>scheduleFastBackground({authorization:req.get("authorization"),companyId:req.user.companyId,jobId:job.id,pageJobIds:handoff.pageJobIds,handoff,publicOrigin}));
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
    const retryableFailed=job.status==="POS_FAILED"&&isRetryableBackgroundError(background.error);
    const reprocess=job.resultJson?.posReprocess&&typeof job.resultJson.posReprocess==="object"?job.resultJson.posReprocess:{};
    const needsAutomaticReread=job.status==="AWAITING_APPROVAL"&&background.status==="COMPLETED"&&background.reconciliationRequired===true&&reprocess.strategy!==POS_REPROCESS_STRATEGY;
    let scheduledHandoff=handoff,rereadClaimed=false;
    let shouldSchedule=hasRecoverableHandoff&&["POS_QUEUED","POS_DRAFT_READY","POS_PROCESSING"].includes(job.status);
    if(hasRecoverableHandoff&&needsAutomaticReread){
      const marker={mode:"RECONCILIATION_REREAD",strategy:POS_REPROCESS_STRATEGY,attemptedAt:new Date().toISOString(),previousLineCount:Number(background.lineCount||job.resultJson?.productLines?.length||0),previousDifference:Number(background.reconciliationDifference||0),trigger:"POS_STATUS"};
      const claimed=await prisma.$executeRaw`UPDATE "AiReaderJob" SET "stage"='POS_REPROCESSING',"status"='POS_REPROCESSING',"resultJson"=COALESCE("resultJson",'{}'::jsonb)||${JSON.stringify({posReprocess:marker})}::jsonb,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${job.id} AND "companyId"=${req.user.companyId} AND "status"='AWAITING_APPROVAL'`;
      rereadClaimed=Boolean(claimed);
      if(rereadClaimed){scheduledHandoff={...handoff,resumeStoredProductLines:false,replaceExistingDraft:true};shouldSchedule=true}
    }
    if(hasRecoverableHandoff&&retryableFailed){
      const reclaimed=await prisma.$executeRaw`UPDATE "AiReaderJob" SET "stage"='POS_RECOVERING',"status"='POS_QUEUED',"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${job.id} AND "companyId"=${req.user.companyId} AND "status"='POS_FAILED'`;
      shouldSchedule=Boolean(reclaimed);
    }
    if(shouldSchedule){
      const publicOrigin=`${req.get("x-forwarded-proto")||req.protocol}://${req.get("host")}`;
      setImmediate(()=>scheduleFastBackground({authorization:req.get("authorization"),companyId:req.user.companyId,jobId:job.id,pageJobIds:scheduledHandoff.pageJobIds,handoff:scheduledHandoff,publicOrigin}));
    }
    const done=background.status==="COMPLETED"&&job.status==="AWAITING_APPROVAL"&&!rereadClaimed;
    res.json({id:job.id,stage:rereadClaimed?"POS_REPROCESSING":job.stage,status:rereadClaimed?"POS_REPROCESSING":job.status,draftReady:Boolean(job.purchaseDocumentId),done,failed:job.status==="POS_FAILED",purchaseDocumentId:job.purchaseDocumentId||null,updatedAt:job.updatedAt,error:background.error||null,archived:background.archived,reconciliationRequired:Boolean(background.reconciliationRequired),reconciliationDifference:Number(background.reconciliationDifference||0),lineCount:Number(background.lineCount||job.resultJson?.productLines?.length||0),pageCount:Number(background.pageCount||handoff?.pageCount||0)});
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
    req.body={supplierId,documentNumber,documentDate,totalGross:requestedTotal,settlementMode,paymentTransactionId:source.paymentTransactionId||null,note,additionalPageJobIds:Array.isArray(source.additionalPageJobIds)?source.additionalPageJobIds:[],replaceExistingDraft:source.replaceExistingDraft===true};
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
    const reconciliationRequired=diff>POS_HANDOFF_TOLERANCE;
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
