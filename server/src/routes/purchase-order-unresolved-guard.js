import {Router} from "express";
import {prisma} from "../prisma.js";
import purchaseOrderTotalReconciliationGuard from "./purchase-order-total-reconciliation-guard.js";

const router=Router();
const n=value=>Number(value||0);
let schemaReady=false;

const normalizedText=value=>String(value||"")
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g,"")
  .toUpperCase()
  .replace(/\s+/g," ")
  .trim();

// Κανόνες stock σε ΤΜΧ. Η quantity του τιμολογίου παραμένει οικονομική
// ποσότητα (π.χ. κιβώτια). Μόνο το StoreProduct/StockMovement γίνεται ΤΜΧ.
function stockPackSize(description){
  const text=normalizedText(description);
  if(!text)return {size:1,rule:"Χωρίς μετατροπή"};

  // Ειδικοί κανόνες έχουν προτεραιότητα.
  if(/MONSTER|RED ?BULL/.test(text))return {size:24,rule:"Monster/Red Bull · 24 τμχ/ΚΒ"};
  if(/(ΝΕΡΟ|WATER)/.test(text)&&(/750 ?ML|0[,.]?75 ?L/.test(text)))return {size:12,rule:"Νερό 750ml · 12 τμχ/ΚΒ"};

  // Ρητή φιάλη = 20 τεμάχια, εκτός των ειδικών κανόνων παραπάνω.
  if(/ΦΙΑΛ|FIAL|BOTTLE/.test(text))return {size:20,rule:"Φιάλη · 20 τμχ/ΚΒ"};

  if(/330 ?ML|0[,.]?33 ?L/.test(text))return {size:24,rule:"330ml · 24 τμχ/ΚΒ"};
  if(/500 ?ML|0[,.]?5 ?L/.test(text))return {size:24,rule:"500ml · 24 τμχ/ΚΒ"};
  if(/1[,.]?5 ?L|1500 ?ML/.test(text))return {size:6,rule:"1,5L · 6 τμχ/ΚΒ"};

  return {size:1,rule:"Χωρίς μετατροπή"};
}

async function ensureSchema(){
  if(schemaReady)return;
  await prisma.$executeRawUnsafe(`ALTER TABLE "PurchaseOrderLine" ADD COLUMN IF NOT EXISTS "resolutionStatus" TEXT NOT NULL DEFAULT 'MATCHED'`);
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "PurchaseOrderPackCorrection" (
    "orderId" TEXT PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "correctedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "correctedByUserId" TEXT,
    "correctedByName" TEXT,
    "details" TEXT
  )`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "PurchaseOrderPackCorrection_company_idx" ON "PurchaseOrderPackCorrection" ("companyId","correctedAt" DESC)`);
  schemaReady=true;
}

