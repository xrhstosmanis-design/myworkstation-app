import test from 'node:test';
import assert from 'node:assert/strict';
import {lifecycleWorkerCapabilityMac,validateLifecycleWorkerCapability,readLifecycleWorkerCapability} from '../src/services/store-lifecycle-worker-ready.js';
const secret='isolated-capability-secret-at-least24',manifestHash='1'.repeat(64),now=Date.parse('2026-10-19T10:00:00Z');
const value={protocol:'MWS_STORE_RECOVERY_CAPABILITY_V1',manifestHash,workerRevision:'2'.repeat(40),storagePolicyVerified:true,rowDigestFormat:'MWS_ROW_MULTISET_SHA256_V1',checkedAt:new Date(now).toISOString()},seal=v=>{const heartbeatJson=JSON.stringify(v);return {heartbeatJson,mac:lifecycleWorkerCapabilityMac(secret,heartbeatJson)}};
test('worker availability requires exact manifest, genuine domain-separated signature, source revision and fresh checked storage policy',()=>{
 assert.equal(validateLifecycleWorkerCapability(seal(value),{secret,manifestHash,now}),true);
 for(const [key,v] of Object.entries({protocol:'MWS_STORE_RECOVERY_PROOF_V1',manifestHash:'3'.repeat(64),workerRevision:'UNKNOWN',storagePolicyVerified:false,checkedAt:'2026-10-19T09:47:59Z'}))assert.equal(validateLifecycleWorkerCapability(seal({...value,[key]:v}),{secret,manifestHash,now}),false,key);
 assert.equal(validateLifecycleWorkerCapability(seal({...value,checkedAt:'2026-10-19T10:00:31Z'}),{secret,manifestHash,now}),false);
 const changed=seal(value);changed.heartbeatJson=changed.heartbeatJson.replace('true','false');assert.equal(validateLifecycleWorkerCapability(changed,{secret,manifestHash,now}),false);
 assert.equal(validateLifecycleWorkerCapability(seal(value),{secret:secret+'wrong',manifestHash,now}),false);
});
test('readiness discovery is read-only, never enrolls stores, refuses missing table and verifies actual metadata receipt',async()=>{
 const calls=[],db={$queryRawUnsafe:async sql=>{calls.push(sql);return sql.includes('to_regclass')?[{schema:'fixture',runtime:'fixture."StoreLifecycleRuntime"'}]:[seal(value)]}};
 assert.equal(await readLifecycleWorkerCapability(db,{secret,manifestHash,now}),true);assert.ok(calls.every(s=>s.startsWith('SELECT ')));
 assert.equal(await readLifecycleWorkerCapability({$queryRawUnsafe:async()=>[{schema:'fixture',runtime:null}]},{secret,manifestHash,now}),false);
 assert.equal(await readLifecycleWorkerCapability({$queryRawUnsafe:async()=>{throw Error('Unavailable fixture')}},{secret,manifestHash,now}),false);
});
