import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

test("Master Catalog schema is platform-level and additive",async()=>{
  const source=await fs.readFile(new URL("../src/master-catalog-bootstrap.js",import.meta.url),"utf8");
  for(const table of ["MasterProduct","MasterProductBarcode","MasterCatalogImport"]){
    assert.match(source,new RegExp(`CREATE TABLE IF NOT EXISTS \\\"${table}\\\"`));
  }
  assert.ok(!source.includes('DELETE FROM "Product"'));
  assert.ok(!source.includes('DROP TABLE "Product"'));
  assert.ok(!source.includes('TRUNCATE'));
  assert.match(source,/ALTER TABLE \"Product\" ADD COLUMN IF NOT EXISTS \"masterProductId\"/);
});

test("Master Catalog import is Super Admin only and two-stage",async()=>{
  const source=await fs.readFile(new URL("../src/routes/master-catalog.js",import.meta.url),"utf8");
  assert.match(source,/Platform Super Admin/);
  assert.match(source,/router\.post\("\/preview"/);
  assert.match(source,/router\.post\("\/import"/);
  assert.match(source,/alreadyImported/);
});

test("Master Catalog protects scan, zero prices and accepts valid zero VAT",async()=>{
  const source=await fs.readFile(new URL("../src/routes/master-catalog.js",import.meta.url),"utf8");
  assert.match(source,/scanEnabled:!product\.duplicateBarcode/);
  assert.match(source,/retail!==null&&retail>0\?retail:null/);
  assert.match(source,/vat!==null&&vat>=0\?vat:null/);
  assert.match(source,/vatVerified:Boolean\(vat!==null&&vat>=0\)/);
  assert.match(source,/zeroVatIsValid:true/);
  assert.match(source,/stockNotImportedIntoStores:true/);
});

test("Master Catalog skips generated Excel summary row",async()=>{
  const source=await fs.readFile(new URL("../src/routes/master-catalog.js",import.meta.url),"utf8");
  assert.match(source,/isSummaryRow/);
  assert.match(source,/if\(isSummaryRow\(row\)\)continue/);
});
