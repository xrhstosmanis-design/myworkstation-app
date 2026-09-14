import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const route=await readFile(new URL("../src/routes/commerce-pos-v244.js",import.meta.url),"utf8");
const orders=await readFile(new URL("../../client/src/components/commerce/installPurchaseOrdersSuite.js",import.meta.url),"utf8");
const reader=await readFile(new URL("../src/routes/commerce-pos-ai-recheck.js",import.meta.url),"utf8");

test("BackOffice refresh reclaims only durable, stale POS handoffs without a payment write",()=>{
  assert.match(route,/router\.post\("\/ai-reader\/fast-recover"/);
  assert.match(route,/"status" IN \('POS_QUEUED','POS_DRAFT_READY'\) OR \("status"='POS_PROCESSING' AND "updatedAt"<\$\{staleBefore\}\)/);
  assert.match(route,/scheduleFastBackground\(\{authorization:req\.get\("authorization"\)/);
  assert.doesNotMatch(route.slice(route.indexOf('router.post("/ai-reader/fast-recover"'),route.indexOf('router.get("/ai-reader/fast-status')),/StoreTransaction"/);
});

test("orders refresh starts durable handoff recovery without blocking the report",()=>{
  const start=orders.indexOf("async function loadReport");
  const body=orders.slice(start,orders.indexOf("async function loadStock",start));
  assert.match(body,/\/api\/commerce\/ai-reader\/fast-recover/);
  assert.ok(body.indexOf("fast-recover")>body.indexOf("/api/purchase-orders/report"));
});

test("AI recheck applies verified printed column recovery before reconciliation",()=>{
  assert.match(reader,/recoverPrintedRetailColumns/);
  assert.match(reader,/parsed\.productLines=parsed\.productLines\.map\(line=>recoverPrintedRetailColumns\(line,printedDocumentText\)\)/);
  assert.ok(reader.indexOf("recoverPrintedRetailColumns(line,printedDocumentText)")<reader.indexOf("const initialLinesTotal"));
});
