import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source=fs.readFileSync(new URL("../../client/src/components/commerce/AiReaderPanel.jsx",import.meta.url),"utf8");

test("failed POS handoffs expose their safe stored reason without enabling retry",()=>{
  assert.match(source,/const handoff=job\.result\?\.posHandoff\|\|\{\},background=job\.result\?\.posBackground\|\|\{\},failed=job\.status==="POS_FAILED"\|\|background\.status==="FAILED"/);
  assert.match(source,/Η παραλαβή απέτυχε — δεν έγινε νέα πληρωμή ή κίνηση αποθήκης/);
  assert.match(source,/background\.error\|\|"Δεν δόθηκε αιτία από τον server/);
  assert.match(source,/disabled=\{job\.status==="CONFIRMED"\|\|failed\}/);
});
