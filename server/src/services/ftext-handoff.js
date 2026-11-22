import {randomUUID,createHash} from 'node:crypto';
import {z} from 'zod';
import {ftextSettingsHash,ftextRegisterReady} from './ftext-installation.js';
import {ftextOriginalCommandHash} from './ftext-error-evidence.js';

const hex=z.string().regex(/^[a-f0-9]{64}$/);
const proofSchema=z.object({version:z.literal(1),state:z.enum(['OFFERED','ACCEPTED']),nonce:z.string().uuid(),commandHash:hex,deviceId:z.string().min(1),tokenVersion:z.number().int().min(1),settingsHash:hex,lifecycleGeneration:z.string(),serialNumber:z.string(),offeredAt:z.string().datetime(),acceptedAt:z.string().datetime().optional(),stopVersion:z.literal(1).optional()}).strict();
const inputSchema=z.object({requestId:z.string().uuid(),settingsHash:hex,nonce:z.string().uuid(),commandHash:hex,readyForExecution:z.boolean()}).strict();
const fail=()=>{throw Object.assign(new Error('Η παράδοση FTEXT δεν επιβεβαιώθηκε για την ίδια αρχική εντολή. Δεν επιτρέπεται νέα εκτέλεση.'),{status:409,code:'FTEXT_HANDOFF_REVIEW'})};
function context(row,d,c){
 const p=row?.plan,method=p?.payment?.method;
 if(!row||c.cashEnabled!==true||row.companyId!==c.companyId||row.storeId!==c.storeId||row.terminalPos!==c.terminalPos||row.serialNumber!==c.serialNumber||row.settingsHash!==ftextSettingsHash(c)||row.lifecycleGeneration!==c.lifecycleGeneration||row.checkoutJson?.paymentMethod!==method||!['CASH','CARD'].includes(method)||d.status!=='ACTIVE'||!d.id||!Number.isInteger(d.tokenVersion))fail();
 for(const k of ['companyId','storeId','terminalPos','fiscalDeviceCode'])if(p.scope?.[k]!==c[k])fail();
 if(method==='CASH'&&p.payment.code!==1)fail();
 if(method==='CARD'&&(c.cardEnabled!==true||c.cardPayment?.confirmed!==true||p.payment.code!==c.cardPayment.code||row.checkoutJson.ftextCardMode!==c.cardPayment.resultFormat||!['OPERATOR_CONFIRMATION','POS_LINE8_OS7'].includes(c.cardPayment.resultFormat)))fail();
}
function bound(row,d,c,{preExecution=true}={}){
 context(row,d,c);const parsed=proofSchema.safeParse(row.checkoutJson.ftextHandoff);if(!parsed.success)fail();const h=parsed.data;
 if(row.claimedByDeviceId!==d.id||row.claimedTokenVersion!==d.tokenVersion||h.deviceId!==d.id||h.tokenVersion!==d.tokenVersion||h.settingsHash!==row.settingsHash||h.lifecycleGeneration!==c.lifecycleGeneration||h.serialNumber!==c.serialNumber||h.commandHash!==ftextOriginalCommandHash(row,c)||(h.state==='ACCEPTED')!==Boolean(h.acceptedAt))fail();
 if(preExecution&&(row.status!=='DISPATCHED'||row.result||row.resultHash||row.saleId||row.checkoutJson.ftextCardDecision||['ftextVoid','ftextOperatorRelease','ftextLateCashReceipt'].some(k=>Object.hasOwn(row.checkoutJson,k))))fail();
 return h;
}
export function newFtextHandoff(row,d,c,{stopVersion}={}){
 context(row,d,c);if(row.status!=='PREPARED'||['ftextHandoff','ftextOperatorRelease','ftextPreExecutionStop'].some(k=>Object.hasOwn(row.checkoutJson,k))||!ftextRegisterReady(d,c))fail();
 return {version:1,state:'OFFERED',nonce:randomUUID(),commandHash:ftextOriginalCommandHash(row,c),deviceId:d.id,tokenVersion:d.tokenVersion,settingsHash:row.settingsHash,lifecycleGeneration:c.lifecycleGeneration,serialNumber:c.serialNumber,offeredAt:new Date().toISOString(),...(stopVersion===1?{stopVersion:1}:{})};
}
export function ftextHandoffRequest(row){
 const h=row.checkoutJson.ftextHandoff;
 return {id:row.id,settingsHash:row.settingsHash,scope:row.plan.scope,serialNumber:row.serialNumber,plan:row.plan,handoff:{version:1,nonce:h.nonce,commandHash:h.commandHash,...(h.stopVersion===1?{stopVersion:1}:{})}};
}
export async function pollFtextHandoffOffer(tx,d,c){
 if(c.cashEnabled!==true||!ftextRegisterReady(d,c))return null;
 const row=(await tx.$queryRaw`SELECT * FROM "FtextCashRequest" WHERE "companyId"=${c.companyId} AND "storeId"=${c.storeId} AND "terminalPos"=${c.terminalPos} AND "status"='DISPATCHED' AND "checkoutJson"->'ftextHandoff'->>'state'='OFFERED' AND COALESCE("checkoutJson"->'ftextOperatorRelease'->>'registerReady','')<>'true' ORDER BY "createdAt" LIMIT 1 FOR UPDATE`)[0];
 if(!row)return null;bound(row,d,c);return ftextHandoffRequest(row);
}
export async function acceptFtextHandoff(tx,d,c,input){
 const b=inputSchema.parse(input);
 const row=(await tx.$queryRaw`SELECT * FROM "FtextCashRequest" WHERE "id"=${b.requestId} AND "companyId"=${c.companyId} AND "storeId"=${c.storeId} AND "terminalPos"=${c.terminalPos} FOR UPDATE`)[0];
 if(ftextPreExecutionStopped(row)){
  const h=bound(row,d,c,{preExecution:false}),s=row.checkoutJson.ftextPreExecutionStop;
  if(s.phase!=='OFFERED'||s.deviceId!==d.id||s.tokenVersion!==d.tokenVersion||b.settingsHash!==h.settingsHash||b.nonce!==h.nonce||b.commandHash!==h.commandHash)fail();
  return {ok:true,version:1,requestId:row.id,settingsHash:row.settingsHash,nonce:h.nonce,commandHash:h.commandHash,state:'STOPPED',authorization:null,requiresReadiness:false,allowResend:false,stop:{version:1,id:s.proofHash,at:s.at,nonce:h.nonce,commandHash:h.commandHash}};
 }
 const h=bound(row,d,c);if(b.settingsHash!==h.settingsHash||b.nonce!==h.nonce||b.commandHash!==h.commandHash)fail();
 const ready=b.readyForExecution&&ftextRegisterReady(d,c);
 const reply=proof=>({ok:true,version:1,requestId:row.id,settingsHash:row.settingsHash,nonce:proof.nonce,commandHash:proof.commandHash,state:proof.state,authorization:proof.state==='ACCEPTED'?{id:proof.nonce,acceptedAt:proof.acceptedAt}:null,requiresReadiness:!ready});
 // Acceptance is committed once. A lost response retrieves the SAME proof,
 // without renewing it. Windows must persist its irreversible publication
 // journal before any fiscal input; an existing journal forbids publication.
 if(h.state==='ACCEPTED')return reply(h);
 if(!ready)return reply(h);
 const accepted={...h,state:'ACCEPTED',acceptedAt:new Date().toISOString()};
 const changed=await tx.$queryRaw`UPDATE "FtextCashRequest" SET "checkoutJson"=${JSON.stringify({...row.checkoutJson,ftextHandoff:accepted})}::jsonb,"updatedAt"=NOW() WHERE "id"=${row.id} AND "status"='DISPATCHED' AND "checkoutJson"->'ftextHandoff'->>'state'='OFFERED' RETURNING *`;
 if(changed.length!==1)fail();return reply(accepted);
}
export function assertFtextHandoffResult(row,d,c){
 if(!Object.hasOwn(row.checkoutJson||{},'ftextHandoff'))return;
 if(bound(row,d,c,{preExecution:false}).state!=='ACCEPTED')fail();
}

