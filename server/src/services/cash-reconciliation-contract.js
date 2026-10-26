import {createHash} from 'node:crypto';
import {z} from 'zod';
import {paperCents,paperError,paperKinds} from './cash-paper-contract.js';
import {cashReportPeriod} from '../../../client/src/lib/cash-report-period.js';

export const reconciliationEntity='CASH_RECONCILIATION';
export const reconciliationLimit=10000;
export const reviewRequestId=z.string().uuid();
export const reconcileError=(code,status=409)=>paperError(code,status);
export const hash=value=>createHash('sha256').update(canonical(value)).digest('hex');
export function canonical(value){
  const plain=JSON.parse(JSON.stringify(value));
  const sort=v=>Array.isArray(v)?v.map(sort):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,sort(v[k])])):v;
  return JSON.stringify(sort(plain));
}
const id=z.string().min(1).max(180),sha=z.string().regex(/^[a-f0-9]{64}$/),note=z.string().trim().min(10).max(1000);
export const day=z.string().regex(/^20\d{2}-\d{2}-\d{2}$/).refine(v=>{try{return cashReportPeriod({period:'DAY',date:v}).from===v}catch{return false}});
export const periodSchema=z.object({from:day,to:day}).strict().refine(p=>p.to>=p.from&&(Date.parse(p.to)-Date.parse(p.from))/86400000<31);
const amount=z.number().int().min(-99999999900).max(99999999900);
export const reviewAction=z.discriminatedUnion('kind',[
  z.object({kind:z.literal('ASSOCIATE'),messageId:id,checksum:sha,sourceKey:sha,line:z.number().int().min(0).max(59),sessionId:id,sourceHash:sha,transactionId:id.nullable(),confirmedKind:z.enum(paperKinds),confirmedDate:day,confirmedAmountCents:amount,operatorContext:z.string().trim().min(1).max(180),note,reviewed:z.literal(true)}).strict(),
  z.object({kind:z.literal('OFFSET'),previousSessionId:id,nextSessionId:id,previousHash:sha,nextHash:sha,amountCents:amount.refine(v=>v>0),note,countingErrorConfirmed:z.literal(true)}).strict(),
  z.object({kind:z.literal('CONFIRM'),sessionId:id,sourceHash:sha,planHash:sha,note,reviewed:z.literal(true)}).strict(),
  z.object({kind:z.literal('REVOKE'),targetId:id,note}).strict(),
  z.object({kind:z.literal('CHECKPOINT'),resumeFrom:day,reportHash:sha,pendingNotes:z.array(z.string().trim().min(1).max(500)).max(20),note,reviewed:z.literal(true)}).strict()
]);
export const reconciliationRequest=z.object({requestId:reviewRequestId,head:z.union([sha,z.literal('ROOT')]),generation:z.string().regex(/^(0|[1-9][0-9]{0,18})$/),period:periodSchema,data:reviewAction}).strict();
export function scopeKey(scope){
  if(![scope.companyId,scope.storeId].every(v=>typeof v==='string'&&v.length>0&&v.length<=180)||! /^(0|[1-9][0-9]{0,18})$/.test(scope.generation||'')||BigInt(scope.generation)>9223372036854775807n)throw reconcileError('CASH_RECONCILIATION_SCOPE_INVALID',400);
  return hash(['CASH_RECONCILIATION_V1',scope.companyId,scope.storeId,scope.generation]);
}
export const actionId=(key,requestId)=>'cash-reconciliation:'+hash([key,requestId]);
export const requestHash=request=>hash({generation:request.generation,period:request.period,data:request.data});
export function exactCents(value){
  if(value===null||value===undefined||typeof value==='boolean')return null;
  const s=String(value);return /^-?\d+(?:\.\d{1,2})?$/.test(s)?paperCents(s):null;
}
export function transactionMatchesPaper(kind,transaction,value){
  if(!transaction||transaction.reversed||transaction.amountCents===null||Math.abs(transaction.amountCents)!==Math.abs(value))return false;
  if(kind==='EXPENSE')return ['SUPPLIER_PAYMENT','OTHER_EXPENSE'].includes(transaction.type)&&transaction.cashEffect===true;
  if(kind==='BANK_DEPOSIT')return transaction.type==='BANK_DEPOSIT'&&transaction.cashEffect===true;
  if(kind==='REFILL')return transaction.type==='TRANSFER_AMOUNT'&&transaction.amountCents>0&&value>0;
  if(['POS','EFTPOS'].includes(kind))return ['SALE_CARD','CUSTOMER_RECEIPT_CARD'].includes(transaction.type);
  // Aggregate counts and prepaid products need more than an equal ledger amount.
  return false;
}
export function chainState(rows,scope){
  const key=scopeKey(scope);if(rows.length>reconciliationLimit)throw reconcileError('CASH_RECONCILIATION_LIMIT');
  const sorted=[...rows].sort((a,b)=>(a.afterJson?.sequence||0)-(b.afterJson?.sequence||0));
  let head='ROOT';const records=[],requests=new Set();
  for(const row of sorted){
    const d=row.afterJson;
    if(!d||JSON.stringify(d).length>12000||row.companyId!==scope.companyId||row.storeId!==scope.storeId||row.entityType!==reconciliationEntity||row.entityId!==key||row.action!=='CASH_RECONCILIATION_REVIEWED'||d.version!==1||d.generation!==scope.generation||d.sequence!==records.length+1||d.previousHead!==head||!reviewRequestId.safeParse(d.requestId).success||requests.has(d.requestId)||row.id!==actionId(key,d.requestId)||!reviewAction.safeParse(d.data).success||!sha.safeParse(d.requestHash).success||!d.proof||!periodSchema.safeParse(d.proof.period).success||typeof d.actorName!=='string'||d.actorName.length>180||!Number.isFinite(new Date(row.createdAt).getTime()))throw reconcileError('CASH_RECONCILIATION_INVALID_HISTORY');
    const calculated=hash({id:row.id,sequence:d.sequence,previousHead:head,requestHash:d.requestHash,data:d.data,proof:d.proof,actorName:d.actorName});
    if(d.head!==calculated)throw reconcileError('CASH_RECONCILIATION_INVALID_HISTORY');
    head=calculated;requests.add(d.requestId);records.push({id:row.id,...d,createdAt:row.createdAt});
  }
  return {head,records,key};
}
export function activeRecords(records){
  const revoked=new Set();
  for(const r of records){
    if(r.data.kind!=='REVOKE')continue;
    const target=records.find(t=>t.id===r.data.targetId&&t.sequence<r.sequence&&['ASSOCIATE','OFFSET','CONFIRM'].includes(t.data.kind));
    if(!target||revoked.has(target.id))throw reconcileError('CASH_RECONCILIATION_INVALID_HISTORY');
    revoked.add(target.id);
  }
  return records.filter(r=>r.data.kind!=='REVOKE'&&!revoked.has(r.id));
}
