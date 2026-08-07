import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const schema=fs.readFileSync(new URL("../prisma/schema.prisma",import.meta.url),"utf8");
const bootstrap=fs.readFileSync(new URL("../src/platform-bootstrap.js",import.meta.url),"utf8");
const platform=fs.readFileSync(new URL("../src/routes/platform-admin.js",import.meta.url),"utf8");
const cash=fs.readFileSync(new URL("../src/routes/cash-control.js",import.meta.url),"utf8");
const ui=fs.readFileSync(new URL("../../client/src/components/platform/PlatformAdminApp.jsx",import.meta.url),"utf8");

test("store responsible email schema is additive",()=>{
  assert.match(schema,/responsibleEmail\s+String\?/);
  assert.match(bootstrap,/ALTER TABLE "Store" ADD COLUMN IF NOT EXISTS "responsibleEmail" TEXT/);
});

test("Super Admin can update only a store owned by the selected company",()=>{
  assert.match(platform,/\/companies\/:companyId\/stores\/:storeId/);
  assert.match(platform,/id:req\.params\.storeId,companyId:req\.params\.companyId/);
  assert.match(platform,/responsibleEmail:z\.string\(\)\.trim\(\)\.email\(\)/);
  assert.match(ui,/Email υπευθύνου/);
  assert.match(ui,/Οι αναφορές κλεισίματος θα αποστέλλονται στον OWNER/);
});

test("cash close deduplicates owner and store-responsible recipients",()=>{
  assert.match(cash,/store\?\.responsibleEmail/);
  assert.match(cash,/sendCashShiftClosedEmail/);
  assert.match(fs.readFileSync(new URL("../src/services/mail.js",import.meta.url),"utf8"),/new Set/);
});
