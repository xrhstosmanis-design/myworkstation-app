import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("pending center aggregates tenant-scoped chat tasks with owner controls",()=>{
  const route=fs.readFileSync(new URL("../src/routes/pending-center.js",import.meta.url),"utf8");
  const panel=fs.readFileSync(new URL("../../client/src/components/commerce/PendingCenterPanel.jsx",import.meta.url),"utf8");
  const hub=fs.readFileSync(new URL("../../client/src/components/commerce/CommerceHub.jsx",import.meta.url),"utf8");
  const index=fs.readFileSync(new URL("../src/index.js",import.meta.url),"utf8");
  assert.match(index,/\/api\/pending-center/);
  assert.match(index,/requireCompanyModule\("PENDING_CENTER"\)/);
  assert.match(route,/isPlatformSuperAdmin/);
  assert.match(route,/user\?\.role==="OWNER"/);
  assert.match(route,/t\."companyId"=\$\{company\}/);
  assert.match(route,/s\."companyId"=t\."companyId"/);
  assert.match(route,/t\."storeId"=\$\{storeId\}/);
  assert.match(route,/STORE_CHAT_TASK_COMPLETED/);
  assert.match(route,/STORE_CHAT_TASK_REOPENED/);
  assert.match(route,/Cache-Control","no-store/);
  assert.match(panel,/Όλα τα καταστήματα/);
  assert.match(panel,/Ανοιχτές/);
  assert.match(panel,/Ολοκληρωμένες/);
  assert.match(panel,/Κλείσιμο/);
  assert.match(panel,/Επαναφορά/);
  assert.match(panel,/completedByName/);
  assert.match(hub,/active\.has\("PENDING_CENTER"\)/);
  assert.match(hub,/<PendingCenterPanel/);
});
