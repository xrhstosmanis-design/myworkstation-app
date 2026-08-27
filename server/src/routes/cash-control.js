import { Router } from "express";
import crypto from "crypto";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { auth } from "../middleware/auth.js";
import { sendEmail } from "../services/mail.js";

const router = Router();
let tablesPromise;

const tableStatements = [
  `CREATE TABLE IF NOT EXISTS "CashShiftSession" (
    "id" TEXT PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "terminalPos" TEXT NOT NULL DEFAULT 'MAIN',
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
  `CREATE TABLE IF NOT EXISTS "CashControlStoreRule" (
    "storeId" TEXT PRIMARY KEY,"companyId" TEXT NOT NULL,"mode" TEXT NOT NULL DEFAULT 'FULL',
    "deliveryTerminalPattern" TEXT NOT NULL DEFAULT 'DELIVERY',"carryOverEnabled" BOOLEAN NOT NULL DEFAULT true,
    "posEftposEnabled" BOOLEAN NOT NULL DEFAULT true,"updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS "CashControlReview" (
    "id" TEXT PRIMARY KEY,"companyId" TEXT NOT NULL,"storeId" TEXT NOT NULL,"sessionId" TEXT NOT NULL,
    "decision" TEXT NOT NULL,"amount" NUMERIC(14,2) NOT NULL DEFAULT 0,"note" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,"actorName" TEXT NOT NULL,"snapshotJson" JSONB NOT NULL DEFAULT '{}'::jsonb,"createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `ALTER TABLE "CashControlReview" ADD COLUMN IF NOT EXISTS "snapshotJson" JSONB NOT NULL DEFAULT '{}'::jsonb`,
  `CREATE INDEX IF NOT EXISTS "CashControlReview_session_idx" ON "CashControlReview" ("sessionId","createdAt")`,
  `CREATE TABLE IF NOT EXISTS "StoreTransaction" (
    "id" TEXT PRIMARY KEY,"companyId" TEXT NOT NULL,"storeId" TEXT NOT NULL,"sessionId" TEXT,
    "type" TEXT NOT NULL,"amount" NUMERIC(14,2) NOT NULL,"description" TEXT,"supplierName" TEXT,
    "subtractFromShift" BOOLEAN NOT NULL DEFAULT false,"actorId" TEXT NOT NULL,"actorName" TEXT NOT NULL,
    "occurredAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),"createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "reversedAt" TIMESTAMPTZ,"reversedBy" TEXT,"reversedByName" TEXT,"reversalReason" TEXT
  )`,
  `ALTER TABLE "StoreTransaction" ADD COLUMN IF NOT EXISTS "subtractFromShift" BOOLEAN NOT NULL DEFAULT false`,
  `ALTER TABLE "StoreTransaction" ADD COLUMN IF NOT EXISTS "attachmentData" TEXT`,
  `ALTER TABLE "StoreTransaction" ADD COLUMN IF NOT EXISTS "attachmentMimeType" TEXT`,
  `ALTER TABLE "StoreTransaction" ADD COLUMN IF NOT EXISTS "attachmentFilename" TEXT`,
  `ALTER TABLE "StoreTransaction" ADD COLUMN IF NOT EXISTS "attachmentChecksum" TEXT`
];

async function ensureTables(){
  if(!tablesPromise){tablesPromise=(async()=>{for(const sql of tableStatements)await prisma.$executeRawUnsafe(sql)})().catch(error=>{tablesPromise=undefined;throw error})}
  return tablesPromise;
}

export async function ensureCashControlSchema(){return ensureTables()}

async function requireCashAccess(req,res,next){
  const backoffice=req.user?.tokenType!=="STORE_OPERATOR"&&["OWNER","ADMIN","MANAGER"].includes(req.user?.role);
  if(backoffice)return next();
  if(req.user?.tokenType!=="STORE_OPERATOR")return res.status(403).json({error:"Δεν έχεις δικαίωμα πρόσβασης στον Έλεγχο Ταμείου."});
  const permissions=req.user?.permissions||[],path=String(req.originalUrl||"").split("?")[0];
  if(req.method==="GET"&&/\/api\/(?:cash|cash-control)\/stores\/[^/]+\/overview$/.test(path)&&permissions.includes("CASH_OVERVIEW"))return next();
  if(req.method==="POST"&&/\/stores\/[^/]+\/sessions\/open$/.test(path)){
    const rows=await prisma.$queryRaw`SELECT COALESCE(p."permissions",'{}'::jsonb) AS "permissions" FROM "StoreOperatorCredential" c LEFT JOIN "StoreOperatorProfile" p ON p."storeId"=c."storeId" AND p."employeeId"=c."employeeId" WHERE c."id"=${req.user.operatorId||req.user.id} AND c."companyId"=${req.user.companyId} AND c."active"=TRUE LIMIT 1`;
    const profile=rows[0]?.permissions&&typeof rows[0].permissions==="object"?rows[0].permissions:{};
    if(profile.initialCash===true)return next();
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

const amount=z.coerce.number().finite().min(0).max(999999999).default(0);
const openSchema=z.object({shiftLabel:z.string().trim().min(2).max(80).default("Βάρδια"),drawer:amount,custody:amount,coins:amount,safe:amount,note:z.string().trim().max(1000).optional().nullable()});
const closeSchema=z.object({cashSales:amount,cardSales:amount,eftposTotal:amount,expenses:amount,drawer:amount,custody:amount,coins:amount,safe:amount,note:z.string().trim().max(1000).optional().nullable(),safeReason:z.string().trim().max(1000).optional().nullable()});
const reportDateSchema=z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const reviewSchema=z.object({decision:z.enum(["EXPLANATION","CONFIRMED_SHORTAGE","REVIEWED_NO_CHANGE"]),amount:z.coerce.number().finite().min(0).max(999999999).default(0),note:z.string().trim().min(5).max(1000)}).superRefine((value,ctx)=>{if(value.decision==="EXPLANATION"&&value.amount<=0)ctx.addIssue({code:z.ZodIssueCode.custom,path:["amount"],message:"Η εξήγηση χρειάζεται θετικό ποσό."})});

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
    SELECT COALESCE(SUM("amount") FILTER (WHERE "type" IN ('SALE_CASH','CUSTOMER_RECEIPT_CASH') AND "reversedAt" IS NULL),0) AS "cashSales",
      COALESCE(SUM("amount") FILTER (WHERE "type" IN ('SALE_CARD','CUSTOMER_RECEIPT_CARD') AND "reversedAt" IS NULL),0) AS "cardSales",
      COALESCE(SUM("amount") FILTER (WHERE "type"='TRANSFER_AMOUNT' AND "reversedAt" IS NULL),0) AS "transferIn",
      COALESCE(SUM("amount") FILTER (WHERE "type" IN ('SUPPLIER_PAYMENT','OTHER_EXPENSE') AND "subtractFromShift"=true AND "reversedAt" IS NULL),0) AS "expenses"
    FROM "StoreTransaction" WHERE "companyId"=${companyId} AND "storeId"=${storeId} AND "sessionId"=${sessionId}`;
  return {cashSales:money(rows[0]?.cashSales),cardSales:money(rows[0]?.cardSales),transferIn:money(rows[0]?.transferIn),expenses:money(rows[0]?.expenses)};
}
async function existingAuditTables(db){
  const rows=await db.$queryRaw`SELECT to_regclass('"StoreOperatorAudit"') AS "operator",to_regclass('"PosSaleActionAudit"') AS "actions",to_regclass('"PosSaleSafetyAudit"') AS "safety"`;
  return rows[0]||{};
}
function legacyStoreRule(store){
  const name=String(store?.name||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toUpperCase();
  const differenceOnly=["ΕΣΤΙΑ","ΠΕΤΡΟΥΠΟΛΗ","ΓΑΛΑΤΣΙ"].some(label=>name.includes(label.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toUpperCase()));
  return {mode:differenceOnly?"DIFFERENCE_ONLY":"FULL",deliveryTerminalPattern:"DELIVERY",carryOverEnabled:!differenceOnly,posEftposEnabled:!differenceOnly,source:differenceOnly?"LEGACY_PROGRAM_RULE":"DEFAULT"};
}
async function cashControlRule(store,companyId){
  const rows=await prisma.$queryRaw`SELECT "mode","deliveryTerminalPattern","carryOverEnabled","posEftposEnabled" FROM "CashControlStoreRule" WHERE "storeId"=${store.id} AND "companyId"=${companyId} LIMIT 1`;
  return rows[0]?{...rows[0],source:"CONFIGURED"}:legacyStoreRule(store);
}
async function reviewSnapshot(companyId,storeId,sessionId){
  const rows=await prisma.$queryRaw`SELECT COUNT(*)::int AS "transactionCount",COALESCE(SUM("amount") FILTER (WHERE "reversedAt" IS NULL),0) AS "activeTotal",COALESCE(SUM("amount") FILTER (WHERE "type" IN ('SUPPLIER_PAYMENT','OTHER_EXPENSE') AND "reversedAt" IS NULL),0) AS "expenseTotal",COUNT(*) FILTER (WHERE "reversedAt" IS NOT NULL)::int AS "reversedCount",MAX(GREATEST("createdAt",COALESCE("reversedAt","createdAt"))) AS "lastMovementAt" FROM "StoreTransaction" WHERE "companyId"=${companyId} AND "storeId"=${storeId} AND "sessionId"=${sessionId}`;
  const row=rows[0]||{};return {transactionCount:Number(row.transactionCount||0),activeTotal:money(row.activeTotal),expenseTotal:money(row.expenseTotal),reversedCount:Number(row.reversedCount||0),lastMovementAt:row.lastMovementAt?new Date(row.lastMovementAt).toISOString():null};
}
function sameSnapshot(left,right){return JSON.stringify(left||{})===JSON.stringify(right||{})}
function suspiciousOperatorEvent(eventType){return /CANCEL|RETURN|VOID|REVERSE|DUPLICATE|DELAY|OVERRIDE|CREDENTIAL|PERMISSION|LOGOUT/i.test(String(eventType||""))}
function auditAmount(details){for(const key of ["reversalTotal","originalTotal","total","amount"]){const value=Number(details?.[key]);if(Number.isFinite(value)&&value!==0)return value}return null}
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

router.get("/stores/:storeId/daily-summary",route(async(req,res)=>{
  assertStoreAccess(req,req.params.storeId);
  const store=await ownedStore(req.params.storeId,req.user.companyId);
  const today=new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/Athens",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
  const date=reportDateSchema.parse(String(req.query.date||today));
  const rule=await cashControlRule(store,req.user.companyId),[sessionRows,expenseRows]=await Promise.all([
    prisma.$queryRaw`
      SELECT * FROM "CashShiftSession"
      WHERE "storeId"=${store.id} AND "companyId"=${req.user.companyId} AND "status"='CLOSED'
        AND ("closedAt" AT TIME ZONE 'Europe/Athens')::date=${date}::date
      ORDER BY "closedAt" ASC`,
    prisma.$queryRaw`
      SELECT t."id",t."sessionId",t."type",t."amount",t."description",t."supplierName",t."actorName",t."occurredAt",
        (t."attachmentData" IS NOT NULL OR t."attachmentMimeType"='application/vnd.myworkstation.purchase-document') AS "hasEvidence",
        CASE WHEN t."attachmentMimeType"='application/vnd.myworkstation.purchase-document' THEN t."attachmentFilename" ELSE NULL END AS "purchaseDocumentId",
        p."documentNumber",p."totalGross" AS "documentTotal"
      FROM "StoreTransaction" t
      JOIN "CashShiftSession" c ON c."id"=t."sessionId" AND c."companyId"=t."companyId" AND c."storeId"=t."storeId"
      LEFT JOIN "PurchaseDocument" p ON p."id"=CASE WHEN t."attachmentMimeType"='application/vnd.myworkstation.purchase-document' THEN t."attachmentFilename" ELSE NULL END
      WHERE t."storeId"=${store.id} AND t."companyId"=${req.user.companyId}
        AND t."type" IN ('SUPPLIER_PAYMENT','OTHER_EXPENSE') AND t."reversedAt" IS NULL
        AND c."status"='CLOSED' AND (c."closedAt" AT TIME ZONE 'Europe/Athens')::date=${date}::date
      ORDER BY t."occurredAt" ASC`
  ]);
  const sessions=sessionRows.map(row=>{const session=normalize(row),delivery=String(session.terminalPos||"").toUpperCase().includes(String(rule.deliveryTerminalPattern||"DELIVERY").toUpperCase());return {...session,delivery,varianceConsidered:rule.mode!=="POS_EFTPOS_ONLY",effectiveVariance:rule.mode==="POS_EFTPOS_ONLY"?0:money(session.variance)}}),expenseChecks=expenseRows.map(row=>{
    const amount=money(row.amount),documentTotal=row.documentTotal==null?null:money(row.documentTotal);
    const status=!row.hasEvidence?"NO_DOCUMENT":documentTotal!=null&&Math.abs(amount-documentTotal)>0.01?"AMOUNT_MISMATCH":"MATCHED";
    return {...row,amount,documentTotal,status,difference:documentTotal==null?null:amount-documentTotal};
  });
  const totals=sessions.reduce((sum,row)=>{const variance=money(row.effectiveVariance),cardVariance=rule.posEftposEnabled?money(row.cardVariance):0;sum.cashSales+=money(row.cashSales);sum.cardSales+=money(row.cardSales);sum.eftposTotal+=money(row.eftposTotal);sum.expenses+=money(row.expenses);sum.variance+=variance;sum.cardVariance+=cardVariance;sum.shortage+=variance<0?Math.abs(variance):0;sum.surplus+=variance>0?variance:0;sum.duplicateCandidates+=(row.duplicateReview||[]).length;return sum},{cashSales:0,cardSales:0,eftposTotal:0,expenses:0,variance:0,cardVariance:0,shortage:0,surplus:0,duplicateCandidates:0});
  const alerts=[];
  for(const row of sessions){if(rule.carryOverEnabled&&Math.abs(money(row.openingVariance))>0.009)alerts.push({type:"OPENING_CONTINUITY",sessionId:row.id,terminalPos:row.terminalPos,shiftLabel:row.shiftLabel,amount:money(row.openingVariance),scope:row.delivery?"DELIVERY_TO_DELIVERY":"SAME_POS_ONLY"});if(row.varianceConsidered&&Math.abs(money(row.variance))>0.009)alerts.push({type:money(row.variance)<0?"SHORTAGE":"SURPLUS",sessionId:row.id,terminalPos:row.terminalPos,shiftLabel:row.shiftLabel,amount:money(row.variance)});if(rule.posEftposEnabled&&Math.abs(money(row.cardVariance))>0.009)alerts.push({type:"POS_EFTPOS",sessionId:row.id,terminalPos:row.terminalPos,shiftLabel:row.shiftLabel,amount:money(row.cardVariance)});if((row.duplicateReview||[]).length)alerts.push({type:"DUPLICATE_REVIEW",sessionId:row.id,terminalPos:row.terminalPos,shiftLabel:row.shiftLabel,count:row.duplicateReview.length})}
  for(const expense of expenseChecks){if(expense.status!=="MATCHED")alerts.push({type:expense.status,transactionId:expense.id,sessionId:expense.sessionId,amount:expense.amount,difference:expense.difference})}
  res.json({date,timeZone:"Europe/Athens",store:{id:store.id,name:store.name},rule,status:alerts.length?"NEEDS_REVIEW":"AGREEMENT",sessions,expenseChecks,totals,alerts,recalculatedAt:new Date()});
}));

router.get("/sessions/:sessionId/investigation",route(async(req,res)=>{
  const found=await prisma.$queryRaw`SELECT s.* FROM "CashShiftSession" s JOIN "Store" st ON st."id"=s."storeId" WHERE s."id"=${req.params.sessionId} AND s."companyId"=${req.user.companyId} AND st."companyId"=${req.user.companyId} LIMIT 1`;
  const session=normalize(found[0]);if(!session)return res.status(404).json({error:"Δεν βρέθηκε η βάρδια."});assertStoreAccess(req,session.storeId);const store=await ownedStore(session.storeId,req.user.companyId),controlRule=await cashControlRule(store,req.user.companyId),varianceConsidered=controlRule.mode!=="DIFFERENCE_ONLY";
  const transactions=await prisma.$queryRaw`SELECT "id","type","amount","description","supplierName","subtractFromShift","actorId","actorName","occurredAt","reversedAt","reversedBy","reversedByName","reversalReason",("attachmentData" IS NOT NULL OR "attachmentMimeType"='application/vnd.myworkstation.purchase-document') AS "hasEvidence" FROM "StoreTransaction" WHERE "companyId"=${req.user.companyId} AND "storeId"=${session.storeId} AND "sessionId"=${session.id} ORDER BY "occurredAt"`;
  const tables=await existingAuditTables(prisma),auditEvents=[],auditUntil=session.closedAt?new Date(new Date(session.closedAt).getTime()+24*60*60*1000):new Date();
  if(tables.operator){const rows=await prisma.$queryRaw`SELECT "id","eventType","actorId","operatorId","details","createdAt" FROM "StoreOperatorAudit" WHERE "companyId"=${req.user.companyId} AND "storeId"=${session.storeId} AND "createdAt">=${session.openedAt} AND "createdAt"<=${auditUntil} ORDER BY "createdAt"`;for(const row of rows)if(suspiciousOperatorEvent(row.eventType))auditEvents.push({source:"STORE_OPERATOR_AUDIT",type:row.eventType,actorId:row.actorId,operatorId:row.operatorId,at:row.createdAt,details:row.details||{},amount:auditAmount(row.details)})}
  if(tables.actions){const rows=await prisma.$queryRaw`SELECT "id","saleId","relatedSaleId","actionType","reason","actorId","actorName","details","createdAt" FROM "PosSaleActionAudit" WHERE "companyId"=${req.user.companyId} AND "storeId"=${session.storeId} AND "createdAt">=${session.openedAt} AND "createdAt"<=${auditUntil} ORDER BY "createdAt"`;for(const row of rows)auditEvents.push({source:"POS_ACTION_AUDIT",type:row.actionType,saleId:row.saleId,relatedSaleId:row.relatedSaleId,actorId:row.actorId,actorName:row.actorName,reason:row.reason,at:row.createdAt,details:row.details||{},amount:auditAmount(row.details)})}
  if(tables.safety){const rows=await prisma.$queryRaw`SELECT "id","saleId","relatedSaleId","eventType","actorId","actorName","details","createdAt" FROM "PosSaleSafetyAudit" WHERE "companyId"=${req.user.companyId} AND "storeId"=${session.storeId} AND "createdAt">=${session.openedAt} AND "createdAt"<=${auditUntil} ORDER BY "createdAt"`;for(const row of rows)if(/DUPLICATE|REPLAY|BLOCKED/i.test(row.eventType))auditEvents.push({source:"POS_SAFETY_AUDIT",type:row.eventType,saleId:row.saleId,relatedSaleId:row.relatedSaleId,actorId:row.actorId,actorName:row.actorName,at:row.createdAt,details:row.details||{},amount:auditAmount(row.details)})}
  const findings=[];
  for(const row of transactions){const amount=money(row.amount);if(["SUPPLIER_PAYMENT","OTHER_EXPENSE"].includes(row.type)&&!row.hasEvidence)findings.push({code:"EXPENSE_WITHOUT_DOCUMENT",severity:"HIGH",transactionId:row.id,amount,actorName:row.actorName,at:row.occurredAt});if(row.reversedAt)findings.push({code:"REVERSED_TRANSACTION",severity:"MEDIUM",transactionId:row.id,amount,actorName:row.reversedByName||row.actorName,at:row.reversedAt,reason:row.reversalReason})}
  for(const event of auditEvents){const high=/CANCEL|RETURN|VOID|DUPLICATE_CONFIRMED|OVERRIDE/i.test(event.type);findings.push({code:`AUDIT_${event.type}`,severity:high?"HIGH":"MEDIUM",...event})}
  const actionEvents=auditEvents.filter(event=>event.source==="POS_ACTION_AUDIT"),actionsByOriginal=new Map();
  for(const event of actionEvents){if(session.closedAt&&new Date(event.at)>new Date(session.closedAt))findings.push({code:"ACTION_AFTER_SHIFT_CLOSE",severity:"HIGH",...event});if(/RETURN|CANCEL|VOID/i.test(event.type)&&!event.relatedSaleId)findings.push({code:"ACTION_WITHOUT_ORIGINAL_SALE",severity:"HIGH",...event});if(event.relatedSaleId){const related=actionsByOriginal.get(event.relatedSaleId)||[];related.push(event);actionsByOriginal.set(event.relatedSaleId,related)}if(event.actorId&&event.actorId!==session.openedBy&&event.actorId!==session.closedBy)findings.push({code:"ACTION_BY_DIFFERENT_OPERATOR",severity:"MEDIUM",...event});if(event.amount!=null&&Math.abs(Math.abs(Number(event.amount))-Math.abs(money(session.variance)))<=0.01)findings.push({code:"AMOUNT_MATCHES_CASH_DIFFERENCE",severity:"HIGH",...event})}
  for(const [relatedSaleId,events] of actionsByOriginal)if(events.length>1)findings.push({code:"MULTIPLE_ACTIONS_ON_SAME_SALE",severity:"HIGH",relatedSaleId,count:events.length,events});
  const amounts=new Map();for(const event of auditEvents){if(event.amount==null)continue;const key=Math.abs(Number(event.amount)).toFixed(2),same=amounts.get(key)||[];same.push(event);amounts.set(key,same)}for(const [amount,events] of amounts)if(events.length>1)findings.push({code:"REPEATED_AUDIT_AMOUNT",severity:"MEDIUM",amount:Number(amount),count:events.length,events});
  if(Math.abs(money(session.cardVariance))>0.009)findings.unshift({code:"POS_EFTPOS_DIFFERENCE",severity:"HIGH",amount:money(session.cardVariance)});
  if(varianceConsidered&&Math.abs(money(session.variance))>0.009)findings.unshift({code:money(session.variance)<0?"CASH_SHORTAGE":"CASH_SURPLUS",severity:"HIGH",amount:money(session.variance)});
  const currentSnapshot=await reviewSnapshot(req.user.companyId,session.storeId,session.id),reviewRows=await prisma.$queryRaw`SELECT "id","decision","amount","note","actorId","actorName","snapshotJson","createdAt" FROM "CashControlReview" WHERE "companyId"=${req.user.companyId} AND "storeId"=${session.storeId} AND "sessionId"=${session.id} ORDER BY "createdAt"`;
  const reviews=reviewRows.map(row=>({...row,amount:money(row.amount)})),latestReview=reviews[reviews.length-1]||null,recheckRequired=Boolean(latestReview&&!sameSnapshot(latestReview.snapshotJson,currentSnapshot)),validReviews=reviews.filter(row=>sameSnapshot(row.snapshotJson,currentSnapshot)),confirmedExplanations=validReviews.filter(row=>row.decision==="EXPLANATION");
  const unexplainedVariance=varianceConsidered?money(session.variance)-confirmedExplanations.reduce((sum,row)=>sum+money(row.amount),0):0;
  const finalizedShortage=validReviews.some(row=>row.decision==="CONFIRMED_SHORTAGE");
  res.json({session,controlRule,varianceConsidered,initialVariance:money(session.variance),cardVariance:money(session.cardVariance),transactions:transactions.map(row=>({...row,amount:money(row.amount)})),auditEvents,findings,reviews,currentSnapshot,recheckRequired,confirmedExplanations,unexplainedVariance,finalizedShortage,status:recheckRequired?"RECHECK_REQUIRED":finalizedShortage?"CONFIRMED_SHORTAGE":findings.length?"NEEDS_REVIEW":"AGREEMENT",rule:"Κανένα ύποπτο εύρημα δεν μειώνει αυτόματα τη διαφορά χωρίς επιβεβαίωση διαχειριστή."});
}));

router.post("/sessions/:sessionId/reviews",route(async(req,res)=>{
  if(req.user?.tokenType==="STORE_OPERATOR")return res.status(403).json({error:"Μόνο Ιδιοκτήτης ή Διαχειριστής μπορεί να οριστικοποιήσει τον έλεγχο."});
  const body=reviewSchema.parse(req.body||{}),found=await prisma.$queryRaw`SELECT s."id",s."storeId",s."variance",s."status" FROM "CashShiftSession" s JOIN "Store" st ON st."id"=s."storeId" WHERE s."id"=${req.params.sessionId} AND s."companyId"=${req.user.companyId} AND st."companyId"=${req.user.companyId} LIMIT 1`;
  const session=found[0];if(!session)return res.status(404).json({error:"Δεν βρέθηκε η βάρδια."});if(session.status!=="CLOSED")return res.status(409).json({error:"Ο έλεγχος οριστικοποιείται μόνο σε κλεισμένη βάρδια."});
  if(body.decision==="CONFIRMED_SHORTAGE"&&money(session.variance)>=-0.009)return res.status(409).json({error:"Η βάρδια δεν έχει έλλειμμα για οριστικοποίηση."});
  const id=crypto.randomUUID(),actorName=req.user.fullName||req.user.email||"Διαχειριστής",snapshot=await reviewSnapshot(req.user.companyId,session.storeId,session.id);
  const rows=await prisma.$queryRaw`INSERT INTO "CashControlReview" ("id","companyId","storeId","sessionId","decision","amount","note","actorId","actorName","snapshotJson") VALUES (${id},${req.user.companyId},${session.storeId},${session.id},${body.decision},${body.amount},${body.note},${req.user.id},${actorName},${JSON.stringify(snapshot)}::jsonb) RETURNING *`;
  res.status(201).json({...rows[0],amount:money(rows[0].amount)});
}));

router.post("/stores/:storeId/sessions/open",route(async(req,res)=>{
  assertStoreAccess(req,req.params.storeId);
  const testRuntime=process.env.CI==="true"||process.env.NODE_ENV==="test"||process.env.MWS_E2E_TERMINAL_OVERRIDE==="1";
  const requestedTerminal=testRuntime?String(req.query?.mwsTerminal||req.body?.terminalPos||req.headers?.["x-mws-terminal-pos"]||"").trim().toUpperCase():"";
  const assignedRows=!testRuntime&&req.user?.tokenType==="STORE_OPERATOR"?await prisma.$queryRaw`
    SELECT NULLIF(TRIM(p."terminalPos"),'') AS terminal
    FROM "StoreOperatorCredential" c
    LEFT JOIN "StoreOperatorProfile" p
      ON p."companyId"=c."companyId" AND p."storeId"=c."storeId" AND p."employeeId"=c."employeeId"
    WHERE c."id"=${req.user.operatorId||req.user.id}
      AND c."companyId"=${req.user.companyId}
      AND c."storeId"=${req.params.storeId}
      AND c."active"=TRUE
    LIMIT 1`:[];
  const assignedTerminal=String(assignedRows[0]?.terminal||"").trim().toUpperCase();
  const store=await ownedStore(req.params.storeId,req.user.companyId),body=openSchema.parse(req.body||{}),terminalPos=requestedTerminal||assignedTerminal||await requestTerminal(req);
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
    // KAT_SAFE_VAULT_CLOSE_ALERT_V1
    const previousSafe=money(session.openingSafe),safeDelta=Number((body.safe-previousSafe).toFixed(2)),safeReason=String(body.safeReason||"").trim();
    if(safeDelta < -0.009 && safeReason.length < 3){const error=new Error(`Το Χρηματοκιβώτιο μειώθηκε από ${previousSafe.toFixed(2)} € σε ${body.safe.toFixed(2)} €. Απαιτείται αιτιολογία πριν κλείσει η βάρδια.`);error.status=409;throw error}
    const ledger=await authoritativeShiftTotals(tx,req.user.companyId,session.storeId,session.id);
    const expected=session.openingOperational+ledger.cashSales+ledger.transferIn-ledger.expenses;
    const actual=body.drawer+body.custody+body.coins,variance=actual-expected,cardVariance=ledger.cardSales-body.eftposTotal;
    const duplicateReview=Math.abs(cardVariance)>0.009?await findConsecutiveDuplicateSales(tx,req.user.companyId,session.storeId,session.openedAt,new Date()):[],duplicateReviewJson=JSON.stringify(duplicateReview);
    if(Math.abs(safeDelta)>0.009){const description=[`Χρηματοκιβώτιο στο κλείσιμο: ${previousSafe.toFixed(2)} € → ${body.safe.toFixed(2)} €`,safeReason?`Αιτιολογία: ${safeReason}`:null].filter(Boolean).join(" · ");await tx.$executeRaw`INSERT INTO "StoreTransaction" ("id","companyId","storeId","sessionId","type","amount","description","subtractFromShift","actorId","actorName","occurredAt","createdAt") VALUES (${crypto.randomUUID()},${req.user.companyId},${session.storeId},${session.id},'SAFE_ADJUSTMENT',${safeDelta},${description},false,${req.user.id},${actorName},NOW(),NOW())`}
    const rows=await tx.$queryRaw`
      UPDATE "CashShiftSession" SET "status"='CLOSED',"closedBy"=${req.user.id},"closedByName"=${actorName},"closedAt"=NOW(),
        "cashSales"=${ledger.cashSales},"cardSales"=${ledger.cardSales},"eftposTotal"=${body.eftposTotal},"cardVariance"=${cardVariance},"duplicateReviewJson"=${duplicateReviewJson}::jsonb,"expenses"=${ledger.expenses},
        "closingDrawer"=${body.drawer},"closingCustody"=${body.custody},"closingCoins"=${body.coins},"closingSafe"=${body.safe},"expectedOperational"=${expected},"actualOperational"=${actual},"variance"=${variance},"nextOpeningTotal"=${actual},"closingNote"=${body.note||null},"updatedAt"=NOW()
      WHERE "id"=${session.id} AND "companyId"=${req.user.companyId} AND "status"='OPEN' RETURNING *`;
    return rows[0]?{closed:normalize(rows[0]),storeId:session.storeId,safeChange:Math.abs(safeDelta)>0.009?{previousSafe,newSafe:body.safe,delta:safeDelta,reason:safeReason||null}:null}:null;
  });
  if(!closeResult)return res.status(409).json({error:"Η βάρδια έχει ήδη κλείσει ή δεν είναι πλέον ενεργή. Δεν δημιουργήθηκε δεύτερο κλείσιμο ή email."});
  const {closed,storeId,safeChange}=closeResult;
  const [store,owners]=await Promise.all([prisma.store.findFirst({where:{id:storeId,companyId:req.user.companyId},select:{name:true,responsibleEmail:true}}),prisma.user.findMany({where:{companyId:req.user.companyId,role:"OWNER"},select:{email:true}})]);
  const recipients=[...new Set([...owners.map(owner=>owner.email),store?.responsibleEmail].filter(Boolean))];
  let safeEmailNotification={status:"SKIPPED",recipients:[]};
  if(safeChange?.delta < -0.009){
    const safeRecipients=[...new Set([...recipients,String(process.env.MAIL_TEST_RECIPIENT||"").trim()].filter(Boolean))];
    if(safeRecipients.length){try{const subject=`ΠΡΟΣΟΧΗ · Μείωση Χρηματοκιβωτίου · ${store?.name||"Κατάστημα"}`;const text=[subject,"",`Κατάστημα: ${store?.name||"Κατάστημα"}`,`Βάρδια: ${closed.shiftLabel}`,`Χειριστής: ${actorName}`,`Προηγούμενο ποσό: ${Number(safeChange.previousSafe).toFixed(2)} €`,`Νέο ποσό: ${Number(safeChange.newSafe).toFixed(2)} €`,`Μείωση: ${Math.abs(Number(safeChange.delta)).toFixed(2)} €`,`Αιτιολογία: ${safeChange.reason||"—"}`,"","Αυτόματο μήνυμα από το MyWorkStation."].join("\n");const sent=await sendEmail({to:safeRecipients,subject,text,html:`<div style="font-family:Arial,sans-serif"><h2>${subject}</h2><p><b>Κατάστημα:</b> ${store?.name||"Κατάστημα"}</p><p><b>Βάρδια:</b> ${closed.shiftLabel}</p><p><b>Χειριστής:</b> ${actorName}</p><p><b>Προηγούμενο:</b> ${Number(safeChange.previousSafe).toFixed(2)} €</p><p><b>Νέο:</b> ${Number(safeChange.newSafe).toFixed(2)} €</p><p><b>Μείωση:</b> ${Math.abs(Number(safeChange.delta)).toFixed(2)} €</p><p><b>Αιτιολογία:</b> ${safeChange.reason||"—"}</p></div>`});safeEmailNotification={status:"SENT",recipients:sent.recipients}}catch(error){console.error("Safe close decrease email failed",error?.message||error);safeEmailNotification={status:"FAILED",recipients:safeRecipients}}}
  }
  res.json({...closed,emailNotification:{status:"MANUAL_SEND_REQUIRED",recipients:[]},safeChange,safeEmailNotification});
}));

export default router;
