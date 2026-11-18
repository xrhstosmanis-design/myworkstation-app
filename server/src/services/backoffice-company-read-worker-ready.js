import {createHmac,timingSafeEqual} from 'node:crypto';
import {currentCaptureWorkerProtocol} from './backoffice-company-current-capture.js';
const fields=['protocol','manifestHash','workerRevision','scope','scopedRecovery','phase','checkedAt'];
export function companyReadWorkerMac(secret,json){if(typeof secret!=='string'||secret.length<24||typeof json!=='string'||Buffer.byteLength(json)>4096)throw Error('Invalid COMPANY read capability.');return createHmac('sha256',secret).update(currentCaptureWorkerProtocol+'\n'+json).digest('hex')}
export function validateCompanyReadWorkerCapability(record,{secret,manifestHash,phase,workerRevision,now=Date.now()}={}){
 try{if(!['SOURCE','TARGET'].includes(phase)||!/^[a-f0-9]{64}$/.test(manifestHash||'')||!/^[a-f0-9]{40}$/.test(workerRevision||'')||!Number.isFinite(now)||typeof record?.heartbeatJson!=='string'||!/^[a-f0-9]{64}$/.test(record.mac||''))return false;
 const signature=companyReadWorkerMac(secret,record.heartbeatJson);if(!timingSafeEqual(Buffer.from(signature,'hex'),Buffer.from(record.mac,'hex')))return false;
 const row=JSON.parse(record.heartbeatJson),at=Date.parse(row.checkedAt);return JSON.stringify(row)===record.heartbeatJson&&row&&typeof row==='object'&&!Array.isArray(row)&&Object.keys(row).sort().join(',')===[...fields].sort().join(',')&&row.protocol===currentCaptureWorkerProtocol&&row.manifestHash===manifestHash&&row.workerRevision===workerRevision&&row.scope==='COMPANY_READ_ONLY'&&row.scopedRecovery===false&&row.phase===phase&&typeof row.checkedAt==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|\+00:00)$/.test(row.checkedAt)&&Number.isFinite(at)&&at<=now+30000&&now-at<=12*60*1000;
 }catch{return false}
}
