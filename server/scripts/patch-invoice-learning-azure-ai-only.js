import fs from "node:fs";

const serverPath=new URL("../src/routes/platform-invoice-learning-ai.js",import.meta.url);
let server=fs.readFileSync(serverPath,"utf8");

const replacements=[
  ['function normalizeAzure(payload,ocrRows=[])','function normalizeAzure(payload)'],
  ['    const hint=findHint(ocrRows,index,supplierItemCode,description);','    const hint=null;'],
  ['    if(!discounts.length&&hint?.discounts?.length){\n      const candidate=hint.discounts.slice(0,3);\n      const price=unitPrice||hint.unitPrice||0;\n      if(discountsReconcile(candidate,price,quantity||hint.quantity||0,netAmount))discounts=candidate;\n    }\n',''],
  ['    const unitsPerPackage=packageFromText(`${description} ${item?.content||""}`,hint?.pack||0);','    const unitsPerPackage=packageFromText(`${description} ${item?.content||""}`,0);'],
  ['ocrHintUsed:Boolean(hint)','ocrHintUsed:false'],
  ['  const {filename="invoice",mimeType="image/jpeg",fileData="",ocrRows=[],ocrConfidence=0}=req.body||{};','  const {filename="invoice",mimeType="image/jpeg",fileData=""}=req.body||{};'],
  ['try{const azure=normalizeAzure(await callAzure(fileData,mimeType),ocrRows);','try{const azure=normalizeAzure(await callAzure(fileData,mimeType));'],
  ['  const ocrText=(Array.isArray(ocrRows)?ocrRows:[]).slice(0,300).map((r,i)=>`${i+1}. ${String(r?.text||r?.description||"").slice(0,500)}`).join("\\n").slice(0,60000);','  const ocrText=""; const ocrConfidence=0;'],
  ['Διάβασε ΠΡΩΤΑ το πρωτότυπο PDF/εικόνα και χρησιμοποίησε το OCR μόνο ως βοήθημα.','Διάβασε αποκλειστικά το πρωτότυπο PDF/εικόνα. ΜΗ χρησιμοποιήσεις OCR, προηγούμενα πρόχειρα δεδομένα ή τιμές από άλλη πηγή.'],
  ['\\n\\nΠρόχειρο OCR confidence ${Number(ocrConfidence||0)}%:\\n${ocrText||"(χωρίς χρήσιμο OCR κείμενο)"}','']
];
for(const [from,to] of replacements){
  if(!server.includes(from))throw new Error(`Azure/AI-only server anchor missing: ${from.slice(0,80)}`);
  server=server.replace(from,to);
}
fs.writeFileSync(serverPath,server,"utf8");

const clientPath=new URL("../../client/src/invoice-learning-lab-bootstrap.js",import.meta.url);
let client=fs.readFileSync(clientPath,"utf8");
const start='  async function processFile(file){';
const end='  $(\'#pdf\').onclick=';
const a=client.indexOf(start),b=client.indexOf(end,a);
if(a<0||b<0)throw new Error("Azure/AI-only client processFile anchors missing");
const processFile=`  async function processFile(file){\n    $('#status').textContent='Azure Document Intelligence → AI ανάγνωση…';\n    try{\n      const dataUrl=await readFile(file);\n      const r=await fetch('/api/platform/invoice-learning/ai-recheck',{method:'POST',headers:headers(),body:JSON.stringify({filename:file.name,mimeType:file.type||'image/jpeg',fileData:dataUrl})});\n      const data=await r.json().catch(()=>({}));if(!r.ok)throw new Error(data.error||('Ανάγνωση απέτυχε ('+r.status+')'));\n      const products=Array.isArray(data.productLines)?data.productLines:[];\n      current={id:uuid(),supplierName:data.supplier?.name||$('#supplierName').value.trim(),supplierTaxId:data.supplier?.taxId||$('#supplierTaxId').value.trim(),invoiceNo:data.documentNumber||$('#invoiceNo').value.trim(),invoiceDate:data.documentDate||$('#invoiceDate').value,filename:file.name,mimeType:file.type||'image/jpeg',confidence:Number(data.aiConfidence||0),rawText:'',lines:products.map((x,i)=>({id:uuid(),lineNo:i+1,rawText:String(x.azureRawRow||x.description||''),supplierItemCode:String(x.supplierItemCode||''),description:String(x.description||''),quantity:Number(x.quantity||0)||null,unit:String(x.unit||''),unitsPerPackage:Number(x.unitsPerPackage||0)||null,unitPrice:Number(x.unitPrice||0)||null,discount1:Number(x.discount1||0),discount2:Number(x.discount2||0),discount3:Number(x.discount3||0),netValue:Number(x.netAmount||0)||null,vatRate:Number(x.vatRate||0)||null,barcode:String(x.barcode||''),barcodeSource:'',barcodeReference:'',masterProductId:'',masterProductName:'',matchConfidence:Number(x.confidence||0),status:Number(x.confidence||0)>=85?'CONFIRMED':'REVIEW'})),status:'DRAFT',createdAt:new Date().toISOString()};\n      if(current.supplierName)$('#supplierName').value=current.supplierName;if(current.supplierTaxId)$('#supplierTaxId').value=current.supplierTaxId;if(current.invoiceNo)$('#invoiceNo').value=current.invoiceNo;if(current.invoiceDate)$('#invoiceDate').value=current.invoiceDate;\n      $('#ocrBadge').textContent=(data.provider==='AZURE_DOCUMENT_INTELLIGENCE'?'Azure Document Intelligence':'OpenAI')+' • '+Number(data.aiConfidence||0).toFixed(0)+'% • '+products.length+' προϊόντα';\n      $('#review').hidden=false;renderLines();$('#status').textContent='Ανάγνωση ολοκληρώθηκε μόνο με Azure/AI. Έλεγξε τις γραμμές πριν την εκμάθηση.';\n    }catch(e){$('#status').textContent='Σφάλμα Azure/AI: '+e.message}\n  }\n`;
client=client.slice(0,a)+processFile+client.slice(b);
client=client.replace('<span>OCR ${esc(d.confidence)}%</span>','<span>Azure/AI ${esc(d.confidence)}%</span>');
client=client.replace('title="OCR raw"','title="Azure/AI raw"');
fs.writeFileSync(clientPath,client,"utf8");

console.log("Invoice Learning patched: Azure + AI only; local OCR bypassed.");
