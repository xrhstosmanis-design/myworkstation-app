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

test('V2 pins six additional columns while V1 hash remains immutable and scoped operations stay closed',()=>{
 const base=selectedStoreLifecycleManifest({MWS_STORE_LIFECYCLE_PROFILE:'BASE'});
 assert.equal(createHash('sha256').update(JSON.stringify(base)).digest('hex'),'ba554503bbb839524a1217af0149a6bf86b11384cb2dcb1bfc41d75a6d4290d4');
 const v1=selectedStoreLifecycleManifest({MWS_STORE_LIFECYCLE_PROFILE:profile});
 assert.equal(createHash('sha256').update(JSON.stringify(v1)).digest('hex'),'beaa37279a59ffe0c1e8d1e81026321e4c457c3b9e4a8a162ef9e52fcae78f26');
 const v2profile='MONTHLY_INVENTORY_CAPTURE_EVENT_REPORTS_ONLY_V2';
 const v2=selectedStoreLifecycleManifest({MWS_STORE_LIFECYCLE_PROFILE:v2profile});
 assert.equal(v2.reviewedColumnExtensions.length,6);
 assert.ok(v2.reviewedColumns.includes('TableOrder.cashParts'));
 assert.ok(v2.reviewedColumns.includes('StoreProduct.categoryIdOverride'));
 const old=structuredClone(v2);old.knownColumns.PurchaseOrder=old.knownColumns.PurchaseOrder.filter(column=>column[0]!=='awaitingInvoice');
 assert.throws(()=>createLifecycleInstallationCore(old,{sourceRevision:revision}),/column layout differs/);
 assert.throws(()=>createLifecycleExecutionCore(v2,{}),{code:'STORE_LIFECYCLE_REPORTS_ONLY'});
 const script="import sys,json;sys.path.insert(0,sys.argv[1]);import worker;print(json.dumps(worker.selected_manifest_document({'MWS_STORE_LIFECYCLE_PROFILE':sys.argv[2]})))";
 const result=spawnSync('python3',['-c',script,fileURLToPath(new URL('../../ops/backup/lifecycle',import.meta.url)),v2profile],{encoding:'utf8'});
 assert.equal(result.status,0,result.stderr);assert.deepEqual(JSON.parse(result.stdout),v2);
});
