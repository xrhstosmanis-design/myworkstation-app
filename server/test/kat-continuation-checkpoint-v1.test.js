import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const checkpoint=fs.readFileSync(new URL('../../KAT_CONTINUATION_CHECKPOINT.md',import.meta.url),'utf8');
const readme=fs.readFileSync(new URL('../../README.md',import.meta.url),'utf8');

test('KAT continuation checkpoint is discoverable and identifies the live revision',()=>{
  assert.match(readme,/KAT_CONTINUATION_CHECKPOINT\.md/);
  assert.match(checkpoint,/bd96070f64579f8b144dd18504513fe1e481a47e/);
  assert.match(checkpoint,/CI #842: \*\*SUCCESS\*\*/);
  assert.match(checkpoint,/Render deployment #581: \*\*SUCCESS\*\*/);
});

test('KAT continuation checkpoint prevents repeated work and defines one next step',()=>{
  assert.match(checkpoint,/## Μην επαναλάβεις/);
  assert.match(checkpoint,/## Ακριβές επόμενο βήμα/);
  assert.match(checkpoint,/ακύρωσης online\/delivery order/);
  assert.match(checkpoint,/ενημέρωσε το ίδιο checkpoint/);
});
