import {Router} from "express";
import {z} from "zod";
import {prisma} from "../prisma.js";

const router=Router();
const roles=new Set(["SUPER_ADMIN","OWNER","ADMIN","MANAGER"]);
const querySchema=z.object({
  from:z.string().optional(),
  to:z.string().optional(),
  storeId:z.string().trim().optional(),
  status:z.enum(["ALL","OPEN","CLOSED"]).optional().default("ALL"),
  q:z.string().trim().max(160).optional()
});
const n=value=>Number(value||0);
const moneyFields=["openingDrawer","openingCustody","openingCoins","openingSafe","openingOperational","expectedOpeningOperational","openingVariance","cashSales","cardSales","eftposTotal","cardVariance","expenses","closingDrawer","closingCustody","closingCoins","closingSafe","expectedOperational","actualOperational","variance","nextOpeningTotal","recordedSupplierPayments","recordedOtherExpenses","deductedSupplierPayments","deductedOtherExpenses","percentages"];
const normalizeShift=row=>{const out={...row};for(const key of moneyFields)out[key]=row[key]==null?null:n(row[key]);out.transactionCount=n(row.transactionCount);out.reversedCount=n(row.reversedCount);out.durationMinutes=row.durationMinutes==null?null:n(row.durationMinutes);out.duplicateReview=Array.isArray(row.duplicateReviewJson)?row.duplicateReviewJson:[];return out};
const normalizeTx=row=>({...row,amount:n(row.amount),subtractFromShift:Boolean(row.subtractFromShift),hasAttachment:Boolean(row.hasAttachment)});

