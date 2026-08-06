import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

const tables=["AttendanceEvent","PayrollPeriod","PayrollEntry","AiReaderJob","DocumentInbox","ConnectorDevice","ConnectorEvent","FiscalDocument","RemoteSupportSession"];

test("extended module foundation contains all planned tables",async()=>{
  const source=await fs.readFile(new URL("../src/extended-modules-bootstrap.js",import.meta.url),"utf8");
  assert.equal(tables.length,9);
  for(const table of tables)assert.match(source,new RegExp(`CREATE TABLE IF NOT EXISTS \\\"${table}\\\"`));
});

test("commerce compatibility only removes the incorrect global barcode index",async()=>{
  const source=await fs.readFile(new URL("../src/commerce-compatibility.js",import.meta.url),"utf8");
  assert.match(source,/DROP INDEX IF EXISTS \"ProductBarcode_barcode_key\"/);
  assert.ok(!source.includes("DROP TABLE"));
  assert.ok(!source.includes("DELETE FROM"));
  assert.ok(!source.includes("TRUNCATE"));
});

test("startup runs extended schema after commercial schema",async()=>{
  const index=await fs.readFile(new URL("../src/index.js",import.meta.url),"utf8");
  assert.ok(index.indexOf("await ensureExtendedModulesSchema()")>index.indexOf("await ensureCommercialSchema()"));
  assert.ok(index.indexOf("await ensureCommerceCompatibility()")>index.indexOf("await ensureExtendedModulesSchema()"));
});
