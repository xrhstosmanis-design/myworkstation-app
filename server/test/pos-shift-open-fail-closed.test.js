import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source=fs.readFileSync(new URL("../../client/src/components/store/StoreOperatorApp.jsx",import.meta.url),"utf8");
test("operator POS fails closed until shift overview proves an open shift",()=>{
  assert.match(source,/shiftLoading\|\|shiftState===null\|\|runtimeAccess===null/);
  assert.match(source,/Το POS πωλήσεων ανοίγει μόνο αφού επιβεβαιωθεί ενεργή βάρδια/);
  const posRender=source.indexOf("<StorePosPanel ");
  assert.ok(posRender>0);
  assert.ok(source.indexOf("shiftState===null")<posRender);
  assert.match(source,/shiftState&&!shiftState\.openSession/);
  assert.match(source,/Συρτάρι/);assert.match(source,/Φύλαξη/);assert.match(source,/Κέρματα/);assert.match(source,/Χρηματοκιβώτιο/);
});
