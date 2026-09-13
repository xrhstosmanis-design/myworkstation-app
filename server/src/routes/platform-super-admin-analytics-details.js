import {Router} from "express";
import crypto from "node:crypto";
import {z} from "zod";
import {prisma} from "../prisma.js";

const router=Router();
const cashTolerance=.009;
const cardTolerance=.02;
const findingLimit=500;
// A duplicate / payment-switch candidate must be an immediate cashier action, not two
// ordinary sales that merely happen to have the same basket later in the shift.
const premiumDuplicateWindowSeconds=40;
const premiumDuplicateMaxTransactionDistance=2;
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

const CHECK_PACKAGE_KEYS=["BASIC_CHECK","COMPLETE_CHECK","PREMIUM_CHECK"];
const packageIsActive=(row,now=Date.now())=>Boolean(row?.active)&&(!row.startsAt||new Date(row.startsAt).getTime()<=now)&&(!row.endsAt||new Date(row.endsAt).getTime()>=now);

const CHECK_PACKAGE_LEVELS={BASIC_CHECK:0,COMPLETE_CHECK:1,PREMIUM_CHECK:2};

async function checkPackageAccess(companyId,storeId){
  if(!companyId||!storeId)throw Object.assign(new Error("Για εκτέλεση ελέγχου επίλεξε συγκεκριμένο ιδιοκτήτη και κατάστημα."),{status:400});
  const rows=await prisma.$queryRaw`SELECT "moduleKey","active","startsAt","endsAt" FROM "StorePaidModule" WHERE "companyId"=${companyId} AND "storeId"=${storeId} AND "moduleKey"=ANY(${CHECK_PACKAGE_KEYS}::text[])`;
  const activeKeys=rows.filter(row=>packageIsActive(row)).map(row=>row.moduleKey);
  const level=Math.max(-1,...activeKeys.map(key=>CHECK_PACKAGE_LEVELS[key]??-1));
  if(level<0)throw Object.assign(new Error("Δεν είναι ενεργό πακέτο ελέγχου για το επιλεγμένο κατάστημα."),{status:403});
  return {level,activeKeys,basic:true,complete:level>=CHECK_PACKAGE_LEVELS.COMPLETE_CHECK,premium:level>=CHECK_PACKAGE_LEVELS.PREMIUM_CHECK};
}

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


