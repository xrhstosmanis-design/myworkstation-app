import { Router } from "express";
import crypto from "crypto";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { auth } from "../middleware/auth.js";

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
  `CREATE TABLE IF NOT EXISTS "StoreTransaction" (
    "id" TEXT PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "sessionId" TEXT,
    "type" TEXT NOT NULL,
    "amount" NUMERIC(14,2) NOT NULL,
    "description" TEXT,
    "supplierName" TEXT,
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
   ON "StoreTransaction" ("sessionId","occurredAt" DESC)`
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
  const operator=req.user?.tokenType==="STORE_OPERATOR"&&req.user?.permissions?.includes("STORE_LEDGER");
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
  return {...row,amount:Number(row.amount||0)};
}
function totals(rows){
  const active=rows.filter(row=>!row.reversedAt);
  const sum=type=>active.filter(row=>row.type===type).reduce((total,row)=>total+Number(row.amount||0),0);
  const supplierPayments=sum("SUPPLIER_PAYMENT");
  const otherExpenses=sum("OTHER_EXPENSE");
  return {
    cashSales:sum("SALE_CASH"),
    cardSales:sum("SALE_CARD"),
    supplierPayments,
    otherExpenses,
    expensesTotal:supplierPayments+otherExpenses,
    cashTransfers:sum("CASH_TRANSFER"),
    count:active.length
  };
}

const transactionSchema=z.object({
  type:z.enum(["SALE_CASH","SALE_CARD","SUPPLIER_PAYMENT","OTHER_EXPENSE","CASH_TRANSFER"]),
  amount:z.coerce.number().finite().positive().max(999999999),
  description:z.string().trim().max(500).optional().nullable(),
  supplierName:z.string().trim().max(180).optional().nullable()
});

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
    SELECT * FROM "StoreTransaction"
    WHERE "storeId"=${store.id} AND "companyId"=${req.user.companyId}
    ORDER BY "occurredAt" DESC LIMIT 80
  `;
  const recent=recentRows.map(normalize);
  const sessionRows=openSession?recent.filter(row=>row.sessionId===openSession.id):[];
  res.json({
    store:{id:store.id,name:store.name},
    openSession,
    summary:totals(sessionRows),
    recent
  });
}));

router.post("/stores/:storeId",route(async(req,res)=>{
  assertStoreAccess(req,req.params.storeId);
  const store=await ownedStore(req.params.storeId,req.user.companyId);
  const body=transactionSchema.parse(req.body||{});
  if(body.type==="SUPPLIER_PAYMENT"&&!body.supplierName){
    return res.status(400).json({error:"Γράψε τον προμηθευτή της πληρωμής."});
  }
  const openRows=await prisma.$queryRaw`
    SELECT "id" FROM "CashShiftSession"
    WHERE "storeId"=${store.id} AND "companyId"=${req.user.companyId} AND "status"='OPEN'
    ORDER BY "openedAt" DESC LIMIT 1
  `;
  const session=openRows[0];
  if(!session)return res.status(409).json({error:"Άνοιξε πρώτα τη βάρδια στον Έλεγχο Ταμείου."});
  const actorName=req.user.fullName||"Χρήστης";
  const rows=await prisma.$queryRaw`
    INSERT INTO "StoreTransaction" (
      "id","companyId","storeId","sessionId","type","amount","description","supplierName","actorId","actorName"
    ) VALUES (
      ${crypto.randomUUID()},${req.user.companyId},${store.id},${session.id},${body.type},${body.amount},
      ${body.description||null},${body.supplierName||null},${req.user.id},${actorName}
    ) RETURNING *
  `;
  res.status(201).json(normalize(rows[0]));
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
    UPDATE "StoreTransaction"
    SET "reversedAt"=NOW(),"reversedBy"=${req.user.id},"reversedByName"=${actorName},"reversalReason"=${body.reason}
    WHERE "id"=${transaction.id} RETURNING *
  `;
  res.json(normalize(rows[0]));
}));

export default router;
