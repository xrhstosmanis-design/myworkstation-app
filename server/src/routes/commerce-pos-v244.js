import {Router} from "express";
import {prisma} from "../prisma.js";
import {requireCompanyModule} from "../middleware/module-access.js";
import coreRouter from "./commerce-pos-v244-core.js";

const router=Router();
const round2=value=>Math.round((Number(value||0)+Number.EPSILON)*100)/100;
const CANONICAL_VAT=new Set([0,6,13,24]);
const normalizeDocumentNumber=value=>String(value||"").trim().toLocaleUpperCase("el-GR").replace(/\s+/g,"");
const cleanTaxId=value=>String(value||"").replace(/\D/g,"");
const norm=value=>String(value||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLocaleUpperCase("el-GR").replace(/[^A-ZΑ-Ω0-9]/g,"");
const normalizeIntakeDate=value=>{const text=String(value||"").trim();if(!text)return null;if(/^\d{4}-\d{2}-\d{2}$/.test(text))return text;const m=text.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/);return m?`${m[3]}-${String(m[2]).padStart(2,"0")}-${String(m[1]).padStart(2,"0")}`:null};
const intakeNumber=value=>{const text=String(value??"").trim().replace(/\s/g,"");const normalized=text.includes(",")?text.replace(/\./g,"").replace(",","."):text;const n=Number(normalized.replace(/[^0-9.-]/g,""));return Number.isFinite(n)?n:0};
const normalizedLineGross=line=>{const net=Number(line?.netAmount||0),vat=Number(line?.vatRate||0),stored=Number(line?.grossAmount||0);if(net>0&&CANONICAL_VAT.has(Math.round(vat)))return round2(net*(1+Math.round(vat)/100));return round2(stored)};

function outputText(response){
  if(typeof response?.output_text==="string"&&response.output_text.trim())return response.output_text;
  for(const item of response?.output||[])for(const part of item?.content||[])if(part?.type==="output_text"&&part.text)return part.text;
  return "";
}

async function matchSupplier(companyId,candidate={}){
  const taxId=cleanTaxId(candidate.taxId);
  if(taxId){
    const rows=await prisma.$queryRaw`SELECT "id","name","taxId" FROM "Supplier" WHERE "companyId"=${companyId} AND "active"=true AND REGEXP_REPLACE(COALESCE("taxId",''),'\\D','','g')=${taxId} LIMIT 1`;
    if(rows[0])return rows[0];
  }
  const key=norm(candidate.name);
  if(key.length>=4){
    const rows=await prisma.$queryRaw`SELECT "id","name","taxId" FROM "Supplier" WHERE "companyId"=${companyId} AND "active"=true ORDER BY "name"`;
    const exact=rows.find(row=>norm(row.name)===key);if(exact)return exact;
    const close=rows.find(row=>{const k=norm(row.name);return key.length>=7&&k.length>=7&&(k.includes(key)||key.includes(k));});if(close)return close;
  }
  return null;
}

const fastHeaderSchema={type:"object",additionalProperties:false,properties:{
  confidence:{type:"number",minimum:0,maximum:100},
  supplierName:{type:"string"},
  supplierTaxId:{type:"string"},
  documentNumber:{type:"string"},
  documentDate:{type:"string"},
  totalGross:{type:"number",minimum:0}
},required:["confidence","supplierName","supplierTaxId","documentNumber","documentDate","totalGross"]};

router.get("/ai-reader/capability",requireCompanyModule("AI_READER"),(req,res)=>{
  res.json({enabled:true,moduleKey:"AI_READER"});
});

