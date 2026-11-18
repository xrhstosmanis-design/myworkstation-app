import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {buildBackofficeCompanyProposal,buildCompanyCurrentCaptureProposal} from './backoffice-company-compatibility.js';
const read=path=>JSON.parse(readFileSync(new URL('../../../ops/backup/lifecycle/'+path,import.meta.url),'utf8'));
export function backofficeCompanyProfile(env=process.env){
 const key=env.MWS_STORE_LIFECYCLE_PROFILE;
 if(key==='BACKOFFICE_COMPANY_CURRENT_CAPTURE_V1'){const {manifest}=buildCompanyCurrentCaptureProposal();return{key,profile:'CURRENT_CAPTURE',manifest,planHash:createHash('sha256').update(JSON.stringify(manifest)).digest('hex')}}
 if(!['BACKOFFICE_COMPANY_BASE_V1','BACKOFFICE_COMPANY_CAPTURE_V1'].includes(key))return null;
 const profile=key==='BACKOFFICE_COMPANY_BASE_V1'?'BASE':'CAPTURE';
 const {manifest}=buildBackofficeCompanyProposal(read(profile==='BASE'?'manifest.json':'monthly-inventory-capture-manifest.proposed.json'),read(profile==='BASE'?'column-review.json':'monthly-inventory-capture-column-review.proposed.json'),{profile});
 return {key,profile,manifest,planHash:createHash('sha256').update(JSON.stringify(manifest)).digest('hex')};
}
export async function isBackofficeCompanyInstalled(db,{env=process.env}={}){
 try{
  const selected=backofficeCompanyProfile(env);
  if(!selected)return false;
  // Legacy runtimes, including the independent wholesale image, do not carry
  // the optional recovery package. Load it only for an explicitly selected
  // COMPANY profile; importing ordinary staff authorization stays inert.
  const {createLifecycleCatalogueReadiness}=await import('./store-lifecycle-executor.js');
  const {validateLifecycleWorkerCapability}=await import('./store-lifecycle-worker-ready.js');
  // Native closed catalogue inspection verifies exact columns, references and
  // installed guard definitions. Merely adding a JSON column is insufficient.
  const metadata=await createLifecycleCatalogueReadiness(selected.manifest)(db);
  if(metadata?.guardsInstalled!==true)return false;
  const columns=await db.$queryRaw`SELECT column_default FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='BackofficeStaffAccount' AND column_name='companyCapabilities' AND data_type='jsonb' AND is_nullable='NO'`;
  if(columns.length!==1||!/^'\[\]'::jsonb$/.test(columns[0].column_default||''))return false;
  const mismatched=await db.$queryRaw`SELECT 1 AS invalid FROM "StoreLifecycleFence" WHERE "planHash"<>${selected.planHash} LIMIT 1`;
  if(mismatched.length)return false;
  if(!/^[a-f0-9]{40}$/.test(env.RENDER_GIT_COMMIT||''))return false;
  const records=selected.profile==='CURRENT_CAPTURE'?await db.$queryRaw`SELECT "heartbeatJson","mac" FROM "StoreLifecycleRuntime" WHERE "id"='company-read-worker' LIMIT 1`:await db.$queryRaw`SELECT "heartbeatJson","mac" FROM "StoreLifecycleRuntime" WHERE "id"='backup-worker' LIMIT 1`;
 if(selected.profile==='CURRENT_CAPTURE'){const {validateCompanyReadWorkerCapability}=await import('./backoffice-company-read-worker-ready.js');return validateCompanyReadWorkerCapability(records[0],{secret:env.BACKUP_MONITOR_SECRET,manifestHash:selected.planHash,phase:'TARGET',workerRevision:env.RENDER_GIT_COMMIT})}
  const record=records[0];
  return validateLifecycleWorkerCapability(record,{secret:env.BACKUP_MONITOR_SECRET,manifestHash:selected.planHash})&&JSON.parse(record.heartbeatJson).workerRevision===env.RENDER_GIT_COMMIT;
 }catch{return false}
}
