import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {reviewedFreshStoreManifest,selectedStoreLifecycleManifest} from '../src/services/store-lifecycle-manifest.js';
import {createLifecycleController} from '../src/services/store-lifecycle-controller.js';
import {lifecycleWorkerCapabilityMac} from '../src/services/store-lifecycle-worker-ready.js';

const key='MWS_STORE_LIFECYCLE_PROFILE',full='MONTHLY_INVENTORY_CAPTURE_V1';
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const baseHash='da2844a0cd3d4fe6ae3e78a57ffbcf882277be4aa21eed5a6eb2e7a44df1ecda';
const fullHash='e60d2f2805e6b585cd1af22d56998db36f64e561d49cb99266a4bfb1e32532b5';
const workerDirectory=path.resolve('../ops/backup/lifecycle');
const scopedEnv=async(values,fn)=>{const saved=Object.fromEntries(Object.keys(values).map(k=>[k,process.env[k]]));try{for(const [k,v]of Object.entries(values))v===undefined?delete process.env[k]:process.env[k]=v;return await fn()}finally{for(const[k,v]of Object.entries(saved))v===undefined?delete process.env[k]:process.env[k]=v}};

test('BASE accessor remains canonical, selection is closed and returned documents are independent',()=>{
 const before=JSON.stringify(process.env),base=reviewedFreshStoreManifest();
 assert.equal(hash(base),baseHash);
 for(const env of [{},{[key]:'BASE'}])assert.deepEqual(selectedStoreLifecycleManifest(env),base);
 const selected=selectedStoreLifecycleManifest({[key]:full});
 assert.equal(hash(selected),fullHash);assert.equal(selected.knownTables.length,275);assert.equal(base.knownTables.length,272);
 selected.tables[0].name='MUTATED';base.knownTables.length=0;
 assert.equal(hash(selectedStoreLifecycleManifest({[key]:full})),fullHash);
 assert.equal(hash(reviewedFreshStoreManifest()),baseHash);
 assert.equal(hash(selectedStoreLifecycleManifest({})),baseHash);
 for(const value of ['', ' ', 'base', 'BASE ', 'monthly_inventory_capture_v1', full+' ', '../manifest.json', '/tmp/manifest.json', '{}', 'UNKNOWN', null, true, 1])assert.throws(()=>selectedStoreLifecycleManifest({[key]:value}),/Invalid store lifecycle profile/);
 assert.equal(JSON.stringify(process.env),before,'selection cannot activate or change configuration');
});

test('actual Python fixed selector agrees with JavaScript and invalid profiles cannot enter process_one',()=>{
 const script=`import sys,json,hashlib\nsys.path.insert(0,sys.argv[1])\nimport worker\nvalues=json.loads(sys.argv[2])\nresult=[]\nfor value in values:\n env={} if value is None else {'${key}':value}\n try:\n  selected=worker.selected_manifest_file(env)\n  result.append({'file':selected.name,'hash':hashlib.sha256(worker.compact(json.loads(selected.read_text())).encode()).hexdigest()})\n except ValueError:\n  result.append({'denied':True})\nprint(json.dumps(result))`;
 const values=[null,'BASE',full,'',' ', 'base',full+' ','../manifest.json','UNKNOWN'];
 const result=spawnSync('python3',['-c',script,workerDirectory,JSON.stringify(values)],{encoding:'utf8',timeout:15000});
 assert.equal(result.status,0,result.stderr);const rows=JSON.parse(result.stdout);
 assert.deepEqual(rows.slice(0,3),[{file:'manifest.json',hash:baseHash},{file:'manifest.json',hash:baseHash},{file:'monthly-inventory-capture-manifest.proposed.json',hash:fullHash}]);
 assert.ok(rows.slice(3).every(row=>row.denied===true));
 const python=spawnSync('python3',['-c','import sys; print(sys.executable)'],{encoding:'utf8',timeout:15000});assert.equal(python.status,0,python.stderr);
 const entry=spawnSync(python.stdout.trim(),[path.join(workerDirectory,'worker.py')],{env:{...process.env,[key]:'../manifest.json',PATH:''},encoding:'utf8',timeout:15000});
 assert.equal(entry.status,1);assert.deepEqual(JSON.parse(entry.stderr),{state:'FAILED',error:'ValueError'});
});

