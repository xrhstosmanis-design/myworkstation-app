import {Router} from "express";
import {prisma} from "../prisma.js";

const router=Router();
const roles=new Set(["SUPER_ADMIN","OWNER","ADMIN","MANAGER"]);
const n=value=>Number(value||0);
let ready;

async function ensureCompatibility(){
  if(!ready)ready=(async()=>{
    await prisma.$executeRawUnsafe(`ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "legacyCode" TEXT`);
    await prisma.$executeRawUnsafe(`ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "memberCard" TEXT`);
  })().catch(error=>{ready=undefined;throw error});
  return ready;
}
function access(req,res,next){if(req.user?.tokenType==="STORE_OPERATOR"||!roles.has(req.user?.role))return res.status(403).json({error:"Η πλήρης διαχείριση πελατών είναι διαθέσιμη μόνο σε Super Admin, Ιδιοκτήτη, Admin ή Manager."});next()}
function range(query={}){const now=new Date(),to=query.to?new Date(String(query.to)):now,from=query.from?new Date(String(query.from)):new Date(to.getFullYear(),to.getMonth(),1);if(!Number.isFinite(from.getTime())||!Number.isFinite(to.getTime())||from>to){const e=new Error("Μη έγκυρο διάστημα ημερομηνιών.");e.status=400;throw e}return{from,to}}
async function owned(companyId,customerId){const rows=await prisma.$queryRaw`SELECT "id","name","balance" FROM "Customer" WHERE "id"=${customerId} AND "companyId"=${companyId} LIMIT 1`;return rows[0]||null}

router.use(access);
router.use(async(req,res,next)=>{try{await ensureCompatibility();next()}catch(error){next(error)}});

router.get("/report",async(req,res,next)=>{try{
  const companyId=req.user.companyId,q=String(req.query.q||"").trim(),activeOnly=String(req.query.activeOnly||"true")!=="false",nonZeroOnly=String(req.query.nonZeroOnly||"false")==="true",text=q?`%${q}%`:null;
  const rows=await prisma.$queryRaw`
    SELECT c.*,
      COALESCE(v."visits",0)::int AS "visits",
      COALESCE(y."currentYear",0) AS "currentYear",
      COALESCE(y."previousYear",0) AS "previousYear",
      COALESCE(y."returnsCurrentYear",0) AS "returnsCurrentYear"
    FROM "Customer" c
    LEFT JOIN LATERAL (
      SELECT COUNT(DISTINCT s."id") FILTER (WHERE COALESCE(s."source",'')<>'POS_REVERSAL')::int AS "visits"
      FROM "Sale" s
      WHERE s."companyId"=${companyId} AND s."customerId"=c."id" AND s."status"='COMPLETED'
    ) v ON true
    LEFT JOIN LATERAL (
      SELECT
        SUM(s."total") FILTER (WHERE EXTRACT(YEAR FROM s."occurredAt")=EXTRACT(YEAR FROM CURRENT_DATE)) AS "currentYear",
        SUM(s."total") FILTER (WHERE EXTRACT(YEAR FROM s."occurredAt")=EXTRACT(YEAR FROM CURRENT_DATE)-1) AS "previousYear",
        ABS(COALESCE(SUM(s."total") FILTER (WHERE EXTRACT(YEAR FROM s."occurredAt")=EXTRACT(YEAR FROM CURRENT_DATE) AND s."source"='POS_REVERSAL'),0)) AS "returnsCurrentYear"
      FROM "Sale" s
      WHERE s."companyId"=${companyId} AND s."customerId"=c."id" AND s."status"='COMPLETED'
    ) y ON true
    WHERE c."companyId"=${companyId}
      AND (${activeOnly}=false OR c."active"=true)
      AND (${nonZeroOnly}=false OR ABS(c."balance")>0.0001)
      AND (${text}::text IS NULL OR c."name" ILIKE ${text} OR COALESCE(c."taxId",'') ILIKE ${text} OR COALESCE(c."legacyCode",'') ILIKE ${text} OR COALESCE(c."memberCard",'') ILIKE ${text})
    ORDER BY c."name" LIMIT 2000`;
  const customers=rows.map(r=>({...r,balance:n(r.balance),discountPercent:n(r.discountPercent),creditLimit:n(r.creditLimit),points:n(r.points),visits:n(r.visits),currentYear:n(r.currentYear),previousYear:n(r.previousYear),returnsCurrentYear:n(r.returnsCurrentYear)}));
  const summary=customers.reduce((a,r)=>{a.count++;a.balance+=r.balance;a.visits+=r.visits;a.currentYear+=r.currentYear;a.returnsCurrentYear+=r.returnsCurrentYear;return a},{count:0,balance:0,visits:0,currentYear:0,returnsCurrentYear:0});
  res.json({customers,summary,reversalAware:true});
}catch(error){next(error)}});