async function completePaymentControls(body){
  const [withoutEvidence,duplicateGroups]=await Promise.all([
    prisma.$queryRaw`
      SELECT t."id",t."type",t."amount",t."occurredAt",t."supplierName",t."description",t."actorName",st."name" AS "storeName"
      FROM "StoreTransaction" t
      JOIN "Store" st ON st."id"=t."storeId" AND st."companyId"=t."companyId"
      JOIN "CashShiftSession" s ON s."id"=t."sessionId" AND s."companyId"=t."companyId" AND s."storeId"=t."storeId" AND s."status"='CLOSED'
      WHERE t."companyId"=${body.companyId} AND t."storeId"=${body.storeId}
        AND t."reversedAt" IS NULL AND t."type" IN ('SUPPLIER_PAYMENT','OTHER_EXPENSE')
        AND t."attachmentData" IS NULL AND COALESCE(t."attachmentMimeType",'')<>'application/vnd.myworkstation.purchase-document'
        AND (${body.from||null}::date IS NULL OR s."openedAt">=${body.from||null}::date)
        AND (${body.to||null}::date IS NULL OR s."openedAt"<(${body.to||null}::date + INTERVAL '1 day'))
      ORDER BY t."occurredAt" DESC,t."id" DESC LIMIT ${findingLimit}`,
    prisma.$queryRaw`
      SELECT MIN(t."occurredAt") AS "occurredAt",t."supplierId",COALESCE(NULLIF(MIN(t."supplierName"),''),MIN(sp."name"),'Χωρίς όνομα προμηθευτή') AS "supplierName",
        t."amount",COUNT(*)::int AS "transactionCount",ARRAY_AGG(t."id" ORDER BY t."occurredAt") AS "transactionIds",st."name" AS "storeName"
      FROM "StoreTransaction" t
      JOIN "Store" st ON st."id"=t."storeId" AND st."companyId"=t."companyId"
      LEFT JOIN "Supplier" sp ON sp."id"=t."supplierId" AND sp."companyId"=t."companyId"
      JOIN "CashShiftSession" s ON s."id"=t."sessionId" AND s."companyId"=t."companyId" AND s."storeId"=t."storeId" AND s."status"='CLOSED'
      WHERE t."companyId"=${body.companyId} AND t."storeId"=${body.storeId}
        AND t."reversedAt" IS NULL AND t."type"='SUPPLIER_PAYMENT' AND t."supplierId" IS NOT NULL
        AND (${body.from||null}::date IS NULL OR s."openedAt">=${body.from||null}::date)
        AND (${body.to||null}::date IS NULL OR s."openedAt"<(${body.to||null}::date + INTERVAL '1 day'))
      GROUP BY t."sessionId",t."supplierId",t."amount",DATE(t."occurredAt"),st."name"
      HAVING COUNT(*)>1
      ORDER BY MIN(t."occurredAt") DESC LIMIT ${findingLimit}`
  ]);
  const findings=[
    ...withoutEvidence.map(row=>({id:`payment-evidence:${row.id}`,code:"PAYMENT_WITHOUT_EVIDENCE",title:"Πληρωμή χωρίς συνημμένο παραστατικό",occurredAt:row.occurredAt,amount:number(row.amount),type:row.type,supplierName:row.supplierName||null,description:row.description||null,actorName:row.actorName||null,storeName:row.storeName||null,referenceId:row.id})),
    ...duplicateGroups.map(row=>({id:`payment-duplicate:${row.transactionIds?.join(':')||row.supplierId}`,code:"POTENTIAL_DUPLICATE_SUPPLIER_PAYMENT",title:"Πιθανή διπλή πληρωμή προμηθευτή",occurredAt:row.occurredAt,amount:number(row.amount),transactionCount:Number(row.transactionCount||0),supplierName:row.supplierName||null,storeName:row.storeName||null,referenceId:(row.transactionIds||[]).join(', ')}))
  ];
  return {enabled:true,readOnly:true,findings,withoutEvidenceCount:withoutEvidence.length,potentialDuplicateCount:duplicateGroups.length,status:findings.length?"Χρειάζεται έλεγχο":"ΟΚ"};
}

