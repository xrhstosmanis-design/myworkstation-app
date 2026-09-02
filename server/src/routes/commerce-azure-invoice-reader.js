import {Router} from "express";
import {prisma} from "../prisma.js";
import {requireCompanyModule} from "../middleware/module-access.js";
import {verifyInvoiceDiscounts} from "../lib/invoice-discount-verifier.js";
import {reconcileAzureInvoice} from "../lib/invoice-azure-reconciler.js";

const router=Router();
const API_VERSION="2024-11-30";
const MODEL_ID="prebuilt-invoice";
const cleanTaxId=value=>String(value||"").replace(/\D/g,"");
const norm=value=>String(value||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLocaleUpperCase("el-GR").replace(/[^A-ZΑ-Ω0-9]/g,"");
const money2=value=>Math.round((Number(value||0)+Number.EPSILON)*100)/100;
const money4=value=>Math.round((Number(value||0)+Number.EPSILON)*10000)/10000;
const pct=value=>Math.max(0,Math.min(100,Number(value||0)*100));
const configured=()=>Boolean(String(process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT||"").trim()&&String(process.env.AZURE_DOCUMENT_INTELLIGENCE_KEY||"").trim());

function fieldValue(field){
  if(!field)return null;
  if(field.valueCurrency&&Number.isFinite(Number(field.valueCurrency.amount)))return Number(field.valueCurrency.amount);
  if(field.valueDate)return field.valueDate;
  if(field.valueNumber!==undefined&&field.valueNumber!==null)return Number(field.valueNumber);
  if(field.valueInteger!==undefined&&field.valueInteger!==null)return Number(field.valueInteger);
  if(field.valueString!==undefined&&field.valueString!==null)return String(field.valueString);
  if(field.content!==undefined&&field.content!==null)return String(field.content);
  return null;
}
function fieldText(field){const value=fieldValue(field);return value===null||value===undefined?"":String(value).trim()}
function numericField(field){const value=fieldValue(field);const n=Number(value);return Number.isFinite(n)?n:0}
function discountValue(field){
  if(!field)return 0;
  let n=numericField(field);
  if(!Number.isFinite(n)||n<=0)return 0;
  if(n>0&&n<=1)n*=100;
  return n>0&&n<100?money4(n):0;
}
function itemDiscounts(p){
  const values=[discountValue(p.Discount1)||discountValue(p.DiscountRate)||discountValue(p.DiscountPercent),discountValue(p.Discount2),discountValue(p.Discount3)];
  const generic=p.Discount;
  if(!values[0]&&generic){
    if(generic.valueObject)values[0]=discountValue(generic.valueObject.Rate)||discountValue(generic.valueObject.Percent)||discountValue(generic.valueObject.Percentage);
    if(!values[0])values[0]=discountValue(generic);
  }
  return values.map(v=>v||0);
}
function validVatRate(field){
  const n=numericField(field),confidence=pct(field?.confidence);
  if(confidence<70)return 0;
  const canonical=[0,6,13,24];
  return canonical.includes(Math.round(n))?Math.round(n):0;
}
function inferVatRate(netAmount,tax){
  const net=Number(netAmount||0),taxAmount=Number(tax||0);
  if(net<=0||taxAmount<=0)return 0;
  const raw=taxAmount/net*100;
  const canonical=[6,13,24];
  const best=canonical.map(rate=>({rate,diff:Math.abs(raw-rate)})).sort((a,b)=>a.diff-b.diff)[0];
  return best&&best.diff<=1.25?best.rate:0;
}
function parseDataUrl(contentData,mimeType){
  const text=String(contentData||"");
  const comma=text.indexOf(",");
  if(comma<0)return {bytes:Buffer.from(text,"base64"),mimeType:mimeType||"application/octet-stream"};
  const meta=text.slice(0,comma),payload=text.slice(comma+1);
  const detected=(meta.match(/^data:([^;]+)/)||[])[1]||mimeType||"application/octet-stream";
  return {bytes:Buffer.from(payload,"base64"),mimeType:detected};
}
export async function supplierMatch(companyId,candidate={}){
  const taxId=cleanTaxId(candidate.taxId);
  if(taxId){
    const rows=await prisma.$queryRaw`SELECT "id","name","taxId","email","phone","address","city" FROM "Supplier" WHERE "companyId"=${companyId} AND "active"=true AND REGEXP_REPLACE(COALESCE("taxId",''),'\\D','','g')=${taxId} LIMIT 1`;
    if(rows[0])return rows[0];
  }
  const key=norm(candidate.name);
  if(key.length>=4){
    const rows=await prisma.$queryRaw`SELECT "id","name","taxId","email","phone","address","city" FROM "Supplier" WHERE "companyId"=${companyId} AND "active"=true ORDER BY "name"`;
    const exact=rows.find(row=>norm(row.name)===key);if(exact)return exact;
    const close=rows.find(row=>{const k=norm(row.name);return key.length>=7&&k.length>=7&&(k.includes(key)||key.includes(k));});if(close)return close;
  }
  return null;
}
function addressText(field){
  if(!field)return "";
  if(field.valueAddress){const a=field.valueAddress;return [a.streetAddress,a.houseNumber,a.road,a.postalCode,a.city,a.state,a.countryRegion].filter(Boolean).join(", ")}
  return fieldText(field);
}
function normalizeItem(item,index){
  const p=item?.valueObject||item||{};
  const description=fieldText(p.Description)||fieldText(p.ProductName)||fieldText(p.ItemDescription);
  const code=fieldText(p.ProductCode)||fieldText(p.ItemCode)||fieldText(p.Code);
  const quantity=Math.max(0,numericField(p.Quantity));
  const unit=fieldText(p.Unit)||fieldText(p.UnitOfMeasure)||"ΤΜΧ";
  let unitCost=Math.max(0,numericField(p.UnitPrice)||numericField(p.Price)||numericField(p.UnitCost));
  const [discount1,discount2,discount3]=itemDiscounts(p);
  const tax=Math.max(0,numericField(p.Tax)||numericField(p.TaxAmount));
  const azureAmount=Math.max(0,numericField(p.Amount));
  const azureNetAmount=Math.max(0,numericField(p.NetAmount)||numericField(p.SubTotal)||numericField(p.NetPrice));
  let netAmount=azureNetAmount||azureAmount;
  if(netAmount<=0&&quantity>0&&unitCost>0){const factor=(1-discount1/100)*(1-discount2/100)*(1-discount3/100);netAmount=money2(quantity*unitCost*factor)}
  if(unitCost<=0&&quantity>0&&netAmount>0){const factor=(1-discount1/100)*(1-discount2/100)*(1-discount3/100);unitCost=money4(factor>0?netAmount/(quantity*factor):netAmount/quantity)}
  let vatRate=validVatRate(p.TaxRate)||validVatRate(p.VATRate)||validVatRate(p.VatRate);
  if(!vatRate&&netAmount>0&&tax>0)vatRate=inferVatRate(netAmount,tax);
  if(netAmount>0&&tax>0&&azureAmount>0&&Math.abs(azureAmount-(netAmount+tax))<0.03)netAmount=money2(azureAmount-tax);
  const grossAmount=netAmount>0?money2(netAmount+(tax>0?tax:(vatRate>0?netAmount*vatRate/100:0))):0;
  const rawText=String(item?.content||description||"").replace(/\s+/g," ").trim();
  const confidences=[item?.confidence,p.Description?.confidence,p.ProductCode?.confidence,p.Quantity?.confidence,p.Unit?.confidence,p.UnitPrice?.confidence,p.Price?.confidence,p.UnitCost?.confidence,p.Amount?.confidence,p.NetAmount?.confidence,p.SubTotal?.confidence,p.NetPrice?.confidence].filter(v=>v!==undefined&&v!==null).map(pct);
  const confidence=confidences.length?Math.max(...confidences):0;
  return {rawText,code,barcode:"",description,quantity,unit,unitsPerPackage:0,unitCost,discount1,discount2,discount3,netAmount,vatRate,grossAmount,confidence,azureSequence:index+1,azureTax:tax,azureTaxRateConfidence:Math.max(pct(p.TaxRate?.confidence),pct(p.VATRate?.confidence),pct(p.VatRate?.confidence))};
}
export async function callAzure({contentData,mimeType}){
  const endpoint=String(process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT||"").trim().replace(/\/+$/g,"");
  const key=String(process.env.AZURE_DOCUMENT_INTELLIGENCE_KEY||"").trim();
  const {bytes,mimeType:detected}=parseDataUrl(contentData,mimeType);
  if(bytes.length<20)throw new Error("AZURE_EMPTY_DOCUMENT");
  const url=`${endpoint}/documentintelligence/documentModels/${MODEL_ID}:analyze?api-version=${API_VERSION}`;
  const start=await fetch(url,{method:"POST",headers:{"Ocp-Apim-Subscription-Key":key,"Content-Type":detected},body:bytes});
  if(!start.ok)throw new Error(`AZURE_ANALYZE_${start.status}:${(await start.text()).slice(0,300)}`);
  const operation=start.headers.get("operation-location");
  if(!operation)throw new Error("AZURE_NO_OPERATION_LOCATION");
  for(let i=0;i<30;i++){
    await new Promise(resolve=>setTimeout(resolve,i<2?700:1200));
    const poll=await fetch(operation,{headers:{"Ocp-Apim-Subscription-Key":key}});
    if(!poll.ok)throw new Error(`AZURE_POLL_${poll.status}`);
    const payload=await poll.json();
    if(payload.status==="succeeded")return payload;
    if(payload.status==="failed"||payload.status==="canceled")throw new Error(`AZURE_${String(payload.status).toUpperCase()}`);
  }
  throw new Error("AZURE_TIMEOUT");
}
export function normalizeAzure(payload){
  const result=payload?.analyzeResult||{};
  const doc=result.documents?.[0]||{};
  const f=doc.fields||{};
  const productLines=Array.isArray(f.Items?.valueArray)?f.Items.valueArray.map(normalizeItem).filter(line=>line.description||line.rawText).slice(0,500):[];
  const supplier={name:fieldText(f.VendorName)||fieldText(f.VendorAddressRecipient),taxId:fieldText(f.VendorTaxId),email:fieldText(f.VendorEmail),phone:fieldText(f.VendorPhoneNumber),address:addressText(f.VendorAddress),city:f.VendorAddress?.valueAddress?.city||""};
  const documentNumber=fieldText(f.InvoiceId);
  const documentDate=fieldText(f.InvoiceDate);
  const totalGross=Math.max(0,numericField(f.InvoiceTotal)||numericField(f.AmountDue));
  const lineConf=productLines.map(x=>x.confidence).filter(v=>v>0);
  const headerConf=[f.VendorName?.confidence,f.VendorTaxId?.confidence,f.InvoiceId?.confidence,f.InvoiceDate?.confidence,f.InvoiceTotal?.confidence].filter(v=>v!==undefined&&v!==null).map(pct);
  const aiConfidence=Math.round((lineConf.concat(headerConf).reduce((a,b)=>a+b,0)/(lineConf.length+headerConf.length||1))*10)/10;
  const lines=productLines.map(line=>({text:line.rawText||[line.code,line.description,line.quantity,line.unit,line.unitCost,line.netAmount].filter(Boolean).join(" "),confidence:line.confidence}));
  return {aiConfidence,supplier,documentNumber,documentDate,totalGross,rawText:String(result.content||""),lines,productLines,azureDocumentIntelligence:true,azureModel:MODEL_ID,azureApiVersion:API_VERSION,azureDocumentConfidence:pct(doc.confidence),azurePageCount:Array.isArray(result.pages)?result.pages.length:0};
}

router.get("/ai-reader/azure-status",requireCompanyModule("AI_READER"),(req,res)=>res.json({configured:configured(),provider:"AZURE_DOCUMENT_INTELLIGENCE",model:MODEL_ID,apiVersion:API_VERSION}));

router.post("/ai-reader/azure-direct",requireCompanyModule("AI_READER"),async(req,res,next)=>{
  try{
    if(!configured())return res.status(503).json({error:"Δεν έχει συνδεθεί το Azure Document Intelligence."});
    const storeId=String(req.body?.storeId||"").trim();
    const filename=String(req.body?.filename||"invoice.jpg").slice(0,180);
    const mimeType=String(req.body?.mimeType||"image/jpeg");
    const dataUrl=String(req.body?.dataUrl||"");
    if(!storeId||!dataUrl)return res.status(400).json({error:"Δεν βρέθηκε κατάστημα ή αρχείο τιμολογίου."});
    const store=await prisma.store.findFirst({where:{id:storeId,companyId:req.user.companyId},select:{id:true}});
    if(!store)return res.status(404).json({error:"Δεν βρέθηκε το κατάστημα."});
    if(req.user?.tokenType==="STORE_OPERATOR"&&String(req.user.storeId)!==storeId)return res.status(403).json({error:"Δεν έχεις πρόσβαση σε αυτό το κατάστημα."});
    let parsed=normalizeAzure(await callAzure({contentData:dataUrl,mimeType}));
    if(!parsed.productLines.length)return res.status(422).json({error:"Το Azure διάβασε το παραστατικό αλλά δεν επέστρεψε γραμμές προϊόντων."});
    await verifyInvoiceDiscounts({contentData:dataUrl,mimeType,filename,productLines:parsed.productLines,apiKey:process.env.OPENAI_API_KEY,model:process.env.OPENAI_INVOICE_MODEL||"gpt-5"});
    parsed=reconcileAzureInvoice(parsed);
    const match=await supplierMatch(req.user.companyId,parsed.supplier);
    return res.json({ok:true,provider:"AZURE_DOCUMENT_INTELLIGENCE",confidence:parsed.aiConfidence,result:parsed,supplierMatch:match||null,supplierCandidate:parsed.supplier||null,discountVerifier:process.env.OPENAI_API_KEY?"AI_VERIFIED":"NONE"});
  }catch(error){
    console.error("Azure direct invoice read failed:",error?.message||error);
    const wrapped=new Error(`Azure ανάγνωση απέτυχε: ${error?.message||"άγνωστο σφάλμα"}`);wrapped.status=502;next(wrapped);
  }
});

router.post("/ai-reader/jobs/:jobId/ai-recheck",requireCompanyModule("AI_READER"),async(req,res,next)=>{
  if(!configured())return next();
  try{
    const jobs=await prisma.$queryRaw`SELECT j."id",j."storeId",j."status",j."localConfidence",j."resultJson",a."filename",a."mimeType",a."contentData" FROM "AiReaderJob" j JOIN "DocumentAttachment" a ON a."id"=j."attachmentId" WHERE j."id"=${req.params.jobId} AND j."companyId"=${req.user.companyId} LIMIT 1`;
    const job=jobs[0];if(!job)return res.status(404).json({error:"Δεν βρέθηκε η ανάγνωση."});
    if(req.user?.tokenType==="STORE_OPERATOR"&&req.user.storeId!==job.storeId)return res.status(403).json({error:"Δεν έχεις πρόσβαση σε αυτό το τιμολόγιο."});
    if(!job.contentData)return next();
    let payload;
    try{payload=await callAzure({contentData:job.contentData,mimeType:job.mimeType})}catch(error){console.error("Azure Document Intelligence fallback:",error?.message||error);return next()}
    let parsed=normalizeAzure(payload);
    if(!parsed.productLines.length){
      console.warn("Azure Document Intelligence returned invoice header without product lines; falling back to AI table reader.",{jobId:job.id,confidence:parsed.aiConfidence});
      return next();
    }
    await verifyInvoiceDiscounts({contentData:job.contentData,mimeType:job.mimeType,filename:job.filename,productLines:parsed.productLines,apiKey:process.env.OPENAI_API_KEY,model:process.env.OPENAI_INVOICE_MODEL||"gpt-5"});
    parsed=reconcileAzureInvoice(parsed);
    const match=await supplierMatch(req.user.companyId,parsed.supplier);
    await prisma.$executeRaw`UPDATE "AiReaderJob" SET "stage"='AI',"status"='AI_COMPLETE',"aiConfidence"=${parsed.aiConfidence},"resultJson"=${JSON.stringify(parsed)}::jsonb,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${job.id} AND "companyId"=${req.user.companyId}`;
    return res.json({id:job.id,status:"AI_COMPLETE",aiCalled:true,confidence:parsed.aiConfidence,result:parsed,supplierMatch:match||null,supplierCandidate:parsed.supplier||null,model:"azure-prebuilt-invoice",provider:"AZURE_DOCUMENT_INTELLIGENCE",reconciliation:parsed.reconciliation||null,discountVerifier:process.env.OPENAI_API_KEY?"AI_VERIFIED":"NONE",fallbackAvailable:Boolean(process.env.OPENAI_API_KEY)});
  }catch(error){next(error)}
});

export default router;
