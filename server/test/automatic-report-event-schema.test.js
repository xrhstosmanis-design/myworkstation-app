import test from 'node:test';
import assert from 'node:assert/strict';
import {reviewedFreshStoreManifest,selectedStoreLifecycleManifest} from '../src/services/store-lifecycle-manifest.js';
import {withAutomaticReportEventConsent,automaticReportEventConsentColumns} from '../src/services/automatic-report-event-schema.js';

test('event report lifecycle selection preserves default manifests and declares scoped removable metadata',()=>{
  const original=reviewedFreshStoreManifest();
  const selected=selectedStoreLifecycleManifest({MWS_STORE_LIFECYCLE_PROFILE:'AUTOMATIC_EVENT_REPORTS_V1'});
  assert.deepEqual(reviewedFreshStoreManifest(),original);
  assert.deepEqual(selected.knownColumns.AutomaticReportEventConsent,automaticReportEventConsentColumns);
  assert.deepEqual(selected.tables.find(table=>table.name==='AutomaticReportEventConsent'),
    {name:'AutomaticReportEventConsent',owner:{kind:'DIRECT'},reset:'REMOVE'});
  assert.throws(()=>withAutomaticReportEventConsent(selected),/already declared/);
  for(const field of ['companyId','storeId','reportType','recipientId'])assert(selected.knownColumns.AutomaticReportEventConsent.some(column=>column[0]===field));
  const copy=structuredClone(selected);
  copy.id=original.id;
  for(const name of ['AutomaticReportEventConsent','AutomaticReportSupplierComparisonConsent']){
    copy.knownTables=copy.knownTables.filter(table=>table!==name);
    delete copy.knownColumns[name];
    copy.tables=copy.tables.filter(table=>table.name!==name);
    copy.reviewedColumns=copy.reviewedColumns.filter(column=>!column.startsWith(name+'.'));
    copy.valueGuards=copy.valueGuards.filter(guard=>guard.table!==name);
  }
  assert.deepEqual(copy,original);
});

test('monthly inventory capture and event report profiles compose without changing the original capture manifest',()=>{
  const original=selectedStoreLifecycleManifest({MWS_STORE_LIFECYCLE_PROFILE:'MONTHLY_INVENTORY_CAPTURE_V1'});
  const selected=selectedStoreLifecycleManifest({MWS_STORE_LIFECYCLE_PROFILE:'MONTHLY_INVENTORY_CAPTURE_EVENT_REPORTS_V1'});
  assert.deepEqual(selected,withAutomaticReportEventConsent(original));
  assert.deepEqual(selectedStoreLifecycleManifest({MWS_STORE_LIFECYCLE_PROFILE:'MONTHLY_INVENTORY_CAPTURE_V1'}),original);
});

test('event profile is accepted by the existing lifecycle planner',async()=>{
  const {createLifecycleInspectionCore}=await import('../src/services/store-lifecycle-executor.js');
  for(const profile of ['AUTOMATIC_EVENT_REPORTS_V1','MONTHLY_INVENTORY_CAPTURE_EVENT_REPORTS_V1']){
    assert.doesNotThrow(()=>createLifecycleInspectionCore(selectedStoreLifecycleManifest({MWS_STORE_LIFECYCLE_PROFILE:profile}),{sourceRevision:'a'.repeat(40)}));
  }
});

test('Python recovery worker and JavaScript use identical event manifests from the packaged definition',async()=>{
  const {spawnSync}=await import('node:child_process');
  const {fileURLToPath}=await import('node:url');
  const {createHash}=await import('node:crypto');
  const {readFileSync}=await import('node:fs');
  const directory=fileURLToPath(new URL('../../ops/backup/lifecycle',import.meta.url));
  const script='import sys,json,hashlib\nsys.path.insert(0,sys.argv[1])\nimport worker\nprofiles=json.loads(sys.argv[2])\nprint(json.dumps([hashlib.sha256(worker.compact(worker.selected_manifest_document({"MWS_STORE_LIFECYCLE_PROFILE":profile})).encode()).hexdigest() for profile in profiles]))';
  const profiles=['BASE','MONTHLY_INVENTORY_CAPTURE_V1','AUTOMATIC_EVENT_REPORTS_V1','MONTHLY_INVENTORY_CAPTURE_EVENT_REPORTS_V1'];
  const result=spawnSync('python3',['-c',script,directory,JSON.stringify(profiles)],{encoding:'utf8',timeout:15000});
  assert.equal(result.status,0,result.stderr);
  const expected=profiles.map(profile=>createHash('sha256').update(JSON.stringify(selectedStoreLifecycleManifest({MWS_STORE_LIFECYCLE_PROFILE:profile}))).digest('hex'));
  assert.deepEqual(JSON.parse(result.stdout),expected);
  const allowlist=readFileSync(new URL('../../ops/backup/Dockerfile.dockerignore',import.meta.url),'utf8').split('\n');
  assert.equal(allowlist.filter(line=>line==='!ops/backup/lifecycle/automatic-report-consent-extension.proposed.json').length,1);
});
