import crypto from "crypto";
import {Router} from "express";
import {z} from "zod";
import {prisma} from "../prisma.js";
import {requireCompanyModule} from "../middleware/module-access.js";
import {callAzure,normalizeAzure} from "./commerce-azure-invoice-reader.js";
import {verifyInvoiceDiscounts} from "../lib/invoice-discount-verifier.js";
import {applyCentralSupplierProfile} from "../lib/invoice-supplier-profile-runtime.js";
import {applyMantzilasPackaging,recoverMantzilasEconomics,recoverMixedVatFromPrintedSummary,recoverPrintedRetailColumns,recoverVatFromPrintedSummary,sourceOrder} from "../lib/invoice-column-reading.js";

const router=Router();
// Full-table vision regularly needs longer than the small FAST-header read.
// Azure F0 can also reject immediately when its monthly quota is exhausted, so
// leave the independent OpenAI fallback enough time to finish the original
// image instead of converting a healthy fallback into POS_FAILED at 30 seconds.
// The caller remains bounded and the operator-facing handoff is fire-and-forget.
const FULL_OCR_PROVIDER_TIMEOUT_MS=70000;
const CENTRAL_AZURE_PAGE_TIMEOUT_MS=25000;
// Full invoice tables need a vision model tuned for bounded interactive work.
// Do not inherit the general reasoning model: LAB proved that it can exceed the
// provider budget on a clear 16-row page while the FAST vision path succeeds.
const FULL_OCR_MODEL=process.env.OPENAI_INVOICE_FULL_MODEL||process.env.OPENAI_INVOICE_FAST_MODEL||"gpt-5-mini";
const readAzurePagesSequentially=async pageJobs=>{
  const pages=[];
  for(const page of pageJobs)pages.push(normalizeAzure(await callAzure({contentData:page.contentData,mimeType:page.mimeType,timeoutMs:CENTRAL_AZURE_PAGE_TIMEOUT_MS})));
  return pages;
};
const isProviderTimeout=error=>/AZURE_TIMEOUT|TimeoutError|aborted due to timeout/i.test(String(error?.message||error));
const providerErrorText=error=>String(error?.message||error||"UNKNOWN").replace(/\s+/g," ").trim().slice(0,500);
const id=()=>crypto.randomUUID();
const THRESHOLD=65;
const TOTAL_TOLERANCE=0.05;
const STEFANIDIS_TAX_ID="998878583";
const MANTZILAS_TAX_ID="081565488";
const cleanTaxId=value=>String(value||"").replace(/\D/g,"");
const isStefanidisInvoice=parsed=>cleanTaxId(parsed?.supplier?.taxId)===STEFANIDIS_TAX_ID||parsed?.supplierReadingProfile?.ruleKey==="STEFANIDIS_PRINTED_COLUMNS";
const isMantzilasInvoice=parsed=>cleanTaxId(parsed?.supplier?.taxId)===MANTZILAS_TAX_ID||/ΜΑΝΤΖΙΛΑΣ|MANTZILAS/.test(norm(parsed?.supplier?.name));
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
  rawText:{type:"string"},code:{type:"string"},barcode:{type:"string"},description:{type:"string"},quantity:{type:"number",minimum:0},unit:{type:"string"},unitsPerPackage:{type:"number",minimum:0},unitCost:{type:"number",minimum:0},retailPrice:{type:"number",minimum:0},discount1:{type:"number",minimum:0,maximum:100},discount1Amount:{type:"number",minimum:0},discount2:{type:"number",minimum:0,maximum:100},discount2Amount:{type:"number",minimum:0},discount3:{type:"number",minimum:0,maximum:100},discount3Amount:{type:"number",minimum:0},netAmount:{type:"number",minimum:0},exciseTotal:{type:"number",minimum:0},vatRate:{type:"number",minimum:0,maximum:100},grossAmount:{type:"number",minimum:0},confidence:{type:"number",minimum:0,maximum:100}
};
const productLineRequired=["rawText","code","barcode","description","quantity","unit","unitsPerPackage","unitCost","retailPrice","discount1","discount1Amount","discount2","discount2Amount","discount3","discount3Amount","netAmount","exciseTotal","vatRate","grossAmount","confidence"];
const vatSummaryItem={type:"object",additionalProperties:false,properties:{rate:{type:"number",enum:[0,6,13,24]},taxable:{type:"number",minimum:0},vat:{type:"number",minimum:0},gross:{type:"number",minimum:0}},required:["rate","taxable","vat","gross"]};
// The POS provider response must not repeat the full invoice three times as
// rawText, audit lines and structured productLines. The structured rows remain
// authoritative; compact audit text is rebuilt locally from their rawText.
const invoiceSchema={type:"object",additionalProperties:false,properties:{documentType:{type:"string",enum:["INVOICE","CREDIT_NOTE"]},aiConfidence:{type:"number",minimum:0,maximum:100},supplier:{type:"object",additionalProperties:false,properties:{name:{type:"string"},taxId:{type:"string"}},required:["name","taxId"]},documentNumber:{type:"string"},documentDate:{type:"string"},totalGross:{type:"number",minimum:0},vatSummary:{type:"array",maxItems:4,items:vatSummaryItem},productLines:{type:"array",maxItems:500,items:{type:"object",additionalProperties:false,properties:productLineProperties,required:productLineRequired}}},required:["documentType","aiConfidence","supplier","documentNumber","documentDate","totalGross","vatSummary","productLines"]};
const productTableSchema={type:"object",additionalProperties:false,properties:{vatSummary:{type:"array",maxItems:4,items:vatSummaryItem},productLines:{type:"array",maxItems:500,items:{type:"object",additionalProperties:false,properties:productLineProperties,required:productLineRequired}}},required:["vatSummary","productLines"]};
const vatSummaryText=summary=>(Array.isArray(summary)?summary:[]).map(row=>`${Number(row?.rate||0)}% ${money2(row?.taxable||0).toFixed(2)} ${money2(row?.vat||0).toFixed(2)} ${money2(row?.gross||0).toFixed(2)}`).join("\n");