// This proves only that the server has NEVER authorized this original command.
// ACCEPTED and every legacy DISPATCHED request remain uncertain and held.
export function ftextPreExecutionStopPhase(row){
 const c=row?.checkoutJson;
 if(!row||!c?.actorId||!hex.safeParse(row.plan?.planHash).success||!['CASH','CARD'].includes(row.plan?.payment?.method)||c.paymentMethod!==row.plan.payment.method||row.result!=null||row.resultHash!=null||row.saleId||c.ftextCardDecision||['ftextVoid','ftextLateCashReceipt','ftextOperatorRelease','ftextPreExecutionStop'].some(k=>Object.hasOwn(c,k)))return null;
 if(row.status==='PREPARED'&&row.claimedByDeviceId==null&&row.claimedTokenVersion==null&&row.dispatchedAt==null&&!Object.hasOwn(c,'ftextHandoff'))return 'PREPARED';
 const h=proofSchema.safeParse(c.ftextHandoff);
 if(row.status==='DISPATCHED'&&h.success&&h.data.state==='OFFERED'&&h.data.stopVersion===1&&!h.data.acceptedAt&&h.data.deviceId===row.claimedByDeviceId&&h.data.tokenVersion===row.claimedTokenVersion&&h.data.settingsHash===row.settingsHash&&h.data.lifecycleGeneration===row.lifecycleGeneration&&h.data.serialNumber===row.serialNumber)return 'OFFERED';
 return null;
}
function stopCore(row,s){return {version:1,phase:s.phase,requestId:row.id,companyId:row.companyId,storeId:row.storeId,terminalPos:row.terminalPos,settingsHash:row.settingsHash,lifecycleGeneration:row.lifecycleGeneration,serialNumber:row.serialNumber,planHash:row.plan.planHash,actorId:s.actorId,deviceId:s.deviceId,tokenVersion:s.tokenVersion,nonce:s.nonce,commandHash:s.commandHash,at:s.at};}
const stopHash=core=>createHash('sha256').update(JSON.stringify(core)).digest('hex');
export function ftextPreExecutionStopped(row){
 const s=row?.checkoutJson?.ftextPreExecutionStop,r=row?.checkoutJson?.ftextOperatorRelease;
 if(!s||!r||r.reviewMode!=='UNPUBLISHED_STOP'||r.registerReady!==true||r.readinessVerified!==false||s.version!==1||s.actorId!==row.checkoutJson.actorId||r.actorId!==s.actorId||r.at!==s.at||r.settingsHash!==row.settingsHash||r.stopProofHash!==s.proofHash||!hex.safeParse(s.commandHash).success||!hex.safeParse(s.planHash).success||!s.deviceId||!Number.isInteger(s.tokenVersion)||s.tokenVersion<1||!z.string().datetime().safeParse(s.at).success)return false;
 const c={...row.checkoutJson};delete c.ftextPreExecutionStop;delete c.ftextOperatorRelease;
 if(ftextPreExecutionStopPhase({...row,checkoutJson:c})!==s.phase)return false;
 if(s.phase==='PREPARED'?s.nonce!==null:s.nonce!==c.ftextHandoff.nonce||s.commandHash!==c.ftextHandoff.commandHash||s.deviceId!==row.claimedByDeviceId||s.tokenVersion!==row.claimedTokenVersion)return false;
 const core=stopCore(row,s);
 return Object.keys(s).sort().join(',')===[...Object.keys(core),'proofHash'].sort().join(',')&&Object.entries(core).every(([k,v])=>s[k]===v)&&s.proofHash===stopHash(core);
}
export async function stopFtextBeforeExecution(tx,id,scope,actorId,input,{context:getCurrent,clock=()=>new Date()}={}){
 z.object({stopBeforeExecution:z.literal(true)}).strict().parse(input);
 const current=await getCurrent(tx,scope,{requireOnline:false}),d=current.device,c=current.settings;
 const row=(await tx.$queryRaw`SELECT * FROM "FtextCashRequest" WHERE "id"=${id} AND "companyId"=${scope.companyId} AND "storeId"=${scope.storeId} AND "terminalPos"=${scope.terminalPos} FOR UPDATE`)[0];
 if(!d||!c)fail();context(row,d,c);if(!actorId||row.checkoutJson.actorId!==actorId)fail();
 if(ftextPreExecutionStopped(row)){
  const s=row.checkoutJson.ftextPreExecutionStop;if(s.deviceId!==d.id||s.tokenVersion!==d.tokenVersion)fail();return row;
 }
 const phase=ftextPreExecutionStopPhase(row);if(!phase)fail();
 const h=phase==='OFFERED'?bound(row,d,c):null;
 const core=stopCore(row,{phase,actorId,deviceId:d.id,tokenVersion:d.tokenVersion,nonce:h?.nonce||null,commandHash:ftextOriginalCommandHash(row,c),at:clock().toISOString()}),proofHash=stopHash(core);
 const saved={...row.checkoutJson,ftextPreExecutionStop:{...core,proofHash},ftextOperatorRelease:{actorId,at:core.at,settingsHash:row.settingsHash,stopProofHash:proofHash,registerReady:true,readinessVerified:false,reviewMode:'UNPUBLISHED_STOP'}};
 return (await tx.$queryRaw`UPDATE "FtextCashRequest" SET "checkoutJson"=${JSON.stringify(saved)}::jsonb,"updatedAt"=NOW() WHERE "id"=${row.id} RETURNING *`)[0];
}
