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
      await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "StoreOperatorAudit" ("id" TEXT PRIMARY KEY,"companyId" TEXT NOT NULL,"storeId" TEXT NOT NULL,"operatorId" TEXT,"actorId" TEXT NOT NULL,"eventType" TEXT NOT NULL,"details" JSONB NOT NULL DEFAULT '{}'::jsonb,"createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
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

async function duplicateDetails(tx,{companyId,supplierId,documentNumber,orderId=null}){
  const normalized=normalizeDocumentNumber(documentNumber);
  if(!supplierId||!normalized)return null;
  const excludedOrderId=orderId||"";
  const orderRows=await tx.$queryRaw`
    SELECT o."id",o."invoiceNumber",o."status",o."createdAt",s."name" AS "supplierName",st."name" AS "storeName"
    FROM "PurchaseOrder" o
    LEFT JOIN "Supplier" s ON s."id"=o."supplierId"
    LEFT JOIN "Store" st ON st."id"=o."storeId"
    WHERE o."companyId"=${companyId} AND o."supplierId"=${supplierId}
      AND (${excludedOrderId}='' OR o."id"<>${excludedOrderId})
      AND o."status" IN ('NEW','FINAL','INVOICED')
      AND UPPER(REGEXP_REPLACE(TRIM(COALESCE(o."invoiceNumber",'')),'\\s+','','g'))=${normalized}
    ORDER BY CASE o."status" WHEN 'INVOICED' THEN 1 WHEN 'FINAL' THEN 2 ELSE 3 END,o."updatedAt" DESC LIMIT 1`;
  if(orderRows[0])return {source:"PURCHASE_ORDER",...orderRows[0]};

  const docRows=await tx.$queryRaw`
    SELECT d."id",d."documentNumber" AS "invoiceNumber",d."status",d."documentDate" AS "createdAt",s."name" AS "supplierName",st."name" AS "storeName"
    FROM "PurchaseDocument" d
    LEFT JOIN "Supplier" s ON s."id"=d."supplierId"
    LEFT JOIN "Store" st ON st."id"=d."storeId"
    WHERE d."companyId"=${companyId} AND d."supplierId"=${supplierId}
      AND (${excludedOrderId}='' OR d."id"<>${excludedOrderId})
      AND d."status"='APPROVED'
      AND UPPER(REGEXP_REPLACE(TRIM(COALESCE(d."documentNumber",'')),'\\s+','','g'))=${normalized}
    ORDER BY d."documentDate" DESC LIMIT 1`;
  if(docRows[0])return {source:"PURCHASE_DOCUMENT",...docRows[0]};
  return null;
}

router.use(async(req,res,next)=>{try{await ensureSchema();next()}catch(error){next(error)}});

router.post("/",async(req,res,next)=>{
  try{
    if(req.user?.tokenType==="STORE_OPERATOR"||!roles.has(req.user?.role))return next();
    const supplierId=req.body?.supplierId||null;
    const invoiceNumber=req.body?.invoiceNumber||null;
    if(!supplierId||!normalizeDocumentNumber(invoiceNumber))return next();
    const duplicate=await prisma.$transaction(tx=>duplicateDetails(tx,{companyId:req.user.companyId,supplierId,documentNumber:invoiceNumber}));
    if(!duplicate)return next();
    return res.status(409).json({
      error:`Το παραστατικό ${invoiceNumber} υπάρχει ήδη${duplicate.storeName?` στο ${duplicate.storeName}`:""} (${duplicate.status||"καταχωρημένο"}). Δεν δημιουργήθηκε νέα παραγγελία.`,
      duplicate
    });
  }catch(error){next(error)}
});

router.delete("/:orderId",async(req,res,next)=>{
  try{
    if(req.user?.tokenType==="STORE_OPERATOR"||!roles.has(req.user?.role))return res.status(403).json({error:"Δεν έχεις δικαίωμα διαγραφής παραγγελίας."});
    const companyId=req.user.companyId;
    const result=await prisma.$transaction(async tx=>{
      const rows=await tx.$queryRaw`
        SELECT o."id",o."status",o."invoiceNumber",o."storeId",o."supplierId",o."sourceType",o."sourceDocumentId",
          o."description",s."name" AS "supplierName",st."name" AS "storeName"
        FROM "PurchaseOrder" o
        LEFT JOIN "Supplier" s ON s."id"=o."supplierId" AND s."companyId"=o."companyId"
        LEFT JOIN "Store" st ON st."id"=o."storeId" AND st."companyId"=o."companyId"
        WHERE o."id"=${req.params.orderId} AND o."companyId"=${companyId}
        FOR UPDATE OF o`;
      const found=rows[0];
      if(!found){const error=new Error("Δεν βρέθηκε η παραγγελία.");error.status=404;throw error}
      if(found.status!=="NEW"){
        const error=new Error("Διαγράφονται μόνο πρόχειρες / Νέες παραγγελίες. Η Οριστική ή Τιμολογημένη παραγγελία χρειάζεται ακύρωση/αντιστροφή.");
        error.status=409;
        throw error;
      }
      const posting=await tx.$queryRaw`SELECT "orderId" FROM "PurchaseOrderPosting" WHERE "orderId"=${found.id} LIMIT 1`;
      if(posting[0]){
        const error=new Error("Η παραγγελία έχει ήδη επηρεάσει την αποθήκη και δεν μπορεί να διαγραφεί.");
        error.status=409;
        throw error;
      }
      const totals=(await tx.$queryRaw`SELECT COUNT("id")::int AS "lineCount",COALESCE(SUM("netAmount"),0) AS "totalNet",COALESCE(SUM("grossAmount"),0) AS "totalGross" FROM "PurchaseOrderLine" WHERE "orderId"=${found.id}`)[0]||{};
      let linkedDocument=null,preservedPaymentTransactionId=null;
      {
        const documents=await tx.$queryRaw`SELECT "id","status","paymentTransactionId" FROM "PurchaseDocument" WHERE "companyId"=${companyId} AND "storeId"=${found.storeId} AND ("id"=${found.sourceDocumentId||null} OR "purchaseOrderId"=${found.id}) FOR UPDATE`;
        if(documents.length>1)throw Object.assign(new Error("Βρέθηκαν πολλαπλά συνδεδεμένα παραστατικά. Χρειάζεται έλεγχος πριν από τη διαγραφή."),{status:409});
        linkedDocument=documents[0]||null;
        if(linkedDocument?.status&&linkedDocument.status!=="DRAFT"){
          const error=new Error("Το συνδεδεμένο παραστατικό δεν είναι πλέον πρόχειρο και δεν μπορεί να διαγραφεί.");error.status=409;throw error;
        }
        if(linkedDocument?.paymentTransactionId){
          const payments=await tx.$queryRaw`SELECT t."id",t."invoiceDocumentNumber" FROM "StoreTransaction" t
            LEFT JOIN "Supplier" paid ON paid."id"=t."supplierId" AND paid."companyId"=t."companyId"
            JOIN "Supplier" selected ON selected."id"=${found.supplierId} AND selected."companyId"=t."companyId"
            WHERE t."id"=${linkedDocument.paymentTransactionId} AND t."companyId"=${companyId} AND t."type"='SUPPLIER_PAYMENT' AND t."storeId"=${found.storeId} AND t."reversedAt" IS NULL
              AND (t."supplierId"=${found.supplierId} OR (REGEXP_REPLACE(COALESCE(selected."taxId",''),'\\D','','g')<>'' AND REGEXP_REPLACE(COALESCE(paid."taxId",''),'\\D','','g')=REGEXP_REPLACE(selected."taxId",'\\D','','g')))
            LIMIT 1 FOR UPDATE OF t`;
          if(payments[0]){
            preservedPaymentTransactionId=payments[0].id;
            // Keep the financial movement and its original shift/actor. Retain the
            // invoice identity after the source draft/photos have been removed.
            await tx.$executeRaw`UPDATE "StoreTransaction" SET "invoiceDocumentNumber"=COALESCE(NULLIF("invoiceDocumentNumber",''),${found.invoiceNumber}),"attachmentData"=NULL,"attachmentMimeType"=NULL,"attachmentFilename"=NULL WHERE "id"=${preservedPaymentTransactionId} AND "companyId"=${companyId} AND "attachmentMimeType"='application/vnd.myworkstation.purchase-document' AND "attachmentFilename"=${linkedDocument.id}`;
          }
        }
      }
      const actorId=req.user.id||req.user.operatorId;
      const actorName=req.user.fullName||req.user.name||req.user.email||"Χρήστης";
      await tx.$executeRaw`INSERT INTO "StoreOperatorAudit" ("id","companyId","storeId","operatorId","actorId","eventType","details") VALUES (${id()},${companyId},${found.storeId},${req.user.operatorId||null},${actorId},'PURCHASE_ORDER_DELETED',${JSON.stringify({orderId:found.id,invoiceNumber:found.invoiceNumber,supplierId:found.supplierId,supplierName:found.supplierName,storeName:found.storeName,status:found.status,lineCount:Number(totals.lineCount||0),totalNet:n(totals.totalNet),totalGross:n(totals.totalGross),sourceType:found.sourceType,sourceDocumentId:found.sourceDocumentId,actorName,sourceFileDeleted:Boolean(linkedDocument),paymentPreserved:Boolean(preservedPaymentTransactionId),preservedPaymentTransactionId})}::jsonb)`;
      await tx.$executeRaw`DELETE FROM "PurchaseOrderLine" WHERE "orderId"=${found.id}`;
      await tx.$executeRaw`DELETE FROM "PurchaseOrder" WHERE "id"=${found.id} AND "companyId"=${companyId}`;
      if(linkedDocument){
        const sourceAttachments=await tx.$queryRaw`SELECT DISTINCT "attachmentId" FROM "AiReaderJob" WHERE "companyId"=${companyId} AND "purchaseDocumentId"=${linkedDocument.id} AND "attachmentId" IS NOT NULL`;
        await tx.$executeRaw`DELETE FROM "PurchaseDocumentLine" WHERE "purchaseDocumentId"=${linkedDocument.id}`;
        await tx.$executeRaw`DELETE FROM "PurchaseDocument" WHERE "id"=${linkedDocument.id} AND "companyId"=${companyId} AND "status"='DRAFT'`;
        for(const source of sourceAttachments){
          await tx.$executeRaw`DELETE FROM "DocumentInbox" WHERE "companyId"=${companyId} AND "attachmentId"=${source.attachmentId}`;
          await tx.$executeRaw`DELETE FROM "AiReaderJob" WHERE "companyId"=${companyId} AND "attachmentId"=${source.attachmentId}`;
          await tx.$executeRaw`DELETE FROM "DocumentAttachment" WHERE "id"=${source.attachmentId} AND "companyId"=${companyId}`;
        }
      }
      return {ok:true,deleted:true,id:found.id,invoiceNumber:found.invoiceNumber,paymentPreserved:Boolean(preservedPaymentTransactionId),message:preservedPaymentTransactionId?"Το πρόχειρο και οι φωτογραφίες διαγράφηκαν. Η ενεργή πληρωμή διατηρήθηκε για νέα εισαγωγή χωρίς χρέωση.":"Το πρόχειρο διαγράφηκε."};
    });
    res.json(result);
  }catch(error){next(error)}
});

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
          SELECT l.*,p."trackStock" FROM "PurchaseOrderLine" l LEFT JOIN "Product" p ON p."id"=l."productId" AND p."companyId"=${companyId}
          WHERE l."orderId"=${found.id}
          ORDER BY l."createdAt",l."id"`;
        if(!lines.length){const error=new Error("Δεν μπορεί να οριστικοποιηθεί αγορά χωρίς είδη.");error.status=409;throw error}

        const linkedCredit=found.sourceDocumentId?await tx.$queryRaw`SELECT "id","documentType","status","totalGross" FROM "PurchaseDocument" WHERE "id"=${found.sourceDocumentId} AND "companyId"=${companyId} AND "purchaseOrderId"=${found.id} FOR UPDATE`:[];
        if(linkedCredit[0]?.documentType==="CREDIT_NOTE"){
          const credit=linkedCredit[0];
          if(credit.status!=="DRAFT")throw Object.assign(new Error("Το πιστωτικό έχει ήδη εγκριθεί ή δεν είναι πλέον πρόχειρο."),{status:409});
          if(lines.some(line=>!line.productId||n(line.quantity)<=0||n(line.grossAmount)<0))throw Object.assign(new Error("Αντιστοίχισε όλα τα επιστρεφόμενα προϊόντα και τις θετικές ποσότητες πριν από την έγκριση του πιστωτικού."),{status:409});
          const net=lines.reduce((sum,line)=>sum+n(line.netAmount)+n(line.exciseTotal),0);
          const vat=lines.reduce((sum,line)=>sum+n(line.vatAmount),0);
          const gross=lines.reduce((sum,line)=>sum+n(line.grossAmount),0);
          if(Math.abs(gross-n(credit.totalGross))>0.05)throw Object.assign(new Error("Οι γραμμές πιστωτικού δεν συμφωνούν με το τυπωμένο συνολικό ποσό. Δεν έγινε κίνηση αποθήκης ή συμψηφισμός."),{status:409});
          await tx.$executeRaw`DELETE FROM "PurchaseDocumentLine" WHERE "purchaseDocumentId"=${credit.id}`;
          for(const line of lines){
            await tx.$executeRaw`INSERT INTO "PurchaseDocumentLine" ("id","purchaseDocumentId","productId","supplierItemCode","description","quantity","unit","unitCost","netAmount","vatRate","vatAmount","grossAmount") VALUES (${id()},${credit.id},${line.productId},${line.supplierCode||null},${line.description},${n(line.quantity)},'PIECE',${n(line.unitCost)},${n(line.netAmount)+n(line.exciseTotal)},${n(line.vatRate)},${n(line.vatAmount)},${n(line.grossAmount)})`;
            if(line.trackStock){
              await tx.$executeRaw`INSERT INTO "StoreProduct" ("id","storeId","productId","currentStock") VALUES (${id()},${found.storeId},${line.productId},${-n(line.quantity)}) ON CONFLICT ("storeId","productId") DO UPDATE SET "currentStock"="StoreProduct"."currentStock"+${-n(line.quantity)},"updatedAt"=NOW()`;
              await tx.$executeRaw`INSERT INTO "StockMovement" ("id","storeId","productId","movementType","quantity","unitCost","sourceType","sourceId","note","createdByUserId") VALUES (${id()},${found.storeId},${line.productId},'SUPPLIER_RETURN',${-n(line.quantity)},${n(line.unitCost)},'CREDIT_NOTE_APPROVAL',${credit.id},${`Πιστωτικό προμηθευτή ${effectiveInvoiceNumber||credit.id}`},${req.user.id})`;
            }
          }
          await tx.$executeRaw`UPDATE "PurchaseDocument" SET "totalNet"=${net},"totalVat"=${vat},"totalGross"=${gross},"status"='APPROVED',"updatedAt"=NOW() WHERE "id"=${credit.id} AND "companyId"=${companyId}`;
          await tx.$executeRaw`INSERT INTO "PurchaseOrderPosting" ("orderId","companyId","supplierId","documentFingerprint","purchaseDocumentId","postedByUserId","postedByName") VALUES (${found.id},${companyId},${effectiveSupplierId},${fp},${credit.id},${req.user.id},${actor})`;
          await tx.$executeRaw`UPDATE "PurchaseOrder" SET "status"='FINAL',"updatedByName"=${actor},"finalizedAt"=NOW(),"updatedAt"=NOW() WHERE "id"=${found.id} AND "companyId"=${companyId}`;
          return {ok:true,status:"FINAL",documentType:"CREDIT_NOTE",purchaseDocumentId:credit.id,postedProducts:lines.length,supplierBalanceChange:-gross,cashMovement:false};
        }

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
