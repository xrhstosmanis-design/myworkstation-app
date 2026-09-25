import crypto from "crypto";
import {Router} from "express";
import {knowledgeForSupplier} from "../lib/invoice-learning-product-knowledge.js";
import {applyCentralSupplierProfile} from "../lib/invoice-supplier-profile-runtime.js";
import {extractAzureColumns,combineAzureRows} from "../lib/invoice-column-reading.js";
import {mobileUploads} from "./mobile-invoice-upload.js";
import {callAzure as callPosAzure} from "./commerce-azure-invoice-reader.js";

const router=Router();
const AZURE_API_VERSION="2024-11-30";
const AZURE_MODEL_ID="prebuilt-invoice";
const OPENAI_FALLBACK_TIMEOUT_MS=Math.max(5000,Math.min(45000,Number(process.env.OPENAI_INVOICE_FALLBACK_TIMEOUT_MS||30000)));
const openAiFallbackModel=()=>process.env.OPENAI_INVOICE_FAST_MODEL||process.env.OPENAI_INVOICE_MODEL||"gpt-5-mini";
// The Learning Lab must not accept whichever stochastic provider response
// happens to arrive first. Keep up to three candidates for the same uploaded
// bytes, choose the strongest mathematically reconciled candidate, and reuse
// that winner for later re-checks during this server process.
const invoiceLearningReadCache=new Map();
const invoiceReadFingerprint=(fileData,mimeType)=>crypto.createHash("sha256").update(`${mimeType}\n${fileData}`,"utf8").digest("hex");
const invoiceCandidateScore=result=>{
  const completeness=result?.completeness||{},lines=Array.isArray(result?.productLines)?result.productLines:[];
  const valid=lines.filter(line=>line?.mathValidated||line?.discountRecovered).length;
  const difference=Number.isFinite(Number(completeness.difference))?Number(completeness.difference):999999;
  return (completeness.complete?10000000:0)+(completeness.requiresLineVatReview?100000:0)+valid*1000+lines.length*100-Math.min(difference,99999)*10+Number(result?.aiConfidence||0);
};
const cacheInvoiceLearningResult=(key,result)=>{
  if(!key||!result||typeof result!=="object")return result;
  const previous=invoiceLearningReadCache.get(key),candidates=Array.isArray(previous?.candidates)?previous.candidates.slice():[];
  candidates.push(result);
  const winner=candidates.slice(-3).sort((a,b)=>invoiceCandidateScore(b)-invoiceCandidateScore(a))[0];
  const stable=candidates.length>=3;
  invoiceLearningReadCache.set(key,{candidates:candidates.slice(-3),winner,stableRead:stable});
  while(invoiceLearningReadCache.size>100)invoiceLearningReadCache.delete(invoiceLearningReadCache.keys().next().value);
  return {...winner,readAttempts:Math.min(candidates.length,3),stableRead:stable};
};

