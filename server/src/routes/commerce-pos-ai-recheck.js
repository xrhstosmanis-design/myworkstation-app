import crypto from "crypto";
import {Router} from "express";
import {z} from "zod";
import {prisma} from "../prisma.js";
import {requireCompanyModule} from "../middleware/module-access.js";
import {callAzure,normalizeAzure} from "./commerce-azure-invoice-reader.js";

const router=Router();
const id=()=>crypto.randomUUID();
const THRESHOLD=65;
const TOTAL_TOLERANCE=0.05;
const cleanTaxId=value=>String(value||"").replace(/\D/g,"");
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
  rawText:{type:"string"},code:{type:"string"},barcode:{type:"string"},description:{type:"string"},quantity:{type:"number",minimum:0},unit:{type:"string"},unitsPerPackage:{type:"number",minimum:0},unitCost:{type:"number",minimum:0},netAmount:{type:"number",minimum:0},vatRate:{type:"number",minimum:0,maximum:100},grossAmount:{type:"number",minimum:0},confidence:{type:"number",minimum:0,maximum:100}
};
const productLineRequired=["rawText","code","barcode","description","quantity","unit","unitsPerPackage","unitCost","netAmount","vatRate","grossAmount","confidence"];
const invoiceSchema={type:"object",additionalProperties:false,properties:{aiConfidence:{type:"number",minimum:0,maximum:100},supplier:{type:"object",additionalProperties:false,properties:{name:{type:"string"},taxId:{type:"string"},email:{type:"string"},phone:{type:"string"},address:{type:"string"},city:{type:"string"}},required:["name","taxId","email","phone","address","city"]},documentNumber:{type:"string"},documentDate:{type:"string"},totalGross:{type:"number",minimum:0},rawText:{type:"string"},lines:{type:"array",maxItems:1000,items:{type:"object",additionalProperties:false,properties:{text:{type:"string"},confidence:{type:"number",minimum:0,maximum:100}},required:["text","confidence"]}},productLines:{type:"array",maxItems:500,items:{type:"object",additionalProperties:false,properties:productLineProperties,required:productLineRequired}}},required:["aiConfidence","supplier","documentNumber","documentDate","totalGross","rawText","lines","productLines"]};
const productTableSchema={type:"object",additionalProperties:false,properties:{productLines:{type:"array",maxItems:500,items:{type:"object",additionalProperties:false,properties:productLineProperties,required:productLineRequired}}},required:["productLines"]};

