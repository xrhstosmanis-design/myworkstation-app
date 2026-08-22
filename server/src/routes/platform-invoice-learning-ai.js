import {Router} from "express";

const router=Router();

function outputText(response){
  if(typeof response?.output_text==="string"&&response.output_text.trim())return response.output_text;
  for(const item of response?.output||[])for(const part of item?.content||[])if(part?.type==="output_text"&&part.text)return part.text;
  return "";
}

const lineProperties={
  supplierItemCode:{type:"string"},
  description:{type:"string"},
  quantity:{type:"number",minimum:0},
  unit:{type:"string"},
  unitsPerPackage:{type:"number",minimum:0},
  unitPrice:{type:"number",minimum:0},
  discount1:{type:"number",minimum:0,maximum:100},
  discount2:{type:"number",minimum:0,maximum:100},
  discount3:{type:"number",minimum:0,maximum:100},
  netUnitCost:{type:"number",minimum:0},
  netAmount:{type:"number",minimum:0},
  vatRate:{type:"number",minimum:0,maximum:100},
  grossAmount:{type:"number",minimum:0},
  barcode:{type:"string"},
  confidence:{type:"number",minimum:0,maximum:100}
};
const lineRequired=Object.keys(lineProperties);
const schema={type:"object",additionalProperties:false,properties:{
  aiConfidence:{type:"number",minimum:0,maximum:100},
  supplier:{type:"object",additionalProperties:false,properties:{name:{type:"string"},taxId:{type:"string"}},required:["name","taxId"]},
  documentNumber:{type:"string"},documentDate:{type:"string"},totalNet:{type:"number",minimum:0},totalVat:{type:"number",minimum:0},totalGross:{type:"number",minimum:0},
  productLines:{type:"array",maxItems:500,items:{type:"object",additionalProperties:false,properties:lineProperties,required:lineRequired}}
},required:["aiConfidence","supplier","documentNumber","documentDate","totalNet","totalVat","totalGross","productLines"]};

router.get("/invoice-learning/ai-status",(req,res)=>res.json({connected:Boolean(process.env.OPENAI_API_KEY),model:process.env.OPENAI_INVOICE_MODEL||"gpt-5"}));

router.post("/invoice-learning/ai-recheck",async(req,res,next)=>{try{
  if(!process.env.OPENAI_API_KEY)return res.status(503).json({error:"Δεν έχει συνδεθεί OPENAI_API_KEY στον server.",code:"AI_PROVIDER_NOT_CONFIGURED"});
  const {filename="invoice",mimeType="image/jpeg",fileData="",ocrRows=[],ocrConfidence=0}=req.body||{};
  if(!fileData||typeof fileData!=="string")return res.status(400).json({error:"Δεν βρέθηκε το πρωτότυπο PDF/φωτογραφία για AI επανέλεγχο."});
  const base64=String(fileData).includes(",")?String(fileData).split(",").pop():String(fileData);
  const filePart=mimeType==="application/pdf"
    ?{type:"input_file",filename:filename||"invoice.pdf",file_data:base64}
    :{type:"input_image",image_url:String(fileData).startsWith("data:")?fileData:`data:${mimeType};base64,${base64}`,detail:"high"};
  const ocrText=(Array.isArray(ocrRows)?ocrRows:[]).slice(0,300).map((r,i)=>`${i+1}. ${String(r?.text||r?.description||"").slice(0,500)}`).join("\n").slice(0,60000);
  const prompt=`Είσαι ειδικός ελεγκτής ελληνικών τιμολογίων προμηθευτών για το MyWorkStation Invoice Learning Lab. Διάβασε ΠΡΩΤΑ το πρωτότυπο PDF/εικόνα και χρησιμοποίησε το OCR μόνο ως βοήθημα.\n\nΣΤΟΧΟΣ: κράτησε ΜΟΝΟ τις πραγματικές γραμμές προϊόντων. ΜΗΝ επιστρέψεις headers, στοιχεία εταιρείας, ΑΦΜ, διευθύνσεις, IBAN, τρόπους πληρωμής, υποσύνολα, σύνολα ή footer ως προϊόντα. Μην εφευρίσκεις τίποτα.\n\nΓια κάθε προϊόν βρες: supplierItemCode, ακριβή περιγραφή, quantity, unit, unitsPerPackage/pack, αρχική unitPrice πριν από εκπτώσεις, έως τρεις διαδοχικές εκπτώσεις discount1/2/3, netUnitCost μετά τις εκπτώσεις, netAmount γραμμής, vatRate, grossAmount και barcode ΜΟΝΟ αν εμφανίζεται πραγματικά στο παραστατικό. Αν barcode δεν υπάρχει άφησέ το κενό — θα βρεθεί αργότερα από Master Catalog/online.\n\nΠΡΟΣΟΧΗ ΣΤΙΣ ΕΚΠΤΩΣΕΙΣ: αν βλέπεις διαδοχικές εκπτώσεις π.χ. 10% + 5%, μην τις αθροίζεις. Το netUnitCost πρέπει να αντιστοιχεί στη διαδοχική εφαρμογή τους. Αν το παραστατικό δίνει ήδη καθαρή τιμή/καθαρή αξία, προτίμησε τα ορατά δεδομένα και χρησιμοποίησε υπολογισμό μόνο για διασταύρωση.\n\nΠΡΟΣΟΧΗ ΣΤΙΣ ΣΥΣΚΕΥΑΣΙΕΣ: 6x500ml, 24τμχ, κιβώτιο κ.λπ. δεν είναι αυτόματα quantity. Ξεχώρισε quantity παραστατικού από unitsPerPackage.\n\nΠΡΙΝ απαντήσεις: μέτρησε οπτικά τις πραγματικές σειρές προϊόντων, σύγκρινε άθροισμα net/gross γραμμών με τα σύνολα και ξανακοίτα τυχόν γραμμές που παρέλειψες. documentDate σε YYYY-MM-DD αν είναι σαφές.\n\nΠρόχειρο OCR confidence ${Number(ocrConfidence||0)}%:\n${ocrText||"(χωρίς χρήσιμο OCR κείμενο)"}`;
  const response=await fetch("https://api.openai.com/v1/responses",{method:"POST",headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`,"Content-Type":"application/json"},body:JSON.stringify({
    model:process.env.OPENAI_INVOICE_MODEL||"gpt-5",
    input:[{role:"user",content:[{type:"input_text",text:prompt},filePart]}],
    text:{format:{type:"json_schema",name:"invoice_learning_extract",strict:true,schema}}
  })});
  const raw=await response.json().catch(()=>({}));
  if(!response.ok)return res.status(response.status).json({error:raw?.error?.message||"Απέτυχε ο AI επανέλεγχος.",code:"AI_PROVIDER_ERROR"});
  const text=outputText(raw);if(!text)return res.status(502).json({error:"Το AI δεν επέστρεψε δομημένο αποτέλεσμα."});
  let result;try{result=JSON.parse(text)}catch{return res.status(502).json({error:"Το AI επέστρεψε μη έγκυρο JSON."})}
  res.json({ok:true,model:process.env.OPENAI_INVOICE_MODEL||"gpt-5",...result});
}catch(error){next(error)}});

export default router;