const normalizeProductLine=line=>{
  const quantity=Math.max(0,Number(line?.quantity||0));
  const netAmount=Math.max(0,Number(line?.netAmount||0));
  let unitCost=Math.max(0,Number(line?.unitCost||0));if(!unitCost&&quantity>0&&netAmount>0)unitCost=netAmount/quantity;
  const vatRate=Math.max(0,Number(line?.vatRate||0));
  const exciseTotal=Math.max(0,Number(line?.exciseTotal||0));
  let grossAmount=Math.max(0,Number(line?.grossAmount||0));if(!grossAmount&&netAmount>0)grossAmount=(netAmount+exciseTotal)*(1+vatRate/100);
  return {...line,rawText:String(line?.rawText||""),code:String(line?.code||"").trim(),barcode:String(line?.barcode||"").trim(),description:String(line?.description||"").replace(/^\s*\d{4,10}\s+/,'').replace(/\s+/g,' ').trim(),quantity,unit:String(line?.unit||"").trim(),unitsPerPackage:Math.max(0,Number(line?.unitsPerPackage||0)),unitCost,retailPrice:Math.max(0,Number(line?.retailPrice||0)),discount1:Math.max(0,Number(line?.discount1||0)),discount1Amount:Math.max(0,Number(line?.discount1Amount||0)),discount2:Math.max(0,Number(line?.discount2||0)),discount2Amount:Math.max(0,Number(line?.discount2Amount||0)),discount3:Math.max(0,Number(line?.discount3||0)),discount3Amount:Math.max(0,Number(line?.discount3Amount||0)),netAmount,exciseTotal,vatRate,grossAmount,confidence:Math.max(0,Math.min(100,Number(line?.confidence||0)))};
};
const lineGrossTotal=lines=>money2((lines||[]).reduce((sum,line)=>sum+Number(line?.grossAmount||0),0));
const physicalRowFingerprint=line=>[
  norm(line?.code),norm(line?.description||line?.rawText),Number(line?.quantity||0).toFixed(4),
  Number(line?.unitCost||0).toFixed(4),Number(line?.netAmount||0).toFixed(2),
  Number(line?.vatRate||0).toFixed(2),Number(line?.grossAmount||0).toFixed(2),
  Number(line?.discount1||0).toFixed(2),Number(line?.discount2||0).toFixed(2),Number(line?.discount3||0).toFixed(2)
].join("|");
function collapseAdjacentTableReplay(lines,invoiceTotal){
  const source=Array.isArray(lines)?lines:[],total=money2(invoiceTotal||0);
  if(total<=0||source.length<4||source.length%2!==0)return {lines:source,collapsed:false};
  const collapsed=[];
  for(let index=0;index<source.length;index+=2){
    if(physicalRowFingerprint(source[index])!==physicalRowFingerprint(source[index+1]))return {lines:source,collapsed:false};
    collapsed.push(source[index]);
  }
  const fullDifference=Math.abs(lineGrossTotal(source)-total),collapsedDifference=Math.abs(lineGrossTotal(collapsed)-total);
  // A complete OCR replay may contain one genuinely repeated charge. Keep the
  // second physical occurrence only when exactly one collapsed row closes the
  // remaining invoice-total difference.
  const missingFromSingleCopy=money2(total-lineGrossTotal(collapsed));
  if(missingFromSingleCopy>TOTAL_TOLERANCE){
    const genuine=collapsed.filter(line=>Math.abs(Number(line.grossAmount||0)-missingFromSingleCopy)<=TOTAL_TOLERANCE);
    if(genuine.length===1){
      const keepFingerprint=physicalRowFingerprint(genuine[0]),mixed=[];
      for(let index=0;index<source.length;index+=2){mixed.push(source[index]);if(physicalRowFingerprint(source[index])===keepFingerprint)mixed.push(source[index+1])}
      if(Math.abs(lineGrossTotal(mixed)-total)<=TOTAL_TOLERANCE)return {lines:mixed,collapsed:true,removed:source.length-mixed.length,genuineRepeatedRowPreserved:true};
    }
  }
  const permittedDifference=Math.max(TOTAL_TOLERANCE,total*0.02);
  if(collapsedDifference>permittedDifference||collapsedDifference>=fullDifference*0.25)return {lines:source,collapsed:false};
  return {lines:collapsed,collapsed:true,removed:source.length-collapsed.length};
}
function collapseExactDuplicateOverage(lines,invoiceTotal){
  const source=Array.isArray(lines)?lines:[],total=money2(invoiceTotal||0);
  const overage=money2(lineGrossTotal(source)-total);
  if(total<=0||source.length<2||overage<=TOTAL_TOLERANCE)return {lines:source,collapsed:false};
  const groups=new Map();
  source.forEach((line,index)=>{
    const fingerprint=physicalRowFingerprint(line),indexes=groups.get(fingerprint)||[];
    indexes.push(index);groups.set(fingerprint,indexes);
  });
  const candidates=[];
  for(const indexes of groups.values()){
    if(indexes.length!==2)continue;
    const gross=money2(source[indexes[0]]?.grossAmount||0);
    if(gross>0&&Math.abs(gross-overage)<=TOTAL_TOLERANCE)candidates.push(indexes[1]);
  }
  // The printed invoice total is an independent anchor, but it is safe to
  // remove a row only when one unique pair is identical across code,
  // description and the complete economic tuple. Ambiguous pairs remain for
  // the fail-closed reconciliation path.
  if(candidates.length!==1)return {lines:source,collapsed:false};
  const removeIndex=candidates[0],collapsed=source.filter((_,index)=>index!==removeIndex);
  if(Math.abs(lineGrossTotal(collapsed)-total)>TOTAL_TOLERANCE)return {lines:source,collapsed:false};
  return {lines:collapsed,collapsed:true,removed:1,overage};
}
// Some compact thermal receipts are extracted correctly once and then receive
// a second, malformed tail from a supplemental reader.  Keep only a prefix
// when it already reconciles exactly to the independently confirmed invoice
// total and every discarded row is an unverified replay of an earlier printed
// description.  This never invents a line or copies economics from history.
function discardUnverifiedTrailingReplay(lines,invoiceTotal){
  const source=Array.isArray(lines)?lines:[],total=money2(invoiceTotal||0);
  if(!(total>0)||source.length<2)return {lines:source,discarded:false};
  for(let end=1;end<source.length;end++){
    const prefix=source.slice(0,end),tail=source.slice(end);
    if(Math.abs(lineGrossTotal(prefix)-total)>TOTAL_TOLERANCE)continue;
    const safeTail=tail.every(line=>!line?.sourceColumnsVerified&&prefix.some(earlier=>descriptionsClose(earlier.description||earlier.rawText,line.description||line.rawText)));
    if(safeTail)return {lines:prefix,discarded:true,removed:tail.length};
  }
  return {lines:source,discarded:false};
}
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

