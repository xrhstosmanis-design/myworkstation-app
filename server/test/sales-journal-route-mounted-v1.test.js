import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";

const index=await readFile(new URL("../src/index.js",import.meta.url),"utf8");
const route=await readFile(new URL("../src/routes/store-pos-sale-display.js",import.meta.url),"utf8");

test("sales journal is exposed through the mounted store-pos sale display router",()=>{
  assert.match(index,/app\.use\("\/api\/store-pos",auth,requireCompanyModule\("STORE_MODE"\),storePosSaleDisplayRoutes\)/);
  assert.match(route,/router\.get\("\/sales\/journal"/);
});
