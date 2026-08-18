import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";

const defaults=await readFile(new URL("../src/kat-preparation-defaults.js",import.meta.url),"utf8");
const bootstrap=await readFile(new URL("../src/kat-preparation-bootstrap.js",import.meta.url),"utf8");

test("KAT ingredient master keeps stock units consistent",()=>{
  for(const sku of ["COFFEE-BEANS","DECAF","INSTANT-COFFEE","GREEK-COFFEE","FILTER-COFFEE","SUGAR-WHITE","SUGAR-BROWN","ICE","CINNAMON","CHOC-MIX","WHITE-CHOC-MIX","COCOA","WHIP"]){
    assert.match(bootstrap,new RegExp(`MWS-PREP-${sku}\\\",\\\"[^\\\"]+\\\",\\\"GR\\\"`),`${sku} must be stocked in GR`);
  }
  for(const sku of ["WATER","MILK","MILK-EVAP","MILK-LF","MILK-ALMOND","MILK-OAT","MILK-SOY","SYRUP-CHOC","SYRUP-CARAMEL","SYRUP-VANILLA","SYRUP-HAZELNUT"]){
    assert.match(bootstrap,new RegExp(`MWS-PREP-${sku}\\\",\\\"[^\\\"]+\\\",\\\"ML\\\"`),`${sku} must be stocked in ML`);
  }
  for(const sku of ["SWEETENER","CUP-SMALL","CUP-LARGE","LID-SMALL","LID-LARGE","STRAW"]){
    assert.match(bootstrap,new RegExp(`MWS-PREP-${sku}\\\",\\\"[^\\\"]+\\\",\\\"PCS\\\"`),`${sku} must be stocked in PCS`);
  }
});

test("core espresso doses and takeaway packaging stay deterministic",()=>{
  assert.match(defaults,/ESPRESSO ΔΙΠΛ[\s\S]*?\[\[bean,18,"GR"\]\]/);
  assert.match(defaults,/ESPRESSO ΜΟΝ\|ESPRESSO DECAF\|RISTRETTO[\s\S]*?\[\[bean,9,"GR"\]\]/);
  assert.match(defaults,/withColdPack=rows=>\[\.\.\.rows,\[ingredientSku\.ice,100,"GR"\],\[ingredientSku\.cupL,1,"PCS"\],\[ingredientSku\.lidL,1,"PCS"\],\[ingredientSku\.straw,1,"PCS"\]\]/);
  assert.match(defaults,/withHotPack=\(rows,small=false\)=>\[\.\.\.rows,\[small\?ingredientSku\.cupS:ingredientSku\.cupL,1,"PCS"\],\[small\?ingredientSku\.lidS:ingredientSku\.lidL,1,"PCS"\]\]/);
});

test("sugar modifier consumption remains in grams and sweeteners in pieces",()=>{
  assert.match(defaults,/set\("ΖΑΧΑΡΗ","ΜΕΤΡΙΟΣ",ingredientSku\.sugar,8,"GR"\)/);
  assert.match(defaults,/set\("ΖΑΧΑΡΗ","ΓΛΥΚΟΣ",ingredientSku\.sugar,16,"GR"\)/);
  assert.match(defaults,/set\("ΖΑΧΑΡΗ","ΚΑΣΤΑΝΗ ΖΑΧΑΡΗ",ingredientSku\.brown,8,"GR"\)/);
  assert.match(defaults,/set\("ΖΑΧΑΡΗ","ΣΤΕΒΙΑ",ingredientSku\.sweetener,1,"PCS"\)/);
  assert.match(defaults,/set\("ΖΑΧΑΡΗ","ΖΑΧΑΡΙΝΗ",ingredientSku\.sweetener,1,"PCS"\)/);
});

test("frappe with milk has a distinct milk recipe",()=>{
  assert.match(defaults,/ΦΡΑΠΕ ΜΕ ΓΑΛΑ[\s\S]*?instant,2,"GR"[\s\S]*?water,150,"ML"[\s\S]*?milkEvap,30,"ML"/);
});
