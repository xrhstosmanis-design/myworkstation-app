import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";

const bootstrap=await readFile(new URL("../src/kat-preparation-bootstrap.js",import.meta.url),"utf8");
const cleanup=await readFile(new URL("../src/kat-preparation-cleanup.js",import.meta.url),"utf8");

const catalogCodes=[...bootstrap.matchAll(/\["(?:COFFEE|CHOCOLATE|TEA)","([^"]+)","([^"]+)","(HOT|COLD)",([0-9.]+)\]/g)]
  .map(([,code,name,temp,price])=>({code,name,temp,price:Number(price)}));
const canonicalSkus=new Set([...cleanup.matchAll(/"(MWS-KAT-BEV-[A-Z0-9-]+)"/g)].map(([,sku])=>sku));
const canonicalNames=new Set([...cleanup.matchAll(/"([^"]+)"/g)].map(([,value])=>value));

test("every KAT beverage seed entry has a unique code and valid sale price",()=>{
  assert.ok(catalogCodes.length>=50,"expected the complete KAT beverage catalog");
  assert.equal(new Set(catalogCodes.map(x=>x.code)).size,catalogCodes.length,"duplicate beverage code in bootstrap catalog");
  for(const item of catalogCodes){
    assert.ok(item.price>0,`${item.name} must have a positive sale price`);
    assert.ok(item.temp==="HOT"||item.temp==="COLD",`${item.name} must be HOT or COLD`);
  }
});

test("bootstrap beverage catalog and cleanup canonical SKU set stay in parity",()=>{
  for(const item of catalogCodes){
    const sku=`MWS-KAT-BEV-${item.code}`;
    assert.ok(canonicalSkus.has(sku),`${sku} is seeded but not protected by cleanup`);
    assert.ok(canonicalNames.has(item.name),`${item.name} is seeded but not protected by cleanup name matching`);
  }
});

test("cleanup does not contain orphan canonical beverage SKUs",()=>{
  const seeded=new Set(catalogCodes.map(item=>`MWS-KAT-BEV-${item.code}`));
  for(const sku of canonicalSkus)assert.ok(seeded.has(sku),`${sku} is protected by cleanup but missing from bootstrap catalog`);
});
