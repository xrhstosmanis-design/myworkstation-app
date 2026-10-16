// All functions are read-only. Stored reviews and the source ledger remain unchanged.
const money=value=>Number(Number(value||0).toFixed(2));
const cents=value=>Math.round(Number(Number(value).toFixed(2))*100);
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
export const sameCashReviewSnapshot=(left,right)=>JSON.stringify(canonical(left||{}))===JSON.stringify(canonical(right||{}));

export function confirmedExplanationBalance(initialVariance,explanations,{enabled=true}={}){
  const initial=initialVariance==null?NaN:Number(initialVariance),initialCents=cents(initial);
  const result={initialVariance:Number.isFinite(initial)?money(initial):null,explainedAmount:null,unexplainedVariance:null};
  if(!enabled)return {...result,status:'NOT_APPLICABLE',explainedAmount:0,unexplainedVariance:0};
  if(!Number.isSafeInteger(initialCents))return {...result,status:'RECHECK_REQUIRED',reason:'INVALID_INITIAL_VARIANCE'};
  let explainedCents=0;
  for(const review of explanations){
    const value=review.amount==null?NaN:Number(review.amount),amount=cents(value);
    if(!Number.isSafeInteger(amount)||amount<=0)return {...result,status:'RECHECK_REQUIRED',reason:'INVALID_EXPLANATION_AMOUNT'};
    explainedCents+=amount;
    if(!Number.isSafeInteger(explainedCents))return {...result,status:'RECHECK_REQUIRED',reason:'EXPLANATION_TOTAL_OVERFLOW'};
  }
  if(explainedCents>Math.abs(initialCents))return {...result,status:'RECHECK_REQUIRED',reason:'EXPLANATIONS_EXCEED_VARIANCE',explainedAmount:explainedCents/100};
  const remaining=(Math.abs(initialCents)-explainedCents)*Math.sign(initialCents);
  return {...result,status:'VALID',explainedAmount:explainedCents/100,unexplainedVariance:remaining===0?0:remaining/100};
}

// Identical fields/SQL/serialization to the established review writer's snapshot.
export async function readCashReviewSnapshot(db,companyId,storeId,sessionId){
  const rows=await db.$queryRaw`SELECT COUNT(*)::int AS "transactionCount",COALESCE(SUM("amount") FILTER (WHERE "reversedAt" IS NULL),0) AS "activeTotal",COALESCE(SUM("amount") FILTER (WHERE "type" IN ('SUPPLIER_PAYMENT','OTHER_EXPENSE') AND "reversedAt" IS NULL),0) AS "expenseTotal",COUNT(*) FILTER (WHERE "reversedAt" IS NOT NULL)::int AS "reversedCount",MAX(GREATEST("createdAt",COALESCE("reversedAt","createdAt"))) AS "lastMovementAt" FROM "StoreTransaction" WHERE "companyId"=${companyId} AND "storeId"=${storeId} AND "sessionId"=${sessionId}`;
  const row=rows[0]||{};if(![row.activeTotal??0,row.expenseTotal??0,row.transactionCount??0,row.reversedCount??0].every(value=>Number.isFinite(Number(value))))throw new Error("Invalid cash review snapshot");return {transactionCount:Number(row.transactionCount||0),activeTotal:Number(row.activeTotal||0),expenseTotal:Number(row.expenseTotal||0),reversedCount:Number(row.reversedCount||0),lastMovementAt:row.lastMovementAt?new Date(row.lastMovementAt).toISOString():null};
}

export async function readCashReviewState(db,session,{enabled=true}={}){
  try{
    const [currentSnapshot,rows]=await Promise.all([
      readCashReviewSnapshot(db,session.companyId,session.storeId,session.sessionId||session.id),
      db.$queryRaw`SELECT "id","decision","amount","note","actorId","actorName","snapshotJson","createdAt" FROM "CashControlReview" WHERE "companyId"=${session.companyId} AND "storeId"=${session.storeId} AND "sessionId"=${session.sessionId||session.id} ORDER BY "createdAt","id"`
    ]);
    const reviews=rows.map(row=>({...row,amount:Number(row.amount||0)})),validReviews=reviews.filter(row=>sameCashReviewSnapshot(row.snapshotJson,currentSnapshot)),confirmedExplanations=validReviews.filter(row=>row.decision==='EXPLANATION');
    const balance=confirmedExplanationBalance(session.variance,confirmedExplanations,{enabled}),latest=reviews.at(-1),stale=Boolean(latest&&!sameCashReviewSnapshot(latest.snapshotJson,currentSnapshot));
    return {currentSnapshot,confirmedExplanations,balance:stale?{...balance,status:'RECHECK_REQUIRED',reason:'STALE_REVIEW',unexplainedVariance:null}:balance,readOnly:true};
  }catch{
    return {currentSnapshot:null,confirmedExplanations:null,balance:{status:'UNAVAILABLE',reason:'REVIEW_SOURCE_UNAVAILABLE',initialVariance:null,explainedAmount:null,unexplainedVariance:null},readOnly:true};
  }
}
