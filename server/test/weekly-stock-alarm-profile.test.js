import {automaticReportEventLifecycleReady} from '../src/services/automatic-report-event-schema.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {selectedStoreLifecycleManifest as select} from '../src/services/store-lifecycle-manifest.js';
import {createLifecycleInstallationCore} from '../src/services/store-lifecycle-executor.js';
import {weeklyAlarmDefinition,weeklyExistingLabDefinition,assertWeeklyStockAlarmProfile,WEEKLY_PROFILE_SUFFIX} from '../src/services/weekly-stock-alarm-profile.js';
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
test('weekly overlay keeps all reviewed legacy hashes and matches Python recovery selection',()=>{
 for(const [profile,expected]of Object.entries(weeklyAlarmDefinition.sourceProfiles)){
  const base=select({MWS_STORE_LIFECYCLE_PROFILE:profile});assert.equal(hash(base),expected);
  const target=select({MWS_STORE_LIFECYCLE_PROFILE:profile+WEEKLY_PROFILE_SUFFIX});assert.equal(automaticReportEventLifecycleReady({MWS_STORE_LIFECYCLE_PROFILE:profile+WEEKLY_PROFILE_SUFFIX}),true);assert.deepEqual(assertWeeklyStockAlarmProfile(target),base);assert.equal(target.executionDisabled,true);assert.equal(target.knownTables.length,base.knownTables.length+3);
  assert.equal(createLifecycleInstallationCore(target,{sourceRevision:'a'.repeat(40)}).describe().planHash,hash(target));
  const python=execFileSync('python3',['-c',`import json,worker;print(json.dumps(worker.selected_manifest_document({'MWS_STORE_LIFECYCLE_PROFILE':${JSON.stringify(profile+WEEKLY_PROFILE_SUFFIX)}})))`],{cwd:fileURLToPath(new URL('../../ops/backup/lifecycle/',import.meta.url)),encoding:'utf8'});assert.deepEqual(JSON.parse(python),target);
  const broken=structuredClone(target);broken.knownColumns.WeeklyStockAlarmPolicy[0][1]='integer';assert.throws(()=>assertWeeklyStockAlarmProfile(broken));
 }
 assert.equal(createHash('sha256').update(readFileSync(new URL('../../'+weeklyExistingLabDefinition.ownerSource,import.meta.url))).digest('hex'),weeklyExistingLabDefinition.ownerSourceHash);
 for(const review of weeklyExistingLabDefinition.runtimeCatalogueAdditions||[])assert.equal(createHash('sha256').update(readFileSync(new URL('../../'+review.ownerSource,import.meta.url))).digest('hex'),review.ownerSourceHash);
 const combined='MONTHLY_INVENTORY_CAPTURE_EVENT_REPORTS_ONLY_V4__EXISTING_EFOOD_LAB_V1__NO14_COMPAT_V2'+WEEKLY_PROFILE_SUFFIX,target=select({MWS_STORE_LIFECYCLE_PROFILE:combined});
 assert.deepEqual(assertWeeklyStockAlarmProfile(target),select({MWS_STORE_LIFECYCLE_PROFILE:'MONTHLY_INVENTORY_CAPTURE_EVENT_REPORTS_ONLY_V4'}));assert.ok(createLifecycleInstallationCore(target,{sourceRevision:'a'.repeat(40)}).describe().planHash);
 const python=execFileSync('python3',['-c',`import json,worker;print(json.dumps(worker.selected_manifest_document({'MWS_STORE_LIFECYCLE_PROFILE':${JSON.stringify(combined)}})))`],{cwd:fileURLToPath(new URL('../../ops/backup/lifecycle/',import.meta.url)),encoding:'utf8'});assert.deepEqual(JSON.parse(python),target);
 const mutable=select({MWS_STORE_LIFECYCLE_PROFILE:'MONTHLY_INVENTORY_CAPTURE_EVENT_REPORTS_ONLY_V3'+WEEKLY_PROFILE_SUFFIX});mutable.knownColumns.WeeklyStockAlarmPolicy[0][1]='integer';assert.throws(()=>assertWeeklyStockAlarmProfile(mutable));assert.equal(select({MWS_STORE_LIFECYCLE_PROFILE:'MONTHLY_INVENTORY_CAPTURE_EVENT_REPORTS_ONLY_V3'+WEEKLY_PROFILE_SUFFIX}).knownColumns.WeeklyStockAlarmPolicy[0][1],'text');
 assert.throws(()=>select({MWS_STORE_LIFECYCLE_PROFILE:'BASE'+WEEKLY_PROFILE_SUFFIX}));assert.equal(automaticReportEventLifecycleReady({MWS_STORE_LIFECYCLE_PROFILE:'BASE'+WEEKLY_PROFILE_SUFFIX}),false);
});

test('recovery image explicitly packages only the new reviewed weekly files',()=>{
 const docker=readFileSync(new URL('../../ops/backup/Dockerfile',import.meta.url),'utf8'),rules=readFileSync(new URL('../../ops/backup/Dockerfile.dockerignore',import.meta.url),'utf8');
 for(const p of ['weekly-stock-alarm-profile.js','weekly-stock-alarm-catalogue.js','weekly-stock-alarm-existing-lab.js']){assert.ok(docker.includes('server/src/services/'+p));assert.ok(rules.split('\n').includes('!server/src/services/'+p))}
 for(const p of ['weekly_stock_alarm_profile.py','weekly-stock-alarm-definition.proposed.json','weekly-stock-alarm-existing-lab.proposed.json'])assert.ok(rules.split('\n').includes('!ops/backup/lifecycle/'+p));
});
if(process.env.CI||process.env.MWS_LIFECYCLE_RECOVERY_IMAGE)test('actual recovery image reads the exact weekly V3 manifest without recovery or network',{timeout:30000},()=>{
 assert.ok(process.env.MWS_LIFECYCLE_RECOVERY_IMAGE);const profile='MONTHLY_INVENTORY_CAPTURE_EVENT_REPORTS_ONLY_V3'+WEEKLY_PROFILE_SUFFIX;
 const script=`import sys,json;sys.path.insert(0,'/backup/lifecycle');import worker;print(json.dumps(worker.selected_manifest_document({'MWS_STORE_LIFECYCLE_PROFILE':${JSON.stringify(profile)}})))`;
 const output=execFileSync('docker',['run','--rm','--network=none','--memory=128m','--pids-limit=40','--entrypoint','python3',process.env.MWS_LIFECYCLE_RECOVERY_IMAGE,'-c',script],{encoding:'utf8',timeout:25000,maxBuffer:1024*1024});assert.deepEqual(JSON.parse(output),select({MWS_STORE_LIFECYCLE_PROFILE:profile}));
});