function restorePrintedRepeatedLine(lines,invoiceTotal,documentText){
  const source=Array.isArray(lines)?lines:[],difference=money2(Number(invoiceTotal||0)-lineGrossTotal(source));
  if(!(difference>TOTAL_TOLERANCE)||!String(documentText||"").trim())return {lines:source,restored:false};
  const candidates=source.filter(line=>line.code&&Math.abs(Number(line.grossAmount||0)-difference)<=TOTAL_TOLERANCE);
  if(candidates.length!==1)return {lines:source,restored:false};
  const candidate=candidates[0],code=String(candidate.code).trim(),escaped=code.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const printedOccurrences=(String(documentText).match(new RegExp(`(?:^|\\D)${escaped}(?=\\D|$)`,'g'))||[]).length;
  const currentOccurrences=source.filter(line=>norm(line.code)===norm(code)).length;
  // A matching total gap is not proof that the same physical row was printed
  // twice: another omitted row plus shifted neighbouring economics can produce
  // the same gap. Restore only when the current document text independently
  // contains more occurrences of this exact supplier code than the structured
  // table. Otherwise keep the mismatch so the complete printed-table verifier
  // rereads codes, discounts, VAT and amounts from the image.
  if(printedOccurrences<=currentOccurrences)return {lines:source,restored:false};
  const restored=[...source,{...candidate,restoredPrintedOccurrence:true,azureSequence:Math.max(0,...source.map(line=>Number(line.azureSequence||0)))+1}];
  if(Math.abs(lineGrossTotal(restored)-Number(invoiceTotal||0))>=Math.abs(difference))return {lines:source,restored:false};
  return {lines:restored,restored:true,code};
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

router.post("/ai-reader/jobs/:jobId/ai-recheck",requireCompanyModule("AI_READER"),async(req,res,next)=>{let failureStage="validate-request";try{
  const body=z.object({force:z.boolean().optional(),additionalPageJobIds:z.array(z.string().min(1)).max(4).optional().default([])}).parse(req.body||{});
  failureStage="load-primary-job";
  const jobs=await prisma.$queryRaw`SELECT j."id",j."storeId",j."status",j."localConfidence",j."purchaseDocumentId",j."resultJson",a."filename",a."mimeType",a."contentData" FROM "AiReaderJob" j JOIN "DocumentAttachment" a ON a."id"=j."attachmentId" WHERE j."id"=${req.params.jobId} AND j."companyId"=${req.user.companyId} LIMIT 1`;
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
  let preferCentralStefanidis=false,preferCentralMantzilas=false,trustedHandoffSupplier=null;
  if(posHandoff?.supplierId){
    const supplierRows=await prisma.$queryRaw`SELECT "id","name","taxId" FROM "Supplier" WHERE "id"=${posHandoff.supplierId} AND "companyId"=${req.user.companyId} AND "active"=true LIMIT 1`;
    trustedHandoffSupplier=supplierRows[0]||null;
    const supplierTaxId=cleanTaxId(supplierRows[0]?.taxId);
    preferCentralStefanidis=supplierTaxId===STEFANIDIS_TAX_ID;
    preferCentralMantzilas=supplierTaxId===MANTZILAS_TAX_ID;
  }
  const localRawText=pageJobs.map((page,index)=>`ΣΕΛΙΔΑ ${index+1}:\n${String(page.resultJson?.rawText||"").slice(0,12000)}`).join("\n\n").slice(0,60000);
  const fileParts=pageJobs.map((page,index)=>page.mimeType==="application/pdf"?{type:"input_file",filename:page.filename||`invoice-page-${index+1}.pdf`,file_data:String(page.contentData).split(",").pop()}:{type:"input_image",image_url:page.contentData,detail:"high"});
  const prompt=`Είσαι δεύτερος ελεγκτής OCR για ελληνικά τιμολόγια προμηθευτών. Έχεις το ΠΡΩΤΟΤΥΠΟ παραστατικό ως εικόνα/PDF και από κάτω το πρόχειρο OCR κείμενο. Χρησιμοποίησε και τα δύο, με προτεραιότητα στο πρωτότυπο. Αναγνώρισε πρώτα documentType: CREDIT_NOTE μόνο όταν το παραστατικό γράφει καθαρά ΠΙΣΤΩΤΙΚΟ / CREDIT NOTE, διαφορετικά INVOICE. Βρες τον ΕΚΔΟΤΗ/ΠΡΟΜΗΘΕΥΤΗ, ΑΦΜ, αριθμό παραστατικού, ημερομηνία και τελικό ποσό ως θετική απόλυτη αξία. documentDate σε YYYY-MM-DD. Μην εφευρίσκεις στοιχεία.

Οι ${pageJobs.length} πηγές που ακολουθούν είναι διαδοχικές σελίδες του ΙΔΙΟΥ τιμολογίου, με την ακριβή σειρά που δόθηκαν. Αν μία πηγή είναι πολυσέλιδο PDF, κράτησε και την εσωτερική σειρά των σελίδων του. Διάβασε το σύνολο ως ένα ενιαίο παραστατικό και επέστρεψε τις γραμμές πρώτα από τη σελίδα 1, μετά από τη σελίδα 2 κ.ο.κ.

Σε πολυσέλιδο παραστατικό, το ποσό «Σε μεταφορά» ή «Από μεταφορά» είναι μεταφερόμενο ενδιάμεσο σύνολο και ΔΕΝ προστίθεται δεύτερη φορά. Ως totalGross χρησιμοποίησε αποκλειστικά την «ΤΕΛΙΚΗ ΑΞΙΑ» ή το τελικό πληρωτέο ποσό της τελευταίας σελίδας.

Στο productLines επέστρεψε ΜΟΝΟ ΟΛΕΣ τις πραγματικές γραμμές ειδών του πίνακα, καμία κεφαλίδα/IBAN/σύνολο/footer. Στο rawText κάθε προϊόντος αντέγραψε ολόκληρη τη συγκεκριμένη φυσική σειρά από τον κωδικό μέχρι το ποσό ΦΠΑ, ώστε quantity × unitCost, έκπτωση, καθαρή αξία, ΕΦΚ και ΦΠΑ να μπορούν να επαληθευτούν. Μην επαναλάβεις όλο το παραστατικό ως ξεχωριστό rawText ή lines. Μην παραλείψεις προϊόν επειδή μία αριθμητική στήλη είναι δύσκολη: κράτησε τη γραμμή και βάλε 0 μόνο στο πεδίο που πραγματικά δεν φαίνεται. Στο vatSummary αντέγραψε τις ορατές γραμμές της ΑΝΑΛΥΣΗΣ ΥΠΟΛΟΓΙΣΜΟΥ ΦΠΑ ως rate, taxable, vat και gross.

Για ΚΑΘΕ προϊόν ακολούθησε την ΙΔΙΑ ΟΡΙΖΟΝΤΙΑ ΣΕΙΡΑ από αριστερά προς τα δεξιά. Χαρτογράφηση: ΛΙΑΝΙΚΗ ΤΙΜΗ=retailPrice, ΠΟΣΟΤΗΤΑ=quantity, Μ.Μ.=unit, ΤΙΜΗ ΜΟΝΑΔΑΣ ΠΡΙΝ ΑΠΟ ΕΚΠΤΩΣΕΙΣ=unitCost, Εκπτ.1/2/3=discount1/2/3, αντίστοιχο ποσό έκπτωσης=discount1Amount/2Amount/3Amount, Καθ Αξία μετά την έκπτωση=netAmount, ΕΦΚ=exciseTotal, %ΦΠΑ=vatRate. Η φορολογητέα αξία είναι netAmount+exciseTotal. Η retailPrice είναι η τιμή πώλησης και ΔΕΝ είναι η unitCost. Μην αντικαθιστάς την αρχική unitCost με netAmount/quantity όταν φαίνονται εκπτώσεις. Αν δεν υπάρχει ορατή λιανική βάλε retailPrice=0. Αν υπάρχει τελική αξία με ΦΠΑ είναι grossAmount. Αριθμοί συσκευασίας (500ML, 6x330ml κ.λπ.) δεν είναι ποσότητα/τιμή. Αν unitCost δεν φαίνεται και δεν υπάρχουν εκπτώσεις αλλά quantity>0 και netAmount>0, unitCost=netAmount/quantity. Αν grossAmount δεν φαίνεται, υπολόγισέ το πάνω στη φορολογητέα αξία.

ΠΡΙΝ επιστρέψεις JSON, μέτρησε οπτικά πόσες πραγματικές σειρές προϊόντων υπάρχουν και βεβαιώσου ότι το productLines έχει τον ίδιο αριθμό. Έπειτα σύγκρινε νοητά το άθροισμα των τελικών αξιών γραμμών με το τελικό πληρωτέο ποσό. Αν υπάρχει εμφανής μεγάλη διαφορά, ξανακοίτα τον πίνακα για γραμμή που παρέλειψες πριν απαντήσεις.

ΠΡΟΧΕΙΡΟ OCR (${Number(job.localConfidence||0)}%):\n${localRawText||"(δεν υπήρξε χρήσιμο OCR κείμενο)"}`;
  let parsed=null,unifiedAiFailure=null,centralAzureFailure=null;
  failureStage="read-provider-pages";
  if((preferCentralStefanidis||preferCentralMantzilas)&&process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT&&process.env.AZURE_DOCUMENT_INTELLIGENCE_KEY){
    try{
      const azurePages=await readAzurePagesSequentially(pageJobs);
      parsed=mergeAzureInvoicePages(azurePages);
      parsed.totalGross=money2(posHandoff.totalGross||parsed.totalGross);
      parsed.documentNumber=String(posHandoff.documentNumber||parsed.documentNumber||"");
      parsed.documentDate=String(posHandoff.documentDate||parsed.documentDate||"");
      if(preferCentralStefanidis)parsed.stefanidisCentralFastPath=true;
      if(preferCentralMantzilas)parsed.mantzilasCentralFastPath=true;
    }catch(error){centralAzureFailure=error;unifiedAiFailure=error}
  }
  if(!parsed)try{
    const apiResponse=await fetch("https://api.openai.com/v1/responses",{method:"POST",headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`,"Content-Type":"application/json"},signal:AbortSignal.timeout(FULL_OCR_PROVIDER_TIMEOUT_MS),body:JSON.stringify({model:FULL_OCR_MODEL,reasoning:{effort:"minimal"},input:[{role:"user",content:[{type:"input_text",text:prompt},...fileParts]}],text:{format:{type:"json_schema",name:"invoice_extract",strict:true,schema:invoiceSchema}}})});
    const payload=await apiResponse.json().catch(()=>({}));
    if(!apiResponse.ok){const error=new Error(payload?.error?.message||`Ο AI επανέλεγχος απέτυχε (${apiResponse.status}).`);error.status=502;throw error}
    try{parsed=JSON.parse(outputText(payload))}catch{const error=new Error("Ο AI επανέλεγχος δεν επέστρεψε έγκυρα δομημένα στοιχεία.");error.status=502;throw error}
  }catch(error){unifiedAiFailure=error}

  // A transient/invalid unified OpenAI response must not discard a payment or
  // silently process only page 1. Recover every ordered page through Azure,
  // then continue as one invoice. If any page cannot be read, fail closed.
  if(!parsed){
    // The centrally profiled supplier already received a complete ordered Azure
    // pass above. Do not repeat the same two provider calls after the OpenAI
    // fallback: that exceeded the caller deadline and caused endless recovery.
    if((preferCentralStefanidis||preferCentralMantzilas)&&centralAzureFailure){
      const timeout=isProviderTimeout(centralAzureFailure)||isProviderTimeout(unifiedAiFailure);
      const wrapped=new Error(`${timeout?"FULL_OCR_PROVIDER_TIMEOUT":"FULL_OCR_PROVIDER_FAILURE"}: AZURE=${providerErrorText(centralAzureFailure)}; OPENAI=${providerErrorText(unifiedAiFailure)}`);
      wrapped.status=timeout?503:502;throw wrapped;
    }
    const azureConfigured=Boolean(process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT&&process.env.AZURE_DOCUMENT_INTELLIGENCE_KEY);
    if(!azureConfigured)throw unifiedAiFailure;
    // Recover all invoice pages concurrently. The old sequential fallback
    // consumed one complete provider timeout per page and then leaked a plain
    // 500, so the durable POS worker could neither retry nor explain the wait.
    const azureAttempts=await Promise.allSettled(pageJobs.map(page=>callAzure({contentData:page.contentData,mimeType:page.mimeType,timeoutMs:FULL_OCR_PROVIDER_TIMEOUT_MS}).then(normalizeAzure)));
    const failedPageIndex=azureAttempts.findIndex(result=>result.status==="rejected");
    if(failedPageIndex>=0){
      const failure=azureAttempts[failedPageIndex].reason,timeout=isProviderTimeout(failure);
      const wrapped=new Error(`${timeout?"AZURE_TIMEOUT":"FULL_OCR_PROVIDER_FAILURE"}: OPENAI=${providerErrorText(unifiedAiFailure)}; AZURE_PAGE_${failedPageIndex+1}=${providerErrorText(failure)}`);
      wrapped.status=timeout?503:502;throw wrapped;
    }
    const azurePages=azureAttempts.map(result=>result.value);
    parsed=mergeAzureInvoicePages(azurePages);
    if(!parsed.productLines.length){const error=new Error("Οι σελίδες αναγνώστηκαν, αλλά δεν βρέθηκαν ασφαλείς γραμμές προϊόντων.");error.status=422;throw error}
    parsed.openAiUnifiedFailed=true;
    parsed.openAiUnifiedRecovery="AZURE_ALL_PAGES";
  }
  // The POS operator already confirmed the supplier before creating the
  // durable handoff. Some full-page providers omit or garble that header even
  // while reading the table. Preserve the trusted tenant supplier identity so
  // its learned layout, complete-table verifier and fail-closed rules cannot
  // be bypassed by a missing OCR supplier field.
  if(trustedHandoffSupplier){
    parsed.supplier={...(parsed.supplier&&typeof parsed.supplier==="object"?parsed.supplier:{}),name:trustedHandoffSupplier.name||"",taxId:trustedHandoffSupplier.taxId||""};
    parsed.posHandoffSupplierApplied=true;
  }
  // The fast POS handoff total is the amount the operator explicitly confirmed
  // (and, for PAID, the immutable payment amount). Use it as the reconciliation
  // anchor for every supplier, not only the centrally profiled fast path.
  const linkedDraft=job.purchaseDocumentId?await prisma.$queryRaw`SELECT "totalGross" FROM "PurchaseDocument" WHERE "id"=${job.purchaseDocumentId} AND "companyId"=${req.user.companyId} AND "status"='DRAFT' LIMIT 1`:[];
  const confirmedHandoffTotal=money2(linkedDraft[0]?.totalGross||posHandoff?.totalGross||0);
  if(confirmedHandoffTotal>0){
    parsed.totalGross=confirmedHandoffTotal;
    parsed.posConfirmedTotalApplied=true;
    parsed.posConfirmedTotalSource=linkedDraft[0]?"LINKED_DRAFT":"POS_HANDOFF";
  }
  parsed.productLines=Array.isArray(parsed.productLines)?parsed.productLines.filter(x=>String(x?.description||x?.rawText||"").trim()).slice(0,500).map(normalizeProductLine):[];
  if(!String(parsed.rawText||"").trim())parsed.rawText=parsed.productLines.map(line=>String(line.rawText||[line.code,line.description].filter(Boolean).join(" ")).trim()).filter(Boolean).join("\n");
  const auditLines=Array.isArray(parsed.lines)&&parsed.lines.length
    ?parsed.lines.filter(x=>String(x?.text||"").trim()).slice(0,1000)
    :parsed.productLines.map(line=>({text:String(line.rawText||[line.code,line.description].filter(Boolean).join(" ")).trim(),confidence:Number(line.confidence||parsed.aiConfidence||0)})).filter(line=>line.text).slice(0,1000);
  parsed.lines=auditLines;

  failureStage="apply-supplier-profile-initial";
  parsed=await applyCentralSupplierProfile(parsed);
  if(isMantzilasInvoice(parsed))parsed.productLines=parsed.productLines.map(recoverMantzilasEconomics).map(applyMantzilasPackaging);
  // Recover the printed retail / unit / quantity columns from the current
  // source itself when a reader has shifted the numeric columns. This rule is
  // layout-based, applies to every supplier, and never reuses prior invoice
  // quantities or prices.
  let printedDocumentText=[parsed.rawText,localRawText,vatSummaryText(parsed.vatSummary)].filter(Boolean).join("\n");
  parsed.productLines=parsed.productLines.map(line=>recoverPrintedRetailColumns(line,printedDocumentText));
  const initialLinesTotal=lineGrossTotal(parsed.productLines),invoiceTotal=money2(parsed.totalGross||0);
  const totalMismatch=invoiceTotal>0&&Math.abs(initialLinesTotal-invoiceTotal)>TOTAL_TOLERANCE+0.000001;
  const allNumericMissing=parsed.productLines.length>0&&parsed.productLines.every(line=>Number(line.quantity||0)<=0&&Number(line.unitCost||0)<=0&&Number(line.netAmount||0)<=0);
  const partialNumericMissing=parsed.productLines.some(line=>Number(line.quantity||0)<=0||Number(line.unitCost||0)<=0||Number(line.netAmount||0)<=0);
  // The MANTZILAS verifier below already rereads every physical row, rebuilds
  // an omitted row, validates each discount/economic chain and requires the
  // printed VAT footer plus exact invoice total. Running a separate table pass
  // and then Azure again before that verifier made one attempt exceed the
  // background request budget and caused repeated six-minute POS_PROCESSING.
  const mantzilasSingleVerifierPath=preferCentralMantzilas&&parsed.mantzilasCentralFastPath===true;
  const needsTablePass=!mantzilasSingleVerifierPath&&!parsed.azureUnifiedFallback&&(parsed.productLines.length===0||allNumericMissing||partialNumericMissing||totalMismatch);
  const inconsistentRows=parsed.productLines.some(line=>!line.sourceColumnsVerified&&Math.abs(Number(line.quantity||0)*Number(line.unitCost||0)*[line.discount1,line.discount2,line.discount3].reduce((f,d)=>f*(1-Number(d||0)/100),1)-Number(line.netAmount||0))>0.05);
  if(needsTablePass||(!mantzilasSingleVerifierPath&&inconsistentRows)){
    failureStage="table-recheck";
    const anchors=parsed.productLines.map((line,index)=>`${index+1}. ${line.code||""} ${line.description||""}`.trim()).join("\n");
    const tablePrompt=`Είσαι εξειδικευμένος οπτικός ελεγκτής ΠΙΝΑΚΑ ΕΙΔΩΝ τιμολογίου. Κοίτα τον πίνακα προϊόντων και επέστρεψε ΟΛΕΣ τις πραγματικές σειρές προϊόντων που βλέπεις, όχι μόνο όσες υπάρχουν στα anchors. Αγνόησε κεφαλίδες, στοιχεία εταιρειών και τράπεζες/IBAN. Στο rawText αντέγραψε ολόκληρη τη φυσική σειρά κάθε προϊόντος. Στο vatSummary αντέγραψε χωριστά μόνο τις γραμμές της ΑΝΑΛΥΣΗΣ ΥΠΟΛΟΓΙΣΜΟΥ ΦΠΑ ως rate, taxable, vat και gross.

Ο πρώτος έλεγχος βρήκε προσωρινά:\n${anchors||"(καμία ασφαλής γραμμή)"}

Τελικό πληρωτέο τιμολογίου: ${invoiceTotal.toFixed(2)} €. Άθροισμα grossAmount των προσωρινών γραμμών: ${initialLinesTotal.toFixed(2)} €. ${totalMismatch?`Υπάρχει διαφορά ${Math.abs(invoiceTotal-initialLinesTotal).toFixed(2)} €, άρα αναζήτησε ειδικά γραμμές προϊόντων που παραλείφθηκαν.`:""}

Επέστρεψε ΚΑΘΕ ορατή γραμμή προϊόντος μία φορά. Για κάθε σειρά διάβασε οριζόντια: Κωδικός/Περιγραφή | Μ.Μ. | ποσότητα | αρχική Τιμή Μονάδας | αξία προ έκπτωσης | έκπτωση % και ποσό | αξία μετά την έκπτωση | ΕΦΚ | φορολογητέα αξία | ΦΠΑ % και ποσό. unitCost=αρχική τιμή πριν από εκπτώσεις, discount1/2/3=ποσοστά, discount1Amount/2Amount/3Amount=ποσά, netAmount=αξία μετά την έκπτωση, exciseTotal=ΕΦΚ, vatRate=%ΦΠΑ και grossAmount=φορολογητέα αξία+ποσό ΦΠΑ. Μην συγχέεις αριθμούς συσκευασίας με quantity/unitCost. Μην εφευρίσκεις. Αν ένα πεδίο δεν φαίνεται βάλε 0, αλλά ΜΗΝ παραλείψεις τη γραμμή.`;
    try{
      const tableResponse=await fetch("https://api.openai.com/v1/responses",{method:"POST",headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`,"Content-Type":"application/json"},signal:AbortSignal.timeout(FULL_OCR_PROVIDER_TIMEOUT_MS),body:JSON.stringify({model:FULL_OCR_MODEL,reasoning:{effort:"minimal"},input:[{role:"user",content:[{type:"input_text",text:tablePrompt},...fileParts]}],text:{format:{type:"json_schema",name:"invoice_product_table_extract",strict:true,schema:productTableSchema}}})});
      const tablePayload=await tableResponse.json().catch(()=>({}));
      if(tableResponse.ok){try{
        const tableParsed=JSON.parse(outputText(tablePayload));
        const recovered=Array.isArray(tableParsed.productLines)?tableParsed.productLines.filter(x=>String(x?.description||x?.rawText||"").trim()).slice(0,500).map(normalizeProductLine):[];
        parsed.productLines=mergeRecoveredLines(parsed.productLines,recovered);
        if(Array.isArray(tableParsed.vatSummary)&&tableParsed.vatSummary.length){parsed.vatSummary=tableParsed.vatSummary;printedDocumentText=[printedDocumentText,vatSummaryText(tableParsed.vatSummary)].filter(Boolean).join("\n")}
        parsed.tableRecheckCalled=true;parsed.tableRecheckRecovered=recovered.length;
      }catch{parsed.tableRecheckCalled=true;parsed.tableRecheckRecovered=0}}
      else{parsed.tableRecheckCalled=true;parsed.tableRecheckRecovered=0;parsed.tableRecheckError=`HTTP_${tableResponse.status}`}
    }catch(error){
      // The table pass is supplemental. Keep the initial extraction and allow
      // the Azure field-recovery path below to finish the same durable job.
      parsed.tableRecheckCalled=true;parsed.tableRecheckRecovered=0;
      parsed.tableRecheckError=isProviderTimeout(error)?"PROVIDER_TIMEOUT":"PROVIDER_FAILURE";
    }
  }

  // Some supplier layouts are read more reliably by Azure per page. This is
  // a last recovery path only: the unified OpenAI pass and table pass remain
  // primary, and no empty invoice may pass through.
  const hasSafeLine=parsed.productLines.some(line=>String(line?.description||line?.rawText||"").trim()&&Number(line?.quantity||0)>0&&Number(line?.unitCost||0)>0),needsAzureFields=!hasSafeLine||totalMismatch||inconsistentRows||parsed.productLines.some(line=>Number(line?.vatRate||0)<=0);
  if(!mantzilasSingleVerifierPath&&!parsed.azureUnifiedFallback&&needsAzureFields&&process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT&&process.env.AZURE_DOCUMENT_INTELLIGENCE_KEY){
    failureStage="azure-field-recovery";
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

  failureStage="apply-supplier-profile-final";
  parsed=await applyCentralSupplierProfile(parsed);
  if(isMantzilasInvoice(parsed)){
    parsed.productLines=parsed.productLines.map(recoverMantzilasEconomics).map(applyMantzilasPackaging);
    parsed.mantzilasPackagingLearningApplied=true;
  }
  // Table/Azure recovery can add rows after the first printed-column pass.
  // Re-apply the centrally learned STEFANIDIS layout to those late rows before
  // totals and discounts are calculated. The equations inside the recovery
  // helper must balance, so values from another invoice are never copied.
  if(isStefanidisInvoice(parsed)){
    parsed.productLines=parsed.productLines.map(line=>recoverPrintedRetailColumns(line,printedDocumentText));
    parsed.stefanidisFinalColumnRecovery=true;
  }
  // A supplier may legitimately charge the exact same item on two physical
  // rows. Restore one missing occurrence only when the current document text
  // contains the code more times than the extraction and the invoice-total
  // difference equals that row's gross amount. No historical invoice value is
  // used and an ambiguous match remains for review.
  // The structured provider result may already have omitted the second
  // physical row, so use provider text plus the independent local OCR text.
  const repeated=restorePrintedRepeatedLine(parsed.productLines,invoiceTotal,printedDocumentText);
  parsed.productLines=repeated.lines;
  if(repeated.restored){parsed.printedRepeatedLineRestored=true;parsed.printedRepeatedLineCode=repeated.code;if(repeated.totalGapRecovered)parsed.printedRepeatedLineRecoveredFromExactTotalGap=true}
  // Vision providers can occasionally replay every physical table row twice
  // (1-2, 3-4, ...). Collapse only a complete adjacent replay whose single
  // copy is strongly corroborated by the printed invoice total. This keeps
  // legitimate repeated products when the full table total is correct.
  const replay=collapseAdjacentTableReplay(parsed.productLines,invoiceTotal);
  parsed.productLines=replay.lines;
  if(replay.collapsed){parsed.duplicateTableReplayCollapsed=true;parsed.duplicateTableReplayRemoved=replay.removed;if(replay.genuineRepeatedRowPreserved)parsed.genuineRepeatedRowPreserved=true}
  // Fresh Snack's current-image receipt may have an otherwise-correct first
  // table followed by a malformed supplemental replay.  The independent
  // total makes trimming that unverified tail safe; a non-reconciling table
  // still proceeds to the complete image verifier below.
  const trailingReplay=(['FRESH_SNACK_COMPLETE_PRINTED_TABLE','FRESH_DELICACIES_COMPLETE_PRINTED_TABLE'].includes(parsed?.supplierReadingProfile?.ruleKey)
    &&parsed?.supplierReadingProfile?.requireCompletePrintedTableOnMismatch===true)
    ?discardUnverifiedTrailingReplay(parsed.productLines,invoiceTotal)
    :{lines:parsed.productLines,discarded:false};
  parsed.productLines=trailingReplay.lines;
  if(trailingReplay.discarded){parsed.unverifiedTrailingReplayDiscarded=true;parsed.unverifiedTrailingReplayRemoved=trailingReplay.removed}
  // A supplemental provider can append one already-present physical row even
  // when the rest of the table is not replayed. For the single-page MANTZILAS
  // layout, remove that isolated replay only when the duplicate tuple is
  // unique and its exact gross amount is the entire invoice-total overage.
  const isolatedDuplicate=isMantzilasInvoice(parsed)&&pageJobs.length===1
    ?collapseExactDuplicateOverage(parsed.productLines,invoiceTotal)
    :{lines:parsed.productLines,collapsed:false};
  parsed.productLines=isolatedDuplicate.lines;
  if(isolatedDuplicate.collapsed){parsed.isolatedDuplicateRowCollapsed=true;parsed.isolatedDuplicateRowRemoved=isolatedDuplicate.removed;parsed.isolatedDuplicateRowOverage=isolatedDuplicate.overage}
  // Re-read prices and discount pairs against the document and accept them
  // only when the line equation balances. This also repairs cases where the
  // amount of a discount was mistaken for the original unit price.
  failureStage="discount-verification";
  const discountDiagnostics={accepted:0,rejectedMath:0};
  const mantzilasInvoice=isMantzilasInvoice(parsed);
  // A per-row Azure flag cannot prove that the complete table is correct when
  // the aggregate already disagrees with the POS-confirmed invoice total. In
  // that exact MANTZILAS failure case, reverify every current-page row from the
  // original image. Keep the no-provider fast path for a table that already
  // reconciles, including the LAB-passed 12665 normalization.
  // Invoice Learning owns this safety decision. Any Super-Admin-confirmed
  // supplier profile can request the same complete current-image verifier;
  // adding a new supplier must not require another hard-coded rule-key list.
  const supplierRequiresCompletePrintedTable=parsed?.supplierReadingProfile?.requireCompletePrintedTableOnMismatch===true;
  const requiresCompleteReverification=(mantzilasInvoice||supplierRequiresCompletePrintedTable)
    &&invoiceTotal>0
    &&Math.abs(lineGrossTotal(parsed.productLines)-invoiceTotal)>TOTAL_TOLERANCE+0.000001;
  for(const [pageIndex,page] of pageJobs.entries()){
    const unresolved=parsed.productLines.filter(line=>{
      const q=Number(line.quantity||0),u=Number(line.unitCost||0),net=Number(line.netAmount||0);
      const hasDiscount=[line.discount1,line.discount2,line.discount3,line.discount1Amount,line.discount2Amount,line.discount3Amount].some(value=>Number(value||0)>0);
      const currentPage=pageJobs.length===1||line.sourceFileIndex===pageIndex;
      if(mantzilasInvoice)return currentPage&&(requiresCompleteReverification||!line.sourceColumnsVerified);
      if(supplierRequiresCompletePrintedTable)return currentPage&&requiresCompleteReverification;
      return !line.sourceColumnsVerified&&currentPage&&q>0&&net>0&&(!hasDiscount||Math.abs(q*u-net)>Math.max(0.05,net*0.02));
    });
    // The initial OCR can legitimately return no product rows. A learned
    // complete-table supplier must still get one image-only reread; the
    // verifier will either rebuild every row with footer agreement or leave
    // the linked draft untouched.
    const needsEmptyCompleteTableRead=(mantzilasInvoice||supplierRequiresCompletePrintedTable)
      &&requiresCompleteReverification
      &&parsed.productLines.length===0;
    if(!unresolved.length&&!needsEmptyCompleteTableRead)continue;
    try{
      const completePrintedTable=mantzilasInvoice||supplierRequiresCompletePrintedTable;
      const diagnostics=await verifyInvoiceDiscounts({contentData:page.contentData,mimeType:page.mimeType,filename:page.filename,productLines:needsEmptyCompleteTableRead?parsed.productLines:unresolved,apiKey:process.env.OPENAI_API_KEY,model:FULL_OCR_MODEL,timeoutMs:FULL_OCR_PROVIDER_TIMEOUT_MS,reverifyAll:completePrintedTable,expectedGrossTotal:completePrintedTable&&pageJobs.length===1?invoiceTotal:0,supplierRule:mantzilasInvoice?"MANTZILAS":supplierRequiresCompletePrintedTable?String(parsed?.supplierReadingProfile?.ruleKey||""):""});
      discountDiagnostics.accepted+=Number(diagnostics.accepted||0);
      discountDiagnostics.rejectedMath+=Number(diagnostics.rejectedMath||0);
      if(Array.isArray(diagnostics.vatSummary)&&diagnostics.vatSummary.length)printedDocumentText=[printedDocumentText,vatSummaryText(diagnostics.vatSummary)].filter(Boolean).join("\n");
    }catch{discountDiagnostics.providerFailures=Number(discountDiagnostics.providerFailures||0)+1}
  }
  parsed.discountMathVerification=discountDiagnostics;
  if(mantzilasInvoice)parsed.productLines=parsed.productLines.map(line=>["AI_PRINTED_ROW_FULL_MATH_VERIFIED","SIBLING_PRICE_DISCOUNT_SCALE_VERIFIED","MANTZILAS_CODE_00009_PACK24_SCALE_VERIFIED"].includes(line.quantitySource)?line:recoverMantzilasEconomics(line)).map(applyMantzilasPackaging);

  const mixedPrintedVat=recoverMixedVatFromPrintedSummary(parsed.productLines,printedDocumentText,invoiceTotal);
  parsed.productLines=mixedPrintedVat.lines;
  if(mixedPrintedVat.recovered){parsed.mixedPrintedVatSummaryRecovered=true;parsed.mixedPrintedVatSummary=mixedPrintedVat.summary}
  const printedVat=recoverVatFromPrintedSummary(parsed.productLines,printedDocumentText,invoiceTotal);
  parsed.productLines=printedVat.lines;
  if(printedVat.recovered){
    parsed.printedVatSummaryRecovered=true;
    parsed.printedVatSummary={rate:printedVat.rate,net:printedVat.net,tax:printedVat.tax};
  }

  parsed.productLinesGrossBeforeRecovery=initialLinesTotal;
  parsed.productLinesGrossAfterRecovery=lineGrossTotal(parsed.productLines);
  parsed.invoiceTotalForCompleteness=invoiceTotal;
  parsed.productLinesTotalDifference=money2(parsed.productLinesGrossAfterRecovery-invoiceTotal);
  parsed.productLinesComplete=invoiceTotal<=0||Math.abs(parsed.productLinesTotalDifference)<=TOTAL_TOLERANCE+0.000001;
  const reconciliationDiagnostic={
    lineCount:parsed.productLines.length,
    calculatedGross:parsed.productLinesGrossAfterRecovery,
    expectedGross:invoiceTotal,
    difference:Math.abs(parsed.productLinesTotalDifference),
    discountProviderFailures:Number(discountDiagnostics.providerFailures||0)
  };
  failureStage=`invoice-total-reconciliation;lines=${reconciliationDiagnostic.lineCount};gross=${reconciliationDiagnostic.calculatedGross.toFixed(2)};expected=${reconciliationDiagnostic.expectedGross.toFixed(2)};diff=${reconciliationDiagnostic.difference.toFixed(2)};providerFailures=${reconciliationDiagnostic.discountProviderFailures}`;
  // MANTZILAS is a single-page learned layout with a printed authoritative
  // total. Never publish a merely "close enough" table: that allowed shifted
  // neighboring economics with a 4.80 EUR error to reach operator review.
  // Keep the durable draft/retry path fail-closed until the corrective reread
  // reconciles the full table to cent-level invoice tolerance.
  if(mantzilasInvoice&&pageJobs.length===1&&invoiceTotal>0&&Math.abs(parsed.productLinesTotalDifference)>0.05){
    // Retain only bounded diagnostics on the durable job. Candidate rows stay
    // local to this request and are never published to the purchase draft.
    await prisma.$executeRaw`UPDATE "AiReaderJob" SET "resultJson"=COALESCE("resultJson",'{}'::jsonb)||${JSON.stringify({posAiDiagnostics:{...reconciliationDiagnostic,recordedAt:new Date().toISOString()}})}::jsonb,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${job.id} AND "companyId"=${req.user.companyId}`;
    throw new Error(`Η πλήρης ανάγνωση ΜΑΝΤΖΙΛΑΣ δεν συμφωνεί με το τιμολόγιο (διαφορά ${Math.abs(parsed.productLinesTotalDifference).toFixed(2)} €). Οι λανθασμένες γραμμές δεν αποθηκεύτηκαν.`);
  }
  failureStage="prepare-ai-result";
  parsed.auditLines=auditLines.length?auditLines:(Array.isArray(previous.lines)?previous.lines:[]);
  parsed.lines=parsed.productLines.length?parsed.productLines.map(line=>{const description=String(line.description||line.rawText||"").replace(/\s+/g," ").trim(),quantity=Math.max(0,Number(line.quantity||0)),unit=String(line.unit||"ΤΜΧ").trim()||"ΤΜΧ",unitCost=Math.max(0,Number(line.unitCost||0));return {text:[description,quantity>0?`${quantity} ${unit}`:"",unitCost>0?decimalText(unitCost):""].filter(Boolean).join(" "),confidence:Math.max(0,Math.min(100,Number(line.confidence||parsed.aiConfidence||0)))}}):[];
  parsed.rawText=parsed.rawText||parsed.auditLines.map(x=>x.text).join("\n")||localRawText;
  failureStage="match-supplier";
  const match=await supplierMatch(req.user.companyId,parsed.supplier),aiConfidence=Math.max(0,Math.min(100,Number(parsed.aiConfidence||0)));
  failureStage="save-ai-result";
  await prisma.$executeRaw`UPDATE "AiReaderJob" SET "stage"='AI',"status"='AI_COMPLETE',"aiConfidence"=${aiConfidence},"resultJson"=COALESCE("resultJson",'{}'::jsonb)||${JSON.stringify(parsed)}::jsonb,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${job.id} AND "companyId"=${req.user.companyId}`;
  res.json({id:job.id,status:"AI_COMPLETE",aiCalled:true,confidence:aiConfidence,result:parsed,supplierMatch:match||null,supplierCandidate:parsed.supplier||null,model:FULL_OCR_MODEL});
}catch(error){
  console.error("POS AI recheck failed",{jobId:req.params.jobId,stage:failureStage,message:providerErrorText(error),code:error?.code||null});
  if(!error?.status){const safe=new Error(`AI_RECHECK_INTERNAL [${failureStage}]`);safe.status=502;safe.code="AI_RECHECK_INTERNAL";return next(safe)}
  next(error)
}});

