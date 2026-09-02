import {Router} from "express";
import {knowledgeForSupplier} from "../lib/invoice-learning-product-knowledge.js";

const router=Router();
const AZURE_API_VERSION="2024-11-30";
const AZURE_MODEL_ID="prebuilt-invoice";

const pct=v=>Math.max(0,Math.min(100,Number(v||0)*100));
const money4=v=>Math.round((Number(v||0)+Number.EPSILON)*10000)/10000;
const norm=v=>String(v||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toUpperCase().replace(/[^A-ZΑ-Ω0-9]/g,"");
const numberField=f=>{const v=f?.valueCurrency?.amount??f?.valueNumber??f?.valueInteger??f?.content;const n=Number(String(v??"").replace(",","."));return Number.isFinite(n)?n:0};
const textField=f=>String(f?.valueString??f?.valueDate??f?.content??"").trim();
const azureConfigured=()=>Boolean(String(process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT||"").trim()&&String(process.env.AZURE_DOCUMENT_INTELLIGENCE_KEY||"").trim());

function outputText(response){
  if(typeof response?.output_text==="string"&&response.output_text.trim())return response.output_text;
  for(const item of response?.output||[])for(const part of item?.content||[])if(part?.type==="output_text"&&part.text)return part.text;
  return "";
}

function applyDiscounts(unitPrice,discounts){
  let net=Math.max(0,Number(unitPrice||0));
  for(const d of discounts)net*=1-Math.max(0,Math.min(100,Number(d||0)))/100;
  return money4(net);
}

function explicitDiscounts(p){
  const fields=[p.DiscountRate,p.DiscountPercent,p.LineDiscountRate,p.Discount1,p.Discount2,p.Discount3,p.Discount,p.LineDiscount],out=[];
  for(const field of fields){
    if(!field)continue;
    const raw=textField(field)||String(numberField(field)||"");
    const matches=[...raw.matchAll(/(-?\d{1,2}(?:[.,]\d+)?)\s*%/g)].map(m=>Math.abs(Number(m[1].replace(",","."))));
    if(matches.length)out.push(...matches);else{const n=Math.abs(numberField(field));if(n>0&&n<100)out.push(n)}
  }
  return out.filter(v=>Number.isFinite(v)&&v>0&&v<100).slice(0,3);
}

function packageFromText(text=""){
  const s=String(text).toUpperCase().replace(/,/g,".");
  // A nested beverage pack such as "6 X (4 X 330ML)" contains 24 pieces.
  // This is deliberately limited to explicit x/× multipliers next to a size
  // marker, so a product code can never be mistaken for a pack size.
  for(const re of [/(\d{1,3})\s*[XΧ]\s*\(?\s*(\d{1,3})\s*[XΧ]\s*\d+(?:\.\d+)?\s*(?:G|GR|ΓΡ|ML|LT|L|KG)\b/,/(\d{1,3})\s*[XΧ]\s*\d+(?:\.\d+)?\s*(?:G|GR|ΓΡ|ML|LT|L|KG)\s*[XΧ]\s*(\d{1,3})\b/]){
    const m=s.match(re);if(m){const n=Number(m[1])*Number(m[2]);if(n>1&&n<=500)return n}
  }
  // Suppliers use both "330ML X 24" and "24 X 330ML".  The second form
  // is common on beverage invoices and used to be missed completely.
  for(const re of [/\d+(?:\.\d+)?\s*(?:G|GR|ΓΡ|ML|LT|L|KG)\s*[XΧ]\s*(\d{1,3})\b/,/(\d{1,3})\s*[XΧ]\s*\d+(?:\.\d+)?\s*(?:G|GR|ΓΡ|ML|LT|L|KG)\b/,/(\d{1,3})\s*(?:ΤΜΧ|TEM|ΤΕΜ|PCS)\b/,/[XΧ]\s*(\d{1,3})\s*(?:T|Τ|ΤΜΧ|PCS)\b/]){
    const m=s.match(re);if(m){const n=Number(m[1]);if(n>1&&n<=500)return n}
  }
  return 0;
}

function isCaseUnit(value=""){
  return /(?:^|\s)(?:ΚΙΒ|Κ\.Β\.?|ΚΒ|KIB|KIV|CASE|BOX|CTN)(?:\s|$)/i.test(String(value||""));
}

const tableText=v=>String(v||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toUpperCase().replace(/[^A-ZΑ-Ω0-9]/g,"");
const tableNumber=v=>{const raw=String(v??"").trim().replace(",",".");const n=Number(raw);return Number.isFinite(n)?n:0};
const isAntzoulatos=supplier=>/ANTZOULAT|ΑΝΤΖΟΥΛΑΤ/.test(tableText(supplier));

/*
 * The Antzoulatos invoice has explicit KIB and TMX columns.  Azure's generic
 * prebuilt-invoice model frequently returns only the latter as Quantity, so
 * retain the table geometry as a supplier template and use KIB as the invoice
 * quantity.  TMX stays as audit information; the final retail quantity comes
 * from KIB × the clearly printed pack size.
 */
function antzoulatosTableRows(result){
  const tables=Array.isArray(result?.tables)?result.tables:[];
  for(const table of tables){
    const cells=Array.isArray(table?.cells)?table.cells:[];
    const headers=cells.filter(c=>/(?:ΚΙΒ|KIB|ΚΒ)/.test(tableText(c?.content))||/(?:ΤΜΧ|TMX|TEM|PCS)/.test(tableText(c?.content)));
    const kib=headers.find(c=>/(?:ΚΙΒ|KIB|ΚΒ)/.test(tableText(c?.content)));
    const tmx=headers.find(c=>/(?:ΤΜΧ|TMX|TEM|PCS)/.test(tableText(c?.content)));
    const description=headers.length&&cells.find(c=>/(?:ΠΕΡΙΓΡΑΦΗ|DESCRIPTION)/.test(tableText(c?.content)));
    if(!kib||!description)continue;
    const headerRow=Math.max(kib.rowIndex??0,description.rowIndex??0,tmx?.rowIndex??0);
    const rows=new Map();
    for(const cell of cells){
      if((cell?.rowIndex??0)<=headerRow)continue;
      const row=rows.get(cell.rowIndex)||{};rows.set(cell.rowIndex,row);
      if(cell.columnIndex===kib.columnIndex)row.kibQuantity=tableNumber(cell.content);
      if(tmx&&cell.columnIndex===tmx.columnIndex)row.tmxQuantity=tableNumber(cell.content);
      if(cell.columnIndex===description.columnIndex)row.description=String(cell.content||"").trim();
    }
    const valid=[...rows.values()].filter(r=>r.description&&r.kibQuantity>0);
    if(valid.length)return valid;
  }
  return [];
}

function findAntzoulatosRow(rows,description){
  const wanted=tableText(description);if(!wanted)return null;
  let best=null,bestScore=0;
  for(const row of rows){
    const candidate=tableText(row.description);if(!candidate)continue;
    const score=candidate===wanted?1000:(candidate.includes(wanted)||wanted.includes(candidate)?800:[...wanted.matchAll(/[A-ZΑ-Ω0-9]{4,}/g)].filter(m=>candidate.includes(m[0])).length*50);
    if(score>bestScore){best=row;bestScore=score}
  }
  return bestScore>=100?best:null;
}

/*
 * Retail stock is always posted in pieces.  OCR values remain visible for
 * audit (invoiceQuantity/invoiceUnit/packageUnitPrice), while quantity and
 * unitPrice become the values that are safe to send to stock/costing.
 */
function normalizeRetailPackaging(line){
  const raw=String(line?.azureRawRow||line?.rawText||"");
  const invoiceUnit=String(line?.invoiceUnit||line?.unit||"").trim();
  const caseInvoice=isCaseUnit(`${invoiceUnit} ${raw}`);
  const pack=Math.max(0,Number(line?.unitsPerPackage||0))||packageFromText(`${line?.description||""} ${raw}`);
  const invoiceQuantity=Math.max(0,Number(line?.invoiceQuantity??line?.quantity??0));
  const packageUnitPrice=Math.max(0,Number(line?.packageUnitPrice??line?.unitPrice??0));
  if(!(caseInvoice&&invoiceQuantity>0&&pack>1&&packageUnitPrice>0))return {...line,invoiceQuantity,invoiceUnit:invoiceUnit||null,packageUnitPrice:packageUnitPrice||null,unitsPerPackage:pack||0};

  const quantity=money4(invoiceQuantity*pack);
  const unitPrice=money4(packageUnitPrice/pack);
  const netAmount=Math.max(0,Number(line?.netAmount||0));
  const netUnitCost=netAmount>0?money4(netAmount/quantity):applyDiscounts(unitPrice,[line?.discount1,line?.discount2,line?.discount3]);
  const grossAmount=Math.max(0,Number(line?.grossAmount||0));
  return {...line,invoiceQuantity,invoiceUnit:invoiceUnit||"ΚΙΒ",packageUnitPrice,quantity,unit:"PCS",stockUnit:"PCS",unitsPerPackage:pack,unitPrice,netUnitCost,netAmount,grossAmount,packageConversionApplied:true,conversionFactor:pack,needsReview:Boolean(line?.needsReview)};
}

function rowTail(content,description,supplierItemCode){
  let tail=String(content||"").replace(/\s+/g," ").trim();
  if(supplierItemCode){const i=tail.indexOf(String(supplierItemCode));if(i>=0)tail=tail.slice(i+String(supplierItemCode).length)}
  if(description){const d=String(description).trim(),i=tail.indexOf(d);if(i>=0)tail=tail.slice(i+d.length)}
  return tail;
}

function recoverUnitPriceFromRow(content,quantity,netAmount,description,supplierItemCode){
  const tail=rowTail(content,description,supplierItemCode);if(!tail)return 0;
  const tokens=[...tail.matchAll(/-?\d+(?:[.,]\d+)?/g)].map(m=>({raw:m[0],n:Number(m[0].replace(",","."))})).filter(x=>Number.isFinite(x.n)&&x.n>=0);
  if(!tokens.length)return 0;
  const q=Math.max(0,Number(quantity||0)),amount=Math.max(0,Number(netAmount||0));
  const decimals=tokens.filter(x=>/[.,]/.test(x.raw)&&x.n>0&&x.n<10000);
  if(q>0&&amount>0){
    const target=amount/q;
    const exact=decimals.find(x=>Math.abs(x.n-target)<=Math.max(.02,target*.02));
    if(exact)return money4(exact.n);
    const grossCandidate=decimals.find(x=>Math.abs(x.n*q-amount)<=Math.max(.05,amount*.03));
    if(grossCandidate)return money4(grossCandidate.n);
  }
  const qIndex=tokens.findIndex(x=>q>0&&Math.abs(x.n-q)<.0001);
  if(qIndex>=0){const after=tokens.slice(qIndex+1).find(x=>/[.,]/.test(x.raw)&&x.n>0);if(after)return money4(after.n)}
  return decimals[0]?money4(decimals[0].n):0;
}

function recoverNetAmountFromRow(content,quantity,unitPrice,currentAmount,description,supplierItemCode){
  const q=Math.max(0,Number(quantity||0)),price=Math.max(0,Number(unitPrice||0)),current=Math.max(0,Number(currentAmount||0));
  if(!(q>0&&price>0))return {amount:current,source:"NO_MATH",safe:false};
  const before=money4(q*price),tol=Math.max(.06,before*.025);
  if(current>0&&current<=before+tol&&current>=before*.5)return {amount:money4(current),source:"AZURE",safe:true};
  const tail=rowTail(content,description,supplierItemCode);
  const values=[...tail.matchAll(/-?\d+(?:[.,]\d+)?/g)].map(m=>({raw:m[0],n:Number(m[0].replace(",","."))})).filter(x=>Number.isFinite(x.n)&&x.n>0&&/[.,]/.test(x.raw));
  const candidates=[];
  for(const x of values){
    if(Math.abs(x.n-price)<=Math.max(.01,price*.01))continue;
    if(x.n>before+tol||x.n<before*.5)continue;
    const inferred=(1-x.n/before)*100;
    if(inferred>=-.5&&inferred<=60)candidates.push({amount:x.n,inferred,score:Math.abs(inferred-Math.round(inferred))});
  }
  if(candidates.length){
    candidates.sort((a,b)=>a.score-b.score||b.amount-a.amount);
    const best=candidates[0];
    return {amount:money4(best.amount),source:"ROW",safe:true};
  }
  return {amount:before,source:"MATH_NO_DISCOUNT",safe:true,needsReview:true};
}

function recoverDiscountsFromMath(content,quantity,unitPrice,netAmount){
  const q=Math.max(0,Number(quantity||0)),price=Math.max(0,Number(unitPrice||0)),amount=Math.max(0,Number(netAmount||0));
  if(!(q>0&&price>0&&amount>0))return [];
  const before=q*price;
  if(amount>=before-Math.max(.02,before*.005))return [];
  const inferred=(1-amount/before)*100;
  if(!(inferred>.05&&inferred<60))return [];
  const raw=String(content||"").replace(/\s+/g," ");
  const numbers=[...raw.matchAll(/-?\d+(?:[.,]\d+)?/g)].map(m=>Number(m[0].replace(",","."))).filter(Number.isFinite);
  const candidates=numbers.filter(n=>n>.05&&n<60&&Math.abs(n-inferred)<=Math.max(.35,inferred*.03));
  let discount=candidates.length?candidates.sort((a,b)=>Math.abs(a-inferred)-Math.abs(b-inferred))[0]:inferred;
  const nearestInteger=Math.round(discount);if(Math.abs(discount-nearestInteger)<=.25)discount=nearestInteger;else discount=Math.round(discount*100)/100;
  const expected=before*(1-discount/100);
  if(Math.abs(expected-amount)>Math.max(.05,amount*.02))return [];
  return [discount];
}

function discountsReconcile(discounts,quantity,unitPrice,netAmount){
  if(!discounts.length)return false;
  const q=Math.max(0,Number(quantity||0)),price=Math.max(0,Number(unitPrice||0)),amount=Math.max(0,Number(netAmount||0));
  if(!(q>0&&price>0&&amount>0))return true;
  const expected=q*applyDiscounts(price,discounts);
  return Math.abs(expected-amount)<=Math.max(.05,amount*.02);
}

async function callAzure(fileData,mimeType){
  const endpoint=String(process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT||"").trim().replace(/\/+$/g,"");
  const key=String(process.env.AZURE_DOCUMENT_INTELLIGENCE_KEY||"").trim();
  const base64=String(fileData).includes(",")?String(fileData).split(",").pop():String(fileData);
  const bytes=Buffer.from(base64,"base64");
  if(bytes.length<20)throw new Error("AZURE_EMPTY_DOCUMENT");
  const url=`${endpoint}/documentintelligence/documentModels/${AZURE_MODEL_ID}:analyze?api-version=${AZURE_API_VERSION}`;
  const start=await fetch(url,{method:"POST",headers:{"Ocp-Apim-Subscription-Key":key,"Content-Type":mimeType||"application/octet-stream"},body:bytes});
  if(!start.ok)throw new Error(`AZURE_ANALYZE_${start.status}:${(await start.text()).slice(0,250)}`);
  const operation=start.headers.get("operation-location");if(!operation)throw new Error("AZURE_NO_OPERATION_LOCATION");
  for(let i=0;i<30;i++){
    await new Promise(resolve=>setTimeout(resolve,i<2?700:1200));
    const poll=await fetch(operation,{headers:{"Ocp-Apim-Subscription-Key":key}});if(!poll.ok)throw new Error(`AZURE_POLL_${poll.status}`);
    const payload=await poll.json();if(payload.status==="succeeded")return payload;if(payload.status==="failed"||payload.status==="canceled")throw new Error(`AZURE_${String(payload.status).toUpperCase()}`);
  }
  throw new Error("AZURE_TIMEOUT");
}

function normalizeAzure(payload){
  const result=payload?.analyzeResult||{},doc=result.documents?.[0]||{},f=doc.fields||{};
  const items=Array.isArray(f.Items?.valueArray)?f.Items.valueArray:[];
  const supplierName=textField(f.VendorName)||textField(f.VendorAddressRecipient);
  const antzoulatosRows=isAntzoulatos(supplierName)?antzoulatosTableRows(result):[];
  const productLines=items.map((item,index)=>{
    const p=item?.valueObject||{};
    const supplierItemCode=textField(p.ProductCode)||textField(p.ItemCode)||textField(p.Code);
    const description=textField(p.Description)||textField(p.ProductName)||textField(p.ItemDescription);
    const extractedQuantity=Math.max(0,numberField(p.Quantity));
    const supplierTableRow=findAntzoulatosRow(antzoulatosRows,description);
    const kibQuantity=Math.max(0,Number(supplierTableRow?.kibQuantity||extractedQuantity));
    const printedPiecesQuantity=Math.max(0,Number(supplierTableRow?.tmxQuantity||0));
    let quantity=kibQuantity;
    let netAmount=Math.max(0,numberField(p.Amount));
    let unitPrice=Math.max(0,numberField(p.UnitPrice));
    if(!unitPrice)unitPrice=recoverUnitPriceFromRow(item?.content,quantity,netAmount,description,supplierItemCode);
    // In this supplier's template, TMX can be the actual stock quantity while
    // KIB is only the ordering unit.  Use it only when the printed price and
    // line total reconcile, so a carton price is never mistaken for a piece price.
    const tmxIsActualQuantity=Boolean(supplierTableRow&&printedPiecesQuantity>kibQuantity&&unitPrice>0&&netAmount>0&&Math.abs(printedPiecesQuantity*unitPrice-netAmount)<=Math.max(.05,netAmount*.02));
    if(tmxIsActualQuantity)quantity=printedPiecesQuantity;
    const originalNetAmount=netAmount;
    const netRecovery=recoverNetAmountFromRow(item?.content,quantity,unitPrice,netAmount,description,supplierItemCode);
    netAmount=netRecovery.amount;
    const tax=Math.max(0,numberField(p.Tax));
    let vatRate=Math.round(Math.max(0,numberField(p.TaxRate)));if(![0,6,13,24].includes(vatRate))vatRate=0;
    let discounts=explicitDiscounts(p);
    if(discounts.length&&!discountsReconcile(discounts,quantity,unitPrice,netAmount))discounts=[];
    if(!discounts.length)discounts=recoverDiscountsFromMath(item?.content,quantity,unitPrice,netAmount);
    const discount1=discounts[0]||0,discount2=discounts[1]||0,discount3=discounts[2]||0;
    const netUnitCost=unitPrice>0?applyDiscounts(unitPrice,discounts):(quantity>0&&netAmount>0?money4(netAmount/quantity):0);
    const mathematicallyValid=quantity>0&&unitPrice>0&&netAmount>0?Math.abs(quantity*netUnitCost-netAmount)<=Math.max(.05,netAmount*.02):false;
    if(!mathematicallyValid&&quantity>0&&unitPrice>0){
      netAmount=money4(quantity*netUnitCost);
    }
    const grossAmount=netAmount>0?money4(netAmount+(tax>0?tax:netAmount*vatRate/100)):0;
    const confidence=Math.max(pct(item?.confidence),pct(p.Description?.confidence),pct(p.Quantity?.confidence),pct(p.UnitPrice?.confidence),pct(p.Amount?.confidence));
    const finalMathValid=quantity>0&&unitPrice>0&&netAmount>0?Math.abs(quantity*netUnitCost-netAmount)<=Math.max(.05,netAmount*.02):false;
    return normalizeRetailPackaging({supplierItemCode,description,quantity,invoiceQuantity:quantity,unit:tmxIsActualQuantity?"ΤΜΧ":supplierTableRow?"ΚΙΒ":textField(p.Unit)||textField(p.UnitOfMeasure)||"",invoiceUnit:tmxIsActualQuantity?"ΤΜΧ":supplierTableRow?"ΚΙΒ":textField(p.Unit)||textField(p.UnitOfMeasure)||"",invoicePiecesColumn:printedPiecesQuantity,unitsPerPackage:tmxIsActualQuantity?0:packageFromText(`${description} ${item?.content||""}`),unitPrice,packageUnitPrice:unitPrice,discount1,discount2,discount3,netUnitCost,netAmount,vatRate,grossAmount,barcode:"",confidence,azureSequence:index+1,azureRawRow:String(item?.content||""),unitPriceRecovered:!numberField(p.UnitPrice)&&unitPrice>0,netAmountRecovered:Math.abs(originalNetAmount-netAmount)>.001,netAmountSource:netRecovery.source,discountRecovered:!explicitDiscounts(p).length&&discounts.length>0,mathValidated:finalMathValid,needsReview:Boolean(netRecovery.needsReview||!finalMathValid)});
  }).filter(x=>x.description||x.supplierItemCode);
  const supplierConfidence=Math.max(pct(f.VendorName?.confidence),pct(f.VendorTaxId?.confidence));
  const headerConfidence=Math.max(supplierConfidence,pct(f.InvoiceId?.confidence),pct(f.InvoiceDate?.confidence));
  const lineConfs=productLines.map(x=>x.confidence).filter(Boolean);
  const aiConfidence=Math.round((lineConfs.reduce((a,b)=>a+b,0)+(headerConfidence||0))/(lineConfs.length+1));
  return {ok:true,provider:"AZURE_DOCUMENT_INTELLIGENCE",model:"azure-prebuilt-invoice",aiConfidence,headerConfidence,supplier:{name:supplierName,taxId:textField(f.VendorTaxId),confidence:supplierConfidence},documentNumber:textField(f.InvoiceId),documentNumberConfidence:pct(f.InvoiceId?.confidence),documentDate:textField(f.InvoiceDate),documentDateConfidence:pct(f.InvoiceDate?.confidence),totalNet:Math.max(0,numberField(f.SubTotal)),totalVat:Math.max(0,numberField(f.TotalTax)),totalGross:Math.max(0,numberField(f.InvoiceTotal)||numberField(f.AmountDue)),productLines,azurePageCount:Array.isArray(result.pages)?result.pages.length:0};
}

function learnedScore(line,k){
  const c=norm(line.supplierItemCode),kc=norm(k.supplierItemCode);if(c&&kc&&c===kc)return 1000;
  const d=norm(line.description),kd=norm(k.description);if(!d||!kd)return 0;if(d===kd)return 900;if(d.includes(kd)||kd.includes(d))return 700;
  const words=String(line.description||"").split(/\s+/).map(norm).filter(x=>x.length>=4);return words.filter(w=>kd.includes(w)).length*40;
}

async function applyLearnedKnowledge(result){
  try{
    const learned=await knowledgeForSupplier({taxId:result?.supplier?.taxId,name:result?.supplier?.name});
    const supplierKnowledge=Array.isArray(learned)?learned:[];
    result.productLines=(result.productLines||[]).map(line=>{
      let best=null,score=0;for(const k of supplierKnowledge){const s=learnedScore(line,k);if(s>score){score=s;best=k}}
      if(!best||score<120)return normalizeRetailPackaging(line);
      return normalizeRetailPackaging({...line,supplierItemCode:line.supplierItemCode||best.supplierItemCode||"",description:best.description||line.description,barcode:best.barcode||line.barcode||"",invoiceUnit:best.invoiceUnit||line.invoiceUnit||line.unit||"",unitsPerPackage:Number(best.unitsPerPackage||line.unitsPerPackage||0),vatRate:Number(best.vatRate??line.vatRate??0),category:best.category||"",subcategory:best.subcategory||"",stockUnit:best.stockUnit||"",conversionFactor:Number(best.conversionFactor||0),internalCode:best.internalCode||"",masterProductId:best.masterProductId||"",masterProductName:best.masterProductName||"",learnedMatch:true,learnedMatchScore:score});
    });
  }catch(error){console.warn("Invoice Learning knowledge apply skipped:",error?.message||error)}
  return result;
}

const lineProperties={supplierItemCode:{type:"string"},description:{type:"string"},quantity:{type:"number",minimum:0},unit:{type:"string"},unitsPerPackage:{type:"number",minimum:0},unitPrice:{type:"number",minimum:0},discount1:{type:"number",minimum:0,maximum:100},discount2:{type:"number",minimum:0,maximum:100},discount3:{type:"number",minimum:0,maximum:100},netUnitCost:{type:"number",minimum:0},netAmount:{type:"number",minimum:0},vatRate:{type:"number",minimum:0,maximum:100},grossAmount:{type:"number",minimum:0},barcode:{type:"string"},confidence:{type:"number",minimum:0,maximum:100}};
const schema={type:"object",additionalProperties:false,properties:{aiConfidence:{type:"number",minimum:0,maximum:100},headerConfidence:{type:"number",minimum:0,maximum:100},supplier:{type:"object",additionalProperties:false,properties:{name:{type:"string"},taxId:{type:"string"},confidence:{type:"number",minimum:0,maximum:100}},required:["name","taxId","confidence"]},documentNumber:{type:"string"},documentNumberConfidence:{type:"number",minimum:0,maximum:100},documentDate:{type:"string"},documentDateConfidence:{type:"number",minimum:0,maximum:100},totalNet:{type:"number",minimum:0},totalVat:{type:"number",minimum:0},totalGross:{type:"number",minimum:0},productLines:{type:"array",maxItems:500,items:{type:"object",additionalProperties:false,properties:lineProperties,required:Object.keys(lineProperties)}}},required:["aiConfidence","headerConfidence","supplier","documentNumber","documentNumberConfidence","documentDate","documentDateConfidence","totalNet","totalVat","totalGross","productLines"]};

router.get("/invoice-learning/ai-status",(req,res)=>res.json({connected:azureConfigured()||Boolean(process.env.OPENAI_API_KEY),azureConfigured:azureConfigured(),openaiConnected:Boolean(process.env.OPENAI_API_KEY),providerOrder:["AZURE_DOCUMENT_INTELLIGENCE","OPENAI"],model:azureConfigured()?AZURE_MODEL_ID:(process.env.OPENAI_INVOICE_MODEL||"gpt-5")}));

router.post("/invoice-learning/ai-recheck",async(req,res,next)=>{try{
  const {filename="invoice",mimeType="image/jpeg",fileData=""}=req.body||{};
  if(!fileData||typeof fileData!=="string")return res.status(400).json({error:"Δεν βρέθηκε το πρωτότυπο PDF/φωτογραφία για AI επανέλεγχο."});
  if(azureConfigured()){
    try{const azure=await applyLearnedKnowledge(normalizeAzure(await callAzure(fileData,mimeType)));if(azure.productLines.length||azure.aiConfidence>=40)return res.json(azure)}catch(error){console.error("Azure Invoice Learning fallback:",error?.message||error)}
  }
  if(!process.env.OPENAI_API_KEY)return res.status(503).json({error:"Το Azure δεν έδωσε ασφαλές αποτέλεσμα και δεν έχει συνδεθεί OPENAI_API_KEY για fallback.",code:"AI_PROVIDER_NOT_CONFIGURED"});
  const base64=String(fileData).includes(",")?String(fileData).split(",").pop():String(fileData);
  const filePart=mimeType==="application/pdf"?{type:"input_file",filename:filename||"invoice.pdf",file_data:base64}:{type:"input_image",image_url:String(fileData).startsWith("data:")?fileData:`data:${mimeType};base64,${base64}`,detail:"high"};
  const prompt="Διάβασε αποκλειστικά το πρωτότυπο ελληνικό τιμολόγιο. Μην χρησιμοποιείς OCR ή προηγούμενα πρόχειρα δεδομένα. Επίστρεψε μόνο πραγματικές γραμμές προϊόντων, supplier code, περιγραφή, ποσότητα, μονάδα, συσκευασία, τιμή, πραγματικές εκπτώσεις, καθαρή αξία, ΦΠΑ, μικτή αξία και barcode μόνο αν φαίνεται. Διασταύρωσε μαθηματικά τιμή, εκπτώσεις, ποσότητα και καθαρή αξία. documentDate σε YYYY-MM-DD.";
  const response=await fetch("https://api.openai.com/v1/responses",{method:"POST",headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`,"Content-Type":"application/json"},body:JSON.stringify({model:process.env.OPENAI_INVOICE_MODEL||"gpt-5",input:[{role:"user",content:[{type:"input_text",text:prompt},filePart]}],text:{format:{type:"json_schema",name:"invoice_learning_extract",strict:true,schema}}})});
  const raw=await response.json().catch(()=>({}));if(!response.ok)return res.status(response.status).json({error:raw?.error?.message||"Απέτυχε ο AI επανέλεγχος.",code:"AI_PROVIDER_ERROR"});
  const text=outputText(raw);if(!text)return res.status(502).json({error:"Το AI δεν επέστρεψε δομημένο αποτέλεσμα."});
  let result;try{result=JSON.parse(text)}catch{return res.status(502).json({error:"Το AI επέστρεψε μη έγκυρο JSON."})}
  result=await applyLearnedKnowledge({ok:true,provider:"OPENAI",model:process.env.OPENAI_INVOICE_MODEL||"gpt-5",...result});
  res.json(result);
}catch(error){next(error)}});

export default router;
