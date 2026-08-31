import {Router} from "express";
import crypto from "node:crypto";
import {z} from "zod";
import {prisma} from "../prisma.js";

const router=Router();
const cashTolerance=.009;
const cardTolerance=.02;
const findingLimit=500;
const number=value=>Number(value||0);
const isSuperAdmin=req=>req.user?.isSuperAdmin===true||req.user?.platformRole==="SUPER_ADMIN"||req.user?.role==="SUPER_ADMIN";

const filterSchema=z.object({
  companyId:z.string().trim().min(1).optional(),
  storeId:z.string().trim().min(1).optional(),
  from:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
}).superRefine((value,ctx)=>{
  if(value.from&&value.to&&value.from>value.to)ctx.addIssue({code:z.ZodIssueCode.custom,path:["to"],message:"Η ημερομηνία «Από» δεν μπορεί να είναι μεταγενέστερη από την ημερομηνία «Έως»."});
});

const reviewSchema=z.object({
  companyId:z.string().trim().min(1),
  storeId:z.string().trim().min(1),
  decision:z.enum(["EXPLANATION","CONFIRMED_SHORTAGE","REVIEWED_NO_CHANGE"]),
  amount:z.coerce.number().finite().min(0).max(999999999).default(0),
  note:z.string().trim().min(5).max(1000)
}).superRefine((value,ctx)=>{
  if(value.decision==="EXPLANATION"&&value.amount<=0)ctx.addIssue({code:z.ZodIssueCode.custom,path:["amount"],message:"Η εξήγηση χρειάζεται θετικό ποσό."});
});

router.use((req,res,next)=>{
  if(!isSuperAdmin(req))return res.status(403).json({error:"Απαιτείται πρόσβαση Platform Super Admin."});
  next();
});

const reviewDecisionLabel=decision=>({
  EXPLANATION:"Καταχωρισμένη εξήγηση",
  CONFIRMED_SHORTAGE:"Επιβεβαιωμένο έλλειμμα",
  REVIEWED_NO_CHANGE:"Ελεγμένο χωρίς αλλαγή"
}[decision]||"Καταχωρισμένος έλεγχος");

function snapshotFromSession(session){
  return{
    transactionCount:Number(session.transactionCount||0),
    activeTotal:number(session.activeTotal),
    expenseTotal:number(session.expenseTotal),
    reversedCount:Number(session.reversedCount||0),
    lastMovementAt:session.lastMovementAt?new Date(session.lastMovementAt).toISOString():null
  };
}

function normalizeSnapshot(snapshot){
  return{
    transactionCount:Number(snapshot?.transactionCount||0),
    activeTotal:number(snapshot?.activeTotal),
    expenseTotal:number(snapshot?.expenseTotal),
    reversedCount:Number(snapshot?.reversedCount||0),
    lastMovementAt:snapshot?.lastMovementAt?new Date(snapshot.lastMovementAt).toISOString():null
  };
}

function sameSnapshot(left,right){
  return JSON.stringify(normalizeSnapshot(left))===JSON.stringify(normalizeSnapshot(right));
}

async function reviewSnapshot(companyId,storeId,sessionId){
  const rows=await prisma.$queryRaw`
    SELECT COUNT(*)::int AS "transactionCount",
      COALESCE(SUM("amount") FILTER (WHERE "reversedAt" IS NULL),0)::float AS "activeTotal",
      COALESCE(SUM("amount") FILTER (WHERE "type" IN ('SUPPLIER_PAYMENT','OTHER_EXPENSE') AND "reversedAt" IS NULL),0)::float AS "expenseTotal",
      COUNT(*) FILTER (WHERE "reversedAt" IS NOT NULL)::int AS "reversedCount",
      MAX(GREATEST("createdAt",COALESCE("reversedAt","createdAt"))) AS "lastMovementAt"
    FROM "StoreTransaction"
    WHERE "companyId"=${companyId} AND "storeId"=${storeId} AND "sessionId"=${sessionId}`;
  return snapshotFromSession(rows[0]||{});
}

