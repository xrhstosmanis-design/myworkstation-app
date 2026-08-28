import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const checkpoint=fs.readFileSync(new URL('../../KAT_CONTINUATION_CHECKPOINT.md',import.meta.url),'utf8');
const readme=fs.readFileSync(new URL('../../README.md',import.meta.url),'utf8');

test('KAT continuation checkpoint is discoverable and identifies the live revision',()=>{
  assert.match(readme,/KAT_CONTINUATION_CHECKPOINT\.md/);
  assert.match(checkpoint,/d595927f2712f959b2c51451c6cc5fed539e068a/);
  assert.match(checkpoint,/PR CI #859: \*\*SUCCESS\*\*/);
  assert.match(checkpoint,/Render deployment #585: \*\*SUCCESS\*\*/);
});

test('KAT continuation checkpoint prevents repeated work and defines one next step',()=>{
  assert.match(checkpoint,/## Μην επαναλάβεις/);
  assert.match(checkpoint,/## Ακριβές επόμενο βήμα/);
  assert.match(checkpoint,/tests 44–51/);
  assert.match(checkpoint,/ενημέρωσε το ίδιο checkpoint/);
});
