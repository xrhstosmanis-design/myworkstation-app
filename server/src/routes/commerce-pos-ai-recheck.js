import crypto from "crypto";
import {Router} from "express";
import {z} from "zod";
import {prisma} from "../prisma.js";
import {requireCompanyModule} from "../middleware/module-access.js";
import {callAzure,normalizeAzure} from "./commerce-azure-invoice-reader.js";
import {verifyInvoiceDiscounts} from "../lib/invoice-discount-verifier.js";
import {applyCentralSupplierProfile} from "../lib/invoice-supplier-profile-runtime.js";
import {recoverPrintedRetailColumns,sourceOrder} from "../lib/invoice-column-reading.js";

const router=Router();
const FULL_OCR_PROVIDER_TIMEOUT_MS=75000;
const isProviderTimeout=error=>/AZURE_TIMEOUT|TimeoutError|aborted due to timeout/i.test(String(error?.message||error));
const providerErrorText=error=>String(error?.message||error||"UNKNOWN").replace(/\s+/g," ").trim().slice(0,500);
const id=()=>crypto.randomUUID();
const THRESHOLD=65;
const TOTAL_TOLERANCE=0.05;
const STEFANIDIS_TAX_ID="998878583";
const cleanTaxId=value=>String(value||"").replace(/\D/g,"");
const isStefanidisInvoice=parsed=>cleanTaxId(parsed?.supplier?.taxId)===STEFANIDIS_TAX_ID||parsed?.supplierReadingProfile?.ruleKey==="STEFANIDIS_PRINTED_COLUMNS";
const norm=value=>String(value||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLocaleUpperCase("el-GR").replace(/[^A-ZΑ-Ω0-9]/g,"");
const greekLatinFold=value=>norm(value).replace(/[ΑΒΕΖΗΙΚΜΝΟΡΤΥΧ]/g,c=>({Α:"A",Β:"B",Ε:"E",Ζ:"Z",Η:"H",Ι:"I",Κ:"K",Μ:"M",Ν:"N",Ο:"O",Ρ:"P",Τ:"T",Υ:"Y",Χ:"X"}[c]||c));
const validGreekTaxId=value=>{const v=cleanTaxId(value);if(v.length!==9||/^0+$/.test(v))return false;let sum=0;for(let i=0;i<8;i++)sum+=Number(v[i])*2**(8-i);return (sum%11)%10===Number(v[8]);};
const editSimilarity=(a,b)=>{const x=greekLatinFold(a),y=greekLatinFold(b);if(!x||!y)return 0;if(x===y)return 1;const prev=Array.from({length:y.length+1},(_,i)=>i);for(let i=1;i<=x.length;i++){let left=i;for(let j=1;j<=y.length;j++){const next=prev[j];prev[j]=Math.min(prev[j]+1,left+1,prev[j-1]+(x[i-1]===y[j-1]?0:1));left=next;}}return 1-(prev[y.length]/Math.max(x.length,y.length));};
const decimalText=value=>Math.max(0,Number(value||0)).toFixed(4).replace(".",",");
const money2=value=>Math.round((Number(value||0)+Number.EPSILON)*100)/100;

function outputText(response){
  if(typeof response?.output_text==="string"&&response.output_text.trim())return response.output_text;
  for(const item of response?.output||[])for(const part of item?.content||[])if(part?.type==="output_text"&&part.text)return part.text;
  return "";
}

async function supplierMatch(companyId,candidate={}){
  const rawTaxId=cleanTaxId(candidate.taxId),taxId=validGreekTaxId(rawTaxId)?rawTaxId:"";
  if(taxId){
    const rows=await prisma.$queryRaw`SELECT "id","name","taxId","email","phone","address","city" FROM "Supplier" WHERE "companyId"=${companyId} AND "active"=true AND REGEXP_REPLACE(COALESCE("taxId",''),'\\D','','g')=${taxId} LIMIT 1`;
    if(rows[0])return rows[0];
  }
  const key=norm(candidate.name);
  if(key.length>=4){
    const rows=await prisma.$queryRaw`SELECT "id","name","taxId","email","phone","address","city" FROM "Supplier" WHERE "companyId"=${companyId} AND "active"=true ORDER BY "name"`;
    const exact=rows.find(row=>norm(row.name)===key);if(exact)return exact;
    const close=rows.find(row=>{const k=norm(row.name);return key.length>=7&&k.length>=7&&(k.includes(key)||key.includes(k));});if(close)return close;
    const ranked=rows.map(row=>({row,score:editSimilarity(candidate.name,row.name)})).sort((a,b)=>b.score-a.score);
    const best=ranked[0],second=ranked[1];
    // OCR may mix Greek and Latin glyphs; only auto-link when the name is
    // sufficiently close and clearly beats the next supplier.
    if(best&&best.score>=0.76&&(!second||best.score-(second.score||0)>=0.08))return best.row;
  }
  return null;
}

const productLineProperties={
  rawText:{type:"string"},code:{type:"string"},barcode:{type:"string"},description:{type:"string"},quantity:{type:"number",minimum:0},unit:{type:"string"},unitsPerPackage:{type:"number",minimum:0},unitCost:{type:"number",minimum:0},retailPrice:{type:"number",minimum:0},discount1:{type:"number",minimum:0,maximum:100},discount1Amount:{type:"number",minimum:0},discount2:{type:"number",minimum:0,maximum:100},discount2Amount:{type:"number",minimum:0},discount3:{type:"number",minimum:0,maximum:100},discount3Amount:{type:"number",minimum:0},netAmount:{type:"number",minimum:0},vatRate:{type:"number",minimum:0,maximum:100},grossAmount:{type:"number",minimum:0},confidence:{type:"number",minimum:0,maximum:100}
};
const productLineRequired=["rawText","code","barcode","description","quantity","unit","unitsPerPackage","unitCost","retailPrice","discount1","discount1Amount","discount2","discount2Amount","discount3","discount3Amount","netAmount","vatRate","grossAmount","confidence"];
const invoiceSchema={type:"object",additionalProperties:false,properties:{documentType:{type:"string",enum:["INVOICE","CREDIT_NOTE"]},aiConfidence:{type:"number",minimum:0,maximum:100},supplier:{type:"object",additionalProperties:false,properties:{name:{type:"string"},taxId:{type:"string"},email:{type:"string"},phone:{type:"string"},address:{type:"string"},city:{type:"string"}},required:["name","taxId","email","phone","address","city"]},documentNumber:{type:"string"},documentDate:{type:"string"},totalGross:{type:"number",minimum:0},rawText:{type:"string"},lines:{type:"array",maxItems:1000,items:{type:"object",additionalProperties:false,properties:{text:{type:"string"},confidence:{type:"number",minimum:0,maximum:100}},required:["text","confidence"]}},productLines:{type:"array",maxItems:500,items:{type:"object",additionalProperties:false,properties:productLineProperties,required:productLineRequired}}},required:["documentType","aiConfidence","supplier","documentNumber","documentDate","totalGross","rawText","lines","productLines"]};
const productTableSchema={type:"object",additionalProperties:false,properties:{productLines:{type:"array",maxItems:500,items:{type:"object",additionalProperties:false,properties:productLineProperties,required:productLineRequired}}},required:["productLines"]};

const normalizeProductLine=line=>{
  const quantity=Math.max(0,Number(line?.quantity||0));
  const netAmount=Math.max(0,Number(line?.netAmount||0));
  let unitCost=Math.max(0,Number(line?.unitCost||0));if(!unitCost&&quantity>0&&netAmount>0)unitCost=netAmount/quantity;
  const vatRate=Math.max(0,Number(line?.vatRate||0));
  let grossAmount=Math.max(0,Number(line?.grossAmount||0));if(!grossAmount&&netAmount>0)grossAmount=netAmount*(1+vatRate/100);
  return {...line,rawText:String(line?.rawText||""),code:String(line?.code||"").trim(),barcode:String(line?.barcode||"").trim(),description:String(line?.description||"").replace(/^\s*\d{4,10}\s+/,'').replace(/\s+/g,' ').trim(),quantity,unit:String(line?.unit||"").trim(),unitsPerPackage:Math.max(0,Number(line?.unitsPerPackage||0)),unitCost,retailPrice:Math.max(0,Number(line?.retailPrice||0)),discount1:Math.max(0,Number(line?.discount1||0)),discount1Amount:Math.max(0,Number(line?.discount1Amount||0)),discount2:Math.max(0,Number(line?.discount2||0)),discount2Amount:Math.max(0,Number(line?.discount2Amount||0)),discount3:Math.max(0,Number(line?.discount3||0)),discount3Amount:Math.max(0,Number(line?.discount3Amount||0)),netAmount,vatRate,grossAmount,confidence:Math.max(0,Math.min(100,Number(line?.confidence||0)))};
};
const lineGrossTotal=lines=>money2((lines||[]).reduce((sum,line)=>sum+Number(line?.grossAmount||0),0));
const descriptionsClose=(a,b)=>{const x=norm(a),y=norm(b);return Boolean(x&&y&&(x===y||(x.length>=6&&y.length>=6&&(x.includes(y)||y.includes(x)))))};
function mergeRecoveredLines(current,recovered){
  const out=(current||[]).map(line=>({...line})),used=new Set();
  for(const candidate of recovered||[]){
    if(!String(candidate?.description||candidate?.rawText||"").trim())continue;
    const available=(line,index)=>!used.has(index)&&(line.sourceFileIndex===undefined||candidate.sourceFileIndex===undefined||line.sourceFileIndex===candidate.sourceFileIndex)&&(line.sourcePage===undefined||candidate.sourcePage===undefined||line.sourcePage===candidate.sourcePage);
    let index=-1;
    if(candidate.code)index=out.findIndex((line,i)=>available(line,i)&&line.code&&norm(line.code)===norm(candidate.code));
    if(index<0)index=out.findIndex((line,i)=>available(line,i)&&!(line.code&&candidate.code&&norm(line.code)!==norm(candidate.code))&&descriptionsClose(line.description||line.rawText,candidate.description||candidate.rawText));
    if(index<0){used.add(out.length);out.push(normalizeProductLine(candidate));continue}
    used.add(index);
    const line=out[index];
    if(line.sourceColumnsVerified&&!candidate.sourceColumnsVerified)continue;
    out[index]=normalizeProductLine({...line,...(candidate.sourceColumnsVerified?candidate:{}),
      rawText:candidate.rawText||line.rawText,code:candidate.code||line.code,barcode:candidate.barcode||line.barcode,description:candidate.description||line.description,
      quantity:Number(candidate.quantity||0)>0?candidate.quantity:line.quantity,unit:candidate.unit||line.unit,unitsPerPackage:Number(candidate.unitsPerPackage||0)>0?candidate.unitsPerPackage:line.unitsPerPackage,
      unitCost:Number(candidate.unitCost||0)>0?candidate.unitCost:line.unitCost,retailPrice:Number(candidate.retailPrice||0)>0?candidate.retailPrice:line.retailPrice,netAmount:Number(candidate.netAmount||0)>0?candidate.netAmount:line.netAmount,
      discount1:Number(candidate.discount1||0)>0?candidate.discount1:line.discount1,discount1Amount:Number(candidate.discount1Amount||0)>0?candidate.discount1Amount:line.discount1Amount,
      discount2:Number(candidate.discount2||0)>0?candidate.discount2:line.discount2,discount2Amount:Number(candidate.discount2Amount||0)>0?candidate.discount2Amount:line.discount2Amount,
      discount3:Number(candidate.discount3||0)>0?candidate.discount3:line.discount3,discount3Amount:Number(candidate.discount3Amount||0)>0?candidate.discount3Amount:line.discount3Amount,
      vatRate:Number(candidate.vatRate||0)>0?candidate.vatRate:line.vatRate,grossAmount:Number(candidate.grossAmount||0)>0?candidate.grossAmount:line.grossAmount,
      confidence:Math.max(Number(line.confidence||0),Number(candidate.confidence||0))});
    if(candidate.sourceColumnsVerified)out[index]=normalizeProductLine({...out[index],...candidate});
  }
  return out.some(line=>line.sourceColumnsVerified)?out.sort(sourceOrder):out;
}

function mergeAzureInvoicePages(pages){
  const productLines=[],auditLines=[],rawTexts=[],confidenceValues=[];
  let supplier={name:"",taxId:"",email:"",phone:"",address:"",city:""},documentNumber="",documentDate="",totalGross=0,finalTotalPage=0;
  for(const [pageIndex,page] of pages.entries()){
    const result=page&&typeof page==="object"?page:{};
    const candidate=result.supplier&&typeof result.supplier==="object"?result.supplier:{};
    for(const field of ["name","taxId","email","phone","address","city"])if(!supplier[field]&&candidate[field])supplier[field]=String(candidate[field]);
    if(!documentNumber&&result.documentNumber)documentNumber=String(result.documentNumber);
    if(!documentDate&&result.documentDate)documentDate=String(result.documentDate);
    const pageTotal=money2(result.totalGross||0);
    // A later positive page total replaces an earlier carried subtotal. Never sum
    // "Σε/Από μεταφορά" across pages.
    if(pageTotal>0){totalGross=pageTotal;finalTotalPage=pageIndex+1}
    const pageLines=Array.isArray(result.productLines)?result.productLines:[];
    productLines.push(...pageLines.filter(line=>String(line?.description||line?.rawText||"").trim()).map(line=>normalizeProductLine({...line,sourceFileIndex:pageIndex})));
    const visible=Array.isArray(result.lines)?result.lines:[];
    auditLines.push(...visible.filter(line=>String(line?.text||"").trim()).map(line=>({text:String(line.text),confidence:Math.max(0,Math.min(100,Number(line.confidence||result.aiConfidence||0)))})));
    const raw=String(result.rawText||"").trim();if(raw)rawTexts.push(`ΣΕΛΙΔΑ ${pageIndex+1}:\n${raw}`);
    const confidence=Number(result.aiConfidence||0);if(confidence>0)confidenceValues.push(confidence);
  }
  const rawText=rawTexts.join("\n\n");
  return {
    documentType:/ΠΙΣΤΩΤΙΚ|CREDIT\s*NOTE/i.test(rawText)?"CREDIT_NOTE":"INVOICE",
    aiConfidence:confidenceValues.length?Math.round(confidenceValues.reduce((sum,value)=>sum+value,0)/confidenceValues.length*10)/10:0,
    supplier,documentNumber,documentDate,totalGross,rawText,lines:auditLines,productLines,
    azureDocumentIntelligence:true,azureUnifiedFallback:true,azurePageRecoveryCalled:true,
    azurePageRecoveryRecovered:productLines.length,azurePageRecoveryPageCount:pages.length,
    azureFinalTotalPage:finalTotalPage
  };
}


router.get("/ai-reader/status",requireCompanyModule("AI_READER"),async(req,res,next)=>{try{
  const rows=await prisma.$queryRaw`SELECT COUNT(*)::int AS drafts FROM "PurchaseDocument" WHERE "companyId"=${req.user.companyId} AND "sourceType" IN ('OCR_DRAFT','AI_DRAFT','POS_OCR_DRAFT') AND "status"='DRAFT'`;
  const connected=Boolean(process.env.OPENAI_API_KEY);res.json({twoStageReader:true,drafts:rows[0]?.drafts||0,localConfidenceThreshold:THRESHOLD,aiAutomatic:true,aiProviderConnected:connected,message:connected?"OCR πρώτο. Κάτω από 65% γίνεται αυτόματος επανέλεγχος AI.":"OCR πρώτο. Για αυτόματο AI κάτω από 65% απαιτείται OPENAI_API_KEY στον server."});
}catch(error){next(error)}});

router.post("/ai-reader/jobs/:jobId/ai-recheck",requireCompanyModule("AI_READER"),async(req,res,next)=>{try{
  const body=z.object({force:z.boolean().optional(),additionalPageJobIds:z.array(z.string().min(1)).max(4).optional().default([])}).parse(req.body||{});
  const jobs=await prisma.$queryRaw`SELECT j."id",j."storeId",j."status",j."localConfidence",j."resultJson",a."filename",a."mimeType",a."contentData" FROM "AiReaderJob" j JOIN "DocumentAttachment" a ON a."id"=j."attachmentId" WHERE j."id"=${req.params.jobId} AND j."companyId"=${req.user.companyId} LIMIT 1`;
  const job=jobs[0];if(!job)return res.status(404).json({error:"Δεν βρέθηκε η ανάγνωση."});
  if(req.user?.tokenType==="STORE_OPERATOR"&&req.user.storeId!==job.storeId)return res.status(403).json({error:"Δεν έχεις πρόσβαση σε αυτό το τιμολόγιο."});
  if(Number(job.localConfidence||0)>=THRESHOLD&&!body.force&&!body.additionalPageJobIds.length)return res.json({id:job.id,status:job.status,aiCalled:false,reason:"OCR_CONFIDENCE_OK",confidence:Number(job.localConfidence||0),result:job.resultJson});
  if(!process.env.OPENAI_API_KEY)return res.status(503).json({error:"Το OCR είναι κάτω από 65%, αλλά δεν έχει συνδεθεί OPENAI_API_KEY στον server.",code:"AI_PROVIDER_NOT_CONFIGURED"});
  if(!job.contentData)return res.status(409).json({error:"Δεν βρέθηκε το αρχικό αρχείο του τιμολογίου για επανέλεγχο AI."});

  const pageJobs=[job];
  for(const pageJobId of [...new Set(body.additionalPageJobIds)].filter(id=>id!==job.id)){
    const rows=await prisma.$queryRaw`SELECT j."id",j."storeId",j."status",j."localConfidence",j."resultJson",a."filename",a."mimeType",a."contentData" FROM "AiReaderJob" j JOIN "DocumentAttachment" a ON a."id"=j."attachmentId" WHERE j."id"=${pageJobId} AND j."companyId"=${req.user.companyId} LIMIT 1`;
    const pageJob=rows[0];
    if(!pageJob||pageJob.storeId!==job.storeId||!pageJob.contentData)return res.status(409).json({error:"Δεν βρέθηκαν όλες οι σελίδες του ενιαίου τιμολογίου."});
    pageJobs.push(pageJob);
  }
  const previous=job.resultJson&&typeof job.resultJson==="object"?job.resultJson:{};
  const posHandoff=previous.posHandoff&&typeof previous.posHandoff==="object"?previous.posHandoff:null;
  let preferCentralStefanidis=false;
  if(posHandoff?.supplierId){
    const supplierRows=await prisma.$queryRaw`SELECT "taxId" FROM "Supplier" WHERE "id"=${posHandoff.supplierId} AND "companyId"=${req.user.companyId} AND "active"=true LIMIT 1`;
    preferCentralStefanidis=cleanTaxId(supplierRows[0]?.taxId)===STEFANIDIS_TAX_ID;
  }
  const localRawText=pageJobs.map((page,index)=>`ΣΕΛΙΔΑ ${index+1}:\n${String(page.resultJson?.rawText||"").slice(0,12000)}`).join("\n\n").slice(0,60000);
  const fileParts=pageJobs.map((page,index)=>page.mimeType==="application/pdf"?{type:"input_file",filename:page.filename||`invoice-page-${index+1}.pdf`,file_data:String(page.contentData).split(",").pop()}:{type:"input_image",image_url:page.contentData,detail:"high"});
  const prompt=`Είσαι δεύτερος ελεγκτής OCR για ελληνικά τιμολόγια προμηθευτών. Έχεις το ΠΡΩΤΟΤΥΠΟ παραστατικό ως εικόνα/PDF και από κάτω το πρόχειρο OCR κείμενο. Χρησιμοποίησε και τα δύο, με προτεραιότητα στο πρωτότυπο. Αναγνώρισε πρώτα documentType: CREDIT_NOTE μόνο όταν το παραστατικό γράφει καθαρά ΠΙΣΤΩΤΙΚΟ / CREDIT NOTE, διαφορετικά INVOICE. Βρες τον ΕΚΔΟΤΗ/ΠΡΟΜΗΘΕΥΤΗ, ΑΦΜ, αριθμό παραστατικού, ημερομηνία και τελικό ποσό ως θετική απόλυτη αξία. documentDate σε YYYY-MM-DD. Μην εφευρίσκεις στοιχεία.

Οι ${pageJobs.length} πηγές που ακολουθούν είναι διαδοχικές σελίδες του ΙΔΙΟΥ τιμολογίου, με την ακριβή σειρά που δόθηκαν. Αν μία πηγή είναι πολυσέλιδο PDF, κράτησε και την εσωτερική σειρά των σελίδων του. Διάβασε το σύνολο ως ένα ενιαίο παραστατικό και επέστρεψε τις γραμμές πρώτα από τη σελίδα 1, μετά από τη σελίδα 2 κ.ο.κ.

Σε πολυσέλιδο παραστατικό, το ποσό «Σε μεταφορά» ή «Από μεταφορά» είναι μεταφερόμενο ενδιάμεσο σύνολο και ΔΕΝ προστίθεται δεύτερη φορά. Ως totalGross χρησιμοποίησε αποκλειστικά την «ΤΕΛΙΚΗ ΑΞΙΑ» ή το τελικό πληρωτέο ποσό της τελευταίας σελίδας.

Στο lines επέστρεψε ΟΛΕΣ τις ορατές γραμμές για audit. Στο productLines επέστρεψε ΜΟΝΟ ΟΛΕΣ τις πραγματικές γραμμές ειδών του πίνακα, καμία κεφαλίδα/IBAN/σύνολο/footer. Μην παραλείψεις προϊόν επειδή μία αριθμητική στήλη είναι δύσκολη: κράτησε τη γραμμή και βάλε 0 μόνο στο πεδίο που πραγματικά δεν φαίνεται.

Για ΚΑΘΕ προϊόν ακολούθησε την ΙΔΙΑ ΟΡΙΖΟΝΤΙΑ ΣΕΙΡΑ από αριστερά προς τα δεξιά. Χαρτογράφηση: ΛΙΑΝΙΚΗ ΤΙΜΗ=retailPrice, ΠΟΣΟΤΗΤΑ=quantity, Μ.Μ.=unit, ΤΙΜΗ ΜΟΝΑΔΑΣ ΠΡΙΝ ΑΠΟ ΕΚΠΤΩΣΕΙΣ=unitCost, Εκπτ.1/2/3=discount1/2/3, αντίστοιχο ποσό έκπτωσης=discount1Amount/2Amount/3Amount, Καθ Αξία=netAmount, %ΦΠΑ=vatRate. Η retailPrice είναι η τιμή πώλησης και ΔΕΝ είναι η unitCost. Μην αντικαθιστάς την αρχική unitCost με netAmount/quantity όταν φαίνονται εκπτώσεις. Αν δεν υπάρχει ορατή λιανική βάλε retailPrice=0. Αν υπάρχει τελική αξία με ΦΠΑ είναι grossAmount. Αριθμοί συσκευασίας (500ML, 6x330ml κ.λπ.) δεν είναι ποσότητα/τιμή. Αν unitCost δεν φαίνεται και δεν υπάρχουν εκπτώσεις αλλά quantity>0 και netAmount>0, unitCost=netAmount/quantity. Αν grossAmount δεν φαίνεται αλλά netAmount και vatRate υπάρχουν, υπολόγισέ το.

ΠΡΙΝ επιστρέψεις JSON, μέτρησε οπτικά πόσες πραγματικές σειρές προϊόντων υπάρχουν και βεβαιώσου ότι το productLines έχει τον ίδιο αριθμό. Έπειτα σύγκρινε νοητά το άθροισμα των τελικών αξιών γραμμών με το τελικό πληρωτέο ποσό. Αν υπάρχει εμφανής μεγάλη διαφορά, ξανακοίτα τον πίνακα για γραμμή που παρέλειψες πριν απαντήσεις.

ΠΡΟΧΕΙΡΟ OCR (${Number(job.localConfidence||0)}%):\n${localRawText||"(δεν υπήρξε χρήσιμο OCR κείμενο)"}`;
  let parsed=null,unifiedAiFailure=null;
  if(preferCentralStefanidis&&process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT&&process.env.AZURE_DOCUMENT_INTELLIGENCE_KEY){
    try{
      const azurePages=await Promise.all(pageJobs.map(page=>callAzure({contentData:page.contentData,mimeType:page.mimeType,timeoutMs:FULL_OCR_PROVIDER_TIMEOUT_MS}).then(normalizeAzure)));
      parsed=mergeAzureInvoicePages(azurePages);
      parsed.totalGross=money2(posHandoff.totalGross||parsed.totalGross);
      parsed.documentNumber=String(posHandoff.documentNumber||parsed.documentNumber||"");
      parsed.documentDate=String(posHandoff.documentDate||parsed.documentDate||"");
      parsed.stefanidisCentralFastPath=true;
    }catch(error){unifiedAiFailure=error}
  }
  if(!parsed)try{
    const apiResponse=await fetch("https://api.openai.com/v1/responses",{method:"POST",headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`,"Content-Type":"application/json"},signal:AbortSignal.timeout(FULL_OCR_PROVIDER_TIMEOUT_MS),body:JSON.stringify({model:process.env.OPENAI_INVOICE_MODEL||"gpt-5",input:[{role:"user",content:[{type:"input_text",text:prompt},...fileParts]}],text:{format:{type:"json_schema",name:"invoice_extract",strict:true,schema:invoiceSchema}}})});
    const payload=await apiResponse.json().catch(()=>({}));
    if(!apiResponse.ok){const error=new Error(payload?.error?.message||`Ο AI επανέλεγχος απέτυχε (${apiResponse.status}).`);error.status=502;throw error}
    try{parsed=JSON.parse(outputText(payload))}catch{const error=new Error("Ο AI επανέλεγχος δεν επέστρεψε έγκυρα δομημένα στοιχεία.");error.status=502;throw error}
  }catch(error){unifiedAiFailure=error}

  // A transient/invalid unified OpenAI response must not discard a payment or
  // silently process only page 1. Recover every ordered page through Azure,
  // then continue as one invoice. If any page cannot be read, fail closed.
  if(!parsed){
    const azureConfigured=Boolean(process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT&&process.env.AZURE_DOCUMENT_INTELLIGENCE_KEY);
    if(!azureConfigured)throw unifiedAiFailure;
    const azurePages=[];
    for(const [pageIndex,page] of pageJobs.entries()){
      try{azurePages.push(normalizeAzure(await callAzure({contentData:page.contentData,mimeType:page.mimeType,timeoutMs:FULL_OCR_PROVIDER_TIMEOUT_MS})))}
      catch(error){
        if(isProviderTimeout(error))throw error;
        const wrapped=new Error(`FULL_OCR_PROVIDER_FAILURE: OPENAI=${providerErrorText(unifiedAiFailure)}; AZURE_PAGE_${pageIndex+1}=${providerErrorText(error)}`);
        wrapped.status=502;throw wrapped;
      }
    }
    parsed=mergeAzureInvoicePages(azurePages);
    if(!parsed.productLines.length){const error=new Error("Οι σελίδες αναγνώστηκαν, αλλά δεν βρέθηκαν ασφαλείς γραμμές προϊόντων.");error.status=422;throw error}
    parsed.openAiUnifiedFailed=true;
    parsed.openAiUnifiedRecovery="AZURE_ALL_PAGES";
  }
  const auditLines=Array.isArray(parsed.lines)?parsed.lines.filter(x=>String(x?.text||"").trim()).slice(0,1000):[];
  parsed.productLines=Array.isArray(parsed.productLines)?parsed.productLines.filter(x=>String(x?.description||x?.rawText||"").trim()).slice(0,500).map(normalizeProductLine):[];

  parsed=await applyCentralSupplierProfile(parsed);
  // Recover the printed retail / unit / quantity columns from the current
  // source itself when a reader has shifted the numeric columns. This rule is
  // layout-based, applies to every supplier, and never reuses prior invoice
  // quantities or prices.
  const printedDocumentText=[parsed.rawText,localRawText].filter(Boolean).join("\n");
  parsed.productLines=parsed.productLines.map(line=>recoverPrintedRetailColumns(line,printedDocumentText));
  const initialLinesTotal=lineGrossTotal(parsed.productLines),invoiceTotal=money2(parsed.totalGross||0);
  const totalMismatch=invoiceTotal>0&&Math.abs(initialLinesTotal-invoiceTotal)>TOTAL_TOLERANCE+0.000001;
  const allNumericMissing=parsed.productLines.length>0&&parsed.productLines.every(line=>Number(line.quantity||0)<=0&&Number(line.unitCost||0)<=0&&Number(line.netAmount||0)<=0);
  const partialNumericMissing=parsed.productLines.some(line=>Number(line.quantity||0)<=0||Number(line.unitCost||0)<=0||Number(line.netAmount||0)<=0);
  const needsTablePass=!parsed.azureUnifiedFallback&&(parsed.productLines.length===0||allNumericMissing||partialNumericMissing||totalMismatch);
  const inconsistentRows=parsed.productLines.some(line=>!line.sourceColumnsVerified&&Math.abs(Number(line.quantity||0)*Number(line.unitCost||0)*[line.discount1,line.discount2,line.discount3].reduce((f,d)=>f*(1-Number(d||0)/100),1)-Number(line.netAmount||0))>0.05);
  if(needsTablePass||inconsistentRows){
    const anchors=parsed.productLines.map((line,index)=>`${index+1}. ${line.code||""} ${line.description||""}`.trim()).join("\n");
    const tablePrompt=`Είσαι εξειδικευμένος οπτικός ελεγκτής ΠΙΝΑΚΑ ΕΙΔΩΝ τιμολογίου. Κοίτα ΜΟΝΟ τον πίνακα προϊόντων και επέστρεψε ΟΛΕΣ τις πραγματικές σειρές προϊόντων που βλέπεις, όχι μόνο όσες υπάρχουν στα anchors. Αγνόησε κεφαλίδες, στοιχεία εταιρειών, τράπεζες/IBAN, σύνολα και footer.

Ο πρώτος έλεγχος βρήκε προσωρινά:\n${anchors||"(καμία ασφαλής γραμμή)"}

Τελικό πληρωτέο τιμολογίου: ${invoiceTotal.toFixed(2)} €. Άθροισμα grossAmount των προσωρινών γραμμών: ${initialLinesTotal.toFixed(2)} €. ${totalMismatch?`Υπάρχει διαφορά ${Math.abs(invoiceTotal-initialLinesTotal).toFixed(2)} €, άρα αναζήτησε ειδικά γραμμές προϊόντων που παραλείφθηκαν.`:""}

Επέστρεψε ΚΑΘΕ ορατή γραμμή προϊόντος μία φορά. Για κάθε σειρά διάβασε οριζόντια: Κωδικός/Περιγραφή | ΛΙΑΝΙΚΗ ΤΙΜΗ | Μ.Μ. | ΤΜΧ | αρχική Τιμή ΤΜΧ | Αξία | Εκπτ.1/2/3 ποσοστό και ποσό | Καθ Αξία | ΦΠΑ. retailPrice=ΛΙΑΝΙΚΗ ΤΙΜΗ, quantity=ΠΟΣΟΤΗΤΑ (όχι η ένδειξη μονάδας ΤΕΜ/ΤΜΧ), unit=Μ.Μ., unitCost=αρχική Τιμή ΤΜΧ πριν από εκπτώσεις, discount1/2/3=ποσοστά, discount1Amount/2Amount/3Amount=ποσά, netAmount=Καθ Αξία, vatRate=%ΦΠΑ. Μην συγχέεις retailPrice και unitCost και μην αντικαθιστάς την αρχική τιμή με net/qty όταν υπάρχει έκπτωση. Αριθμοί συσκευασίας μέσα στην περιγραφή δεν είναι quantity/unitCost. Μην εφευρίσκεις. Αν ένα πεδίο δεν φαίνεται βάλε 0, αλλά ΜΗΝ παραλείψεις τη γραμμή. Αν netAmount και vatRate υπάρχουν, μπορείς να υπολογίσεις grossAmount.`;
    const tableResponse=await fetch("https://api.openai.com/v1/responses",{method:"POST",headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`,"Content-Type":"application/json"},signal:AbortSignal.timeout(FULL_OCR_PROVIDER_TIMEOUT_MS),body:JSON.stringify({model:process.env.OPENAI_INVOICE_MODEL||"gpt-5",input:[{role:"user",content:[{type:"input_text",text:tablePrompt},...fileParts]}],text:{format:{type:"json_schema",name:"invoice_product_table_extract",strict:true,schema:productTableSchema}}})});
    const tablePayload=await tableResponse.json().catch(()=>({}));
    if(tableResponse.ok){try{
      const tableParsed=JSON.parse(outputText(tablePayload));
      const recovered=Array.isArray(tableParsed.productLines)?tableParsed.productLines.filter(x=>String(x?.description||x?.rawText||"").trim()).slice(0,500).map(normalizeProductLine):[];
      parsed.productLines=mergeRecoveredLines(parsed.productLines,recovered);
      parsed.tableRecheckCalled=true;parsed.tableRecheckRecovered=recovered.length;
    }catch{parsed.tableRecheckCalled=true;parsed.tableRecheckRecovered=0}}
    else{parsed.tableRecheckCalled=true;parsed.tableRecheckRecovered=0}
  }

  // Some supplier layouts are read more reliably by Azure per page. This is
  // a last recovery path only: the unified OpenAI pass and table pass remain
  // primary, and no empty invoice may pass through.
  const hasSafeLine=parsed.productLines.some(line=>String(line?.description||line?.rawText||"").trim()&&Number(line?.quantity||0)>0&&Number(line?.unitCost||0)>0),needsAzureFields=!hasSafeLine||totalMismatch||inconsistentRows||parsed.productLines.some(line=>Number(line?.vatRate||0)<=0);
  if(!parsed.azureUnifiedFallback&&needsAzureFields&&process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT&&process.env.AZURE_DOCUMENT_INTELLIGENCE_KEY){
    const azureRecovered=[];
    for(const [pageIndex,page] of pageJobs.entries()){
      try{
        const azure=normalizeAzure(await callAzure({contentData:page.contentData,mimeType:page.mimeType,timeoutMs:FULL_OCR_PROVIDER_TIMEOUT_MS}));
        azureRecovered.push(...(Array.isArray(azure?.productLines)?azure.productLines:[]).map(line=>normalizeProductLine({...line,sourceFileIndex:pageIndex})));
      }catch{}
    }
    parsed.productLines=mergeRecoveredLines(parsed.productLines,azureRecovered);
    parsed.azurePageRecoveryCalled=true;
    parsed.azurePageRecoveryRecovered=azureRecovered.length;
  }

  parsed=await applyCentralSupplierProfile(parsed);
  // Table/Azure recovery can add rows after the first printed-column pass.
  // Re-apply the centrally learned STEFANIDIS layout to those late rows before
  // totals and discounts are calculated. The equations inside the recovery
  // helper must balance, so values from another invoice are never copied.
  if(isStefanidisInvoice(parsed)){
    parsed.productLines=parsed.productLines.map(line=>recoverPrintedRetailColumns(line,printedDocumentText));
    parsed.stefanidisFinalColumnRecovery=true;
  }
  // Re-read prices and discount pairs against the document and accept them
  // only when the line equation balances. This also repairs cases where the
  // amount of a discount was mistaken for the original unit price.
  const discountDiagnostics={accepted:0,rejectedMath:0};
  for(const [pageIndex,page] of pageJobs.entries()){
    const unresolved=parsed.productLines.filter(line=>{
      const q=Number(line.quantity||0),u=Number(line.unitCost||0),net=Number(line.netAmount||0);
      const hasDiscount=[line.discount1,line.discount2,line.discount3,line.discount1Amount,line.discount2Amount,line.discount3Amount].some(value=>Number(value||0)>0);
      return !line.sourceColumnsVerified&&(pageJobs.length===1||line.sourceFileIndex===pageIndex)&&q>0&&net>0&&(!hasDiscount||Math.abs(q*u-net)>Math.max(0.05,net*0.02));
    });
    if(!unresolved.length)continue;
    try{
      const diagnostics=await verifyInvoiceDiscounts({contentData:page.contentData,mimeType:page.mimeType,filename:page.filename,productLines:unresolved,apiKey:process.env.OPENAI_API_KEY,model:process.env.OPENAI_INVOICE_MODEL||"gpt-5",timeoutMs:FULL_OCR_PROVIDER_TIMEOUT_MS});
      discountDiagnostics.accepted+=Number(diagnostics.accepted||0);
      discountDiagnostics.rejectedMath+=Number(diagnostics.rejectedMath||0);
    }catch{discountDiagnostics.providerFailures=Number(discountDiagnostics.providerFailures||0)+1}
  }
  parsed.discountMathVerification=discountDiagnostics;

  parsed.productLinesGrossBeforeRecovery=initialLinesTotal;
  parsed.productLinesGrossAfterRecovery=lineGrossTotal(parsed.productLines);
  parsed.invoiceTotalForCompleteness=invoiceTotal;
  parsed.productLinesTotalDifference=money2(parsed.productLinesGrossAfterRecovery-invoiceTotal);
  parsed.productLinesComplete=invoiceTotal<=0||Math.abs(parsed.productLinesTotalDifference)<=TOTAL_TOLERANCE+0.000001;
  parsed.auditLines=auditLines.length?auditLines:(Array.isArray(previous.lines)?previous.lines:[]);
  parsed.lines=parsed.productLines.length?parsed.productLines.map(line=>{const description=String(line.description||line.rawText||"").replace(/\s+/g," ").trim(),quantity=Math.max(0,Number(line.quantity||0)),unit=String(line.unit||"ΤΜΧ").trim()||"ΤΜΧ",unitCost=Math.max(0,Number(line.unitCost||0));return {text:[description,quantity>0?`${quantity} ${unit}`:"",unitCost>0?decimalText(unitCost):""].filter(Boolean).join(" "),confidence:Math.max(0,Math.min(100,Number(line.confidence||parsed.aiConfidence||0)))}}):[];
  parsed.rawText=parsed.rawText||parsed.auditLines.map(x=>x.text).join("\n")||localRawText;
  const match=await supplierMatch(req.user.companyId,parsed.supplier),aiConfidence=Math.max(0,Math.min(100,Number(parsed.aiConfidence||0)));
  await prisma.$executeRaw`UPDATE "AiReaderJob" SET "stage"='AI',"status"='AI_COMPLETE',"aiConfidence"=${aiConfidence},"resultJson"=COALESCE("resultJson",'{}'::jsonb)||${JSON.stringify(parsed)}::jsonb,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${job.id} AND "companyId"=${req.user.companyId}`;
  res.json({id:job.id,status:"AI_COMPLETE",aiCalled:true,confidence:aiConfidence,result:parsed,supplierMatch:match||null,supplierCandidate:parsed.supplier||null,model:process.env.OPENAI_INVOICE_MODEL||"gpt-5"});
}catch(error){next(error)}});