test('controller uses the selected signed capability and profile selection never enables execution',async()=>{
 const secret='isolated-profile-secret-at-least-24',scope={companyId:'fixture-company',storeId:'fixture-store'},operation='11111111-1111-4111-8111-111111111111';
 let record,calls=0;
 const seal=(manifestHash,patch={})=>{const heartbeatJson=JSON.stringify({protocol:'MWS_STORE_RECOVERY_CAPABILITY_V1',manifestHash,workerRevision:'a'.repeat(40),storagePolicyVerified:true,rowDigestFormat:'MWS_ROW_MULTISET_SHA256_V1',checkedAt:new Date().toISOString(),...patch});return{heartbeatJson,mac:lifecycleWorkerCapabilityMac(secret,heartbeatJson)}};
 const db={$queryRawUnsafe:async sql=>{calls++;assert.ok(sql.startsWith('SELECT '));if(sql.includes('to_regclass'))return[{schema:'public',runtime:'public."StoreLifecycleRuntime"'}];if(sql.includes('StoreLifecycleRuntime'))return[record];if(sql.includes('StoreLifecycleExecution'))return[{state:'PREPARED',fresh:true,result:null}];if(sql==='SELECT current_schema() AS name')return[{name:'public'}];assert.fail('Unexpected query')},$transaction:()=>assert.fail('No mutation')};
 await scopedEnv({[key]:full,STORE_LIFECYCLE_EXECUTION_ENABLED:undefined},async()=>{
  const off=createLifecycleController(db,{sourceRevision:'a'.repeat(40),secret:()=>secret});
  await assert.rejects(off.start({id:'sa',isSuperAdmin:true},scope),error=>error.status===503);assert.equal(calls,0);
  const controller=createLifecycleController(db,{sourceRevision:'a'.repeat(40),enabled:()=>true,secret:()=>secret});
  for(const[receipt,expected]of [[seal(fullHash),true],[seal(baseHash),false],[seal(fullHash,{checkedAt:new Date(Date.now()-13*60000).toISOString()}),false],[{...seal(fullHash),mac:'0'.repeat(64)},false]]){record=receipt;assert.equal((await controller.status({id:'sa',isSuperAdmin:true},scope,operation)).executionAvailable,expected)}
  assert.equal(hash(reviewedFreshStoreManifest()),baseHash);
 });
 await scopedEnv({[key]:'UNKNOWN'},async()=>assert.throws(()=>createLifecycleController(db,{sourceRevision:'a'.repeat(40)}),/Invalid store lifecycle profile/));
});

test('recovery build allowlist explicitly ships only the reviewed added full-profile document',()=>{
 const rules=readFileSync(path.resolve('../ops/backup/Dockerfile.dockerignore'),'utf8').split('\n');
 assert.equal(rules.filter(rule=>rule==='!ops/backup/lifecycle/monthly-inventory-capture-manifest.proposed.json').length,1);
 assert.ok(rules.includes('!ops/backup/lifecycle/manifest.json'));
 assert.ok(!rules.includes('!ops/backup/lifecycle/*.json'),'no arbitrary profile packaging');
});

test('actual CI recovery image contains both fixed manifests and the pure selector, without running recovery',{
 skip:!process.env.MWS_LIFECYCLE_RECOVERY_IMAGE&&!process.env.CI?'Actual recovery image unavailable locally':false,timeout:30000
},()=>{
 assert.ok(process.env.MWS_LIFECYCLE_RECOVERY_IMAGE,'Actual CI recovery image is mandatory');
 const script=`import sys,json,hashlib\nsys.path.insert(0,'/backup/lifecycle')\nimport worker\nresult=[]\nfor env in ({},{'${key}':'BASE'},{'${key}':'${full}'}):\n p=worker.selected_manifest_file(env)\n result.append(hashlib.sha256(worker.compact(json.loads(p.read_text())).encode()).hexdigest())\ntry:\n worker.selected_manifest_file({'${key}':'../manifest.json'})\n raise AssertionError('Unknown profile accepted')\nexcept ValueError:\n pass\nprint(json.dumps(result))`;
 const run=spawnSync('docker',['run','--rm','--network=none','--memory=128m','--pids-limit=40','--entrypoint','python3',process.env.MWS_LIFECYCLE_RECOVERY_IMAGE,'-c',script],{encoding:'utf8',timeout:25000,maxBuffer:1024*1024});
 assert.equal(run.status,0,run.stderr);assert.deepEqual(JSON.parse(run.stdout),[baseHash,baseHash,fullHash]);
});
