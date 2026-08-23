import fs from "fs";

const path=new URL("./routes/platform-invoice-learning-ai.js",import.meta.url);
let src=fs.readFileSync(path,"utf8");
const marker="SUPPLIER_SCOPED_READING_PROFILES_V1";
if(src.includes(marker)){
  console.log("Invoice Learning supplier-scoped profiles already installed.");
  process.exit(0);
}

const normLine='const norm=v=>String(v||"").normalize("NFD").replace(/[\\u0300-\\u036f]/g,"").toUpperCase().replace(/[^A-ZΑ-Ω0-9]/g,"");';
if(!src.includes(normLine))throw new Error("supplier-profile patch: norm marker not found");
const profileCode=`${normLine}\n\n// ${marker}\nconst SUPPLIER_READING_PROFILES={\n  \"094095506\":{\n    key:\"IFANTIS_FOOD_GROUP\",\n    aliases:[\"IFANTIS\",\"IFANTISFOODGROUP\",\"ΥΦΑΝΤΗΣ\",\"ΥΦΑΝΤΗΣFOODGROUP\"],\n    forceOpenAiVerification:true,\n    instructions:[\n      \"SUPPLIER-SPECIFIC PROFILE: IFANTIS FOOD GROUP / ΑΦΜ 094095506.\",\n      \"Οι κανόνες αυτοί ισχύουν ΜΟΝΟ για αυτόν τον προμηθευτή και δεν πρέπει να επηρεάζουν κανέναν άλλο.\",\n      \"Στα τιμολόγια IFANTIS η Azure μπορεί να παρερμηνεύσει ελληνικά δεκαδικά στην τιμή μονάδας (π.χ. μια πραγματική τιμή 0,5900 ή 0,9000 να εμφανιστεί ως 5.900,00 ή 900,00). Μην αποδέχεσαι τέτοια τιμή χωρίς οπτικό επανέλεγχο του πρωτοτύπου.\",\n      \"Για κάθε γραμμή ξαναδιάβασε από την εικόνα/PDF: κωδικό, περιγραφή, ποσότητα, τιμή μονάδας, τυχόν εκπτώσεις, καθαρή αξία και ΦΠΑ. Χρησιμοποίησε netAmount/quantity μόνο ως αριθμητικό cross-check, όχι ως υποκατάστατο της οπτικής ανάγνωσης.\",\n      \"Αν unitPrice είναι προφανώς εκτός κλίμακας σε σχέση με netAmount και quantity, ξαναδιάβασε τη στήλη τιμής από το πρωτότυπο και διόρθωσέ την.\",\n      \"Στο τέλος έλεγξε ότι το άθροισμα των πραγματικών γραμμών, μαζί με τον σωστό ΦΠΑ, συμφωνεί με το totalGross του header μέσα σε φυσιολογικό σφάλμα στρογγυλοποίησης. Μην εφευρίσκεις γραμμές ή ποσά για να κλείσει το σύνολο.\"\n    ].join(\" \")\n  }\n};\nconst cleanTaxId=v=>String(v||\"\").replace(/\\D/g,\"\");\nfunction supplierReadingProfile(result={}){\n  const taxId=cleanTaxId(result?.supplier?.taxId);\n  if(taxId&&SUPPLIER_READING_PROFILES[taxId])return SUPPLIER_READING_PROFILES[taxId];\n  const name=norm(result?.supplier?.name);\n  return Object.values(SUPPLIER_READING_PROFILES).find(p=>p.aliases.some(a=>name.includes(norm(a))))||null;\n}\nfunction lineGrossSum(result={}){return money4((result.productLines||[]).reduce((sum,line)=>sum+Number(line?.grossAmount||0),0))}\nfunction supplierProfileNeedsVerification(result={},profile=null){\n  if(!profile?.forceOpenAiVerification)return false;\n  const absurdPrice=(result.productLines||[]).some(line=>{const q=Number(line?.quantity||0),price=Number(line?.unitPrice||0),net=Number(line?.netAmount||0);return q>0&&net>0&&price>100&&net/q<100});\n  const gross=Number(result.totalGross||0),lines=lineGrossSum(result);\n  const totalMismatch=gross>0&&lines>0&&Math.abs(gross-lines)>0.05;\n  return absurdPrice||totalMismatch||profile.forceOpenAiVerification;\n}`;
src=src.replace(normLine,profileCode);

const azureBlock=`  if(azureConfigured()){\n    try{const azure=normalizeAzure(await callAzure(fileData,mimeType),ocrRows);if(azure.productLines.length||azure.aiConfidence>=40)return res.json(azure);console.warn("Azure Invoice Learning returned weak result; falling back to OpenAI.")}\n    catch(error){console.error("Azure Invoice Learning fallback:",error?.message||error)}\n  }`;
if(!src.includes(azureBlock))throw new Error("supplier-profile patch: Azure branch marker not found");
const patchedAzure=`  let azureDraft=null;let activeSupplierProfile=null;\n  if(azureConfigured()){\n    try{\n      const azure=normalizeAzure(await callAzure(fileData,mimeType),ocrRows);\n      azureDraft=azure;activeSupplierProfile=supplierReadingProfile(azure);\n      const supplierScopedCheck=supplierProfileNeedsVerification(azure,activeSupplierProfile);\n      if((azure.productLines.length||azure.aiConfidence>=40)&&!supplierScopedCheck)return res.json(azure);\n      if(supplierScopedCheck)console.warn(\`Invoice Learning supplier profile \${activeSupplierProfile?.key||\"unknown\"}: Azure result will be verified by OpenAI.\`);\n      else console.warn("Azure Invoice Learning returned weak result; falling back to OpenAI.");\n    }catch(error){console.error("Azure Invoice Learning fallback:",error?.message||error)}\n  }`;
src=src.replace(azureBlock,patchedAzure);

const promptNeedle='\\n\\nΠρόχειρο OCR confidence ${Number(ocrConfidence||0)}%:\\n${ocrText||"(χωρίς χρήσιμο OCR κείμενο)"}`;';
if(!src.includes(promptNeedle))throw new Error("supplier-profile patch: prompt tail marker not found");
const promptReplacement='\\n\\n${activeSupplierProfile?`SUPPLIER PROFILE (ισχύει μόνο για αυτόν τον προμηθευτή): ${activeSupplierProfile.instructions}\\n\\n`:""}${azureDraft?`AZURE DRAFT ΓΙΑ ΔΙΑΣΤΑΥΡΩΣΗ (όχι αυθεντία): ${JSON.stringify({supplier:azureDraft.supplier,documentNumber:azureDraft.documentNumber,totalNet:azureDraft.totalNet,totalVat:azureDraft.totalVat,totalGross:azureDraft.totalGross,productLines:azureDraft.productLines}).slice(0,50000)}\\n\\n`:""}Πρόχειρο OCR confidence ${Number(ocrConfidence||0)}%:\\n${ocrText||"(χωρίς χρήσιμο OCR κείμενο)"}`;';
src=src.replace(promptNeedle,promptReplacement);

const responseNeedle='  res.json({ok:true,provider:"OPENAI",model:process.env.OPENAI_INVOICE_MODEL||"gpt-5",...result});';
if(!src.includes(responseNeedle))throw new Error("supplier-profile patch: response marker not found");
src=src.replace(responseNeedle,'  res.json({ok:true,provider:"OPENAI",model:process.env.OPENAI_INVOICE_MODEL||"gpt-5",supplierProfile:activeSupplierProfile?.key||null,...result});');

fs.writeFileSync(path,src);
console.log("Invoice Learning supplier-scoped reading profiles installed (IFANTIS 094095506 isolated).");
