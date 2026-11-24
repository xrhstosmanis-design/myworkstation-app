import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {selectedStoreLifecycleManifest} from '../src/services/store-lifecycle-manifest.js';
import {monthlyInventorySummaryLifecycleReady} from '../src/services/automatic-report-event-schema.js';

test('monthly inventory V5 matches the backup worker and leaves V4 unchanged', () => {
 const previous='MONTHLY_INVENTORY_CAPTURE_EVENT_REPORTS_ONLY_V4';
 const current='MONTHLY_INVENTORY_CAPTURE_EVENT_REPORTS_ONLY_V5';
 const env=profile=>({MWS_STORE_LIFECYCLE_PROFILE:profile});
 const guard=manifest=>manifest.valueGuards.find(entry=>entry.table==='AutomaticReportEventConsent'&&entry.column==='reportType');
 const before=selectedStoreLifecycleManifest(env(previous));
 const after=selectedStoreLifecycleManifest(env(current));
 assert.equal(monthlyInventorySummaryLifecycleReady(env(previous)),false);
 assert.equal(monthlyInventorySummaryLifecycleReady(env(current)),true);
 assert.equal(guard(before).allowed.includes('MONTHLY_INVENTORY_SUMMARY'),false);
 assert.deepEqual(guard(after).allowed,[...guard(before).allowed,'MONTHLY_INVENTORY_SUMMARY']);
 const script="import json,sys; sys.path.insert(0,'ops/backup/lifecycle'); import worker; print(json.dumps(worker.selected_manifest_document({'MWS_STORE_LIFECYCLE_PROFILE':sys.argv[1]})))";
 const worker=JSON.parse(execFileSync('python3',['-c',script,current],{cwd:new URL('../../',import.meta.url),encoding:'utf8',timeout:10000}));
 assert.deepEqual(after,worker);
});
