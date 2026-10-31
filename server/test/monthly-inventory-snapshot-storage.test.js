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

test('fixed cost limitations refuse mismatched counts, private keys and accessors before opening storage',async()=>{
 let opened=0,touched=0;const repository=createMonthlyInventorySnapshotRepository({$transaction:()=>{opened++;throw Error('admission reached')}}),actor={id:'u',companyId:'c'};
 const base={NON_REPRESENTABLE_PACKAGE_COST:0,AMBIGUOUS_LATEST_PURCHASE_COST:0};
 for(const stockCostLimitations of [null,[],{}, {...base,private:'secret'},{...base,NON_REPRESENTABLE_PACKAGE_COST:-1},{...base,NON_REPRESENTABLE_PACKAGE_COST:20001},{...base,NON_REPRESENTABLE_PACKAGE_COST:0.5},{...base,NON_REPRESENTABLE_PACKAGE_COST:1},{...base,NON_REPRESENTABLE_PACKAGE_COST:true}])await assert.rejects(repository.store(actor,{...request(),stockCostLimitations}),{code:'MONTHLY_SNAPSHOT_COVERAGE_INVALID'});
 const getter={...base};Object.defineProperty(getter,'NON_REPRESENTABLE_PACKAGE_COST',{enumerable:true,get(){touched++;throw Error('not called')}});await assert.rejects(repository.store(actor,{...request(),stockCostLimitations:getter}),{code:'MONTHLY_SNAPSHOT_COVERAGE_INVALID'});
 assert.equal(opened,0);assert.equal(touched,0);
 await assert.rejects(repository.store(actor,{...request(),stockCostLimitations:base}),/admission reached/);assert.equal(opened,1);
});
test('limitation sums cover exactly INVALID purchase facts while unknown MISSING values are not invented limitations',async()=>{
 let opened=0;const repository=createMonthlyInventorySnapshotRepository({$transaction:()=>{opened++;throw Error('admission reached')}}),value=input();
 value.products=[{id:'p',companyId:'c',storeId:'s',name:'Συνθετικό',sku:'',unit:'piece',quantity:'-2',retailUnitPrice:'0',purchaseUnitCost:false},{id:'missing',companyId:'c',storeId:'s',name:'Missing',sku:'',unit:'piece',quantity:'1',retailUnitPrice:null,purchaseUnitCost:null}];value.coverage.productCount=2;
 const r={...request(),candidateJsonText:serialize(build(value))};
 await assert.rejects(repository.store({companyId:'c'}, {...r,stockCostLimitations:{NON_REPRESENTABLE_PACKAGE_COST:0,AMBIGUOUS_LATEST_PURCHASE_COST:0}}),{code:'MONTHLY_SNAPSHOT_COVERAGE_INVALID'});assert.equal(opened,0);
 await assert.rejects(repository.store({companyId:'c'}, {...r,stockCostLimitations:{NON_REPRESENTABLE_PACKAGE_COST:1,AMBIGUOUS_LATEST_PURCHASE_COST:0}}),/admission reached/);assert.equal(opened,1);
 await assert.rejects(repository.store({companyId:'c'},r),/admission reached/);assert.equal(opened,2,'legacy request with no subtype metadata remains valid');
});
test('existing lookup requires explicit bounded epoch and scope and never accepts caller clocks or provenance',async()=>{
 let opened=0,touched=0;const repository=createMonthlyInventorySnapshotRepository({$transaction:()=>{opened++;throw Error('admission reached')}}),actor={id:'u',companyId:'c'},valid={storeId:'s',month:'2026-10',lifecycleGeneration:'0'};
 for(const input of [null,{}, {storeId:'s',month:'2026-10'}, {...valid,lifecycleGeneration:0},{...valid,lifecycleGeneration:'01'},{...valid,storeId:''},{...valid,now:'2026-11-01T05:00:00.000Z'},{...valid,sourceRevision:'a'.repeat(40)}])await assert.rejects(repository.findExisting(actor,input));
 const getter={...valid};Object.defineProperty(getter,'lifecycleGeneration',{enumerable:true,get(){touched++;throw Error('not called')}});await assert.rejects(repository.findExisting(actor,getter),{code:'MONTHLY_SNAPSHOT_INPUT_INVALID'});assert.equal(touched,0);assert.equal(opened,0);
 await assert.rejects(repository.findExisting(actor,valid),/admission reached/);assert.equal(opened,1);
});