const normalizeProductLine=line=>{
  const quantity=Math.max(0,Number(line?.quantity||0));
  const netAmount=Math.max(0,Number(line?.netAmount||0));
  let unitCost=Math.max(0,Number(line?.unitCost||0));if(!unitCost&&quantity>0&&netAmount>0)unitCost=netAmount/quantity;
  const vatRate=Math.max(0,Number(line?.vatRate||0));
  let grossAmount=Math.max(0,Number(line?.grossAmount||0));if(!grossAmount&&netAmount>0)grossAmount=netAmount*(1+vatRate/100);
  return {...line,rawText:String(line?.rawText||""),code:String(line?.code||"").trim(),barcode:String(line?.barcode||"").trim(),description:String(line?.description||"").replace(/^\s*\d{4,10}\s+/,'').replace(/\s+/g,' ').trim(),quantity,unit:String(line?.unit||"").trim(),unitsPerPackage:Math.max(0,Number(line?.unitsPerPackage||0)),unitCost,netAmount,vatRate,grossAmount,confidence:Math.max(0,Math.min(100,Number(line?.confidence||0)))};
};
const lineGrossTotal=lines=>money2((lines||[]).reduce((sum,line)=>sum+Number(line?.grossAmount||0),0));
const descriptionsClose=(a,b)=>{const x=norm(a),y=norm(b);return Boolean(x&&y&&(x===y||(x.length>=6&&y.length>=6&&(x.includes(y)||y.includes(x)))))};
function mergeRecoveredLines(current,recovered){
  const out=(current||[]).map(line=>({...line}));
  for(const candidate of recovered||[]){
    if(!String(candidate?.description||candidate?.rawText||"").trim())continue;
    let index=-1;
    if(candidate.code)index=out.findIndex(line=>line.code&&norm(line.code)===norm(candidate.code));
    if(index<0)index=out.findIndex(line=>descriptionsClose(line.description||line.rawText,candidate.description||candidate.rawText));
    if(index<0){out.push(normalizeProductLine(candidate));continue}
    const line=out[index];
    out[index]=normalizeProductLine({...line,
      rawText:candidate.rawText||line.rawText,code:candidate.code||line.code,barcode:candidate.barcode||line.barcode,description:candidate.description||line.description,
      quantity:Number(candidate.quantity||0)>0?candidate.quantity:line.quantity,unit:candidate.unit||line.unit,unitsPerPackage:Number(candidate.unitsPerPackage||0)>0?candidate.unitsPerPackage:line.unitsPerPackage,
      unitCost:Number(candidate.unitCost||0)>0?candidate.unitCost:line.unitCost,netAmount:Number(candidate.netAmount||0)>0?candidate.netAmount:line.netAmount,
      vatRate:Number(candidate.vatRate||0)>0?candidate.vatRate:line.vatRate,grossAmount:Number(candidate.grossAmount||0)>0?candidate.grossAmount:line.grossAmount,
      confidence:Math.max(Number(line.confidence||0),Number(candidate.confidence||0))});
  }
  return out;
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
  const localRawText=pageJobs.map((page,index)=>`ΣΕΛΙΔΑ ${index+1}:\n${String(page.resultJson?.rawText||"").slice(0,12000)}`).join("\n\n").slice(0,60000);
  const fileParts=pageJobs.map((page,index)=>page.mimeType==="application/pdf"?{type:"input_file",filename:page.filename||`invoice-page-${index+1}.pdf`,file_data:String(page.contentData).split(",").pop()}:{type:"input_image",image_url:page.contentData,detail:"high"});
  const prompt=`Είσαι δεύτερος ελεγκτής OCR για ελληνικά τιμολόγια προμηθευτών. Έχεις το ΠΡΩΤΟΤΥΠΟ παραστατικό ως εικόνα/PDF και από κάτω το πρόχειρο OCR κείμενο. Χρησιμοποίησε και τα δύο, με προτεραιότητα στο πρωτότυπο. Βρες τον ΕΚΔΟΤΗ/ΠΡΟΜΗΘΕΥΤΗ, ΑΦΜ, αριθμό παραστατικού, ημερομηνία και τελικό πληρωτέο ποσό. documentDate σε YYYY-MM-DD. Μην εφευρίσκεις στοιχεία.

Οι ${pageJobs.length} πηγές που ακολουθούν είναι διαδοχικές σελίδες του ΙΔΙΟΥ τιμολογίου, με την ακριβή σειρά που δόθηκαν. Αν μία πηγή είναι πολυσέλιδο PDF, κράτησε και την εσωτερική σειρά των σελίδων του. Διάβασε το σύνολο ως ένα ενιαίο παραστατικό και επέστρεψε τις γραμμές πρώτα από τη σελίδα 1, μετά από τη σελίδα 2 κ.ο.κ.

Στο lines επέστρεψε ΟΛΕΣ τις ορατές γραμμές για audit. Στο productLines επέστρεψε ΜΟΝΟ ΟΛΕΣ τις πραγματικές γραμμές ειδών του πίνακα, καμία κεφαλίδα/IBAN/σύνολο/footer. Μην παραλείψεις προϊόν επειδή μία αριθμητική στήλη είναι δύσκολη: κράτησε τη γραμμή και βάλε 0 μόνο στο πεδίο που πραγματικά δεν φαίνεται.

Για ΚΑΘΕ προϊόν ακολούθησε την ΙΔΙΑ ΟΡΙΖΟΝΤΙΑ ΣΕΙΡΑ από αριστερά προς τα δεξιά. Χαρτογράφηση: ΤΜΧ=quantity, Μ.Μ.=unit, Τιμή ΤΜΧ=unitCost, Καθ Αξία=netAmount, %ΦΠΑ=vatRate. Αν υπάρχει τελική αξία με ΦΠΑ είναι grossAmount. Αριθμοί συσκευασίας (500ML, 6x330ml κ.λπ.) δεν είναι ποσότητα/τιμή. Αν unitCost δεν φαίνεται αλλά quantity>0 και netAmount>0, unitCost=netAmount/quantity. Αν grossAmount δεν φαίνεται αλλά netAmount και vatRate υπάρχουν, υπολόγισέ το.

ΠΡΙΝ επιστρέψεις JSON, μέτρησε οπτικά πόσες πραγματικές σειρές προϊόντων υπάρχουν και βεβαιώσου ότι το productLines έχει τον ίδιο αριθμό. Έπειτα σύγκρινε νοητά το άθροισμα των τελικών αξιών γραμμών με το τελικό πληρωτέο ποσό. Αν υπάρχει εμφανής μεγάλη διαφορά, ξανακοίτα τον πίνακα για γραμμή που παρέλειψες πριν απαντήσεις.

ΠΡΟΧΕΙΡΟ OCR (${Number(job.localConfidence||0)}%):\n${localRawText||"(δεν υπήρξε χρήσιμο OCR κείμενο)"}`;
  const apiResponse=await fetch("https://api.openai.com/v1/responses",{method:"POST",headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`,"Content-Type":"application/json"},body:JSON.stringify({model:process.env.OPENAI_INVOICE_MODEL||"gpt-5",input:[{role:"user",content:[{type:"input_text",text:prompt},...fileParts]}],text:{format:{type:"json_schema",name:"invoice_extract",strict:true,schema:invoiceSchema}}})});
  const payload=await apiResponse.json().catch(()=>({}));if(!apiResponse.ok){const error=new Error(payload?.error?.message||`Ο AI επανέλεγχος απέτυχε (${apiResponse.status}).`);error.status=502;throw error}
  let parsed;try{parsed=JSON.parse(outputText(payload))}catch{const error=new Error("Ο AI επανέλεγχος δεν επέστρεψε έγκυρα δομημένα στοιχεία.");error.status=502;throw error}
  const auditLines=Array.isArray(parsed.lines)?parsed.lines.filter(x=>String(x?.text||"").trim()).slice(0,1000):[];
  parsed.productLines=Array.isArray(parsed.productLines)?parsed.productLines.filter(x=>String(x?.description||x?.rawText||"").trim()).slice(0,500).map(normalizeProductLine):[];

  const initialLinesTotal=lineGrossTotal(parsed.productLines),invoiceTotal=money2(parsed.totalGross||0);
  const totalMismatch=invoiceTotal>0&&Math.abs(initialLinesTotal-invoiceTotal)>TOTAL_TOLERANCE+0.000001;
  const allNumericMissing=parsed.productLines.length>0&&parsed.productLines.every(line=>Number(line.quantity||0)<=0&&Number(line.unitCost||0)<=0&&Number(line.netAmount||0)<=0);
  const partialNumericMissing=parsed.productLines.some(line=>Number(line.quantity||0)<=0||Number(line.unitCost||0)<=0||Number(line.netAmount||0)<=0);
  const needsTablePass=parsed.productLines.length===0||allNumericMissing||partialNumericMissing||totalMismatch;
  if(needsTablePass){
    const anchors=parsed.productLines.map((line,index)=>`${index+1}. ${line.code||""} ${line.description||""}`.trim()).join("\n");
    const tablePrompt=`Είσαι εξειδικευμένος οπτικός ελεγκτής ΠΙΝΑΚΑ ΕΙΔΩΝ τιμολογίου. Κοίτα ΜΟΝΟ τον πίνακα προϊόντων και επέστρεψε ΟΛΕΣ τις πραγματικές σειρές προϊόντων που βλέπεις, όχι μόνο όσες υπάρχουν στα anchors. Αγνόησε κεφαλίδες, στοιχεία εταιρειών, τράπεζες/IBAN, σύνολα και footer.

Ο πρώτος έλεγχος βρήκε προσωρινά:\n${anchors||"(καμία ασφαλής γραμμή)"}

Τελικό πληρωτέο τιμολογίου: ${invoiceTotal.toFixed(2)} €. Άθροισμα grossAmount των προσωρινών γραμμών: ${initialLinesTotal.toFixed(2)} €. ${totalMismatch?`Υπάρχει διαφορά ${Math.abs(invoiceTotal-initialLinesTotal).toFixed(2)} €, άρα αναζήτησε ειδικά γραμμές προϊόντων που παραλείφθηκαν.`:""}

Επέστρεψε ΚΑΘΕ ορατή γραμμή προϊόντος μία φορά. Για κάθε σειρά διάβασε οριζόντια: Κωδικός/Περιγραφή | Μ.Μ. | ΤΜΧ | Τιμή ΤΜΧ | Αξία | Εκπτώσεις | Καθ Αξία | ΦΠΑ. quantity=ΤΜΧ, unit=Μ.Μ., unitCost=Τιμή ΤΜΧ, netAmount=Καθ Αξία, vatRate=%ΦΠΑ. Αριθμοί συσκευασίας μέσα στην περιγραφή δεν είναι quantity/unitCost. Μην εφευρίσκεις. Αν ένα πεδίο δεν φαίνεται βάλε 0, αλλά ΜΗΝ παραλείψεις τη γραμμή. Αν quantity>0 και netAmount>0 αλλά unitCost δεν φαίνεται, unitCost=netAmount/quantity. Αν netAmount και vatRate υπάρχουν, μπορείς να υπολογίσεις grossAmount.`;
    const tableResponse=await fetch("https://api.openai.com/v1/responses",{method:"POST",headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`,"Content-Type":"application/json"},body:JSON.stringify({model:process.env.OPENAI_INVOICE_MODEL||"gpt-5",input:[{role:"user",content:[{type:"input_text",text:tablePrompt},...fileParts]}],text:{format:{type:"json_schema",name:"invoice_product_table_extract",strict:true,schema:productTableSchema}}})});
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
  const hasSafeLine=parsed.productLines.some(line=>String(line?.description||line?.rawText||"").trim()&&Number(line?.quantity||0)>0&&Number(line?.unitCost||0)>0);
  if(!hasSafeLine&&process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT&&process.env.AZURE_DOCUMENT_INTELLIGENCE_KEY){
    const azureRecovered=[];
    for(const page of pageJobs){
      try{
        const azure=normalizeAzure(await callAzure({contentData:page.contentData,mimeType:page.mimeType}));
        azureRecovered.push(...(Array.isArray(azure?.productLines)?azure.productLines:[]).map(normalizeProductLine));
      }catch{}
    }
    parsed.productLines=mergeRecoveredLines(parsed.productLines,azureRecovered);
    parsed.azurePageRecoveryCalled=true;
    parsed.azurePageRecoveryRecovered=azureRecovered.length;
  }

  parsed.productLinesGrossBeforeRecovery=initialLinesTotal;
  parsed.productLinesGrossAfterRecovery=lineGrossTotal(parsed.productLines);
  parsed.invoiceTotalForCompleteness=invoiceTotal;
  parsed.productLinesTotalDifference=money2(parsed.productLinesGrossAfterRecovery-invoiceTotal);
  parsed.productLinesComplete=invoiceTotal<=0||Math.abs(parsed.productLinesTotalDifference)<=TOTAL_TOLERANCE+0.000001;
  parsed.auditLines=auditLines.length?auditLines:(Array.isArray(previous.lines)?previous.lines:[]);
  parsed.lines=parsed.productLines.length?parsed.productLines.map(line=>{const description=String(line.description||line.rawText||"").replace(/\s+/g," ").trim(),quantity=Math.max(0,Number(line.quantity||0)),unit=String(line.unit||"ΤΜΧ").trim()||"ΤΜΧ",unitCost=Math.max(0,Number(line.unitCost||0));return {text:[description,quantity>0?`${quantity} ${unit}`:"",unitCost>0?decimalText(unitCost):""].filter(Boolean).join(" "),confidence:Math.max(0,Math.min(100,Number(line.confidence||parsed.aiConfidence||0)))}}):[];
  parsed.rawText=parsed.rawText||parsed.auditLines.map(x=>x.text).join("\n")||localRawText;
  const match=await supplierMatch(req.user.companyId,parsed.supplier),aiConfidence=Math.max(0,Math.min(100,Number(parsed.aiConfidence||0)));
  await prisma.$executeRaw`UPDATE "AiReaderJob" SET "stage"='AI',"status"='AI_COMPLETE',"aiConfidence"=${aiConfidence},"resultJson"=${JSON.stringify(parsed)}::jsonb,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${job.id} AND "companyId"=${req.user.companyId}`;
  res.json({id:job.id,status:"AI_COMPLETE",aiCalled:true,confidence:aiConfidence,result:parsed,supplierMatch:match||null,supplierCandidate:parsed.supplier||null,model:process.env.OPENAI_INVOICE_MODEL||"gpt-5"});
}catch(error){next(error)}});

