import {Router} from "express";
import {prisma} from "../prisma.js";
import {requireCompanyModule} from "../middleware/module-access.js";
import coreRouter from "./commerce-pos-v244-core.js";

const router=Router();
const round2=value=>Math.round((Number(value||0)+Number.EPSILON)*100)/100;
const normalizeDocumentNumber=value=>String(value||"").trim().toLocaleUpperCase("el-GR").replace(/\s+/g,"");

router.get("/ai-reader/capability",requireCompanyModule("AI_READER"),(req,res)=>{
  res.json({enabled:true,moduleKey:"AI_READER"});
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

router.use(coreRouter);
export default router;