router.post("/ai-reader/fast-header",requireCompanyModule("AI_READER"),async(req,res,next)=>{
  try{
    if(!process.env.OPENAI_API_KEY)return res.status(503).json({error:"Δεν έχει συνδεθεί ο AI provider για PREMIUM FAST ανάγνωση.",code:"AI_PROVIDER_NOT_CONFIGURED"});
    const storeId=String(req.body?.storeId||"");
    const filename=String(req.body?.filename||"invoice.jpg").slice(0,180);
    const mimeType=String(req.body?.mimeType||"image/jpeg");
    const dataUrl=String(req.body?.dataUrl||"");
    if(!storeId||!dataUrl)return res.status(400).json({error:"Δεν βρέθηκε το αρχείο του τιμολογίου."});
    const store=await prisma.store.findFirst({where:{id:storeId,companyId:req.user.companyId},select:{id:true}});
    if(!store)return res.status(404).json({error:"Δεν βρέθηκε το κατάστημα."});
    if(req.user?.tokenType==="STORE_OPERATOR"&&String(req.user.storeId)!==storeId)return res.status(403).json({error:"Δεν έχεις πρόσβαση σε αυτό το κατάστημα."});
    const isPdf=mimeType==="application/pdf";
    if(!isPdf&&!/^data:image\/(jpeg|png|webp);base64,/i.test(dataUrl))return res.status(400).json({error:"Το PREMIUM FAST υποστηρίζει εικόνα ή PDF."});
    if(isPdf&&!/^data:application\/pdf;base64,/i.test(dataUrl))return res.status(400).json({error:"Μη έγκυρο PDF."});
    const filePart=isPdf
      ?{type:"input_file",filename,file_data:dataUrl.split(",").pop()}
      :{type:"input_image",image_url:dataUrl,detail:"high"};
    const prompt=`Είσαι FAST ελεγκτής ελληνικού τιμολογίου προμηθευτή για πληρωμή στο POS. Κοίτα ολόκληρο το πρωτότυπο παραστατικό, ιδίως την επάνω περιοχή για στοιχεία εκδότη/παραστατικού και την κάτω περιοχή για τα τελικά σύνολα. ΜΗΝ αναλύσεις προϊόντα και ΜΗΝ επιστρέψεις γραμμές ειδών.

Χρειάζομαι ΜΟΝΟ αυτά τα 5 στοιχεία:
1. supplierName = ο ΕΚΔΟΤΗΣ/ΠΡΟΜΗΘΕΥΤΗΣ του παραστατικού, όχι ο πελάτης/παραλήπτης.
2. supplierTaxId = το ΑΦΜ του εκδότη/προμηθευτή.
3. documentNumber = ο ακριβής αριθμός/σειρά παραστατικού. Μπορεί να εμφανίζεται ως Αρ. Παραστατικού, Αριθμός, ΤΙΜ, ΤΔΑ, Invoice No, Σειρά/Αριθμός. ΠΡΕΠΕΙ να περιέχει τουλάχιστον ένα ψηφίο. Μην βάλεις λέξη κεφαλίδας.
4. documentDate = η ημερομηνία έκδοσης του παραστατικού σε YYYY-MM-DD. Μην χρησιμοποιήσεις σημερινή ημερομηνία αν δεν φαίνεται στο χαρτί.
5. totalGross = το ΤΕΛΙΚΟ ΠΛΗΡΩΤΕΟ ποσό με ΦΠΑ. Ψάξε ενδείξεις όπως ΠΛΗΡΩΤΕΟ, ΓΕΝΙΚΟ ΣΥΝΟΛΟ, ΤΕΛΙΚΟ ΣΥΝΟΛΟ, ΣΥΝΟΛΟ, TOTAL DUE, GRAND TOTAL. Μην χρησιμοποιήσεις καθαρή αξία, αξία ΦΠΑ ή ενδιάμεσο subtotal.

Αν ένα από αυτά δεν φαίνεται καθαρά, επέστρεψε κενό string ή 0. ΜΗΝ εφευρίσκεις στοιχεία. confidence = συνολική βεβαιότητα μόνο για αυτά τα βασικά πεδία.`;
    const aiResponse=await fetch("https://api.openai.com/v1/responses",{method:"POST",headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`,"Content-Type":"application/json"},body:JSON.stringify({
      model:process.env.OPENAI_INVOICE_MODEL||"gpt-5",
      input:[{role:"user",content:[{type:"input_text",text:prompt},filePart]}],
      text:{format:{type:"json_schema",name:"invoice_fast_header",strict:true,schema:fastHeaderSchema}}
    })});
    if(!aiResponse.ok){const text=await aiResponse.text();const error=new Error(`PREMIUM FAST AI απέτυχε (${aiResponse.status}). ${text.slice(0,300)}`);error.status=502;throw error;}
    const parsed=JSON.parse(outputText(await aiResponse.json())||"{}");
    const supplier=await matchSupplier(req.user.companyId,{name:parsed.supplierName,taxId:parsed.supplierTaxId});
    const documentNumber=String(parsed.documentNumber||"").trim();
    const documentDate=/^\d{4}-\d{2}-\d{2}$/.test(String(parsed.documentDate||""))?String(parsed.documentDate):"";
    const totalGross=round2(parsed.totalGross||0);
    res.json({
      confidence:Number(parsed.confidence||0),
      supplierId:supplier?.id||"",
      supplierName:supplier?.name||String(parsed.supplierName||""),
      supplierTaxId:supplier?.taxId||String(parsed.supplierTaxId||""),
      documentNumber:/\d/.test(documentNumber)?documentNumber:"",
      documentDate,
      totalGross:totalGross>0?totalGross:0
    });
  }catch(error){next(error)}
});

router.post("/ai-reader/fast-duplicate-check",requireCompanyModule("AI_READER"),async(req,res,next)=>{
  try{
    const companyId=req.user.companyId;
    const storeId=String(req.body?.storeId||"");
    const supplierId=String(req.body?.supplierId||"");
    const documentNumber=normalizeDocumentNumber(req.body?.documentNumber);
    if(!storeId||!supplierId||!documentNumber)return res.status(400).json({error:"Χρειάζονται κατάστημα, προμηθευτής και αριθμός τιμολογίου για τον γρήγορο έλεγχο duplicate."});
    const docs=await prisma.$queryRaw`
      SELECT d."id",d."status",d."documentNumber",d."documentDate"
      FROM "PurchaseDocument" d
      WHERE d."companyId"=${companyId} AND d."storeId"=${storeId} AND d."supplierId"=${supplierId}
        AND d."status" IN ('DRAFT','APPROVED')
        AND UPPER(REGEXP_REPLACE(TRIM(COALESCE(d."documentNumber",'')),'\\s+','','g'))=${documentNumber}
      ORDER BY d."documentDate" DESC LIMIT 1`;
    if(docs[0])return res.status(409).json({error:"Το ίδιο τιμολόγιο υπάρχει ήδη και η δεύτερη καταχώριση μπλοκαρίστηκε.",code:"DUPLICATE_INVOICE",existing:docs[0]});
    const orders=await prisma.$queryRaw`
      SELECT o."id",o."status",o."invoiceNumber" AS "documentNumber",o."updatedAt"
      FROM "PurchaseOrder" o
      WHERE o."companyId"=${companyId} AND o."storeId"=${storeId} AND o."supplierId"=${supplierId}
        AND o."status" IN ('NEW','FINAL','INVOICED')
        AND UPPER(REGEXP_REPLACE(TRIM(COALESCE(o."invoiceNumber",'')),'\\s+','','g'))=${documentNumber}
      ORDER BY o."updatedAt" DESC LIMIT 1`;
    if(orders[0])return res.status(409).json({error:"Το ίδιο τιμολόγιο υπάρχει ήδη και η δεύτερη καταχώριση μπλοκαρίστηκε.",code:"DUPLICATE_INVOICE",existing:orders[0]});
    res.json({ok:true,duplicate:false});
  }catch(error){next(error)}
});

// The invoice UI labels finalized Azure lines with AZURE_DOCUMENT_INTELLIGENCE,
// while the stable V2.4.4 core expects the legacy V2.4.4 source label. Normalize
// only this transport label; the actual line values remain unchanged.
router.use("/ai-reader/jobs/:jobId/product-lines",(req,res,next)=>{
  if(req.method==="PUT"&&req.body?.source==="AZURE_DOCUMENT_INTELLIGENCE")req.body.source="V2.4.4";
  next();
});

router.post("/ai-reader/jobs/:jobId/pos-intake",async(req,res,next)=>{
  try{
    const jobs=await prisma.$queryRaw`SELECT "resultJson" FROM "AiReaderJob" WHERE "id"=${req.params.jobId} AND "companyId"=${req.user.companyId} LIMIT 1`;
    const result=jobs[0]?.resultJson&&typeof jobs[0].resultJson==="object"?jobs[0].resultJson:{};
    const source=req.body&&typeof req.body==="object"?req.body:{};
    const totalFromRequest=intakeNumber(source.totalGross);
    const totalFromResult=intakeNumber(result.totalGross);
    const documentNumber=String(source.documentNumber||result.documentNumber||"").trim().slice(0,80);
    const documentDate=normalizeIntakeDate(source.documentDate)||normalizeIntakeDate(result.documentDate)||null;
    const supplierId=String(source.supplierId||"").trim();
    const settlementMode=source.settlementMode==="PAID"?"PAID":"CREDIT";
    const note=source.note==null?null:String(source.note).trim().slice(0,500);
    const requestedTotal=totalFromRequest>0?totalFromRequest:totalFromResult;
    req.body={supplierId,documentNumber,documentDate,totalGross:requestedTotal,settlementMode,note};
    const missing=[];
    if(!supplierId)missing.push("Προμηθευτής");
    if(!documentNumber)missing.push("Αρ. τιμολογίου");
    if(!(requestedTotal>0))missing.push("Σύνολο με ΦΠΑ");
    if(missing.length)return res.status(400).json({error:`Λείπουν υποχρεωτικά στοιχεία: ${missing.join(", ")}.`,code:"POS_INTAKE_FIELDS_MISSING",fields:missing});
    const lines=Array.isArray(result.productLines)?result.productLines:[];
    if(!lines.length)return res.status(409).json({error:"Δεν υπάρχουν ασφαλείς structured γραμμές V2.4.4. Η καταχώριση μπλοκαρίστηκε."});

    // Never trust a stale Azure grossAmount when netAmount + canonical VAT are known.
    // The verified discounts are already reflected in netAmount; therefore gross must
    // be rebuilt from that net. This also repairs older jobs already saved in resultJson.
    let correctedGrossLines=0;
    const normalizedLines=lines.map(line=>{
      const grossAmount=normalizedLineGross(line);
      if(Math.abs(grossAmount-Number(line?.grossAmount||0))>0.005)correctedGrossLines+=1;
      return {...line,grossAmount};
    });
    const structuredGross=round2(normalizedLines.reduce((sum,line)=>sum+Number(line?.grossAmount||0),0));
    const structuredNet=round2(normalizedLines.reduce((sum,line)=>sum+Number(line?.netAmount||0),0));
    if(!(structuredGross>0))return res.status(409).json({error:"Οι γραμμές V2.4.4 δεν έχουν έγκυρα σύνολα. Απαιτείται επανέλεγχος του τιμολογίου."});
    const diff=round2(Math.abs(structuredGross-requestedTotal));
    if(diff>0.05)return res.status(409).json({error:`ΜΠΛΟΚΑΡΙΣΤΗΚΕ: το σύνολο των γραμμών (${structuredGross.toFixed(2)} €) δεν συμφωνεί με το σύνολο τιμολογίου (${requestedTotal.toFixed(2)} €). Διαφορά ${diff.toFixed(2)} €. Κάνε επανέλεγχο πριν από την καταχώριση.`,code:"V244_TOTAL_MISMATCH",structuredGross,structuredNet,invoiceGross:round2(requestedTotal),difference:diff,correctedGrossLines});

    if(correctedGrossLines>0){
      const repaired={...result,productLines:normalizedLines,grossNormalizedAt:new Date().toISOString(),grossNormalization:"NET_PLUS_CANONICAL_VAT"};
      await prisma.$executeRaw`UPDATE "AiReaderJob" SET "resultJson"=${JSON.stringify(repaired)}::jsonb,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${req.params.jobId} AND "companyId"=${req.user.companyId}`;
    }
    next();
  }catch(error){next(error)}
});

router.use(coreRouter);
export default router;