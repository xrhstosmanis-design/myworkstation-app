import test from 'node:test';
import assert from 'node:assert/strict';
import {recoveryProofMac,validateRecoveryProof,createVerifiedRecoveryAdapter} from '../src/services/store-lifecycle-recovery-proof.js';
const secret='isolated-proof-test-secret-at-least-24',operationId='11111111-1111-4111-8111-111111111111',now=Date.parse('2026-10-19T10:00:00Z');
const snapshot={sourceRevision:'1'.repeat(40),planHash:'2'.repeat(64),scope:{companyId:'company',storeId:'target',mode:'RESET'},snapshotHash:'3'.repeat(64)};
const proof={protocol:'MWS_STORE_RECOVERY_PROOF_V1',operationId,sourceRevision:snapshot.sourceRevision,manifestHash:snapshot.planHash,...snapshot.scope,snapshotHash:snapshot.snapshotHash,restoredSnapshotHash:snapshot.snapshotHash,storageReadbackVerified:true,selectiveRestoreVerified:true,controlsUnchanged:true,fullRestoreAudit:{dataMatches:true},selectiveRestoreAudit:{dataMatches:true},artifactSha256:'4'.repeat(64),objectKey:`myworkstation/lifecycle/${operationId}/fixture.dump`,objectVersion:'isolated-version',verifiedAt:new Date(now).toISOString()};
const seal=p=>{const proofJson=JSON.stringify(p);return {proofJson,mac:recoveryProofMac(secret,proofJson)}};
test('recovery receipt binds operation, source, exact scope, complete restore, controls, artifact version and recent time',()=>{
 assert.equal(validateRecoveryProof(seal(proof),{secret,operationId,snapshot,now}).objectVersion,'isolated-version');
 for(const [field,value] of Object.entries({operationId:'22222222-2222-4222-8222-222222222222',sourceRevision:'f'.repeat(40),manifestHash:'f'.repeat(64),companyId:'other',storeId:'sibling',mode:'DELETE',snapshotHash:'f'.repeat(64),restoredSnapshotHash:'f'.repeat(64),storageReadbackVerified:false,selectiveRestoreVerified:false,controlsUnchanged:false,fullRestoreAudit:{dataMatches:false},selectiveRestoreAudit:{dataMatches:false},artifactSha256:'invalid',objectVersion:'',objectKey:'myworkstation/other.dump',verifiedAt:'2026-10-19T09:29:59Z'}))assert.throws(()=>validateRecoveryProof(seal({...proof,[field]:value}),{secret,operationId,snapshot,now}),field);
 assert.throws(()=>validateRecoveryProof(seal({...proof,verifiedAt:'2026-10-19T10:00:31Z'}),{secret,operationId,snapshot,now}));
 const tampered=seal(proof);tampered.proofJson=tampered.proofJson.replace('target','sibling');assert.throws(()=>validateRecoveryProof(tampered,{secret,operationId,snapshot,now}));
 assert.throws(()=>validateRecoveryProof(seal(proof),{secret:secret+'wrong',operationId,snapshot,now}));
 assert.throws(()=>recoveryProofMac('',JSON.stringify(proof)));assert.throws(()=>recoveryProofMac(secret,'x'.repeat(32769)));
});
test('adapter reads only the exact fresh prepared operation and rejects missing receipts without invoking backup or deletion',async()=>{
 const calls=[],db={$queryRawUnsafe:async(sql,...args)=>{calls.push({sql,args});return sql.includes('current_schema')?[{name:'private_schema'}]:[]}};
 await assert.rejects(createVerifiedRecoveryAdapter(db,{secret:()=>secret})(snapshot,{operationId}),e=>e.status===409);
 assert.equal(calls.length,2);assert.match(calls[1].sql,/"state"='PREPARED'/);assert.match(calls[1].sql,/"expiresAt">NOW\(\)/);assert.deepEqual(calls[1].args,[operationId,'company','target',snapshot.snapshotHash]);assert.ok(calls.every(c=>/^SELECT /.test(c.sql)));
});
