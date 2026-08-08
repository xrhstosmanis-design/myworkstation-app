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
      return res.status(error?.status||500).json({error:error?.message||"Σφάλμα στις συναλλαγές βάρδιας."});
    }
  };
}

function requireLedgerAccess(req,res,next){
  const backoffice=["OWNER","ADMIN","MANAGER"].includes(req.user?.role);
  const permissions=req.user?.permissions||[];
  const operator=req.user?.tokenType==="STORE_OPERATOR"&&(permissions.includes("STORE_LEDGER")||permissions.includes("CASH_CONTROL"));
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
    cashSales:sum("SALE_CASH"),
    cardSales:sum("SALE_CARD"),
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
  type:z.enum(["SALE_CASH","SALE_CARD","SUPPLIER_PAYMENT","OTHER_EXPENSE","PERCENTAGES"]),
  amount:z.coerce.number().finite().positive().max(999999999),
  description:z.string().trim().max(500).optional().nullable(),
  supplierName:z.string().trim().max(180).optional().nullable(),
  supplierId:z.string().optional().nullable(),
  subtractFromShift:z.coerce.boolean().optional().default(false),
  attachment:z.object({dataUrl:z.string().max(1800000),filename:z.string().trim().min(1).max(180)}).optional().nullable()
});

function parseAttachment(attachment){
  if(!attachment)return null;
  const match=/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(attachment.dataUrl);
  if(!match){const error=new Error("Η φωτογραφία πρέπει να είναι JPEG, PNG ή WEBP.");error.status=400;throw error}
  const bytes=Buffer.from(match[2],"base64");
  if(bytes.length<100||bytes.length>1200000){const error=new Error("Η φωτογραφία πρέπει να είναι έως 1,2 MB.");error.status=400;throw error}
  return {dataUrl:attachment.dataUrl,mimeType:match[1],filename:attachment.filename,checksum:crypto.createHash("sha256").update(bytes).digest("hex")};
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

router.use(auth,requireLedgerAccess);

router.get("/stores/:storeId/overview",route(async(req,res)=>{
  assertStoreAccess(req,req.params.storeId);
  const store=await ownedStore(req.params.storeId,req.user.companyId);
  const openRows=await prisma.$queryRaw`
    SELECT "id","shiftLabel","openedAt","openedByName"
    FROM "CashShiftSession"
    WHERE "storeId"=${store.id} AND "companyId"=${req.user.companyId} AND "status"='OPEN'
    ORDER BY "openedAt" DESC LIMIT 1
  `;
  const openSession=openRows[0]||null;
  const recentRows=await prisma.$queryRaw`
    SELECT "id","companyId","storeId","sessionId","type","amount","description","supplierName","subtractFromShift","actorId","actorName","occurredAt","reversedAt","reversedBy","reversedByName","reversalReason",
           ("attachmentData" IS NOT NULL) AS "hasAttachment","attachmentFilename"
    FROM "StoreTransaction"
    WHERE "storeId"=${store.id} AND "companyId"=${req.user.companyId}
      AND (${req.user.tokenType!=="STORE_OPERATOR"} OR "actorId"=${req.user.id})
    ORDER BY "occurredAt" DESC LIMIT 80
  `;
  const recent=recentRows.map(normalize);
  const suppliers=await prisma.$queryRaw`SELECT "id","name","taxId" FROM "Supplier" WHERE "companyId"=${req.user.companyId} AND "active"=true ORDER BY "name"`;
  const sessionRows=openSession?(await prisma.$queryRaw`
    SELECT "type","amount","subtractFromShift","reversedAt"
    FROM "StoreTransaction"
    WHERE "sessionId"=${openSession.id} AND "storeId"=${store.id} AND "companyId"=${req.user.companyId}
  `).map(normalize):[];
  res.json({
    store:{id:store.id,name:store.name},
    openSession,
    summary:totals(sessionRows),
    suppliers,
    recent
  });
}));

router.post("/stores/:storeId",route(async(req,res)=>{
  assertStoreAccess(req,req.params.storeId);
  const store=await ownedStore(req.params.storeId,req.user.companyId);
  const body=transactionSchema.parse(req.body||{});
  let supplierName=body.supplierName||null;
  if(body.type==="SUPPLIER_PAYMENT"){const rows=body.supplierId?await prisma.$queryRaw`SELECT "id","name" FROM "Supplier" WHERE "id"=${body.supplierId} AND "companyId"=${req.user.companyId} AND "active"=true LIMIT 1`:[];if(body.supplierId&&!rows[0])return res.status(404).json({error:"Δεν βρέθηκε ο προμηθευτής."});supplierName=rows[0]?.name||supplierName;if(!supplierName)return res.status(400).json({error:"Επίλεξε τον προμηθευτή της πληρωμής."})}
  const needsPhoto=body.type==="SUPPLIER_PAYMENT"||body.type==="OTHER_EXPENSE";
  if(needsPhoto&&!body.attachment)return res.status(400).json({error:"Η φωτογραφία παραστατικού είναι υποχρεωτική για αυτή την καταχώριση."});
  const attachment=parseAttachment(body.attachment);
  const actorName=req.user.fullName||"Χρήστης";
  const rows=await prisma.$queryRaw`
    INSERT INTO "StoreTransaction" (
      "id","companyId","storeId","sessionId","type","amount","description","supplierId","supplierName","subtractFromShift","actorId","actorName","attachmentData","attachmentMimeType","attachmentFilename","attachmentChecksum"
    )
    SELECT
      ${crypto.randomUUID()},${req.user.companyId},${store.id},shift."id",${body.type},${body.amount},
      ${body.description||null},${body.supplierId||null},${supplierName},${needsPhoto&&body.subtractFromShift},${req.user.id},${actorName},${attachment?.dataUrl||null},${attachment?.mimeType||null},${attachment?.filename||null},${attachment?.checksum||null}
    FROM "CashShiftSession" shift
    WHERE shift."storeId"=${store.id}
      AND shift."companyId"=${req.user.companyId}
      AND shift."status"='OPEN'
    ORDER BY shift."openedAt" DESC
    LIMIT 1
    RETURNING *
  `;
  if(!rows[0])return res.status(409).json({error:"Η βάρδια έχει κλείσει ή δεν είναι πλέον ενεργή. Η συναλλαγή δεν αποθηκεύτηκε."});
  const transaction=normalize(rows[0]);
  const emailNotification=body.type==="PERCENTAGES"?await notifyLedgerAlert({companyId:req.user.companyId,store,kind:"PERCENTAGES",transaction,actorName}):null;
  res.status(201).json({...transaction,emailNotification});
}));

router.get("/:transactionId/attachment",route(async(req,res)=>{
  const rows=await prisma.$queryRaw`
    SELECT "storeId","actorId","attachmentData","attachmentMimeType","attachmentFilename"
    FROM "StoreTransaction" WHERE "id"=${req.params.transactionId} AND "companyId"=${req.user.companyId} LIMIT 1
  `;
  const row=rows[0];
  if(!row)return res.status(404).json({error:"Δεν βρέθηκε συναλλαγή."});
  assertStoreAccess(req,row.storeId);
  if(req.user.tokenType==="STORE_OPERATOR"&&row.actorId!==req.user.id)return res.status(403).json({error:"Μπορείς να δεις μόνο τα δικά σου παραστατικά."});
  if(!row.attachmentData)return res.status(404).json({error:"Δεν υπάρχει φωτογραφία παραστατικού."});
  res.json({dataUrl:row.attachmentData,mimeType:row.attachmentMimeType,filename:row.attachmentFilename});
}));

router.post("/:transactionId/reverse",route(async(req,res)=>{
  const canReverse=["OWNER","ADMIN","MANAGER"].includes(req.user?.role);
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
