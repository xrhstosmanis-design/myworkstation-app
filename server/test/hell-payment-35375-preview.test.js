import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../scripts/preview-hell-payment-35375.mjs',import.meta.url),'utf8');
test('incident preview is read-only, scoped and has no apply mode',()=>{
 assert.match(source,/SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY/);
 assert.match(source,/writeAllowed:false/);
 assert.match(source,/process\.argv\.length!==2/);
 assert.doesNotMatch(source,/\b(?:INSERT INTO|UPDATE "|DELETE FROM)\b/);
});
test('missing tax ID prevents identity verification',()=>{
 assert.match(source,/supplierIdentityVerified:!!r\.paymentTaxId&&String\(r\.paymentTaxId\)===String\(r\.documentTaxId\)/);
 assert.match(source,/Object\.values\(result\.checks\)\.some\(v=>!v\)/);
});