router.put("/ai-reader/jobs/:jobId/product-lines",requireCompanyModule("AI_READER"),async(req,res,next)=>{try{
  const reviewLine=z.object({rawText:z.string().max(2000).optional().default(""),code:z.string().trim().max(80).optional().default(""),barcode:z.string().trim().max(80).optional().default(""),description:z.string().trim().min(1).max(500),quantity:z.coerce.number().min(0).max(1000000),unit:z.string().trim().max(40).optional().default("ΤΜΧ"),unitsPerPackage:z.coerce.number().min(0).max(100000).optional().default(0),unitCost:z.coerce.number().min(0).max(10000000),vatRate:z.coerce.number().min(0).max(100),confidence:z.coerce.number().min(0).max(100).optional().default(0),invoiceQuantity:z.coerce.number().min(0).max(1000000).optional(),invoiceUnit:z.string().trim().max(40).optional(),stockUnit:z.string().trim().max(40).optional(),stockUnitsPerInvoiceUnit:z.coerce.number().min(0).max(100000).optional(),packageUnitPrice:z.coerce.number().min(0).max(10000000).optional(),discount1:z.coerce.number().min(0).max(100).optional(),discount1Amount:z.coerce.number().min(0).max(1000000000).optional(),discount2:z.coerce.number().min(0).max(100).optional(),discount2Amount:z.coerce.number().min(0).max(1000000000).optional(),discount3:z.coerce.number().min(0).max(100).optional(),discount3Amount:z.coerce.number().min(0).max(1000000000).optional(),initialAmount:z.coerce.number().min(0).max(1000000000).optional(),netAmount:z.coerce.number().min(0).max(1000000000).optional(),exciseTotal:z.coerce.number().min(0).max(1000000000).optional(),taxableAmount:z.coerce.number().min(0).max(1000000000).optional(),vatAmount:z.coerce.number().min(0).max(1000000000).optional(),grossAmount:z.coerce.number().min(0).max(1000000000).optional(),packageConversionApplied:z.boolean().optional(),sourceColumnsVerified:z.boolean().optional(),packRule:z.string().max(120).optional()});
  const body=z.object({source:z.enum(["V2.4.4","V2.4.4_USER_REVIEW"]).optional().default("V2.4.4_USER_REVIEW"),productLines:z.array(reviewLine).min(1).max(500)}).parse(req.body||{});
  const jobs=await prisma.$queryRaw`SELECT j."id",j."storeId",j."status",j."purchaseDocumentId",j."resultJson",d."sourceType" AS "documentSourceType",d."status" AS "documentStatus" FROM "AiReaderJob" j LEFT JOIN "PurchaseDocument" d ON d."id"=j."purchaseDocumentId" AND d."companyId"=j."companyId" WHERE j."id"=${req.params.jobId} AND j."companyId"=${req.user.companyId} LIMIT 1`;
  const job=jobs[0];if(!job)return res.status(404).json({error:"Δεν βρέθηκε η ανάγνωση."});if(req.user?.tokenType==="STORE_OPERATOR"&&req.user.storeId!==job.storeId)return res.status(403).json({error:"Δεν έχεις πρόσβαση σε αυτό το τιμολόγιο."});
  const backgroundMayFillLinkedDraft=Boolean(job.purchaseDocumentId&&body.source==="V2.4.4"&&job.status==="AI_COMPLETE"&&job.resultJson?.posHandoff&&job.documentSourceType==="POS_OCR_DRAFT"&&job.documentStatus==="DRAFT");
  if(job.purchaseDocumentId&&!backgroundMayFillLinkedDraft)return res.status(409).json({error:"Το τιμολόγιο έχει ήδη καταχωριστεί για έλεγχο και οι γραμμές δεν μπορούν να αλλάξουν από το POS."});
  const previous=job.resultJson&&typeof job.resultJson==="object"?job.resultJson:{};
  const productLines=body.productLines.map(line=>{const quantity=Math.max(0,Number(line.quantity||0)),unitCost=Math.max(0,Number(line.unitCost||0)),vatRate=Math.max(0,Number(line.vatRate||0));
    if(backgroundMayFillLinkedDraft){const netAmount=Math.max(0,Number(line.netAmount??quantity*unitCost)),exciseTotal=Math.max(0,Number(line.exciseTotal||0)),taxableAmount=Math.max(0,Number(line.taxableAmount??netAmount+exciseTotal)),vatAmount=Math.max(0,Number(line.vatAmount??taxableAmount*vatRate/100)),grossAmount=Math.max(0,Number(line.grossAmount??taxableAmount+vatAmount));return {...line,rawText:String(line.rawText||line.description),code:String(line.code||""),barcode:String(line.barcode||""),description:String(line.description||"").trim(),quantity,unit:String(line.unit||"ΤΜΧ"),unitsPerPackage:Math.max(0,Number(line.unitsPerPackage||0)),unitCost,netAmount,exciseTotal,taxableAmount,vatRate,vatAmount,grossAmount,confidence:Math.max(0,Math.min(100,Number(line.confidence||0))),sourceColumnsVerified:Boolean(line.sourceColumnsVerified)}}
    const netAmount=quantity*unitCost,grossAmount=netAmount*(1+vatRate/100);return {rawText:String(line.rawText||line.description),code:String(line.code||""),barcode:String(line.barcode||""),description:String(line.description||"").trim(),quantity,unit:String(line.unit||"ΤΜΧ"),unitsPerPackage:Math.max(0,Number(line.unitsPerPackage||0)),unitCost,netAmount,vatRate,grossAmount,confidence:Math.max(0,Math.min(100,Number(line.confidence||0))),sourceColumnsVerified:Boolean(line.sourceColumnsVerified)}});
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
