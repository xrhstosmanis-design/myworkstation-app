import { Router } from "express";
import crypto from "crypto";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { auth } from "../middleware/auth.js";
import { sendLedgerAlertEmail } from "../services/mail.js";

const router=Router();
let tablesPromise;

const tableStatements=[
  `CREATE TABLE IF NOT EXISTS "CashShiftSession" (
    "id" TEXT PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "shiftLabel" TEXT NOT NULL DEFAULT 'Βάρδια',
    "openedBy" TEXT NOT NULL,
    "openedByName" TEXT,
    "openedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "openingDrawer" NUMERIC(14,2) NOT NULL DEFAULT 0,
    "openingCustody" NUMERIC(14,2) NOT NULL DEFAULT 0,
    "openingCoins" NUMERIC(14,2) NOT NULL DEFAULT 0,
    "openingSafe" NUMERIC(14,2) NOT NULL DEFAULT 0,
    "openingOperational" NUMERIC(14,2) NOT NULL DEFAULT 0,
    "openingNote" TEXT,
    "closedBy" TEXT,
    "closedByName" TEXT,
    "closedAt" TIMESTAMPTZ,
    "cashSales" NUMERIC(14,2) NOT NULL DEFAULT 0,
    "cardSales" NUMERIC(14,2) NOT NULL DEFAULT 0,
    "expenses" NUMERIC(14,2) NOT NULL DEFAULT 0,
    "closingDrawer" NUMERIC(14,2),
    "closingCustody" NUMERIC(14,2),
    "closingCoins" NUMERIC(14,2),
    "closingSafe" NUMERIC(14,2),
    "expectedOperational" NUMERIC(14,2),
    "actualOperational" NUMERIC(14,2),
    "variance" NUMERIC(14,2),
    "nextOpeningTotal" NUMERIC(14,2),
    "closingNote" TEXT,
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `ALTER TABLE "CashShiftSession" ADD COLUMN IF NOT EXISTS "openedByName" TEXT`,
  `ALTER TABLE "CashShiftSession" ADD COLUMN IF NOT EXISTS "closedByName" TEXT`,
  `ALTER TABLE "CashShiftSession" ADD COLUMN IF NOT EXISTS "terminalPos" TEXT NOT NULL DEFAULT 'MAIN'`,
  `CREATE TABLE IF NOT EXISTS "StoreTransaction" (
    "id" TEXT PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "sessionId" TEXT,
    "type" TEXT NOT NULL,
    "amount" NUMERIC(14,2) NOT NULL,
    "description" TEXT,
    "supplierName" TEXT,
    "attachmentData" TEXT,
    "attachmentMimeType" TEXT,
    "attachmentFilename" TEXT,
    "attachmentChecksum" TEXT,
    "paymentMethod" TEXT,
    "subtractFromShift" BOOLEAN NOT NULL DEFAULT false,
    "actorId" TEXT NOT NULL,
    "actorName" TEXT NOT NULL,
    "occurredAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "reversedAt" TIMESTAMPTZ,
    "reversedBy" TEXT,
    "reversedByName" TEXT,
    "reversalReason" TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS "StoreTransaction_store_occurred_idx"
   ON "StoreTransaction" ("storeId","occurredAt" DESC)`,
  `CREATE INDEX IF NOT EXISTS "StoreTransaction_session_idx"
   ON "StoreTransaction" ("sessionId","occurredAt" DESC)`,
  `ALTER TABLE "StoreTransaction" ADD COLUMN IF NOT EXISTS "attachmentData" TEXT`,
  `ALTER TABLE "StoreTransaction" ADD COLUMN IF NOT EXISTS "attachmentMimeType" TEXT`,
  `ALTER TABLE "StoreTransaction" ADD COLUMN IF NOT EXISTS "attachmentFilename" TEXT`,
  `ALTER TABLE "StoreTransaction" ADD COLUMN IF NOT EXISTS "attachmentChecksum" TEXT`
  ,`ALTER TABLE "StoreTransaction" ADD COLUMN IF NOT EXISTS "paymentMethod" TEXT`
  ,`ALTER TABLE "StoreTransaction" ADD COLUMN IF NOT EXISTS "subtractFromShift" BOOLEAN NOT NULL DEFAULT false`
  ,`ALTER TABLE "StoreTransaction" ADD COLUMN IF NOT EXISTS "supplierId" TEXT`
  ,`CREATE INDEX IF NOT EXISTS "StoreTransaction_supplier_idx" ON "StoreTransaction" ("companyId","supplierId","occurredAt" DESC)`
];

async function ensureTables(){
  if(!tablesPromise){
    tablesPromise=(async()=>{
      for(const sql of tableStatements)await prisma.$executeRawUnsafe(sql);
    })().catch(error=>{tablesPromise=undefined;throw error});
  }
  return tablesPromise;
}

function route(handler){
  return async(req,res)=>{
    try{
      await ensureTables();
      await handler(req,res);
    }catch(error){
      console.error("Store Transactions:",error);
      if(error?.name==="ZodError")return res.status(400).json({error:"Ελέγξτε το είδος συναλλαγής και το ποσό.",details:error.issues});
      if(error?.code==="23505"||error?.code==="P2010")return res.status(409).json({error:"Η ίδια πληρωμή έχει ήδη καταχωρηθεί. Δεν δημιουργήθηκε δεύτερη εγγραφή."});
      return res.status(error?.status||500).json({error:error?.message||"Σφάλμα στις συναλλαγές βάρδιας."});
    }
  };
}

function requireLedgerAccess(req,res,next){
  const backoffice=req.user?.tokenType!=="STORE_OPERATOR"&&["OWNER","ADMIN","MANAGER"].includes(req.user?.role);
  const permissions=req.user?.permissions||[];
  const actionPermission=req.method==="POST"&&(
    permissions.includes("SUPPLIER_PAYMENT")||
    permissions.includes("THIRD_PARTY_PAYMENT")||
    permissions.includes("TRANSFER_AMOUNT")
  );
  const operator=req.user?.tokenType==="STORE_OPERATOR"&&(
    permissions.includes("STORE_LEDGER")||permissions.includes("CASH_CONTROL")||actionPermission
  );
  if(!backoffice&&!operator)return res.status(403).json({error:"Δεν έχεις δικαίωμα καταχώρισης συναλλαγών."});
  next();
}
function assertStoreAccess(req,storeId){
  if(req.user?.tokenType==="STORE_OPERATOR"&&req.user.storeId!==storeId){
    const error=new Error("Η πρόσβαση ισχύει μόνο για το δικό σου κατάστημα.");error.status=403;throw error;
  }
}
async function ownedStore(storeId,companyId){
  const store=await prisma.store.findFirst({where:{id:storeId,companyId,active:true}});
  if(!store){const error=new Error("Δεν βρέθηκε ενεργό κατάστημα.");error.status=404;throw error}
  return store;
}
async function requestTerminal(req){
  const testTerminal=(process.env.CI==="true"||process.env.NODE_ENV==="test"||process.env.MWS_E2E_TERMINAL_OVERRIDE==="1")?String(req.query?.mwsTerminal||req.headers?.["x-mws-terminal-pos"]||req.body?.terminalPos||"").trim():"";
  if(testTerminal)return testTerminal.toUpperCase().slice(0,120);
  if(req.user?.tokenType==="STORE_OPERATOR"){
    const liveTerminal=String(req.user?.terminalPos||"").trim();
    if(liveTerminal)return liveTerminal.toUpperCase().slice(0,120);
    const rows=await prisma.$queryRaw`SELECT COALESCE(NULLIF(TRIM(p."terminalPos"),''),'MAIN') AS "terminalPos" FROM "StoreOperatorProfile" p WHERE p."companyId"=${req.user.companyId} AND p."storeId"=${req.user.storeId} AND p."employeeId"=${req.user.employeeId} LIMIT 1`;
    return String(rows[0]?.terminalPos||rows[0]?.terminalpos||"MAIN").trim().toUpperCase().slice(0,120)||"MAIN";
  }
  return String(req.headers?.["x-mws-terminal-pos"]||"MAIN").trim().toUpperCase().slice(0,120)||"MAIN";
}
function normalize(row){
  if(!row)return null;
  return {...row,amount:Number(row.amount||0),subtractFromShift:Boolean(row.subtractFromShift)};
}
function totals(rows){
  const active=rows.filter(row=>!row.reversedAt);
  const sum=type=>active.filter(row=>row.type===type).reduce((total,row)=>total+Number(row.amount||0),0);
  const sumShiftExpense=type=>active.filter(row=>row.type===type&&row.subtractFromShift).reduce((total,row)=>total+Number(row.amount||0),0);
  const supplierPayments=sum("SUPPLIER_PAYMENT");
  const otherExpenses=sum("OTHER_EXPENSE");
  const deductedSupplierPayments=sumShiftExpense("SUPPLIER_PAYMENT");
  const deductedOtherExpenses=sumShiftExpense("OTHER_EXPENSE");
  return {
    cashSales:sum("SALE_CASH")+sum("CUSTOMER_RECEIPT_CASH"),
    cardSales:sum("SALE_CARD")+sum("SALE_IRIS")+sum("CUSTOMER_RECEIPT_CARD"),
    irisSales:sum("SALE_IRIS"),
    transferIn:sum("TRANSFER_AMOUNT"),
    supplierPayments,
    otherExpenses,
    expensesTotal:deductedSupplierPayments+deductedOtherExpenses,
    recordedExpensesTotal:supplierPayments+otherExpenses,
    deductedSupplierPayments,
    deductedOtherExpenses,
    percentages:sum("PERCENTAGES"),
    count:active.length
  };
}

const transactionSchema=z.object({
  type:z.enum(["SALE_CASH","SALE_CARD","SUPPLIER_PAYMENT","OTHER_EXPENSE","PERCENTAGES","TRANSFER_AMOUNT"]),
  amount:z.coerce.number().finite().refine(value=>value!==0,{message:"Το ποσό δεν μπορεί να είναι μηδενικό."}).refine(value=>Math.abs(value)<=999999999,{message:"Το ποσό είναι πολύ μεγάλο."}),
  description:z.string().trim().max(500).optional().nullable(),
  supplierName:z.string().trim().max(180).optional().nullable(),
  supplierId:z.string().optional().nullable(),
  evidenceMode:z.enum(["DOCUMENT","NO_DOCUMENT"]).optional().nullable(),
  purchaseDocumentId:z.string().trim().min(1).max(180).optional().nullable(),
  paymentSource:z.enum(["CASH_SHIFT","EXTERNAL"]).optional().nullable(),
  paymentMethod:z.enum(["CASH_SHIFT","CORPORATE_CARD","BANK_TRANSFER","EMPLOYEE_REIMBURSEMENT"]).optional().nullable(),
  idempotencyKey:z.string().trim().min(8).max(180).optional().nullable(),
  subtractFromShift:z.coerce.boolean().optional().default(false),
  attachment:z.object({dataUrl:z.string().max(1800000),filename:z.string().trim().min(1).max(180)}).optional().nullable()
});

function parseAttachment(attachment){
  if(!attachment)return null;
  const match=/^data:(image\/(?:jpeg|png|webp)|application\/pdf);base64,([A-Za-z0-9+/=]+)$/.exec(attachment.dataUrl);
  if(!match){const error=new Error("Το παραστατικό πρέπει να είναι JPEG, PNG, WEBP ή PDF.");error.status=400;throw error}
  const bytes=Buffer.from(match[2],"base64");
  if(bytes.length<100||bytes.length>1200000){const error=new Error("Το παραστατικό πρέπει να είναι έως 1,2 MB.");error.status=400;throw error}
  if(match[1]==="application/pdf"&&!bytes.subarray(0,5).equals(Buffer.from("%PDF-"))){const error=new Error("Το PDF παραστατικό δεν είναι έγκυρο.");error.status=400;throw error}
  return {dataUrl:attachment.dataUrl,mimeType:match[1],filename:attachment.filename,checksum:crypto.createHash("sha256").update(bytes).digest("hex")};
}

function paymentId(companyId,storeId,key){
  return `pay_${crypto.createHash("sha256").update(`${companyId}:${storeId}:${key}`).digest("hex")}`;
}

async function alertRecipients(companyId,store){
  const owners=await prisma.user.findMany({where:{companyId,role:"OWNER"},select:{email:true}});
  return [...new Set([...owners.map(owner=>owner.email),store.responsibleEmail].map(value=>String(value||"").trim().toLowerCase()).filter(Boolean))];
}

async function notifyLedgerAlert({companyId,store,kind,transaction,actorName,reason}){
  const recipients=await alertRecipients(companyId,store);
  if(!recipients.length)return {status:"SKIPPED",recipients:[]};
  try{
    await sendLedgerAlertEmail({to:recipients,kind,storeName:store.name,amount:transaction.amount,actorName,occurredAt:transaction.reversedAt||transaction.occurredAt,description:transaction.description,reason,originalType:transaction.type});
    return {status:"SENT",recipients};
  }catch(error){
    console.error("Store transaction email notification failed:",error?.message||error);
    return {status:"FAILED",recipients};
  }
}

async function reconcileOnlineSalesForOpenSession({store,companyId,openSession}){
  if(!openSession)return;
  try{
    const exists=await prisma.$queryRawUnsafe(`SELECT to_regclass('"OnlineOrder"') AS "tableName"`);
    if(!exists?.[0]?.tableName)return;
    await prisma.$transaction(async tx=>{
      await tx.$executeRaw`
        WITH delivered AS (
          SELECT o."saleId",
                 COALESCE(ev."employeeId",o."assignedEmployeeId") AS "employeeId",
                 COALESCE(o."deliveredAt",o."commercialPostedAt",o."updatedAt",o."createdAt") AS "postedAt"
          FROM "OnlineOrder" o
          LEFT JOIN LATERAL (
            SELECT e."employeeId"
            FROM "OnlineOrderStatusEvent" e
            WHERE e."orderId"=o."id" AND e."toStatus"='DELIVERED' AND e."employeeId" IS NOT NULL
            ORDER BY e."createdAt" DESC LIMIT 1
          ) ev ON TRUE
          WHERE o."companyId"=${companyId}
            AND o."storeId"=${store.id}
            AND o."status"='DELIVERED'
            AND o."saleId" IS NOT NULL
            AND COALESCE(o."deliveredAt",o."commercialPostedAt",o."updatedAt",o."createdAt")>=${openSession.openedAt}
        )
        UPDATE "Sale" s
        SET "operatorEmployeeId"=COALESCE(d."employeeId",s."operatorEmployeeId"),
            "createdAt"=COALESCE(d."postedAt",s."createdAt")
        FROM delivered d
        WHERE s."id"=d."saleId"
      `;
      await tx.$executeRaw`
        WITH delivered AS (
          SELECT o."id" AS "orderId",o."orderNumber",o."paymentMethod",o."total",
                 COALESCE(o."deliveredAt",o."commercialPostedAt",o."updatedAt",o."createdAt") AS "postedAt"
          FROM "OnlineOrder" o
          WHERE o."companyId"=${companyId}
            AND o."storeId"=${store.id}
            AND o."status"='DELIVERED'
            AND o."saleId" IS NOT NULL
            AND COALESCE(o."deliveredAt",o."commercialPostedAt",o."updatedAt",o."createdAt")>=${openSession.openedAt}
        )
        UPDATE "StoreTransaction" t
        SET "sessionId"=${openSession.id},
            "type"=CASE WHEN d."paymentMethod"='CASH' THEN 'SALE_CASH' ELSE 'SALE_CARD' END,
            "amount"=d."total",
            "description"='ONLINE ΠΑΡΑΓΓΕΛΙΑ ' || d."orderNumber",
            "actorId"=${openSession.openedBy},
            "actorName"=${openSession.openedByName||"Online"},
            "occurredAt"=d."postedAt"
        FROM delivered d
        WHERE t."companyId"=${companyId}
          AND t."storeId"=${store.id}
          AND t."description" ILIKE ('%' || d."orderNumber" || '%')
      `;
      await tx.$executeRaw`
        WITH delivered AS (
          SELECT o."id" AS "orderId",o."orderNumber",o."paymentMethod",o."total",
                 COALESCE(o."deliveredAt",o."commercialPostedAt",o."updatedAt",o."createdAt") AS "postedAt"
          FROM "OnlineOrder" o
          WHERE o."companyId"=${companyId}
            AND o."storeId"=${store.id}
            AND o."status"='DELIVERED'
            AND o."saleId" IS NOT NULL
            AND COALESCE(o."deliveredAt",o."commercialPostedAt",o."updatedAt",o."createdAt")>=${openSession.openedAt}
        )
        INSERT INTO "StoreTransaction" ("id","companyId","storeId","sessionId","type","amount","description","actorId","actorName","occurredAt","createdAt")
        SELECT 'online-order-' || d."orderId",${companyId},${store.id},${openSession.id},
               CASE WHEN d."paymentMethod"='CASH' THEN 'SALE_CASH' ELSE 'SALE_CARD' END,
               d."total",'ONLINE ΠΑΡΑΓΓΕΛΙΑ ' || d."orderNumber",${openSession.openedBy},${openSession.openedByName||"Online"},d."postedAt",CURRENT_TIMESTAMP
        FROM delivered d
        WHERE NOT EXISTS (
          SELECT 1 FROM "StoreTransaction" t
          WHERE t."companyId"=${companyId}
            AND t."storeId"=${store.id}
            AND t."description" ILIKE ('%' || d."orderNumber" || '%')
        )
        ON CONFLICT ("id") DO NOTHING
      `;
    });
  }catch(error){
    console.error("Online shift reconciliation failed:",error?.message||error);
  }
}

router.use(auth,requireLedgerAccess);

router.get("/stores/:storeId/payroll-employees",route(async(req,res)=>{
  assertStoreAccess(req,req.params.storeId);
  const store=await ownedStore(req.params.storeId,req.user.companyId);
  const items=await prisma.$queryRaw`SELECT "id","fullName","position" FROM "Employee" WHERE "companyId"=${req.user.companyId} AND "storeId"=${store.id} AND "active"=true ORDER BY "fullName"`;
  res.json({items});
}));

router.get("/stores/:storeId/overview",route(async(req,res)=>{
  assertStoreAccess(req,req.params.storeId);
  const store=await ownedStore(req.params.storeId,req.user.companyId),terminalPos=await requestTerminal(req),isBackoffice=req.user?.tokenType!=="STORE_OPERATOR";
  const openRows=isBackoffice
    ?await prisma.$queryRaw`SELECT "id","shiftLabel","openedAt","openedBy","openedByName","terminalPos","openingOperational" FROM "CashShiftSession" WHERE "storeId"=${store.id} AND "companyId"=${req.user.companyId} AND "status"='OPEN' ORDER BY "openedAt" DESC`
    :await prisma.$queryRaw`SELECT "id","shiftLabel","openedAt","openedBy","openedByName","terminalPos","openingOperational" FROM "CashShiftSession" WHERE "storeId"=${store.id} AND "companyId"=${req.user.companyId} AND "terminalPos"=${terminalPos} AND "status"='OPEN' ORDER BY "openedAt" DESC LIMIT 1`;
  const openSession=openRows[0]||null;
  for(const session of openRows)await reconcileOnlineSalesForOpenSession({store,companyId:req.user.companyId,openSession:session});
  const canReviewStoreLedger=req.user.tokenType!=="STORE_OPERATOR"||req.user.permissions?.includes("STORE_LEDGER_REVIEW");
  const canReverse=req.user.tokenType!=="STORE_OPERATOR"
    ?["OWNER","ADMIN","MANAGER"].includes(req.user?.role)
    :req.user.permissions?.includes("TRANSACTION_REVERSAL");
  const recentRows=await prisma.$queryRaw`
    SELECT "id","companyId","storeId","sessionId","type","amount","description","supplierName","subtractFromShift","actorId","actorName","occurredAt","reversedAt","reversedBy","reversedByName","reversalReason",
           ("attachmentData" IS NOT NULL) AS "hasAttachment","attachmentFilename",
           CASE WHEN "attachmentMimeType"='application/vnd.myworkstation.purchase-document' THEN "attachmentFilename" ELSE NULL END AS "purchaseDocumentId",
           CASE WHEN "attachmentMimeType"='application/vnd.myworkstation.purchase-document' THEN 'DOCUMENT'
                WHEN "type" IN ('SUPPLIER_PAYMENT','OTHER_EXPENSE') AND "attachmentData" IS NULL THEN 'NO_DOCUMENT'
                ELSE 'LEGACY' END AS "evidenceMode",
           COALESCE(CASE WHEN "paymentMethod" IS NOT NULL THEN "paymentMethod" END,CASE WHEN "type" IN ('SUPPLIER_PAYMENT','OTHER_EXPENSE') AND "subtractFromShift"=true THEN 'CASH_SHIFT'
                WHEN "type" IN ('SUPPLIER_PAYMENT','OTHER_EXPENSE') THEN 'EXTERNAL'
                ELSE NULL END) AS "paymentSource"
    FROM "StoreTransaction"
    WHERE "storeId"=${store.id} AND "companyId"=${req.user.companyId}
      AND (${canReviewStoreLedger} OR "actorId"=${req.user.id})
    ORDER BY "occurredAt" DESC LIMIT 80
  `;
  const recent=recentRows.map(normalize);
  const suppliers=await prisma.$queryRaw`SELECT "id","name","taxId" FROM "Supplier" WHERE "companyId"=${req.user.companyId} AND "active"=true ORDER BY "name"`;
  const purchaseDocuments=await prisma.$queryRaw`
    SELECT p."id",p."supplierId",p."documentNumber",p."documentDate",p."totalGross",p."status",s."name" AS "supplierName"
    FROM "PurchaseDocument" p
    LEFT JOIN "Supplier" s ON s."id"=p."supplierId" AND s."companyId"=${req.user.companyId}
    WHERE p."companyId"=${req.user.companyId} AND p."storeId"=${store.id} AND p."status" IN ('DRAFT','APPROVED')
    ORDER BY p."documentDate" DESC,p."id" DESC LIMIT 100
  `;
  const openSessionIds=openRows.map(row=>row.id),sessionRows=!openSession?[]:isBackoffice
    ?(await prisma.$queryRaw`SELECT "type","amount","subtractFromShift","reversedAt" FROM "StoreTransaction" WHERE "sessionId"=ANY(${openSessionIds}::text[]) AND "storeId"=${store.id} AND "companyId"=${req.user.companyId}`).map(normalize)
    :(await prisma.$queryRaw`
      SELECT "type","amount","subtractFromShift","reversedAt"
      FROM "StoreTransaction"
      WHERE "sessionId"=${openSession.id} AND "storeId"=${store.id} AND "companyId"=${req.user.companyId}
    `).map(normalize);
  res.json({
    store:{id:store.id,name:store.name},
    openSession,
    openSessions:openRows,
    summary:totals(sessionRows),
    suppliers,
    purchaseDocuments:purchaseDocuments.map(row=>({...row,totalGross:Number(row.totalGross||0)})),
    recent,
    access:{canReviewStoreLedger,canReverse}
  });
}));

router.post("/stores/:storeId",route(async(req,res)=>{
  assertStoreAccess(req,req.params.storeId);
  const store=await ownedStore(req.params.storeId,req.user.companyId);
  const body=transactionSchema.parse(req.body||{});
  const isPayment=body.type==="SUPPLIER_PAYMENT"||body.type==="OTHER_EXPENSE";
  if(body.amount<0&&(!["SUPPLIER_PAYMENT","OTHER_EXPENSE"].includes(body.type)||body.paymentSource!=="CASH_SHIFT"))return res.status(400).json({error:"Αρνητική κίνηση επιτρέπεται μόνο στο ταμείο της ενεργής βάρδιας."});
  const needsPhoto=body.type==="SUPPLIER_PAYMENT"||body.type==="OTHER_EXPENSE";
  const legacyPayment=isPayment&&!body.evidenceMode;
  let supplierName=body.supplierName||null;
  let purchaseDocument=null;
  if(body.type==="SUPPLIER_PAYMENT"){
    const rows=body.supplierId?await prisma.$queryRaw`SELECT "id","name" FROM "Supplier" WHERE "id"=${body.supplierId} AND "companyId"=${req.user.companyId} AND "active"=true LIMIT 1`:[];
    if(body.supplierId&&!rows[0])return res.status(404).json({error:"Δεν βρέθηκε ο προμηθευτής."});
    supplierName=rows[0]?.name||supplierName;
    if(!supplierName)return res.status(400).json({error:"Επίλεξε τον προμηθευτή της πληρωμής."});
  }
  if(legacyPayment&&needsPhoto&&!body.attachment)return res.status(400).json({error:"Η φωτογραφία παραστατικού είναι υποχρεωτική για αυτή την καταχώριση."});
  if(isPayment&&!legacyPayment){
    if(!body.idempotencyKey)return res.status(400).json({error:"Λείπει το αναγνωριστικό ασφαλούς καταχώρισης της πληρωμής."});
    if(!body.paymentSource)return res.status(400).json({error:"Δήλωσε αν η πληρωμή έγινε από το ταμείο της βάρδιας ή εξωτερικά."});
    if(body.evidenceMode==="DOCUMENT"){
      if(!body.purchaseDocumentId)return res.status(400).json({error:"Επίλεξε το πρόχειρο/εγκεκριμένο παραστατικό από το AI Reader."});
      const docs=await prisma.$queryRaw`
        SELECT "id","supplierId","status"
        FROM "PurchaseDocument"
        WHERE "id"=${body.purchaseDocumentId} AND "companyId"=${req.user.companyId} AND "storeId"=${store.id}
          AND "status" IN ('DRAFT','APPROVED') LIMIT 1
      `;
      purchaseDocument=docs[0]||null;
      if(!purchaseDocument)return res.status(404).json({error:"Δεν βρέθηκε διαθέσιμο παραστατικό του καταστήματος από τη ροή OCR/AI Reader."});
      if(body.type==="SUPPLIER_PAYMENT"&&body.supplierId&&purchaseDocument.supplierId!==body.supplierId)return res.status(400).json({error:"Ο προμηθευτής της πληρωμής δεν συμφωνεί με το παραστατικό."});
    }else{
      if(body.purchaseDocumentId)return res.status(400).json({error:"Καταχώριση χωρίς παραστατικό δεν μπορεί να συνδεθεί με PurchaseDocument."});
      if(!body.description||body.description.trim().length<3)return res.status(400).json({error:"Η αιτιολογία/περιγραφή είναι υποχρεωτική όταν δεν υπάρχει παραστατικό."});
    }
  }
  const legacyAttachment=(legacyPayment||!isPayment)?parseAttachment(body.attachment):null;
  const actorName=req.user.fullName||"Χρήστης",terminalPos=await requestTerminal(req);
  const paymentKey=isPayment?(body.idempotencyKey||legacyAttachment?.checksum):null;
  const selectedPaymentSource=body.paymentSource||(body.subtractFromShift?"CASH_SHIFT":"EXTERNAL");
  const selectedPaymentMethod=body.paymentMethod||(selectedPaymentSource==="CASH_SHIFT"?"CASH_SHIFT":"CORPORATE_CARD");
  const subtractFromShift=isPayment
    ?(legacyPayment?selectedPaymentSource==="CASH_SHIFT":body.paymentSource==="CASH_SHIFT")
    :Boolean(body.subtractFromShift);
  const externalPayment=isPayment&&!legacyPayment&&body.paymentSource==="EXTERNAL";
  const legacyExternalPayment=legacyPayment&&selectedPaymentSource==="EXTERNAL";
  const id=isPayment?paymentId(req.user.companyId,store.id,paymentKey):crypto.randomUUID();
  const documentMime=purchaseDocument?"application/vnd.myworkstation.purchase-document":null;
  const evidenceChecksum=isPayment?crypto.createHash("sha256").update(paymentKey).digest("hex"):legacyAttachment?.checksum||null;
  let rows;
  if(externalPayment){
    rows=await prisma.$queryRaw`
      INSERT INTO "StoreTransaction" (
        "id","companyId","storeId","sessionId","type","amount","description","supplierId","supplierName","subtractFromShift","paymentMethod","actorId","actorName","attachmentData","attachmentMimeType","attachmentFilename","attachmentChecksum"
      ) VALUES (
        ${id},${req.user.companyId},${store.id},${null},${body.type},${body.amount},
        ${body.description||null},${body.supplierId||null},${supplierName},false,${selectedPaymentMethod},${req.user.id},${actorName},${legacyAttachment?.dataUrl||null},${documentMime||legacyAttachment?.mimeType||null},${purchaseDocument?.id||legacyAttachment?.filename||null},${evidenceChecksum}
      )
      RETURNING *
    `;
  }else if(legacyExternalPayment){
    rows=await prisma.$queryRaw`
      INSERT INTO "StoreTransaction" (
        "id","companyId","storeId","sessionId","type","amount","description","supplierId","supplierName","subtractFromShift","paymentMethod","actorId","actorName","attachmentData","attachmentMimeType","attachmentFilename","attachmentChecksum"
      ) VALUES (
        ${id},${req.user.companyId},${store.id},${null},${body.type},${body.amount},
        ${body.description||null},${body.supplierId||null},${supplierName},false,${selectedPaymentMethod},${req.user.id},${actorName},${legacyAttachment?.dataUrl||null},${documentMime||legacyAttachment?.mimeType||null},${purchaseDocument?.id||legacyAttachment?.filename||null},${evidenceChecksum}
      )
      RETURNING *
    `;
  }else{
    rows=await prisma.$queryRaw`
      INSERT INTO "StoreTransaction" (
        "id","companyId","storeId","sessionId","type","amount","description","supplierId","supplierName","subtractFromShift","paymentMethod","actorId","actorName","attachmentData","attachmentMimeType","attachmentFilename","attachmentChecksum"
      )
      SELECT
        ${id},${req.user.companyId},${store.id},shift."id",${body.type},${body.amount},
        ${body.description||null},${body.supplierId||null},${supplierName},${subtractFromShift},${selectedPaymentMethod},${req.user.id},${actorName},${legacyAttachment?.dataUrl||null},${documentMime||legacyAttachment?.mimeType||null},${purchaseDocument?.id||legacyAttachment?.filename||null},${evidenceChecksum}
      FROM "CashShiftSession" shift
      WHERE shift."storeId"=${store.id}
        AND shift."companyId"=${req.user.companyId}
        AND shift."terminalPos"=${terminalPos}
        AND shift."status"='OPEN'
      ORDER BY shift."openedAt" DESC
      LIMIT 1
      FOR KEY SHARE OF shift
      RETURNING *
    `;
    if(!rows[0])return res.status(409).json({error:"Η βάρδια έχει κλείσει ή δεν είναι πλέον ενεργή. Η συναλλαγή δεν αποθηκεύτηκε."});
  }
  const transaction=normalize(rows[0]);
  const emailNotification=body.type==="PERCENTAGES"?await notifyLedgerAlert({companyId:req.user.companyId,store,kind:"PERCENTAGES",transaction,actorName}):null;
  res.status(201).json({
    ...transaction,
    purchaseDocumentId:purchaseDocument?.id||null,
    evidenceMode:isPayment?(body.evidenceMode||"LEGACY"):null,
    paymentSource:isPayment?selectedPaymentSource:null,
    paymentMethod:isPayment?selectedPaymentMethod:null,
    emailNotification
  });
}));

router.get("/:transactionId/attachment",route(async(req,res)=>{
  const rows=await prisma.$queryRaw`
    SELECT "storeId","actorId","attachmentData","attachmentMimeType","attachmentFilename"
    FROM "StoreTransaction" WHERE "id"=${req.params.transactionId} AND "companyId"=${req.user.companyId} LIMIT 1
  `;
  const row=rows[0];
  if(!row)return res.status(404).json({error:"Δεν βρέθηκε συναλλαγή."});
  assertStoreAccess(req,row.storeId);
  const canReviewStoreLedger=req.user.permissions?.includes("STORE_LEDGER_REVIEW");
  if(req.user.tokenType==="STORE_OPERATOR"&&!canReviewStoreLedger&&row.actorId!==req.user.id)return res.status(403).json({error:"Μπορείς να δεις μόνο τα δικά σου παραστατικά."});
  if(!row.attachmentData)return res.status(404).json({error:"Δεν υπάρχει παραστατικό."});
  res.json({dataUrl:row.attachmentData,mimeType:row.attachmentMimeType,filename:row.attachmentFilename});
}));

router.post("/:transactionId/reverse",route(async(req,res)=>{
  const canReverse=req.user.tokenType!=="STORE_OPERATOR"
    ?["OWNER","ADMIN","MANAGER"].includes(req.user?.role)
    :req.user.permissions?.includes("TRANSACTION_REVERSAL");
  if(!canReverse)return res.status(403).json({error:"Μόνο υπεύθυνος ή διαχειριστής μπορεί να ακυρώσει συναλλαγή."});
  const body=z.object({reason:z.string().trim().min(3).max(500)}).parse(req.body||{});
  const found=await prisma.$queryRaw`
    SELECT * FROM "StoreTransaction"
    WHERE "id"=${req.params.transactionId} AND "companyId"=${req.user.companyId} LIMIT 1
  `;
  const transaction=found[0];
  if(!transaction)return res.status(404).json({error:"Δεν βρέθηκε συναλλαγή."});
  assertStoreAccess(req,transaction.storeId);
  if(transaction.reversedAt)return res.status(409).json({error:"Η συναλλαγή έχει ήδη ακυρωθεί."});
  const actorName=req.user.fullName||"Χρήστης";
  const rows=await prisma.$queryRaw`
    UPDATE "StoreTransaction" transaction
    SET "reversedAt"=NOW(),"reversedBy"=${req.user.id},"reversedByName"=${actorName},"reversalReason"=${body.reason}
    FROM "CashShiftSession" shift
    WHERE transaction."id"=${transaction.id}
      AND transaction."companyId"=${req.user.companyId}
      AND transaction."reversedAt" IS NULL
      AND shift."id"=transaction."sessionId"
      AND shift."companyId"=transaction."companyId"
      AND shift."storeId"=transaction."storeId"
      AND shift."status"='OPEN'
    RETURNING transaction.*
  `;
  if(!rows[0])return res.status(409).json({error:"Η βάρδια της συναλλαγής έχει κλείσει. Δεν επιτρέπεται μεταγενέστερη αλλαγή στα οριστικοποιημένα στοιχεία."});
  const reversed=normalize(rows[0]);
  const store=await ownedStore(transaction.storeId,req.user.companyId);
  const emailNotification=await notifyLedgerAlert({companyId:req.user.companyId,store,kind:"REVERSAL",transaction:reversed,actorName,reason:body.reason});
  res.json({...reversed,emailNotification});
}));

export default router;
