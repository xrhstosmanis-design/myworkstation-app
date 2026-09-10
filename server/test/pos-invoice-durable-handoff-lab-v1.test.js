import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";

const route=await readFile(new URL("../src/routes/commerce-pos-v244.js",import.meta.url),"utf8");
const client=await readFile(new URL("../../client/src/components/store/StoreSupplierInvoicePremiumFast.jsx",import.meta.url),"utf8");

test("POS persists every invoice page before starting full recognition",()=>{
  assert.match(route,/router\.post\("\/ai-reader\/fast-handoff"/);
  assert.match(route,/INSERT INTO "DocumentAttachment"/);
  assert.match(route,/POS_QUEUED/);
  assert.match(route,/posHandoff:handoff/);
  const handoff=client.indexOf('/api/commerce/ai-reader/fast-handoff');
  const background=client.indexOf('backgroundV244({api,store,pages',handoff);
  assert.ok(handoff>=0&&background>handoff,"durable handoff must finish before full background OCR starts");
});

test("handoff distinguishes existing myDATA and not-yet-arrived documents",()=>{
  assert.match(route,/FROM "MyDataInboundDocument" m/);
  assert.match(route,/ABS\(COALESCE\(m\."totalGross",0\)-\$\{totalGross\}\)<=0\.05/);
  assert.match(route,/myDataMatched:Boolean\(myData\)/);
  assert.match(route,/συνδέθηκε με το υπάρχον myDATA/);
  assert.match(route,/Θα συνδεθεί αυτόματα όταν εμφανιστεί στο myDATA/);
});

test("LAB handoff records paid or credit intent without posting stock",()=>{
  assert.match(route,/settlementMode=req\.body\?\.settlementMode==="PAID"\?"PAID":"CREDIT"/);
  assert.match(route,/paymentTransactionId/);
  assert.doesNotMatch(route,/fast-handoff[\s\S]*INSERT INTO "StockMovement"/);
});

