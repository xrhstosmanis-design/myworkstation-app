import {createHmac,timingSafeEqual,createHash} from 'node:crypto';
import {reviewedFreshStoreManifest} from './store-lifecycle-manifest.js';
export const HISTORY_RETENTION_PROTOCOL='MWS_ASSISTANT_HISTORY_RETENTION_V1';
export function historyRetentionMac(secret,json){
 if(typeof secret!=='string'||secret.length<24||typeof json!=='string'||Buffer.byteLength(json)>4096)throw new TypeError('Invalid history retention proof');
 return createHmac('sha256',secret).update(HISTORY_RETENTION_PROTOCOL+'\n'+json).digest('hex');
}
export function validateHistoryRetention(record,{secret,manifestHash,now=Date.now()}={}){
 try{
  if(!/^[a-f0-9]{64}$/.test(record?.mac||''))return false;
  const expected=historyRetentionMac(secret,record.heartbeatJson);
  if(!timingSafeEqual(Buffer.from(expected,'hex'),Buffer.from(record.mac,'hex')))return false;
  const pulse=JSON.parse(record.heartbeatJson),at=Date.parse(pulse.checkedAt);
  return pulse.protocol===HISTORY_RETENTION_PROTOCOL&&pulse.manifestHash===manifestHash&&pulse.state==='COMPLETED'&&/^[a-f0-9]{40}$/.test(pulse.workerRevision||'')&&Number.isFinite(at)&&at<=now+30000&&now-at<=12*60*1000;
 }catch{return false}
}
export async function readHistoryRetentionReady(db,{secret=process.env.BACKUP_MONITOR_SECRET,now=Date.now()}={}){
 try{
  const meta=(await db.$queryRawUnsafe(`SELECT current_schema() AS schema,to_regclass(format('%I.%I',current_schema(),'StoreLifecycleRuntime'))::text AS runtime`))[0];
  if(!meta?.schema||!meta.runtime)return false;
  const schema='"'+meta.schema.replaceAll('"','""')+'"';
  const row=(await db.$queryRawUnsafe(`SELECT "heartbeatJson","mac" FROM ${schema}."StoreLifecycleRuntime" WHERE "id"='assistant-history-cleanup'`))[0];
  return validateHistoryRetention(row,{secret,now,manifestHash:createHash('sha256').update(JSON.stringify(reviewedFreshStoreManifest())).digest('hex')});
 }catch{return false}
}
