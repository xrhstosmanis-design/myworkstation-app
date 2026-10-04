import crypto from "node:crypto";
import {Router} from "express";
import {z} from "zod";
import {prisma} from "../prisma.js";
import {requireStoreModule,isPlatformSuperAdmin} from "../middleware/module-access.js";

export const expenseDocumentSchema=z.object({
  documentNumber:z.string().trim().min(1).max(80),
  documentDate:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v=>!Number.isNaN(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v),
  issuer:z.string().trim().min(1).max(100),
  description:z.string().trim().min(1).max(140),
  totalNet:z.number().finite().positive().max(9999999),
  totalVat:z.number().finite().nonnegative().max(9999999),
  totalGross:z.number().finite().positive().max(9999999),
  idempotencyKey:z.string().trim().min(8).max(180)
}).strict().superRefine((b,c)=>{
  if(b.totalVat/b.totalNet*100>999.999)c.addIssue({code:"custom",message:"Ο συντελεστής ΦΠΑ υπερβαίνει το υποστηριζόμενο όριο."});
  if([b.totalNet,b.totalVat,b.totalGross].some(v=>Math.abs(v*100-Math.round(v*100))>0.000001))c.addIssue({code:"custom",message:"Τα ποσά χρειάζονται έως δύο δεκαδικά."});
  if(Math.round(b.totalNet*100)+Math.round(b.totalVat*100)!==Math.round(b.totalGross*100))c.addIssue({code:"custom",message:"Καθαρή αξία + ΦΠΑ πρέπει να ισούνται με το σύνολο."});
});
export function mayManageExpenseDocuments(user){return user?.tokenType!=="STORE_OPERATOR"&&(isPlatformSuperAdmin(user)||["OWNER","ADMIN","MANAGER"].includes(user?.role));}
export const expenseDocumentId=(companyId,storeId,key)=>`expense_${crypto.createHash("sha256").update(JSON.stringify([companyId,storeId,key])).digest("hex")}`;
const router=Router();
router.use("/stores/:storeId/expense-documents",(req,res,next)=>mayManageExpenseDocuments(req.user)?next():res.status(403).json({error:"Απαιτείται πρόσβαση Ιδιοκτήτη / Διαχειριστή."}),requireStoreModule("CASH_CONTROL"),(req,res,next)=>{
  if(req.targetStore.id!==req.params.storeId||(req.query.storeId&&req.query.storeId!==req.params.storeId)||(req.body?.storeId&&req.body.storeId!==req.params.storeId))return res.status(400).json({error:"Το κατάστημα των κριτηρίων δεν συμφωνεί με τη διαδρομή."});
  return mayManageExpenseDocuments(req.user)?next():res.status(403).json({error:"Απαιτείται πρόσβαση Ιδιοκτήτη / Διαχειριστή."});
});
const fail=(message,status=409)=>Object.assign(new Error(message),{status});
async function audit(tx,req,eventType,doc){
  await tx.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "StoreOperatorAudit" ("id" TEXT PRIMARY KEY,"companyId" TEXT NOT NULL,"storeId" TEXT NOT NULL,"operatorId" TEXT,"actorId" TEXT NOT NULL,"eventType" TEXT NOT NULL,"details" JSONB NOT NULL DEFAULT '{}'::jsonb,"createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
  await tx.$executeRaw`INSERT INTO "StoreOperatorAudit" ("id","companyId","storeId","actorId","eventType","details") VALUES (${crypto.randomUUID()},${req.targetStore.companyId},${req.targetStore.id},${req.user.id},${eventType},${JSON.stringify({documentId:doc.id,documentNumber:doc.documentNumber,totalNet:Number(doc.totalNet),totalVat:Number(doc.totalVat),totalGross:Number(doc.totalGross),stockUpdated:false})}::jsonb)`;
}
router.get("/stores/:storeId/expense-documents",async(req,res,next)=>{
  try{res.json(await prisma.$queryRaw`SELECT d."id",d."documentNumber",d."documentDate",d."totalNet",d."totalVat",d."totalGross",d."status",l."description" FROM "PurchaseDocument" d JOIN "PurchaseDocumentLine" l ON l."purchaseDocumentId"=d."id" WHERE d."companyId"=${req.targetStore.companyId} AND d."storeId"=${req.targetStore.id} AND d."sourceType"='MANUAL_EXPENSE' ORDER BY d."createdAt" DESC LIMIT 100`)}catch(e){next(e)}
});
router.post("/stores/:storeId/expense-documents",async(req,res,next)=>{
  try{
    const b=expenseDocumentSchema.parse(req.body),{companyId,id:storeId}=req.targetStore;
    const docId=expenseDocumentId(companyId,storeId,b.idempotencyKey),description=`${b.issuer} · ${b.description}`;
    const result=await prisma.$transaction(async tx=>{
      const lockKey=`${companyId}:${storeId}:expense-documents`;
      await tx.$queryRaw`SELECT (pg_advisory_xact_lock(hashtext(${lockKey})) IS NULL) AS locked`;
      const existing=await tx.$queryRaw`SELECT d.*,l."description" FROM "PurchaseDocument" d JOIN "PurchaseDocumentLine" l ON l."purchaseDocumentId"=d."id" WHERE d."id"=${docId} AND d."companyId"=${companyId} AND d."storeId"=${storeId}`;
      if(existing[0]){
        const d=existing[0];
        if(d.sourceType!=="MANUAL_EXPENSE"||d.documentNumber!==b.documentNumber||new Date(d.documentDate).toISOString().slice(0,10)!==b.documentDate||d.description!==description||Number(d.totalNet)!==b.totalNet||Number(d.totalVat)!==b.totalVat||Number(d.totalGross)!==b.totalGross)throw fail("Το αναγνωριστικό χρησιμοποιήθηκε με διαφορετικά στοιχεία.");
        return {...d,replayed:true};
      }
      const duplicate=await tx.$queryRaw`SELECT d."id" FROM "PurchaseDocument" d WHERE d."companyId"=${companyId} AND d."storeId"=${storeId} AND d."sourceType"='MANUAL_EXPENSE' AND LOWER(TRIM(d."documentNumber"))=LOWER(TRIM(${b.documentNumber})) LIMIT 1`;
      if(duplicate[0])throw fail("Υπάρχει ήδη αυτό το παραστατικό εξόδου. Άνοιξέ το από τη λίστα.");
      await tx.$executeRaw`INSERT INTO "PurchaseDocument" ("id","companyId","storeId","documentType","documentNumber","documentDate","totalNet","totalVat","totalGross","sourceType","status","createdByUserId") VALUES (${docId},${companyId},${storeId},'INVOICE',${b.documentNumber},${new Date(b.documentDate+"T00:00:00Z")},${b.totalNet},${b.totalVat},${b.totalGross},'MANUAL_EXPENSE','DRAFT',${req.user.id})`;
      await tx.$executeRaw`INSERT INTO "PurchaseDocumentLine" ("id","purchaseDocumentId","productId","description","quantity","unit","unitCost","netAmount","vatRate","vatAmount","grossAmount") VALUES (${docId+"_line"},${docId},NULL,${description},1,'SERVICE',${b.totalNet},${b.totalNet},${b.totalVat/b.totalNet*100},${b.totalVat},${b.totalGross})`;
      const doc={id:docId,...b,status:"DRAFT",description};await audit(tx,req,"EXPENSE_DOCUMENT_DRAFT_CREATED",doc);return doc;
    });res.status(result.replayed?200:201).json(result);
  }catch(e){next(e)}
});
router.post("/stores/:storeId/expense-documents/:documentId/approve",async(req,res,next)=>{
  try{
    const result=await prisma.$transaction(async tx=>{
      const docs=await tx.$queryRaw`SELECT * FROM "PurchaseDocument" WHERE "id"=${req.params.documentId} AND "companyId"=${req.targetStore.companyId} AND "storeId"=${req.targetStore.id} AND "sourceType"='MANUAL_EXPENSE' FOR UPDATE`;
      const d=docs[0];if(!d)throw fail("Δεν βρέθηκε παραστατικό εξόδου.",404);
      if(d.status==="APPROVED")return {...d,replayed:true};if(d.status!=="DRAFT")throw fail("Το παραστατικό δεν είναι πρόχειρο.");
      const lines=await tx.$queryRaw`SELECT * FROM "PurchaseDocumentLine" WHERE "purchaseDocumentId"=${d.id}`;
      if(lines.length!==1||lines[0].productId||lines[0].unit!=="SERVICE"||Number(lines[0].netAmount)!==Number(d.totalNet)||Number(lines[0].vatAmount)!==Number(d.totalVat)||Number(lines[0].grossAmount)!==Number(d.totalGross)||Math.round(Number(d.totalNet)*100)+Math.round(Number(d.totalVat)*100)!==Math.round(Number(d.totalGross)*100))throw fail("Τα στοιχεία εξόδου δεν συμφωνούν. Δεν έγινε έγκριση.");
      await tx.$executeRaw`UPDATE "PurchaseDocument" SET "status"='APPROVED',"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${d.id}`;
      await audit(tx,req,"EXPENSE_DOCUMENT_APPROVED",d);return {...d,status:"APPROVED"};
    });res.json({...result,stockUpdated:false});
  }catch(e){next(e)}
});
export default router;
