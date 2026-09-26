import {Router} from "express";
import {z} from "zod";
import {prisma} from "../prisma.js";
import {requireCompanyModule} from "../middleware/module-access.js";
import {invoicePageReviewChecks,normalizedAssistantPages} from "./invoice-assistant-review.js";
import {invoiceAssistantImageViews} from "../lib/invoice-assistant-image-views.js";
import {invoiceAssistantDiscounts} from "../lib/invoice-assistant-discounts.js";

const router=Router();
const managers=new Set(["SUPER_ADMIN","OWNER","ADMIN","MANAGER"]);
const fields=new Set(["description","quantity","unitCost","discount1","discount2","discount3","exciseTotal","vatRate","invoiceUnit","stockUnitsPerInvoiceUnit"]);
const numericFields=new Set(["quantity","unitCost","discount1","discount2","discount3","exciseTotal","vatRate","stockUnitsPerInvoiceUnit"]);
const schema={
  type:"object",additionalProperties:false,required:["assistantMessage","corrections","printedLines","printedTotal","printedQuantityTotal","printedNetTotal","expectedPageCount","visiblePageNumbers","singlePageComplete"],
  properties:{
    assistantMessage:{type:"string"},printedTotal:{type:"string"},printedQuantityTotal:{type:"string"},printedNetTotal:{type:"string"},expectedPageCount:{type:"integer"},visiblePageNumbers:{type:"array",items:{type:"integer"}},singlePageComplete:{type:"boolean"},
    corrections:{type:"array",items:{type:"object",additionalProperties:false,required:["lineId","field","value","reason"],properties:{lineId:{type:"string"},field:{type:"string"},value:{type:"string"},reason:{type:"string"}}}},
    printedLines:{type:"array",items:{type:"object",additionalProperties:false,required:["sequence","supplierCode","description","quantity","invoiceUnit","stockUnitsPerInvoiceUnit","unitCost","unitDiscountAmount","discount1","discount2","discount3","exciseTotal","vatRate","netAmount","grossAmount","matchingLineId","confidence"],properties:Object.fromEntries(["sequence","supplierCode","description","quantity","invoiceUnit","stockUnitsPerInvoiceUnit","unitCost","unitDiscountAmount","discount1","discount2","discount3","exciseTotal","vatRate","netAmount","grossAmount","matchingLineId","confidence"].map(key=>[key,{type:"string"}]))}}
  }
};
const responseText=value=>typeof value?.output_text==="string"?value.output_text:(value?.output||[]).flatMap(item=>item.content||[]).find(part=>part.type==="output_text")?.text||"";
const number=value=>Number(String(value??"").replace(",","."));

function manager(req,res,next){
  if(req.user?.tokenType==="STORE_OPERATOR"||!managers.has(req.user?.role))return res.status(403).json({error:"Ο έλεγχος τιμολογίου είναι διαθέσιμος μόνο σε ιδιοκτήτη ή διαχειριστή."});
  next();
}

async function source(companyId,orderId){
  const docs=await prisma.$queryRaw`
    SELECT d."id",d."storeId",d."documentNumber",d."totalGross",d."supplierId"
    FROM "PurchaseOrder" o JOIN "PurchaseDocument" d ON d."id"=o."sourceDocumentId" AND d."companyId"=o."companyId"
    WHERE o."id"=${orderId} AND o."companyId"=${companyId} AND o."status"='NEW'
      AND o."sourceType"='POS_OCR_DRAFT' AND d."status"='DRAFT' AND d."sourceType"='POS_OCR_DRAFT' LIMIT 1`;
  const document=docs[0];if(!document)return null;
  const jobs=await prisma.$queryRaw`
    SELECT j."id",j."resultJson" FROM "AiReaderJob" j
    WHERE j."companyId"=${companyId} AND j."storeId"=${document.storeId}
      AND j."purchaseDocumentId"=${document.id} ORDER BY j."createdAt",j."id" LIMIT 1`;
  const job=jobs[0];if(!job)return {document,pages:[]};
  const ids=[job.id,...(Array.isArray(job.resultJson?.posHandoff?.pageJobIds)?job.resultJson.posHandoff.pageJobIds:[]).filter(id=>id!==job.id)].slice(0,5);
  const pages=[];
  for(const pageId of ids){
    const rows=await prisma.$queryRaw`SELECT a."filename",a."mimeType",a."contentData"
      FROM "AiReaderJob" j JOIN "DocumentAttachment" a ON a."id"=j."attachmentId" AND a."companyId"=j."companyId"
      WHERE j."id"=${pageId} AND j."companyId"=${companyId} AND j."storeId"=${document.storeId} LIMIT 1`;
    if(!rows[0]?.contentData)return {document,pages:[]};
    pages.push(rows[0]);
  }
  return {document,pages};
}

