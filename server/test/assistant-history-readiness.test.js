import test from 'node:test';
import assert from 'node:assert/strict';
import {historyRetentionMac,validateHistoryRetention,HISTORY_RETENTION_PROTOCOL,readHistoryRetentionReady} from '../src/services/assistant-history-readiness.js';
const secret='isolated-history-retention-test-secret';
const now=Date.parse('2026-10-19T18:00:00Z'),manifestHash='a'.repeat(64);
const record=(patch={})=>{const heartbeatJson=JSON.stringify({protocol:HISTORY_RETENTION_PROTOCOL,manifestHash,workerRevision:'b'.repeat(40),checkedAt:new Date(now).toISOString(),state:'COMPLETED',...patch});return {heartbeatJson,mac:historyRetentionMac(secret,heartbeatJson)}};
test('history activation requires authentic current-manifest recent successful retention proof',()=>{
 const options={secret,manifestHash,now};assert.equal(validateHistoryRetention(record(),options),true);
 for(const patch of [{state:'DISABLED'},{manifestHash:'c'.repeat(64)},{protocol:'MWS_STORE_RECOVERY_CAPABILITY_V1'},{workerRevision:'unknown'},{checkedAt:new Date(now-720001).toISOString()},{checkedAt:new Date(now+30001).toISOString()}])assert.equal(validateHistoryRetention(record(patch),options),false);
 assert.equal(validateHistoryRetention({...record(),mac:'0'.repeat(64)},options),false);
 assert.equal(validateHistoryRetention(record(),{...options,secret:'different-history-retention-test-secret'}),false);
 assert.equal(validateHistoryRetention({heartbeatJson:'SECRET',mac:'x'},options),false);
});
test('absent or failed retention metadata is unavailable without schema creation',async()=>{
 for(const db of [{$queryRawUnsafe:async()=>[{schema:'public',runtime:null}]},{$queryRawUnsafe:async()=>{throw Error('unavailable')}}])assert.equal(await readHistoryRetentionReady(db,{secret}),false);
});
