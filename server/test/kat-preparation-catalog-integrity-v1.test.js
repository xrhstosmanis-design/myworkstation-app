import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";

const bootstrap=await readFile(new URL("../src/kat-preparation-bootstrap.js",import.meta.url),"utf8");
const cleanup=await readFile(new URL("../src/kat-preparation-cleanup.js",import.meta.url),"utf8");

const protectedHotDrinks=[
  ["MWS-KAT-BEV-RISTRETTO","RISTRETTO"],
  ["MWS-KAT-BEV-LATTE-HOT","CAFFE LATTE"],
  ["MWS-KAT-BEV-DECAF-ESP","ESPRESSO DECAF"],
  ["MWS-KAT-BEV-DECAF-CAP","CAPPUCCINO DECAF"],
  ["MWS-KAT-BEV-DECAF-LATTE","LATTE DECAF"]
];

test("KAT keeps the approved hot beverages as canonical preparation products",()=>{
  for(const [sku,name] of protectedHotDrinks){
    assert.ok(bootstrap.includes(sku.replace("MWS-KAT-BEV-","")),`${name} is missing from KAT preparation catalog`);
    assert.ok(bootstrap.includes(`\"${name}\",\"HOT\"`),`${name} must remain a HOT beverage`);
    assert.ok(cleanup.includes(`\"${sku}\"`),`${sku} must be protected by cleanup`);
    assert.ok(cleanup.includes(`\"${name}\"`),`${name} must be protected by cleanup name matching`);
  }
});

test("KAT cleanup preserves canonical beverages and removes known Freddo legacy duplicates",()=>{
  assert.match(cleanup,/if\(CANONICAL_SKUS\.has\(sku\)\|\|sku\.startsWith\("MWS-PREP-"\)\)return false/);
  for(const legacySku of ["033390","00598","018220","00597","100093","02522"]){
    assert.ok(cleanup.includes(`\"${legacySku}\"`),`legacy SKU ${legacySku} must remain blocked`);
  }
  for(const legacyName of ["FREDDO CAP 4ΑΠΛΟΣ","FREDDO CAP 4ΠΛΟΣ","FREDDO ESPRESO 4ΠΛΟ","FREDDO ESPRESSO 4ΠΛΟ","FREDDO ESPRESSO MACCHIATO","FREDDO CAPPUCCINO 4ΑΠΛΟΣ"]){
    assert.ok(cleanup.includes(`\"${legacyName}\"`),`legacy alias ${legacyName} must remain blocked`);
  }
});

test("KAT beverage seed uses one canonical MWS-KAT-BEV SKU namespace",()=>{
  assert.match(bootstrap,/const sku=`MWS-KAT-BEV-\$\{code\}`/);
  assert.match(bootstrap,/\["COFFEE","RISTRETTO","RISTRETTO","HOT"/);
  assert.match(bootstrap,/\["COFFEE","LATTE-HOT","CAFFE LATTE","HOT"/);
  assert.match(bootstrap,/\["COFFEE","DECAF-ESP","ESPRESSO DECAF","HOT"/);
  assert.match(bootstrap,/\["COFFEE","DECAF-CAP","CAPPUCCINO DECAF","HOT"/);
  assert.match(bootstrap,/\["COFFEE","DECAF-LATTE","LATTE DECAF","HOT"/);
});
