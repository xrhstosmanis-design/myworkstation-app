import {readCashExpenseEvidence,cashExpenseFindings,purchaseDocumentMime} from './cash-expense-evidence.js';
import {readCashReviewState} from './cash-review-balance.js';
import {readCashControlRule} from './cash-control-rules.js';
import {exactCents,hash,reconcileError} from './cash-reconciliation-contract.js';

export const cashReconciliationSourceLimit=200;
export async function readReconciliationSession(db,scope,id,rule){
  const rows=await db.$queryRaw`SELECT s."id",s."companyId",s."storeId",s."terminalPos",s."status",s."openedBy",s."openedByName",s."shiftLabel",s."openedAt",s."closedAt",s."variance",s."cardVariance",s."openingOperational",s."actualOperational",s."updatedAt",to_jsonb(n) AS "nextSession",to_jsonb(p) AS "previousSession" FROM "CashShiftSession" s LEFT JOIN LATERAL (
    SELECT next."id",next."companyId",next."storeId",next."terminalPos",next."status",next."openedAt",next."closedAt",next."openedByName"
    FROM "CashShiftSession" next WHERE next."companyId"=s."companyId" AND next."storeId"=s."storeId" AND next."terminalPos"=s."terminalPos"
      AND (next."openedAt">s."openedAt" OR (next."openedAt"=s."openedAt" AND next."id">s."id")) ORDER BY next."openedAt",next."id" LIMIT 1
  ) n ON TRUE LEFT JOIN LATERAL (
    SELECT previous."id",previous."companyId",previous."storeId",previous."terminalPos",previous."status",previous."openedAt",previous."closedAt",previous."openedByName"
    FROM "CashShiftSession" previous WHERE previous."companyId"=s."companyId" AND previous."storeId"=s."storeId" AND previous."terminalPos"=s."terminalPos"
      AND (previous."openedAt"<s."openedAt" OR (previous."openedAt"=s."openedAt" AND previous."id"<s."id")) ORDER BY previous."openedAt" DESC,previous."id" DESC LIMIT 1
  ) p ON TRUE WHERE s."id"=${id} AND s."companyId"=${scope.companyId} AND s."storeId"=${scope.storeId} LIMIT 1`;
  const session=rows[0];
  if(!session||session.companyId!==scope.companyId||session.storeId!==scope.storeId||session.id!==id||!session.terminalPos)throw reconcileError('CASH_RECONCILIATION_NOT_FOUND',404);
  const transactions=await db.$queryRaw`SELECT to_jsonb(t)-'attachmentData' AS record,md5(COALESCE(to_jsonb(t)->>'attachmentData','')) AS "attachmentDigest",(t."attachmentData" IS NOT NULL) AS "hasAttachment" FROM "StoreTransaction" t WHERE t."companyId"=${scope.companyId} AND t."storeId"=${scope.storeId} AND t."sessionId"=${id} ORDER BY t."id" LIMIT 501`;
  if(transactions.length>500||transactions.some(t=>t.record?.companyId!==scope.companyId||t.record?.storeId!==scope.storeId||t.record?.sessionId!==id))throw reconcileError('CASH_RECONCILIATION_LIMIT');
  const count=await db.$queryRaw`SELECT COUNT(*)::int AS count FROM "CashControlReview" WHERE "companyId"=${scope.companyId} AND "storeId"=${scope.storeId} AND "sessionId"=${id}`;
  if(!Number.isInteger(count[0]?.count)||count[0].count>500)throw reconcileError('CASH_RECONCILIATION_LIMIT');
  const review=await readCashReviewState(db,{...session,sessionId:id},{enabled:rule.mode!=='POS_EFTPOS_ONLY'});
  const initialCents=exactCents(session.variance),cardCents=exactCents(session.cardVariance),basisCents=review.balance.status==='VALID'?exactCents(review.balance.unexplainedVariance):null;
  const originalTransactions=transactions.map(({record,attachmentDigest})=>({record,attachmentDigest}));
  const sourceHash=hash({version:1,session,transactions:originalTransactions,review,rule});
  const expenseInputs=transactions.map(({record,hasAttachment})=>({...record,hasAttachment,purchaseDocumentId:record.attachmentMimeType===purchaseDocumentMime?record.attachmentFilename:null}));
  const expenseChecks=await readCashExpenseEvidence(db,scope,expenseInputs);
  const expenseFindings=cashExpenseFindings(expenseChecks).map(f=>({code:f.code,amountCents:exactCents(f.amount),occurredAt:f.at?new Date(f.at).toISOString():null}));
  const next=session.nextSession;
  const nextClosed=Boolean(next&&next.companyId===scope.companyId&&next.storeId===scope.storeId&&next.terminalPos===session.terminalPos&&next.status==='CLOSED'&&next.closedAt&&new Date(next.closedAt)>=new Date(next.openedAt)&&new Date(session.closedAt)<=new Date(next.openedAt));
  return {session,sourceHash,expenseFindings,initialCents,cardCents,basisCents,reviewStatus:review.balance.status,explainedCents:exactCents(review.balance.explainedAmount),nextClosed,
    transactions:transactions.map(t=>({id:t.record.id,type:t.record.type,amountCents:exactCents(t.record.amount),reversed:Boolean(t.record.reversedAt),cashEffect:t.record.subtractFromShift===true,occurredAt:t.record.occurredAt}))};
}
export async function readReconciliationSources(db,scope,period,extraIds=[]){
  const stores=await db.store.findUnique({where:{id:scope.storeId},select:{id:true,companyId:true,name:true}});
  if(!stores||stores.companyId!==scope.companyId)throw reconcileError('CASH_RECONCILIATION_NOT_FOUND',404);
  const rule=await readCashControlRule(db,stores);
  const rows=await db.$queryRaw`SELECT "id" FROM "CashShiftSession" WHERE "companyId"=${scope.companyId} AND "storeId"=${scope.storeId} AND ("closedAt" AT TIME ZONE 'Europe/Athens')::date BETWEEN ${period.from}::date AND ${period.to}::date ORDER BY "closedAt","id" LIMIT 201`;
  if(rows.length>cashReconciliationSourceLimit)throw reconcileError('CASH_RECONCILIATION_LIMIT');
  const selectedIds=rows.map(r=>r.id),ids=[...new Set([...selectedIds,...extraIds])];
  if(ids.length>500||selectedIds.some(id=>typeof id!=='string')||new Set(selectedIds).size!==selectedIds.length)throw reconcileError('CASH_RECONCILIATION_LIMIT');
  const sessions=new Map();let cursor=0;
  await Promise.all(Array.from({length:Math.min(2,ids.length)},async()=>{while(cursor<ids.length){const id=ids[cursor++];sessions.set(id,await readReconciliationSession(db,scope,id,rule));}}));
  const neighbours=[...new Set([...sessions.values()].flatMap(s=>[s.session.previousSession?.id,s.session.nextSession?.id]).filter(Boolean))];
  if(new Set([...ids,...neighbours]).size>500)throw reconcileError('CASH_RECONCILIATION_LIMIT');
  for(const id of neighbours)if(!sessions.has(id))sessions.set(id,await readReconciliationSession(db,scope,id,rule));
  return {store:stores,rule,sessions,selectedIds,period,coverage:'BOUNDED_CLOSED_SHIFTS',limit:cashReconciliationSourceLimit};
}
