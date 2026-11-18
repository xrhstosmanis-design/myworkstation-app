import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {selectedStoreLifecycleManifest} from '../src/services/store-lifecycle-manifest.js';
import {backofficeCompanyProfile,isBackofficeCompanyInstalled} from '../src/services/backoffice-company-profile.js';
import {monthlyInventoryCaptureRuntimeManifest,monthlyInventoryCaptureLifecycleManifestProposal,assertMonthlyInventoryCaptureLifecycleCatalogue} from '../src/services/monthly-inventory-capture-schema.js';
import {verifyBackofficeCompanyCompatibility} from '../src/services/backoffice-company-compatibility.js';
import {getReviewedMonthlyCaptureLifecycleGuardDefinitions} from '../src/services/store-lifecycle-executor.js';
const root=new URL('../../',import.meta.url),hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');

test('company profiles are explicit, preserve existing defaults and exactly pair the real application and backup worker',()=>{
 const profiles=['BASE','MONTHLY_INVENTORY_CAPTURE_V1','AUTOMATIC_EVENT_REPORTS_V1','MONTHLY_INVENTORY_CAPTURE_EVENT_REPORTS_V1','BACKOFFICE_COMPANY_BASE_V1','BACKOFFICE_COMPANY_CAPTURE_V1'];
 const python=`import sys,json,hashlib\nsys.path.insert(0,'ops/backup/lifecycle')\nimport worker\nfrom verify_restore import compact\nprint(json.dumps({p:hashlib.sha256(compact(worker.selected_manifest_document({'MWS_STORE_LIFECYCLE_PROFILE':p})).encode()).hexdigest() for p in ${JSON.stringify(profiles)}}))`;
 const worker=JSON.parse(execFileSync('python3',['-c',python],{cwd:root,encoding:'utf8',timeout:10000}));
 for(const profile of profiles)assert.equal(hash(selectedStoreLifecycleManifest({MWS_STORE_LIFECYCLE_PROFILE:profile})),worker[profile],profile);
 assert.equal(worker.BASE,'ba554503bbb839524a1217af0149a6bf86b11384cb2dcb1bfc41d75a6d4290d4');
 assert.equal(worker.MONTHLY_INVENTORY_CAPTURE_V1,'59ca657191a03dfeb751e907d95abe4291a3fc61da30c9d0602a116ed78757c2');
 assert.deepEqual(selectedStoreLifecycleManifest({}),selectedStoreLifecycleManifest({MWS_STORE_LIFECYCLE_PROFILE:'BASE'}));
 assert.equal(backofficeCompanyProfile({}),null);
 assert.throws(()=>selectedStoreLifecycleManifest({MWS_STORE_LIFECYCLE_PROFILE:'BACKOFFICE_COMPANY_EVENT_REPORTS_V1'}),/Invalid/);
 const variants=verifyBackofficeCompanyCompatibility().variants;
 for(const profile of ['BASE','CAPTURE']){
  const selected=backofficeCompanyProfile({MWS_STORE_LIFECYCLE_PROFILE:'BACKOFFICE_COMPANY_'+profile+'_V1'});
  assert.equal(selected.planHash,variants.find(v=>v.profile===profile).proposedPlanHash);
  assert.equal(selected.manifest.knownColumns.BackofficeStaffAccount.length,9);
  assert.equal(selected.manifest.tables.some(t=>t.name==='BackofficeStaffAccount'),false);
 }
});

test('monthly capture uses the matching new guard plan without changing its installation proposal or implicit authority',()=>{
 const old=monthlyInventoryCaptureLifecycleManifestProposal();assert.equal(old.knownColumns.BackofficeStaffAccount.length,8);assert.doesNotThrow(()=>assertMonthlyInventoryCaptureLifecycleCatalogue(old));
 assert.deepEqual(monthlyInventoryCaptureRuntimeManifest({}),old);
 const current=monthlyInventoryCaptureRuntimeManifest({MWS_STORE_LIFECYCLE_PROFILE:'BACKOFFICE_COMPANY_CAPTURE_V1'});
 assert.equal(current.knownColumns.BackofficeStaffAccount.length,9);
 assert.deepEqual(current.tables,old.tables);
 const before=getReviewedMonthlyCaptureLifecycleGuardDefinitions(old,'public'),after=getReviewedMonthlyCaptureLifecycleGuardDefinitions(current,'public');
 assert.deepEqual(before.map(r=>[r.table,r.name,r.mask]),after.map(r=>[r.table,r.name,r.mask]));
 assert.deepEqual(before,after); // Account policy adds no store ownership or trigger behavior.
 assert.notEqual(hash(old),hash(current));
 assert.equal(monthlyInventoryCaptureLifecycleManifestProposal().knownColumns.BackofficeStaffAccount.length,8);
});

test('company availability is absent without explicit paired-profile selection and cannot be implied by a company capability',async()=>{
 const db=new Proxy({},{get(){assert.fail('default company availability entered database')}});
 for(const env of [{},{MWS_STORE_LIFECYCLE_PROFILE:'BASE'},{MWS_STORE_LIFECYCLE_PROFILE:'MONTHLY_INVENTORY_CAPTURE_V1'}])assert.equal(await isBackofficeCompanyInstalled(db,{env}),false);
});