router.get("/turnover",async(req,res,next)=>{try{
  const companyId=req.user.companyId,{from,to}=range(req.query),customerId=String(req.query.customerId||"")||null;
  const rows=await prisma.$queryRaw`
    SELECT c."id" AS "customerId",c."name" AS "customerName",c."taxId",
      COUNT(DISTINCT s."id") FILTER (WHERE COALESCE(s."source",'')<>'POS_REVERSAL')::int AS "visits",
      COALESCE(SUM(s."subtotal"),0) AS "subtotal",COALESCE(SUM(s."discount"),0) AS "discount",COALESCE(SUM(s."total"),0) AS "turnover",
      ABS(COALESCE(SUM(s."total") FILTER (WHERE s."source"='POS_REVERSAL'),0)) AS "returns",
      COUNT(*) FILTER (WHERE s."source"='POS_REVERSAL')::int AS "reversalCount"
    FROM "Sale" s
    JOIN "Customer" c ON c."id"=s."customerId" AND c."companyId"=s."companyId"
    WHERE s."companyId"=${companyId} AND s."status"='COMPLETED' AND s."occurredAt">=${from} AND s."occurredAt"<=${to}
      AND (${customerId}::text IS NULL OR c."id"=${customerId})
    GROUP BY c."id",c."name",c."taxId" ORDER BY turnover DESC`;
  const items=rows.map(r=>({...r,visits:n(r.visits),subtotal:n(r.subtotal),discount:n(r.discount),turnover:n(r.turnover),returns:n(r.returns),reversalCount:n(r.reversalCount)}));
  const summary=items.reduce((a,r)=>{a.customers++;a.visits+=r.visits;a.turnover+=r.turnover;a.discount+=r.discount;a.returns+=r.returns;a.reversalCount+=r.reversalCount;return a},{customers:0,visits:0,turnover:0,discount:0,returns:0,reversalCount:0});
  res.json({items,summary,from,to,reversalAware:true});
}catch(error){next(error)}});

router.get("/:customerId/ledger",async(req,res,next)=>{try{
  const companyId=req.user.companyId,c=await owned(companyId,req.params.customerId);if(!c)return res.status(404).json({error:"Δεν βρέθηκε ο πελάτης."});
  const rows=await prisma.$queryRaw`
    SELECT * FROM (
      SELECT s."id",s."occurredAt" AS "at",
        CASE WHEN s."source"='POS_REVERSAL' AND s."reversalKind"='CANCEL' THEN 'SALE_CANCEL'
             WHEN s."source"='POS_REVERSAL' AND s."reversalKind"='RETURN' THEN 'SALE_RETURN'
             WHEN s."transactionMode"='DELAYED' THEN 'SALE_DELAYED' ELSE 'SALE' END AS "type",
        s."total" AS "amount",COALESCE(s."receiptNumber",s."id") AS "reference",st."name" AS "storeName",
        CASE WHEN s."source"='POS_REVERSAL' THEN COALESCE(a."reason",'Αντίστροφη εγγραφή POS')
             WHEN s."transactionMode"='DELAYED' THEN COALESCE(s."delayedReason",'Ετεροχρονισμένη συναλλαγή') ELSE NULL END AS "note",
        s."originalSaleId" AS "originalSaleId",s."source" AS "saleSource",s."transactionMode",s."reversalKind"
      FROM "Sale" s JOIN "Store" st ON st."id"=s."storeId"
      LEFT JOIN LATERAL (SELECT pa."reason" FROM "PosSaleActionAudit" pa WHERE pa."companyId"=s."companyId" AND pa."storeId"=s."storeId" AND pa."saleId"=s."id" ORDER BY pa."createdAt" DESC LIMIT 1) a ON true
      WHERE s."companyId"=${companyId} AND s."customerId"=${c.id} AND s."status"='COMPLETED'
      UNION ALL
      SELECT l."id",l."createdAt" AS "at",l."entryType" AS "type",l."amount",COALESCE(l."referenceId",l."id") AS "reference",st."name" AS "storeName",l."note",
        NULL::text AS "originalSaleId",NULL::text AS "saleSource",NULL::text AS "transactionMode",NULL::text AS "reversalKind"
      FROM "CustomerLedger" l LEFT JOIN "Store" st ON st."id"=l."storeId" WHERE l."customerId"=${c.id}
    ) x ORDER BY x."at" DESC LIMIT 1000`;
  res.json({customer:{id:c.id,name:c.name,balance:n(c.balance)},rows:rows.map(r=>({...r,amount:n(r.amount)})),reversalAware:true});
}catch(error){next(error)}});

export default router;
