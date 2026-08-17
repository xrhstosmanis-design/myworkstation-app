import {Router} from "express";
import {prisma} from "../prisma.js";
import {requireCompanyModule} from "../middleware/module-access.js";
import coreRouter from "./commerce-pos-v244-core.js";

const router=Router();
const round2=value=>Math.round((Number(value||0)+Number.EPSILON)*100)/100;

router.get("/ai-reader/capability",requireCompanyModule("AI_READER"),(req,res)=>{
  res.json({enabled:true,moduleKey:"AI_READER"});
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
