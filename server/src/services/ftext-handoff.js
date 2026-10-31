import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {ftextSettingsHash,ftextRegisterReady} from './ftext-installation.js';
import {ftextOriginalCommandHash} from './ftext-error-evidence.js';

const hex=z.string().regex(/^[a-f0-9]{64}$/);
const proofSchema=z.object({version:z.literal(1),state:z.enum(['OFFERED','ACCEPTED']),nonce:z.string().uuid(),commandHash:hex,deviceId:z.string().min(1),tokenVersion:z.number().int().min(1),settingsHash:hex,lifecycleGeneration:z.string(),serialNumber:z.string(),offeredAt:z.string().datetime(),acceptedAt:z.string().datetime().optional()}).strict();
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
export function newFtextHandoff(row,d,c){
 context(row,d,c);if(row.status!=='PREPARED'||Object.hasOwn(row.checkoutJson,'ftextHandoff')||!ftextRegisterReady(d,c))fail();
 return {version:1,state:'OFFERED',nonce:randomUUID(),commandHash:ftextOriginalCommandHash(row,c),deviceId:d.id,tokenVersion:d.tokenVersion,settingsHash:row.settingsHash,lifecycleGeneration:c.lifecycleGeneration,serialNumber:c.serialNumber,offeredAt:new Date().toISOString()};
}
export function ftextHandoffRequest(row){
 const h=row.checkoutJson.ftextHandoff;
 return {id:row.id,settingsHash:row.settingsHash,scope:row.plan.scope,serialNumber:row.serialNumber,plan:row.plan,handoff:{version:1,nonce:h.nonce,commandHash:h.commandHash}};
}
export async function pollFtextHandoffOffer(tx,d,c){
 if(c.cashEnabled!==true||!ftextRegisterReady(d,c))return null;
 const row=(await tx.$queryRaw`SELECT * FROM "FtextCashRequest" WHERE "companyId"=${c.companyId} AND "storeId"=${c.storeId} AND "terminalPos"=${c.terminalPos} AND "status"='DISPATCHED' AND "checkoutJson"->'ftextHandoff'->>'state'='OFFERED' ORDER BY "createdAt" LIMIT 1 FOR UPDATE`)[0];
 if(!row)return null;bound(row,d,c);return ftextHandoffRequest(row);
}
export async function acceptFtextHandoff(tx,d,c,input){
 const b=inputSchema.parse(input);
 const row=(await tx.$queryRaw`SELECT * FROM "FtextCashRequest" WHERE "id"=${b.requestId} AND "companyId"=${c.companyId} AND "storeId"=${c.storeId} AND "terminalPos"=${c.terminalPos} FOR UPDATE`)[0];
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
