import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const route=fs.readFileSync(new URL("../src/routes/provider-logistics.js",import.meta.url),"utf8");
const pos=fs.readFileSync(new URL("../../client/src/components/store/StorePosPanel.jsx",import.meta.url),"utf8");

test("POS operator can finalize only a dispatch note from the same store",()=>{
  assert.match(route,/store-pos\/supplier-return-drafts\/:noteId\/finalize/);
  assert.match(route,/const store=await posStore\(req,note\.storeId\)/);
  assert.match(route,/Δεν επιτρέπεται οριστικοποίηση δελτίου άλλου καταστήματος/);
});

test("POS finalization is idempotent and queues myDATA without premature stock mutation",()=>{
  assert.match(route,/dispatch-note:\$\{note\.id\}:issue-v1/);
  assert.match(route,/ON CONFLICT \("idempotencyKey"\) DO NOTHING/);
  assert.match(route,/BLOCKED_PROVIDER_NOT_CONNECTED/);
  assert.match(route,/stockChanged:false/);
  assert.doesNotMatch(route,/supplier-return-drafts\/:noteId\/finalize[\s\S]{0,5000}StockMovement/);
});

test("POS exposes draft and finalization actions with an honest provider warning",()=>{
  assert.match(pos,/Αποθήκευση πρόχειρου/);
  assert.match(pos,/Οριστικοποίηση δελτίου/);
  assert.match(pos,/δεν εμφανίζεται MARK και δεν αφαιρείται stock/);
});

test("dispatch number is generated automatically and overwritten by the server",()=>{
  assert.match(route,/documentNumber:`ΔΑ-ΕΠ-/);
  assert.match(route,/crypto\.randomUUID\(\)\.slice\(0,8\)/);
  assert.match(pos,/documentNumber:automaticDispatchNumber\(\)/);
});
