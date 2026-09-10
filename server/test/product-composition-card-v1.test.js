import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {spawnSync} from "node:child_process";

const routePath=new URL("../src/routes/owner-product-compositions.js",import.meta.url);
const indexPath=new URL("../src/index.js",import.meta.url);
const catalogPath=new URL("../src/routes/store-pos-catalog.js",import.meta.url);
const panelPath=new URL("../../client/src/components/commerce/InventoryArchivePanel.jsx",import.meta.url);
const posPath=new URL("../../client/src/components/store/StorePosPanel.jsx",import.meta.url);
const route=fs.readFileSync(routePath,"utf8"),index=fs.readFileSync(indexPath,"utf8"),catalog=fs.readFileSync(catalogPath,"utf8"),panel=fs.readFileSync(panelPath,"utf8"),pos=fs.readFileSync(posPath,"utf8");

test("composition route parses and is mounted before generic owner product routes",()=>{
  const result=spawnSync(process.execPath,["--check",routePath.pathname],{encoding:"utf8"});assert.equal(result.status,0,result.stderr||result.stdout);
  const compositionMount=index.indexOf('requireOwnerProductAccess,ownerProductCompositionRoutes)');
  const actionMount=index.indexOf('requireOwnerProductAccess,ownerProductActionRoutes)');
  assert.ok(compositionMount>0&&actionMount>compositionMount);
});
test("SET associations are tenant scoped, editable and audited",()=>{
  for(const marker of ["ProductSetItem","/:productId/set-items","SET_ITEM_SAVED","SET_ITEM_DELETED","PRODUCT_COMPOSITION_UPDATED"])assert.ok(route.includes(marker),marker);
  assert.match(route,/companyId.*req\.user\.companyId/);
});

test("recipe card reuses the KAT PreparationRecipeLine source of truth",()=>{
  assert.match(route,/PreparationRecipeLine/);
  assert.match(route,/RECIPE_ITEM_SAVED/);
  assert.doesNotMatch(route,/CREATE TABLE IF NOT EXISTS "ProductRecipe/);
});

test("checking SET or recipe opens its functional association tab",()=>{
  assert.match(panel,/toggleComposition\(key,e\.target\.checked\)/);
  for(const text of ["Συσχετιζόμενο είδος","Υλικό συνταγής","Ποσότητα συμμετοχής","Νέα συσχέτιση","Χειριστής"])assert.ok(panel.includes(text),text);
});

test("POS catalog exposes SET rows and cart adds them automatically",()=>{
  assert.match(catalog,/AS "setItems"/);
  assert.match(catalog,/p\."isSet"/);
  assert.match(pos,/product\.isSet\?\(product\.setItems\|\|\[\]\):\[\]/);
  assert.match(pos,/setParentId:product\.id/);
});