router.put("/ai-reader/jobs/:jobId/product-lines",requireCompanyModule("AI_READER"),async(req,res,next)=>{try{
  const reviewLine=z.object({rawText:z.string().max(2000).optional().default(""),code:z.string().trim().max(80).optional().default(""),barcode:z.string().trim().max(80).optional().default(""),description:z.string().trim().min(1).max(500),quantity:z.coerce.number().min(0).max(1000000),unit:z.string().trim().max(40).optional().default("ΤΜΧ"),unitsPerPackage:z.coerce.number().min(0).max(100000).optional().default(0),unitCost:z.coerce.number().min(0).max(10000000),vatRate:z.coerce.number().min(0).max(100),confidence:z.coerce.number().min(0).max(100).optional().default(0)});
  const body=z.object({productLines:z.array(reviewLine).min(1).max(500)}).parse(req.body||{});
  const jobs=await prisma.$queryRaw`SELECT "id","storeId","status","purchaseDocumentId","resultJson" FROM "AiReaderJob" WHERE "id"=${req.params.jobId} AND "companyId"=${req.user.companyId} LIMIT 1`;
  const job=jobs[0];if(!job)return res.status(404).json({error:"Δεν βρέθηκε η ανάγνωση."});if(req.user?.tokenType==="STORE_OPERATOR"&&req.user.storeId!==job.storeId)return res.status(403).json({error:"Δεν έχεις πρόσβαση σε αυτό το τιμολόγιο."});if(job.purchaseDocumentId)return res.status(409).json({error:"Το τιμολόγιο έχει ήδη καταχωριστεί για έλεγχο και οι γραμμές δεν μπορούν να αλλάξουν από το POS."});
  const previous=job.resultJson&&typeof job.resultJson==="object"?job.resultJson:{};
  const productLines=body.productLines.map(line=>{const quantity=Math.max(0,Number(line.quantity||0)),unitCost=Math.max(0,Number(line.unitCost||0)),vatRate=Math.max(0,Number(line.vatRate||0)),netAmount=quantity*unitCost,grossAmount=netAmount*(1+vatRate/100);return {rawText:String(line.rawText||line.description),code:String(line.code||""),barcode:String(line.barcode||""),description:String(line.description||"").trim(),quantity,unit:String(line.unit||"ΤΜΧ"),unitsPerPackage:Math.max(0,Number(line.unitsPerPackage||0)),unitCost,netAmount,vatRate,grossAmount,confidence:Math.max(0,Math.min(100,Number(line.confidence||0)))}});
  const resultJson={...previous,productLines,lines:productLines.map(line=>({text:[line.description,line.quantity>0?`${line.quantity} ${line.unit}`:"",line.unitCost>0?decimalText(line.unitCost):""].filter(Boolean).join(" "),confidence:line.confidence})),reviewedAt:new Date().toISOString(),reviewedByUserId:req.user.id,v244Finalized:true,v244FinalizedAt:new Date().toISOString(),v244Source:"POS_INVOICE_REVIEW"};
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
