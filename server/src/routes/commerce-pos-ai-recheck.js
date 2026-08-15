import crypto from "crypto";
import {Router} from "express";
import {z} from "zod";
import {prisma} from "../prisma.js";
import {requireCompanyModule} from "../middleware/module-access.js";

const router=Router();
const id=()=>crypto.randomUUID();
const THRESHOLD=65;
const cleanTaxId=value=>String(value||"").replace(/\D/g,"");
const norm=value=>String(value||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLocaleUpperCase("el-GR").replace(/[^A-ZΑ-Ω0-9]/g,"");
const decimalText=value=>Math.max(0,Number(value||0)).toFixed(4).replace(".",",");

function outputText(response){
  if(typeof response?.output_text==="string"&&response.output_text.trim())return response.output_text;
  for(const item of response?.output||[])for(const part of item?.content||[])if(part?.type==="output_text"&&part.text)return part.text;
  return "";
}

async function supplierMatch(companyId,candidate={}){
  const taxId=cleanTaxId(candidate.taxId);
  if(taxId){
    const rows=await prisma.$queryRaw`SELECT "id","name","taxId","email","phone","address","city" FROM "Supplier" WHERE "companyId"=${companyId} AND "active"=true AND REGEXP_REPLACE(COALESCE("taxId",''),'\\D','','g')=${taxId} LIMIT 1`;
    if(rows[0])return rows[0];
  }
  const key=norm(candidate.name);
  if(key.length>=4){
    const rows=await prisma.$queryRaw`SELECT "id","name","taxId","email","phone","address","city" FROM "Supplier" WHERE "companyId"=${companyId} AND "active"=true ORDER BY "name"`;
    const exact=rows.find(row=>norm(row.name)===key);
    if(exact)return exact;
    const close=rows.find(row=>{const k=norm(row.name);return key.length>=7&&k.length>=7&&(k.includes(key)||key.includes(k));});
    if(close)return close;
  }
  return null;
}

const invoiceSchema={
  type:"object",additionalProperties:false,
  properties:{
    aiConfidence:{type:"number",minimum:0,maximum:100},
    supplier:{type:"object",additionalProperties:false,properties:{name:{type:"string"},taxId:{type:"string"},email:{type:"string"},phone:{type:"string"},address:{type:"string"},city:{type:"string"}},required:["name","taxId","email","phone","address","city"]},
    documentNumber:{type:"string"},documentDate:{type:"string"},totalGross:{type:"number",minimum:0},rawText:{type:"string"},
    lines:{type:"array",maxItems:1000,items:{type:"object",additionalProperties:false,properties:{text:{type:"string"},confidence:{type:"number",minimum:0,maximum:100}},required:["text","confidence"]}},
    productLines:{type:"array",maxItems:500,items:{type:"object",additionalProperties:false,properties:{
      rawText:{type:"string"},code:{type:"string"},barcode:{type:"string"},description:{type:"string"},quantity:{type:"number",minimum:0},unit:{type:"string"},unitsPerPackage:{type:"number",minimum:0},unitCost:{type:"number",minimum:0},netAmount:{type:"number",minimum:0},vatRate:{type:"number",minimum:0,maximum:100},grossAmount:{type:"number",minimum:0},confidence:{type:"number",minimum:0,maximum:100}
    },required:["rawText","code","barcode","description","quantity","unit","unitsPerPackage","unitCost","netAmount","vatRate","grossAmount","confidence"]}}
  },required:["aiConfidence","supplier","documentNumber","documentDate","totalGross","rawText","lines","productLines"]
};

router.get("/ai-reader/status",requireCompanyModule("AI_READER"),async(req,res,next)=>{
  try{
    const rows=await prisma.$queryRaw`SELECT COUNT(*)::int AS drafts FROM "PurchaseDocument" WHERE "companyId"=${req.user.companyId} AND "sourceType" IN ('OCR_DRAFT','AI_DRAFT','POS_OCR_DRAFT') AND "status"='DRAFT'`;
    const connected=Boolean(process.env.OPENAI_API_KEY);
    res.json({twoStageReader:true,drafts:rows[0]?.drafts||0,localConfidenceThreshold:THRESHOLD,aiAutomatic:true,aiProviderConnected:connected,message:connected?"OCR πρώτο. Κάτω από 65% γίνεται αυτόματος επανέλεγχος AI.":"OCR πρώτο. Για αυτόματο AI κάτω από 65% απαιτείται OPENAI_API_KEY στον server."});
  }catch(error){next(error)}
});

router.post("/ai-reader/jobs/:jobId/ai-recheck",requireCompanyModule("AI_READER"),async(req,res,next)=>{
  try{
    const jobs=await prisma.$queryRaw`
      SELECT j."id",j."storeId",j."status",j."localConfidence",j."resultJson",a."filename",a."mimeType",a."contentData"
      FROM "AiReaderJob" j JOIN "DocumentAttachment" a ON a."id"=j."attachmentId"
      WHERE j."id"=${req.params.jobId} AND j."companyId"=${req.user.companyId} LIMIT 1`;
    const job=jobs[0];
    if(!job)return res.status(404).json({error:"Δεν βρέθηκε η ανάγνωση."});
    if(req.user?.tokenType==="STORE_OPERATOR"&&req.user.storeId!==job.storeId)return res.status(403).json({error:"Δεν έχεις πρόσβαση σε αυτό το τιμολόγιο."});
    if(Number(job.localConfidence||0)>=THRESHOLD&&!req.body?.force)return res.json({id:job.id,status:job.status,aiCalled:false,reason:"OCR_CONFIDENCE_OK",confidence:Number(job.localConfidence||0),result:job.resultJson});
    if(!process.env.OPENAI_API_KEY)return res.status(503).json({error:"Το OCR είναι κάτω από 65%, αλλά δεν έχει συνδεθεί OPENAI_API_KEY στον server.",code:"AI_PROVIDER_NOT_CONFIGURED"});
    if(!job.contentData)return res.status(409).json({error:"Δεν βρέθηκε το αρχικό αρχείο του τιμολογίου για επανέλεγχο AI."});

    const previous=job.resultJson&&typeof job.resultJson==="object"?job.resultJson:{};
    const localRawText=String(previous.rawText||"").slice(0,60000);
    const filePart=job.mimeType==="application/pdf"
      ? {type:"input_file",filename:job.filename||"invoice.pdf",file_data:String(job.contentData).split(",").pop()}
      : {type:"input_image",image_url:job.contentData,detail:"high"};
    const prompt=`Είσαι δεύτερος ελεγκτής OCR για ελληνικά τιμολόγια προμηθευτών. Έχεις το ΠΡΩΤΟΤΥΠΟ παραστατικό ως εικόνα/PDF και από κάτω το πρόχειρο OCR κείμενο. Χρησιμοποίησε και τα δύο, με προτεραιότητα σε ό,τι βλέπεις καθαρά στο πρωτότυπο. Βρες την επωνυμία και το ΑΦΜ του ΕΚΔΟΤΗ/ΠΡΟΜΗΘΕΥΤΗ (όχι του πελάτη), τον αριθμό τιμολογίου/παραστατικού, ημερομηνία και το τελικό πληρωτέο ποσό. documentDate σε YYYY-MM-DD. Μην εφευρίσκεις στοιχεία.

Στο lines επέστρεψε ΟΛΕΣ τις ορατές γραμμές με την ίδια σειρά για audit.

Στο productLines επέστρεψε ΜΟΝΟ τις πραγματικές γραμμές ειδών/προϊόντων του πίνακα του τιμολογίου. ΜΗΝ βάλεις κεφαλίδες, στοιχεία πελάτη/προμηθευτή, ΑΦΜ, ημερομηνίες, IBAN/τράπεζες, υποσύνολα, ΦΠΑ, σύνολα, πληρωτέο, ΕΙΣΠΡΑΞΗ ή λοιπές πληροφοριακές γραμμές. Για κάθε πραγματικό είδος διάβασε από τις αντίστοιχες στήλες: κωδικό είδους, barcode αν υπάρχει, καθαρή περιγραφή, ποσότητα, μονάδα μέτρησης, τεμάχια ανά συσκευασία αν αναγράφονται, καθαρή τιμή μονάδας, καθαρή αξία γραμμής, ποσοστό ΦΠΑ και τελική αξία γραμμής. Μην χρησιμοποιείς αριθμούς που ανήκουν στην περιγραφή/συσκευασία (π.χ. 0,33L, 500ML, 6x330ml) ως τιμή ή ποσότητα. Αν ένα πεδίο δεν διαβάζεται πραγματικά, βάλε 0 ή κενό string αντί να μαντέψεις. Το rawText κάθε productLine να είναι η ορατή γραμμή/γραμμές του συγκεκριμένου είδους. Το aiConfidence και confidence είναι ποσοστά 0-100.

ΠΡΟΧΕΙΡΟ OCR (${Number(job.localConfidence||0)}%):
${localRawText||"(δεν υπήρξε χρήσιμο OCR κείμενο)"}`;
    const apiResponse=await fetch("https://api.openai.com/v1/responses",{method:"POST",headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`,"Content-Type":"application/json"},body:JSON.stringify({model:process.env.OPENAI_INVOICE_MODEL||"gpt-5",input:[{role:"user",content:[{type:"input_text",text:prompt},filePart]}],text:{format:{type:"json_schema",name:"invoice_extract",strict:true,schema:invoiceSchema}}})});
    const payload=await apiResponse.json().catch(()=>({}));
    if(!apiResponse.ok){const error=new Error(payload?.error?.message||`Ο AI επανέλεγχος απέτυχε (${apiResponse.status}).`);error.status=502;throw error;}
    const text=outputText(payload);let parsed;
    try{parsed=JSON.parse(text)}catch{const error=new Error("Ο AI επανέλεγχος δεν επέστρεψε έγκυρα δομημένα στοιχεία.");error.status=502;throw error;}
    const auditLines=Array.isArray(parsed.lines)?parsed.lines.filter(x=>String(x?.text||"").trim()).slice(0,1000):[];
    parsed.productLines=Array.isArray(parsed.productLines)?parsed.productLines.filter(x=>String(x?.description||x?.rawText||"").trim()).slice(0,500):[];
    parsed.auditLines=auditLines.length?auditLines:(Array.isArray(previous.lines)?previous.lines:[]);
    if(parsed.productLines.length){
      parsed.lines=parsed.productLines.map(line=>{
        const code=String(line.code||line.barcode||"").trim();
        const description=String(line.description||line.rawText||"").replace(/\s+/g," ").trim();
        const quantity=Math.max(0,Number(line.quantity||0))||1;
        const unit=String(line.unit||"ΤΜΧ").trim()||"ΤΜΧ";
        const unitCost=Math.max(0,Number(line.unitCost||0));
        return {text:[code,description,`${quantity} ${unit}`,decimalText(unitCost)].filter(Boolean).join(" "),confidence:Math.max(0,Math.min(100,Number(line.confidence||parsed.aiConfidence||0)))};
      });
    }else{
      parsed.lines=[];
    }
    parsed.rawText=parsed.rawText||parsed.auditLines.map(x=>x.text).join("\n")||localRawText;
    const match=await supplierMatch(req.user.companyId,parsed.supplier);
    const aiConfidence=Math.max(0,Math.min(100,Number(parsed.aiConfidence||0)));
    await prisma.$executeRaw`UPDATE "AiReaderJob" SET "stage"='AI',"status"='AI_COMPLETE',"aiConfidence"=${aiConfidence},"resultJson"=${JSON.stringify(parsed)}::jsonb,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${job.id} AND "companyId"=${req.user.companyId}`;
    res.json({id:job.id,status:"AI_COMPLETE",aiCalled:true,confidence:aiConfidence,result:parsed,supplierMatch:match||null,supplierCandidate:parsed.supplier||null,model:process.env.OPENAI_INVOICE_MODEL||"gpt-5"});
  }catch(error){next(error)}
});

router.post("/ai-reader/jobs/:jobId/supplier",requireCompanyModule("AI_READER"),requireCompanyModule("INVENTORY"),async(req,res,next)=>{
  try{
    const body=z.object({name:z.string().trim().min(2).max(180),taxId:z.string().trim().max(30).optional().nullable(),email:z.union([z.string().email(),z.literal("")]).optional().nullable(),phone:z.string().trim().max(40).optional().nullable(),address:z.string().trim().max(250).optional().nullable(),city:z.string().trim().max(120).optional().nullable()}).parse(req.body||{});
    const jobs=await prisma.$queryRaw`SELECT "id","storeId" FROM "AiReaderJob" WHERE "id"=${req.params.jobId} AND "companyId"=${req.user.companyId} LIMIT 1`;
    if(!jobs[0])return res.status(404).json({error:"Δεν βρέθηκε η ανάγνωση."});
    if(req.user?.tokenType==="STORE_OPERATOR"&&req.user.storeId!==jobs[0].storeId)return res.status(403).json({error:"Δεν έχεις πρόσβαση σε αυτό το τιμολόγιο."});
    const existing=await supplierMatch(req.user.companyId,body);
    if(existing)return res.json({created:false,supplier:existing,message:"Ο προμηθευτής υπήρχε ήδη στο BackOffice και συνδέθηκε."});
    const supplierId=id();
    await prisma.$executeRaw`INSERT INTO "Supplier" ("id","companyId","name","taxId","email","phone","address","city","active") VALUES (${supplierId},${req.user.companyId},${body.name},${body.taxId||null},${body.email||null},${body.phone||null},${body.address||null},${body.city||null},true)`;
    res.status(201).json({created:true,supplier:{id:supplierId,name:body.name,taxId:body.taxId||null,email:body.email||null,phone:body.phone||null,address:body.address||null,city:body.city||null},message:"Ο προμηθευτής καταχωρίστηκε στους Προμηθευτές του BackOffice."});
  }catch(error){next(error)}
});

export default router;