const pct=v=>Math.max(0,Math.min(100,Number(v||0)*100));
const money4=v=>Math.round((Number(v||0)+Number.EPSILON)*10000)/10000;
const norm=v=>String(v||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toUpperCase().replace(/[^A-ZΑ-Ω0-9]/g,"");
// A credit note is identified only from an explicit document heading, never
// from amount signs, previous balances or incidental return wording.
export const detectInvoiceDocumentType=value=>{
  const heading=norm(value);
  return /ΠΙΣΤΩΤΙΚΟ(?:ΤΙΜΟΛΟΓΙΟ)?|ΠΙΣΤΤΙΜ|CREDITNOTE|ΔΕΛΤΙΟΕΠΙΣΤΡΟΦΗΣ/.test(heading)?"CREDIT_NOTE":"INVOICE";
};
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

function tableHeader(cells,matcher){return cells.find(cell=>matcher(String(cell?.content||""),tableText(cell?.content)))}

/* OHONOS prints financial columns explicitly.  The generic invoice model can
 * confuse decimal commas and carton dimensions in descriptions, therefore this
 * template reads only the cells below Quantity / Final Price / Net Value. */
function ohonosTableRows(result){
  for(const table of Array.isArray(result?.tables)?result.tables:[]){
    const cells=Array.isArray(table?.cells)?table.cells:[];
    const code=tableHeader(cells,(_,t)=>t==="ΚΩΔΙΚΟΣ"||t==="KODIKOS");
    const description=tableHeader(cells,(_,t)=>t.includes("ΠΕΡΙΓΡΑΦΗ")||t.includes("DESCRIPTION"));
    const quantity=tableHeader(cells,(_,t)=>t.includes("ΠΟΣΟΤΗΤΑ")||t.includes("QUANTITY"));
    // Depending on the OCR geometry, these headers arrive either merged or
    // as the first word of a two-line header (e.g. "ΤΕΛΙΚΗ" / "ΤΙΜΗ").
    const finalPrice=tableHeader(cells,(_,t)=>t.includes("ΤΕΛΙΚΗΤΙΜΗ")||t.includes("FINALPRICE")||t==="ΤΕΛΙΚΗ");
    const netValue=tableHeader(cells,(_,t)=>t.includes("ΚΑΘΑΡΗΑΞΙΑ")||t.includes("NETVALUE")||t==="ΚΑΘΑΡΗ");
    const grossValue=tableHeader(cells,(_,t)=>t.includes("ΜΙΚΤΗΑΞΙΑ")||t.includes("GROSSVALUE")||t==="ΜΙΚΤΗ");
    const vat=tableHeader(cells,(_,t)=>t==="ΦΠΑ"||t==="VAT");
    const discountRate=tableHeader(cells,(raw,t)=>t.includes("ΕΚΠΤΩΣΗ")&&/%/.test(raw));
    if(!description||!quantity||!finalPrice||!netValue)continue;
    const headerRow=Math.max(description.rowIndex??0,quantity.rowIndex??0,finalPrice.rowIndex??0,netValue.rowIndex??0);
    const rows=new Map();
    for(const cell of cells){
      if((cell?.rowIndex??0)<=headerRow)continue;
      const row=rows.get(cell.rowIndex)||{};rows.set(cell.rowIndex,row);
      if(code&&cell.columnIndex===code.columnIndex)row.supplierItemCode=String(cell.content||"").trim();
      if(cell.columnIndex===description.columnIndex)row.description=String(cell.content||"").trim();
      if(cell.columnIndex===quantity.columnIndex)row.quantity=tableNumber(cell.content);
      if(cell.columnIndex===finalPrice.columnIndex)row.unitPrice=tableNumber(cell.content);
      if(cell.columnIndex===netValue.columnIndex)row.netAmount=tableNumber(cell.content);
      if(grossValue&&cell.columnIndex===grossValue.columnIndex)row.grossAmount=tableNumber(cell.content);
      if(discountRate&&cell.columnIndex===discountRate.columnIndex)row.discount1=tableNumber(cell.content);
      if(vat&&cell.columnIndex===vat.columnIndex)row.vatRate=tableNumber(cell.content);
    }
    for(const row of rows.values()){
      // The rate can be visually split over two header cells.  The printed
      // values still give a safer deterministic recovery than generic OCR.
      if(!(row.discount1>0)&&row.grossAmount>0&&row.netAmount>=0&&row.netAmount<row.grossAmount){
        row.discount1=money4((1-row.netAmount/row.grossAmount)*100);
      }
    }
    const valid=[...rows.values()].filter(row=>row.description&&row.quantity>0&&row.unitPrice>=0&&row.netAmount>=0);
    if(valid.length)return valid;
  }
  return [];
}

function findOhonosRow(rows,supplierItemCode,description){
  const code=tableText(supplierItemCode),wanted=tableText(description);let best=null,bestScore=0;
  for(const row of rows){
    const rowCode=tableText(row.supplierItemCode),rowDescription=tableText(row.description);
    const score=code&&rowCode&&code===rowCode?1000:(rowDescription===wanted?900:(rowDescription.includes(wanted)||wanted.includes(rowDescription)?700:0));
    if(score>bestScore){best=row;bestScore=score}
  }
  return bestScore>=700?best:null;
}


/* Some OHONOS scans arrive without a usable Azure table, but their product
 * row text still preserves the printed financial sequence:
 * quantity, list price, catalogue discount, final price, gross, discount %,
 * discount amount, net, VAT. Accept it only when all printed arithmetic
 * reconciles; this is deliberately not a generic OCR-number heuristic. */
function ohonosRawRow(content,description,supplierItemCode){
  const raw=rowTail(content,description,supplierItemCode);
  const values=[...raw.matchAll(/-?\d+(?:[.,]\d+)?/g)].map(m=>tableNumber(m[0]));
  for(let i=0;i+8<values.length;i++){
    const [quantity,, ,unitPrice,grossAmount,discount1,discountAmount,netAmount,vatRate]=values.slice(i,i+9);
    if(!(quantity>0&&unitPrice>0&&unitPrice<100&&grossAmount>0&&discount1>0&&discount1<60&&netAmount>=0&&[0,6,13,24].includes(Math.round(vatRate))))continue;
    const priceMatches=Math.abs(quantity*unitPrice-grossAmount)<=Math.max(.03,grossAmount*.02);
    const netMatches=Math.abs(grossAmount*(1-discount1/100)-netAmount)<=Math.max(.03,Math.max(netAmount,1)*.02);
    const discountMatches=Math.abs((grossAmount-netAmount)-discountAmount)<=Math.max(.03,Math.max(discountAmount,1)*.03);
    if(priceMatches&&netMatches&&discountMatches)return {quantity,unitPrice,grossAmount,discount1,netAmount,vatRate:Math.round(vatRate)};
  }
  return null;
}
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
 * Preserve the declared stock unit (pieces, grams, etc.). OCR values remain visible for
 * audit (invoiceQuantity/invoiceUnit/packageUnitPrice), while quantity and
 * unitPrice become the values that are safe to send to stock/costing.
 */
function normalizeRetailPackaging(line){
  const raw=String(line?.azureRawRow||line?.rawText||"");
  const invoiceUnit=String(line?.invoiceUnit||line?.unit||"").trim();
  const caseInvoice=line.confirmedPackMapping?Number(line.unitsPerPackage)>1:isCaseUnit(`${invoiceUnit} ${raw}`);
  const pack=Math.max(0,Number(line?.unitsPerPackage||0))||packageFromText(`${line?.description||""} ${raw}`);
  const invoiceQuantity=Math.max(0,Number(line?.invoiceQuantity??line?.quantity??0));
  const packageUnitPrice=Math.max(0,Number(line?.packageUnitPrice??line?.unitPrice??0));
  if(!(caseInvoice&&invoiceQuantity>0&&pack>1&&packageUnitPrice>0))return {...line,invoiceQuantity,invoiceUnit:invoiceUnit||null,packageUnitPrice:packageUnitPrice||null,unitsPerPackage:pack||0};

  const quantity=money4(invoiceQuantity*pack);
  const unitPrice=money4(packageUnitPrice/pack);
  const netAmount=Math.max(0,Number(line?.netAmount||0));
  const netUnitCost=netAmount>0?money4(netAmount/quantity):applyDiscounts(unitPrice,[line?.discount1,line?.discount2,line?.discount3]);
  const grossAmount=Math.max(0,Number(line?.grossAmount||0));
  const stockUnit=String(line?.stockUnit||"PCS").trim()||"PCS";
  return {...line,invoiceQuantity,invoiceUnit:invoiceUnit||"ΚΙΒ",packageUnitPrice,quantity,unit:stockUnit,stockUnit,unitsPerPackage:pack,unitPrice,netUnitCost,netAmount,grossAmount,packageConversionApplied:true,conversionFactor:pack,needsReview:Boolean(line?.needsReview)};
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

// Some providers return the discounted line value but omit the printed
// percentage. Recover only a mathematically provable percentage; do not infer
// a discount when the result is not close to a stable whole/decimal rate.
function applyMathematicalDiscountRecovery(result){
  if(!result||!Array.isArray(result.productLines))return result;
  result.productLines=result.productLines.map(line=>{
    const quantity=Number(line?.quantity||0),unitPrice=Number(line?.unitPrice||0),netAmount=Number(line?.netAmount||0);
    const hasDiscount=[line?.discount1,line?.discount2,line?.discount3].some(value=>Number(value||0)>0);
    if(hasDiscount||!(quantity>0&&unitPrice>0&&netAmount>0))return line;
    const before=quantity*unitPrice,inferred=(1-netAmount/before)*100;
    if(!(inferred>.05&&inferred<60))return line;
    const rounded=Math.abs(inferred-Math.round(inferred))<=.25?Math.round(inferred):Math.round(inferred*100)/100;
    const expected=before*(1-rounded/100);
    if(Math.abs(expected-netAmount)>Math.max(.05,netAmount*.02))return line;
    return {...line,discount1:rounded,discountRecovered:true,netUnitCost:money4(unitPrice*(1-rounded/100))};
  });
  return result;
}

// TALOS prints a stable eight-value financial suffix after TEM:
// quantity, unit price, value before discount, industry discount %, extra discount %,
// amount, net value and VAT %. Accept it only when both equations reconcile.
export function applyTalosVerifiedPrintedRows(result){
  const taxId=String(result?.supplier?.taxId||result?.supplierTaxId||"").replace(/\D/g,""),supplier=norm(result?.supplier?.name||result?.supplierName);
  const lines=Array.isArray(result?.productLines)?result.productLines:[];
  const talosSignatureCodes=new Set(["3759850","4011985","4323717","4332684","8741200","6400600"]);
  const detectedCodes=new Set(lines.map(line=>{
    const explicit=String(line?.supplierItemCode||"").replace(/\D/g,"");
    if(explicit)return explicit;
    return String(line?.azureRawRow||line?.rawText||"").match(/^\s*(\d{6,8})\b/)?.[1]||"";
  }).filter(code=>talosSignatureCodes.has(code)));
  const hasTalosIdentity=taxId==="800802293"||supplier.includes("ΤΑΛΩΣ")||supplier.includes("TALOS");
  const hasExactTalosLayout=lines.length===44&&detectedCodes.size>=5;
  if(!hasTalosIdentity&&!hasExactTalosLayout)return result;
  const close=(a,b,tolerance=Math.max(.03,Math.abs(b)*.008))=>Math.abs(a-b)<=tolerance;
  const productLines=lines.map(line=>{
    const raw=String(line?.azureRawRow||line?.rawText||""),match=raw.match(/\s(?:TEM|ΤΕΜ|TMX|ΤΜΧ)\s+([\s\S]+)$/i);
    if(!match)return line;
    const values=(match[1].replace(/,/g,".").match(/-?\d+(?:\.\d+)?/g)||[]).map(Number).filter(Number.isFinite);
    const candidates=[];
    if(values.length>=8){const [quantity,unitPrice,before,retail,discount1,discountAmount,netAmount,vatRate]=values.slice(-8);candidates.push({quantity,unitPrice,before,retail,discount1,discountAmount,netAmount,vatRate})}
    if(values.length===7){
      const add=(unitPrice,before,retail,discount1,discountAmount,netAmount,vatRate)=>candidates.push({quantity:Math.round(before/unitPrice),unitPrice,before,retail,discount1,discountAmount,netAmount,vatRate});
      add(values[0],values[1],values[2],values[3],values[4],values[5],values[6]);
      add(values[6],values[0],values[1],values[2],values[3],values[4],values[5]);
      add(values[3],values[4],values[5],values[6],values[0],values[1],values[2]);
    }
    const verified=candidates.find(x=>x.quantity>0&&x.unitPrice>0&&x.netAmount>0&&[0,6,13,17,24].includes(x.vatRate)&&close(x.quantity*x.unitPrice,x.before)&&close(x.before-x.discountAmount,x.netAmount)&&close(x.before*(1-x.retail/100)*(1-x.discount1/100),x.netAmount));
    if(!verified)return line;
    const {quantity,unitPrice,before,retail,discount1,discountAmount,netAmount,vatRate}=verified;
    return {...line,quantity,invoiceQuantity:quantity,unitPrice,packageUnitPrice:unitPrice,
      initialAmount:money4(before),retailPrice:null,listPrice:null,discount1:retail,discount2:discount1,discount3:0,
      discount1Amount:money4(discountAmount),netAmount:money4(netAmount),
      netUnitCost:money4(netAmount/quantity),vatRate,grossAmount:money4(netAmount*(1+vatRate/100)),
      mathValidated:true,needsReview:false,quantitySource:"TALOS_PRINTED_ROW_VERIFIED"};
  });
  return {...result,productLines,talosPrintedRowsVerified:true};
}

function discountsReconcile(discounts,quantity,unitPrice,netAmount){
  if(!discounts.length)return false;
  const q=Math.max(0,Number(quantity||0)),price=Math.max(0,Number(unitPrice||0)),amount=Math.max(0,Number(netAmount||0));
  if(!(q>0&&price>0&&amount>0))return true;
  const expected=q*applyDiscounts(price,discounts);
  return Math.abs(expected-amount)<=Math.max(.05,amount*.02);
}

export function retryableAzureFailure(error){
  const message=String(error?.message||error||"");
  return /AZURE_(?:ANALYZE|POLL)_(?:408|409|425|429|5\d\d)\b/.test(message)||/AZURE_TIMEOUT\b|fetch failed|ECONNRESET|ETIMEDOUT|EAI_AGAIN|UND_ERR/i.test(message);
}

export function publicAzureFailureCode(error){
  const message=String(error?.message||error||"");
  const status=message.match(/AZURE_(?:ANALYZE|POLL)_(\d{3})\b/)?.[1];
  if(status==="401")return "AUTH_401";
  if(status==="403")return "ACCESS_403";
  if(status==="404")return "ENDPOINT_OR_MODEL_404";
  if(status==="408")return "TIMEOUT_408";
  if(status==="409"||status==="425")return `SERVICE_${status}`;
  if(status==="429")return "RATE_LIMIT_429";
  if(status&&status.startsWith("5"))return `SERVICE_${status}`;
  if(/AZURE_TIMEOUT|ETIMEDOUT/i.test(message))return "TIMEOUT";
  if(/fetch failed|ECONNRESET|EAI_AGAIN|UND_ERR/i.test(message))return "NETWORK";
  if(/AZURE_NO_OPERATION_LOCATION/i.test(message))return "MISSING_OPERATION_LOCATION";
  if(/AZURE_(?:FAILED|CANCELED)/i.test(message))return "ANALYSIS_FAILED";
  if(/AZURE_EMPTY_DOCUMENT/i.test(message))return "EMPTY_DOCUMENT";
  return "UNKNOWN";
}

async function callAzure(fileData,mimeType){
  let lastError;
  for(let attempt=1;attempt<=3;attempt++){
    try{
      // Use the exact transport used by the working POS invoice reader.
      // Invoice Learning keeps its supplier-specific normalization below, but
      // endpoint construction, authentication, upload and polling have one
      // authoritative implementation for both entry points.
      return await callPosAzure({contentData:fileData,mimeType});
    }catch(error){
      lastError=error;
      if(attempt===3||!retryableAzureFailure(error))throw error;
      console.warn("Azure Invoice Learning transient failure; retrying.",{attempt,reason:String(error?.message||error).slice(0,120)});
      await new Promise(resolve=>setTimeout(resolve,attempt*800));
    }
  }
  throw lastError;
}

function normalizeAzure(payload){
  const result=payload?.analyzeResult||{},doc=result.documents?.[0]||{},f=doc.fields||{};
  const documentText=[textField(f.InvoiceType),textField(f.DocumentType),...(result.pages||[]).flatMap(page=>(page.words||[]).map(word=>word?.content||""))].join(" ");
  const items=Array.isArray(f.Items?.valueArray)?f.Items.valueArray:[];
  const supplierName=textField(f.VendorName)||textField(f.VendorAddressRecipient);
  const antzoulatosRows=isAntzoulatos(supplierName)?antzoulatosTableRows(result):[];
  // VendorName is not reliable on some OHONOS scans.  The table itself has a
  // distinctive set of financial columns, and every selected row must still
  // match the invoice product code or description before it can override OCR.
  // Therefore this is intentionally detected from table geometry, not gated
  // by the supplier label returned by Azure.
  const ohonosRows=ohonosTableRows(result);
  let productLines=items.map((item,index)=>{
    const p=item?.valueObject||{};
    const supplierItemCode=textField(p.ProductCode)||textField(p.ItemCode)||textField(p.Code);
    const description=textField(p.Description)||textField(p.ProductName)||textField(p.ItemDescription);
    const extractedQuantity=Math.max(0,numberField(p.Quantity));
    const supplierTableRow=findAntzoulatosRow(antzoulatosRows,description);
    const ohonosTableRow=findOhonosRow(ohonosRows,supplierItemCode,description);
    const ohonosRow=ohonosTableRow||ohonosRawRow(item?.content,description,supplierItemCode);
    const kibQuantity=Math.max(0,Number(supplierTableRow?.kibQuantity||extractedQuantity));
    const printedPiecesQuantity=Math.max(0,Number(supplierTableRow?.tmxQuantity||0));
    let quantity=Math.max(0,Number(ohonosRow?.quantity||kibQuantity));
    let netAmount=Math.max(0,Number(ohonosRow?.netAmount??numberField(p.Amount)));
    let unitPrice=Math.max(0,Number(ohonosRow?.unitPrice??numberField(p.UnitPrice)));
    if(!unitPrice)unitPrice=recoverUnitPriceFromRow(item?.content,quantity,netAmount,description,supplierItemCode);
    // In this supplier's template, TMX can be the actual stock quantity while
    // KIB is only the ordering unit.  Use it only when the printed price and
    // line total reconcile, so a carton price is never mistaken for a piece price.
    const tmxIsActualQuantity=Boolean(supplierTableRow&&printedPiecesQuantity>kibQuantity&&unitPrice>0&&netAmount>0&&Math.abs(printedPiecesQuantity*unitPrice-netAmount)<=Math.max(.05,netAmount*.02));
    if(tmxIsActualQuantity)quantity=printedPiecesQuantity;
    // If the multiplication does not reconcile, the TMX cell is the printed
    // pack size (for example 1 KIB / 10 TMX / €14.50), not the stock quantity.
    const unitsPerPackage=tmxIsActualQuantity?0:(Math.max(0,printedPiecesQuantity>kibQuantity?printedPiecesQuantity:0)||packageFromText(`${description} ${item?.content||""}`));
    const originalNetAmount=netAmount;
    const netRecovery=recoverNetAmountFromRow(item?.content,quantity,unitPrice,netAmount,description,supplierItemCode);
    netAmount=netRecovery.amount;
    const tax=Math.max(0,numberField(p.Tax));
    let vatRate=Math.round(Math.max(0,numberField(p.TaxRate)));if(![0,6,13,24].includes(vatRate))vatRate=0;
    let discounts=ohonosRow?.discount1>0?[ohonosRow.discount1]:explicitDiscounts(p);
    if(discounts.length&&!discountsReconcile(discounts,quantity,unitPrice,netAmount))discounts=[];
    if(!discounts.length)discounts=recoverDiscountsFromMath(item?.content,quantity,unitPrice,netAmount);
    const discount1=discounts[0]||0,discount2=discounts[1]||0,discount3=discounts[2]||0;
    const netUnitCost=unitPrice>0?applyDiscounts(unitPrice,discounts):(quantity>0&&netAmount>0?money4(netAmount/quantity):0);
    const mathematicallyValid=quantity>0&&unitPrice>0&&netAmount>0?Math.abs(quantity*netUnitCost-netAmount)<=Math.max(.05,netAmount*.02):false;
    if(!mathematicallyValid&&quantity>0&&unitPrice>0){
      netAmount=money4(quantity*netUnitCost);
    }
    if(ohonosRow){vatRate=Math.round(Number(ohonosRow.vatRate||vatRate));if(![0,6,13,24].includes(vatRate))vatRate=0}
    const grossAmount=netAmount>0?money4(netAmount+(tax>0?tax:netAmount*vatRate/100)):0;
    const confidence=Math.max(pct(item?.confidence),pct(p.Description?.confidence),pct(p.Quantity?.confidence),pct(p.UnitPrice?.confidence),pct(p.Amount?.confidence));
    const finalMathValid=quantity>0&&unitPrice>0&&netAmount>0?Math.abs(quantity*netUnitCost-netAmount)<=Math.max(.05,netAmount*.02):false;
    return normalizeRetailPackaging({supplierItemCode:ohonosTableRow?.supplierItemCode||supplierItemCode,description:ohonosTableRow?.description||description,quantity,invoiceQuantity:quantity,unit:ohonosRow?"PCS":tmxIsActualQuantity?"ΤΜΧ":supplierTableRow?"ΚΙΒ":textField(p.Unit)||textField(p.UnitOfMeasure)||"",stockUnit:ohonosRow?"PCS":"",invoiceUnit:ohonosRow?"PCS":tmxIsActualQuantity?"ΤΜΧ":supplierTableRow?"ΚΙΒ":textField(p.Unit)||textField(p.UnitOfMeasure)||"",invoicePiecesColumn:printedPiecesQuantity,unitsPerPackage:ohonosRow?0:unitsPerPackage,unitPrice,packageUnitPrice:unitPrice,discount1,discount2,discount3,netUnitCost,netAmount,vatRate,grossAmount,barcode:"",confidence,azureSequence:index+1,azureRawRow:String(item?.content||""),unitPriceRecovered:!numberField(p.UnitPrice)&&unitPrice>0,netAmountRecovered:Math.abs(originalNetAmount-netAmount)>.001,netAmountSource:netRecovery.source,discountRecovered:!explicitDiscounts(p).length&&discounts.length>0,mathValidated:finalMathValid,needsReview:Boolean(netRecovery.needsReview||!finalMathValid)});
  }).filter(x=>x.description||x.supplierItemCode);
  productLines=combineAzureRows(productLines,extractAzureColumns(result)).map(line=>line.sourceColumnMap?{...line,supplierItemCode:line.code,unitPrice:line.unitCost,invoiceQuantity:line.quantity,invoiceUnit:line.unit,netUnitCost:line.quantity>0?line.netAmount/line.quantity:0,confidence:pct(doc.confidence),mathValidated:line.sourceColumnsVerified,needsReview:!line.sourceColumnsVerified}:line);
  const supplierConfidence=Math.max(pct(f.VendorName?.confidence),pct(f.VendorTaxId?.confidence));
  const headerConfidence=Math.max(supplierConfidence,pct(f.InvoiceId?.confidence),pct(f.InvoiceDate?.confidence));
  const lineConfs=productLines.map(x=>x.confidence).filter(Boolean);
  const aiConfidence=Math.round((lineConfs.reduce((a,b)=>a+b,0)+(headerConfidence||0))/(lineConfs.length+1));
  return {ok:true,provider:"AZURE_DOCUMENT_INTELLIGENCE",model:"azure-prebuilt-invoice",documentType:detectInvoiceDocumentType(documentText),aiConfidence,headerConfidence,supplier:{name:supplierName,taxId:textField(f.VendorTaxId),confidence:supplierConfidence},documentNumber:textField(f.InvoiceId),documentNumberConfidence:pct(f.InvoiceId?.confidence),documentDate:textField(f.InvoiceDate),documentDateConfidence:pct(f.InvoiceDate?.confidence),totalNet:Math.max(0,numberField(f.SubTotal)),totalVat:Math.max(0,numberField(f.TotalTax)),totalGross:Math.max(0,numberField(f.InvoiceTotal)||numberField(f.AmountDue)),productLines,azurePageCount:Array.isArray(result.pages)?result.pages.length:0};
}

function invoiceLineGross(line){
  const explicit=Math.max(0,Number(line?.grossAmount||0));
  if(explicit>0)return explicit;
  const net=Math.max(0,Number(line?.netAmount||0)),vat=Math.max(0,Number(line?.vatRate||0));
  return net>0?net*(1+vat/100):0;
}

function invoiceLineFingerprint(line){
  return [
    norm(line?.supplierItemCode),norm(line?.description),Number(line?.quantity||0).toFixed(4),
    Number(line?.unitPrice||0).toFixed(4),Number(line?.netAmount||0).toFixed(2),
    Number(line?.vatRate||0).toFixed(2),Number(invoiceLineGross(line)).toFixed(2),
    Number(line?.discount1||0).toFixed(2),Number(line?.discount2||0).toFixed(2),Number(line?.discount3||0).toFixed(2),
  ].join("|");
}

// Use the same independently-totalled duplicate safeguard as the POS reader.
// A row may be removed only when exactly one identical pair exists, one copy's
// gross is the entire overage, and the remaining rows reconcile to the footer.
export function collapseExactDuplicateInvoiceOverage(lines,invoiceTotal){
  const source=Array.isArray(lines)?lines:[],total=money4(invoiceTotal||0),tolerance=.05;
  const lineTotal=money4(source.reduce((sum,line)=>sum+invoiceLineGross(line),0));
  const overage=money4(lineTotal-total);
  if(!(total>0)||source.length<2||overage<=tolerance)return {lines:source,collapsed:false};
  const groups=new Map();
  source.forEach((line,index)=>{
    const fingerprint=invoiceLineFingerprint(line),indexes=groups.get(fingerprint)||[];
    indexes.push(index);groups.set(fingerprint,indexes);
  });
  const candidates=[];
  for(const indexes of groups.values()){
    if(indexes.length!==2)continue;
    const gross=money4(invoiceLineGross(source[indexes[0]]));
    if(gross>0&&Math.abs(gross-overage)<=tolerance)candidates.push(indexes[1]);
  }
  if(candidates.length!==1)return {lines:source,collapsed:false};
  const removeIndex=candidates[0],collapsed=source.filter((_,index)=>index!==removeIndex);
  const collapsedTotal=money4(collapsed.reduce((sum,line)=>sum+invoiceLineGross(line),0));
  if(Math.abs(collapsedTotal-total)>tolerance)return {lines:source,collapsed:false};
  return {lines:collapsed,collapsed:true,removed:1,overage};
}

function repairExactDuplicateInvoiceOverage(result){
  const repair=collapseExactDuplicateInvoiceOverage(result?.productLines,result?.totalGross);
  return repair.collapsed?{...result,productLines:repair.lines,exactDuplicateRowCollapsed:true,exactDuplicateRowRemoved:repair.removed,exactDuplicateRowOverage:repair.overage}:result;
}

export function invoiceReadingCompleteness(result){
  const lines=Array.isArray(result?.productLines)?result.productLines:[];
  if(!lines.length)return {complete:false,reason:"NO_PRODUCT_LINES",lineGross:0,totalGross:Math.max(0,Number(result?.totalGross||0)),difference:null};
  const totalGross=Math.max(0,Number(result?.totalGross||0));
  const lineGross=money4(lines.reduce((sum,line)=>sum+invoiceLineGross(line),0));
  if(!(totalGross>0)||!(lineGross>0))return {complete:true,reason:"TOTAL_NOT_AVAILABLE",lineGross,totalGross,difference:null};
  const difference=money4(Math.abs(totalGross-lineGross)),tolerance=.05;
  if(difference<=tolerance)return {complete:true,reason:"RECONCILED",lineGross,totalGross,difference};

  // Azure occasionally returns every printed product row with its net value,
  // but omits VAT at line level. In that case lineGross is actually the sum of
  // the line net values. Accept the result only when both independent footer
  // equations reconcile: lines == printed net and net + VAT == printed total.
  // This keeps the partial-table guard intact while allowing a review draft;
  // missing per-line VAT remains visible for confirmation in the Learning Lab.
  const lineNet=money4(lines.reduce((sum,line)=>sum+Math.max(0,Number(line?.netAmount||0)),0));
  const totalNet=Math.max(0,Number(result?.totalNet||0));
  const totalVat=Math.max(0,Number(result?.totalVat||0));
  const netDifference=money4(Math.abs(totalNet-lineNet));
  const footerDifference=money4(Math.abs(totalGross-(totalNet+totalVat)));
  const headerVatReconciled=totalNet>0&&totalVat>0&&lineNet>0&&netDifference<=tolerance&&footerDifference<=tolerance;
  if(headerVatReconciled)return {complete:true,reason:"RECONCILED_BY_HEADER_VAT",lineGross,totalGross,difference,lineNet,totalNet,totalVat,netDifference,footerDifference,requiresLineVatReview:true};
  // Some Azure invoice layouts expose TotalTax and InvoiceTotal but omit
  // SubTotal. When every line also lacks line-level VAT, the printed net is
  // still independently derivable as InvoiceTotal - TotalTax. Accept only if
  // that derived net equals the sum of every extracted net line.
  const lineLevelVatMissing=lines.every(line=>{
    const net=Math.max(0,Number(line?.netAmount||0));
    const gross=Math.max(0,Number(line?.grossAmount||0));
    return Math.max(0,Number(line?.vatRate||0))===0&&(!(gross>0)||Math.abs(gross-net)<=tolerance);
  });
  const derivedTotalNet=money4(totalGross-totalVat);
  const derivedNetDifference=money4(Math.abs(derivedTotalNet-lineNet));
  const derivedHeaderVatReconciled=totalVat>0&&derivedTotalNet>0&&lineNet>0&&lineLevelVatMissing&&derivedNetDifference<=tolerance;
  if(derivedHeaderVatReconciled)return {complete:true,reason:"RECONCILED_BY_DERIVED_HEADER_VAT",lineGross,totalGross,difference,lineNet,totalNet,totalVat,derivedTotalNet,derivedNetDifference,requiresLineVatReview:true};
  return {complete:false,reason:"PARTIAL_PRODUCT_LINES",lineGross,totalGross,difference,lineNet,totalNet,totalVat,netDifference,footerDifference};
}

function sameInvoiceLine(a,b){
  const aCode=norm(a?.supplierItemCode),bCode=norm(b?.supplierItemCode);
  if(aCode&&bCode)return aCode===bCode;
  const aDescription=norm(a?.description),bDescription=norm(b?.description);
  return Boolean(aDescription&&bDescription&&aDescription===bDescription);
}

function lineInformationScore(line){
  return ["supplierItemCode","description","quantity","unitPrice","netAmount","grossAmount","vatRate","barcode"]
    .reduce((score,key)=>score+(line?.[key]?1:0),0)+Math.max(0,Number(line?.confidence||0))/100;
}

function descriptionsOverlap(a,b){
  const left=String(a||"").split(/\s+/).map(norm).filter(word=>word.length>=4);
  const right=String(b||"").split(/\s+/).map(norm).filter(word=>word.length>=4);
  return left.some(word=>right.includes(word));
}

function crossProviderEconomicMatch(a,b,overage){
  if(a?.providerOrigin===b?.providerOrigin||!a?.providerOrigin||!b?.providerOrigin)return false;
  const aGross=money4(invoiceLineGross(a)),bGross=money4(invoiceLineGross(b)),tolerance=.05;
  if(!(aGross>0&&bGross>0)||Math.abs(aGross-bGross)>tolerance||Math.abs(aGross-overage)>tolerance)return false;
  const aCode=norm(a?.supplierItemCode),bCode=norm(b?.supplierItemCode);
  const identity=(aCode&&bCode&&aCode===bCode)||descriptionsOverlap(a?.description,b?.description);
  if(!identity)return false;
  const pairs=[[a?.quantity,b?.quantity,.001],[a?.unitPrice,b?.unitPrice,.001],[a?.netAmount,b?.netAmount,.05]];
  const economicMatches=pairs.filter(([left,right,tol])=>Number(left)>0&&Number(right)>0&&Math.abs(Number(left)-Number(right))<=tol).length;
  return economicMatches>=2;
}

export function collapseCrossProviderDuplicateOverage(lines,invoiceTotal){
  const source=Array.isArray(lines)?lines:[],total=money4(invoiceTotal||0),tolerance=.05;
  const lineTotal=money4(source.reduce((sum,line)=>sum+invoiceLineGross(line),0)),overage=money4(lineTotal-total);
  if(!(total>0)||source.length<2||overage<=tolerance)return {lines:source,collapsed:false};
  const candidates=[];
  for(let left=0;left<source.length;left++)for(let right=left+1;right<source.length;right++){
    if(crossProviderEconomicMatch(source[left],source[right],overage))candidates.push([left,right]);
  }
  if(candidates.length!==1)return {lines:source,collapsed:false};
  const [left,right]=candidates[0];
  const primary=lineInformationScore(source[right])>=lineInformationScore(source[left])?source[right]:source[left];
  const secondary=primary===source[right]?source[left]:source[right];
  const keepIndex=primary===source[right]?right:left,removeIndex=keepIndex===right?left:right;
  const collapsed=source.map((line,index)=>index===keepIndex?{...secondary,...primary,providerOrigin:"AZURE+OPENAI",crossProviderEconomicMatched:true}:line).filter((_,index)=>index!==removeIndex);
  const collapsedTotal=money4(collapsed.reduce((sum,line)=>sum+invoiceLineGross(line),0));
  if(Math.abs(collapsedTotal-total)>tolerance)return {lines:source,collapsed:false};
  return {lines:collapsed,collapsed:true,removed:1,overage};
}

/* Azure and OpenAI can each miss a different printed row. Combine them as a
 * multiset (so repeated products remain repeated), but this result is usable
 * only after invoiceReadingCompleteness independently reconciles the footer. */
export function mergeProviderInvoiceDrafts(azure,openai){
  const azureLines=Array.isArray(azure?.productLines)?azure.productLines:[];
  const aiLines=Array.isArray(openai?.productLines)?openai.productLines:[];
  const merged=azureLines.map(line=>({...line,providerOrigin:"AZURE"})),matched=new Set();
  for(const aiLine of aiLines){
    const index=merged.findIndex((line,i)=>!matched.has(i)&&sameInvoiceLine(line,aiLine));
    if(index<0){merged.push({...aiLine,providerOrigin:"OPENAI"});matched.add(merged.length-1);continue}
    matched.add(index);
    const primary=lineInformationScore(aiLine)>=lineInformationScore(merged[index])?aiLine:merged[index];
    const secondary=primary===aiLine?merged[index]:aiLine;
    merged[index]={...secondary,...primary,providerOrigin:"AZURE+OPENAI",hybridMatched:true};
  }
  const base={
    ...azure,
    ...openai,
    provider:"AZURE_DOCUMENT_INTELLIGENCE+OPENAI",
    model:`${azure?.model||"azure-prebuilt-invoice"}+${openai?.model||"openai"}`,
    supplier:openai?.supplier?.name||openai?.supplier?.taxId?openai.supplier:azure?.supplier,
    documentNumber:openai?.documentNumber||azure?.documentNumber||"",
    documentDate:openai?.documentDate||azure?.documentDate||"",
    totalNet:Number(openai?.totalNet||azure?.totalNet||0),
    totalVat:Number(openai?.totalVat||azure?.totalVat||0),
    totalGross:Number(openai?.totalGross||azure?.totalGross||0),
    productLines:merged,
    hybridRecovery:true,
  };
  const repair=collapseCrossProviderDuplicateOverage(base.productLines,base.totalGross);
  return repair.collapsed?{...base,productLines:repair.lines,crossProviderDuplicateCollapsed:true,crossProviderDuplicateRemoved:repair.removed,crossProviderDuplicateOverage:repair.overage}:base;
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
      return normalizeRetailPackaging({...line,supplierItemCode:line.supplierItemCode||best.supplierItemCode||"",description:best.description||line.description,barcode:best.barcode||line.barcode||"",invoiceUnit:line.confirmedPackMapping?line.invoiceUnit:best.invoiceUnit||line.invoiceUnit||line.unit||"",unitsPerPackage:line.confirmedPackMapping?Number(line.unitsPerPackage):Number(best.unitsPerPackage||line.unitsPerPackage||0),vatRate:line.sourceColumnMap?Number(line.vatRate||0):Number(best.vatRate??line.vatRate??0),category:best.category||"",subcategory:best.subcategory||"",stockUnit:line.confirmedPackMapping?(line.stockUnit||best.stockUnit||""):(best.stockUnit||line.stockUnit||""),conversionFactor:Number(best.conversionFactor||0),internalCode:best.internalCode||"",masterProductId:best.masterProductId||"",masterProductName:best.masterProductName||"",learnedMatch:true,learnedMatchScore:score});
    });
  }catch(error){console.warn("Invoice Learning knowledge apply skipped:",error?.message||error)}
  return result;
}

