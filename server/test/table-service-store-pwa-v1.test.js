import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {storeHtmlWithManifest,storeManifest,validPwaStoreId} from "../src/store-pwa.js";

const storeId="cmtpopbgo000trhb5ng9ytiru";

test("Store Mode installation returns to its own store",()=>{
  assert.equal(validPwaStoreId(storeId),true);
  assert.equal(validPwaStoreId("../platform-admin"),false);
  const manifest=storeManifest(storeId);
  assert.equal(manifest.id,`/store/${storeId}`);
  assert.equal(manifest.start_url,`/store/${storeId}`);
  assert.equal(manifest.display,"standalone");
  assert.equal(storeHtmlWithManifest('<link rel="manifest" href="/manifest.webmanifest">',storeId),`<link rel="manifest" href="/store/${storeId}/manifest.webmanifest">`);
});

test("the store manifest routes precede the SPA fallback",async()=>{
  const source=await readFile(new URL("../src/index.js",import.meta.url),"utf8");
  assert.ok(source.indexOf('app.get("/store/:storeId/manifest.webmanifest"')<source.indexOf('app.get("*"'));
  assert.ok(source.indexOf('app.get("/store/:storeId",')<source.indexOf('app.get("*"'));
  const waiter=await readFile(new URL("../../client/src/components/store/StoreMobileWaiter.jsx",import.meta.url),"utf8");
  assert.match(waiter,/if\(!navigator\.onLine\)/);
  assert.match(waiter,/Δεν αποθηκεύτηκε offline/);
});