async function premiumVarianceControls(body){
  // Every correlation is constrained by the immutable cash-shift session.  We deliberately
  // never compare transactions from two different shifts, even when their baskets match.
  // Older stores may not have the newer POS audit tables yet. Their absence must never
  // prevent the final cash-shift result from being produced.
  const [actionAuditTable,safetyAuditTable,operationalTable]=await Promise.all([
    prisma.$queryRaw`SELECT to_regclass('"PosSaleActionAudit"')::text IS NOT NULL AS "exists"`,
    prisma.$queryRaw`SELECT to_regclass('"PosSaleSafetyAudit"')::text IS NOT NULL AS "exists"`,
    prisma.$queryRaw`SELECT to_regclass('"PosOperationalEvent"')::text IS NOT NULL AS "exists"`
  ]);
  const hasActionAudit=Boolean(actionAuditTable[0]?.exists),hasSafetyAudit=Boolean(safetyAuditTable[0]?.exists),hasOperationalEvents=Boolean(operationalTable[0]?.exists);
  const [sessions,sales,reversalAudits,safetyAudits,operationalTables]=await Promise.all([
    prisma.$queryRaw`
      SELECT sh."id" AS "sessionId",sh."shiftLabel",sh."terminalPos",sh."openedByName",sh."closedByName",sh."openedAt",sh."closedAt",
        COALESCE(sh."variance",0)::float AS "cashVariance",COALESCE(sh."cardVariance",0)::float AS "cardVariance",
        COALESCE(sh."actualOperational",0)::float AS "closingOperational",next."id" AS "nextSessionId",next."shiftLabel" AS "nextShiftLabel",next."terminalPos" AS "nextTerminalPos",next."openedByName" AS "nextOpenedByName",next."openedAt" AS "nextOpenedAt",COALESCE(next."openingOperational",0)::float AS "nextOpeningOperational"
      FROM "CashShiftSession" sh
      LEFT JOIN LATERAL (SELECT n."id",n."shiftLabel",n."terminalPos",n."openedByName",n."openedAt",n."openingOperational" FROM "CashShiftSession" n WHERE n."companyId"=sh."companyId" AND n."storeId"=sh."storeId" AND n."terminalPos"=sh."terminalPos" AND n."openedAt">COALESCE(sh."closedAt",sh."openedAt") ORDER BY n."openedAt" LIMIT 1) next ON TRUE
      WHERE sh."companyId"=${body.companyId} AND sh."storeId"=${body.storeId} AND sh."status"='CLOSED'
        AND (${body.from||null}::date IS NULL OR sh."openedAt">=${body.from||null}::date)
        AND (${body.to||null}::date IS NULL OR sh."openedAt"<(${body.to||null}::date + INTERVAL '1 day'))
      ORDER BY sh."openedAt" DESC LIMIT ${findingLimit}`,
    prisma.$queryRaw`
      SELECT DISTINCT ON (s."id") sh."id" AS "sessionId",sh."shiftLabel",sh."terminalPos",sh."openedAt",sh."closedAt",
        s."id" AS "saleId",s."receiptNumber",s."total"::float AS "total",s."occurredAt",s."createdAt",t."actorId",t."actorName",
        COALESCE(lines."basketSignature",'') AS "basketSignature",COALESCE(lines."basketLines",'') AS "basketLines",COALESCE(payments."paymentMethods",'') AS "paymentMethods"
      FROM "CashShiftSession" sh
      JOIN "StoreTransaction" t ON t."companyId"=sh."companyId" AND t."storeId"=sh."storeId" AND t."sessionId"=sh."id" AND t."reversedAt" IS NULL AND t."type" IN ('SALE_CASH','SALE_CARD','SALE_IRIS')
      JOIN "Sale" s ON s."companyId"=sh."companyId" AND s."storeId"=sh."storeId" AND s."status"='COMPLETED' AND s."source" IN ('POS','ONLINE_POS')
        AND t."description" LIKE ('%POS πώληση ' || s."id" || ' ·%')
      LEFT JOIN LATERAL (SELECT string_agg(COALESCE(l."productId",l."description",'—') || ':' || l."quantity"::text || ':' || l."lineTotal"::text,'|' ORDER BY COALESCE(l."productId",l."description",'—'),l."quantity",l."lineTotal") AS "basketSignature",string_agg(COALESCE(l."description",l."productId",'—') || ' × ' || l."quantity"::text || ' = ' || l."lineTotal"::text || ' €',' · ' ORDER BY l."createdAt",l."id") AS "basketLines" FROM "SaleLine" l WHERE l."saleId"=s."id") lines ON TRUE
      LEFT JOIN LATERAL (SELECT string_agg(p."method" || ':' || p."amount"::text,'|' ORDER BY p."method",p."amount") AS "paymentMethods" FROM "Payment" p WHERE p."saleId"=s."id") payments ON TRUE
      WHERE sh."companyId"=${body.companyId} AND sh."storeId"=${body.storeId} AND sh."status"='CLOSED'
        AND (${body.from||null}::date IS NULL OR sh."openedAt">=${body.from||null}::date)
        AND (${body.to||null}::date IS NULL OR sh."openedAt"<(${body.to||null}::date + INTERVAL '1 day'))
      ORDER BY sh."id",COALESCE(s."occurredAt",s."createdAt"),s."id" LIMIT ${findingLimit}`,
    hasActionAudit?prisma.$queryRaw`
      SELECT sh."id" AS "sessionId",sh."shiftLabel",sh."terminalPos",a."id",a."saleId",a."relatedSaleId",a."actionType",a."reason",a."actorName",a."createdAt",a."details"
      FROM "PosSaleActionAudit" a JOIN "CashShiftSession" sh ON sh."companyId"=a."companyId" AND sh."storeId"=a."storeId" AND sh."status"='CLOSED' AND COALESCE(a."details"->>'sessionId','')=sh."id"
      WHERE a."companyId"=${body.companyId} AND a."storeId"=${body.storeId} AND a."actionType" IN ('CANCEL','RETURN','RETURN_ITEMS')
        AND (${body.from||null}::date IS NULL OR sh."openedAt">=${body.from||null}::date) AND (${body.to||null}::date IS NULL OR sh."openedAt"<(${body.to||null}::date + INTERVAL '1 day'))
      ORDER BY a."createdAt" DESC LIMIT ${findingLimit}`:Promise.resolve([]),
    hasSafetyAudit?prisma.$queryRaw`
      SELECT sh."id" AS "sessionId",sh."shiftLabel",sh."terminalPos",a."id",a."saleId",a."relatedSaleId",a."eventType",a."actorName",a."createdAt",a."details"
      FROM "PosSaleSafetyAudit" a JOIN "CashShiftSession" sh ON sh."companyId"=a."companyId" AND sh."storeId"=a."storeId" AND sh."status"='CLOSED' AND EXISTS (SELECT 1 FROM "StoreTransaction" t WHERE t."companyId"=sh."companyId" AND t."storeId"=sh."storeId" AND t."sessionId"=sh."id" AND (COALESCE(t."description",'') LIKE ('%' || COALESCE(a."saleId",'') || '%') OR COALESCE(t."description",'') LIKE ('%' || COALESCE(a."relatedSaleId",'') || '%')))
      WHERE a."companyId"=${body.companyId} AND a."storeId"=${body.storeId} AND a."eventType" IN ('DUPLICATE_CONFIRMED','DUPLICATE_BLOCKED','IDEMPOTENT_REPLAY')
        AND (${body.from||null}::date IS NULL OR sh."openedAt">=${body.from||null}::date) AND (${body.to||null}::date IS NULL OR sh."openedAt"<(${body.to||null}::date + INTERVAL '1 day'))
      ORDER BY a."createdAt" DESC LIMIT ${findingLimit}`:Promise.resolve([]),
    Promise.resolve([{exists:hasOperationalEvents}])
  ]);
  const salesBySession=new Map();
  for(const sale of sales){const list=salesBySession.get(sale.sessionId)||[];list.push(sale);salesBySession.set(sale.sessionId,list)}
  const findings=[];
  for(const group of salesBySession.values()){
    group.sort((a,b)=>new Date(a.occurredAt||a.createdAt)-new Date(b.occurredAt||b.createdAt)||String(a.saleId).localeCompare(String(b.saleId)));
    for(let index=1;index<group.length;index++)for(let distance=1;distance<=premiumDuplicateMaxTransactionDistance&&distance<=index;distance++){
      const previous=group[index-distance],current=group[index];
      const seconds=Math.abs(new Date(current.occurredAt||current.createdAt)-new Date(previous.occurredAt||previous.createdAt))/1000;
      const sameOperator=(previous.actorId||previous.actorName||"unknown")===(current.actorId||current.actorName||"unknown");
      const sameBasket=previous.basketSignature===current.basketSignature&&number(previous.total).toFixed(2)===number(current.total).toFixed(2);
      if(seconds>premiumDuplicateWindowSeconds||!sameOperator||!sameBasket)continue;
      const paymentChanged=previous.paymentMethods!==current.paymentMethods;
      findings.push({id:`sale-match:${previous.saleId}:${current.saleId}`,code:paymentChanged?"POTENTIAL_PAYMENT_SWITCH_DUPLICATE":"POTENTIAL_DUPLICATE_SALE",title:paymentChanged?"Πιθανή αλλαγή μετρητά/κάρτα χωρίς αντίστροφη εγγραφή":"Πιθανή διπλή POS συναλλαγή",sessionId:current.sessionId,shiftLabel:current.shiftLabel,terminalPos:current.terminalPos,occurredAt:current.occurredAt||current.createdAt,operatorName:current.actorName||"Χωρίς διαθέσιμο χειριστή",amount:number(current.total),saleIds:[previous.saleId,current.saleId],paymentMethods:[previous.paymentMethods,current.paymentMethods],secondsApart:Number(seconds.toFixed(0)),transactionDistance:distance,basketMatched:true,transactions:[previous,current].map(sale=>({saleId:sale.saleId,receiptNumber:sale.receiptNumber||null,occurredAt:sale.occurredAt||sale.createdAt,total:number(sale.total),paymentMethods:sale.paymentMethods||"—",items:sale.basketLines||"—"})),possibleExplanation:paymentChanged?`Ίδιο καλάθι και ποσό καταχωρήθηκαν με διαφορετικό τρόπο πληρωμής σε ${Number(seconds.toFixed(0))}″ (${distance===1?"αμέσως επόμενη":"μεθεπόμενη"} συναλλαγή). Επιβεβαίωσε αν η αρχική πληρωμή ακυρώθηκε/επιστράφηκε.`:`Ίδιο καλάθι, ποσό και τρόπος πληρωμής καταχωρήθηκαν δύο φορές σε ${Number(seconds.toFixed(0))}″ (${distance===1?"αμέσως επόμενη":"μεθεπόμενη"} συναλλαγή). Επιβεβαίωσε πριν αποδώσεις αιτία στην απόκλιση.`});
    }
  }
  const reversalGroups=new Map();
  for(const row of reversalAudits){const saleId=row.relatedSaleId||row.saleId;if(!saleId)continue;const key=`${row.sessionId}:${saleId}`,list=reversalGroups.get(key)||[];list.push(row);reversalGroups.set(key,list)}
  for(const [key,group] of reversalGroups)if(group.length>1){const saleId=key.split(":").slice(1).join(":");findings.push({id:`reversal-repeat:${key}`,code:"POTENTIAL_REPEATED_REVERSAL",title:"Πιθανές επαναλαμβανόμενες ακυρώσεις / επιστροφές",sessionId:group[0].sessionId,shiftLabel:group[0].shiftLabel,terminalPos:group[0].terminalPos,saleIds:[saleId],occurredAt:group[0].createdAt,operatorName:group[0].actorName||"—",transactionCount:group.length,possibleExplanation:"Περισσότερα από ένα audit ακύρωσης/επιστροφής για την ίδια αρχική πώληση μέσα στην ίδια βάρδια. Χρειάζεται αντιπαραβολή με τις αντίστροφες εγγραφές."})}
  for(const row of safetyAudits)findings.push({id:`safety:${row.id}`,code:row.eventType,title:row.eventType==="DUPLICATE_CONFIRMED"?"Επιβεβαιωμένη διπλή καταχώριση POS":"Συμβάν ασφάλειας διπλής/επανάληψης POS",sessionId:row.sessionId,shiftLabel:row.shiftLabel,terminalPos:row.terminalPos,saleIds:[row.saleId,row.relatedSaleId].filter(Boolean),occurredAt:row.createdAt,operatorName:row.actorName||"—",possibleExplanation:"Το POS κατέγραψε συμβάν προστασίας διπλής συναλλαγής. Είναι ένδειξη για έλεγχο, όχι αυτόματη απόδοση ευθύνης."});
  if(operationalTables[0]?.exists){
    const operationalEvents=await prisma.$queryRaw`
      SELECT e."id",e."sessionId",e."operatorName",e."type",e."total"::float AS "total",e."createdAt",sh."shiftLabel",sh."terminalPos"
      FROM "PosOperationalEvent" e JOIN "CashShiftSession" sh ON sh."id"=e."sessionId" AND sh."companyId"=e."companyId" AND sh."storeId"=e."storeId" AND sh."status"='CLOSED'
      WHERE e."companyId"=${body.companyId} AND e."storeId"=${body.storeId} AND e."type" ~* '(DELETE|REMOVE|VOID|CANCEL)'
        AND (${body.from||null}::date IS NULL OR sh."openedAt">=${body.from||null}::date) AND (${body.to||null}::date IS NULL OR sh."openedAt"<(${body.to||null}::date + INTERVAL '1 day'))
      ORDER BY e."createdAt" DESC LIMIT ${findingLimit}`;
    for(const row of operationalEvents)findings.push({id:`operational:${row.id}`,code:"UNMATCHED_POS_OPERATION",title:"Διαγραφή / ακύρωση POS που χρειάζεται αντιπαραβολή",sessionId:row.sessionId,shiftLabel:row.shiftLabel,terminalPos:row.terminalPos,occurredAt:row.createdAt,operatorName:row.operatorName||"—",amount:number(row.total),possibleExplanation:"Υπάρχει λειτουργικό συμβάν διαγραφής ή ακύρωσης στην ίδια βάρδια. Επιβεβαίωσε αν προηγήθηκε φυσική πληρωμή χωρίς σωστή αντίστροφη εγγραφή πριν το χρησιμοποιήσεις ως εξήγηση πλεονάσματος."});
  }
  // Older installations may not have operational events; this is exposed explicitly instead of guessing.
  const byShift=new Map();for(const finding of findings){if(!finding.sessionId)continue;const list=byShift.get(finding.sessionId)||[];list.push(finding);byShift.set(finding.sessionId,list)}
  const shiftResults=sessions.map(session=>{const evidence=byShift.get(session.sessionId)||[],cashVariance=number(session.cashVariance),cardVariance=number(session.cardVariance),handoverDelta=session.nextOpenedAt?number(session.nextOpeningOperational)-number(session.closingOperational):null;const handoverMatched=handoverDelta===null||Math.abs(handoverDelta)<=cashTolerance;if(!handoverMatched)evidence.push({id:`handover:${session.sessionId}`,code:"SHIFT_HANDOVER_DIFFERENCE",title:"Απόκλιση παράδοσης προς επόμενη βάρδια",handover:{closingSessionId:session.sessionId,closingShiftLabel:session.shiftLabel||null,closingTerminalPos:session.terminalPos||null,closingAt:session.closedAt||null,closingOperational:number(session.closingOperational),nextSessionId:session.nextSessionId||null,nextShiftLabel:session.nextShiftLabel||null,nextTerminalPos:session.nextTerminalPos||null,nextOpenedByName:session.nextOpenedByName||null,nextOpenedAt:session.nextOpenedAt,nextOpeningOperational:number(session.nextOpeningOperational)},possibleExplanation:`Το κλείσιμο ${number(session.closingOperational).toFixed(2)} € δεν συμφωνεί με το επόμενο άνοιγμα ${number(session.nextOpeningOperational).toFixed(2)} €. Δεν γίνεται αυτόματος συμψηφισμός.`});return{...session,cashVariance,cardVariance,handoverDelta,handoverMatched,evidence,finalStatus:evidence.length?"FINAL_WITH_TRACED_EVIDENCE":Math.abs(cashVariance)>cashTolerance||Math.abs(cardVariance)>cardTolerance?"FINAL_UNEXPLAINED_VARIANCE":"FINAL_RECONCILED",finalLabel:evidence.length?"Τελικό αποτέλεσμα με τεκμηριωμένες κινήσεις":Math.abs(cashVariance)>cashTolerance||Math.abs(cardVariance)>cardTolerance?"Τελικό ανεξήγητο υπόλοιπο":"Τελική συμφωνία",approvalRequired:true}});
  return {enabled:true,readOnly:true,scope:"PER_CLOSED_SHIFT_ONLY",shiftResults,findings:findings.slice(0,findingLimit),potentialDuplicateSaleCount:findings.filter(item=>item.code.includes("DUPLICATE")||item.code.includes("PAYMENT_SWITCH")).length,potentialRepeatedReversalCount:findings.filter(item=>item.code==="POTENTIAL_REPEATED_REVERSAL").length,operationalEventsAvailable:Boolean(operationalTables[0]?.exists),status:"Τελική ανάλυση ανά βάρδια"};
}

router.post("/super-admin-analytics/execute",async(req,res,next)=>{
  try{
    const body=filterSchema.parse(req.body||{});
    const packageAccess=await checkPackageAccess(body.companyId,body.storeId);
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
    const complete=packageAccess.complete?await completePaymentControls(body):{enabled:false,reason:"Ενεργοποίησε COMPLETE ή PREMIUM Έλεγχο για έλεγχο πληρωμών και παραστατικών."};
    const premium=packageAccess.premium?await premiumVarianceControls(body):{enabled:false,reason:"Ενεργοποίησε PREMIUM Έλεγχο για επαναλαμβανόμενες αποκλίσεις."};
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
      complete,
      premium,
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
