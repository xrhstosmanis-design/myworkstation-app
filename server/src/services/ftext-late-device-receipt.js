import {z} from 'zod';
import {ftextSettingsHash} from './ftext-installation.js';
import {recordLateCashReceipt} from './ftext-late-cash-receipt.js';

const hex=z.string().regex(/^[a-f0-9]{64}$/);
const schema=z.object({requestId:z.string().uuid(),settingsHash:hex,originalResultHash:hex,intentBase64:z.string().min(1).max(8192),reportBase64:z.string().min(1).max(8192),rawResultBase64:z.string().min(1).max(87384)}).strict();
const fail=()=>{throw Object.assign(new Error('Η καθυστερημένη απάντηση δεν ανήκει στην ενεργή αρχική σύνδεση FTEXT.'),{status:409,code:'FTEXT_LATE_DEVICE_SCOPE'})};
const unknown='The physical receipt could not be verified. Do not resend.';
function bound(row,device,settings){
 return row&&row.companyId===settings.companyId&&row.storeId===settings.storeId&&row.terminalPos===settings.terminalPos&&row.claimedByDeviceId===device.id&&row.claimedTokenVersion===device.tokenVersion&&row.settingsHash===ftextSettingsHash(settings)&&row.lifecycleGeneration===settings.lifecycleGeneration&&row.serialNumber===settings.serialNumber&&row.result?.outcome==='REQUIRES_CHECK'&&row.result.description===unknown&&!row.checkoutJson?.ftextVoid&&!row.checkoutJson?.ftextOperatorRelease&&row.checkoutJson?.ftextCardDecision?.outcome!=='NO'&&['CASH','CARD'].includes(row.plan?.payment?.method);
}
export async function pollFtextLateReceipt(tx,device,settings){
 if(settings.cashEnabled!==true)return null;
 const row=(await tx.$queryRaw`SELECT * FROM "FtextCashRequest" WHERE "companyId"=${settings.companyId} AND "storeId"=${settings.storeId} AND "terminalPos"=${settings.terminalPos} AND "claimedByDeviceId"=${device.id} AND "claimedTokenVersion"=${device.tokenVersion} AND "settingsHash"=${ftextSettingsHash(settings)} AND "lifecycleGeneration"=${settings.lifecycleGeneration} AND "status" IN ('REQUIRES_CHECK','CONFIRMED') AND "result"->>'description'=${unknown} AND NOT ("checkoutJson" ? 'ftextVoid') AND NOT ("checkoutJson" ? 'ftextOperatorRelease') AND COALESCE("checkoutJson"->'ftextCardDecision'->>'outcome','')<>'NO' ORDER BY "createdAt" LIMIT 1`)[0];
 if(!bound(row,device,settings))return null;
 return {id:row.id,kind:'FTEXT_LATE_RECEIPT_RECHECK',originalResultHash:row.resultHash,settingsHash:row.settingsHash,scope:row.plan.scope,serialNumber:row.serialNumber,plan:row.plan};
}
export async function recordFtextLateDeviceReceipt(tx,device,settings,input){
 const value=schema.parse(input);
 const context=async(t,scope)=>{
  if(scope.companyId!==settings.companyId||scope.storeId!==settings.storeId||scope.terminalPos!==settings.terminalPos)fail();
  return {device,settings};
 };
 // authenticated() has already locked and revalidated the current device/configuration.
 // recordLateCashReceipt then acquires the same fiscal lock and request lock as manual recovery.
 const row=(await tx.$queryRaw`SELECT * FROM "FtextCashRequest" WHERE "id"=${value.requestId} AND "companyId"=${settings.companyId} AND "storeId"=${settings.storeId} AND "terminalPos"=${settings.terminalPos}`)[0];
 if(!bound(row,device,settings)||value.settingsHash!==row.settingsHash||value.originalResultHash!==row.resultHash)fail();
 return recordLateCashReceipt(tx,settings,row.id,'device:'+device.id,{intentBase64:value.intentBase64,reportBase64:value.reportBase64,rawResultBase64:value.rawResultBase64,reason:'Automatic recovery of original device files; no fiscal resend'},{context,deviceEvidence:true});
}