const lineProperties={rawText:{type:"string"},supplierItemCode:{type:"string"},description:{type:"string"},quantity:{type:"number",minimum:0},unit:{type:"string"},unitsPerPackage:{type:"number",minimum:0},unitPrice:{type:"number",minimum:0},discount1:{type:"number",minimum:0,maximum:100},discount2:{type:"number",minimum:0,maximum:100},discount3:{type:"number",minimum:0,maximum:100},netUnitCost:{type:"number",minimum:0},netAmount:{type:"number",minimum:0},vatRate:{type:"number",minimum:0,maximum:100},grossAmount:{type:"number",minimum:0},barcode:{type:"string"},confidence:{type:"number",minimum:0,maximum:100}};
const schema={type:"object",additionalProperties:false,properties:{documentType:{type:"string",enum:["INVOICE","CREDIT_NOTE"]},aiConfidence:{type:"number",minimum:0,maximum:100},headerConfidence:{type:"number",minimum:0,maximum:100},supplier:{type:"object",additionalProperties:false,properties:{name:{type:"string"},taxId:{type:"string"},confidence:{type:"number",minimum:0,maximum:100}},required:["name","taxId","confidence"]},documentNumber:{type:"string"},documentNumberConfidence:{type:"number",minimum:0,maximum:100},documentDate:{type:"string"},documentDateConfidence:{type:"number",minimum:0,maximum:100},totalNet:{type:"number",minimum:0},totalVat:{type:"number",minimum:0},totalGross:{type:"number",minimum:0},productLines:{type:"array",maxItems:500,items:{type:"object",additionalProperties:false,properties:lineProperties,required:Object.keys(lineProperties)}}},required:["documentType","aiConfidence","headerConfidence","supplier","documentNumber","documentNumberConfidence","documentDate","documentDateConfidence","totalNet","totalVat","totalGross","productLines"]};