function findingFromSession(session){
  const cashVariance=number(session.cashVariance),cardVariance=number(session.cardVariance);
  const cashIssue=Math.abs(cashVariance)>cashTolerance,cardIssue=Math.abs(cardVariance)>cardTolerance;
  const eventCode=cashIssue&&cardIssue?"CASH_AND_POS_EFTPOS_VARIANCE":cashIssue?"CASH_VARIANCE":"POS_EFTPOS_VARIANCE";
  const eventLabel=cashIssue&&cardIssue
    ?"Διαφορά μετρητών και POS–EFTPOS"
    :cashIssue
      ?cashVariance<0?"Έλλειμμα μετρητών":"Πλεόνασμα μετρητών"
      :"Διαφορά POS–EFTPOS";
  const currentSnapshot=snapshotFromSession(session);
  const hasReview=Boolean(session.reviewId);
  const reviewValid=hasReview&&sameSnapshot(session.reviewSnapshotJson,currentSnapshot);
  const recheckRequired=hasReview&&!reviewValid;
  const reviewLabel=reviewValid?reviewDecisionLabel(session.reviewDecision):recheckRequired?"Απαιτείται επανέλεγχος":"Χρειάζεται έλεγχο";
  return{
    id:`${session.sessionId}:${eventCode}`,
    eventCode,
    eventLabel,
    eventSource:"Κλείσιμο βάρδιας",
    occurredAt:session.closedAt||session.openedAt||null,
    sessionId:session.sessionId,
    referenceType:"CASH_SHIFT_SESSION",
    referenceId:session.sessionId,
    companyId:session.companyId,
    companyName:session.companyName,
    storeId:session.storeId,
    storeName:session.storeName,
    shiftLabel:session.shiftLabel||null,
    terminalPos:session.terminalPos||null,
    operatorName:session.closedByName||session.openedByName||null,
    openedByName:session.openedByName||null,
    closedByName:session.closedByName||null,
    openedAt:session.openedAt||null,
    closedAt:session.closedAt||null,
    cashVariance,
    cardVariance,
    reviewId:session.reviewId||null,
    reviewDecision:session.reviewDecision||null,
    reviewAmount:number(session.reviewAmount),
    reviewNote:session.reviewNote||null,
    reviewedBy:session.reviewedBy||null,
    reviewedAt:session.reviewedAt||null,
    reviewValid,
    recheckRequired,
    reviewStatus:reviewValid?"REVIEWED":recheckRequired?"RECHECK_REQUIRED":"PENDING",
    reviewLabel,
    status:reviewLabel
  };
}