async function applyPackStockCorrection({orderId,companyId,userId,userName}){
  await ensureSchema();
  return prisma.$transaction(async tx=>{
    // Το INSERT λειτουργεί σαν idempotency lock. Αν υπάρχει ήδη, δεν αγγίζουμε stock.
    const marker=await tx.$queryRaw`
      INSERT INTO "PurchaseOrderPackCorrection" ("orderId","companyId","correctedByUserId","correctedByName","details")
      VALUES (${orderId},${companyId},${userId||null},${userName||null},'PENDING')
      ON CONFLICT ("orderId") DO NOTHING
      RETURNING "orderId"`;
    if(!marker[0])return {ok:true,idempotent:true,correctedProducts:0};

    const orders=await tx.$queryRaw`
      SELECT o."id",o."storeId",o."invoiceNumber",o."status"
      FROM "PurchaseOrder" o
      WHERE o."id"=${orderId} AND o."companyId"=${companyId}
      LIMIT 1`;
    const order=orders[0];
    if(!order||order.status!=="FINAL"){
      const error=new Error("Η διόρθωση ΚΒ→ΤΜΧ επιτρέπεται μόνο σε Οριστική αγορά.");
      error.status=409;
      throw error;
    }

    const posting=await tx.$queryRaw`SELECT "orderId" FROM "PurchaseOrderPosting" WHERE "orderId"=${orderId} LIMIT 1`;
    if(!posting[0]){
      const error=new Error("Δεν βρέθηκε κίνηση αποθήκης για την Οριστική αγορά.");
      error.status=409;
      throw error;
    }

    const lines=await tx.$queryRaw`
      SELECT "productId","description","quantity","netAmount","exciseTotal"
      FROM "PurchaseOrderLine"
      WHERE "orderId"=${orderId} AND "productId" IS NOT NULL
      ORDER BY "createdAt","id"`;

    const byProduct=new Map();
    for(const row of lines){
      const productId=String(row.productId||"");
      if(!productId)continue;
      const financialQty=n(row.quantity);
      const pack=stockPackSize(row.description);
      const stockQty=financialQty*pack.size;
      const current=byProduct.get(productId)||{postedQty:0,stockQty:0,net:0,excise:0,details:[]};
      current.postedQty+=financialQty;
      current.stockQty+=stockQty;
      current.net+=n(row.netAmount);
      current.excise+=n(row.exciseTotal);
      current.details.push(`${row.description}: ${financialQty} ΚΒ × ${pack.size} = ${stockQty} ΤΜΧ (${pack.rule})`);
      byProduct.set(productId,current);
    }

    const audit=[];
    for(const [productId,agg] of byProduct){
      const delta=agg.stockQty-agg.postedQty;
      const pieceCost=agg.stockQty>0?(agg.net+agg.excise)/agg.stockQty:0;
      if(Math.abs(delta)>0.000001){
        await tx.$executeRaw`
          UPDATE "StoreProduct"
          SET "currentStock"="currentStock"+${delta},"updatedAt"=NOW()
          WHERE "storeId"=${order.storeId} AND "productId"=${productId}`;
        await tx.$executeRaw`
          INSERT INTO "StockMovement" ("id","storeId","productId","movementType","quantity","unitCost","sourceType","sourceId","note","createdByUserId")
          VALUES (${crypto.randomUUID()},${order.storeId},${productId},'PURCHASE_PACK_CORRECTION',${delta},${pieceCost},'PURCHASE_ORDER',${orderId},${`Διόρθωση ΚΒ→ΤΜΧ αγοράς ${order.invoiceNumber||orderId}: ${agg.details.join(" | ")}`},${userId||null})`;
      }
      await tx.$executeRaw`
        UPDATE "Product" SET "costPrice"=${pieceCost},"updatedAt"=NOW()
        WHERE "id"=${productId} AND "companyId"=${companyId}`;
      audit.push({productId,postedQty:agg.postedQty,stockQty:agg.stockQty,delta,pieceCost,details:agg.details});
    }

    await tx.$executeRaw`
      UPDATE "PurchaseOrderPackCorrection"
      SET "details"=${JSON.stringify(audit)},"correctedAt"=NOW(),"correctedByUserId"=${userId||null},"correctedByName"=${userName||null}
      WHERE "orderId"=${orderId}`;

    return {ok:true,idempotent:false,correctedProducts:audit.filter(row=>Math.abs(row.delta)>0.000001).length,audit};
  });
}

// Πρώτα ελέγχεται η οικονομική συμφωνία του OCR τιμολογίου. Αν υπάρχει
// διαφορά > 0,05 €, απαιτείται ρητή ευθύνη Ιδιοκτήτη/Διαχειριστή και λόγος.
router.use(purchaseOrderTotalReconciliationGuard);

router.patch("/:orderId",async(req,res,next)=>{
  try{
    if(req.body?.status!=="FINAL")return next();
    await ensureSchema();
    const rows=await prisma.$queryRaw`
      SELECT COUNT(*)::int AS "count"
      FROM "PurchaseOrderLine" l
      JOIN "PurchaseOrder" o ON o."id"=l."orderId"
      WHERE o."id"=${req.params.orderId} AND o."companyId"=${req.user.companyId}
        AND COALESCE(l."resolutionStatus",'MATCHED')='UNRESOLVED'`;
    const count=Number(rows[0]?.count||0);
    if(count>0)return res.status(409).json({error:`Υπάρχουν ${count} άλυτες γραμμές προϊόντων από το τιμολόγιο. Κάνε πρώτα αντιστοίχιση, προσθήκη barcode, συγχώνευση ή νέα εγγραφή και μετά Οριστικοποίηση.`,unresolvedLines:count});

    // Το κανονικό posting παραμένει αρμόδιο για την Οριστικοποίηση.
    // Μόλις απαντήσει επιτυχώς FINAL (και σε idempotent επανάληψη), διορθώνουμε
    // μόνο το stock από οικονομική ποσότητα ΚΒ σε πραγματικά ΤΜΧ.
    const originalJson=res.json.bind(res);
    let finished=false;
    res.json=body=>{
      if(finished)return originalJson(body);
      const successfulFinal=res.statusCode<400&&body?.status==="FINAL";
      if(!successfulFinal){finished=true;return originalJson(body)}
      finished=true;
      applyPackStockCorrection({
        orderId:req.params.orderId,
        companyId:req.user.companyId,
        userId:req.user.id,
        userName:req.user.fullName||"Χρήστης"
      }).then(correction=>originalJson({...body,packStockCorrection:correction}))
        .catch(error=>{
          console.error("Purchase pack stock correction failed",error);
          res.status(error?.status||500);
          originalJson({error:error?.message||"Απέτυχε η διόρθωση ΚΒ→ΤΜΧ. Η Οριστικοποίηση δεν πρέπει να θεωρηθεί ολοκληρωμένη μέχρι επανέλεγχο."});
        });
      return res;
    };
    next();
  }catch(error){next(error)}
});
export default router;
