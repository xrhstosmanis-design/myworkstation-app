import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";

const route=await readFile(new URL("../src/routes/store-preparation.js",import.meta.url),"utf8");
const modal=await readFile(new URL("../../client/src/components/store/StorePreparationModal.jsx",import.meta.url),"utf8");

test("store POS exposes the preparation endpoint used by the preparation modal",()=>{
 assert.match(modal,/\/api\/store-pos\/stores\/\$\{store\.id\}\/preparation/);
 assert.match(route,/router\.post\("\/stores\/:storeId\/preparation"/);
 assert.match(route,/StorePreparationBatch/);
 assert.match(route,/preparationEnabled/);
});

test("preparation batch keeps store and company scope and validates modifiers",()=>{
 assert.match(route,/assertStore\(req,req\.params\.storeId\)/);
 assert.match(route,/companyId"=\$\{req\.user\.companyId\}/);
 assert.match(route,/ManagementModifier/);
 assert.match(route,/synthetic-/);
 assert.match(route,/DOCTOR/);
 assert.match(route,/NURSE/);
 assert.match(route,/STAFF/);
});

test("sending to production does not silently mutate ingredient stock before checkout",()=>{
 const postStart=route.indexOf('router.post("/stores/:storeId/preparation"');
 const postBody=route.slice(postStart);
 assert.doesNotMatch(postBody,/UPDATE "StoreProduct" SET "currentStock"/);
 assert.doesNotMatch(postBody,/StockMovement/);
});