const isPlatformSuper=req=>req.user?.isSuperAdmin===true||req.user?.platformRole==="SUPER_ADMIN"||req.user?.role==="SUPER_ADMIN";
const platformUploadOwner=req=>String(req.user?.id||req.user?.userId||req.user?.sub||"");

export function mergeInvoiceLearningPages(pageDrafts=[]){
  const pages=pageDrafts.filter(Boolean),first=pages[0]||{},lastWithTotal=[...pages].reverse().find(page=>Number(page?.totalGross||0)>0)||pages.at(-1)||{};
  return {
    ...first,
    supplier:pages.find(page=>page?.supplier?.taxId||page?.supplier?.name)?.supplier||first.supplier,
    documentNumber:pages.find(page=>page?.documentNumber)?.documentNumber||first.documentNumber||"",
    documentDate:pages.find(page=>page?.documentDate)?.documentDate||first.documentDate||"",
    documentType:pages.some(page=>page?.documentType==="CREDIT_NOTE")?"CREDIT_NOTE":"INVOICE",
    totalNet:Number(lastWithTotal.totalNet||0),
    totalVat:Number(lastWithTotal.totalVat||0),
    totalGross:Number(lastWithTotal.totalGross||0),
    productLines:pages.flatMap(page=>Array.isArray(page?.productLines)?page.productLines:[]),
    azurePageCount:pages.reduce((sum,page)=>sum+Math.max(1,Number(page?.azurePageCount||0)),0),
    sourcePageCount:pages.length,
  };
}

