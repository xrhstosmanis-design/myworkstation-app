import crypto from "crypto";
import {Router} from "express";
import {prisma} from "../prisma.js";

const router=Router();
const roles=new Set(["SUPER_ADMIN","OWNER","ADMIN","MANAGER"]);
const id=()=>crypto.randomUUID();
const n=value=>Number(value||0);
const normalizeDocumentNumber=value=>String(value||"").trim().toLocaleUpperCase("el-GR").replace(/\s+/g,"");

let schemaPromise;
async function ensureSchema(){
  if(!schemaPromise){
    schemaPromise=(async()=>{
      await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "PurchaseOrderPosting" (
        "orderId" TEXT PRIMARY KEY,
        "companyId" TEXT NOT NULL,
        "supplierId" TEXT,
        "documentFingerprint" TEXT,
        "purchaseDocumentId" TEXT,
        "postedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "postedByUserId" TEXT,
        "postedByName" TEXT,
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`);
      await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "PurchaseOrderPosting_company_idx" ON "PurchaseOrderPosting" ("companyId","postedAt" DESC)`);
      await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "PurchaseOrderPosting_fingerprint_key" ON "PurchaseOrderPosting" ("companyId","documentFingerprint") WHERE "documentFingerprint" IS NOT NULL`);
      await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "SupplierProductLink" (
        "id" TEXT PRIMARY KEY,"companyId" TEXT NOT NULL,"supplierId" TEXT NOT NULL,"productId" TEXT NOT NULL,
        "supplierCode" TEXT,"active" BOOLEAN NOT NULL DEFAULT true,"source" TEXT NOT NULL DEFAULT 'MANUAL',
        "updatedBy" TEXT,"updatedByName" TEXT,"createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),"updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE("companyId","supplierId","productId"))`);
    })().catch(error=>{schemaPromise=undefined;throw error});
  }
  return schemaPromise;
}

function fingerprint(companyId,supplierId,documentNumber){
  const normalized=normalizeDocumentNumber(documentNumber);
  if(!supplierId||!normalized)return null;
  return crypto.createHash("sha256").update(`${companyId}|${supplierId}|${normalized}`).digest("hex");
}

async function duplicateDetails(tx,{companyId,supplierId,documentNumber,orderId}){
  const normalized=normalizeDocumentNumber(documentNumber);
  if(!supplierId||!normalized)return null;
  const orderRows=await tx.$queryRaw`
    SELECT o."id",o."invoiceNumber",o."status",o."createdAt",s."name" AS "supplierName",st."name" AS "storeName"
    FROM "PurchaseOrder" o
    LEFT JOIN "Supplier" s ON s."id"=o."supplierId"
    LEFT JOIN "Store" st ON st."id"=o."storeId"
    WHERE o."companyId"=${companyId} AND o."supplierId"=${supplierId} AND o."id"<>${orderId}
      AND o."status" IN ('FINAL','INVOICED')
      AND UPPER(REGEXP_REPLACE(TRIM(COALESCE(o."invoiceNumber",'')),'\\s+','','g'))=${normalized}
    ORDER BY o."updatedAt" DESC LIMIT 1`;
  if(orderRows[0])return {source:"PURCHASE_ORDER",...orderRows[0]};

  const docRows=await tx.$queryRaw`
    SELECT d."id",d."documentNumber" AS "invoiceNumber",d."status",d."documentDate" AS "createdAt",s."name" AS "supplierName",st."name" AS "storeName"
    FROM "PurchaseDocument" d
    LEFT JOIN "Supplier" s ON s."id"=d."supplierId"
    LEFT JOIN "Store" st ON st."id"=d."storeId"
    WHERE d."companyId"=${companyId} AND d."supplierId"=${supplierId} AND d."id"<>${orderId}
      AND d."status"='APPROVED'
      AND UPPER(REGEXP_REPLACE(TRIM(COALESCE(d."documentNumber",'')),'\\s+','','g'))=${normalized}
    ORDER BY d."documentDate" DESC LIMIT 1`;
  if(docRows[0])return {source:"PURCHASE_DOCUMENT",...docRows[0]};
  return null;
}

router.use(async(req,res,next)=>{try{await ensureSchema();next()}catch(error){next(error)}});

