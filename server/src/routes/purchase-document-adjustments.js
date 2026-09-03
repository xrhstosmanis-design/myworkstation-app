import crypto from "crypto";
import {Router} from "express";
import {z} from "zod";
import {prisma} from "../prisma.js";

const router=Router();
const id=()=>crypto.randomUUID();
const roles=new Set(["SUPER_ADMIN","OWNER","ADMIN","MANAGER"]);
const n=value=>Number(value||0);
let schemaPromise;
async function ensureSchema(){
  if(!schemaPromise)schemaPromise=(async()=>{
    await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "PurchaseDocumentAdjustment" (
      "id" TEXT PRIMARY KEY,"companyId" TEXT NOT NULL,"storeId" TEXT NOT NULL,
      "supplierId" TEXT,"purchaseDocumentId" TEXT NOT NULL,"adjustmentType" TEXT NOT NULL,
      "documentNumber" TEXT,"documentDate" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "amountNet" DECIMAL(14,4) NOT NULL DEFAULT 0,"amountVat" DECIMAL(14,4) NOT NULL DEFAULT 0,
      "amountGross" DECIMAL(14,4) NOT NULL DEFAULT 0,"status" TEXT NOT NULL DEFAULT 'DRAFT',
      "linesJson" JSONB NOT NULL DEFAULT '[]'::jsonb,"matchedAmountGross" DECIMAL(14,4) NOT NULL DEFAULT 0,
      "createdByUserId" TEXT,"approvedByUserId" TEXT,"approvedAt" TIMESTAMPTZ,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),"updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE("companyId","documentNumber")
    )`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "PurchaseDocumentAdjustment_doc_idx" ON "PurchaseDocumentAdjustment" ("companyId","purchaseDocumentId","createdAt" DESC)`);
  })().catch(error=>{schemaPromise=undefined;throw error});
  return schemaPromise;
}
router.use(async(req,res,next)=>{try{if(!roles.has(req.user?.role)||req.user?.tokenType==="STORE_OPERATOR")return res.status(403).json({error:"Απαιτείται δικαίωμα διαχειριστή."});await ensureSchema();next()}catch(error){next(error)}});

const lineSchema=z.object({productId:z.string().optional().nullable(),description:z.string().trim().min(1).max(250),quantity:z.coerce.number().positive(),unit:z.string().trim().max(30).default("PIECE"),unitCost:z.coerce.number().min(0),vatRate:z.coerce.number().min(0).max(100)});

router.post("/",async(req,res,next)=>{try{
  const body=z.object({storeId:z.string(),purchaseDocumentId:z.string(),adjustmentType:z.enum(["DELIVERY_NOTE","SUPPLIER_RETURN","CREDIT_PARTIAL","CREDIT_FULL"]),documentNumber:z.string().trim().min(1).max(80),documentDate:z.coerce.date().optional(),amountNet:z.coerce.number().min(0),amountVat:z.coerce.number().min(0),amountGross:z.coerce.number().min(0),lines:z.array(lineSchema).min(1).max(500)}).parse(req.body||{});
  const docs=await prisma.$queryRaw`SELECT d."id",d."companyId",d."storeId",d."supplierId",d."status",d."totalGross" FROM "PurchaseDocument" d WHERE d."id"=${body.purchaseDocumentId} AND d."companyId"=${req.user.companyId} LIMIT 1`;
  const doc=docs[0];if(!doc||doc.status!=="APPROVED")return res.status(409).json({error:"Η βάση πρέπει να είναι εγκεκριμένο τιμολόγιο."});
  if(String(doc.storeId)!==String(body.storeId))return res.status(400).json({error:"Το κατάστημα δεν συμφωνεί με το αρχικό τιμολόγιο."});
  const duplicate=await prisma.$queryRaw`SELECT "id","status" FROM "PurchaseDocumentAdjustment" WHERE "companyId"=${req.user.companyId} AND "documentNumber"=${body.documentNumber} LIMIT 1`;if(duplicate[0])return res.status(409).json({error:"Το παραστατικό έχει ήδη καταχωριστεί.",adjustment:duplicate[0]});
  if(body.adjustmentType==="CREDIT_FULL"&&Math.abs(body.amountGross-n(doc.totalGross))>0.05)return res.status(400).json({error:"Το πλήρες πιστωτικό πρέπει να συμφωνεί με το αρχικό σύνολο (ανοχή 0,05 €)."});
  const adjustmentId=id();await prisma.$executeRaw`INSERT INTO "PurchaseDocumentAdjustment" ("id","companyId","storeId","supplierId","purchaseDocumentId","adjustmentType","documentNumber","documentDate","amountNet","amountVat","amountGross","linesJson","createdByUserId") VALUES (${adjustmentId},${req.user.companyId},${body.storeId},${doc.supplierId},${doc.id},${body.adjustmentType},${body.documentNumber},${body.documentDate||new Date()},${body.amountNet},${body.amountVat},${body.amountGross},${JSON.stringify(body.lines)}::jsonb,${req.user.id})`;
  res.status(201).json({ok:true,id:adjustmentId,status:"DRAFT",matchedPurchaseDocumentId:doc.id});
}catch(error){next(error)}});