router.post("/invoice-learning/mobile-upload-sessions",(req,res)=>{
  if(!isPlatformSuper(req))return res.status(403).json({error:"Απαιτείται πρόσβαση Platform Super Admin."});
  const ownerKey=platformUploadOwner(req);
  if(!ownerKey)return res.status(401).json({error:"Απαιτείται σύνδεση."});
  const id=crypto.randomUUID(),token=crypto.randomBytes(24).toString("base64url");
  mobileUploads.set(id,{ownerKey,companyId:req.user?.companyId||null,token,expires:Date.now()+600000,source:"INVOICE_LEARNING_LAB"});
  res.status(201).json({id,url:`${req.protocol}://${req.get("host")}/mobile-invoice-upload/${id}/${token}`,expiresInSeconds:600});
});

router.get("/invoice-learning/mobile-upload-sessions/:id",(req,res)=>{
  if(!isPlatformSuper(req))return res.status(403).json({error:"Απαιτείται πρόσβαση Platform Super Admin."});
  const upload=mobileUploads.get(req.params.id),ownerKey=platformUploadOwner(req);
  if(!upload||upload.ownerKey!==ownerKey||upload.source!=="INVOICE_LEARNING_LAB"||upload.expires<Date.now())return res.status(404).json({error:"Το QR έληξε."});
  res.json(upload.dataUrl?{status:"READY",dataUrl:upload.dataUrl,filename:upload.filename,mimeType:upload.mimeType}:{status:"WAITING"});
});

