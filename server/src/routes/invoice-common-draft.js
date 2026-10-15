import {Router} from "express";
import {z} from "zod";
import {prisma} from "../prisma.js";
import {requireCompanyModule} from "../middleware/module-access.js";
import {ensureInvoiceCommonDraftSchema,previewInvoiceReconciliation,reconcileInvoiceDrafts} from "../lib/invoice-common-draft.js";

const router=Router(),roles=new Set(["OWNER","SUPER_ADMIN","ADMIN","MANAGER"]);
router.use("/documents/inbox/:inboxId/reconcile-pos",requireCompanyModule("DOCUMENTS"),requireCompanyModule("AI_READER"),requireCompanyModule("INVENTORY"),(req,res,next)=>{
 if(req.user?.tokenType==="STORE_OPERATOR"||!roles.has(req.user?.role))return res.status(403).json({error:"Η αντιστοίχιση πρωτοτύπων γίνεται από εξουσιοδοτημένο BackOffice διαχειριστή."});next();
});
const scopeFor=async(req,input)=>{
 const {storeId}=z.object({storeId:z.string().trim().min(1).max(200)}).parse(input);
 const store=await prisma.store.findFirst({where:{id:storeId,companyId:req.user.companyId},select:{id:true}});
 if(!store)throw Object.assign(new Error("Δεν βρέθηκε το επιλεγμένο κατάστημα."),{status:404});
 await ensureInvoiceCommonDraftSchema(prisma);
 return {companyId:req.user.companyId,storeId,inboxId:req.params.inboxId};
};
router.get("/documents/inbox/:inboxId/reconcile-pos",async(req,res,next)=>{try{
 const scope=await scopeFor(req,req.query);res.set("Cache-Control","no-store");res.json(await previewInvoiceReconciliation(prisma,scope));
}catch(e){next(e)}});
router.get("/documents/inbox/:inboxId/reconcile-pos/file/:attachmentId",async(req,res,next)=>{try{
 const scope=await scopeFor(req,req.query),preview=await previewInvoiceReconciliation(prisma,scope);
 if(!preview.files.some(f=>f.id===req.params.attachmentId))return res.status(404).json({error:"Το αρχείο δεν ανήκει στα πρόχειρα αυτής της αντιστοίχισης."});
 const files=await prisma.$queryRaw`SELECT "filename","mimeType","contentData" FROM "DocumentAttachment" WHERE "id"=${req.params.attachmentId} AND "companyId"=${scope.companyId} AND "storeId"=${scope.storeId} LIMIT 1`;
 if(!files[0]?.contentData||!["application/pdf","image/jpeg","image/png","image/webp"].includes(files[0].mimeType))return res.status(404).json({error:"Δεν βρέθηκε το πρωτότυπο."});res.set("Cache-Control","no-store");res.json({filename:files[0].filename,mimeType:files[0].mimeType,dataUrl:files[0].contentData});
}catch(e){next(e)}});
router.post("/documents/inbox/:inboxId/reconcile-pos",async(req,res,next)=>{try{
 const body=z.object({storeId:z.string().min(1),posOrderId:z.string().min(1),expectedVersion:z.string().length(64),confirmSameInvoice:z.literal(true),confirmMark:z.string().min(1),confirmPaymentDiscrepancy:z.boolean().default(false),verifiedSupplierId:z.string().min(1).max(200).optional(),confirmSupplierCorrection:z.boolean().optional(),confirmPaymentSupplierCorrection:z.boolean().optional(),confirmHeaderCorrection:z.boolean().optional(),selectedRowsOrderId:z.string().min(1).max(200).optional(),reason:z.string().trim().min(5).max(500)}).parse(req.body);
 const scope=await scopeFor(req,body);
 const result=await prisma.$transaction(tx=>reconcileInvoiceDrafts(tx,scope,{...body,actorId:req.user.id}),{timeout:20000});res.json(result);
}catch(e){next(e)}});
export default router;

