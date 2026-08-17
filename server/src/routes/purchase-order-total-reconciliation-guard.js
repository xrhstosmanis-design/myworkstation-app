import crypto from "crypto";
import {Router} from "express";
import {prisma} from "../prisma.js";

const router=Router();
const TOLERANCE=0.05;
const overrideRoles=new Set(["SUPER_ADMIN","OWNER","ADMIN","MANAGER"]);
const id=()=>crypto.randomUUID();
const money=value=>Math.round((Number(value||0)+Number.EPSILON)*100)/100;

let schemaPromise;
async function ensureSchema(){
  if(!schemaPromise){
    schemaPromise=(async()=>{
      await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "PurchaseOrderTotalOverrideAudit" (
        "id" TEXT PRIMARY KEY,
        "companyId" TEXT NOT NULL,
        "orderId" TEXT NOT NULL,
        "purchaseDocumentId" TEXT,
        "invoiceNumber" TEXT,
        "actorUserId" TEXT,
        "actorName" TEXT NOT NULL,
        "actorRole" TEXT,
        "invoiceTotal" DECIMAL(18,6) NOT NULL,
        "linesTotal" DECIMAL(18,6) NOT NULL,
        "difference" DECIMAL(18,6) NOT NULL,
        "tolerance" DECIMAL(18,6) NOT NULL DEFAULT 0.05,
        "reason" TEXT NOT NULL,
        "responsibility" TEXT NOT NULL DEFAULT 'OWNER_MANAGER',
        "outcome" TEXT NOT NULL DEFAULT 'PENDING',
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "completedAt" TIMESTAMPTZ
      )`);
      await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "PurchaseOrderTotalOverrideAudit_order_idx" ON "PurchaseOrderTotalOverrideAudit" ("companyId","orderId","createdAt" DESC)`);
    })().catch(error=>{schemaPromise=undefined;throw error});
  }
  return schemaPromise;
}

router.use(async(req,res,next)=>{try{await ensureSchema();next()}catch(error){next(error)}});

router.patch("/:orderId",async(req,res,next)=>{
  try{
    if(req.body?.status!=="FINAL")return next();
    const companyId=req.user?.companyId;
    if(!companyId)return next();

    const rows=await prisma.$queryRaw`
      SELECT o."id",o."invoiceNumber",o."sourceType",o."sourceDocumentId",
             d."totalGross" AS "invoiceTotal"
      FROM "PurchaseOrder" o
      LEFT JOIN "PurchaseDocument" d
        ON d."id"=o."sourceDocumentId" AND d."companyId"=o."companyId"
      WHERE o."id"=${req.params.orderId} AND o."companyId"=${companyId}
      LIMIT 1`;
    const order=rows[0];
    if(!order)return next();

    // Reconciliation is mandatory for invoices created from the POS OCR/V2.4.4 flow.
    if(order.sourceType!=="POS_OCR_DRAFT"||!order.sourceDocumentId||Number(order.invoiceTotal||0)<=0)return next();

    const totals=await prisma.$queryRaw`
      SELECT COALESCE(SUM("grossAmount"),0) AS "linesTotal"
      FROM "PurchaseOrderLine"
      WHERE "orderId"=${order.id}`;
    const invoiceTotal=money(order.invoiceTotal);
    const linesTotal=money(totals[0]?.linesTotal||0);
    const difference=money(linesTotal-invoiceTotal);
    const absDifference=Math.abs(difference);
    if(absDifference<=TOLERANCE+0.000001)return next();

    const overrideRequested=req.body?.totalMismatchOverride===true;
    const overrideAllowed=req.user?.tokenType!=="STORE_OPERATOR"&&overrideRoles.has(req.user?.role);
    const reason=String(req.body?.totalMismatchReason||"").trim();
    const details={
      code:"INVOICE_TOTAL_MISMATCH",
      invoiceTotal,
      linesTotal,
      difference,
      absoluteDifference:absDifference,
      tolerance:TOLERANCE,
      overrideAllowed,
      requiresReason:true,
      responsibility:"OWNER_MANAGER"
    };

    if(!overrideRequested){
      return res.status(409).json({
        error:`Το σύνολο των γραμμών (${linesTotal.toFixed(2)} €) διαφέρει από το σύνολο τιμολογίου (${invoiceTotal.toFixed(2)} €) κατά ${absDifference.toFixed(2)} €. Η ανοχή είναι 0,05 €.`,
        ...details
      });
    }
    if(!overrideAllowed){
      return res.status(403).json({
        error:"Η καταχώριση με διαφορά επιτρέπεται μόνο με ευθύνη Ιδιοκτήτη ή Διαχειριστή.",
        ...details,
        overrideAllowed:false
      });
    }
    if(reason.length<5){
      return res.status(400).json({
        error:"Γράψε υποχρεωτικά τον λόγο για τον οποίο εγκρίνεται η καταχώριση με διαφορά.",
        ...details
      });
    }

    const auditId=id();
    const actorName=req.user?.fullName||req.user?.name||"Ιδιοκτήτης/Διαχειριστής";
    await prisma.$executeRaw`
      INSERT INTO "PurchaseOrderTotalOverrideAudit"
        ("id","companyId","orderId","purchaseDocumentId","invoiceNumber","actorUserId","actorName","actorRole","invoiceTotal","linesTotal","difference","tolerance","reason","responsibility","outcome")
      VALUES
        (${auditId},${companyId},${order.id},${order.sourceDocumentId},${order.invoiceNumber||null},${req.user?.id||null},${actorName},${req.user?.role||null},${invoiceTotal},${linesTotal},${difference},${TOLERANCE},${reason},'OWNER_MANAGER','PENDING')`;

    res.on("finish",()=>{
      const outcome=res.statusCode>=200&&res.statusCode<300?"FINALIZED":"NOT_FINALIZED";
      prisma.$executeRaw`
        UPDATE "PurchaseOrderTotalOverrideAudit"
        SET "outcome"=${outcome},"completedAt"=NOW()
        WHERE "id"=${auditId} AND "companyId"=${companyId}`.catch(()=>{});
    });

    req.totalMismatchOverride={auditId,invoiceTotal,linesTotal,difference,reason,actorName,actorRole:req.user?.role||null};
    next();
  }catch(error){next(error)}
});

export default router;
