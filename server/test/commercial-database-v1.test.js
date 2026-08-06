import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

const requiredTables=[
  "ProductCategory","Product","ProductBarcode","StoreProduct","Supplier",
  "PurchaseDocument","PurchaseDocumentLine","StockMovement","Recipe","RecipeItem",
  "Customer","Sale","SaleLine","Payment","CustomerLedger","Expense",
  "ShiftHandover","DocumentAttachment"
];

test("Commercial Database V1 defines the expected 18 commerce tables",()=>{
  assert.equal(requiredTables.length,18);
  assert.equal(new Set(requiredTables).size,18);
});

test("Commercial Database V1 contains all required commerce tables",async()=>{
  const source=await fs.readFile(new URL("../src/commercial-bootstrap.js",import.meta.url),"utf8");
  for(const table of requiredTables){
    assert.match(source,new RegExp(`CREATE TABLE IF NOT EXISTS \\\"${table}\\\"`),`Missing table ${table}`);
  }
});

test("Commercial Database V1 bootstrap is additive and non destructive",async()=>{
  const source=(await fs.readFile(new URL("../src/commercial-bootstrap.js",import.meta.url),"utf8")).toUpperCase();
  assert.ok(!source.includes("DROP TABLE"));
  assert.ok(!source.includes("DROP COLUMN"));
  assert.ok(!source.includes("TRUNCATE"));
  assert.ok(!source.includes("DELETE FROM"));
  assert.ok(!source.includes("UPDATE \"COMPANY\""));
  assert.ok(!source.includes("UPDATE \"STORE\""));
  assert.ok(!source.includes("UPDATE \"EMPLOYEE\""));
});

test("server startup runs commercial bootstrap after existing platform schema",async()=>{
  const index=await fs.readFile(new URL("../src/index.js",import.meta.url),"utf8");
  const platform=index.indexOf("await ensurePlatformSchema()");
  const commercial=index.indexOf("await ensureCommercialSchema()");
  assert.ok(platform>=0);
  assert.ok(commercial>platform);
});