router.get("/purchase-orders/:orderId/invoice-assistant/source",requireCompanyModule("AI_READER"),manager,async(req,res,next)=>{
  try{
    const result=await source(req.user.companyId,req.params.orderId);
    if(!result)return res.status(404).json({error:"Δεν υπάρχει ενεργό πρόχειρο POS για αυτό το τιμολόγιο."});
    if(!result.pages.length)return res.status(409).json({error:"Δεν βρέθηκαν όλες οι φωτογραφίες του τιμολογίου."});
    res.json({document:{id:result.document.id,documentNumber:result.document.documentNumber,totalGross:Number(result.document.totalGross||0)},pages:result.pages.map((page,index)=>({index:index+1,filename:page.filename,mimeType:page.mimeType,dataUrl:page.contentData}))});
  }catch(error){next(error)}
});

router.post("/purchase-orders/:orderId/invoice-assistant/preview",requireCompanyModule("AI_READER"),manager,async(req,res,next)=>{
  try{
    const {message,history}=z.object({message:z.string().trim().min(1).max(1500),history:z.array(z.object({role:z.enum(["user","assistant"]),text:z.string().max(2000)})).max(12).default([])}).parse(req.body||{});
    if(!process.env.OPENAI_API_KEY)return res.status(503).json({error:"Δεν έχει ρυθμιστεί το κλειδί AI στον server."});
    const result=await source(req.user.companyId,req.params.orderId);
    if(!result)return res.status(404).json({error:"Δεν υπάρχει ενεργό πρόχειρο POS για αυτό το τιμολόγιο."});
    if(!result.pages.length)return res.status(409).json({error:"Δεν βρέθηκαν όλες οι φωτογραφίες του τιμολογίου."});
    const rows=await prisma.$queryRaw`SELECT "id","ocrSequence","supplierCode","description","quantity","unitCost","invoiceUnit","stockUnitsPerInvoiceUnit","discount1","discount2","discount3","exciseTotal","vatRate","netAmount","grossAmount","ocrRawText"
      FROM "PurchaseOrderLine" WHERE "orderId"=${req.params.orderId} ORDER BY COALESCE("ocrSequence",2147483647),"createdAt","id"`;
    const current=rows.map(row=>({...row,quantity:Number(row.quantity||0),unitCost:Number(row.unitCost||0),stockUnitsPerInvoiceUnit:Number(row.stockUnitsPerInvoiceUnit||1),discount1:Number(row.discount1||0),discount2:Number(row.discount2||0),discount3:Number(row.discount3||0),exciseTotal:Number(row.exciseTotal||0),vatRate:Number(row.vatRate||0),netAmount:Number(row.netAmount||0),grossAmount:Number(row.grossAmount||0)}));
    const instruction=`Πρώτα έλεγξε την τυπωμένη ένδειξη αρίθμησης σελίδων σε κάθε φωτογραφία: expectedPageCount είναι ο συνολικός αριθμός φυσικών σελίδων του παραστατικού και visiblePageNumbers οι φυσικοί αριθμοί σελίδων που ΠΡΑΓΜΑΤΙΚΑ δόθηκαν. Αν δεν μπορείς να το επιβεβαιώσεις, expectedPageCount=0 και visiblePageNumbers=[]. Για μία φωτογραφία χωρίς τυπωμένο συνολικό πλήθος σελίδων (αρίθμητη ή με μόνο «Σελίδα: 1»), βάλε expectedPageCount=0, visiblePageNumbers=[] ή [1] αντίστοιχα και singlePageComplete=true ΜΟΝΟ όταν φαίνονται ολόκληρα η κεφαλίδα, όλες οι σειρές και το τελικό πληρωτέο στο ίδιο φύλλο χωρίς ένδειξη συνέχειας. Για ελλιπείς σελίδες ή αρίθμηση με γνωστό πλήθος singlePageComplete=false. Η ένδειξη «Σελίδα 2/2» σε μία μόνο φωτογραφία σημαίνει expectedPageCount=2, visiblePageNumbers=[2] και απαγορεύεται να θεωρήσεις το τιμολόγιο πλήρες. Μην αντιγράφεις το σύνολο κεφαλίδας ως απόδειξη πληρότητας γραμμών. Διάβασε ΟΛΕΣ τις φυσικές γραμμές στις φωτογραφίες με τη σειρά. Κάθε πλήρης σελίδα ακολουθείται από μεγέθυνση του ίδιου πίνακα· χρησιμοποίησε τη μεγέθυνση για κωδικό, ποσότητα και αριθμητικές στήλες, αλλά κράτησε κάθε φυσική γραμμή μόνο μία φορά. Πριν απαντήσεις, σύγκρινε το άθροισμα ποσοτήτων και καθαρών αξιών με τα τυπωμένα σύνολα και γράψε printedQuantityTotal και printedNetTotal (κενό string αν δεν υπάρχουν): μία γραμμή διαγραμμένη με στυλό μπορεί παρ’ όλα αυτά να περιλαμβάνεται στο σύνολο και πρέπει να επιστραφεί αν συμμετέχει. Επέστρεψε μία printedLines εγγραφή ανά τυπωμένη γραμμή ακόμη και αν ΔΕΝ υπάρχει στο πρόχειρο· matchingLineId είναι το id της αντίστοιχης υπάρχουσας γραμμής ή κενό string. Διάβασε κάθε στήλη ανεξάρτητα: αν ένα πεδίο δεν φαίνεται, άφησε ΜΟΝΟ εκείνο κενό και διατήρησε όλους τους ευκρινείς κωδικούς, ποσότητες, τιμές, εκπτώσεις και ΦΠΑ της ίδιας γραμμής. confidence="certain" μόνο όταν όλα τα πεδία διακρίνονται, αλλιώς "uncertain" χωρίς να σβήσεις τα πεδία που φαίνονται· μην εφευρίσκεις αριθμούς. Η τυπωμένη «ΜΙΚΤΗ ΑΞΙΑ» ενδέχεται να είναι πριν από έκπτωση και ΦΠΑ, ενώ το grossAmount εδώ σημαίνει τελικό ποσό γραμμής μετά έκπτωση και ΦΠΑ. Αν το έντυπο έχει δύο επίπεδα έκπτωσης (ποσό ανά μονάδα και ποσοστό), διάβασε την αρχική τιμή unitCost, το σταθερό ποσό ανά μονάδα unitDiscountAmount και τις ρητές ποσοστιαίες εκπτώσεις χωριστά (0 αν δεν υπάρχουν), και χρησιμοποίησε την τυπωμένη καθαρή αξία για επαλήθευση. Οι τιμές των αριθμητικών πεδίων είναι δεκαδικά strings χωρίς σύμβολα. Το printedTotal είναι το πληρωτέο όπως φαίνεται τυπωμένο στο έντυπο, ή κενό string αν δεν διαβάζεται· το αποθηκευμένο ποσό εγγράφου μπορεί να είναι λανθασμένο. Σύγκρινε χωριστά κωδικό, περιγραφή, ποσότητα, αρχική τιμή, εκπτώσεις, καθαρό, ΕΦΚ, ΦΠΑ, μικτό και πλήθος γραμμών. Οι corrections αφορούν μόνο πραγματικές διαφορές σε υπαρκτά lineId, ποτέ ίδια τιμή ή ίδιο ΦΠΑ, και περιέχουν την τεκμηρίωση από το έντυπο. Οι ελλείπουσες γραμμές εμφανίζονται στο printedLines χωρίς matchingLineId. Για αβέβαιη ανάγνωση περιέγραψε τι χρειάζεται έλεγχο, χωρίς αριθμητική πρόταση. Ποσότητα τιμολογίου και μονάδα αποθήκης είναι διαφορετικά πεδία: 48 πακέτα × 100 τεμάχια σημαίνει quantity=48, invoiceUnit=PACKAGE, stockUnitsPerInvoiceUnit=100. ΕΦΚ είναι ποσό ανά γραμμή και προστίθεται στην καθαρή φορολογητέα αξία πριν από ΦΠΑ. Μην τον συγχέεις με εγγυοδοσία. Επιτρεπτά πεδία διορθώσεων: ${[...fields].join(", ")}. Δώσε σύντομο assistantMessage στα ελληνικά και επισήμανε τυχόν ασυμφωνία συνόλου ακόμη και αν η διαφορά είναι έως 0,05 €, όταν υπάρχουν λάθη σε γραμμές. Πρόταση μόνο· δεν εκτελείς πληρωμή, εκμάθηση, οριστικοποίηση ή απόθεμα. Αποθηκευμένο ποσό από προηγούμενη ανάγνωση (όχι απαραίτητα σωστό) ${Number(result.document.totalGross||0)} €. Υπάρχουσες γραμμές: ${JSON.stringify(current).slice(0,45000)}. Ιστορικό συζήτησης: ${JSON.stringify(history).slice(0,16000)}. Νέα οδηγία: ${message}`;
    const files=await invoiceAssistantImageViews(result.pages);
    const response=await fetch("https://api.openai.com/v1/responses",{method:"POST",headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`,"Content-Type":"application/json"},signal:AbortSignal.timeout(120000),body:JSON.stringify({model:process.env.OPENAI_INVOICE_ASSISTANT_MODEL||"gpt-5.6-sol",reasoning:{effort:"medium"},max_output_tokens:30000,input:[{role:"user",content:[{type:"input_text",text:instruction},...files]}],text:{format:{type:"json_schema",name:"invoice_assistant_preview",strict:true,schema}}})});
    if(!response.ok)return res.status(502).json({error:`Ο βοηθός δεν απάντησε (${response.status}).`});
    const parsed=JSON.parse(responseText(await response.json()));
    const ids=new Set(current.map(row=>row.id));
    const corrections=(Array.isArray(parsed.corrections)?parsed.corrections:[]).filter(item=>ids.has(item.lineId)&&fields.has(item.field)).filter(item=>{
      if(item.field==="invoiceUnit")return ["PIECE","PACKAGE"].includes(item.value);
      if(item.field==="description")return typeof item.value==="string"&&item.value.trim().length>0&&item.value.length<=250;
      if(!numericFields.has(item.field))return false;
      const n=number(item.value);
      return Number.isFinite(n)&&n>=0&&n<=1000000&&(item.field!=="quantity"||n>0)&&(item.field!=="vatRate"||n<=100)&&(item.field!=="stockUnitsPerInvoiceUnit"||n>=1)&&(item.field!=="stockUnitsPerInvoiceUnit"||Number.isInteger(n))&&(!item.field.startsWith("discount")||n<=100);
    }).filter(item=>{const before=current.find(row=>row.id===item.lineId)?.[item.field];return numericFields.has(item.field)?Math.abs(number(before)-number(item.value))>0.000001:String(before??"").trim()!==String(item.value).trim()}).slice(0,100).map(item=>({lineId:item.lineId,field:item.field,value:String(item.value).slice(0,250),reason:String(item.reason||"").slice(0,400)}));
    const used=new Set();const printedLines=(Array.isArray(parsed.printedLines)?parsed.printedLines:[]).slice(0,150).map((line,index)=>{const matchingLineId=ids.has(line.matchingLineId)&&!used.has(line.matchingLineId)?line.matchingLineId:"";if(matchingLineId)used.add(matchingLineId);const unitCost=number(line.unitCost),basket=number(line.unitDiscountAmount);
      const hasBasket=Number.isFinite(unitCost)&&unitCost>0&&Number.isFinite(basket)&&basket>0&&basket<unitCost;
      const [discount1,discount2,discount3]=invoiceAssistantDiscounts({quantity:number(line.quantity),unitCost,unitDiscountAmount:hasBasket?basket:0,printedDiscounts:[line.discount1,line.discount2,line.discount3].map(number),netAmount:number(line.netAmount)});
      return {...line,discount1:String(discount1),discount2:String(discount2),discount3:String(discount3),sequence:String(index+1),matchingLineId}});
    const matchedIds=new Set(printedLines.map(line=>line.matchingLineId).filter(Boolean));
    const printedTotal=/^\d+(?:[.,]\d{1,2})?$/.test(String(parsed.printedTotal||""))?number(parsed.printedTotal):null;
    const checks=invoicePageReviewChecks({...normalizedAssistantPages({...parsed,sourcePageCount:result.pages.length}),sourcePageCount:result.pages.length,printedLines,printedTotal,printedQuantityTotal:parsed.printedQuantityTotal,printedNetTotal:parsed.printedNetTotal});
    const reviewReady=checks.pagesComplete&&checks.grossAgrees&&checks.quantityAgrees&&checks.netAgrees;
    const issues=[!checks.pagesComplete?`Σελίδες: το μοντέλο δήλωσε ${parsed.expectedPageCount} / ${JSON.stringify(parsed.visiblePageNumbers)}, φωτογραφίες ${result.pages.length}, πλήρες μονόφυλλο ${parsed.singlePageComplete}.`:null,!checks.grossAgrees?`Πληρωτέο γραμμών ${Number(checks.grossSum).toFixed(2)} € αντί τυπωμένου ${printedTotal??"άγνωστο"} €.`:null,!checks.quantityAgrees?`Ποσότητα γραμμών ${checks.quantitySum} αντί τυπωμένης ${parsed.printedQuantityTotal||"άγνωστης"}.`:null,!checks.netAgrees?`Καθαρό γραμμών ${Number(checks.netSum).toFixed(2)} € αντί τυπωμένου ${parsed.printedNetTotal||"άγνωστου"} €.`:null].filter(Boolean);
    res.json({assistantMessage:String(parsed.assistantMessage||"").slice(0,5000),corrections:reviewReady?corrections.filter(change=>matchedIds.has(change.lineId)):[],printedLines,printedTotal,printedQuantityTotal:parsed.printedQuantityTotal,printedNetTotal:parsed.printedNetTotal,reviewOnly:true,pagesComplete:reviewReady,pageWarning:reviewReady?"":`${issues.join(" ")} Οι προτάσεις δεν εφαρμόζονται.`});
  }catch(error){next(error)}
});

export default router;
