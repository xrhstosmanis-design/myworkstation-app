import {Router} from "express";

const router=Router();
const AZURE_API_VERSION="2024-11-30";
const AZURE_MODEL_ID="prebuilt-invoice";

function outputText(response){
  if(typeof response?.output_text==="string"&&response.output_text.trim())return response.output_text;
  for(const item of response?.output||[])for(const part of item?.content||[])if(part?.type==="output_text"&&part.text)return part.text;
  return "";
}

const lineProperties={
  supplierItemCode:{type:"string"},description:{type:"string"},quantity:{type:"number",minimum:0},unit:{type:"string"},unitsPerPackage:{type:"number",minimum:0},unitPrice:{type:"number",minimum:0},discount1:{type:"number",minimum:0,maximum:100},discount2:{type:"number",minimum:0,maximum:100},discount3:{type:"number",minimum:0,maximum:100},netUnitCost:{type:"number",minimum:0},netAmount:{type:"number",minimum:0},vatRate:{type:"number",minimum:0,maximum:100},grossAmount:{type:"number",minimum:0},barcode:{type:"string"},confidence:{type:"number",minimum:0,maximum:100}
};
const lineRequired=Object.keys(lineProperties);
const schema={type:"object",additionalProperties:false,properties:{
  aiConfidence:{type:"number",minimum:0,maximum:100},headerConfidence:{type:"number",minimum:0,maximum:100},
  supplier:{type:"object",additionalProperties:false,properties:{name:{type:"string"},taxId:{type:"string"},confidence:{type:"number",minimum:0,maximum:100}},required:["name","taxId","confidence"]},
  documentNumber:{type:"string"},documentNumberConfidence:{type:"number",minimum:0,maximum:100},documentDate:{type:"string"},documentDateConfidence:{type:"number",minimum:0,maximum:100},
  totalNet:{type:"number",minimum:0},totalVat:{type:"number",minimum:0},totalGross:{type:"number",minimum:0},productLines:{type:"array",maxItems:500,items:{type:"object",additionalProperties:false,properties:lineProperties,required:lineRequired}}
},required:["aiConfidence","headerConfidence","supplier","documentNumber","documentNumberConfidence","documentDate","documentDateConfidence","totalNet","totalVat","totalGross","productLines"]};

