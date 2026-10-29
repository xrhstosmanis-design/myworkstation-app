import test from 'node:test';
import assert from 'node:assert/strict';
import {buildMonthlyInventorySnapshotCandidate as build,serializeMonthlyInventorySnapshotCandidate as serialize} from '../src/services/monthly-inventory-snapshot-payload.js';
import {createMonthlyInventorySnapshotRepository} from '../src/services/monthly-inventory-snapshot-repository.js';
import {monthlyInventorySnapshotLifecycleManifestProposal,assertMonthlySnapshotLifecycleCatalogue} from '../src/services/monthly-inventory-snapshot-schema.js';
import {reviewedFreshStoreManifest} from '../src/services/store-lifecycle-manifest.js';
const input=()=>({companyId:'c',storeId:'s',lifecycleGeneration:'0',issueMonth:'2026-10',sourceObservedAt:'2026-11-01T05:00:00.002Z',sourceRevision:'a'.repeat(40),valuationBasis:'CURRENT_OPERATIONAL_V1',coverage:{complete:true,productCount:0,invoiceCount:0,pendingOriginalCount:0},products:[],invoices:{period:'2026-10',items:[]},pendingOriginals:{period:'ALL_MONTHS',items:[]}});
const request=()=>({candidateJsonText:serialize(build(input())),transactionStartedAt:'2026-11-01T05:00:00.000Z',sourceReadStartedAt:'2026-11-01T05:00:00.001Z',sourceReadFinishedAt:'2026-11-01T05:00:00.002Z'});
test('D2 proposed catalogue is explicit and the current canonical production catalogue stays without the unprovisioned relation',()=>{
 const baseline=reviewedFreshStoreManifest(),proposed=monthlyInventorySnapshotLifecycleManifestProposal();assert.equal(baseline.knownTables.includes('MonthlyInventorySnapshot'),false);assert.doesNotThrow(()=>assertMonthlySnapshotLifecycleCatalogue(proposed));
 const changed=structuredClone(proposed);changed.tables.find(t=>t.name==='MonthlyInventorySnapshot').reset='REMOVE';assert.throws(()=>assertMonthlySnapshotLifecycleCatalogue(changed));
 const unrelated=structuredClone(proposed);unrelated.tables.find(t=>t.name==='Employee').reset='KEEP';assert.throws(()=>assertMonthlySnapshotLifecycleCatalogue(unrelated));
 assert.throws(()=>assertMonthlySnapshotLifecycleCatalogue(baseline));
});
test('unmounted storage rejects forged, private, getter or wrong-scope requests before opening a transaction',async()=>{
 let opened=0,touched=0;const repository=createMonthlyInventorySnapshotRepository({$transaction:()=>{opened++;throw Error('must not reach database')}}),actor={id:'u',companyId:'c'};
 for(const invalid of [null,{}, {...request(),privateToken:'secret'},{...request(),candidateJsonText:'{}'}])await assert.rejects(repository.store(actor,invalid));
 const getter=request();Object.defineProperty(getter,'candidateJsonText',{enumerable:true,get(){touched++;throw Error('not called')}});await assert.rejects(repository.store(actor,getter),{code:'MONTHLY_SNAPSHOT_INPUT_INVALID'});
 await assert.rejects(repository.store({...actor,companyId:'other'},request()),{code:'MONTHLY_SNAPSHOT_SCOPE_INVALID'});assert.equal(opened,0);assert.equal(touched,0);
});
test('storage refuses pre-due transaction snapshots, inverted/overlong intervals and a later finish relabelled as the observation',async()=>{
 let opened=0;const repository=createMonthlyInventorySnapshotRepository({$transaction:()=>{opened++;throw Error('must not reach database')}});
 for(const patch of [{transactionStartedAt:'2026-11-01T04:59:59.999Z'},{sourceReadStartedAt:'2026-11-01T05:00:00.003Z'},{transactionStartedAt:'2026-10-31T05:00:00.000Z'},{sourceReadFinishedAt:'2026-11-01T05:00:00.003Z'},{transactionStartedAt:'2026-11-01T05:00:00Z'}])await assert.rejects(repository.store({companyId:'c'},{...request(),...patch}),{code:'MONTHLY_SNAPSHOT_OBSERVATION_INVALID'});
 assert.equal(opened,0);
});