router.put("/ai-reader/jobs/:jobId/product-lines",requireCompanyModule("AI_READER"),async(req,res,next)=>{try{
  const reviewLine=z.object({rawText:z.string().max(2000).optional().default(""),code:z.string().trim().max(80).optional().default(""),barcode:z.string().trim().max(80).optional().default(""),description:z.string().trim().min(1).max(500),quantity:z.coerce.number().min(0).max(1000000),unit:z.string().trim().max(40).optional().default("ΤΜΧ"),unitsPerPackage:z.coerce.number().min(0).max(100000).optional().default(0),unitCost:z.coerce.number().min(0).max(10000000),vatRate:z.coerce.number().min(0).max(100),confidence:z.coerce.number().min(0).max(100).optional().default(0)});
  const body=z.object({source:z.enum(["V2.4.4","V2.4.4_USER_REVIEW"]).optional().default("V2.4.4_USER_REVIEW"),productLines:z.array(reviewLine).min(1).max(500)}).parse(req.body||{});
  const jobs=await prisma.$queryRaw`SELECT j."id",j."storeId",j."status",j."purchaseDocumentId",j."resultJson",d."sourceType" AS "documentSourceType",d."status" AS "documentStatus" FROM "AiReaderJob" j LEFT JOIN "PurchaseDocument" d ON d."id"=j."purchaseDocumentId" AND d."companyId"=j."companyId" WHERE j."id"=${req.params.jobId} AND j."companyId"=${req.user.companyId} LIMIT 1`;
  const job=jobs[0];if(!job)return res.status(404).json({error:"Δεν βρέθηκε η ανάγνωση."});if(req.user?.tokenType==="STORE_OPERATOR"&&req.user.storeId!==job.storeId)return res.status(403).json({error:"Δεν έχεις πρόσβαση σε αυτό το τιμολόγιο."});
  const backgroundMayFillLinkedDraft=Boolean(job.purchaseDocumentId&&body.source==="V2.4.4"&&job.status==="AI_COMPLETE"&&job.resultJson?.posHandoff&&job.documentSourceType==="POS_OCR_DRAFT"&&job.documentStatus==="DRAFT");
  if(job.purchaseDocumentId&&!backgroundMayFillLinkedDraft)return res.status(409).json({error:"Το τιμολόγιο έχει ήδη καταχωριστεί για έλεγχο και οι γραμμές δεν μπορούν να αλλάξουν από το POS."});
  const previous=job.resultJson&&typeof job.resultJson==="object"?job.resultJson:{};
  const productLines=body.productLines.map(line=>{const quantity=Math.max(0,Number(line.quantity||0)),unitCost=Math.max(0,Number(line.unitCost||0)),vatRate=Math.max(0,Number(line.vatRate||0)),netAmount=quantity*unitCost,grossAmount=netAmount*(1+vatRate/100);return {rawText:String(line.rawText||line.description),code:String(line.code||""),barcode:String(line.barcode||""),description:String(line.description||"").trim(),quantity,unit:String(line.unit||"ΤΜΧ"),unitsPerPackage:Math.max(0,Number(line.unitsPerPackage||0)),unitCost,netAmount,vatRate,grossAmount,confidence:Math.max(0,Math.min(100,Number(line.confidence||0)))}});
  const resultJson={...previous,productLines,lines:productLines.map(line=>({text:[line.description,line.quantity>0?`${line.quantity} ${line.unit}`:"",line.unitCost>0?decimalText(line.unitCost):""].filter(Boolean).join(" "),confidence:line.confidence})),reviewedAt:new Date().toISOString(),reviewedByUserId:req.user.id,v244Finalized:true,v244FinalizedAt:new Date().toISOString(),v244Source:backgroundMayFillLinkedDraft?"POS_BACKGROUND_V2.4.4":"POS_INVOICE_REVIEW"};
  await prisma.$executeRaw`UPDATE "AiReaderJob" SET "resultJson"=${JSON.stringify(resultJson)}::jsonb,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${job.id} AND "companyId"=${req.user.companyId}`;
  res.json({ok:true,id:job.id,productLines,message:"Οι γραμμές τιμολογίου αποθηκεύτηκαν για την τελική καταχώριση."});
}catch(error){next(error)}});

