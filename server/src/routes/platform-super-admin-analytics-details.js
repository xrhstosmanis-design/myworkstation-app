import {Router} from "express";
import {z} from "zod";
import {prisma} from "../prisma.js";

const router=Router();
const cashTolerance=.009;
const cardTolerance=.02;
const findingLimit=5000;
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

router.use((req,res,next)=>{
  if(!isSuperAdmin(req))return res.status(403).json({error:"Απαιτείται πρόσβαση Platform Super Admin."});
  next();
});

function findingFromSession(session){
  const cashVariance=number(session.cashVariance),cardVariance=number(session.cardVariance);
  const cashIssue=Math.abs(cashVariance)>cashTolerance,cardIssue=Math.abs(cardVariance)>cardTolerance;
  const eventCode=cashIssue&&cardIssue?"CASH_AND_POS_EFTPOS_VARIANCE":cashIssue?"CASH_VARIANCE":"POS_EFTPOS_VARIANCE";
  const eventLabel=cashIssue&&cardIssue
    ?"Διαφορά μετρητών και POS–EFTPOS"
    :cashIssue
      ?cashVariance<0?"Έλλειμμα μετρητών":"Πλεόνασμα μετρητών"
      :"Διαφορά POS–EFTPOS";
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
    status:"Χρειάζεται έλεγχος"
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
          COALESCE(s."variance",0)::float AS "cashVariance",COALESCE(s."cardVariance",0)::float AS "cardVariance"
        FROM "CashShiftSession" s
        JOIN "Store" st ON st."id"=s."storeId" AND st."companyId"=s."companyId"
        JOIN "Company" c ON c."id"=s."companyId"
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
    await prisma.authAudit.create({data:{
      userId:req.user.id,
      email:req.user.email||"super-admin",
      event:"SUPER_ADMIN_ANALYTICS_EXECUTED",
      success:true,
      deviceName:`Read-only analytics · ${body.companyId||"ALL"} · ${body.storeId||"ALL"} · ${findings.length} findings`,
      userAgent:req.headers["user-agent"]||null,
      ipAddress:req.ip||null
    }});
    res.json({
      ok:true,
      rows:normalizedRows,
      findings,
      status:findings.length?"Χρειάζεται έλεγχος":"ΟΚ",
      timeZone:"Europe/Athens",
      findingLimit,
      findingsTruncated:findingSessions.length>=findingLimit,
      readOnly:true,
      automaticEmployeeAccusation:false
    });
  }catch(error){next(error)}
});

export default router;