router.get("/",async(req,res,next)=>{try{const rows=await prisma.$queryRaw`SELECT a.*,d."documentNumber" AS "baseDocumentNumber",s."name" AS "supplierName" FROM "PurchaseDocumentAdjustment" a JOIN "PurchaseDocument" d ON d."id"=a."purchaseDocumentId" LEFT JOIN "Supplier" s ON s."id"=a."supplierId" WHERE a."companyId"=${req.user.companyId} ORDER BY a."createdAt" DESC LIMIT 300`;res.json(rows)}catch(error){next(error)}});

router.post("/:adjustmentId/approve",async(req,res,next)=>{try{
  const result=await prisma.$transaction(async tx=>{
    const rows=await tx.$queryRaw`SELECT * FROM "PurchaseDocumentAdjustment" WHERE "id"=${req.params.adjustmentId} AND "companyId"=${req.user.companyId} FOR UPDATE`;const a=rows[0];if(!a)return Object.assign(new Error("Δεν βρέθηκε το παραστατικό προσαρμογής."),{status:404});if(a.status==="APPROVED")return {ok:true,idempotent:true,status:a.status};
    const base=await tx.$queryRaw`SELECT "id","storeId","totalGross" FROM "PurchaseDocument" WHERE "id"=${a.purchaseDocumentId} AND "companyId"=${req.user.companyId} AND "status"='APPROVED' LIMIT 1`;if(!base[0])return Object.assign(new Error("Δεν βρέθηκε εγκεκριμένο αρχικό τιμολόγιο."),{status:409});
    const lines=Array.isArray(a.linesJson)?a.linesJson:[];const sign=a.adjustmentType==="DELIVERY_NOTE"?1:-1;for(const line of lines){if(!line.productId)continue;const qty=n(line.quantity)*sign;await tx.$executeRaw`INSERT INTO "StoreProduct" ("id","storeId","productId","salePrice","currentStock") VALUES (${id()},${a.storeId},${line.productId},NULL,${qty}) ON CONFLICT ("storeId","productId") DO UPDATE SET "currentStock"="StoreProduct"."currentStock"+EXCLUDED."currentStock","updatedAt"=NOW()`;await tx.$executeRaw`INSERT INTO "StockMovement" ("id","storeId","productId","movementType","quantity","unitCost","sourceType","sourceId","note","createdByUserId","idempotencyKey") VALUES (${id()},${a.storeId},${line.productId},${a.adjustmentType==='DELIVERY_NOTE'?'PURCHASE_RECEIPT':'PURCHASE_RETURN'},${qty},${n(line.unitCost)},'PURCHASE_ADJUSTMENT',${a.id},${a.documentNumber},${req.user.id},${`purchase-adjustment:${a.id}:${line.productId}`}) ON CONFLICT ("storeId","idempotencyKey") DO NOTHING`}
    await tx.$executeRaw`UPDATE "PurchaseDocumentAdjustment" SET "status"='APPROVED',"matchedAmountGross"="amountGross","approvedByUserId"=${req.user.id},"approvedAt"=NOW(),"updatedAt"=NOW() WHERE "id"=${a.id}`;return {ok:true,id:a.id,status:"APPROVED",matchedPurchaseDocumentId:base[0].id,stockMovementSign:sign};
  });res.json(result);
}catch(error){if(error?.status)return res.status(error.status).json({error:error.message});next(error)}});

export default router;
