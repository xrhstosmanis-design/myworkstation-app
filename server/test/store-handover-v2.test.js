import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const bootstrap=await readFile(new URL("../src/commercial-bootstrap.js",import.meta.url),"utf8");
const route=await readFile(new URL("../src/routes/commerce-v1.js",import.meta.url),"utf8");
const app=await readFile(new URL("../../client/src/components/store/StoreOperatorApp.jsx",import.meta.url),"utf8");
const panel=await readFile(new URL("../../client/src/components/store/StoreHandoverPanel.jsx",import.meta.url),"utf8");

test("handover V2 schema is additive and keeps named acknowledgement",()=>{
  for(const column of ["fromName","acknowledgedById","acknowledgedByName","attachmentData","attachmentChecksum"]){
    assert.match(bootstrap,new RegExp(`ADD COLUMN IF NOT EXISTS "${column}"`));
  }
  assert.doesNotMatch(bootstrap,/DROP TABLE|TRUNCATE TABLE/);
});

test("handover V2 restricts store operators and records the receiver",()=>{
  assert.match(route,/req\.user\.tokenType==="STORE_OPERATOR"&&req\.user\.storeId!==body\.storeId/);
  assert.match(route,/"acknowledgedByName"=\$\{req\.user\.fullName/);
  assert.match(route,/"status"='OPEN'/);
  assert.match(route,/image\\\/\(\?:jpeg\|png\|webp\)/);
});

test("Store App contains handover creation, attachment and acknowledgement",()=>{
  assert.match(app,/StoreHandoverPanel/);
  assert.match(panel,/Παράδοση στην επόμενη βάρδια/);
  assert.match(panel,/Επιβεβαίωση παραλαβής/);
  assert.match(panel,/capture="environment"/);
  assert.match(panel,/acknowledgedByName/);
});
