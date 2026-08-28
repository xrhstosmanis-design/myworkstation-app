import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const checkpoint=fs.readFileSync(new URL('../../KAT_CONTINUATION_CHECKPOINT.md',import.meta.url),'utf8');
const readme=fs.readFileSync(new URL('../../README.md',import.meta.url),'utf8');

test('KAT continuation checkpoint is discoverable and identifies the live revision',()=>{
  assert.match(readme,/KAT_CONTINUATION_CHECKPOINT\.md/);
  assert.match(checkpoint,/97d427bc86726b3e7f3e592b2b6ac86bc8c3ca85/);
  assert.match(checkpoint,/CI #846: \*\*SUCCESS\*\*/);
  assert.match(checkpoint,/Render deployment #583: \*\*SUCCESS\*\*/);
});

test('KAT continuation checkpoint prevents repeated work and defines one next step',()=>{
  assert.match(checkpoint,/## Μην επαναλάβεις/);
  assert.match(checkpoint,/## Ακριβές επόμενο βήμα/);
  assert.match(checkpoint,/δύο ταμείων\/terminals/);
  assert.match(checkpoint,/ενημέρωσε το ίδιο checkpoint/);
});
