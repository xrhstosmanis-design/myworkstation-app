import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const schema=await readFile(new URL("../src/kat-online-ordering-bootstrap.js",import.meta.url),"utf8");
const routes=await readFile(new URL("../src/routes/kat-online-ordering-modifiers.js",import.meta.url),"utf8");
const index=await readFile(new URL("../src/index.js",import.meta.url),"utf8");
const storefront=await readFile(new URL("../../client/public/kat/app.html",import.meta.url),"utf8");

test("online stores have unique public slugs and optional custom domains",()=>{
  assert.match(schema,/"publicSlug" TEXT/);
  assert.match(schema,/"customDomain" TEXT/);
  assert.match(schema,/OnlineOrderingConfig_public_slug_key/);
  assert.match(schema,/LOWER\("publicSlug"\)/);
  assert.match(schema,/OnlineOrderingConfig_custom_domain_key/);
});

test("a public slug resolves exactly one active configured store",()=>{
  assert.match(routes,/context\(publicSlug=null\)/);
  assert.match(routes,/LOWER\(oc\."publicSlug"\)=LOWER\(\$\{publicSlug\}\)/);
  assert.match(routes,/\["\/catalog-modifiers","\/:publicSlug\/catalog-modifiers"\]/);
  assert.match(routes,/\["\/orders-with-modifiers","\/:publicSlug\/orders-with-modifiers"\]/);
});

test("generic public URL keeps the existing KAT storefront compatible",()=>{
  assert.match(index,/app\.use\("\/api\/public\/kat",katOnlineOrderingModifierRoutes\)/);
  assert.match(index,/app\.use\("\/api\/public\/online",katOnlineOrderingModifierRoutes\)/);
  assert.match(index,/app\.get\("\/online\/:publicSlug"/);
  assert.match(storefront,/const publicSlug=location\.pathname\.match/);
  assert.match(storefront,/\/api\/public\/online\/\$\{encodeURIComponent\(publicSlug\)\}/);
  assert.match(storefront,/data\.store\?\.name/);
});

test("each store keeps its own POS and BackOffice online context",async()=>{
  const core=await readFile(new URL("../src/routes/kat-online-ordering.js",import.meta.url),"utf8");
  assert.match(core,/onlineContextById\(req\.user\.companyId,req\.params\.storeId\)/);
  assert.match(core,/printPayload\(rows\[0\],config,store\)/);
  assert.match(routes,/JOIN "OnlineOrderingConfig" oc ON oc\."storeId"=s\."id"/);
  assert.match(routes,/const prefix=.*\?"KAT":"ONL"/);
});
