import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const platform=fs.readFileSync(new URL("../src/routes/platform-admin.js",import.meta.url),"utf8");
const bootstrap=fs.readFileSync(new URL("../src/platform-bootstrap.js",import.meta.url),"utf8");
const cash=fs.readFileSync(new URL("../src/routes/cash-control.js",import.meta.url),"utf8");
const admin=fs.readFileSync(new URL("../../client/src/components/platform/PlatformAdminApp.jsx",import.meta.url),"utf8");
const backoffice=fs.readFileSync(new URL("../../client/src/main.jsx",import.meta.url),"utf8");

test("owner reports are sent manually by Super Admin",()=>{
  assert.match(bootstrap,/cashCloseEmailEnabled/);
  assert.match(platform,/cashCloseEmailEnabled:z\.boolean\(\)\.default\(true\)/);
  assert.match(cash,/MANUAL_SEND_REQUIRED/);
  assert.match(admin,/Προεπισκόπηση & email ιδιοκτητών/);
  assert.doesNotMatch(admin,/Αποστολή email στο κλείσιμο βάρδιας/);
});

test("super admin support access is short lived, tenant targeted and audited",()=>{
  assert.match(platform,/\/companies\/:companyId\/support-access/);
  assert.match(platform,/companyId:company\.id,role:"OWNER",platformRole:"SUPER_ADMIN",isSuperAdmin:true/);
  assert.match(platform,/expiresIn:"2h"/);
  assert.match(platform,/SUPER_ADMIN_SUPPORT_ACCESS/);
  assert.match(platform,/id:body\.storeId,companyId:company\.id/);
  assert.match(platform,/\/support-access\/exit/);
  assert.match(platform,/SUPER_ADMIN_SUPPORT_EXIT/);
  assert.match(platform,/req\.user\?\.supportContext/);
});

test("platform UI opens shifts and cash control and provides an explicit return",()=>{
  assert.match(admin,/>Βάρδιες<\/button>/);
  assert.match(admin,/>Έλεγχος Ταμείων<\/button>/);
  assert.match(admin,/sessionStorage\.setItem\("platformToken"/);
  assert.match(backoffice,/Επιστροφή στο Super Admin/);
  assert.match(backoffice,/ΠΡΟΣΒΑΣΗ SUPER ADMIN/);
  assert.match(backoffice,/\/api\/platform\/support-access\/exit/);
  assert.match(backoffice,/sessionStorage\.removeItem\("platformToken"/);
});
