import test from 'node:test';
import assert from 'node:assert/strict';
import {createLifecycleController,validatePhysicalLifecycleEvidence} from '../src/services/store-lifecycle-controller.js';
const operationId='11111111-1111-4111-8111-111111111111',now=Date.parse('2026-10-19T10:00:00Z'),scope={companyId:'company',storeId:'target'};
const terminals=[{terminalPos:'KAT-POS-01',workFolder:'C:\\capture'},{terminalPos:'KAT-POS-02',workFolder:'C:\\capture'}];
const attestation={actualCapFoldersVerified:true,allWritersAndCapStopped:true,allOtherOfflineDevicesAccountedFor:true,noPendingPhysicalOrBankWork:true};
const sample=t=>({checkedAtUtc:new Date(t).toISOString(),workFolder:'C:\\capture',fileCount:0,directoryCount:0,rbsCommandFileCount:0,temporaryFileCount:0,otherFileCount:0,totalFileBytes:0,metadataSha256:'1'.repeat(64)});
const reports=terminals.map((t,i)=>({format:'MWS_CAP_SPOOL_OBSERVATION_V1',...scope,terminalPos:t.terminalPos,operationId,observationId:`22222222-2222-4222-8222-22222222222${i}`,readyForDeletion:false,unchangedBetweenSamples:true,processObservation:'OBSERVED',matchingWriterProcessCount:0,matchingCapDriverProcessCount:0,samples:[sample(now-3000),sample(now-1000)]}));
const options={scope,operationId,terminals,startedAt:new Date(now-10000).toISOString(),now};
test('both post-drain empty physical observations require separate explicit technician facts and preserve diagnostic non-authorization',()=>{
 const result=validatePhysicalLifecycleEvidence({reports,attestation},options);assert.equal(result.observations.length,2);assert.equal(result.operationId,operationId);assert.equal(reports[0].readyForDeletion,false);assert.match(result.observations[0].reportSha256,/^[a-f0-9]{64}$/);
 for(const key of Object.keys(attestation))assert.throws(()=>validatePhysicalLifecycleEvidence({reports,attestation:{...attestation,[key]:false}},options));
 for(const modify of [r=>r.pop(),r=>r.push(structuredClone(r[0])),r=>r[1].terminalPos=r[0].terminalPos,r=>r[0].storeId='sibling',r=>r[0].companyId='other',r=>r[0].operationId='22222222-2222-4222-8222-222222222222',r=>r[0].processObservation='PARTIAL',r=>r[0].matchingWriterProcessCount=1,r=>r[0].matchingCapDriverProcessCount=1,r=>r[0].samples[0].workFolder='C:\\wrong',r=>r[0].samples[0].fileCount=1,r=>r[0].samples[0].otherFileCount=1,r=>r[0].samples[0].directoryCount=1,r=>r[0].samples[0].metadataSha256='2'.repeat(64),r=>r[0].samples[0].checkedAtUtc=new Date(now-11000).toISOString(),r=>r[0].samples[1].checkedAtUtc=new Date(now+31000).toISOString(),r=>r[0].samples[1].checkedAtUtc=r[0].samples[0].checkedAtUtc]){const rows=structuredClone(reports);modify(rows);assert.throws(()=>validatePhysicalLifecycleEvidence({reports:rows,attestation},options));}
 assert.throws(()=>validatePhysicalLifecycleEvidence({reports,attestation},{...options,now:now+16*60*1000}));
});
test('all central controller actions require a genuine Platform Super Admin before database access; disabled execution does not touch DB',async()=>{
 const db={$queryRawUnsafe(){throw Error('unexpected DB')},$transaction(){throw Error('unexpected DB')}},controller=createLifecycleController(db,{sourceRevision:'1'.repeat(40),enabled:()=>false,secret:()=> 'isolated-secret-at-least-24-characters'});
 for(const method of ['inspect','start','status','prepare','execute','abort','reopen'])for(const user of [null,{id:'owner',role:'OWNER'},{id:'fake',role:'SUPER_ADMIN'}])await assert.rejects(controller[method](user,scope,{}),e=>e.status===403);
 for(const method of ['start','prepare','execute','reopen'])await assert.rejects(controller[method]({id:'sa',isSuperAdmin:true},scope,{}),e=>e.status===503);
 await assert.rejects(controller.start({id:'sa',isSuperAdmin:true},{companyId:'company',storeId:''}),e=>e.status===400);
});