router.post("/ai-reader/jobs/:jobId/supplier",requireCompanyModule("AI_READER"),requireCompanyModule("INVENTORY"),async(req,res,next)=>{try{
  const body=z.object({name:z.string().trim().min(2).max(180),taxId:z.string().trim().max(30).optional().nullable(),email:z.union([z.string().email(),z.literal("")]).optional().nullable(),phone:z.string().trim().max(40).optional().nullable(),address:z.string().trim().max(250).optional().nullable(),city:z.string().trim().max(120).optional().nullable()}).parse(req.body||{});
  const jobs=await prisma.$queryRaw`SELECT "id","storeId" FROM "AiReaderJob" WHERE "id"=${req.params.jobId} AND "companyId"=${req.user.companyId} LIMIT 1`;
  if(!jobs[0])return res.status(404).json({error:"Δεν βρέθηκε η ανάγνωση."});if(req.user?.tokenType==="STORE_OPERATOR"&&req.user.storeId!==jobs[0].storeId)return res.status(403).json({error:"Δεν έχεις πρόσβαση σε αυτό το τιμολόγιο."});
  const existing=await supplierMatch(req.user.companyId,body);if(existing)return res.json({created:false,supplier:existing,message:"Ο προμηθευτής υπήρχε ήδη στο BackOffice και συνδέθηκε."});
  const supplierId=id();await prisma.$executeRaw`INSERT INTO "Supplier" ("id","companyId","name","taxId","email","phone","address","city","active") VALUES (${supplierId},${req.user.companyId},${body.name},${body.taxId||null},${body.email||null},${body.phone||null},${body.address||null},${body.city||null},true)`;
  res.status(201).json({created:true,supplier:{id:supplierId,name:body.name,taxId:body.taxId||null,email:body.email||null,phone:body.phone||null,address:body.address||null,city:body.city||null},message:"Ο προμηθευτής καταχωρίστηκε στους Προμηθευτές του BackOffice."});
}catch(error){next(error)}});

export default router;
