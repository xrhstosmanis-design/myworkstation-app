import test from 'node:test';
import assert from 'node:assert/strict';
import {reviewedFreshStoreManifest,selectedStoreLifecycleManifest} from '../src/services/store-lifecycle-manifest.js';
import {withAutomaticReportEventConsent,automaticReportEventConsentColumns} from '../src/services/automatic-report-event-schema.js';

test('event report lifecycle selection preserves default manifests and declares scoped removable metadata',()=>{
  const original=reviewedFreshStoreManifest();
  const selected=selectedStoreLifecycleManifest({MWS_STORE_LIFECYCLE_PROFILE:'AUTOMATIC_EVENT_REPORTS_V1'});
  assert.deepEqual(reviewedFreshStoreManifest(),original);
  assert.deepEqual(selected.knownColumns.AutomaticReportEventConsent,automaticReportEventConsentColumns);
  assert.deepEqual(selected.tables.find(table=>table.name==='AutomaticReportEventConsent'),
    {name:'AutomaticReportEventConsent',owner:{kind:'DIRECT'},reset:'REMOVE'});
  assert.throws(()=>withAutomaticReportEventConsent(selected),/already declared/);
  for(const field of ['companyId','storeId','reportType','recipientId'])assert(selected.knownColumns.AutomaticReportEventConsent.some(column=>column[0]===field));
  const copy=structuredClone(selected);
  copy.id=original.id;
  for(const name of ['AutomaticReportEventConsent','AutomaticReportSupplierComparisonConsent']){
    copy.knownTables=copy.knownTables.filter(table=>table!==name);
    delete copy.knownColumns[name];
    copy.tables=copy.tables.filter(table=>table.name!==name);
    copy.reviewedColumns=copy.reviewedColumns.filter(column=>!column.startsWith(name+'.'));
    copy.valueGuards=copy.valueGuards.filter(guard=>guard.table!==name);
  }
  assert.deepEqual(copy,original);
});

test('monthly inventory capture and event report profiles compose without changing the original capture manifest',()=>{
  const original=selectedStoreLifecycleManifest({MWS_STORE_LIFECYCLE_PROFILE:'MONTHLY_INVENTORY_CAPTURE_V1'});
  const selected=selectedStoreLifecycleManifest({MWS_STORE_LIFECYCLE_PROFILE:'MONTHLY_INVENTORY_CAPTURE_EVENT_REPORTS_V1'});
  assert.deepEqual(selected,withAutomaticReportEventConsent(original));
  assert.deepEqual(selectedStoreLifecycleManifest({MWS_STORE_LIFECYCLE_PROFILE:'MONTHLY_INVENTORY_CAPTURE_V1'}),original);
});

test('event profile is accepted by the existing lifecycle planner',async()=>{
  const {createLifecycleInspectionCore}=await import('../src/services/store-lifecycle-executor.js');
  for(const profile of ['AUTOMATIC_EVENT_REPORTS_V1','MONTHLY_INVENTORY_CAPTURE_EVENT_REPORTS_V1']){
    assert.doesNotThrow(()=>createLifecycleInspectionCore(selectedStoreLifecycleManifest({MWS_STORE_LIFECYCLE_PROFILE:profile}),{sourceRevision:'a'.repeat(40)}));
  }
});