let schemaPromise;
async function ensureSchema(){
  if(!schemaPromise){
    schemaPromise=(async()=>{
      await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "CashShiftSession" (
        "id" TEXT PRIMARY KEY,"companyId" TEXT NOT NULL,"storeId" TEXT NOT NULL,"status" TEXT NOT NULL DEFAULT 'OPEN',"shiftLabel" TEXT NOT NULL DEFAULT 'Βάρδια',
        "openedBy" TEXT NOT NULL,"openedByName" TEXT,"openedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),"openingDrawer" NUMERIC(14,2) NOT NULL DEFAULT 0,
        "openingCustody" NUMERIC(14,2) NOT NULL DEFAULT 0,"openingCoins" NUMERIC(14,2) NOT NULL DEFAULT 0,"openingSafe" NUMERIC(14,2) NOT NULL DEFAULT 0,
        "openingOperational" NUMERIC(14,2) NOT NULL DEFAULT 0,"expectedOpeningOperational" NUMERIC(14,2) NOT NULL DEFAULT 0,"openingVariance" NUMERIC(14,2) NOT NULL DEFAULT 0,
        "openingNote" TEXT,"closedBy" TEXT,"closedByName" TEXT,"closedAt" TIMESTAMPTZ,"cashSales" NUMERIC(14,2) NOT NULL DEFAULT 0,
        "cardSales" NUMERIC(14,2) NOT NULL DEFAULT 0,"eftposTotal" NUMERIC(14,2) NOT NULL DEFAULT 0,"cardVariance" NUMERIC(14,2) NOT NULL DEFAULT 0,
        "duplicateReviewJson" JSONB NOT NULL DEFAULT '[]'::jsonb,"expenses" NUMERIC(14,2) NOT NULL DEFAULT 0,"closingDrawer" NUMERIC(14,2),
        "closingCustody" NUMERIC(14,2),"closingCoins" NUMERIC(14,2),"closingSafe" NUMERIC(14,2),"expectedOperational" NUMERIC(14,2),
        "actualOperational" NUMERIC(14,2),"variance" NUMERIC(14,2),"nextOpeningTotal" NUMERIC(14,2),"closingNote" TEXT,"updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
      const shifts=[
        `ALTER TABLE "CashShiftSession" ADD COLUMN IF NOT EXISTS "openedByName" TEXT`,
        `ALTER TABLE "CashShiftSession" ADD COLUMN IF NOT EXISTS "closedByName" TEXT`,
        `ALTER TABLE "CashShiftSession" ADD COLUMN IF NOT EXISTS "expectedOpeningOperational" NUMERIC(14,2) NOT NULL DEFAULT 0`,
        `ALTER TABLE "CashShiftSession" ADD COLUMN IF NOT EXISTS "openingVariance" NUMERIC(14,2) NOT NULL DEFAULT 0`,
        `ALTER TABLE "CashShiftSession" ADD COLUMN IF NOT EXISTS "eftposTotal" NUMERIC(14,2) NOT NULL DEFAULT 0`,
        `ALTER TABLE "CashShiftSession" ADD COLUMN IF NOT EXISTS "cardVariance" NUMERIC(14,2) NOT NULL DEFAULT 0`,
        `ALTER TABLE "CashShiftSession" ADD COLUMN IF NOT EXISTS "duplicateReviewJson" JSONB NOT NULL DEFAULT '[]'::jsonb`
      ];
      for(const sql of shifts)await prisma.$executeRawUnsafe(sql);
      await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "StoreTransaction" (
        "id" TEXT PRIMARY KEY,"companyId" TEXT NOT NULL,"storeId" TEXT NOT NULL,"sessionId" TEXT,"type" TEXT NOT NULL,"amount" NUMERIC(14,2) NOT NULL,
        "description" TEXT,"supplierName" TEXT,"subtractFromShift" BOOLEAN NOT NULL DEFAULT false,"actorId" TEXT NOT NULL,"actorName" TEXT NOT NULL,
        "occurredAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),"createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),"reversedAt" TIMESTAMPTZ,"reversedBy" TEXT,
        "reversedByName" TEXT,"reversalReason" TEXT)`);
      const tx=[
        `ALTER TABLE "StoreTransaction" ADD COLUMN IF NOT EXISTS "subtractFromShift" BOOLEAN NOT NULL DEFAULT false`,
        `ALTER TABLE "StoreTransaction" ADD COLUMN IF NOT EXISTS "supplierId" TEXT`,
        `ALTER TABLE "StoreTransaction" ADD COLUMN IF NOT EXISTS "attachmentData" TEXT`,
        `ALTER TABLE "StoreTransaction" ADD COLUMN IF NOT EXISTS "attachmentFilename" TEXT`,
        `ALTER TABLE "StoreTransaction" ADD COLUMN IF NOT EXISTS "sourceType" TEXT`,
        `CREATE INDEX IF NOT EXISTS "StoreTransaction_session_idx" ON "StoreTransaction" ("sessionId","occurredAt" DESC)`
      ];
      for(const sql of tx)await prisma.$executeRawUnsafe(sql);
    })().catch(error=>{schemaPromise=undefined;throw error});
  }
  return schemaPromise;
}
function requireOwner(req,res,next){
  if(req.user?.tokenType==="STORE_OPERATOR"||!roles.has(req.user?.role))return res.status(403).json({error:"Η πλήρης διαχείριση βαρδιών είναι διαθέσιμη μόνο σε Super Admin, Ιδιοκτήτη, Admin ή Manager."});
  next();
}
function range(query){
  const now=new Date();const from=query.from?new Date(query.from):new Date(now.getFullYear(),now.getMonth(),1,0,0,0,0);const to=query.to?new Date(query.to):now;
  if(!Number.isFinite(from.getTime())||!Number.isFinite(to.getTime())||from>to){const error=new Error("Μη έγκυρο διάστημα ημερομηνιών.");error.status=400;throw error}return {from,to};
}
async function assertStore(companyId,storeId){if(!storeId)return null;const store=await prisma.store.findFirst({where:{id:storeId,companyId,active:true},select:{id:true,name:true}});if(!store){const error=new Error("Δεν βρέθηκε το κατάστημα.");error.status=404;throw error}return store}

router.use(requireOwner);
router.get("/report",async(req,res,next)=>{
  try{
    await ensureSchema();const query=querySchema.parse(req.query||{}),{from,to}=range(query),companyId=req.user.companyId,storeId=query.storeId||null,status=query.status,q=query.q||null;
    await assertStore(companyId,storeId);
    const stores=await prisma.store.findMany({where:{companyId,active:true},select:{id:true,name:true},orderBy:{name:"asc"}});
    const rows=await prisma.$queryRaw`
      SELECT s.*,st."name" AS "storeName",
        EXTRACT(EPOCH FROM (COALESCE(s."closedAt",NOW())-s."openedAt"))/60 AS "durationMinutes",
        COUNT(t."id") FILTER (WHERE t."reversedAt" IS NULL)::int AS "transactionCount",
        COUNT(t."id") FILTER (WHERE t."reversedAt" IS NOT NULL)::int AS "reversedCount",
        COALESCE(SUM(t."amount") FILTER (WHERE t."type"='SUPPLIER_PAYMENT' AND t."reversedAt" IS NULL),0) AS "recordedSupplierPayments",
        COALESCE(SUM(t."amount") FILTER (WHERE t."type"='OTHER_EXPENSE' AND t."reversedAt" IS NULL),0) AS "recordedOtherExpenses",
        COALESCE(SUM(t."amount") FILTER (WHERE t."type"='SUPPLIER_PAYMENT' AND t."subtractFromShift"=true AND t."reversedAt" IS NULL),0) AS "deductedSupplierPayments",
        COALESCE(SUM(t."amount") FILTER (WHERE t."type"='OTHER_EXPENSE' AND t."subtractFromShift"=true AND t."reversedAt" IS NULL),0) AS "deductedOtherExpenses",
        COALESCE(SUM(t."amount") FILTER (WHERE t."type"='PERCENTAGES' AND t."reversedAt" IS NULL),0) AS "percentages"
      FROM "CashShiftSession" s
      JOIN "Store" st ON st."id"=s."storeId" AND st."companyId"=s."companyId"
      LEFT JOIN "StoreTransaction" t ON t."sessionId"=s."id" AND t."companyId"=s."companyId" AND t."storeId"=s."storeId"
      WHERE s."companyId"=${companyId}
        AND COALESCE(s."closedAt",NOW())>=${from} AND s."openedAt"<=${to}
        AND (${storeId}::text IS NULL OR s."storeId"=${storeId})
        AND (${status}='ALL' OR s."status"=${status})
        AND (${q}::text IS NULL OR COALESCE(s."openedByName",'') ILIKE ${q?`%${q}%`:null} OR COALESCE(s."closedByName",'') ILIKE ${q?`%${q}%`:null} OR COALESCE(s."shiftLabel",'') ILIKE ${q?`%${q}%`:null} OR st."name" ILIKE ${q?`%${q}%`:null})
      GROUP BY s."id",st."name"
      ORDER BY s."openedAt" DESC
      LIMIT 1500
    `;
    const shifts=rows.map(normalizeShift);
    const summary=shifts.reduce((a,row)=>{a.count++;if(row.status==="OPEN")a.open++;else a.closed++;a.cashSales+=n(row.cashSales);a.cardSales+=n(row.cardSales);a.eftpos+=n(row.eftposTotal);a.expenses+=n(row.expenses);a.variance+=n(row.variance);a.openingVariance+=n(row.openingVariance);a.cardVariance+=n(row.cardVariance);a.alerts+=(Math.abs(n(row.variance))>.009?1:0)+(Math.abs(n(row.openingVariance))>.009?1:0)+(Math.abs(n(row.cardVariance))>.009?1:0)+n(row.reversedCount);return a},{count:0,open:0,closed:0,cashSales:0,cardSales:0,eftpos:0,expenses:0,variance:0,openingVariance:0,cardVariance:0,alerts:0});
    res.json({generatedAt:new Date().toISOString(),from,to,stores,summary,shifts});
  }catch(error){next(error)}
});

router.get("/:sessionId/detail",async(req,res,next)=>{
  try{
    await ensureSchema();const companyId=req.user.companyId;
    const shiftRows=await prisma.$queryRaw`
      SELECT s.*,st."name" AS "storeName",EXTRACT(EPOCH FROM (COALESCE(s."closedAt",NOW())-s."openedAt"))/60 AS "durationMinutes"
      FROM "CashShiftSession" s JOIN "Store" st ON st."id"=s."storeId" AND st."companyId"=s."companyId"
      WHERE s."id"=${req.params.sessionId} AND s."companyId"=${companyId} LIMIT 1
    `;
    const shift=shiftRows[0]?normalizeShift(shiftRows[0]):null;if(!shift)return res.status(404).json({error:"Δεν βρέθηκε η βάρδια."});
    const until=shift.closedAt||new Date();
    const [transactionsRaw,categoriesRaw,paymentsRaw,salesRaw]=await Promise.all([
      prisma.$queryRaw`
        SELECT t."id",t."type",t."amount",t."description",t."supplierId",t."supplierName",t."subtractFromShift",t."actorId",t."actorName",t."occurredAt",
          t."reversedAt",t."reversedBy",t."reversedByName",t."reversalReason",t."sourceType",(t."attachmentData" IS NOT NULL) AS "hasAttachment",t."attachmentFilename"
        FROM "StoreTransaction" t WHERE t."companyId"=${companyId} AND t."storeId"=${shift.storeId} AND t."sessionId"=${shift.id} ORDER BY t."occurredAt" ASC
      `,
      prisma.$queryRaw`
        SELECT COALESCE(pc."name",'Χωρίς κατηγορία') AS category,COALESCE(SUM(l."quantity"),0) AS quantity,COALESCE(SUM(l."lineTotal"),0) AS revenue,COUNT(DISTINCT s."id")::int AS sales
        FROM "Sale" s JOIN "SaleLine" l ON l."saleId"=s."id" LEFT JOIN "Product" p ON p."id"=l."productId" LEFT JOIN "ProductCategory" pc ON pc."id"=p."categoryId"
        WHERE s."companyId"=${companyId} AND s."storeId"=${shift.storeId} AND s."status"='COMPLETED' AND s."occurredAt">=${shift.openedAt} AND s."occurredAt"<=${until}
        GROUP BY COALESCE(pc."name",'Χωρίς κατηγορία') ORDER BY revenue DESC
      `,
      prisma.$queryRaw`
        SELECT p."method",COALESCE(SUM(p."amount"),0) AS amount,COUNT(*)::int AS count
        FROM "Payment" p JOIN "Sale" s ON s."id"=p."saleId"
        WHERE s."companyId"=${companyId} AND s."storeId"=${shift.storeId} AND s."status"='COMPLETED' AND s."occurredAt">=${shift.openedAt} AND s."occurredAt"<=${until}
        GROUP BY p."method" ORDER BY amount DESC
      `,
      prisma.$queryRaw`
        SELECT COUNT(*)::int AS count,COALESCE(SUM("total"),0) AS total,COALESCE(AVG("total"),0) AS average,MIN("occurredAt") AS "firstAt",MAX("occurredAt") AS "lastAt"
        FROM "Sale" WHERE "companyId"=${companyId} AND "storeId"=${shift.storeId} AND "status"='COMPLETED' AND "occurredAt">=${shift.openedAt} AND "occurredAt"<=${until}
      `
    ]);
    const transactions=transactionsRaw.map(normalizeTx),active=transactions.filter(row=>!row.reversedAt),sum=(type,onlyDeducted=false)=>active.filter(row=>row.type===type&&(!onlyDeducted||row.subtractFromShift)).reduce((s,row)=>s+n(row.amount),0);
    const recordedSupplierPayments=sum("SUPPLIER_PAYMENT"),recordedOtherExpenses=sum("OTHER_EXPENSE"),deductedSupplierPayments=sum("SUPPLIER_PAYMENT",true),deductedOtherExpenses=sum("OTHER_EXPENSE",true),percentages=sum("PERCENTAGES");
    const categories=categoriesRaw.map(row=>({...row,quantity:n(row.quantity),revenue:n(row.revenue),sales:n(row.sales)})),paymentMethods=paymentsRaw.map(row=>({...row,amount:n(row.amount),count:n(row.count)})),sales={count:n(salesRaw[0]?.count),total:n(salesRaw[0]?.total),average:n(salesRaw[0]?.average),firstAt:salesRaw[0]?.firstAt||null,lastAt:salesRaw[0]?.lastAt||null};
    const difference={
      expectedOpening:n(shift.expectedOpeningOperational),declaredOpening:n(shift.openingOperational),openingVariance:n(shift.openingVariance),openingDrawer:n(shift.openingDrawer),openingCustody:n(shift.openingCustody),openingCoins:n(shift.openingCoins),openingSafe:n(shift.openingSafe),
      cashSales:n(shift.cashSales),cardSales:n(shift.cardSales),eftposTotal:n(shift.eftposTotal),cardVariance:n(shift.cardVariance),recordedSupplierPayments,recordedOtherExpenses,deductedSupplierPayments,deductedOtherExpenses,percentages,
      expectedOperational:n(shift.expectedOperational),actualOperational:n(shift.actualOperational),closingDrawer:n(shift.closingDrawer),closingCustody:n(shift.closingCustody),closingCoins:n(shift.closingCoins),closingSafe:n(shift.closingSafe),variance:n(shift.variance),nextOpeningTotal:n(shift.nextOpeningTotal),
      formula:"Διαφορά = Πραγματικό λειτουργικό κλείσιμο − Αναμενόμενο λειτουργικό κλείσιμο"
    };
    const alerts=[];if(Math.abs(difference.openingVariance)>.009)alerts.push({kind:"OPENING_VARIANCE",amount:difference.openingVariance,label:"Διαφορά έναρξης"});if(Math.abs(difference.cardVariance)>.009)alerts.push({kind:"CARD_VARIANCE",amount:difference.cardVariance,label:"Διαφορά Καρτών − EFTPOS"});if(Math.abs(difference.variance)>.009)alerts.push({kind:"CLOSING_VARIANCE",amount:difference.variance,label:"Διαφορά κλεισίματος"});for(const row of transactions.filter(row=>row.reversedAt))alerts.push({kind:"REVERSAL",amount:n(row.amount),label:`Αντιλογισμός: ${row.description||row.type}`,transactionId:row.id});for(const item of shift.duplicateReview||[])alerts.push({kind:"DUPLICATE_REVIEW",amount:n(item.total),label:"Πιθανή διαδοχική ίδια πώληση για έλεγχο",detail:item});
    res.json({shift,transactions,categories,paymentMethods,sales,difference,alerts,sourceStatus:{vatFiscal:false,note:"Η ανάλυση Τμήματος ΦΠΑ παραμένει κλειδωμένη μέχρι πραγματική φορολογική πηγή/Connector."}});
  }catch(error){next(error)}
});

export default router;
