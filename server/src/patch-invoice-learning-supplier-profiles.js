import fs from "fs";

const path=new URL("./routes/platform-invoice-learning-ai.js",import.meta.url);
let src=fs.readFileSync(path,"utf8");
const marker="SUPPLIER_SCOPED_READING_PROFILES_V1";

// The current Invoice Learning build installs supplier-scoped IFANTIS parsing earlier
// through patch-invoice-learning-azure-row-values.js and also removes the old OCR-based
// Azure/OpenAI branch. This legacy startup patch must therefore be idempotent and must
// never fail just because those old anchors no longer exist.
if(src.includes(marker)||src.includes('function supplierAzureProfile(')||src.includes('ifantisBrokenPrice')){
  console.log("Invoice Learning supplier-scoped profiles already handled by Azure-only supplier parser.");
  process.exit(0);
}

const normLine='const norm=v=>String(v||"").normalize("NFD").replace(/[\\u0300-\\u036f]/g,"").toUpperCase().replace(/[^A-ZΑ-Ω0-9]/g,"");';
if(!src.includes(normLine)){
  console.log("Invoice Learning supplier-profile legacy patch skipped: norm anchor not present in current source.");
  process.exit(0);
}

const azureBlock=`  if(azureConfigured()){\n    try{const azure=normalizeAzure(await callAzure(fileData,mimeType),ocrRows);if(azure.productLines.length||azure.aiConfidence>=40)return res.json(azure);console.warn("Azure Invoice Learning returned weak result; falling back to OpenAI.")}\n    catch(error){console.error("Azure Invoice Learning fallback:",error?.message||error)}\n  }`;
const promptNeedle='\\n\\nΠρόχειρο OCR confidence ${Number(ocrConfidence||0)}%:\\n${ocrText||"(χωρίς χρήσιμο OCR κείμενο)"}`;';
const responseNeedle='  res.json({ok:true,provider:"OPENAI",model:process.env.OPENAI_INVOICE_MODEL||"gpt-5",...result});';

// If any legacy anchor is gone, we are on the Azure-only flow and this patch has nothing
// left to do. Exit cleanly instead of crashing Render startup.
if(!src.includes(azureBlock)||!src.includes(promptNeedle)||!src.includes(responseNeedle)){
  console.log("Invoice Learning supplier-profile legacy patch skipped: Azure-only flow detected.");
  process.exit(0);
}

const profileCode=`${normLine}\n\n// ${marker}\nconst SUPPLIER_READING_PROFILES={\n  \"094095506\":{\n    key:\"IFANTIS_FOOD_GROUP\",\n    aliases:[\"IFANTIS\",\"IFANTISFOODGROUP\",\"ΥΦΑΝΤΗΣ\",\"ΥΦΑΝΤΗΣFOODGROUP\"],\n    forceOpenAiVerification:true,\n    instructions:[\n      \"SUPPLIER-SPECIFIC PROFILE: IFANTIS FOOD GROUP / ΑΦΜ 094095506.\",\n      \"Οι κανόνες αυτοί ισχύουν ΜΟΝΟ για αυτόν τον προμηθευτή και δεν πρέπει να επηρεάζουν κανέναν άλλο.\",\n      \"Στα τιμολόγια IFANTIS η Azure μπορεί να παρερμηνεύσει ελληνικά δεκαδικά στην τιμή μονάδας.\",\n      \"Για κάθε γραμμή ξαναδιάβασε από την εικόνα/PDF κωδικό, περιγραφή, ποσότητα, τιμή μονάδας, εκπτώσεις, καθαρή αξία και ΦΠΑ.\",\n      \"Μην εφευρίσκεις γραμμές ή ποσά για να κλείσει το σύνολο.\"\n    ].join(\" \")\n  }\n};\nconst cleanTaxId=v=>String(v||\"\").replace(/\\D/g,\"\");\nfunction supplierReadingProfile(result={}){\n  const taxId=cleanTaxId(result?.supplier?.taxId);\n  if(taxId&&SUPPLIER_READING_PROFILES[taxId])return SUPPLIER_READING_PROFILES[taxId];\n  const name=norm(result?.supplier?.name);\n  return Object.values(SUPPLIER_READING_PROFILES).find(p=>p.aliases.some(a=>name.includes(norm(a))))||null;\n}\nfunction lineGrossSum(result={}){return money4((result.productLines||[]).reduce((sum,line)=>sum+Number(line?.grossAmount||0),0))}\nfunction supplierProfileNeedsVerification(result={},profile=null){\n  if(!profile?.forceOpenAiVerification)return false;\n  const absurdPrice=(result.productLines||[]).some(line=>{const q=Number(line?.quantity||0),price=Number(line?.unitPrice||0),net=Number(line?.netAmount||0);return q>0&&net>0&&price>100&&net/q<100});\n  const gross=Number(result.totalGross||0),lines=lineGrossSum(result);\n  const totalMismatch=gross>0&&lines>0&&Math.abs(gross-lines)>0.05;\n  return absurdPrice||totalMismatch||profile.forceOpenAiVerification;\n}`;
src=src.replace(normLine,profileCode);

const patchedAzure=`  let azureDraft=null;let activeSupplierProfile=null;\n  if(azureConfigured()){\n    try{\n      const azure=normalizeAzure(await callAzure(fileData,mimeType),ocrRows);\n      azureDraft=azure;activeSupplierProfile=supplierReadingProfile(azure);\n      const supplierScopedCheck=supplierProfileNeedsVerification(azure,activeSupplierProfile);\n      if((azure.productLines.length||azure.aiConfidence>=40)&&!supplierScopedCheck)return res.json(azure);\n      if(supplierScopedCheck)console.warn(\`Invoice Learning supplier profile \${activeSupplierProfile?.key||\"unknown\"}: Azure result will be verified by OpenAI.\`);\n      else console.warn("Azure Invoice Learning returned weak result; falling back to OpenAI.");\n    }catch(error){console.error("Azure Invoice Learning fallback:",error?.message||error)}\n  }`;
src=src.replace(azureBlock,patchedAzure);

const promptReplacement='\\n\\n${activeSupplierProfile?`SUPPLIER PROFILE (ισχύει μόνο για αυτόν τον προμηθευτή): ${activeSupplierProfile.instructions}\\n\\n`:""}${azureDraft?`AZURE DRAFT ΓΙΑ ΔΙΑΣΤΑΥΡΩΣΗ (όχι αυθεντία): ${JSON.stringify({supplier:azureDraft.supplier,documentNumber:azureDraft.documentNumber,totalNet:azureDraft.totalNet,totalVat:azureDraft.totalVat,totalGross:azureDraft.totalGross,productLines:azureDraft.productLines}).slice(0,50000)}\\n\\n`:""}Πρόχειρο OCR confidence ${Number(ocrConfidence||0)}%:\\n${ocrText||"(χωρίς χρήσιμο OCR κείμενο)"}`;';
src=src.replace(promptNeedle,promptReplacement);
src=src.replace(responseNeedle,'  res.json({ok:true,provider:"OPENAI",model:process.env.OPENAI_INVOICE_MODEL||"gpt-5",supplierProfile:activeSupplierProfile?.key||null,...result});');

fs.writeFileSync(path,src);
console.log("Invoice Learning supplier-scoped reading profiles installed (legacy flow).");