router.patch("/:orderId",async(req,res,next)=>{
  try{
    const requestedStatus=req.body?.status;
    if(requestedStatus!=="FINAL"&&requestedStatus!=="INVOICED")return next();
    if(req.user?.tokenType==="STORE_OPERATOR"||!roles.has(req.user?.role))return res.status(403).json({error:"Δεν έχεις δικαίωμα οριστικοποίησης αγορών."});

    const companyId=req.user.companyId;
    const actor=req.user.fullName||"Χρήστης";
    const result=await prisma.$transaction(async tx=>{
      const rows=await tx.$queryRaw`
        SELECT o.* FROM "PurchaseOrder" o
        WHERE o."id"=${req.params.orderId} AND o."companyId"=${companyId}
        FOR UPDATE`;
      const found=rows[0];
      if(!found){const error=new Error("Δεν βρέθηκε η παραγγελία.");error.status=404;throw error}
      if(found.status==="INVOICED")return {ok:true,idempotent:true,status:"INVOICED"};
      if(requestedStatus==="INVOICED"&&found.status!=="FINAL"){
        const error=new Error("Η παραγγελία πρέπει πρώτα να οριστικοποιηθεί.");error.status=409;throw error;
      }

      const effectiveSupplierId=req.body?.supplierId??found.supplierId??null;
      const effectiveInvoiceNumber=req.body?.invoiceNumber??found.invoiceNumber??null;
      const effectiveDescription=req.body?.description??found.description??null;
      if(effectiveSupplierId){
        const supplier=await tx.$queryRaw`SELECT "id" FROM "Supplier" WHERE "id"=${String(effectiveSupplierId)} AND "companyId"=${companyId} AND "active"=true LIMIT 1`;
        if(!supplier[0]){const error=new Error("Δεν βρέθηκε ο προμηθευτής.");error.status=404;throw error}
      }

      const duplicate=await duplicateDetails(tx,{companyId,supplierId:effectiveSupplierId,documentNumber:effectiveInvoiceNumber,orderId:found.id});
      if(duplicate){
        const error=new Error(`Το παραστατικό ${effectiveInvoiceNumber} έχει ήδη καταχωρηθεί${duplicate.storeName?` στο ${duplicate.storeName}`:""}. Δεν έγινε δεύτερη καταχώρηση.`);
        error.status=409;
        error.duplicate=duplicate;
        throw error;
      }

      const fp=fingerprint(companyId,effectiveSupplierId,effectiveInvoiceNumber);
      const postingRows=await tx.$queryRaw`SELECT * FROM "PurchaseOrderPosting" WHERE "orderId"=${found.id} LIMIT 1`;
      const existingPosting=postingRows[0]||null;

      if(requestedStatus==="FINAL"&&found.status==="FINAL"&&existingPosting){
        return {ok:true,idempotent:true,status:"FINAL",purchaseDocumentId:existingPosting.purchaseDocumentId};
      }

      if(requestedStatus==="FINAL"&&!existingPosting){
        const lines=await tx.$queryRaw`
          SELECT l.* FROM "PurchaseOrderLine" l
          WHERE l."orderId"=${found.id}
          ORDER BY l."createdAt",l."id"`;
        if(!lines.length){const error=new Error("Δεν μπορεί να οριστικοποιηθεί αγορά χωρίς είδη.");error.status=409;throw error}

        const totalNet=lines.reduce((sum,row)=>sum+n(row.netAmount),0);
        const totalVat=lines.reduce((sum,row)=>sum+n(row.vatAmount),0);
        const totalGross=lines.reduce((sum,row)=>sum+n(row.grossAmount),0);
        const purchaseDocumentId=found.id;

        await tx.$executeRaw`
          INSERT INTO "PurchaseDocument" ("id","companyId","storeId","supplierId","documentType","documentNumber","documentDate","totalNet","totalVat","totalGross","sourceType","status","createdByUserId")
          VALUES (${purchaseDocumentId},${companyId},${found.storeId},${effectiveSupplierId},'INVOICE',${effectiveInvoiceNumber},NOW(),${totalNet},${totalVat},${totalGross},'PURCHASE_ORDER','APPROVED',${req.user.id})`;

        for(const row of lines){
          await tx.$executeRaw`
            INSERT INTO "PurchaseDocumentLine" ("id","purchaseDocumentId","productId","description","quantity","unit","unitCost","netAmount","vatRate","vatAmount","grossAmount")
            VALUES (${id()},${purchaseDocumentId},${row.productId},${row.description},${n(row.quantity)},'PIECE',${n(row.unitCost)},${n(row.netAmount)},${n(row.vatRate)},${n(row.vatAmount)},${n(row.grossAmount)})`;
        }

        const stockByProduct=new Map();
        for(const row of lines){
          if(!row.productId)continue;
          const current=stockByProduct.get(row.productId)||{quantity:0,net:0,excise:0,supplierCode:null,proposedSalePrice:0};
          current.quantity+=n(row.quantity);
          current.net+=n(row.netAmount);
          current.excise+=n(row.exciseTotal);
          if(row.supplierCode)current.supplierCode=row.supplierCode;
          if(n(row.proposedSalePrice)>0)current.proposedSalePrice=n(row.proposedSalePrice);
          stockByProduct.set(row.productId,current);
        }

        for(const [productId,agg] of stockByProduct){
          const landedUnitCost=agg.quantity>0?(agg.net+agg.excise)/agg.quantity:0;
          await tx.$executeRaw`
            INSERT INTO "StoreProduct" ("id","storeId","productId","salePrice","currentStock")
            VALUES (${id()},${found.storeId},${productId},${agg.proposedSalePrice>0?agg.proposedSalePrice:null},${agg.quantity})
            ON CONFLICT ("storeId","productId") DO UPDATE SET
              "currentStock"="StoreProduct"."currentStock"+EXCLUDED."currentStock",
              "salePrice"=COALESCE(EXCLUDED."salePrice","StoreProduct"."salePrice"),
              "updatedAt"=NOW()`;
          await tx.$executeRaw`
            INSERT INTO "StockMovement" ("id","storeId","productId","movementType","quantity","unitCost","sourceType","sourceId","note","createdByUserId")
            VALUES (${id()},${found.storeId},${productId},'PURCHASE',${agg.quantity},${landedUnitCost},'PURCHASE_ORDER',${found.id},${`Οριστικοποίηση αγοράς ${effectiveInvoiceNumber||found.id}`},${req.user.id})`;
          await tx.$executeRaw`
            UPDATE "Product" SET
              "costPrice"=${landedUnitCost},
              "salePrice"=CASE WHEN ${agg.proposedSalePrice}>0 THEN ${agg.proposedSalePrice} ELSE "salePrice" END,
              "updatedAt"=NOW()
            WHERE "id"=${productId} AND "companyId"=${companyId}`;
          if(effectiveSupplierId){
            await tx.$executeRaw`
              INSERT INTO "SupplierProductLink" ("id","companyId","supplierId","productId","supplierCode","active","source","updatedBy","updatedByName")
              VALUES (${id()},${companyId},${effectiveSupplierId},${productId},${agg.supplierCode},true,'PURCHASE_ORDER',${req.user.id},${actor})
              ON CONFLICT ("companyId","supplierId","productId") DO UPDATE SET
                "supplierCode"=COALESCE(EXCLUDED."supplierCode","SupplierProductLink"."supplierCode"),
                "active"=true,"source"='PURCHASE_ORDER',"updatedBy"=${req.user.id},"updatedByName"=${actor},"updatedAt"=NOW()`;
          }
        }

        try{
          await tx.$executeRaw`
            INSERT INTO "PurchaseOrderPosting" ("orderId","companyId","supplierId","documentFingerprint","purchaseDocumentId","postedByUserId","postedByName")
            VALUES (${found.id},${companyId},${effectiveSupplierId},${fp},${purchaseDocumentId},${req.user.id},${actor})`;
        }catch(error){
          if(error?.code==="P2010"||String(error?.message||"").includes("unique")){
            const duplicateError=new Error("Το παραστατικό έχει ήδη καταχωρηθεί. Δεν έγινε δεύτερη κίνηση αποθήκης.");
            duplicateError.status=409;
            throw duplicateError;
          }
          throw error;
        }

        await tx.$executeRaw`
          UPDATE "PurchaseOrder" SET "supplierId"=${effectiveSupplierId},"invoiceNumber"=${effectiveInvoiceNumber},"description"=${effectiveDescription},
            "status"='FINAL',"updatedByName"=${actor},"finalizedAt"=COALESCE("finalizedAt",NOW()),"updatedAt"=NOW()
          WHERE "id"=${found.id} AND "companyId"=${companyId}`;
        return {ok:true,status:"FINAL",purchaseDocumentId,postedProducts:stockByProduct.size};
      }

      if(requestedStatus==="INVOICED"){
        if(existingPosting&&fp&&existingPosting.documentFingerprint!==fp){
          await tx.$executeRaw`UPDATE "PurchaseOrderPosting" SET "supplierId"=${effectiveSupplierId},"documentFingerprint"=${fp},"updatedAt"=NOW() WHERE "orderId"=${found.id}`;
        }
        await tx.$executeRaw`
          UPDATE "PurchaseDocument" SET "supplierId"=${effectiveSupplierId},"documentNumber"=${effectiveInvoiceNumber},"updatedAt"=NOW()
          WHERE "id"=${found.id} AND "companyId"=${companyId}`;
        await tx.$executeRaw`
          UPDATE "PurchaseOrder" SET "supplierId"=${effectiveSupplierId},"invoiceNumber"=${effectiveInvoiceNumber},"description"=${effectiveDescription},
            "status"='INVOICED',"updatedByName"=${actor},"invoicedAt"=COALESCE("invoicedAt",NOW()),"updatedAt"=NOW()
          WHERE "id"=${found.id} AND "companyId"=${companyId}`;
        return {ok:true,status:"INVOICED",idempotent:true,purchaseDocumentId:found.id};
      }

      return {ok:true};
    });
    res.json(result);
  }catch(error){
    if(error?.status===409&&error?.duplicate)return res.status(409).json({error:error.message,duplicate:error.duplicate});
    next(error);
  }
});

export default router;
