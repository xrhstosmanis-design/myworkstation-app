import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const route=fs.readFileSync(new URL('../src/routes/platform-admin.js',import.meta.url),'utf8');
const ui=fs.readFileSync(new URL('../../client/src/components/platform/PlatformAdminApp.jsx',import.meta.url),'utf8');

test('Recovery Workflow foundation is tenant/store scoped and checksum-addressed',()=>{
  assert.match(route,/CREATE TABLE IF NOT EXISTS "RecoveryWorkflowRun"/);
  assert.match(route,/UNIQUE \("storeId","backupChecksum"\)/);
  assert.match(route,/REC-\$\{actual\.slice\(0,16\)/);
  assert.match(route,/WHERE "companyId"=\$\{req\.params\.companyId\} AND "storeId"=\$\{store\.id\}/);
});

test('dry-run records revision evidence while real restore stays locked',()=>{
  for(const token of ['DRY_RUN_PASSED','rollbackCheckpointRequired','realRestoreEnabled','externalProviderCalled:false'])assert.match(route,new RegExp(token));
  assert.doesNotMatch(route,/recovery-workflows[^\n]{0,200}(?:DELETE FROM|TRUNCATE|DROP TABLE)/);
  assert.match(ui,/RECOVERY WORKFLOW · DRY-RUN PASSED/);
  assert.match(ui,/πραγματικό restore ΚΛΕΙΔΩΜΕΝΟ/);
  assert.match(ui,/data-recovery-workflow-center/);
});
