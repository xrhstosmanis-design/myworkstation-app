import {randomUUID,createHash} from 'node:crypto';
import {z} from 'zod';
import {ftextSettingsHash} from './ftext-installation.js';
const fail=()=>{throw Object.assign(new Error('Δεν επιτρέπεται ακύρωση αυτής της εντολής. Απαιτείται έλεγχος του αρχικού αποτελέσματος.'),{status:409,code:'FTEXT_VOID_REVIEW'})};
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
export const ftextVoidConfirmed=row=>row?.status==='REQUIRES_CHECK'&&row.checkoutJson?.ftextVoid?.status==='CONFIRMED';
export function assertFtextVoidEligible(row){
 if(!row||row.status!=='REQUIRES_CHECK'||row.saleId||row.plan?.payment?.method!=='CARD'||row.checkoutJson?.paymentMethod!=='CARD'||row.result?.outcome!=='REQUIRES_CHECK'||![44,48].includes(row.result?.code)||row.result?.failedCommand!==('PAY||'+row.plan?.payment?.code)||!row.resultHash||!row.result?.rawResultHash)fail();
}
async function locked(tx,scope,id){return (await tx.$queryRaw`SELECT * FROM "FtextCashRequest" WHERE "id"=${id} AND "companyId"=${scope.companyId} AND "storeId"=${scope.storeId} AND "terminalPos"=${scope.terminalPos} FOR UPDATE`)[0]}
async function save(tx,row,job){return (await tx.$queryRaw`UPDATE "FtextCashRequest" SET "checkoutJson"=${JSON.stringify({...row.checkoutJson,ftextVoid:job})}::jsonb,"updatedAt"=NOW() WHERE "id"=${row.id} RETURNING *`)[0]}
function binding(row,device,settings){if(!row||row.settingsHash!==ftextSettingsHash(settings)||row.lifecycleGeneration!==settings.lifecycleGeneration||row.claimedByDeviceId!==device.id||row.claimedTokenVersion!==device.tokenVersion)fail()}
export async function requestFtextVoid(tx,scope,id,actorId,input,{device,settings}){
 z.object({noCardPresented:z.literal(true),eftposStopped:z.literal(true),exclusiveRegister:z.literal(true)}).strict().parse(input);
 const row=await locked(tx,scope,id);binding(row,device,settings);assertFtextVoidEligible(row);
 if(row.checkoutJson.ftextVoid)return row; // immutable single attempt, never re-arm
 const job={id:randomUUID(),status:'PREPARED',requestedBy:actorId,requestedAt:new Date().toISOString(),originalResultHash:row.resultHash,attestation:{noCardPresented:true,eftposStopped:true,exclusiveRegister:true}};
 return save(tx,row,job);
}
export async function claimFtextVoid(tx,device,settings){
 const row=(await tx.$queryRaw`SELECT * FROM "FtextCashRequest" WHERE "companyId"=${settings.companyId} AND "storeId"=${settings.storeId} AND "terminalPos"=${settings.terminalPos} AND "status"='REQUIRES_CHECK' AND "checkoutJson"->'ftextVoid'->>'status'='PREPARED' ORDER BY "createdAt" LIMIT 1 FOR UPDATE`)[0];
 if(!row)return null;binding(row,device,settings);assertFtextVoidEligible(row);
 const job=row.checkoutJson.ftextVoid;if(job.originalResultHash!==row.resultHash)fail();
 await save(tx,row,{...job,status:'DISPATCHED',dispatchedAt:new Date().toISOString()});
 return {id:job.id,kind:'FTEXT_VOID',originalRequestId:row.id,originalResultHash:row.resultHash,originalRawResultHash:row.result.rawResultHash,settingsHash:row.settingsHash,serialNumber:row.serialNumber,scope:row.plan.scope,plan:row.plan};
}
const reportSchema=z.object({requestId:z.string().uuid(),originalRequestId:z.string().uuid(),settingsHash:z.string().regex(/^[a-f0-9]{64}$/),outcome:z.enum(['VOID_CONFIRMED','REQUIRES_CHECK']),code:z.number().int().min(0).max(999).optional(),serialNumber:z.string().max(80).optional(),dayId:z.string().regex(/^\d{1,20}$/).optional(),dayCounter:z.string().regex(/^\d{1,20}$/).optional(),deviceTime:z.string().max(80).optional(),rawResultHash:z.string().regex(/^[a-f0-9]{64}$/).optional(),description:z.string().max(300).optional()}).strict();
export function validateFtextVoidResult(input,row){
 const r=reportSchema.parse(input),job=row.checkoutJson?.ftextVoid;
 if(!job||r.requestId!==job.id||r.originalRequestId!==row.id||r.settingsHash!==row.settingsHash||job.originalResultHash!==row.resultHash)fail();
 if(r.outcome==='VOID_CONFIRMED'&&(r.code!==0||r.serialNumber!==row.serialNumber||!r.dayId||!r.dayCounter||!r.deviceTime||!r.rawResultHash))fail();
 return r;
}
export async function recordFtextVoidResult(tx,device,settings,input){
 const row=await locked(tx,settings,input?.originalRequestId||'');binding(row,device,settings);assertFtextVoidEligible(row);
 const result=validateFtextVoidResult(input,row),digest=hash(result),job=row.checkoutJson.ftextVoid;
 if(job.resultHash){if(job.resultHash!==digest)fail();return row}
 if(job.status!=='DISPATCHED')fail();
 return save(tx,row,{...job,status:result.outcome==='VOID_CONFIRMED'?'CONFIRMED':'REQUIRES_CHECK',result,resultHash:digest,completedAt:new Date().toISOString()});
}
