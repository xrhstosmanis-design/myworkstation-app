import fs from "node:fs";

const serverPath=new URL("../src/routes/platform-invoice-learning-ai.js",import.meta.url);
let server=fs.readFileSync(serverPath,"utf8");

// Keep this startup patch idempotent and tolerant of formatting/minification changes.
server=server.replace(/function normalizeAzure\(payload\s*,\s*ocrRows\s*=\s*\[\]\)/,"function normalizeAzure(payload)");
server=server.replace(/const hint\s*=\s*findHint\(ocrRows\s*,\s*index\s*,\s*supplierItemCode\s*,\s*description\)\s*;/g,"const hint=null;");
server=server.replace(/if\s*\(!discounts\.length\s*&&\s*hint\?\.discounts\?\.length\)\s*\{[\s\S]*?if\s*\(discountsReconcile\(candidate\s*,\s*price\s*,\s*quantity\s*\|\|\s*hint\.quantity\s*\|\|\s*0\s*,\s*netAmount\)\)\s*discounts\s*=\s*candidate\s*;?\s*\}/g,"");
server=server.replace(/packageFromText\(`\$\{description\} \$\{item\?\.content\|\|""\}`\s*,\s*hint\?\.pack\s*\|\|\s*0\)/g,'packageFromText(`${description} ${item?.content||""}`,0)');
server=server.replace(/ocrHintUsed\s*:\s*Boolean\(hint\)/g,"ocrHintUsed:false");
server=server.replace(/const \{filename="invoice",mimeType="image\/jpeg",fileData="",ocrRows=\[\],ocrConfidence=0\}=req\.body\|\|\{\};/g,'const {filename="invoice",mimeType="image/jpeg",fileData=""}=req.body||{};');
server=server.replace(/normalizeAzure\(await callAzure\(fileData,mimeType\)\s*,\s*ocrRows\)/g,"normalizeAzure(await callAzure(fileData,mimeType))");
server=server.replace(/const ocrText=\(Array\.isArray\(ocrRows\)[\s\S]*?\.slice\(0,60000\);/g,'const ocrText=""; const ocrConfidence=0;');
server=server.replace("Διάβασε ΠΡΩΤΑ το πρωτότυπο PDF/εικόνα και χρησιμοποίησε το OCR μόνο ως βοήθημα.","Διάβασε αποκλειστικά το πρωτότυπο PDF/εικόνα. ΜΗ χρησιμοποιήσεις OCR, προηγούμενα πρόχειρα δεδομένα ή τιμές από άλλη πηγή.");
server=server.replace(/\\n\\nΠρόχειρο OCR confidence \$\{Number\(ocrConfidence\|\|0\)\}%:\\n\$\{ocrText\|\|"\(χωρίς χρήσιμο OCR κείμενο\)"\}/g,"");
fs.writeFileSync(serverPath,server,"utf8");

const clientPath=new URL("../../client/src/invoice-learning-lab-bootstrap.js",import.meta.url);
let client=fs.readFileSync(clientPath,"utf8");
const start="  async function processFile(file){";
const end="  $('#pdf').onclick=";
const a=client.indexOf(start),b=client.indexOf(end,a);
if(a>=0&&b>=0){
  const processFile=`  async function processFile(file){\n    $('#status').textContent='Azure Document Intelligence → AI ανάγνωση…';\n    try{\n      const dataUrl=await readFile(file);\n      const r=await fetch('/api/platform/invoice-learning/ai-recheck',{method:'POST',headers:headers(),body:JSON.stringify({filename:file.name,mimeType:file.type||'image/jpeg',fileData:dataUrl})});\n      const data=await r.json().catch(()=>({}));if(!r.ok)throw new Error(data.error||('Ανάγνωση απέτυχε ('+r.status+')'));\n      const products=Array.isArray(data.productLines)?data.productLines:[];\n      current={id:uuid(),supplierName:data.supplier?.name||$('#supplierName').value.trim(),supplierTaxId:data.supplier?.taxId||$('#supplierTaxId').value.trim(),invoiceNo:data.documentNumber||$('#invoiceNo').value.trim(),invoiceDate:data.documentDate||$('#invoiceDate').value,filename:file.name,mimeType:file.type||'image/jpeg',confidence:Number(data.aiConfidence||0),rawText:'',lines:products.map((x,i)=>({id:uuid(),lineNo:i+1,rawText:String(x.azureRawRow||x.description||''),supplierItemCode:String(x.supplierItemCode||''),description:String(x.description||''),quantity:Number(x.quantity||0)||null,unit:String(x.unit||''),unitsPerPackage:Number(x.unitsPerPackage||0)||null,unitPrice:Number(x.unitPrice||0)||null,discount1:Number(x.discount1||0),discount2:Number(x.discount2||0),discount3:Number(x.discount3||0),netValue:Number(x.netAmount||0)||null,vatRate:Number(x.vatRate||0)||null,barcode:String(x.barcode||''),barcodeSource:'',barcodeReference:'',masterProductId:'',masterProductName:'',matchConfidence:Number(x.confidence||0),status:Number(x.confidence||0)>=85?'CONFIRMED':'REVIEW'})),status:'DRAFT',createdAt:new Date().toISOString()};\n      if(current.supplierName)$('#supplierName').value=current.supplierName;if(current.supplierTaxId)$('#supplierTaxId').value=current.supplierTaxId;if(current.invoiceNo)$('#invoiceNo').value=current.invoiceNo;if(current.invoiceDate)$('#invoiceDate').value=current.invoiceDate;\n      $('#ocrBadge').textContent=(data.provider==='AZURE_DOCUMENT_INTELLIGENCE'?'Azure Document Intelligence':'OpenAI')+' • '+Number(data.aiConfidence||0).toFixed(0)+'% • '+products.length+' προϊόντα';\n      $('#review').hidden=false;renderLines();$('#status').textContent='Ανάγνωση ολοκληρώθηκε μόνο με Azure/AI. Έλεγξε τις γραμμές πριν την εκμάθηση.';\n    }catch(e){$('#status').textContent='Σφάλμα Azure/AI: '+e.message}\n  }\n`;
  client=client.slice(0,a)+processFile+client.slice(b);
}
client=client.replace('<span>OCR ${esc(d.confidence)}%</span>','<span>Azure/AI ${esc(d.confidence)}%</span>');
client=client.replace('title="OCR raw"','title="Azure/AI raw"');
fs.writeFileSync(clientPath,client,"utf8");

console.log("Invoice Learning patched: Azure + AI only; local OCR bypassed (resilient).");
