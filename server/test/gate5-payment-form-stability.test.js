import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

test("operator API identity stays stable while a supplier payment form is edited",async()=>{
  const source=await readFile(new URL("../../client/src/components/store/StoreOperatorApp.jsx",import.meta.url),"utf8");
  assert.match(source,/import React,\{[^}]*useCallback/);
  assert.match(source,/const api=useCallback\(async\(path,options=\{\}\)=>/);
});
