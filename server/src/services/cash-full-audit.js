import {z} from 'zod';
import {automaticCashAuditSchema} from './cash-automatic-audit.js';
import {cashArithmeticIsCurrent,canAutomaticallyCalculate} from './cash-automatic-result.js';
import {exactCents,hash} from './cash-reconciliation-contract.js';
import {partitionCashAuditEvents} from './cash-audit-association.js';

const sha=z.string().regex(/^[a-f0-9]{64}$/),cents=z.number().int().safe();
const evidence=z.object({status:z.enum(['COMPLETE','INCOMPLETE']),unresolvedCount:z.number().int().min(0).max(100000)}).strict();
// These receipts are built from scoped server sources, never request/display flags.
export const fullCashCoverageSchema=z.object({sessionId:z.string().min(1).max(180),sourceHash:sha,events:evidence,duplicates:evidence.extend({windowSeconds:z.literal(60)}).strict(),papers:evidence,expenses:evidence}).strict();
const codes=['SOURCE_COVERAGE','CASH_ARITHMETIC','OPERATOR_IDENTITY','RESULT_ELIGIBILITY','CARD_ARITHMETIC','HANDOFF','AWAITING_NEXT_SHIFT','AUDIT_OPEN_ISSUES','EVENTS','DUPLICATES','PAPERS','EXPENSES'];
export const fullCashAuditSchema=z.object({version:z.literal(1),status:z.enum(['FINAL','PENDING','AWAITING_NEXT_SHIFT','NOT_APPLICABLE']),fingerprint:sha,pendingChecks:z.array(z.enum(codes)).max(codes.length),remainingCents:cents.nullable(),shortageCents:cents.nonnegative().nullable(),surplusCents:cents.nonnegative().nullable(),financialAdjustmentCents:z.literal(0),humanApproval:z.literal(false)}).strict();

// Full evidence completeness is separate from the established cash-only result.
// No observation, CLOSED issue or candidate allocates a financial correction.
export function projectFullCashAudit({row,coverage}){
 const pending=new Set(),parsed=fullCashCoverageSchema.safeParse(coverage),audit=automaticCashAuditSchema.safeParse(row?.automaticAudit);
 const snapshot={sessionId:row?.sessionId??null,sourceHash:row?.sourceHash??null,operatorId:row?.operatorId??null,operatorName:row?.operatorName??null,employeeKey:row?.employeeKey??null,identityRequiresReview:row?.identityRequiresReview??null,initialCents:row?.initialCents??null,explainedCents:row?.explainedCents??null,offsetCents:row?.offsetCents??null,remainingCents:row?.remainingCents??null,cardCents:row?.cardCents??null,recheck:row?.recheck??null,eligible:row?.eligible??null,status:row?.status??null,automaticAudit:audit.success?audit.data:null};
 const fingerprint=hash({version:1,row:snapshot,coverage:parsed.success?parsed.data:null});
 const finish=status=>{
  const remaining=status==='FINAL'?row.remainingCents:null;
  return fullCashAuditSchema.parse({version:1,status,fingerprint,pendingChecks:[...pending],remainingCents:remaining,shortageCents:remaining===null?null:Math.max(0,-remaining),surplusCents:remaining===null?null:Math.max(0,remaining),financialAdjustmentCents:0,humanApproval:false});
 };
 if(row?.status==='NOT_APPLICABLE')return finish('NOT_APPLICABLE');
 if(!parsed.success||parsed.data.sessionId!==row?.sessionId||parsed.data.sourceHash!==row?.sourceHash)pending.add('SOURCE_COVERAGE');
 if(!cashArithmeticIsCurrent(row))pending.add('CASH_ARITHMETIC');
 if(row?.identityRequiresReview!==false||!row?.operatorId||!row?.operatorName||row?.employeeKey!=='operator:'+row.operatorId)pending.add('OPERATOR_IDENTITY');
 const awaiting=audit.success&&audit.data.checks.some(c=>c.code==='NEXT_HANDOFF'&&c.status==='AWAITING_NEXT_SHIFT');
 if(awaiting)pending.add('AWAITING_NEXT_SHIFT');
 if(!canAutomaticallyCalculate(row)&&!awaiting)pending.add('RESULT_ELIGIBILITY');
 if(!audit.success||audit.data.status!=='CALCULATED'||audit.data.bankCardVarianceCents!==0||row?.cardCents!==0||['CARD_LEDGER','CARD_VARIANCE'].some(code=>audit.data.checks.filter(c=>c.code===code&&c.status==='MATCHED'&&c.differenceCents===0).length!==1))pending.add('CARD_ARITHMETIC');
 if(!audit.success||audit.data.checks.some(c=>c.code.endsWith('_HANDOFF')&&!['MATCHED','NOT_APPLICABLE','AWAITING_NEXT_SHIFT'].includes(c.status)||c.code.endsWith('_HANDOFF')&&c.status==='MATCHED'&&c.differenceCents!==0))pending.add('HANDOFF');
 if(!audit.success||audit.data.openIssues.some(code=>code!=='AWAITING_NEXT_SHIFT'))pending.add('AUDIT_OPEN_ISSUES');
 if(parsed.success)for(const [key,code]of [['events','EVENTS'],['duplicates','DUPLICATES'],['papers','PAPERS'],['expenses','EXPENSES']])if(parsed.data[key].status!=='COMPLETE'||parsed.data[key].unresolvedCount!==0)pending.add(code);
 if(!pending.size)return finish('FINAL');
 return finish(pending.size===1&&pending.has('AWAITING_NEXT_SHIFT')?'AWAITING_NEXT_SHIFT':'PENDING');
}

