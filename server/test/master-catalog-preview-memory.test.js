import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("Master Catalog preview uses dedicated single-read route before import route",()=>{
  const preview=fs.readFileSync(new URL("../src/routes/master-catalog-preview.js",import.meta.url),"utf8");
  const index=fs.readFileSync(new URL("../src/index.js",import.meta.url),"utf8");
  assert.equal((preview.match(/XLSX\.read\(/g)||[]).length,1);
  assert.match(index,/masterCatalogPreviewRoutes/);
  assert.ok(index.indexOf('masterCatalogPreviewRoutes')<index.lastIndexOf('masterCatalogRoutes'));
  assert.match(index,/express\.json\(\{limit:"12mb"\}\)/);
});
