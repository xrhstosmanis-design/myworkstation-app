// Offline proposal verifier only. No runtime imports, schema mutation or activation.
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
const root=new URL('../../../',import.meta.url);
const packetPath='ops/backup/lifecycle/backoffice-company-compatibility.proposed.json';
const column='BackofficeStaffAccount.companyCapabilities';
const accountShape=[['userId','text',true],['companyId','text',true],['username','text',true],['pinHash','text',true],['active','boolean',true],['revision','integer',true],['createdAt','timestamp with time zone',true],['updatedAt','timestamp with time zone',true]];
const patch={accountColumn:['companyCapabilities','jsonb',true],reviewedColumn:column,classification:'COMPANY_SECURITY_POLICY_NEVER_STORE_OWNERSHIP_OR_DELETION_SELECTOR'};
const fail=message=>{throw Object.assign(new Error(message),{code:'COMPANY_COMPATIBILITY_REFUSED'})};
export const companyCompatibilityHash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function buildBackofficeCompanyProposal(source,sourceReview,{profile}={}){
 if(!['BASE','CAPTURE'].includes(profile))fail('Unsupported proposal profile.');
 const manifest=structuredClone(source),review=structuredClone(sourceReview);
 if(!isDeepStrictEqual(manifest.knownColumns?.BackofficeStaffAccount,accountShape)||manifest.reviewedColumns?.includes(column))fail('Unexpected source account shape.');
 if(manifest.tables.some(t=>t.name==='BackofficeStaffAccount'))fail('Company security entered store ownership.');
 manifest.id='BACKOFFICE_COMPANY_'+profile+'_PROPOSED_V1';
 manifest.knownColumns.BackofficeStaffAccount.push(['companyCapabilities','jsonb',true]);
 manifest.reviewedColumns.push(column);
 review.profileId=manifest.id;
 if(review.executionEnabled!==false||review.columns.some(c=>c.column===column))fail('Unexpected source review.');
 review.columns.push({column,classification:'COMPANY_SECURITY_POLICY_NEVER_STORE_OWNERSHIP_OR_DELETION_SELECTOR'});
 return {manifest,review};
}
export function verifyBackofficeCompanyCompatibility({read=path=>readFileSync(new URL(path,root)),packet=JSON.parse(read(packetPath))}={}){
 if(packet.format!=='MWS_BACKOFFICE_COMPANY_COMPATIBILITY_PROPOSAL_V1'||packet.executionEnabled!==false||packet.productionActivated!==false)fail('Proposal must remain inactive.');
 if(!isDeepStrictEqual(packet.column,{table:'BackofficeStaffAccount',name:'companyCapabilities',type:'jsonb',notNull:true,default:[],owner:'COMPANY_SECURITY',storeDeletionSelector:false}))fail('Column ownership changed.');
 if(!isDeepStrictEqual(packet.patch,patch))fail('Unexpected column patch.');
 const sourcePaths=['ops/backup/lifecycle/manifest.json','ops/backup/lifecycle/column-review.json','ops/backup/lifecycle/monthly-inventory-capture-manifest.proposed.json','ops/backup/lifecycle/monthly-inventory-capture-column-review.proposed.json','server/src/services/store-lifecycle-executor.js','server/src/services/store-lifecycle-worker-ready.js','server/src/services/store-lifecycle-manifest.js','ops/backup/lifecycle/worker.py','ops/backup/lifecycle/verify_restore.py','server/src/services/backoffice-company-profile.js','ops/backup/lifecycle/backoffice_company_profile.py','server/src/services/backoffice-company-installation-proof.js','server/src/services/backoffice-company-installation.js','ops/backup/lifecycle/company-installation-backup.py','ops/backup/lifecycle/company-installation-observe.sql','server/src/services/monthly-inventory-capture-schema.js','server/src/services/monthly-inventory-capture-authorization.js','server/src/services/monthly-inventory-capture-status.js','ops/backup/lifecycle/company_source_root.py','server/scripts/store-lifecycle-verify-copy.py'];
 if(!isDeepStrictEqual(Object.keys(packet.sourceHashes||{}).sort(),sourcePaths.sort()))fail('Exact app/worker guard sources required.');
 if(!isDeepStrictEqual(packet.runtimeProfilesUnchanged,['BASE','MONTHLY_INVENTORY_CAPTURE_V1','AUTOMATIC_EVENT_REPORTS_V1','MONTHLY_INVENTORY_CAPTURE_EVENT_REPORTS_V1'])||packet.eventReportVariantsPrepared!==false)fail('Runtime profiles or unprepared event variants changed.');
 if(!isDeepStrictEqual(packet.rollbackRequires,{nonFinalOperations:0,nonEmptyCompanyPolicies:0,sessionsRevoked:true,verifiedBackup:true}))fail('Rollback evidence requirements changed.');

 if(!isDeepStrictEqual(packet.variants.map(v=>v.profile),['BASE','CAPTURE']))fail('Exact two proposed profiles required.');
 for(const [path,hash] of Object.entries(packet.sourceHashes))if(createHash('sha256').update(read(path)).digest('hex')!==hash)fail('Source hash changed: '+path);
 const variants=packet.variants.map(variant=>{
  if(variant.proposedProfileId!=='BACKOFFICE_COMPANY_'+variant.profile+'_PROPOSED_V1'||!Object.hasOwn(packet.sourceHashes,variant.sourceManifest)||!Object.hasOwn(packet.sourceHashes,variant.sourceReview))fail('Unbound proposal source.');
  const expectedPaths=variant.profile==='BASE'?['ops/backup/lifecycle/manifest.json','ops/backup/lifecycle/column-review.json']:['ops/backup/lifecycle/monthly-inventory-capture-manifest.proposed.json','ops/backup/lifecycle/monthly-inventory-capture-column-review.proposed.json'];
  if(!isDeepStrictEqual([variant.sourceManifest,variant.sourceReview],expectedPaths))fail('Proposal profile source mismatch.');
  const source=JSON.parse(read(variant.sourceManifest)),oldReview=JSON.parse(read(variant.sourceReview));
  const {manifest:target,review}=buildBackofficeCompanyProposal(source,oldReview,{profile:variant.profile});
  if(companyCompatibilityHash(target)!==variant.proposedPlanHash||companyCompatibilityHash(review)!==variant.proposedReviewHash)fail('Generated target hash differs.');
  return {profile:variant.profile,sourcePlanHash:companyCompatibilityHash(source),proposedPlanHash:companyCompatibilityHash(target),accountColumns:9};
 });
 return {format:packet.format,executionEnabled:false,productionActivated:false,variants};
}
// Compatibility evidence is not execution authority: both signed worker heartbeat
// and actual schema preflight remain mandatory in the native runtime.
export function companyProfilePairCompatible({appPlanHash,workerPlanHash,installedPlanHash,accountColumns,companyColumnExpected}){
 return /^[a-f0-9]{64}$/.test(appPlanHash||'')&&appPlanHash===workerPlanHash&&appPlanHash===installedPlanHash&&typeof companyColumnExpected==='boolean'&&isDeepStrictEqual(accountColumns,companyColumnExpected?[...accountShape,['companyCapabilities','jsonb',true]]:accountShape);
}
export function assertBackofficeCompanyRollback({nonFinalOperations,nonEmptyCompanyPolicies,sessionsRevoked,verifiedBackup}={}){
 if(nonFinalOperations!==0||nonEmptyCompanyPolicies!==0||sessionsRevoked!==true||verifiedBackup!==true)fail('Rollback requires drained operations, empty company policies, revoked sessions and verified backup.');
 return {eligible:true,executionEnabled:false};
}
