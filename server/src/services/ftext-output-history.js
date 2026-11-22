import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {z} from 'zod';
import {ftextSettingsHash} from './ftext-installation.js';
import {ftextCashTableExists} from './ftext-cash-schema.js';
import {validateFtextCashResult} from './ftext-cash-requests.js';
import {ftextOriginalCommandHash} from './ftext-error-evidence.js';

const hex=z.string().regex(/^[a-f0-9]{64}$/);
// Called only inside the existing authenticated current-device transaction.
// This is historical archive eligibility, never a work claim or readiness proof.
export async function ftextOutputHistory(tx,device,settings,input){
 const {requestIds}=z.object({requestIds:z.array(z.string().uuid()).min(1).max(20)}).strict().parse(input);
 const settingsHash=ftextSettingsHash(settings),completed=[];
 if(settings.cashEnabled===true&&await ftextCashTableExists(tx)){
  const rows=await tx.$queryRaw`SELECT * FROM "FtextCashRequest" WHERE "companyId"=${settings.companyId} AND "storeId"=${settings.storeId} AND "terminalPos"=${settings.terminalPos} AND "claimedByDeviceId"=${device.id} AND "claimedTokenVersion"=${device.tokenVersion} AND "settingsHash"=${settingsHash} AND "lifecycleGeneration"=${settings.lifecycleGeneration} AND "serialNumber"=${settings.serialNumber} AND "status"='SALE_COMMITTED' AND "saleId" IS NOT NULL AND "id"=ANY(${[...new Set(requestIds)]}::text[])`;
  for(const row of rows){
   try{
    if(!requestIds.includes(row.id)||row.companyId!==settings.companyId||row.storeId!==settings.storeId||row.terminalPos!==settings.terminalPos||row.claimedByDeviceId!==device.id||row.claimedTokenVersion!==device.tokenVersion||row.settingsHash!==settingsHash||row.lifecycleGeneration!==settings.lifecycleGeneration||row.serialNumber!==settings.serialNumber||row.status!=='SALE_COMMITTED'||!row.saleId||row.checkoutJson?.ftextVoid||row.checkoutJson?.ftextOperatorRelease||row.checkoutJson?.ftextLateCashReceipt||!['CASH','CARD'].includes(row.plan?.payment?.method))continue;
    const result=validateFtextCashResult(row.result,row),h=row.checkoutJson?.ftextHandoff;
    if(result.outcome!=='CONFIRMED'||!isDeepStrictEqual(result,row.result)||createHash('sha256').update(JSON.stringify(result)).digest('hex')!==row.resultHash||h?.state!=='ACCEPTED'||h.deviceId!==device.id||h.tokenVersion!==device.tokenVersion||h.settingsHash!==settingsHash||h.lifecycleGeneration!==settings.lifecycleGeneration||h.serialNumber!==settings.serialNumber||!z.string().uuid().safeParse(h.nonce).success||!hex.safeParse(h.commandHash).success||h.commandHash!==ftextOriginalCommandHash(row,settings))continue;
    completed.push({requestId:row.id,resultHash:row.resultHash,result,commandHash:h.commandHash,nonce:h.nonce,saleId:row.saleId});
   }catch{/* Incomplete or changed historical evidence remains in the input folder. */}
  }
 }
 return {version:1,companyId:settings.companyId,storeId:settings.storeId,terminalPos:settings.terminalPos,serialNumber:settings.serialNumber,settingsHash,configurationId:settings.configurationId,lifecycleGeneration:settings.lifecycleGeneration,completed,fiscalExecution:false,readinessVerified:false};
}
