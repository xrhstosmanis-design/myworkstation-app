import {cp1253Bytes} from '../../rbs-capdriver-v1.js';
import {rbsNetlinkManifestHash} from './paid-rbs-manifest.js';
import {createHash} from 'node:crypto';
import {resolveRbsDeviceTerminal} from '../../services/rbs-terminal-binding.js';
import {assertLifecycleMutation,readLifecycleGeneration} from '../../services/store-lifecycle-generation.js';
import {companyModuleState} from '../../middleware/module-access.js';
import {moneyCents,netlinkPaidError} from './paid-issuance-contract.js';
import {netlinkIntentIdsFromItems} from '../../../../shared/netlink-checkout-items.mjs';
const fail=()=>{throw netlinkPaidError('NETLINK_RBS_COMPLETION_REQUIRED','Η συναλλαγή RBS δεν έχει επιβεβαιωθεί για αυτή την κάρτα. Δεν έγινε έκδοση κάρτας.');};
const digest=value=>createHash('sha256').update(value).digest('hex');

// Read-only native context. Resolves the same signed binding/settings as the
// RBS writer; neither a browser terminal nor a stale heartbeat chooses a route.
export async function readNetlinkRbsContext(db,scope,{requireOnline=false,deviceId=null}={}){
 const license=await companyModuleState(scope.companyId,{db});if(!license?.licenseAllowed)fail();
 const lifecycle=await readLifecycleGeneration(db,scope);if(lifecycle.maintenance||lifecycle.retired)fail();
 const rows=await db.$queryRaw`SELECT * FROM "CloudDevice" WHERE "companyId"=${scope.companyId} AND "storeId"=${scope.storeId} AND "platform"='WINDOWS_RBS_CAPDRIVER_V1' AND "status"='ACTIVE' AND "revokedAt" IS NULL ORDER BY "lastSeenAt" DESC NULLS LAST LIMIT 10`;
 for(const device of rows){
  if(deviceId&&device.id!==deviceId)continue;
  let route;try{route=await resolveRbsDeviceTerminal(db,device,device.metadata?.rbsCapDriverBinding||null);}catch{continue;}
  if(route.terminalPos!==scope.terminalPos)continue;
  const meta=device.metadata||{},seen=new Date(meta.rbsCapDriverV1PolledAt||device.lastSeenAt).getTime(),age=Date.now()-seen;
  const online=meta.rbsCapDriverV1WriterPoll===true&&(meta.rbsCapDriverV1TerminalPos===scope.terminalPos||!meta.rbsCapDriverV1TerminalPos&&route.legacy)&&Number.isFinite(age)&&age>=0&&age<15000;
  if(requireOnline&&!online)continue;
  return {device,route,lifecycleGeneration:lifecycle.generation};
 }
 fail();
}

// This is application-native completion, NOT a machine-confirmed fiscal number.
// Callers obtain every input below from scoped persisted rows, never request JSON.
export function assertRbsNativeCompletion({scope,intent,sale,native,audit,device}){
 const context=intent.checkoutContext,checkout=native?.checkoutJson,details=audit?.details;
 if(context?.kind!=='RBS_NATIVE_COMMIT'||!context.terminalPos||!native||native.companyId!==scope.companyId||native.storeId!==scope.storeId||native.saleId!==sale.id||native.clientTransactionId!==intent.checkoutId||native.terminalPos!==context.terminalPos||native.status!=='SALE_COMMITTED'||!native.id||!native.requestHash||sale.saleFingerprint!==native.requestHash||!native.commandText||digest(cp1253Bytes(native.commandText+"\r\n"))!==native.commandHash||!native.claimedAt||!native.dispatchedAt||!native.updatedAt||!Number.isFinite(new Date(native.claimedAt).getTime())||!Number.isFinite(new Date(native.dispatchedAt).getTime())||new Date(native.claimedAt)>new Date(native.dispatchedAt)||!native.claimedByDeviceId||native.claimedByDeviceId!==device?.id||moneyCents(native.total)!==moneyCents(sale.total)||!['CASH','CARD'].includes(native.paymentMethod)||native.paymentMethod==='CARD'&&(native.operatorOutcome!=='YES'||!native.operatorId)||native.paymentMethod==='CASH'&&native.operatorOutcome&&native.operatorOutcome!=='YES'||String(checkout?.lifecycleGeneration??'0')!==context.lifecycleGeneration)fail();
 const manifest=netlinkIntentIdsFromItems(checkout?.items),audited=details?.netlinkIntents;
 if(!manifest.includes(intent.requestId)||!Array.isArray(audited)||manifest.length!==audited.length||manifest.some(id=>!audited.includes(id))||audit?.companyId!==scope.companyId||audit?.storeId!==scope.storeId||audit?.eventType!=='POS_SALE_COMPLETED'||details.netlinkManifestHash!==rbsNetlinkManifestHash(checkout.items)||audit.actorId!==checkout.actorId||details.saleId!==sale.id||details.terminalPos!==native.terminalPos||details.paymentMethod!==native.paymentMethod||moneyCents(details.total)!==moneyCents(native.total)||!audit.actorId)fail();
 return {...scope,saleId:sale.id,clientTransactionId:intent.checkoutId,terminalPos:native.terminalPos,status:'SALE_COMMITTED',paymentMethod:native.paymentMethod,amount:native.total,evidenceId:native.id,evidenceType:'RBS_NATIVE_COMMIT',issuedAt:native.updatedAt,fiscalNumber:null};
}
export async function readNetlinkRbsCompletion(db,scope,intent,sale,native){
 const terminalPos=intent.checkoutContext?.terminalPos;
 if(!terminalPos||native?.terminalPos!==terminalPos)fail();
 const context=await readNetlinkRbsContext(db,{...scope,terminalPos},{deviceId:native.claimedByDeviceId});
 await assertLifecycleMutation(db,scope,native.checkoutJson?.lifecycleGeneration);
 const audit=(await db.$queryRaw`SELECT "companyId","storeId","eventType","actorId","details" FROM "StoreOperatorAudit" WHERE "companyId"=${scope.companyId} AND "storeId"=${scope.storeId} AND "eventType"='POS_SALE_COMPLETED' AND "details"->>'saleId'=${sale.id} AND "details"->>'terminalPos'=${terminalPos} LIMIT 1 FOR SHARE`)[0];
 return assertRbsNativeCompletion({scope,intent,sale,native,audit,device:context.device});
}