router.get("/invoice-learning/ai-status",(req,res)=>res.json({connected:azureConfigured()||Boolean(process.env.OPENAI_API_KEY),azureConfigured:azureConfigured(),azureState:azureConfigured()?"READY":"NOT_CONFIGURED",openaiConnected:Boolean(process.env.OPENAI_API_KEY),providerOrder:["AZURE_DOCUMENT_INTELLIGENCE","OPENAI"],model:azureConfigured()?AZURE_MODEL_ID:(process.env.OPENAI_INVOICE_MODEL||"gpt-5")}));

router.post("/invoice-learning/ai-recheck",async(req,res,next)=>{try{
  const {filename="invoice",mimeType="image/jpeg",fileData=""}=req.body||{};
  const requestedSupplierTaxId=String(req.body?.supplierTaxId||"").replace(/\D/g,"").slice(0,16),requestedSupplierName=String(req.body?.supplierName||"").trim().slice(0,240);
  const withRequestedSupplierIdentity=result=>({...result,supplier:{...(result?.supplier||{}),...(requestedSupplierName?{name:requestedSupplierName}:{}),...(requestedSupplierTaxId?{taxId:requestedSupplierTaxId}:{})}});
  const requestedPages=Array.isArray(req.body?.pages)?req.body.pages:[],pages=(requestedPages.length?requestedPages:[{filename,mimeType,fileData}]).map((page,index)=>({filename:String(page?.filename||`invoice-page-${index+1}`),mimeType:String(page?.mimeType||"image/jpeg"),fileData:page?.fileData}));
  if(!pages.length||pages.length>5||pages.some(page=>!page.fileData||typeof page.fileData!=="string"))return res.status(400).json({error:"Επίλεξε από 1 έως 5 έγκυρες σελίδες του ίδιου τιμολογίου."});
  if(pages.length>1&&pages.some(page=>page.mimeType==="application/pdf"))return res.status(400).json({error:"Επίλεξε είτε ένα PDF είτε έως 5 φωτογραφίες του ίδιου τιμολογίου."});
  const readFingerprint=invoiceReadFingerprint(pages.map(page=>page.fileData).join("|PAGE|"),pages.map(page=>page.mimeType).join("|")),cachedRead=invoiceLearningReadCache.get(readFingerprint);
  if(cachedRead?.stableRead){
    // Supplier layout rules can be corrected between two checks of the same
    // image. Reapply current central knowledge to the cached raw rows instead
    // of returning the stale pre-correction interpretation.
    const refreshed=applyTalosVerifiedPrintedRows(await applyLearnedKnowledge(await applyCentralSupplierProfile(withRequestedSupplierIdentity(structuredClone(cachedRead.winner)))));
    const completeness=invoiceReadingCompleteness(refreshed);
    return res.json({...refreshed,completeness,readAttempts:cachedRead.candidates.length,stableRead:true,readFingerprint:readFingerprint.slice(0,16),sameImageCached:true,profileReapplied:true});
  }
  const cacheResult=result=>cacheInvoiceLearningResult(readFingerprint,result);
  let azureFailure="",azureFailureCode="",azureDraft=null,azureState=azureConfigured()?"NO_SAFE_RESULT":"NOT_CONFIGURED";
  if(azureConfigured()){
    try{
      const azurePages=[];
      for(const page of pages)azurePages.push(normalizeAzure(await callAzure(page.fileData,page.mimeType)));
      let azure=mergeInvoiceLearningPages(azurePages);
      azure=await applyCentralSupplierProfile(withRequestedSupplierIdentity(azure));
      azure=applyTalosVerifiedPrintedRows(repairExactDuplicateInvoiceOverage(await applyLearnedKnowledge(azure)));
      azureDraft=azure;
      const completeness=invoiceReadingCompleteness(azure);
      if(completeness.complete)return res.json(cacheResult({...azure,azureState:"READY",completeness}))
      azureFailure=completeness.reason;azureState="NO_SAFE_RESULT";
      console.warn("Azure Invoice Learning incomplete result; falling back to OpenAI.",{reason:completeness.reason,lineGross:completeness.lineGross,totalGross:completeness.totalGross,difference:completeness.difference});
    }catch(error){azureFailure=String(error?.message||error);azureFailureCode=publicAzureFailureCode(error);azureState="REQUEST_FAILED";console.error("Azure Invoice Learning request failed.",{code:azureFailureCode,reason:azureFailure.slice(0,300)})}
  }
  // Match the POS provider chain: Azure is preferred, but an Azure transport
  // failure must not prevent the configured OpenAI fallback from reading the
  // original document. Economic completeness checks below still fail closed.
  if(!process.env.OPENAI_API_KEY)return res.status(503).json({error:azureState==="REQUEST_FAILED"?`Η σύνδεση με το Azure Document Intelligence απέτυχε (${azureFailureCode}) και δεν έχει συνδεθεί OPENAI_API_KEY για fallback.`:"Το Azure δεν έδωσε ασφαλές αποτέλεσμα και δεν έχει συνδεθεί OPENAI_API_KEY για fallback.",code:"AI_PROVIDER_NOT_CONFIGURED",azureState,azureFailureCode:azureFailureCode||undefined});
  const fileParts=pages.map(page=>{const base64=String(page.fileData).includes(",")?String(page.fileData).split(",").pop():String(page.fileData);return page.mimeType==="application/pdf"?{type:"input_file",filename:page.filename||"invoice.pdf",file_data:base64}:{type:"input_image",image_url:String(page.fileData).startsWith("data:")?page.fileData:`data:${page.mimeType};base64,${base64}`,detail:"high"}});
  const prompt="Διάβασε αποκλειστικά το πρωτότυπο ελληνικό τιμολόγιο. Μην χρησιμοποιείς OCR ή προηγούμενα πρόχειρα δεδομένα. Επίστρεψε documentType CREDIT_NOTE μόνο αν ο τίτλος του παραστατικού γράφει ρητά Πιστωτικό Τιμολόγιο, Πιστ. Τιμ., Δελτίο Επιστροφής ή Credit Note· αλλιώς INVOICE. Το Τιμολόγιο Πώλησης ή Τιμολόγιο Πώλησης - Δελτίο Αποστολής είναι πάντοτε INVOICE. Μην συμπεραίνεις πιστωτικό από αρνητικό ποσό, προηγούμενο υπόλοιπο ή μεμονωμένη λέξη επιστροφή. Διάβασε τον πίνακα ειδών γραμμή-γραμμή: κάθε ορατή γραμμή προϊόντος πρέπει να γίνει ένα ξεχωριστό productLines στοιχείο, ακόμη και αν έχει ίδιο κωδικό/περιγραφή με άλλη γραμμή. Για κάθε productLines στοιχείο, το rawText πρέπει να είναι πιστή μεταγραφή ολόκληρης της φυσικής τυπωμένης γραμμής, από τον πρώτο κωδικό έως την τελευταία στήλη, με όλους τους αριθμούς και τη μονάδα ακριβώς στην τυπωμένη σειρά· μην αναδιατάξεις και μην υπολογίσεις το rawText. Μην επιστρέψεις κενό productLines όταν βλέπεις πίνακα ειδών. Επίστρεψε μόνο πραγματικές γραμμές προϊόντων, supplier code, περιγραφή, ποσότητα, μονάδα, συσκευασία, τιμή, πραγματικές εκπτώσεις, καθαρή αξία, ΦΠΑ, μικτή αξία και barcode μόνο αν φαίνεται. Διασταύρωσε μαθηματικά τιμή, εκπτώσεις, ποσότητα και καθαρή αξία. documentDate σε YYYY-MM-DD.";
  const callOpenAiFallback=retry=>fetch("https://api.openai.com/v1/responses",{method:"POST",headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`,"Content-Type":"application/json"},signal:AbortSignal.timeout(OPENAI_FALLBACK_TIMEOUT_MS),body:JSON.stringify({model:openAiFallbackModel(),reasoning:{effort:"minimal"},input:[{role:"user",content:[{type:"input_text",text:`${retry?`${prompt} ΑΠΑΙΤΕΙΤΑΙ έγκυρο JSON που ακολουθεί ακριβώς το schema.`:prompt} Το παραστατικό έχει ${pages.length} ${pages.length===1?"σελίδα":"σελίδες"}. Διάβασέ τες όλες με τη σειρά και επέστρεψε κάθε φυσική γραμμή ακριβώς μία φορά.`},...fileParts]}],text:{format:{type:"json_schema",name:"invoice_learning_extract",strict:true,schema}}})});
  const safeOpenAiCall=async retry=>{try{return await callOpenAiFallback(retry)}catch(error){if(/TimeoutError|AbortError|aborted due to timeout/i.test(`${error?.name||""} ${error?.message||error}`))return null;throw error}};
  const supervisedTimeoutResponse=(code,error)=>{
    const cachedCandidates=Array.isArray(cachedRead?.candidates)?cachedRead.candidates:[],draft=azureDraft?.productLines?.length?azureDraft:cachedRead?.winner;
    if(draft?.productLines?.length){
      const completeness=invoiceReadingCompleteness(draft);
      return res.json({...draft,azureState,completeness,requiresManualCompletion:true,partialResult:true,providerTimeout:true,providerTimeoutCode:code,providerTimeoutMessage:error,readAttempts:cachedCandidates.length,stableRead:false,sameImageCached:!azureDraft});
    }
    return res.status(504).json({error,code,azureState});
  };
  let response=await safeOpenAiCall(false);if(!response)return supervisedTimeoutResponse("AI_PROVIDER_TIMEOUT","Ο ασφαλής επανέλεγχος OpenAI άργησε περισσότερο από το επιτρεπτό όριο. Εμφανίζεται μόνο ασφαλές μερικό αποτέλεσμα για χειροκίνητο έλεγχο.");
  let raw=await response.json().catch(()=>({}));if(!response.ok)return res.status(response.status).json({error:raw?.error?.message||"Απέτυχε ο AI επανέλεγχος.",code:"AI_PROVIDER_ERROR",azureState});
  let text=outputText(raw);
  if(!text){response=await safeOpenAiCall(true);if(!response)return supervisedTimeoutResponse("AI_RETRY_TIMEOUT","Η δεύτερη ασφαλής προσπάθεια OpenAI ξεπέρασε το χρονικό όριο. Εμφανίζεται μόνο ασφαλές μερικό αποτέλεσμα για χειροκίνητο έλεγχο.");raw=await response.json().catch(()=>({}));if(!response.ok)return res.status(response.status).json({error:raw?.error?.message||"Απέτυχε και η δεύτερη ασφαλής προσπάθεια AI.",code:"AI_RETRY_PROVIDER_ERROR",azureState});text=outputText(raw)}
  if(!text)return res.status(502).json({error:"Το AI δεν επέστρεψε δομημένο αποτέλεσμα ούτε στη δεύτερη προσπάθεια.",code:"AI_EMPTY_STRUCTURED_RESPONSE",azureState});
  let result;try{result=JSON.parse(text)}catch{
    response=await safeOpenAiCall(true);if(!response)return supervisedTimeoutResponse("AI_RETRY_TIMEOUT","Η δεύτερη ασφαλής προσπάθεια OpenAI ξεπέρασε το χρονικό όριο. Εμφανίζεται μόνο ασφαλές μερικό αποτέλεσμα για χειροκίνητο έλεγχο.");raw=await response.json().catch(()=>({}));
    if(!response.ok)return res.status(response.status).json({error:raw?.error?.message||"Απέτυχε και η δεύτερη ασφαλής προσπάθεια AI.",code:"AI_RETRY_PROVIDER_ERROR",azureState});
    text=outputText(raw);try{result=JSON.parse(text)}catch{return res.status(502).json({error:"Το AI επέστρεψε μη έγκυρο δομημένο αποτέλεσμα και στη δεύτερη προσπάθεια.",code:"AI_INVALID_STRUCTURED_RESPONSE",azureState})};
  }
  result.documentType=result.documentType==="CREDIT_NOTE"?"CREDIT_NOTE":"INVOICE";
  result=applyTalosVerifiedPrintedRows(applyMathematicalDiscountRecovery(repairExactDuplicateInvoiceOverage(await applyLearnedKnowledge(await applyCentralSupplierProfile(withRequestedSupplierIdentity({ok:true,provider:"OPENAI",model:openAiFallbackModel(),...result}))))));
  let completeness=invoiceReadingCompleteness(result);
  if(!completeness.complete&&azureDraft?.productLines?.length){
    const hybrid=applyTalosVerifiedPrintedRows(await applyLearnedKnowledge(await applyCentralSupplierProfile(withRequestedSupplierIdentity(mergeProviderInvoiceDrafts(azureDraft,result)))));
    const hybridCompleteness=invoiceReadingCompleteness(hybrid);
    if(hybridCompleteness.complete){
      return res.json(cacheResult({...hybrid,azureState:"READY_WITH_AI_RECOVERY",completeness:hybridCompleteness}));
    }
  }
  if(!result.productLines?.length)return res.status(422).json({error:"Δεν αναγνωρίστηκε καμία γραμμή προϊόντος από το πρωτότυπο τιμολόγιο. Δεν δημιουργήθηκε κενό πρόχειρο. Δοκίμασε ξανά με καθαρή φωτογραφία ή έλεγξε τη σύνδεση Azure.",code:"NO_PRODUCT_LINES",azureState,azureFailure:azureFailure?azureFailure.slice(0,160):undefined});
  // The Learning Lab is a supervised correction surface. Keep a partial
  // provider result editable so the owner can add/correct rows and teach the
  // verified layout. POS/order intake remains fail-closed on partial lines.
  if(!completeness.complete)return res.json(cacheResult({...result,azureState,completeness,requiresManualCompletion:true,partialResult:true}));
  res.json(cacheResult({...result,azureState,completeness}));
}catch(error){next(error)}});

export default router;
