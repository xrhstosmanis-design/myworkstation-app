import {LIFECYCLE_ROW_DIGEST_FORMAT} from './store-lifecycle-recovery-stream.js';
import {createHmac,timingSafeEqual} from 'node:crypto';
const protocol='MWS_STORE_RECOVERY_CAPABILITY_V1',q=x=>'"'+String(x).replaceAll('"','""')+'"';
export function lifecycleWorkerCapabilityMac(secret,json){if(typeof secret!=='string'||secret.length<24||typeof json!=='string'||Buffer.byteLength(json)>4096)throw Error('Invalid recovery capability.');return createHmac('sha256',secret).update(protocol+'\n'+json).digest('hex')}
export function validateLifecycleWorkerCapability(record,{secret,manifestHash,now=Date.now()}){
 try{if(typeof record?.heartbeatJson!=='string'||!/^[a-f0-9]{64}$/.test(record?.mac||''))return false;const mac=lifecycleWorkerCapabilityMac(secret,record.heartbeatJson);if(!timingSafeEqual(Buffer.from(mac,'hex'),Buffer.from(record.mac,'hex')))return false;const value=JSON.parse(record.heartbeatJson),at=Date.parse(value.checkedAt);return value.protocol===protocol&&value.manifestHash===manifestHash&&value.storagePolicyVerified===true&&value.rowDigestFormat===LIFECYCLE_ROW_DIGEST_FORMAT&&/^[a-f0-9]{40}$/.test(value.workerRevision||'')&&Number.isFinite(at)&&at<=now+30000&&now-at<=12*60*1000}catch{return false}
}
export async function readLifecycleWorkerCapability(db,options){
 try{const meta=(await db.$queryRawUnsafe(`SELECT current_schema() AS schema,to_regclass(format('%I.%I',current_schema(),'StoreLifecycleRuntime'))::text AS runtime`))[0];if(!meta?.schema||!meta.runtime)return false;const row=(await db.$queryRawUnsafe(`SELECT "heartbeatJson","mac" FROM ${q(meta.schema)}."StoreLifecycleRuntime" WHERE "id"='backup-worker'`))[0];return validateLifecycleWorkerCapability(row,options)}catch{return false}
}
