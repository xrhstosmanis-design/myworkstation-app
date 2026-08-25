import { Router } from "express";
import crypto from "crypto";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { auth } from "../middleware/auth.js";
import { sendCashShiftClosedEmail } from "../services/mail.js";

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
    "openedByName" TEXT,
    "openedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "openingDrawer" NUMERIC(14,2) NOT NULL DEFAULT 0,
    "openingCustody" NUMERIC(14,2) NOT NULL DEFAULT 0,
    "openingCoins" NUMERIC(14,2) NOT NULL DEFAULT 0,
    "openingSafe" NUMERIC(14,2) NOT NULL DEFAULT 0,
    "openingOperational" NUMERIC(14,2) NOT NULL DEFAULT 0,
    "expectedOpeningOperational" NUMERIC(14,2) NOT NULL DEFAULT 0,
    "openingVariance" NUMERIC(14,2) NOT NULL DEFAULT 0,
    "openingNote" TEXT,
    "closedBy" TEXT,
    "closedByName" TEXT,
    "closedAt" TIMESTAMPTZ,
    "cashSales" NUMERIC(14,2) NOT NULL DEFAULT 0,
    "cardSales" NUMERIC(14,2) NOT NULL DEFAULT 0,
    "eftposTotal" NUMERIC(14,2) NOT NULL DEFAULT 0,
    "cardVariance" NUMERIC(14,2) NOT NULL DEFAULT 0,
    "duplicateReviewJson" JSONB NOT NULL DEFAULT '[]'::jsonb,
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
  `ALTER TABLE "CashShiftSession" ADD COLUMN IF NOT EXISTS "expectedOpeningOperational" NUMERIC(14,2) NOT NULL DEFAULT 0`,
  `ALTER TABLE "CashShiftSession" ADD COLUMN IF NOT EXISTS "openingVariance" NUMERIC(14,2) NOT NULL DEFAULT 0`,
  `ALTER TABLE "CashShiftSession" ADD COLUMN IF NOT EXISTS "eftposTotal" NUMERIC(14,2) NOT NULL DEFAULT 0`,
  `ALTER TABLE "CashShiftSession" ADD COLUMN IF NOT EXISTS "cardVariance" NUMERIC(14,2) NOT NULL DEFAULT 0`,
  `ALTER TABLE "CashShiftSession" ADD COLUMN IF NOT EXISTS "duplicateReviewJson" JSONB NOT NULL DEFAULT '[]'::jsonb`,
  `ALTER TABLE "CashShiftSession" ADD COLUMN IF NOT EXISTS "terminalPos" TEXT NOT NULL DEFAULT 'MAIN'`,
  `DROP INDEX IF EXISTS "CashShiftSession_one_open_per_store_idx"`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "CashShiftSession_one_open_per_terminal_idx" ON "CashShiftSession" ("storeId","terminalPos") WHERE "status"='OPEN'`,
  `CREATE INDEX IF NOT EXISTS "CashShiftSession_store_opened_idx" ON "CashShiftSession" ("storeId", "openedAt" DESC)`,
  `CREATE TABLE IF NOT EXISTS "StoreTransaction" (
    "id" TEXT PRIMARY KEY,"companyId" TEXT NOT NULL,"storeId" TEXT NOT NULL,"sessionId" TEXT,
    "type" TEXT NOT NULL,"amount" NUMERIC(14,2) NOT NULL,"description" TEXT,"supplierName" TEXT,
    "subtractFromShift" BOOLEAN NOT NULL DEFAULT false,"actorId" TEXT NOT NULL,"actorName" TEXT NOT NULL,
    "occurredAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),"createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "reversedAt" TIMESTAMPTZ,"reversedBy" TEXT,"reversedByName" TEXT,"reversalReason" TEXT
  )`,
  `ALTER TABLE "StoreTransaction" ADD COLUMN IF NOT EXISTS "subtractFromShift" BOOLEAN NOT NULL DEFAULT false`
];

async function ensureTables(){
  if(!tablesPromise){tablesPromise=(async()=>{for(const sql of tableStatements)await prisma.$executeRawUnsafe(sql)})().catch(error=>{tablesPromise=undefined;throw error})}
  return tablesPromise;
}

async function requireCashAccess(req,res,next){
  const backoffice=req.user?.tokenType!=="STORE_OPERATOR"&&["OWNER","ADMIN","MANAGER"].includes(req.user?.role);
  if(backoffice)return next();
  if(req.user?.tokenType!=="STORE_OPERATOR")return res.status(403).json({error:"Δεν έχεις δικαίωμα πρόσβασης στον Έλεγχο Ταμείου."});
  const permissions=req.user?.permissions||[],path=String(req.originalUrl||"").split("?")[0];
  if(req.method==="GET"&&/\/api\/(?:cash|cash-control)\/stores\/[^/]+\/overview$/.test(path)&&permissions.includes("CASH_OVERVIEW"))return next();
  if(req.method==="POST"&&/\/stores\/[^/]+\/sessions\/open$/.test(path)){
    if(permissions.includes("INITIAL_CASH"))return next();
    return res.status(403).json({error:"Δεν έχεις δικαίωμα «με αρχικό Ταμείο» από το BackOffice."});
  }
  if(req.method==="POST"&&/\/sessions\/[^/]+\/close$/.test(path)){
    const rows=await prisma.$queryRaw`
      SELECT COALESCE(p."permissions",'{}'::jsonb) AS "permissions"
      FROM "StoreOperatorCredential" c
      LEFT JOIN "StoreOperatorProfile" p
        ON p."companyId"=c."companyId" AND p."storeId"=c."storeId" AND p."employeeId"=c."employeeId"
      WHERE c."id"=${req.user.operatorId||req.user.id} AND c."companyId"=${req.user.companyId} AND c."active"=TRUE
      LIMIT 1
    `;
    const profile=rows[0]?.permissions&&typeof rows[0].permissions==="object"?rows[0].permissions:{};
    if(profile.closeShift===true)return next();
    return res.status(403).json({error:"Δεν έχεις δικαίωμα «Κλείσιμο βάρδιας (PoS)» από το BackOffice."});
  }
  if(permissions?.includes("CASH_CONTROL"))return next();
  return res.status(403).json({error:"Δεν έχεις δικαίωμα πρόσβασης στον Έλεγχο Ταμείου."});
}
function assertStoreAccess(req,storeId){if(req.user?.tokenType==="STORE_OPERATOR"&&req.user.storeId!==storeId){const error=new Error("Ο προσωπικός κωδικός ισχύει μόνο για το δικό σου κατάστημα.");error.status=403;throw error}}
async function ownedStore(storeId,companyId){const store=await prisma.store.findFirst({where:{id:storeId,companyId,active:true}});if(!store){const error=new Error("Δεν βρέθηκε ενεργό κατάστημα.");error.status=404;throw error}return store}
async function requestTerminal(req){
  if(req.user?.tokenType==="STORE_OPERATOR"){
    const liveTerminal=String(req.user?.terminalPos||"").trim();
    if(liveTerminal)return liveTerminal.toUpperCase().slice(0,120);
    const rows=await prisma.$queryRaw`SELECT COALESCE(NULLIF(TRIM(p."terminalPos"),''),'MAIN') AS "terminalPos" FROM "StoreOperatorProfile" p WHERE p."companyId"=${req.user.companyId} AND p."storeId"=${req.user.storeId} AND p."employeeId"=${req.user.employeeId} LIMIT 1`;
    return String(rows[0]?.terminalPos||rows[0]?.terminalpos||"MAIN").trim().toUpperCase().slice(0,120)||"MAIN";
  }
  return String(req.headers?.["x-mws-terminal-pos"]||"MAIN").trim().toUpperCase().slice(0,120)||"MAIN";
}

const amount=z.coerce.number().finite().min(0).max(999999999).default(0);
const openSchema=z.object({shiftLabel:z.string().trim().min(2).max(80).default("Βάρδια"),drawer:amount,custody:amount,coins:amount,safe:amount,note:z.string().trim().max(1000).optional().nullable()});
const closeSchema=z.object({cashSales:amount,cardSales:amount,eftposTotal:amount,expenses:amount,drawer:amount,custody:amount,coins:amount,safe:amount,note:z.string().trim().max(1000).optional().nullable()});

function money(value){return Number(value||0)}
function normalize(row){
  if(!row)return null;
  const fields=["openingDrawer","openingCustody","openingCoins","openingSafe","openingOperational","expectedOpeningOperational","openingVariance","cashSales","cardSales","eftposTotal","cardVariance","expenses","closingDrawer","closingCustody","closingCoins","closingSafe","expectedOperational","actualOperational","variance","nextOpeningTotal"];
  const result={...row};for(const field of fields)result[field]=row[field]==null?null:money(row[field]);result.duplicateReview=Array.isArray(row.duplicateReviewJson)?row.duplicateReviewJson:[];return result;
}

async function findConsecutiveDuplicateSales(db,companyId,storeId,from,to){
  const rows=await db.$queryRaw`
    SELECT s."id",s."occurredAt",s."total",l."productId",l."description",l."quantity",l."unitPrice",l."discount",l."lineTotal"
    FROM "Sale" s JOIN "SaleLine" l ON l."saleId"=s."id"
    WHERE s."companyId"=${companyId} AND s."storeId"=${storeId} AND s."status"='COMPLETED' AND s."occurredAt">=${from} AND s."occurredAt"<=${to}
    ORDER BY s."occurredAt",s."id",COALESCE(l."productId",''),l."description",l."id"`;
  const sales=[];for(const row of rows){let sale=sales[sales.length-1];if(!sale||sale.id!==row.id){sale={id:row.id,occurredAt:row.occurredAt,total:money(row.total),lines:[]};sales.push(sale)}sale.lines.push({productId:row.productId||null,description:row.description,quantity:money(row.quantity),unitPrice:money(row.unitPrice),discount:money(row.discount),lineTotal:money(row.lineTotal)})}
  const signature=sale=>JSON.stringify({total:sale.total,lines:sale.lines.map(line=>[line.productId||line.description,line.quantity,line.unitPrice,line.discount,line.lineTotal])}),matches=[];
  for(let index=1;index<sales.length;index++){const previous=sales[index-1],current=sales[index];if(signature(previous)!==signature(current))continue;matches.push({firstSaleId:previous.id,secondSaleId:current.id,firstAt:previous.occurredAt,secondAt:current.occurredAt,total:current.total,products:current.lines.map(line=>`${line.description} × ${line.quantity}`)})}
  return matches;
}

async function authoritativeShiftTotals(db,companyId,storeId,sessionId){
  const rows=await db.$queryRaw`
    SELECT COALESCE(SUM("amount") FILTER (WHERE "type"='SALE_CASH' AND "reversedAt" IS NULL),0) AS "cashSales",
      COALESCE(SUM("amount") FILTER (WHERE "type"='SALE_CARD' AND "reversedAt" IS NULL),0) AS "cardSales",
      COALESCE(SUM("amount") FILTER (WHERE "type"='TRANSFER_AMOUNT' AND "reversedAt" IS NULL),0) AS "transferIn",
      COALESCE(SUM("amount") FILTER (WHERE "type" IN ('SUPPLIER_PAYMENT','OTHER_EXPENSE') AND "subtractFromShift"=true AND "reversedAt" IS NULL),0) AS "expenses"
    FROM "StoreTransaction" WHERE "companyId"=${companyId} AND "storeId"=${storeId} AND "sessionId"=${sessionId}`;
  return {cashSales:money(rows[0]?.cashSales),cardSales:money(rows[0]?.cardSales),transferIn:money(rows[0]?.transferIn),expenses:money(rows[0]?.expenses)};
}
function route(handler){return async(req,res)=>{try{await ensureTables();await handler(req,res)}catch(error){console.error("Cash Control:",error);if(error?.name==="ZodError")return res.status(400).json({error:"Ελέγξτε τα ποσά και τα στοιχεία της φόρμας.",details:error.issues});if(error?.code==="P2010"||error?.code==="23505")return res.status(409).json({error:"Υπάρχει ήδη ανοιχτή βάρδια για το κατάστημα."});return res.status(error?.status||500).json({error:error?.message||"Σφάλμα στον Έλεγχο Ταμείου."})}}}

router.use(auth,requireCashAccess);

router.get("/stores/:storeId/overview",route(async(req,res)=>{
  assertStoreAccess(req,req.params.storeId);const store=await ownedStore(req.params.storeId,req.user.companyId),terminalPos=await requestTerminal(req);
  const [openRows,recentRows,lastClosedRows]=await Promise.all([
    prisma.$queryRaw`SELECT * FROM "CashShiftSession" WHERE "storeId"=${store.id} AND "companyId"=${req.user.companyId} AND "terminalPos"=${terminalPos} AND "status"='OPEN' ORDER BY "openedAt" DESC LIMIT 1`,
    prisma.$queryRaw`SELECT * FROM "CashShiftSession" WHERE "storeId"=${store.id} AND "companyId"=${req.user.companyId} AND "terminalPos"=${terminalPos} ORDER BY "openedAt" DESC LIMIT 20`,
    prisma.$queryRaw`SELECT * FROM "CashShiftSession" WHERE "storeId"=${store.id} AND "companyId"=${req.user.companyId} AND "terminalPos"=${terminalPos} AND "status"='CLOSED' ORDER BY "closedAt" DESC LIMIT 1`
  ]);
  const last=normalize(lastClosedRows[0]);res.json({store:{id:store.id,name:store.name},openSession:normalize(openRows[0]),recent:recentRows.map(normalize),suggestedOpening:last?{drawer:last.closingDrawer||0,custody:last.closingCustody||0,coins:last.closingCoins||0,safe:last.closingSafe||0,operational:last.nextOpeningTotal||0}:{drawer:0,custody:0,coins:0,safe:0,operational:0}});
}));

router.post("/stores/:storeId/sessions/open",route(async(req,res)=>{
  assertStoreAccess(req,req.params.storeId);const store=await ownedStore(req.params.storeId,req.user.companyId),body=openSchema.parse(req.body||{}),terminalPos=await requestTerminal(req);
  const existing=await prisma.$queryRaw`SELECT "id" FROM "CashShiftSession" WHERE "storeId"=${store.id} AND "companyId"=${req.user.companyId} AND "terminalPos"=${terminalPos} AND "status"='OPEN' LIMIT 1`;if(existing[0])return res.status(409).json({error:`Υπάρχει ήδη ανοιχτή βάρδια στο ${terminalPos}.`});
  const operational=body.drawer+body.custody+body.coins;
  const lastClosedRows=await prisma.$queryRaw`SELECT "nextOpeningTotal" FROM "CashShiftSession" WHERE "storeId"=${store.id} AND "companyId"=${req.user.companyId} AND "terminalPos"=${terminalPos} AND "status"='CLOSED' ORDER BY "closedAt" DESC LIMIT 1`;
  const expectedOpening=lastClosedRows[0]?money(lastClosedRows[0].nextOpeningTotal):operational,openingVariance=operational-expectedOpening,actorName=req.user.fullName||"Χρήστης";
  const rows=await prisma.$queryRaw`
    INSERT INTO "CashShiftSession" ("id","companyId","storeId","terminalPos","shiftLabel","openedBy","openedByName","openingDrawer","openingCustody","openingCoins","openingSafe","openingOperational","expectedOpeningOperational","openingVariance","openingNote")
    VALUES (${crypto.randomUUID()},${req.user.companyId},${store.id},${terminalPos},${body.shiftLabel},${req.user.id},${actorName},${body.drawer},${body.custody},${body.coins},${body.safe},${operational},${expectedOpening},${openingVariance},${body.note||null}) RETURNING *`;
  res.status(201).json(normalize(rows[0]));
}));

router.post("/sessions/:sessionId/close",route(async(req,res)=>{
  const body=closeSchema.parse(req.body||{}),actorName=req.user.fullName||"Χρήστης";
  const closeResult=await prisma.$transaction(async tx=>{
    const found=await tx.$queryRaw`
      SELECT s.* FROM "CashShiftSession" s JOIN "Store" st ON st."id"=s."storeId"
      WHERE s."id"=${req.params.sessionId} AND s."companyId"=${req.user.companyId} AND st."companyId"=${req.user.companyId} AND s."status"='OPEN' LIMIT 1 FOR UPDATE OF s`;
    const session=normalize(found[0]);if(!session)return null;assertStoreAccess(req,session.storeId);
    const ledger=await authoritativeShiftTotals(tx,req.user.companyId,session.storeId,session.id);
    const expected=session.openingOperational+ledger.cashSales+ledger.transferIn-ledger.expenses;
    const actual=body.drawer+body.custody+body.coins,variance=actual-expected,cardVariance=ledger.cardSales-body.eftposTotal;
    const duplicateReview=Math.abs(cardVariance)>0.009?await findConsecutiveDuplicateSales(tx,req.user.companyId,session.storeId,session.openedAt,new Date()):[],duplicateReviewJson=JSON.stringify(duplicateReview);
    const rows=await tx.$queryRaw`
      UPDATE "CashShiftSession" SET "status"='CLOSED',"closedBy"=${req.user.id},"closedByName"=${actorName},"closedAt"=NOW(),
        "cashSales"=${ledger.cashSales},"cardSales"=${ledger.cardSales},"eftposTotal"=${body.eftposTotal},"cardVariance"=${cardVariance},"duplicateReviewJson"=${duplicateReviewJson}::jsonb,"expenses"=${ledger.expenses},
        "closingDrawer"=${body.drawer},"closingCustody"=${body.custody},"closingCoins"=${body.coins},"closingSafe"=${body.safe},"expectedOperational"=${expected},"actualOperational"=${actual},"variance"=${variance},"nextOpeningTotal"=${actual},"closingNote"=${body.note||null},"updatedAt"=NOW()
      WHERE "id"=${session.id} AND "companyId"=${req.user.companyId} AND "status"='OPEN' RETURNING *`;
    return rows[0]?{closed:normalize(rows[0]),storeId:session.storeId}:null;
  });
  if(!closeResult)return res.status(409).json({error:"Η βάρδια έχει ήδη κλείσει ή δεν είναι πλέον ενεργή. Δεν δημιουργήθηκε δεύτερο κλείσιμο ή email."});
  const {closed,storeId}=closeResult;
  const [store,owners]=await Promise.all([prisma.store.findFirst({where:{id:storeId,companyId:req.user.companyId},select:{name:true,responsibleEmail:true,cashCloseEmailEnabled:true}}),prisma.user.findMany({where:{companyId:req.user.companyId,role:"OWNER"},select:{email:true}})]);
  const recipients=[...owners.map(owner=>owner.email),store?.responsibleEmail].filter(Boolean);let emailNotification={status:"SKIPPED",recipients:[]};
  if(store?.cashCloseEmailEnabled!==false&&recipients.length){try{const sent=await sendCashShiftClosedEmail({to:recipients,storeName:store?.name||"Κατάστημα",session:closed});emailNotification={status:"SENT",recipients:sent.recipients}}catch(error){console.error("Cash close email failed",error?.message||error);emailNotification={status:"FAILED",recipients}}}
  res.json({...closed,emailNotification});
}));

export default router;
