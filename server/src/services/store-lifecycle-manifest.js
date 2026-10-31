// Static reviewed ownership documents. Selection does not install or enable anything.
import {readFileSync} from 'node:fs';
const baseUrl=new URL('../../../ops/backup/lifecycle/manifest.json',import.meta.url);
const captureUrl=new URL('../../../ops/backup/lifecycle/monthly-inventory-capture-manifest.proposed.json',import.meta.url);
const document=JSON.parse(readFileSync(baseUrl,'utf8'));
// Installation/schema callers rely on this accessor always meaning BASE.
export const reviewedFreshStoreManifest=()=>structuredClone(document);
export function selectedStoreLifecycleManifest(env=process.env){
 const profile=env.MWS_STORE_LIFECYCLE_PROFILE;
 if(profile===undefined||profile==='BASE')return reviewedFreshStoreManifest();
 if(profile==='MONTHLY_INVENTORY_CAPTURE_V1')return JSON.parse(readFileSync(captureUrl,'utf8'));
 throw new Error('Invalid store lifecycle profile.');
}
