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
  ,`ALTER TABLE "PurchaseDocument" ADD COLUMN IF NOT EXISTS "settlementMode" TEXT`
  ,`CREATE TABLE IF NOT EXISTS "SupplierPaymentSettlement" (
    "id" TEXT PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL UNIQUE,
    "supplierId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING_REVIEW',
    "paymentMethod" TEXT NOT NULL,
    "paidAt" TIMESTAMPTZ NOT NULL,
    "note" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdByName" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMPTZ,
    "reviewNote" TEXT
  )`
  ,`CREATE INDEX IF NOT EXISTS "SupplierPaymentSettlement_company_status_idx" ON "SupplierPaymentSettlement" ("companyId","status","createdAt" DESC)`
  ,`CREATE TABLE IF NOT EXISTS "SupplierPaymentAllocation" (
    "id" TEXT PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "settlementId" TEXT NOT NULL REFERENCES "SupplierPaymentSettlement"("id") ON DELETE CASCADE,
    "purchaseDocumentId" TEXT NOT NULL REFERENCES "PurchaseDocument"("id") ON DELETE RESTRICT,
    "amount" NUMERIC(14,2) NOT NULL CHECK ("amount">0),
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE ("settlementId","purchaseDocumentId")
  )`
  ,`CREATE INDEX IF NOT EXISTS "SupplierPaymentAllocation_document_idx" ON "SupplierPaymentAllocation" ("companyId","purchaseDocumentId")`
  ,`CREATE TABLE IF NOT EXISTS "OtherExpenseReview" (
    "id" TEXT PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL UNIQUE,
    "status" TEXT NOT NULL DEFAULT 'PENDING_REVIEW',
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMPTZ,
    "reviewNote" TEXT
  )`
  ,`CREATE INDEX IF NOT EXISTS "OtherExpenseReview_company_status_idx" ON "OtherExpenseReview" ("companyId","status","createdAt" DESC)`
  ,`CREATE TABLE IF NOT EXISTS "BankAccount" (
    "id" TEXT PRIMARY KEY,"companyId" TEXT NOT NULL,"storeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,"bankName" TEXT NOT NULL,"ibanMasked" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT TRUE,"createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),"updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE ("storeId","name")
  )`
  ,`CREATE INDEX IF NOT EXISTS "BankAccount_store_active_idx" ON "BankAccount" ("companyId","storeId","active")`
  ,`CREATE TABLE IF NOT EXISTS "BankLedgerEntry" (
    "id" TEXT PRIMARY KEY,"companyId" TEXT NOT NULL,"storeId" TEXT NOT NULL,
    "bankAccountId" TEXT NOT NULL REFERENCES "BankAccount"("id") ON DELETE RESTRICT,
    "type" TEXT NOT NULL CHECK ("type" IN ('CASH_DEPOSIT','POS_SETTLEMENT','IRIS_SETTLEMENT','BANK_TRANSFER','CORPORATE_CARD')),
    "amount" NUMERIC(14,2) NOT NULL CHECK ("amount"<>0),
    "status" TEXT NOT NULL DEFAULT 'PENDING_PROOF' CHECK ("status" IN ('PENDING_PROOF','PENDING_REVIEW','CONFIRMED','DISCREPANCY','CANCELLED')),
    "sourceTransactionId" TEXT UNIQUE,"attachmentData" TEXT,"attachmentMimeType" TEXT,"attachmentFilename" TEXT,
    "occurredAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),"createdBy" TEXT NOT NULL,"createdByName" TEXT NOT NULL,
    "reviewedBy" TEXT,"reviewedAt" TIMESTAMPTZ,"reviewNote" TEXT,"createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`
  ,`CREATE INDEX IF NOT EXISTS "BankLedgerEntry_account_status_idx" ON "BankLedgerEntry" ("bankAccountId","status","occurredAt" DESC)`
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
  const superAdmin=req.user?.tokenType!=="STORE_OPERATOR"&&req.user?.role==="SUPER_ADMIN";
  const permissions=req.user?.permissions||[];
  const actionPermission=req.method==="POST"&&(
    permissions.includes("SUPPLIER_PAYMENT")||
    permissions.includes("THIRD_PARTY_PAYMENT")||
    permissions.includes("TRANSFER_AMOUNT")
  );
  const operator=req.user?.tokenType==="STORE_OPERATOR"&&(
    permissions.includes("STORE_LEDGER")||permissions.includes("CASH_CONTROL")||actionPermission
  );
  if(!backoffice&&!superAdmin&&!operator)return res.status(403).json({error:"Δεν έχεις δικαίωμα καταχώρισης συναλλαγών."});
  next();
}
function assertStoreAccess(req,storeId){
  if(req.user?.tokenType==="STORE_OPERATOR"&&req.user.storeId!==storeId){
    const error=new Error("Η πρόσβαση ισχύει μόνο για το δικό σου κατάστημα.");error.status=403;throw error;
  }
}
async function virtualBankAccount(tx,{companyId,storeId,userId}){
  const existing=await tx.$queryRaw`SELECT "id","name","bankName" FROM "BankAccount" WHERE "companyId"=${companyId} AND "storeId"=${storeId} AND "name"='Ταμείο Τράπεζας' AND "active"=true LIMIT 1`;
  if(existing[0])return existing[0];
  const id=crypto.randomUUID();
  try{
    const rows=await tx.$queryRaw`INSERT INTO "BankAccount" ("id","companyId","storeId","name","bankName","createdBy") VALUES (${id},${companyId},${storeId},'Ταμείο Τράπεζας','Εικονικό',${userId}) RETURNING "id","name","bankName"`;
    return rows[0];
  }catch(error){
    if(error?.code!=="23505")throw error;
    const rows=await tx.$queryRaw`SELECT "id","name","bankName" FROM "BankAccount" WHERE "companyId"=${companyId} AND "storeId"=${storeId} AND "name"='Ταμείο Τράπεζας' AND "active"=true LIMIT 1`;
    if(rows[0])return rows[0];
    throw error;
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
  const bankDeposits=sumShiftExpense("BANK_DEPOSIT");
  return {
    cashSales:sum("SALE_CASH")+sum("CUSTOMER_RECEIPT_CASH"),
    cardSales:sum("SALE_CARD")+sum("SALE_IRIS")+sum("CUSTOMER_RECEIPT_CARD"),
    irisSales:sum("SALE_IRIS"),
    transferIn:sum("TRANSFER_AMOUNT"),
    supplierPayments,
    otherExpenses,
    expensesTotal:deductedSupplierPayments+deductedOtherExpenses+bankDeposits,
    recordedExpensesTotal:supplierPayments+otherExpenses,
    deductedSupplierPayments,
    deductedOtherExpenses,
    bankDeposits,
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

const supplierSettlementSchema=z.object({
  supplierId:z.string().trim().min(1).max(180),
  paymentMethod:z.enum(["CASH_SHIFT","CORPORATE_CARD","BANK_TRANSFER","EMPLOYEE_REIMBURSEMENT"]),
  paidAt:z.coerce.date(),
  note:z.string().trim().max(500).optional().nullable(),
  idempotencyKey:z.string().trim().min(8).max(180),
  attachment:z.object({dataUrl:z.string().max(1800000),filename:z.string().trim().min(1).max(180)}),
  allocations:z.array(z.object({purchaseDocumentId:z.string().trim().min(1).max(180),amount:z.coerce.number().positive().max(999999999)})).min(1).max(80)
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

router.post("/stores/:storeId/bank-deposits",route(async(req,res)=>{
  assertStoreAccess(req,req.params.storeId);
  const store=await ownedStore(req.params.storeId,req.user.companyId);
  const body=z.object({amount:z.coerce.number().positive().max(999999999),depositedAt:z.coerce.date(),depositor:z.string().trim().min(2).max(160),note:z.string().trim().max(500).optional().nullable(),attachment:z.object({dataUrl:z.string().max(1800000),filename:z.string().trim().min(1).max(180)}).optional().nullable(),idempotencyKey:z.string().trim().min(8).max(180)}).parse(req.body||{});
  const attachment=parseAttachment(body.attachment);
  const terminalPos=await requestTerminal(req),transactionId=paymentId(req.user.companyId,store.id,body.idempotencyKey),actorName=req.user.fullName||"Χρήστης";
  const result=await prisma.$transaction(async tx=>{
    const account=await virtualBankAccount(tx,{companyId:req.user.companyId,storeId:store.id,userId:req.user.id});
    const existing=await tx.$queryRaw`SELECT "id" FROM "StoreTransaction" WHERE "id"=${transactionId} LIMIT 1`;if(existing[0]){const error=new Error("Η ίδια κατάθεση έχει ήδη καταχωρηθεί.");error.status=409;throw error}
    const rows=await tx.$queryRaw`INSERT INTO "StoreTransaction" ("id","companyId","storeId","sessionId","type","amount","description","subtractFromShift","paymentMethod","actorId","actorName","attachmentData","attachmentMimeType","attachmentFilename","attachmentChecksum","occurredAt") SELECT ${transactionId},${req.user.companyId},${store.id},shift."id",'BANK_DEPOSIT',${body.amount},${`Κατάθεση τράπεζας · ${account.bankName} · ${body.depositor}`},true,'CASH_SHIFT',${req.user.id},${actorName},${attachment?.dataUrl||null},${attachment?.mimeType||null},${attachment?.filename||null},${attachment?.checksum||null},${body.depositedAt} FROM "CashShiftSession" shift WHERE shift."companyId"=${req.user.companyId} AND shift."storeId"=${store.id} AND shift."terminalPos"=${terminalPos} AND shift."status"='OPEN' ORDER BY shift."openedAt" DESC LIMIT 1 FOR KEY SHARE OF shift RETURNING *`;
    if(!rows[0]){const error=new Error("Απαιτείται ενεργή βάρδια για κατάθεση μετρητών.");error.status=409;throw error}
    const status=attachment?'PENDING_REVIEW':'PENDING_PROOF';
    const ledger=await tx.$queryRaw`INSERT INTO "BankLedgerEntry" ("id","companyId","storeId","bankAccountId","type","amount","status","sourceTransactionId","attachmentData","attachmentMimeType","attachmentFilename","occurredAt","createdBy","createdByName") VALUES (${crypto.randomUUID()},${req.user.companyId},${store.id},${account.id},'CASH_DEPOSIT',${body.amount},${status},${transactionId},${attachment?.dataUrl||null},${attachment?.mimeType||null},${attachment?.filename||null},${body.depositedAt},${req.user.id},${actorName}) RETURNING *`;
    return {transaction:normalize(rows[0]),ledger:ledger[0],account};
  });
  res.status(201).json({ok:true,...result,status:result.ledger.status});
}));

router.get("/stores/:storeId/payroll-employees",route(async(req,res)=>{
  assertStoreAccess(req,req.params.storeId);
  const store=await ownedStore(req.params.storeId,req.user.companyId);
  const items=await prisma.$queryRaw`SELECT "id","fullName","position" FROM "Employee" WHERE "companyId"=${req.user.companyId} AND "storeId"=${store.id} AND "active"=true ORDER BY "fullName"`;
  res.json({items});
}));

// The operator sees only the still allocatable balance of credit invoices. Pending
// settlements reserve their amount, so two terminals cannot pay the same balance.
router.get("/stores/:storeId/supplier-open-invoices",route(async(req,res)=>{
  assertStoreAccess(req,req.params.storeId);
  await ownedStore(req.params.storeId,req.user.companyId);
  const supplierId=z.string().trim().min(1).max(180).parse(req.query.supplierId);
  const supplier=await prisma.$queryRaw`SELECT "id","name" FROM "Supplier" WHERE "id"=${supplierId} AND "companyId"=${req.user.companyId} AND "active"=true LIMIT 1`;
  if(!supplier[0])return res.status(404).json({error:"Δεν βρέθηκε ο προμηθευτής."});
  const rows=await prisma.$queryRaw`
    SELECT d."id",d."documentNumber",d."documentDate",d."totalGross",d."status",st."name" AS "storeName",
      COALESCE(SUM(a."amount") FILTER (WHERE ss."status"<>'CANCELLED' AND tx."reversedAt" IS NULL),0) AS "reservedAmount"
    FROM "PurchaseDocument" d
    JOIN "Store" st ON st."id"=d."storeId"
    LEFT JOIN "SupplierPaymentAllocation" a ON a."purchaseDocumentId"=d."id" AND a."companyId"=d."companyId"
    LEFT JOIN "SupplierPaymentSettlement" ss ON ss."id"=a."settlementId" AND ss."companyId"=d."companyId"
    LEFT JOIN "StoreTransaction" tx ON tx."id"=ss."transactionId" AND tx."companyId"=d."companyId"
    WHERE d."companyId"=${req.user.companyId} AND d."supplierId"=${supplierId}
      AND d."status" IN ('DRAFT','APPROVED') AND COALESCE(d."settlementMode",'')='CREDIT'
    GROUP BY d."id",d."documentNumber",d."documentDate",d."totalGross",d."status",st."name"
    HAVING d."totalGross">COALESCE(SUM(a."amount") FILTER (WHERE ss."status"<>'CANCELLED' AND tx."reversedAt" IS NULL),0)
    ORDER BY d."documentDate" ASC,d."id" ASC
  `;
  res.json({supplier:{id:supplier[0].id,name:supplier[0].name},items:rows.map(row=>({
    ...row,totalGross:Number(row.totalGross||0),reservedAmount:Number(row.reservedAmount||0),
    outstandingAmount:Number((Number(row.totalGross||0)-Number(row.reservedAmount||0)).toFixed(2))
  }))});
}));

router.post("/stores/:storeId/supplier-settlements",route(async(req,res)=>{
  assertStoreAccess(req,req.params.storeId);
  const store=await ownedStore(req.params.storeId,req.user.companyId),body=supplierSettlementSchema.parse(req.body||{});
  const attachment=parseAttachment(body.attachment);
  const total=Number(body.allocations.reduce((sum,row)=>sum+Number(row.amount||0),0).toFixed(2));
  const distinct=new Set(body.allocations.map(row=>row.purchaseDocumentId));
  if(distinct.size!==body.allocations.length)return res.status(400).json({error:"Κάθε τιμολόγιο μπορεί να επιλεγεί μία φορά στην ίδια πληρωμή."});
  const paymentSource=body.paymentMethod==="CASH_SHIFT"?"CASH_SHIFT":"EXTERNAL";
  const transactionId=paymentId(req.user.companyId,store.id,body.idempotencyKey);
  const settlementId=crypto.randomUUID(),actorName=req.user.fullName||"Χρήστης",terminalPos=await requestTerminal(req);
  const result=await prisma.$transaction(async tx=>{
    const suppliers=await tx.$queryRaw`SELECT "id","name" FROM "Supplier" WHERE "id"=${body.supplierId} AND "companyId"=${req.user.companyId} AND "active"=true LIMIT 1`;
    if(!suppliers[0]){const error=new Error("Δεν βρέθηκε ο προμηθευτής.");error.status=404;throw error}
    const bankAccount=["CORPORATE_CARD","BANK_TRANSFER"].includes(body.paymentMethod)
      ?await virtualBankAccount(tx,{companyId:req.user.companyId,storeId:store.id,userId:req.user.id})
      :null;
    const documentIds=body.allocations.map(row=>row.purchaseDocumentId);
    const documents=await tx.$queryRaw`
      SELECT "id","documentNumber","totalGross" FROM "PurchaseDocument"
      WHERE "companyId"=${req.user.companyId} AND "supplierId"=${body.supplierId}
        AND "id"=ANY(${documentIds}::text[]) AND "status" IN ('DRAFT','APPROVED')
        AND COALESCE("settlementMode",'')='CREDIT'
      FOR UPDATE
    `;
    if(documents.length!==documentIds.length){const error=new Error("Επιλέχθηκε τιμολόγιο που δεν είναι πλέον ανοιχτή οφειλή του προμηθευτή.");error.status=409;throw error}
    for(const allocation of body.allocations){
      const document=documents.find(row=>row.id===allocation.purchaseDocumentId);
      const allocated=await tx.$queryRaw`
        SELECT COALESCE(SUM(a."amount"),0) AS "amount"
        FROM "SupplierPaymentAllocation" a
        JOIN "SupplierPaymentSettlement" ss ON ss."id"=a."settlementId" AND ss."companyId"=a."companyId"
        JOIN "StoreTransaction" st ON st."id"=ss."transactionId" AND st."companyId"=ss."companyId"
        WHERE a."companyId"=${req.user.companyId} AND a."purchaseDocumentId"=${allocation.purchaseDocumentId}
          AND ss."status"<>'CANCELLED' AND st."reversedAt" IS NULL
      `;
      const remaining=Number(document.totalGross||0)-Number(allocated[0]?.amount||0);
      if(Number(allocation.amount)>remaining+.005){const error=new Error(`Το τιμολόγιο ${document.documentNumber||document.id} έχει διαθέσιμο υπόλοιπο ${remaining.toFixed(2)} €.`);error.status=409;throw error}
    }
    let sessionId=null;
    if(paymentSource==="CASH_SHIFT"){
      const shifts=await tx.$queryRaw`
        SELECT "id" FROM "CashShiftSession" WHERE "storeId"=${store.id} AND "companyId"=${req.user.companyId}
          AND "terminalPos"=${terminalPos} AND "status"='OPEN' ORDER BY "openedAt" DESC LIMIT 1 FOR KEY SHARE
      `;
      if(!shifts[0]){const error=new Error("Η ενεργή βάρδια έχει κλείσει. Η πληρωμή δεν αποθηκεύτηκε.");error.status=409;throw error}
      sessionId=shifts[0].id;
    }
    const existing=await tx.$queryRaw`SELECT "id" FROM "StoreTransaction" WHERE "id"=${transactionId} AND "companyId"=${req.user.companyId} LIMIT 1`;
    if(existing[0]){const error=new Error("Η ίδια πληρωμή έχει ήδη καταχωρηθεί.");error.status=409;throw error}
    const description=`Ετεροχρονισμένη πληρωμή ${suppliers[0].name} · ${body.allocations.length} τιμολόγιο${body.allocations.length===1?"":"α"}`;
    const transaction=await tx.$queryRaw`
      INSERT INTO "StoreTransaction" ("id","companyId","storeId","sessionId","type","amount","description","supplierId","supplierName","subtractFromShift","paymentMethod","actorId","actorName","attachmentData","attachmentMimeType","attachmentFilename","attachmentChecksum","occurredAt")
      VALUES (${transactionId},${req.user.companyId},${store.id},${sessionId},'SUPPLIER_PAYMENT',${total},${description},${body.supplierId},${suppliers[0].name},${paymentSource==="CASH_SHIFT"},${body.paymentMethod},${req.user.id},${actorName},${attachment.dataUrl},${attachment.mimeType},${attachment.filename},${attachment.checksum},${body.paidAt}) RETURNING *
    `;
    await tx.$executeRaw`
      INSERT INTO "SupplierPaymentSettlement" ("id","companyId","storeId","transactionId","supplierId","status","paymentMethod","paidAt","note","createdBy","createdByName")
      VALUES (${settlementId},${req.user.companyId},${store.id},${transactionId},${body.supplierId},'PENDING_REVIEW',${body.paymentMethod},${body.paidAt},${body.note||null},${req.user.id},${actorName})
    `;
    for(const allocation of body.allocations)await tx.$executeRaw`
      INSERT INTO "SupplierPaymentAllocation" ("id","companyId","settlementId","purchaseDocumentId","amount")
      VALUES (${crypto.randomUUID()},${req.user.companyId},${settlementId},${allocation.purchaseDocumentId},${allocation.amount})
    `;
    if(bankAccount)await tx.$executeRaw`
      INSERT INTO "BankLedgerEntry" ("id","companyId","storeId","bankAccountId","type","amount","status","sourceTransactionId","attachmentData","attachmentMimeType","attachmentFilename","occurredAt","createdBy","createdByName")
      VALUES (${crypto.randomUUID()},${req.user.companyId},${store.id},${bankAccount.id},${body.paymentMethod},${-total},'PENDING_REVIEW',${transactionId},${attachment.dataUrl},${attachment.mimeType},${attachment.filename},${body.paidAt},${req.user.id},${actorName})
    `;
    return {transaction:normalize(transaction[0]),supplier:suppliers[0],settlementId,bankAccount};
  });
  res.status(201).json({...result,paymentSource,status:"PENDING_REVIEW",total});
}));

function requireSuperAdminSettlementReview(req,res,next){
  const superAdmin=req.user?.role==="SUPER_ADMIN"||req.user?.platformRole==="SUPER_ADMIN"||req.user?.isSuperAdmin===true;
  if(!superAdmin)return res.status(403).json({error:"Ο έλεγχος πληρωμών προμηθευτών είναι διαθέσιμος μόνο στον Super Admin."});
  next();
}

router.get("/stores/:storeId/bank-ledger",route(async(req,res)=>{
  assertStoreAccess(req,req.params.storeId);
  const store=await ownedStore(req.params.storeId,req.user.companyId);
  const accounts=await prisma.$queryRaw`
    SELECT a."id",a."name",a."bankName",a."ibanMasked",
      COALESCE(SUM(CASE WHEN e."status"='CONFIRMED' THEN e."amount" ELSE 0 END),0) AS "availableBalance",
      COALESCE(SUM(CASE WHEN e."status" IN ('PENDING_PROOF','PENDING_REVIEW','DISCREPANCY') THEN e."amount" ELSE 0 END),0) AS "pendingAmount"
    FROM "BankAccount" a LEFT JOIN "BankLedgerEntry" e ON e."bankAccountId"=a."id" AND e."companyId"=a."companyId"
    WHERE a."companyId"=${req.user.companyId} AND a."storeId"=${store.id} AND a."name"='Ταμείο Τράπεζας' AND a."active"=true
    GROUP BY a."id" ORDER BY a."name"`;
  const entries=await prisma.$queryRaw`SELECT e."id",e."bankAccountId",e."type",e."amount",e."status",e."occurredAt",e."attachmentFilename",e."createdByName",a."name" AS "accountName",a."bankName" FROM "BankLedgerEntry" e JOIN "BankAccount" a ON a."id"=e."bankAccountId" WHERE e."companyId"=${req.user.companyId} AND e."storeId"=${store.id} ORDER BY e."occurredAt" DESC LIMIT 100`;
  res.json({accounts:accounts.map(row=>({...row,availableBalance:Number(row.availableBalance||0),pendingAmount:Number(row.pendingAmount||0)})),entries:entries.map(row=>({...row,amount:Number(row.amount||0)}))});
}));

router.get("/stores/:storeId/bank-deposits/pending-proof",route(async(req,res)=>{
  assertStoreAccess(req,req.params.storeId);
  const store=await ownedStore(req.params.storeId,req.user.companyId);
  const rows=await prisma.$queryRaw`SELECT e."id",e."amount",e."occurredAt",e."createdByName",a."name" AS "accountName",a."bankName" FROM "BankLedgerEntry" e JOIN "BankAccount" a ON a."id"=e."bankAccountId" WHERE e."companyId"=${req.user.companyId} AND e."storeId"=${store.id} AND e."status"='PENDING_PROOF' ORDER BY e."occurredAt" ASC`;
  res.json({items:rows.map(row=>({...row,amount:Number(row.amount||0)}))});
}));

router.post("/bank-ledger/:entryId/attachment",route(async(req,res)=>{
  const body=z.object({attachment:z.object({dataUrl:z.string().max(1800000),filename:z.string().trim().min(1).max(180)})}).parse(req.body||{});
  const attachment=parseAttachment(body.attachment);
  const rows=await prisma.$transaction(async tx=>{
    const found=await tx.$queryRaw`SELECT "id","storeId","companyId" FROM "BankLedgerEntry" WHERE "id"=${req.params.entryId} AND "companyId"=${req.user.companyId} LIMIT 1`;
    if(!found[0])return [];
    assertStoreAccess(req,found[0].storeId);
    return tx.$queryRaw`UPDATE "BankLedgerEntry" SET "attachmentData"=${attachment.dataUrl},"attachmentMimeType"=${attachment.mimeType},"attachmentFilename"=${attachment.filename},"status"='PENDING_REVIEW' WHERE "id"=${found[0].id} AND "status"='PENDING_PROOF' RETURNING "id","status"`;
  });
  if(!rows[0])return res.status(409).json({error:"Η απόδειξη έχει ήδη ανέβει ή η κίνηση δεν είναι πλέον σε αναμονή."});
  res.json({ok:true,status:rows[0].status});
}));

router.get("/bank-ledger/summary",requireSuperAdminSettlementReview,route(async(req,res)=>{
  const rows=await prisma.$queryRaw`
    SELECT c."name" AS "companyName",s."name" AS "storeName",a."id" AS "bankAccountId",a."bankName",a."name" AS "accountName",
      COALESCE(SUM(CASE WHEN e."status"='CONFIRMED' THEN e."amount" ELSE 0 END),0) AS "availableBalance",
      COALESCE(SUM(CASE WHEN e."status" IN ('PENDING_PROOF','PENDING_REVIEW','DISCREPANCY') THEN e."amount" ELSE 0 END),0) AS "pendingAmount"
    FROM "BankAccount" a JOIN "Company" c ON c."id"=a."companyId" JOIN "Store" s ON s."id"=a."storeId"
    LEFT JOIN "BankLedgerEntry" e ON e."bankAccountId"=a."id" AND e."companyId"=a."companyId"
    WHERE a."active"=true AND a."name"='Ταμείο Τράπεζας' GROUP BY c."name",s."name",a."id" ORDER BY c."name",s."name"`;
  const totals=rows.reduce((sum,row)=>({availableBalance:sum.availableBalance+Number(row.availableBalance||0),pendingAmount:sum.pendingAmount+Number(row.pendingAmount||0)}),{availableBalance:0,pendingAmount:0});
  res.json({items:rows.map(row=>({...row,availableBalance:Number(row.availableBalance||0),pendingAmount:Number(row.pendingAmount||0)})),totals});
}));

router.get("/bank-ledger/review",requireSuperAdminSettlementReview,route(async(req,res)=>{
  const rows=await prisma.$queryRaw`SELECT e."id",e."companyId",e."storeId",e."bankAccountId",e."type",e."amount",e."status",e."occurredAt",e."attachmentFilename",e."createdByName",a."name" AS "accountName",a."bankName",s."name" AS "storeName",c."name" AS "companyName" FROM "BankLedgerEntry" e JOIN "BankAccount" a ON a."id"=e."bankAccountId" JOIN "Store" s ON s."id"=e."storeId" JOIN "Company" c ON c."id"=e."companyId" WHERE e."status" IN ('PENDING_PROOF','PENDING_REVIEW','DISCREPANCY') ORDER BY e."createdAt" ASC LIMIT 500`;
  res.json({items:rows.map(row=>({...row,amount:Number(row.amount||0)}))});
}));

router.post("/bank-ledger/:entryId/review",requireSuperAdminSettlementReview,route(async(req,res)=>{
  const body=z.object({status:z.enum(["CONFIRMED","DISCREPANCY","CANCELLED"]),note:z.string().trim().min(3).max(500)}).parse(req.body||{});
  const rows=await prisma.$transaction(async tx=>{
    const updated=await tx.$queryRaw`UPDATE "BankLedgerEntry" SET "status"=${body.status},"reviewedBy"=${req.user.id},"reviewedAt"=NOW(),"reviewNote"=${body.note} WHERE "id"=${req.params.entryId} AND "status" IN ('PENDING_PROOF','PENDING_REVIEW','DISCREPANCY') RETURNING *`;
    if(updated[0])await tx.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "StoreOperatorAudit" ("id" TEXT PRIMARY KEY,"companyId" TEXT NOT NULL,"storeId" TEXT NOT NULL,"operatorId" TEXT,"actorId" TEXT NOT NULL,"eventType" TEXT NOT NULL,"details" JSONB NOT NULL DEFAULT '{}'::jsonb,"createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
    if(updated[0])await tx.$executeRaw`INSERT INTO "StoreOperatorAudit" ("id","companyId","storeId","actorId","eventType","details") VALUES (${crypto.randomUUID()},${updated[0].companyId},${updated[0].storeId},${req.user.id},${`BANK_LEDGER_${body.status}`},${JSON.stringify({bankLedgerEntryId:updated[0].id,status:body.status,note:body.note})}::jsonb)`;
    return updated;
  });
  if(!rows[0])return res.status(409).json({error:"Η τραπεζική κίνηση έχει ήδη ελεγχθεί ή δεν βρέθηκε."});
  res.json({ok:true,status:rows[0].status});
}));

router.get("/supplier-settlements/review",requireSuperAdminSettlementReview,route(async(req,res)=>{
  const filters=z.object({
    companyId:z.string().trim().max(180).optional().default(""),
    storeId:z.string().trim().max(180).optional().default(""),
    from:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    to:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
  }).parse(req.query||{});
  if(filters.from&&filters.to&&filters.from>filters.to)return res.status(400).json({error:"Η ημερομηνία «Από» δεν μπορεί να είναι μετά την «Έως»."});
  const rows=await prisma.$queryRaw`
    SELECT ss."id",ss."status",ss."paymentMethod",ss."paidAt",ss."note",ss."createdAt",ss."createdByName",
           t."id" AS "transactionId",t."amount",t."attachmentFilename",t."occurredAt",s."name" AS "supplierName",st."name" AS "storeName",c."name" AS "companyName",owner."fullName" AS "ownerName",
           COALESCE(json_agg(json_build_object('purchaseDocumentId',a."purchaseDocumentId",'amount',a."amount",'documentNumber',p."documentNumber") ORDER BY p."documentDate") FILTER (WHERE a."id" IS NOT NULL),'[]'::json) AS allocations
    FROM "SupplierPaymentSettlement" ss
    JOIN "StoreTransaction" t ON t."id"=ss."transactionId" AND t."companyId"=ss."companyId"
    JOIN "Supplier" s ON s."id"=ss."supplierId" AND s."companyId"=ss."companyId"
    JOIN "Store" st ON st."id"=ss."storeId" AND st."companyId"=ss."companyId"
    JOIN "Company" c ON c."id"=ss."companyId"
    LEFT JOIN LATERAL (SELECT u."fullName" FROM "User" u WHERE u."companyId"=c."id" AND u."role"='OWNER' ORDER BY u."createdAt" ASC LIMIT 1) owner ON TRUE
    LEFT JOIN "SupplierPaymentAllocation" a ON a."settlementId"=ss."id" AND a."companyId"=ss."companyId"
    LEFT JOIN "PurchaseDocument" p ON p."id"=a."purchaseDocumentId" AND p."companyId"=ss."companyId"
    WHERE ss."status" IN ('PENDING_REVIEW','DISCREPANCY')
      AND (${filters.companyId}='' OR ss."companyId"=${filters.companyId})
      AND (${filters.storeId}='' OR ss."storeId"=${filters.storeId})
      AND (${filters.from||null}::date IS NULL OR ss."paidAt">=${filters.from||null}::date)
      AND (${filters.to||null}::date IS NULL OR ss."paidAt"<(${filters.to||null}::date+INTERVAL '1 day'))
    GROUP BY ss."id",t."id",s."name",st."name",c."name",owner."fullName" ORDER BY ss."createdAt" ASC LIMIT 500
  `;
  const companies=await prisma.$queryRaw`
    SELECT c."id",c."name",owner."fullName" AS "ownerName"
    FROM "Company" c
    LEFT JOIN LATERAL (SELECT u."fullName" FROM "User" u WHERE u."companyId"=c."id" AND u."role"='OWNER' ORDER BY u."createdAt" ASC LIMIT 1) owner ON TRUE
    ORDER BY c."name"
  `;
  const stores=await prisma.$queryRaw`SELECT "id","companyId","name" FROM "Store" ORDER BY "name"`;
  res.json({items:rows.map(row=>({...row,amount:Number(row.amount||0)})),companies,stores});
}));

router.post("/supplier-settlements/:settlementId/review",requireSuperAdminSettlementReview,route(async(req,res)=>{
  const body=z.object({status:z.enum(["CONFIRMED","DISCREPANCY","CANCELLED"]),note:z.string().trim().min(3).max(500)}).parse(req.body||{});
  const rows=await prisma.$transaction(async tx=>{
    const updated=await tx.$queryRaw`
      UPDATE "SupplierPaymentSettlement" SET "status"=${body.status},"reviewedBy"=${req.user.id},"reviewedAt"=NOW(),"reviewNote"=${body.note}
      WHERE "id"=${req.params.settlementId} AND "status" IN ('PENDING_REVIEW','DISCREPANCY') RETURNING *
    `;
    if(!updated[0])return updated;
    await tx.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "StoreOperatorAudit" ("id" TEXT PRIMARY KEY,"companyId" TEXT NOT NULL,"storeId" TEXT NOT NULL,"operatorId" TEXT,"actorId" TEXT NOT NULL,"eventType" TEXT NOT NULL,"details" JSONB NOT NULL DEFAULT '{}'::jsonb,"createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
    await tx.$executeRaw`
      INSERT INTO "StoreOperatorAudit" ("id","companyId","storeId","operatorId","actorId","eventType","details")
      VALUES (${crypto.randomUUID()},${updated[0].companyId},${updated[0].storeId},${req.user.operatorId||req.user.id},${req.user.id},${`SUPPLIER_SETTLEMENT_${body.status}`},${JSON.stringify({settlementId:updated[0].id,transactionId:updated[0].transactionId,supplierId:updated[0].supplierId,status:body.status,note:body.note})}::jsonb)
    `;
    return updated;
  });
  if(!rows[0])return res.status(409).json({error:"Η πληρωμή έχει ήδη ελεγχθεί ή δεν βρέθηκε."});
  res.json({ok:true,status:rows[0].status});
}));

router.get("/other-expenses/review",requireSuperAdminSettlementReview,route(async(req,res)=>{
  const filters=z.object({companyId:z.string().trim().max(180).optional().default(""),storeId:z.string().trim().max(180).optional().default(""),from:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),to:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()}).parse(req.query||{});
  if(filters.from&&filters.to&&filters.from>filters.to)return res.status(400).json({error:"Η ημερομηνία «Από» δεν μπορεί να είναι μετά την «Έως»."});
  const items=await prisma.$queryRaw`
    SELECT er."id",er."status",er."createdAt",t."id" AS "transactionId",t."amount",t."description",t."paymentMethod",t."attachmentFilename",t."attachmentData" IS NOT NULL AS "hasAttachment",t."occurredAt",t."actorName",st."name" AS "storeName",c."name" AS "companyName",owner."fullName" AS "ownerName"
    FROM "OtherExpenseReview" er
    JOIN "StoreTransaction" t ON t."id"=er."transactionId" AND t."companyId"=er."companyId" AND t."reversedAt" IS NULL
    JOIN "Store" st ON st."id"=er."storeId" AND st."companyId"=er."companyId"
    JOIN "Company" c ON c."id"=er."companyId"
    LEFT JOIN LATERAL (SELECT u."fullName" FROM "User" u WHERE u."companyId"=c."id" AND u."role"='OWNER' ORDER BY u."createdAt" ASC LIMIT 1) owner ON TRUE
    WHERE er."status" IN ('PENDING_REVIEW','DISCREPANCY')
      AND (${filters.companyId}='' OR er."companyId"=${filters.companyId})
      AND (${filters.storeId}='' OR er."storeId"=${filters.storeId})
      AND (${filters.from||null}::date IS NULL OR t."occurredAt">=${filters.from||null}::date)
      AND (${filters.to||null}::date IS NULL OR t."occurredAt"<(${filters.to||null}::date+INTERVAL '1 day'))
    ORDER BY er."createdAt" ASC LIMIT 500
  `;
  const companies=await prisma.$queryRaw`SELECT c."id",c."name",owner."fullName" AS "ownerName" FROM "Company" c LEFT JOIN LATERAL (SELECT u."fullName" FROM "User" u WHERE u."companyId"=c."id" AND u."role"='OWNER' ORDER BY u."createdAt" ASC LIMIT 1) owner ON TRUE ORDER BY c."name"`;
  const stores=await prisma.$queryRaw`SELECT "id","companyId","name" FROM "Store" ORDER BY "name"`;
  res.json({items:items.map(item=>({...item,amount:Number(item.amount||0),hasAttachment:Boolean(item.hasAttachment)})),companies,stores});
}));

router.post("/other-expenses/:reviewId/review",requireSuperAdminSettlementReview,route(async(req,res)=>{
  const body=z.object({status:z.enum(["CONFIRMED","DISCREPANCY"]),note:z.string().trim().min(3).max(500)}).parse(req.body||{});
  const rows=await prisma.$transaction(async tx=>{
    const updated=await tx.$queryRaw`UPDATE "OtherExpenseReview" SET "status"=${body.status},"reviewedBy"=${req.user.id},"reviewedAt"=NOW(),"reviewNote"=${body.note} WHERE "id"=${req.params.reviewId} AND "status" IN ('PENDING_REVIEW','DISCREPANCY') RETURNING *`;
    if(!updated[0])return updated;
    await tx.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "StoreOperatorAudit" ("id" TEXT PRIMARY KEY,"companyId" TEXT NOT NULL,"storeId" TEXT NOT NULL,"operatorId" TEXT,"actorId" TEXT NOT NULL,"eventType" TEXT NOT NULL,"details" JSONB NOT NULL DEFAULT '{}'::jsonb,"createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
    await tx.$executeRaw`INSERT INTO "StoreOperatorAudit" ("id","companyId","storeId","operatorId","actorId","eventType","details") VALUES (${crypto.randomUUID()},${updated[0].companyId},${updated[0].storeId},${req.user.operatorId||req.user.id},${req.user.id},${`OTHER_EXPENSE_${body.status}`},${JSON.stringify({otherExpenseReviewId:updated[0].id,transactionId:updated[0].transactionId,status:body.status,note:body.note})}::jsonb)`;
    return updated;
  });
  if(!rows[0])return res.status(409).json({error:"Το έξοδο έχει ήδη ελεγχθεί ή δεν βρέθηκε."});
  res.json({ok:true,status:rows[0].status});
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
  if(body.type==="OTHER_EXPENSE")await prisma.$executeRaw`
    INSERT INTO "OtherExpenseReview" ("id","companyId","storeId","transactionId")
    VALUES (${crypto.randomUUID()},${req.user.companyId},${store.id},${transaction.id})
    ON CONFLICT ("transactionId") DO NOTHING
  `;
  if(body.type==="OTHER_EXPENSE"&&["CORPORATE_CARD","BANK_TRANSFER"].includes(selectedPaymentMethod)&&!transaction.reversedAt)await prisma.$transaction(async tx=>{
    const account=await virtualBankAccount(tx,{companyId:req.user.companyId,storeId:store.id,userId:req.user.id});
    await tx.$executeRaw`
      INSERT INTO "BankLedgerEntry" ("id","companyId","storeId","bankAccountId","type","amount","status","sourceTransactionId","attachmentData","attachmentMimeType","attachmentFilename","occurredAt","createdBy","createdByName")
      VALUES (${crypto.randomUUID()},${req.user.companyId},${store.id},${account.id},${selectedPaymentMethod},${-Math.abs(Number(transaction.amount||0))},'PENDING_REVIEW',${transaction.id},${legacyAttachment?.dataUrl||null},${legacyAttachment?.mimeType||null},${legacyAttachment?.filename||null},${transaction.occurredAt||new Date()},${req.user.id},${actorName})
      ON CONFLICT ("sourceTransactionId") DO NOTHING
    `;
  });
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
