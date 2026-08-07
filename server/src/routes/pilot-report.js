import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { auth } from "../middleware/auth.js";

const router=Router();
let tablesPromise;

const tableStatements=[
  `CREATE TABLE IF NOT EXISTS "CashShiftSession" (
    "id" TEXT PRIMARY KEY,"companyId" TEXT NOT NULL,"storeId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',"shiftLabel" TEXT NOT NULL DEFAULT 'Βάρδια',
    "openedBy" TEXT NOT NULL,"openedByName" TEXT,"openedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "openingDrawer" NUMERIC(14,2) NOT NULL DEFAULT 0,"openingCustody" NUMERIC(14,2) NOT NULL DEFAULT 0,
    "openingCoins" NUMERIC(14,2) NOT NULL DEFAULT 0,"openingSafe" NUMERIC(14,2) NOT NULL DEFAULT 0,
    "openingOperational" NUMERIC(14,2) NOT NULL DEFAULT 0,"openingNote" TEXT,"closedBy" TEXT,
    "closedByName" TEXT,"closedAt" TIMESTAMPTZ,"cashSales" NUMERIC(14,2) NOT NULL DEFAULT 0,
    "cardSales" NUMERIC(14,2) NOT NULL DEFAULT 0,"expenses" NUMERIC(14,2) NOT NULL DEFAULT 0,
    "closingDrawer" NUMERIC(14,2),"closingCustody" NUMERIC(14,2),"closingCoins" NUMERIC(14,2),
    "closingSafe" NUMERIC(14,2),"expectedOperational" NUMERIC(14,2),"actualOperational" NUMERIC(14,2),
    "variance" NUMERIC(14,2),"nextOpeningTotal" NUMERIC(14,2),"closingNote" TEXT,
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `ALTER TABLE "CashShiftSession" ADD COLUMN IF NOT EXISTS "openedByName" TEXT`,
  `ALTER TABLE "CashShiftSession" ADD COLUMN IF NOT EXISTS "closedByName" TEXT`,
  `CREATE TABLE IF NOT EXISTS "StoreTransaction" (
    "id" TEXT PRIMARY KEY,"companyId" TEXT NOT NULL,"storeId" TEXT NOT NULL,"sessionId" TEXT,
    "type" TEXT NOT NULL,"amount" NUMERIC(14,2) NOT NULL,"description" TEXT,"supplierName" TEXT,
    "actorId" TEXT NOT NULL,"actorName" TEXT NOT NULL,"occurredAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),"reversedAt" TIMESTAMPTZ,"reversedBy" TEXT,
    "reversedByName" TEXT,"reversalReason" TEXT
  )`
];

async function ensureTables(){
  if(!tablesPromise){
    tablesPromise=(async()=>{for(const sql of tableStatements)await prisma.$executeRawUnsafe(sql)})()
      .catch(error=>{tablesPromise=undefined;throw error});
  }
  return tablesPromise;
}
function requireManager(req,res,next){
  if(!["OWNER","ADMIN","MANAGER"].includes(req.user?.role))return res.status(403).json({error:"Απαιτείται δικαίωμα υπευθύνου ή διαχειριστή."});
  next();
}
function normalizeMoney(row,fields){
  const result={...row};
  for(const field of fields)result[field]=row[field]==null?null:Number(row[field]);
  return result;
}
function route(handler){
  return async(req,res)=>{
    try{await ensureTables();await handler(req,res)}
    catch(error){
      console.error("Pilot report:",error);
      if(error?.name==="ZodError")return res.status(400).json({error:"Μη έγκυρη ημερομηνία.",details:error.issues});
      return res.status(error?.status||500).json({error:error?.message||"Σφάλμα ημερήσιας αναφοράς."});
    }
  };
}

router.use(auth,requireManager);

router.get("/stores/:storeId/daily",route(async(req,res)=>{
  const query=z.object({date:z.string().regex(/^\d{4}-\d{2}-\d{2}$/)}).parse(req.query);
  const store=await prisma.store.findFirst({where:{id:req.params.storeId,companyId:req.user.companyId,active:true}});
  if(!store)return res.status(404).json({error:"Δεν βρέθηκε ενεργό κατάστημα."});

  const sessionsRaw=await prisma.$queryRaw`
    SELECT * FROM "CashShiftSession"
    WHERE "storeId"=${store.id} AND "companyId"=${req.user.companyId}
      AND (("openedAt" AT TIME ZONE 'Europe/Athens')::date=CAST(${query.date} AS date)
        OR ("closedAt" IS NOT NULL AND ("closedAt" AT TIME ZONE 'Europe/Athens')::date=CAST(${query.date} AS date)))
    ORDER BY "openedAt" ASC
  `;
  const transactionsRaw=await prisma.$queryRaw`
    SELECT * FROM "StoreTransaction"
    WHERE "storeId"=${store.id} AND "companyId"=${req.user.companyId}
      AND ("occurredAt" AT TIME ZONE 'Europe/Athens')::date=CAST(${query.date} AS date)
    ORDER BY "occurredAt" ASC
  `;

  const sessions=sessionsRaw.map(row=>normalizeMoney(row,[
    "openingDrawer","openingCustody","openingCoins","openingSafe","openingOperational",
    "cashSales","cardSales","expenses","closingDrawer","closingCustody","closingCoins",
    "closingSafe","expectedOperational","actualOperational","variance","nextOpeningTotal"
  ]));
  const transactions=transactionsRaw.map(row=>normalizeMoney(row,["amount"]));
  const activeTransactions=transactions.filter(row=>!row.reversedAt);
  const sumType=type=>activeTransactions.filter(row=>row.type===type).reduce((sum,row)=>sum+row.amount,0);
  const closed=sessions.filter(row=>row.status==="CLOSED");
  const operators=[...new Set([
    ...transactions.map(row=>row.actorName),
    ...sessions.flatMap(row=>[row.openedByName,row.closedByName])
  ].filter(Boolean))];
  const supplierPayments=sumType("SUPPLIER_PAYMENT");
  const otherExpenses=sumType("OTHER_EXPENSE");
  const summary={
    cashSales:sumType("SALE_CASH"),
    cardSales:sumType("SALE_CARD"),
    supplierPayments,
    otherExpenses,
    expensesTotal:supplierPayments+otherExpenses,
    percentages:sumType("PERCENTAGES"),
    transactionCount:activeTransactions.length,
    reversedCount:transactions.length-activeTransactions.length,
    sessionsOpened:sessions.length,
    sessionsClosed:closed.length,
    varianceTotal:closed.reduce((sum,row)=>sum+Number(row.variance||0),0),
    operators
  };
  res.json({store:{id:store.id,name:store.name},date:query.date,summary,sessions,transactions});
}));

export default router;