router.post("/super-admin-analytics/execute",async(req,res,next)=>{
  try{
    const body=filterSchema.parse(req.body||{});
    const [rows,findingSessions]=await Promise.all([
      prisma.$queryRaw`
        SELECT s."storeId",s."companyId",COUNT(*)::int AS "shifts",
          COALESCE(SUM(s."variance"),0)::float AS "cashVariance",
          COALESCE(SUM(s."cardVariance"),0)::float AS "cardVariance"
        FROM "CashShiftSession" s
        WHERE s."status"='CLOSED'
          AND (${body.companyId||null}::text IS NULL OR s."companyId"=${body.companyId||null})
          AND (${body.storeId||null}::text IS NULL OR s."storeId"=${body.storeId||null})
          AND (${body.from||null}::date IS NULL OR s."openedAt">=${body.from||null}::date)
          AND (${body.to||null}::date IS NULL OR s."openedAt"<(${body.to||null}::date + INTERVAL '1 day'))
        GROUP BY s."storeId",s."companyId"
        ORDER BY s."companyId",s."storeId"`,
      prisma.$queryRaw`
        SELECT s."id" AS "sessionId",s."companyId",c."name" AS "companyName",s."storeId",st."name" AS "storeName",
          s."shiftLabel",s."terminalPos",s."openedByName",s."closedByName",s."openedAt",s."closedAt",
          COALESCE(s."variance",0)::float AS "cashVariance",COALESCE(s."cardVariance",0)::float AS "cardVariance",
          review."id" AS "reviewId",review."decision" AS "reviewDecision",COALESCE(review."amount",0)::float AS "reviewAmount",
          review."note" AS "reviewNote",review."actorName" AS "reviewedBy",review."createdAt" AS "reviewedAt",
          review."snapshotJson" AS "reviewSnapshotJson",
          COALESCE(movement."transactionCount",0)::int AS "transactionCount",
          COALESCE(movement."activeTotal",0)::float AS "activeTotal",
          COALESCE(movement."expenseTotal",0)::float AS "expenseTotal",
          COALESCE(movement."reversedCount",0)::int AS "reversedCount",
          movement."lastMovementAt"
        FROM "CashShiftSession" s
        JOIN "Store" st ON st."id"=s."storeId" AND st."companyId"=s."companyId"
        JOIN "Company" c ON c."id"=s."companyId"
        LEFT JOIN LATERAL (
          SELECT r."id",r."decision",r."amount",r."note",r."actorName",r."createdAt",r."snapshotJson"
          FROM "CashControlReview" r
          WHERE r."companyId"=s."companyId" AND r."storeId"=s."storeId" AND r."sessionId"=s."id"
          ORDER BY r."createdAt" DESC
          LIMIT 1
        ) review ON TRUE
        LEFT JOIN LATERAL (
          SELECT COUNT(*)::int AS "transactionCount",
            COALESCE(SUM(t."amount") FILTER (WHERE t."reversedAt" IS NULL),0)::float AS "activeTotal",
            COALESCE(SUM(t."amount") FILTER (WHERE t."type" IN ('SUPPLIER_PAYMENT','OTHER_EXPENSE') AND t."reversedAt" IS NULL),0)::float AS "expenseTotal",
            COUNT(*) FILTER (WHERE t."reversedAt" IS NOT NULL)::int AS "reversedCount",
            MAX(GREATEST(t."createdAt",COALESCE(t."reversedAt",t."createdAt"))) AS "lastMovementAt"
          FROM "StoreTransaction" t
          WHERE t."companyId"=s."companyId" AND t."storeId"=s."storeId" AND t."sessionId"=s."id"
        ) movement ON TRUE
        WHERE s."status"='CLOSED'
          AND (${body.companyId||null}::text IS NULL OR s."companyId"=${body.companyId||null})
          AND (${body.storeId||null}::text IS NULL OR s."storeId"=${body.storeId||null})
          AND (${body.from||null}::date IS NULL OR s."openedAt">=${body.from||null}::date)
          AND (${body.to||null}::date IS NULL OR s."openedAt"<(${body.to||null}::date + INTERVAL '1 day'))
          AND (ABS(COALESCE(s."variance",0)::float)>${cashTolerance} OR ABS(COALESCE(s."cardVariance",0)::float)>${cardTolerance})
        ORDER BY COALESCE(s."closedAt",s."openedAt") DESC,s."id" DESC
        LIMIT ${findingLimit}`
    ]);
    const normalizedRows=rows.map(row=>({...row,cashVariance:number(row.cashVariance),cardVariance:number(row.cardVariance)}));
    const findings=findingSessions.map(findingFromSession);
    const pendingFindingCount=findings.filter(finding=>finding.reviewValid!==true).length;
    const reviewedFindingCount=findings.length-pendingFindingCount;
    await prisma.authAudit.create({data:{
      userId:req.user.id,
      email:req.user.email||"super-admin",
      event:"SUPER_ADMIN_ANALYTICS_EXECUTED",
      success:true,
      deviceName:`Analytics · ${body.companyId||"ALL"} · ${body.storeId||"ALL"} · ${pendingFindingCount} pending / ${findings.length} total`,
      userAgent:req.headers["user-agent"]||null,
      ipAddress:req.ip||null
    }});
    res.json({
      ok:true,
      rows:normalizedRows,
      findings,
      pendingFindingCount,
      reviewedFindingCount,
      status:findings.length===0?"ΟΚ":pendingFindingCount?"Χρειάζεται έλεγχο":"Καταχωρισμένοι έλεγχοι",
      timeZone:"Europe/Athens",
      findingLimit,
      findingsTruncated:findingSessions.length>=findingLimit,
      readOnly:true,
      reviewWorkflow:true,
      automaticEmployeeAccusation:false
    });
  }catch(error){next(error)}
});

