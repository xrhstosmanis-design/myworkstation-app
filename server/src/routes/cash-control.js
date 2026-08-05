import { Router } from "express";
import crypto from "crypto";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { auth } from "../middleware/auth.js";

const router = Router();
let tablesPromise;

const tableStatements = [
  `CREATE TABLE IF NOT EXISTS "CashShiftSession" (
    "id" TEXT PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "shiftLabel" TEXT NOT NULL DEFAULT 'Βάρδια',
    "openedBy" TEXT NOT NULL,
    "openedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "openingDrawer" NUMERIC(14,2) NOT NULL DEFAULT 0,
    "openingCustody" NUMERIC(14,2) NOT NULL DEFAULT 0,
    "openingCoins" NUMERIC(14,2) NOT NULL DEFAULT 0,
    "openingSafe" NUMERIC(14,2) NOT NULL DEFAULT 0,
    "openingOperational" NUMERIC(14,2) NOT NULL DEFAULT 0,
    "openingNote" TEXT,
    "closedBy" TEXT,
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
  `CREATE UNIQUE INDEX IF NOT EXISTS "CashShiftSession_one_open_per_store_idx"
   ON "CashShiftSession" ("storeId") WHERE "status"='OPEN'`,
  `CREATE INDEX IF NOT EXISTS "CashShiftSession_store_opened_idx"
   ON "CashShiftSession" ("storeId", "openedAt" DESC)`
];

async function ensureTables(){
  if(!tablesPromise){
    tablesPromise=(async()=>{
      for(const sql of tableStatements) await prisma.$executeRawUnsafe(sql);
    })().catch(error=>{tablesPromise=undefined;throw error});
  }
  return tablesPromise;
}

function requireManager(req,res,next){
  if(!["OWNER","ADMIN","MANAGER"].includes(req.user?.role)){
    return res.status(403).json({error:"Απαιτείται δικαίωμα υπευθύνου, διαχειριστή ή ιδιοκτήτη."});
  }
  next();
}

async function ownedStore(storeId,companyId){
  const store=await prisma.store.findFirst({where:{id:storeId,companyId,active:true}});
  if(!store){
    const error=new Error("Δεν βρέθηκε ενεργό κατάστημα.");
    error.status=404;
    throw error;
  }
  return store;
}

const amount=z.coerce.number().finite().min(0).max(999999999).default(0);
const openSchema=z.object({
  shiftLabel:z.string().trim().min(2).max(80).default("Βάρδια"),
  drawer:amount,
  custody:amount,
  coins:amount,
  safe:amount,
  note:z.string().trim().max(1000).optional().nullable()
});
const closeSchema=z.object({
  cashSales:amount,
  cardSales:amount,
  expenses:amount,
  drawer:amount,
  custody:amount,
  coins:amount,
  safe:amount,
  note:z.string().trim().max(1000).optional().nullable()
});

function money(value){return Number(value||0)}
function normalize(row){
  if(!row)return null;
  const fields=[
    "openingDrawer","openingCustody","openingCoins","openingSafe","openingOperational",
    "cashSales","cardSales","expenses","closingDrawer","closingCustody","closingCoins",
    "closingSafe","expectedOperational","actualOperational","variance","nextOpeningTotal"
  ];
  const result={...row};
  for(const field of fields) result[field]=row[field]==null?null:money(row[field]);
  return result;
}

function route(handler){
  return async(req,res)=>{
    try{
      await ensureTables();
      await handler(req,res);
    }catch(error){
      console.error("Cash Control:",error);
      if(error?.name==="ZodError") return res.status(400).json({error:"Ελέγξτε τα ποσά και τα στοιχεία της φόρμας.",details:error.issues});
      if(error?.code==="P2010"||error?.code==="23505") return res.status(409).json({error:"Υπάρχει ήδη ανοιχτή βάρδια για το κατάστημα."});
      return res.status(error?.status||500).json({error:error?.message||"Σφάλμα στον Έλεγχο Ταμείου."});
    }
  };
}

router.use(auth,requireManager);

router.get("/stores/:storeId/overview",route(async(req,res)=>{
  const store=await ownedStore(req.params.storeId,req.user.companyId);
  const [openRows,recentRows,lastClosedRows]=await Promise.all([
    prisma.$queryRaw`
      SELECT * FROM "CashShiftSession"
      WHERE "storeId"=${store.id} AND "companyId"=${req.user.companyId} AND "status"='OPEN'
      ORDER BY "openedAt" DESC LIMIT 1
    `,
    prisma.$queryRaw`
      SELECT * FROM "CashShiftSession"
      WHERE "storeId"=${store.id} AND "companyId"=${req.user.companyId}
      ORDER BY "openedAt" DESC LIMIT 20
    `,
    prisma.$queryRaw`
      SELECT * FROM "CashShiftSession"
      WHERE "storeId"=${store.id} AND "companyId"=${req.user.companyId} AND "status"='CLOSED'
      ORDER BY "closedAt" DESC LIMIT 1
    `
  ]);
  const last=normalize(lastClosedRows[0]);
  res.json({
    store:{id:store.id,name:store.name},
    openSession:normalize(openRows[0]),
    recent:recentRows.map(normalize),
    suggestedOpening:last?{
      drawer:last.closingDrawer||0,
      custody:last.closingCustody||0,
      coins:last.closingCoins||0,
      safe:last.closingSafe||0,
      operational:last.nextOpeningTotal||0
    }:{drawer:0,custody:0,coins:0,safe:0,operational:0}
  });
}));

router.post("/stores/:storeId/sessions/open",route(async(req,res)=>{
  const store=await ownedStore(req.params.storeId,req.user.companyId);
  const body=openSchema.parse(req.body||{});
  const existing=await prisma.$queryRaw`
    SELECT "id" FROM "CashShiftSession"
    WHERE "storeId"=${store.id} AND "status"='OPEN' LIMIT 1
  `;
  if(existing[0]) return res.status(409).json({error:"Υπάρχει ήδη ανοιχτή βάρδια για το κατάστημα."});
  const operational=body.drawer+body.custody+body.coins;
  const rows=await prisma.$queryRaw`
    INSERT INTO "CashShiftSession" (
      "id","companyId","storeId","shiftLabel","openedBy",
      "openingDrawer","openingCustody","openingCoins","openingSafe","openingOperational","openingNote"
    ) VALUES (
      ${crypto.randomUUID()},${req.user.companyId},${store.id},${body.shiftLabel},${req.user.id},
      ${body.drawer},${body.custody},${body.coins},${body.safe},${operational},${body.note||null}
    ) RETURNING *
  `;
  res.status(201).json(normalize(rows[0]));
}));

router.post("/sessions/:sessionId/close",route(async(req,res)=>{
  const body=closeSchema.parse(req.body||{});
  const found=await prisma.$queryRaw`
    SELECT s.* FROM "CashShiftSession" s
    JOIN "Store" st ON st."id"=s."storeId"
    WHERE s."id"=${req.params.sessionId}
      AND s."companyId"=${req.user.companyId}
      AND st."companyId"=${req.user.companyId}
      AND s."status"='OPEN'
    LIMIT 1
  `;
  const session=normalize(found[0]);
  if(!session)return res.status(404).json({error:"Δεν βρέθηκε ανοιχτή βάρδια."});
  const expected=session.openingOperational+body.cashSales-body.expenses;
  const actual=body.drawer+body.custody+body.coins;
  const variance=actual-expected;
  const rows=await prisma.$queryRaw`
    UPDATE "CashShiftSession"
    SET "status"='CLOSED',"closedBy"=${req.user.id},"closedAt"=NOW(),
        "cashSales"=${body.cashSales},"cardSales"=${body.cardSales},"expenses"=${body.expenses},
        "closingDrawer"=${body.drawer},"closingCustody"=${body.custody},"closingCoins"=${body.coins},"closingSafe"=${body.safe},
        "expectedOperational"=${expected},"actualOperational"=${actual},"variance"=${variance},
        "nextOpeningTotal"=${actual},"closingNote"=${body.note||null},"updatedAt"=NOW()
    WHERE "id"=${session.id} RETURNING *
  `;
  res.json(normalize(rows[0]));
}));

export default router;
