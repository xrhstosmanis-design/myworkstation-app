import crypto from "crypto";
import {Router} from "express";
import {prisma} from "../prisma.js";
import {requireCompanyModule} from "../middleware/module-access.js";
import coreRouter from "./commerce-pos-v244-core.js";
import {callAzure,normalizeAzure,supplierMatch as azureSupplierMatch} from "./commerce-azure-invoice-reader.js";
import {reconcileInvoiceLines} from "../invoice-line-reconciliation.js";

const router=Router();
// The POS must hand the invoice off quickly. Small OCR reconciliation differences
// remain visible for management review in BackOffice and do not block the operator.
const POS_HANDOFF_TOLERANCE=5;
const round2=value=>Math.round((Number(value||0)+Number.EPSILON)*100)/100;
const normalizeDocumentNumber=value=>String(value||"").trim().toLocaleUpperCase("el-GR").replace(/\s+/g,"");
const cleanTaxId=value=>String(value||"").replace(/\D/g,"");
const norm=value=>String(value||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLocaleUpperCase("el-GR").replace(/[^A-ZΑ-Ω0-9]/g,"");
const normalizeIntakeDate=value=>{const text=String(value||"").trim();if(!text)return null;if(/^\d{4}-\d{2}-\d{2}$/.test(text))return text;const m=text.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/);return m?`${m[3]}-${String(m[2]).padStart(2,"0")}-${String(m[1]).padStart(2,"0")}`:null};
const intakeNumber=value=>{const text=String(value??"").trim().replace(/\s/g,"");const normalized=text.includes(",")?text.replace(/\./g,"").replace(",","."):text;const n=Number(normalized.replace(/[^0-9.-]/g,""));return Number.isFinite(n)?n:0};
const id=()=>crypto.randomUUID();

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
    if(process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT&&process.env.AZURE_DOCUMENT_INTELLIGENCE_KEY){
      const parsed=normalizeAzure(await callAzure({contentData:req.body?.dataUrl,mimeType:req.body?.mimeType||"image/jpeg"}));
      const supplier=await azureSupplierMatch(req.user.companyId,parsed.supplier);
      return res.json({confidence:Number(parsed.aiConfidence||0),supplierId:supplier?.id||"",supplierName:supplier?.name||parsed.supplier?.name||"",supplierTaxId:supplier?.taxId||parsed.supplier?.taxId||"",documentNumber:/\d/.test(String(parsed.documentNumber||""))?String(parsed.documentNumber):"",documentDate:/^\d{4}-\d{2}-\d{2}$/.test(String(parsed.documentDate||""))?String(parsed.documentDate):"",totalGross:Number(parsed.totalGross||0),provider:"AZURE_DOCUMENT_INTELLIGENCE"});
    }
    if(!process.env.OPENAI_API_KEY)return res.status(503).json({error:"Δεν έχει συνδεθεί ο AI provider για PREMIUM FAST ανάγνωση.",code:"AI_PROVIDER_NOT_CONFIGURED"});
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
    const aiResponse=await fetch("https://api.openai.com/v1/responses",{method:"POST",headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`,"Content-Type":"application/json"},body:JSON.stringify({
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
    const fileMatch=/^data:(application\/pdf|image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
    const checksum=fileMatch?crypto.createHash("sha256").update(Buffer.from(fileMatch[2],"base64")).digest("hex"):null;
    if(checksum){
      const attachments=await prisma.$queryRaw`
        SELECT a."id",a."filename",i."id" AS "inboxId",j."id" AS "jobId",j."purchaseDocumentId",COALESCE(i."status",j."status",'UPLOADED') AS "status",
          COALESCE(i."receivedAt",j."createdAt",a."createdAt") AS "receivedAt"
        FROM "DocumentAttachment" a
        LEFT JOIN "DocumentInbox" i ON i."attachmentId"=a."id" AND i."companyId"=a."companyId"
        LEFT JOIN "AiReaderJob" j ON j."attachmentId"=a."id" AND j."companyId"=a."companyId"
        WHERE a."companyId"=${companyId} AND a."storeId"=${storeId} AND a."checksum"=${checksum}
        ORDER BY COALESCE(i."receivedAt",j."createdAt",a."createdAt") DESC LIMIT 1`;
      const paymentByFile=await prisma.$queryRaw`
        SELECT t."id",t."occurredAt",t."amount",t."description"
        FROM "StoreTransaction" t
        WHERE t."companyId"=${companyId} AND t."storeId"=${storeId} AND t."supplierId"=${supplierId}
          AND t."type"='SUPPLIER_PAYMENT' AND t."reversedAt" IS NULL AND t."attachmentChecksum"=${checksum}
        ORDER BY t."occurredAt" DESC LIMIT 1`;
      if(attachments[0]?.purchaseDocumentId||attachments[0]?.inboxId)return res.status(409).json({error:"Η ίδια φωτογραφία/PDF τιμολογίου έχει ήδη καταχωριστεί. Δεν έγινε νέα πληρωμή ή πίστωση.",code:"DUPLICATE_INVOICE_FILE",existing:attachments[0]});
      if(attachments[0]?.jobId)return res.json({ok:true,duplicate:false,resumable:true,resumeJobId:attachments[0].jobId,resumeStatus:attachments[0].status,paymentTransactionId:paymentByFile[0]?.id||null,message:"Βρέθηκε η προηγούμενη ανολοκλήρωτη ανάγνωση και θα συνεχιστεί χωρίς νέο upload ή πληρωμή."});
      if(paymentByFile[0])return res.status(409).json({error:"Η πληρωμή αυτού του τιμολογίου υπάρχει ήδη. Δεν έγινε δεύτερη οικονομική κίνηση.",code:"DUPLICATE_INVOICE_PAYMENT",existing:paymentByFile[0]});
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
    if(documentToken){
      const payments=await prisma.$queryRaw`
        SELECT t."id",t."occurredAt",t."amount",t."description"
        FROM "StoreTransaction" t
        WHERE t."companyId"=${companyId} AND t."supplierId"=${supplierId}
          AND t."type"='SUPPLIER_PAYMENT' AND t."reversedAt" IS NULL
          AND POSITION(${documentToken} IN UPPER(REGEXP_REPLACE(COALESCE(t."description",''),'[^A-ZΑ-Ω0-9]','','g'))) > 0
        ORDER BY t."occurredAt" DESC LIMIT 1`;
      if(payments[0])return res.status(409).json({error:`Υπάρχει ήδη πληρωμή για το τιμολόγιο ${String(req.body?.documentNumber||"").trim()}. Δεν έγινε δεύτερη πληρωμή ή πίστωση.`,code:"DUPLICATE_INVOICE_PAYMENT",existing:payments[0]});
    }
    res.json({ok:true,duplicate:false});
  }catch(error){next(error)}
});

// Durable POS handoff: the till may close immediately after this response. Every
// source page and the operator-confirmed header are already stored on the server.
// Full line recognition remains a BackOffice concern and may safely be retried.
router.post("/ai-reader/fast-handoff",requireCompanyModule("AI_READER"),async(req,res,next)=>{
  try{
    const companyId=req.user.companyId,storeId=String(req.body?.storeId||""),supplierId=String(req.body?.supplierId||"");
    const documentNumber=String(req.body?.documentNumber||"").trim().slice(0,80),documentDate=normalizeIntakeDate(req.body?.documentDate);
    const totalGross=round2(intakeNumber(req.body?.totalGross)),settlementMode=req.body?.settlementMode==="PAID"?"PAID":"CREDIT";
    const paymentTransactionId=req.body?.paymentTransactionId?String(req.body.paymentTransactionId).slice(0,180):null;
    const pages=Array.isArray(req.body?.pages)?req.body.pages.slice(0,5):[];
    if(!storeId||!supplierId||!documentNumber||!documentDate||!(totalGross>0)||!pages.length)return res.status(400).json({error:"Λείπουν στοιχεία για την ασφαλή παραλαβή του τιμολογίου."});
    const store=await prisma.store.findFirst({where:{id:storeId,companyId},select:{id:true}});
    if(!store)return res.status(404).json({error:"Δεν βρέθηκε το κατάστημα."});
    if(req.user?.tokenType==="STORE_OPERATOR"&&String(req.user.storeId)!==storeId)return res.status(403).json({error:"Δεν έχεις πρόσβαση σε αυτό το κατάστημα."});
    const supplierRows=await prisma.$queryRaw`SELECT "id","taxId" FROM "Supplier" WHERE "id"=${supplierId} AND "companyId"=${companyId} AND "active"=true LIMIT 1`;
    const supplier=supplierRows[0];if(!supplier)return res.status(404).json({error:"Δεν βρέθηκε ο προμηθευτής."});
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
        const existingJobs=await tx.$queryRaw`SELECT "id","status" FROM "AiReaderJob" WHERE "companyId"=${companyId} AND "storeId"=${storeId} AND "attachmentId"=${attachmentId} ORDER BY "createdAt" DESC LIMIT 1`;
        const jobId=existingJobs[0]?.id||id();
        const handoff={version:"POS_FAST_HANDOFF_V1",supplierId,documentNumber,documentDate,totalGross,settlementMode,paymentTransactionId,pageIndex:index,pageCount:normalizedPages.length,myDataInboundId:myData?.id||null,myDataInboxId:myData?.inboxId||null,queuedAt:new Date().toISOString()};
        if(existingJobs[0])await tx.$executeRaw`UPDATE "AiReaderJob" SET "resultJson"=COALESCE("resultJson",'{}'::jsonb)||${JSON.stringify({posHandoff:handoff})}::jsonb,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${jobId} AND "companyId"=${companyId}`;
        else await tx.$executeRaw`INSERT INTO "AiReaderJob" ("id","companyId","storeId","attachmentId","stage","status","localConfidence","resultJson","requestedByUserId") VALUES (${jobId},${companyId},${storeId},${attachmentId},'LOCAL','POS_QUEUED',0,${JSON.stringify({rawText:"",lines:[],pageCount:normalizedPages.length,posHandoff:handoff})}::jsonb,${req.user?.tokenType==="STORE_OPERATOR"?null:req.user.id})`;
        jobs.push({id:jobId,status:existingJobs[0]?.status||"POS_QUEUED"});
      }
      if(myData?.inboxId)await tx.$executeRaw`UPDATE "DocumentInbox" SET "supplierId"=${supplierId},"status"='IN_REVIEW',"note"=${`Συνδέθηκε με παραλαβή POS • ${documentNumber} • ${settlementMode==='PAID'?'Πληρωμένο':'Με πίστωση'}${paymentTransactionId?` • Πληρωμή ${paymentTransactionId}`:''}`},"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${myData.inboxId} AND "companyId"=${companyId}`;
      return jobs;
    });
    res.status(202).json({ok:true,accepted:true,jobId:result[0].id,jobs:result,myDataMatched:Boolean(myData),myDataInboundId:myData?.id||null,myDataInboxId:myData?.inboxId||null,message:myData?"Το παραστατικό παραλήφθηκε και συνδέθηκε με το υπάρχον myDATA. Η πλήρης ανάγνωση συνεχίζεται στο BackOffice.":"Το παραστατικό παραλήφθηκε ως ασφαλές πρόχειρο. Θα συνδεθεί αυτόματα όταν εμφανιστεί στο myDATA."});
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
    req.body={supplierId,documentNumber,documentDate,totalGross:requestedTotal,settlementMode,paymentTransactionId:source.paymentTransactionId||null,note,additionalPageJobIds:Array.isArray(source.additionalPageJobIds)?source.additionalPageJobIds:[]};
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