router.post("/super-admin-analytics/sessions/:sessionId/reviews",async(req,res,next)=>{
  try{
    const body=reviewSchema.parse(req.body||{});
    const sessions=await prisma.$queryRaw`
      SELECT s."id" AS "sessionId",s."companyId",c."name" AS "companyName",s."storeId",st."name" AS "storeName",
        s."status",s."shiftLabel",s."terminalPos",s."openedByName",s."closedByName",s."openedAt",s."closedAt",
        COALESCE(s."variance",0)::float AS "cashVariance",COALESCE(s."cardVariance",0)::float AS "cardVariance"
      FROM "CashShiftSession" s
      JOIN "Store" st ON st."id"=s."storeId" AND st."companyId"=s."companyId"
      JOIN "Company" c ON c."id"=s."companyId"
      WHERE s."id"=${req.params.sessionId} AND s."companyId"=${body.companyId} AND s."storeId"=${body.storeId}
      LIMIT 1`;
    const session=sessions[0];
    if(!session)return res.status(404).json({error:"Δεν βρέθηκε η βάρδια στην επιλεγμένη εταιρεία και το κατάστημα."});
    if(session.status!=="CLOSED")return res.status(409).json({error:"Ο έλεγχος καταχωρίζεται μόνο σε κλεισμένη βάρδια."});
    if(body.decision==="CONFIRMED_SHORTAGE"&&number(session.cashVariance)>=-cashTolerance)return res.status(409).json({error:"Η βάρδια δεν έχει έλλειμμα μετρητών για επιβεβαίωση."});
    const amount=body.decision==="REVIEWED_NO_CHANGE"
      ?0
      :body.amount>0
        ?body.amount
        :Math.abs(number(session.cashVariance));
    const snapshot=await reviewSnapshot(session.companyId,session.storeId,session.sessionId);
    const id=crypto.randomUUID(),actorName=req.user.fullName||req.user.email||"Super Admin";
    const rows=await prisma.$queryRaw`
      INSERT INTO "CashControlReview" ("id","companyId","storeId","sessionId","decision","amount","note","actorId","actorName","snapshotJson")
      VALUES (${id},${session.companyId},${session.storeId},${session.sessionId},${body.decision},${amount},${body.note},${req.user.id},${actorName},${JSON.stringify(snapshot)}::jsonb)
      RETURNING "id","decision","amount","note","actorName","createdAt"`;
    const review=rows[0];
    await prisma.authAudit.create({data:{
      userId:req.user.id,
      email:req.user.email||"super-admin",
      event:"SUPER_ADMIN_ANALYTICS_FINDING_REVIEWED",
      success:true,
      deviceName:`${session.companyName} · ${session.storeName} · ${session.sessionId} · ${body.decision}`,
      userAgent:req.headers["user-agent"]||null,
      ipAddress:req.ip||null
    }});
    res.status(201).json({
      ok:true,
      reviewId:review.id,
      reviewDecision:review.decision,
      reviewAmount:number(review.amount),
      reviewNote:review.note,
      reviewedBy:review.actorName,
      reviewedAt:review.createdAt,
      reviewValid:true,
      recheckRequired:false,
      reviewStatus:"REVIEWED",
      reviewLabel:reviewDecisionLabel(review.decision),
      status:reviewDecisionLabel(review.decision),
      financialDataMutated:false
    });
  }catch(error){next(error)}
});

export default router;
