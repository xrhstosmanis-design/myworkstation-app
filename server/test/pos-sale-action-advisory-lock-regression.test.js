import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";

const route=await readFile(new URL("../src/routes/pos-sale-actions.js",import.meta.url),"utf8");

test("POS sale actions materialize PostgreSQL advisory locks as decodable booleans",()=>{
  const safeLocks=route.match(/SELECT \(pg_advisory_xact_lock\(hashtext\(/g)||[];
  assert.equal(safeLocks.length,2);
  assert.doesNotMatch(route,/SELECT pg_advisory_xact_lock\(hashtext\(/);
  assert.match(route,/delay:/);
  assert.match(route,/reverse:/);
});
