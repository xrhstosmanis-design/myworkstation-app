import {Router} from "express";
import {prisma} from "../prisma.js";
import coreRouter from "./commerce-pos-v244-core.js";

const router=Router();
const round2=value=>Math.round((Number(value||0)+Number.EPSILON)*100)/100;

router.post("/ai-reader/jobs/:jobId/pos-intake",async(req,res,next)=>{
  try{
    const requestedTotal=Number(req.body?.totalGross||0);
    if(!(requestedTotal>0))return res.status(409).json({error:"Δεν υπάρχει έγκυρο συνολικό ποσό τιμολογίου. Η V2.4.4 σταμάτησε την καταχώριση για έλεγχο."});
    const jobs=await prisma.$queryRaw`SELECT "resultJson" FROM "AiReaderJob" WHERE "id"=${req.params.jobId} AND "companyId"=${req.user.companyId} LIMIT 1`;
    const result=jobs[0]?.resultJson&&typeof jobs[0].resultJson==="object"?jobs[0].resultJson:{};
    const lines=Array.isArray(result.productLines)?result.productLines:[];
    if(!lines.length)return res.status(409).json({error:"Δεν υπάρχουν ασφαλείς structured γραμμές V2.4.4. Η καταχώριση μπλοκαρίστηκε."});
    const structuredGross=round2(lines.reduce((sum,line)=>sum+Number(line?.grossAmount||0),0));
    const structuredNet=round2(lines.reduce((sum,line)=>sum+Number(line?.netAmount||0),0));
    if(!(structuredGross>0))return res.status(409).json({error:"Οι γραμμές V2.4.4 δεν έχουν έγκυρα σύνολα. Απαιτείται επανέλεγχος του τιμολογίου."});
    const diff=round2(Math.abs(structuredGross-requestedTotal));
    if(diff>0.05)return res.status(409).json({error:`ΜΠΛΟΚΑΡΙΣΤΗΚΕ: το σύνολο των γραμμών (${structuredGross.toFixed(2)} €) δεν συμφωνεί με το σύνολο τιμολογίου (${requestedTotal.toFixed(2)} €). Διαφορά ${diff.toFixed(2)} €. Κάνε επανέλεγχο πριν από την καταχώριση.`,code:"V244_TOTAL_MISMATCH",structuredGross,structuredNet,invoiceGross:round2(requestedTotal),difference:diff});
    next();
  }catch(error){next(error)}
});

router.post("/purchase-documents/:documentId/link-fast-payment",async(req,res,next)=>{
  try{
    const transactionId=String(req.body?.transactionId||"").trim();
    if(!transactionId)return res.status(400).json({error:"Λείπει η συναλλαγή της άμεσης πληρωμής."});
    const docs=await prisma.$queryRaw`
      SELECT "id","storeId","supplierId","totalGross","settlementMode","paymentTransactionId"
      FROM "PurchaseDocument"
      WHERE "id"=${req.params.documentId} AND "companyId"=${req.user.companyId} LIMIT 1`;
    const doc=docs[0];
    if(!doc)return res.status(404).json({error:"Δεν βρέθηκε το τιμολόγιο για σύνδεση πληρωμής."});
    if(doc.paymentTransactionId&&doc.paymentTransactionId!==transactionId)return res.status(409).json({error:"Το τιμολόγιο είναι ήδη συνδεδεμένο με άλλη πληρωμή."});
    const rows=await prisma.$queryRaw`
      SELECT "id","storeId","supplierId","type","amount","subtractFromShift","reversedAt"
      FROM "StoreTransaction"
      WHERE "id"=${transactionId} AND "companyId"=${req.user.companyId} LIMIT 1`;
    const payment=rows[0];
    if(!payment)return res.status(404).json({error:"Δεν βρέθηκε η άμεση πληρωμή της βάρδιας."});
    const valid=payment.type==='SUPPLIER_PAYMENT'&&!payment.reversedAt&&payment.subtractFromShift&&payment.storeId===doc.storeId&&payment.supplierId===doc.supplierId&&Math.abs(Number(payment.amount||0)-Number(doc.totalGross||0))<=0.05;
    if(!valid)return res.status(409).json({error:"Η πληρωμή δεν συμφωνεί με κατάστημα, προμηθευτή ή ποσό του τιμολογίου."});
    await prisma.$transaction(async tx=>{
      await tx.$executeRaw`UPDATE "PurchaseDocument" SET "settlementMode"='PAID',"paymentTransactionId"=${transactionId},"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${doc.id} AND "companyId"=${req.user.companyId}`;
      await tx.$executeRaw`UPDATE "StoreTransaction" SET "attachmentMimeType"='application/vnd.myworkstation.purchase-document',"attachmentFilename"=${doc.id} WHERE "id"=${transactionId} AND "companyId"=${req.user.companyId}`;
    });
    res.json({ok:true,documentId:doc.id,transactionId,settlementMode:"PAID",duplicatePaymentCreated:false});
  }catch(error){next(error)}
});

router.use(coreRouter);
export default router;
