import {Router} from "express";
import {z} from "zod";
import {prisma} from "../prisma.js";
import {requireCompanyModule} from "../middleware/module-access.js";

const router=Router();
const managers=new Set(["SUPER_ADMIN","OWNER","ADMIN","MANAGER"]);
const fields=new Set(["description","quantity","unitCost","discount1","discount2","discount3","exciseTotal","vatRate","invoiceUnit","stockUnitsPerInvoiceUnit"]);
const numericFields=new Set(["quantity","unitCost","discount1","discount2","discount3","exciseTotal","vatRate","stockUnitsPerInvoiceUnit"]);
const schema={
  type:"object",additionalProperties:false,required:["assistantMessage","corrections"],
  properties:{
    assistantMessage:{type:"string"},
    corrections:{type:"array",items:{type:"object",additionalProperties:false,required:["lineId","field","value","reason"],properties:{lineId:{type:"string"},field:{type:"string"},value:{type:"string"},reason:{type:"string"}}}}
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
    const {message}=z.object({message:z.string().trim().min(1).max(1500)}).parse(req.body||{});
    if(!process.env.OPENAI_API_KEY)return res.status(503).json({error:"Δεν έχει ρυθμιστεί το κλειδί AI στον server."});
    const result=await source(req.user.companyId,req.params.orderId);
    if(!result)return res.status(404).json({error:"Δεν υπάρχει ενεργό πρόχειρο POS για αυτό το τιμολόγιο."});
    if(!result.pages.length)return res.status(409).json({error:"Δεν βρέθηκαν όλες οι φωτογραφίες του τιμολογίου."});
    const rows=await prisma.$queryRaw`SELECT "id","ocrSequence","supplierCode","description","quantity","unitCost","invoiceUnit","stockUnitsPerInvoiceUnit","discount1","discount2","discount3","exciseTotal","vatRate","netAmount","grossAmount","ocrRawText"
      FROM "PurchaseOrderLine" WHERE "orderId"=${req.params.orderId} ORDER BY COALESCE("ocrSequence",2147483647),"createdAt","id"`;
    const current=rows.map(row=>({...row,quantity:Number(row.quantity||0),unitCost:Number(row.unitCost||0),stockUnitsPerInvoiceUnit:Number(row.stockUnitsPerInvoiceUnit||1),discount1:Number(row.discount1||0),discount2:Number(row.discount2||0),discount3:Number(row.discount3||0),exciseTotal:Number(row.exciseTotal||0),vatRate:Number(row.vatRate||0),netAmount:Number(row.netAmount||0),grossAmount:Number(row.grossAmount||0)}));
    const instruction=`Διάβασε όλες τις σελίδες του ΙΔΙΟΥ τιμολογίου στη σειρά. Σύγκρινε τις τυπωμένες γραμμές με το υπάρχον πρόχειρο POS. Απάντησε στα ελληνικά στην εντολή του διαχειριστή και πρότεινε συγκεκριμένες διορθώσεις μόνο σε υπαρκτά lineId. Για αβέβαιη ανάγνωση περιέγραψε τι χρειάζεται έλεγχο, χωρίς αριθμητική πρόταση. Μην επινοείς προϊόντα, barcodes ή γραμμές. Ποσότητα τιμολογίου και μονάδα αποθήκης είναι διαφορετικά πεδία. Για 48 πακέτα × 100 τεμάχια κράτα quantity=48, invoiceUnit=PACKAGE και stockUnitsPerInvoiceUnit=100. ΕΦΚ είναι ποσό ανά γραμμή και προστίθεται στην καθαρή φορολογητέα αξία πριν από ΦΠΑ. Μην το συγχέεις με εγγυοδοσία. Επιτρεπτά πεδία: ${[...fields].join(", ")}. Επέστρεψε σύντομο assistantMessage και corrections με lineId, field, value ως κείμενο και reason. Αυτές είναι προτάσεις· δεν εκτελείς πληρωμή, εκμάθηση, οριστικοποίηση ή απόθεμα. Τυπωμένο πληρωτέο ${Number(result.document.totalGross||0)} €. Τρέχουσες γραμμές: ${JSON.stringify(current).slice(0,45000)}. Εντολή διαχειριστή: ${message}`;
    const files=result.pages.map((page,index)=>page.mimeType==="application/pdf"?{type:"input_file",filename:page.filename||`page-${index+1}.pdf`,file_data:String(page.contentData).split(",").pop()}:{type:"input_image",image_url:page.contentData,detail:"high"});
    const response=await fetch("https://api.openai.com/v1/responses",{method:"POST",headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`,"Content-Type":"application/json"},signal:AbortSignal.timeout(90000),body:JSON.stringify({model:process.env.OPENAI_INVOICE_ASSISTANT_MODEL||process.env.OPENAI_INVOICE_MODEL||process.env.OPENAI_INVOICE_FULL_MODEL||process.env.OPENAI_INVOICE_FAST_MODEL||"gpt-5",reasoning:{effort:"minimal"},input:[{role:"user",content:[{type:"input_text",text:instruction},...files]}],text:{format:{type:"json_schema",name:"invoice_assistant_preview",strict:true,schema}}})});
    if(!response.ok)return res.status(502).json({error:`Ο βοηθός δεν απάντησε (${response.status}).`});
    const parsed=JSON.parse(responseText(await response.json()));
    const ids=new Set(current.map(row=>row.id));
    const corrections=(Array.isArray(parsed.corrections)?parsed.corrections:[]).filter(item=>ids.has(item.lineId)&&fields.has(item.field)).filter(item=>{
      if(item.field==="invoiceUnit")return ["PIECE","PACKAGE"].includes(item.value);
      if(item.field==="description")return typeof item.value==="string"&&item.value.trim().length>0&&item.value.length<=250;
      if(!numericFields.has(item.field))return false;
      const n=number(item.value);
      return Number.isFinite(n)&&n>=0&&n<=1000000&&(item.field!=="quantity"||n>0)&&(item.field!=="vatRate"||n<=100)&&(item.field!=="stockUnitsPerInvoiceUnit"||n>=1)&&(item.field!=="stockUnitsPerInvoiceUnit"||Number.isInteger(n))&&(!item.field.startsWith("discount")||n<=100);
    }).slice(0,100).map(item=>({lineId:item.lineId,field:item.field,value:String(item.value).slice(0,250),reason:String(item.reason||"").slice(0,400)}));
    res.json({assistantMessage:String(parsed.assistantMessage||"").slice(0,5000),corrections,reviewOnly:true});
  }catch(error){next(error)}
});

export default router;