export function assertFullCashAudit({row,coverage,fullAudit}){
 if(hash(fullCashAuditSchema.parse(fullAudit))!==hash(projectFullCashAudit({row,coverage})))throw Error('Full cash audit changed.');
}

const instant=value=>value==null?NaN:new Date(value).getTime();
const suspicious=type=>/CANCEL|RETURN|VOID|REVERSE|REFUND|DELETE|OVERRIDE|REOPEN|AFTER_CLOSE|DUPLICATE|REPLAY|BLOCKED|DELAY|CREDENTIAL|PERMISSION|LOGOUT/i.test(String(type||''));
function returnEvidence(event){
 const action=event.actionType==='RETURN_ITEMS';
 const internal=event.eventType==='POS_INTERNAL_RETURN_PENDING_RBS';
 if(!action&&!internal)return {};
 const details=event.details||{};
 const saleId=action?event.saleId:details.reversalSaleId;
 const originalSaleId=action?event.relatedSaleId:details.originalSaleId;
 const clean=value=>typeof value==='string'?value.replace(/\s+/g,' ').trim().slice(0,240):'';
 const refundCents=exactCents(details.refund);
 const items=Array.isArray(details.items)?details.items.slice(0,100).flatMap(item=>{
  const name=clean(item?.description);
  return name&&Number.isFinite(item?.quantity)&&item.quantity>0?[{name,quantity:item.quantity}]:[];
 }):[];
 return {returnDetails:{saleId:clean(saleId),originalSaleId:clean(originalSaleId),reason:clean(event.reason||details.reason),
  refundCents:refundCents>=0?refundCents:null,method:['CASH','CARD','IRIS'].includes(details.refundMethod)?details.refundMethod:null,
  fiscalPendingAtEntry:details.fiscalPending===true,items}};
}
export const fullCashEventLimit=2000;
// Execute inside the caller's existing selected-store snapshot. No bootstrap,
// external request or update is performed. A late event needs an identity link;
// proximity to another shift never attributes it to the earlier employee.
export async function readFullCashEventEvidence(db,scope,session,transactions=[]){
 const empty=status=>({status,findings:[],unassignedCount:0,excludedCount:0,linkedCount:0,financialAdjustmentCents:0,evidenceHash:hash({status})});
 const opened=instant(session?.openedAt),closed=instant(session?.closedAt),id=session?.id||session?.sessionId;
 if(!scope?.companyId||!scope?.storeId||session?.companyId!==scope.companyId||session?.storeId!==scope.storeId||!id||!session.terminalPos||session.status!=='CLOSED'||!Number.isFinite(opened)||!Number.isFinite(closed)||closed<opened||!Array.isArray(transactions))return empty('UNAVAILABLE');
 try{
  const present=await db.$queryRaw`SELECT to_regclass(format('%I.%I',current_schema(),'StoreOperatorAudit'))::text AS "operator",to_regclass(format('%I.%I',current_schema(),'PosSaleActionAudit'))::text AS "actions",to_regclass(format('%I.%I',current_schema(),'PosSaleSafetyAudit'))::text AS "safety"`;
  if(!present[0]?.operator||!present[0]?.actions||!present[0]?.safety)return empty('UNAVAILABLE');
  const from=new Date(opened),until=new Date(closed+24*60*60*1000);
  const groups=await Promise.all([
   db.$queryRaw`SELECT "id","companyId","storeId","eventType","actorId","operatorId","details","createdAt" FROM "StoreOperatorAudit" WHERE "companyId"=${scope.companyId} AND "storeId"=${scope.storeId} AND "createdAt">=${from} AND "createdAt"<=${until} ORDER BY "createdAt","id" LIMIT 2001`,
   db.$queryRaw`SELECT "id","companyId","storeId","saleId","relatedSaleId","actionType","reason","actorId","actorName","details","createdAt" FROM "PosSaleActionAudit" WHERE "companyId"=${scope.companyId} AND "storeId"=${scope.storeId} AND "createdAt">=${from} AND "createdAt"<=${until} ORDER BY "createdAt","id" LIMIT 2001`,
   db.$queryRaw`SELECT "id","companyId","storeId","saleId","relatedSaleId","eventType","actorId","actorName","details","createdAt" FROM "PosSaleSafetyAudit" WHERE "companyId"=${scope.companyId} AND "storeId"=${scope.storeId} AND "createdAt">=${from} AND "createdAt"<=${until} ORDER BY "createdAt","id" LIMIT 2001`
  ]);
  if(groups.some(rows=>!Array.isArray(rows)))return empty('UNAVAILABLE');
  if(groups.some(rows=>rows.length>fullCashEventLimit))return empty('LIMITED');
  if(groups.some(rows=>new Set(rows.map(e=>e.id)).size!==rows.length||rows.some(e=>typeof e.id!=='string'||!e.id||e.companyId!==scope.companyId||e.storeId!==scope.storeId||!Number.isFinite(instant(e.createdAt))||instant(e.createdAt)<opened||instant(e.createdAt)>until.getTime())))return empty('UNAVAILABLE');
  const sources=['STORE_OPERATOR_AUDIT','POS_ACTION_AUDIT','POS_SAFETY_AUDIT'];
  const findings=[];let unassignedCount=0,excludedCount=0,linkedCount=0;
  const partitioned=groups.map(rows=>partitionCashAuditEvents({...session,id,sessionId:id},transactions,rows.filter(e=>suspicious(e.actionType||e.eventType))));
  for(const [index,part]of partitioned.entries()){
   excludedCount+=part.excluded.length;linkedCount+=part.linked.length;
   // Unidentified late records are outside this shift's evidence, not blockers
   // copied onto every earlier employee. In-shift ambiguity remains visible.
   const ambiguous=part.unassigned.filter(e=>instant(e.createdAt)<=closed);
   unassignedCount+=ambiguous.length;
   for(const e of part.linked)findings.push({code:'AUDIT_'+(e.actionType||e.eventType),source:sources[index],eventId:e.id,sessionId:id,saleId:e.saleId||null,relatedSaleId:e.relatedSaleId||null,occurredAt:new Date(e.createdAt).toISOString(),afterClose:instant(e.createdAt)>closed,requiresReview:true,...returnEvidence(e)});
  }
  return {status:'AVAILABLE',findings,unassignedCount,excludedCount,linkedCount,financialAdjustmentCents:0,evidenceHash:hash({scope:{companyId:scope.companyId,storeId:scope.storeId,sessionId:id},openedAt:from,closedAt:session.closedAt,groups,transactions:transactions.map(t=>({id:t.id,sessionId:t.sessionId,type:t.type,description:t.description,saleId:t.saleId})),partitioned})};
 }catch{return empty('UNAVAILABLE');}
}
