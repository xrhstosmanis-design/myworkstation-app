// One static reviewed ownership document shared with the recovery worker.
// Loading it creates no database schema, enrollment, adapter or executable API.
import {readFileSync} from 'node:fs';
const document=JSON.parse(readFileSync(new URL('../../../ops/backup/lifecycle/manifest.json',import.meta.url),'utf8'));
export const reviewedFreshStoreManifest=()=>structuredClone(document);
