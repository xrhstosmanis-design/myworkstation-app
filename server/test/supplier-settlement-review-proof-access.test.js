import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

const route=await readFile(new URL('../src/routes/store-transactions.js',import.meta.url),'utf8');
const review=await readFile(new URL('../../client/src/components/platform/SupplierSettlementReviewCenter.jsx',import.meta.url),'utf8');
const analytics=await readFile(new URL('../../client/src/components/platform/SuperAdminChecksAnalytics.jsx',import.meta.url),'utf8');

test('review proof access is restricted to owner or Super Admin and to pending settlements',()=>{
  const endpoint=route.split('router.get("/supplier-settlements/:settlementId/attachment"')[1]?.split('router.post(')[0];
  assert.ok(endpoint);
  assert.match(route,/function requireSuperAdminSettlementReview\(req,res,next\)[\s\S]*?tokenType!=="STORE_OPERATOR"[\s\S]*?role==="OWNER"[\s\S]*?403/);
  assert.match(endpoint,/requireSuperAdminSettlementReview/);
  assert.match(endpoint,/ss\."companyId"=\$\{scopeCompanyId\}/);
  assert.match(endpoint,/ss\."status" IN \('PENDING_REVIEW','DISCREPANCY'\)/);
  assert.match(review,/supplier-settlements\/\$\{encodeURIComponent\(item\.id\)\}\/attachment/);
  assert.match(analytics,/supplier-settlements\/\$\{encodeURIComponent\(item\.id\)\}\/attachment/);
});
