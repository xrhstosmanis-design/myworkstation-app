import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {selectedStoreLifecycleManifest} from '../src/services/store-lifecycle-manifest.js';
import {createLifecycleExecutionCore,createLifecycleInspectionCore,createLifecycleInstallationCore} from '../src/services/store-lifecycle-executor.js';
const profile='MONTHLY_INVENTORY_CAPTURE_EVENT_REPORTS_ONLY_V1',revision='a'.repeat(40);
test('reports-only profile preserves nine operational tables without ownership or guards and blocks scoped operations',()=>{
 const manifest=selectedStoreLifecycleManifest({MWS_STORE_LIFECYCLE_PROFILE:profile});
 assert.equal(manifest.executionDisabled,true);
 assert.ok(manifest.reviewedColumns.includes('InventoryWarehouseEditAudit.before'));
 assert.ok(manifest.reviewedColumns.includes('PosScannedCashReturn.resultJson'));
 const missing=structuredClone(manifest);missing.reviewedColumns=missing.reviewedColumns.filter(column=>column!=='InventoryWarehouseEditAudit.productId');
 assert.throws(()=>createLifecycleInstallationCore(missing,{sourceRevision:revision}),/column review differs/);assert.equal(manifest.preservedOperationalTables.length,9);
 for(const name of manifest.preservedOperationalTables){assert.ok(manifest.knownColumns[name]);assert.equal(manifest.tables.some(table=>table.name===name),false);}
 assert.equal(manifest.tables.find(table=>table.name==='StoreProduct').existingTriggers.at(-1).name,'mws_guard_package_stock_change');
 assert.ok(createLifecycleInstallationCore(manifest,{sourceRevision:revision}).describe().planHash);
 for(const factory of [createLifecycleExecutionCore,createLifecycleInspectionCore])assert.throws(()=>factory(manifest,{sourceRevision:revision,persistAndVerifyRecovery(){throw Error('unexpected')}}),{code:'STORE_LIFECYCLE_REPORTS_ONLY'});
});
test('old profile hashes remain exact and Python composes the identical reports-only manifest',()=>{
 const old=selectedStoreLifecycleManifest({MWS_STORE_LIFECYCLE_PROFILE:'MONTHLY_INVENTORY_CAPTURE_V1'});
 assert.equal(createHash('sha256').update(JSON.stringify(old)).digest('hex'),'59ca657191a03dfeb751e907d95abe4291a3fc61da30c9d0602a116ed78757c2');
 const script="import sys,json;sys.path.insert(0,sys.argv[1]);import worker;print(json.dumps(worker.selected_manifest_document({'MWS_STORE_LIFECYCLE_PROFILE':sys.argv[2]})))";
 const result=spawnSync('python3',['-c',script,fileURLToPath(new URL('../../ops/backup/lifecycle',import.meta.url)),profile],{encoding:'utf8'});
 assert.equal(result.status,0,result.stderr);
 assert.deepEqual(JSON.parse(result.stdout),selectedStoreLifecycleManifest({MWS_STORE_LIFECYCLE_PROFILE:profile}));
});