const pct=v=>Math.max(0,Math.min(100,Number(v||0)*100));
const numberField=f=>{const v=f?.valueCurrency?.amount??f?.valueNumber??f?.valueInteger??f?.content;const n=Number(String(v??"").replace(",","."));return Number.isFinite(n)?n:0};
const textField=f=>String(f?.valueString??f?.valueDate??f?.content??"").trim();
const azureConfigured=()=>Boolean(String(process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT||"").trim()&&String(process.env.AZURE_DOCUMENT_INTELLIGENCE_KEY||"").trim());
const money4=v=>Math.round((Number(v||0)+Number.EPSILON)*10000)/10000;
const norm=v=>String(v||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toUpperCase().replace(/[^A-ZΑ-Ω0-9]/g,"");

function explicitDiscounts(p){
  const fields=[p.DiscountRate,p.DiscountPercent,p.LineDiscountRate,p.Discount1,p.Discount2,p.Discount3,p.Discount,p.LineDiscount];
  const out=[];
  for(const field of fields){
    if(!field)continue;
    const raw=textField(field)||String(numberField(field)||"");
    const percent=[...raw.matchAll(/(-?\d{1,2}(?:[.,]\d+)?)\s*%/g)].map(m=>Math.abs(Number(m[1].replace(",","."))));
    if(percent.length)out.push(...percent);
    else{const n=Math.abs(numberField(field));if(n>0&&n<100)out.push(n)}
  }
  return out.filter(v=>Number.isFinite(v)&&v>0&&v<100).slice(0,3);
}

function labelledDiscounts(content=""){
  const s=String(content).replace(/\s+/g," ");
  const out=[];
  const patterns=[
    /(?:ΕΚΠΤ(?:ΩΣΗ)?|DISC(?:OUNT)?|DISCOUNT)\s*[:=]?\s*(-?\d{1,2}(?:[.,]\d+)?)\s*%/gi,
    /(-?\d{1,2}(?:[.,]\d+)?)\s*%\s*(?:ΕΚΠΤ(?:ΩΣΗ)?|DISC(?:OUNT)?|DISCOUNT)/gi
  ];
  for(const re of patterns)for(const m of s.matchAll(re)){const n=Math.abs(Number(m[1].replace(",",".")));if(n>0&&n<100&&!out.includes(n))out.push(n);if(out.length===3)return out}
  return out;
}

function parsePercentCell(content=""){
  const s=String(content).trim().replace(/,/g,".");
  const m=s.match(/-?\d{1,2}(?:\.\d+)?/);
  if(!m)return 0;
  const n=Math.abs(Number(m[0]));
  return Number.isFinite(n)&&n>0&&n<100?n:0;
}

function azureTableDiscounts(result,code,description){
  const codeKey=norm(code),descKey=norm(description);
  for(const table of result?.tables||[]){
    const cells=Array.isArray(table?.cells)?table.cells:[];
    if(!cells.length)continue;
    const rows=new Map();
    for(const c of cells){
      const r=Number(c.rowIndex||0),col=Number(c.columnIndex||0);
      if(!rows.has(r))rows.set(r,new Map());
      rows.get(r).set(col,String(c.content||"").trim());
    }
    let headerRow=-1,discountCols=[];
    for(const [r,cols] of rows){
      const found=[];
      for(const [col,text] of cols){
        const k=norm(text);
        if(k.includes("ΕΚΠΤ")||k.includes("DISCOUNT")||k==="DISC"||k.startsWith("DISC"))found.push(col);
      }
      if(found.length){headerRow=r;discountCols=found.sort((a,b)=>a-b).slice(0,3);break}
    }
    if(headerRow<0||!discountCols.length)continue;
    let best=null,bestScore=0;
    for(const [r,cols] of rows){
      if(r<=headerRow)continue;
      const rowText=[...cols.values()].join(" ");
      const rowKey=norm(rowText);
      let score=0;
      if(codeKey&&rowKey.includes(codeKey))score+=100;
      if(descKey.length>=6){
        if(rowKey.includes(descKey))score+=80;
        else{
          const words=String(description||"").split(/\s+/).map(norm).filter(x=>x.length>=4);
          score+=words.filter(w=>rowKey.includes(w)).length*8;
        }
      }
      if(score>bestScore){bestScore=score;best=cols}
    }
    if(best&&bestScore>=16){
      const out=discountCols.map(col=>parsePercentCell(best.get(col)||"")).filter(v=>v>0);
      if(out.length)return out.slice(0,3);
    }
  }
  return [];
}

function applyDiscounts(unitPrice,discounts){
  let net=Math.max(0,Number(unitPrice||0));
  for(const d of discounts)net*=1-Math.max(0,Math.min(100,Number(d||0)))/100;
  return money4(net);
}

function discountsReconcile(discounts,unitPrice,quantity,netAmount){
  if(!discounts.length||unitPrice<=0)return false;
  if(quantity<=0||netAmount<=0)return true;
  const expected=applyDiscounts(unitPrice,discounts);
  const actual=money4(netAmount/quantity);
  const tolerance=Math.max(0.03,actual*0.02);
  return Math.abs(expected-actual)<=tolerance;
}

function parseHint(row={}){
  const text=String(row?.text||"");
  const parts=text.split("|").map(x=>x.trim());
  const num=i=>{const n=Number(String(parts[i]||"").replace(",","."));return Number.isFinite(n)?n:0};
  return {raw:text,code:parts[0]||"",description:row?.description||parts[1]||"",quantity:num(2),pack:num(3),unitPrice:num(4),discounts:[num(5),num(6),num(7)].filter(v=>v>0&&v<100),vat:num(8)};
}

function findHint(ocrRows,index,code,description){
  const hints=(Array.isArray(ocrRows)?ocrRows:[]).map(parseHint);
  const codeKey=norm(code),descKey=norm(description);
  if(codeKey){const exact=hints.find(h=>norm(h.code)===codeKey);if(exact)return exact}
  if(descKey.length>=6){const close=hints.find(h=>{const x=norm(h.description);return x.length>=6&&(x.includes(descKey)||descKey.includes(x))});if(close)return close}
  return hints[index]||null;
}

function packageFromText(text,hintPack=0){
  if(Number(hintPack)>1)return Math.round(Number(hintPack));
  const s=String(text||"").toUpperCase().replace(/,/g,".");
  const patterns=[
    /\d+(?:\.\d+)?\s*(?:G|GR|ΓΡ|ML|ΜL|LT|L|KG|ΚG)\s*[XΧ]\s*(\d{1,3})\s*(?:T|Τ|ΤΜΧ|PCS)?\b/,
    /[XΧ]\s*(\d{1,3})\s*(?:T|Τ|ΤΜΧ|PCS)\b/,
    /(\d{1,3})\s*(?:ΤΜΧ|ΤΕΜ|PCS|PIECES)\b/
  ];
  for(const re of patterns){const m=s.match(re);if(m){const n=Number(m[1]);if(n>1&&n<=500)return n}}
  return 0;
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

function normalizeAzure(payload,ocrRows=[]){
  const result=payload?.analyzeResult||{};const doc=result.documents?.[0]||{};const f=doc.fields||{};
  const items=Array.isArray(f.Items?.valueArray)?f.Items.valueArray:[];
  const productLines=items.map((item,index)=>{
    const p=item?.valueObject||{};
    const supplierItemCode=textField(p.ProductCode)||textField(p.ItemCode)||textField(p.Code);
    const description=textField(p.Description)||textField(p.ProductName)||textField(p.ItemDescription);
    const hint=findHint(ocrRows,index,supplierItemCode,description);
    const quantity=Math.max(0,numberField(p.Quantity));const unitPrice=Math.max(0,numberField(p.UnitPrice));const netAmount=Math.max(0,numberField(p.Amount));const tax=Math.max(0,numberField(p.Tax));
    let vatRate=Math.max(0,numberField(p.TaxRate));if(![0,6,13,24].includes(Math.round(vatRate)))vatRate=0;else vatRate=Math.round(vatRate);

    let discounts=explicitDiscounts(p);
    if(discounts.length&&!discountsReconcile(discounts,unitPrice,quantity,netAmount))discounts=[];
    if(!discounts.length){
      const fromTable=azureTableDiscounts(result,supplierItemCode,description);
      if(discountsReconcile(fromTable,unitPrice,quantity,netAmount))discounts=fromTable;
    }
    if(!discounts.length){const labelled=labelledDiscounts(item?.content||"");if(discountsReconcile(labelled,unitPrice,quantity,netAmount))discounts=labelled}
    if(!discounts.length&&hint?.discounts?.length){
      const candidate=hint.discounts.slice(0,3);
      const price=unitPrice||hint.unitPrice||0;
      if(discountsReconcile(candidate,price,quantity||hint.quantity||0,netAmount))discounts=candidate;
    }

    const discount1=discounts[0]||0,discount2=discounts[1]||0,discount3=discounts[2]||0;
    const unitsPerPackage=packageFromText(`${description} ${item?.content||""}`,hint?.pack||0);
    const netUnitCost=quantity>0&&netAmount>0?money4(netAmount/quantity):(discounts.length&&unitPrice>0?applyDiscounts(unitPrice,discounts):unitPrice);
    const grossAmount=netAmount>0?money4(netAmount+(tax>0?tax:netAmount*vatRate/100)):0;
    const confidence=Math.max(pct(item?.confidence),pct(p.Description?.confidence),pct(p.Quantity?.confidence),pct(p.UnitPrice?.confidence),pct(p.Amount?.confidence));
    return {supplierItemCode,description,quantity,unit:textField(p.Unit)||textField(p.UnitOfMeasure)||"",unitsPerPackage,unitPrice,discount1,discount2,discount3,netUnitCost,netAmount,vatRate,grossAmount,barcode:"",confidence,azureSequence:index+1,azureRawRow:String(item?.content||""),ocrHintUsed:Boolean(hint),discountValidated:Boolean(discounts.length)};
  }).filter(x=>x.description||x.supplierItemCode);
  const supplierConfidence=Math.max(pct(f.VendorName?.confidence),pct(f.VendorTaxId?.confidence));
  const headerConfidence=Math.max(supplierConfidence,pct(f.InvoiceId?.confidence),pct(f.InvoiceDate?.confidence));
  const lineConfs=productLines.map(x=>x.confidence).filter(Boolean);const aiConfidence=Math.round((lineConfs.reduce((a,b)=>a+b,0)+(headerConfidence||0))/(lineConfs.length+1));
  return {ok:true,provider:"AZURE_DOCUMENT_INTELLIGENCE",model:"azure-prebuilt-invoice",aiConfidence,headerConfidence,supplier:{name:textField(f.VendorName)||textField(f.VendorAddressRecipient),taxId:textField(f.VendorTaxId),confidence:supplierConfidence},documentNumber:textField(f.InvoiceId),documentNumberConfidence:pct(f.InvoiceId?.confidence),documentDate:textField(f.InvoiceDate),documentDateConfidence:pct(f.InvoiceDate?.confidence),totalNet:Math.max(0,numberField(f.SubTotal)),totalVat:Math.max(0,numberField(f.TotalTax)),totalGross:Math.max(0,numberField(f.InvoiceTotal)||numberField(f.AmountDue)),productLines,azurePageCount:Array.isArray(result.pages)?result.pages.length:0};
}

router.get("/invoice-learning/ai-status",(req,res)=>res.json({connected:azureConfigured()||Boolean(process.env.OPENAI_API_KEY),azureConfigured:azureConfigured(),openaiConnected:Boolean(process.env.OPENAI_API_KEY),providerOrder:["AZURE_DOCUMENT_INTELLIGENCE","OPENAI"],model:azureConfigured()?AZURE_MODEL_ID:(process.env.OPENAI_INVOICE_MODEL||"gpt-5")}));

router.post("/invoice-learning/ai-recheck",async(req,res,next)=>{try{
  const {filename="invoice",mimeType="image/jpeg",fileData="",ocrRows=[],ocrConfidence=0}=req.body||{};
  if(!fileData||typeof fileData!=="string")return res.status(400).json({error:"Δεν βρέθηκε το πρωτότυπο PDF/φωτογραφία για AI επανέλεγχο."});
  if(azureConfigured()){
    try{const azure=normalizeAzure(await callAzure(fileData,mimeType),ocrRows);if(azure.productLines.length||azure.aiConfidence>=40)return res.json(azure);console.warn("Azure Invoice Learning returned weak result; falling back to OpenAI.")}
    catch(error){console.error("Azure Invoice Learning fallback:",error?.message||error)}
  }
  if(!process.env.OPENAI_API_KEY)return res.status(503).json({error:"Το Azure δεν έδωσε ασφαλές αποτέλεσμα και δεν έχει συνδεθεί OPENAI_API_KEY για fallback.",code:"AI_PROVIDER_NOT_CONFIGURED"});
  const base64=String(fileData).includes(",")?String(fileData).split(",").pop():String(fileData);
  const filePart=mimeType==="application/pdf"?{type:"input_file",filename:filename||"invoice.pdf",file_data:base64}:{type:"input_image",image_url:String(fileData).startsWith("data:")?fileData:`data:${mimeType};base64,${base64}`,detail:"high"};
  const ocrText=(Array.isArray(ocrRows)?ocrRows:[]).slice(0,300).map((r,i)=>`${i+1}. ${String(r?.text||r?.description||"").slice(0,500)}`).join("\n").slice(0,60000);
  const prompt=`Είσαι ειδικός ελεγκτής ελληνικών τιμολογίων προμηθευτών για το MyWorkStation Invoice Learning Lab. Διάβασε ΠΡΩΤΑ το πρωτότυπο PDF/εικόνα και χρησιμοποίησε το OCR μόνο ως βοήθημα.\n\nHEADER: εντόπισε τον εκδότη/προμηθευτή, ΑΦΜ, αριθμό και ημερομηνία. Μην εφευρίσκεις στοιχεία.\n\nPRODUCT LINES: κράτησε μόνο πραγματικές γραμμές προϊόντων. Για κάθε προϊόν βρες supplierItemCode, description, quantity, unit, unitsPerPackage, unitPrice, discount1/2/3, netUnitCost, netAmount, vatRate, grossAmount και barcode μόνο αν φαίνεται. Οι εκπτώσεις πρέπει να είναι πραγματικές στήλες/ενδείξεις έκπτωσης και να συμφωνούν αριθμητικά με unitPrice και καθαρή αξία. Μην θεωρείς τυχαίους αριθμούς ή ΦΠΑ ως έκπτωση. Διαδοχικές εκπτώσεις δεν αθροίζονται. Συσκευασίες όπως 6x500ml ή X12 δεν είναι quantity αλλά unitsPerPackage.\n\nΠριν απαντήσεις διασταύρωσε τιμή × διαδοχικές εκπτώσεις × ποσότητα με netAmount και έλεγξε τα σύνολα. documentDate σε YYYY-MM-DD.\n\nΠρόχειρο OCR confidence ${Number(ocrConfidence||0)}%:\n${ocrText||"(χωρίς χρήσιμο OCR κείμενο)"}`;
  const response=await fetch("https://api.openai.com/v1/responses",{method:"POST",headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`,"Content-Type":"application/json"},body:JSON.stringify({model:process.env.OPENAI_INVOICE_MODEL||"gpt-5",input:[{role:"user",content:[{type:"input_text",text:prompt},filePart]}],text:{format:{type:"json_schema",name:"invoice_learning_extract",strict:true,schema}}})});
  const raw=await response.json().catch(()=>({}));if(!response.ok)return res.status(response.status).json({error:raw?.error?.message||"Απέτυχε ο AI επανέλεγχος.",code:"AI_PROVIDER_ERROR"});
  const text=outputText(raw);if(!text)return res.status(502).json({error:"Το AI δεν επέστρεψε δομημένο αποτέλεσμα."});
  let result;try{result=JSON.parse(text)}catch{return res.status(502).json({error:"Το AI επέστρεψε μη έγκυρο JSON."})}
  res.json({ok:true,provider:"OPENAI",model:process.env.OPENAI_INVOICE_MODEL||"gpt-5",...result});
}catch(error){next(error)}});

export default router;
