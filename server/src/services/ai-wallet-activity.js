import {z} from 'zod';
import {walletError} from './ai-owner-wallet-contract.js';

const text=max=>z.string().min(1).max(max).regex(/^[^\u0000-\u001f\u007f]*$/u);
const optionalText=max=>text(max).nullable();
export const walletActivitySchema=z.object({
  version:z.literal(1),companyId:text(160),storeId:text(160),
  purpose:z.enum(['OWNER_ASSISTANT','INVOICE_ASSISTANT','PAYMENT_HEADER_READ','PAYMENT_INVOICE_READ','INVOICE_READ','INVOICE_RECHECK','STAFF_SCHEDULE','CASH_PAPER_READING','ONLINE_SEARCH','PLATFORM_CUSTOMER_ASSISTANT']),
  surface:z.enum(['OWNER_ASSISTANT','PAYMENT_ENTRY','INVOICE_WORKSPACE','WORKFORCE_PLANNER','CASH_REVIEW','PRODUCT_SEARCH','PLATFORM_ASSISTANT','UNKNOWN']),
  execution:z.enum(['DIRECT','BACKGROUND']),
  actor:z.object({id:text(160),name:optionalText(160),role:optionalText(60),kind:z.enum(['POS_OPERATOR','BACKOFFICE_USER','DELEGATED_USER','SUPPORT']),profile:optionalText(60)}).strict().nullable(),
  terminalPos:optionalText(80),documentId:optionalText(160),documentNumber:optionalText(160),jobId:optionalText(160),
}).strict();
const clean=(value,max=160)=>typeof value==='string'?value.replace(/[\u0000-\u001f\u007f]/gu,' ').trim().slice(0,max)||null:null;
// Human labels may be shortened; identity/reference keys must never be
// normalized into another identifier or silently truncated.
const identifier=value=>typeof value==='string'&&value.length>0&&value.length<=160&&value===value.trim()&&!/[\u0000-\u001f\u007f]/u.test(value)?value:null;
const extraSurfaces={STAFF_SCHEDULE:'WORKFORCE_PLANNER',CASH_PAPER_READING:'CASH_REVIEW',ONLINE_SEARCH:'PRODUCT_SEARCH',PLATFORM_CUSTOMER_ASSISTANT:'PLATFORM_ASSISTANT'};
const surfaceFor=purpose=>extraSurfaces[purpose]|| (purpose==='OWNER_ASSISTANT'?'OWNER_ASSISTANT':['PAYMENT_HEADER_READ','PAYMENT_INVOICE_READ'].includes(purpose)?'PAYMENT_ENTRY':'INVOICE_WORKSPACE');

// A metadata snapshot is not an authorization grant. Call only after the
// existing request/job authorization; never pass req.body as an actor/source.
export function walletActivityFromRequest(req,{storeId,purpose,documentId=null,documentNumber=null,jobId=null,originalActivity=null}={}){
  const user=req?.user||{},companyId=identifier(user.companyId);
  if(!companyId||!identifier(storeId))return null;
  if(['STORE_OPERATOR','POS_BACKGROUND'].includes(user.tokenType)&&user.storeId!==storeId)throw walletError('AI_WALLET_SCOPE_DENIED',403);
  if(user.tokenType==='POS_BACKGROUND')return walletActivityForJob({companyId,storeId,purpose,documentId,documentNumber,jobId},originalActivity);
  const operator=user.tokenType==='STORE_OPERATOR',support=user.isSuperAdmin===true&&user.platformRole==='SUPER_ADMIN';
  const id=identifier(operator?user.operatorId||user.id:user.id);
  const known=operator||support||user.tokenType==='BACKOFFICE_USER';
  return walletActivitySchema.parse({version:1,companyId,storeId,purpose,surface:surfaceFor(purpose),execution:'DIRECT',
    actor:known&&id?{id,name:clean(user.fullName),role:clean(support?'SUPER_ADMIN':user.role,60),kind:operator?'POS_OPERATOR':support?'SUPPORT':user.staffAccess===true?'DELEGATED_USER':'BACKOFFICE_USER',profile:user.staffAccess===true?clean(req.staffGrant?.profile,60):null}:null,
    terminalPos:operator?clean(user.terminalPos,80):null,documentId:identifier(documentId),documentNumber:clean(documentNumber),jobId:identifier(jobId)});
}

export function publicWalletActivity(value,{companyId,storeId}){
  const result=walletActivitySchema.safeParse(value);
  return result.success&&result.data.companyId===companyId&&result.data.storeId===storeId?result.data:null;
}

// Original initiator comes from the already-bound durable job, never the user
// who happened to poll its status. Old jobs honestly retain a missing actor.
export function walletActivityForJob({companyId,storeId,purpose,documentId=null,documentNumber=null,jobId=null},original){
  const previous=publicWalletActivity(original,{companyId,storeId});
  return walletActivitySchema.parse({version:1,companyId,storeId,purpose,surface:previous?.surface||'UNKNOWN',execution:'BACKGROUND',actor:previous?.actor||null,
    terminalPos:previous?.terminalPos||null,documentId:identifier(documentId)||previous?.documentId||null,documentNumber:clean(documentNumber)||previous?.documentNumber||null,jobId:identifier(jobId)||previous?.jobId||null});
}

export function reservationWalletActivity(value,scope){
  if(value===undefined||value===null)return null;
  const parsed=publicWalletActivity(value,scope);
  if(!parsed)throw walletError('AI_WALLET_INVALID_INPUT',400);
  return Object.freeze({...parsed,actor:parsed.actor?Object.freeze({...parsed.actor}):null});
}
