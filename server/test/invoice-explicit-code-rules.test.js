import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {validateExplicitCodeRules,applyExplicitCodeRules,applyVerifiedCodeCorrections} from '../src/lib/invoice-explicit-code-rules.js';

const rules=()=>validateExplicitCodeRules([{observedCode:'L. S21005',canonicalCode:'ES21005',description:'MRS ROSE ESPRESSO DLCAF AKONOE 250GR'}]);

test('verified supplier code correction applies only to the same observed code and description',()=>{
  const profile=applyExplicitCodeRules({mappings:{DEL005:{stockUnit:'ΓΡ'}}},rules());
  const lines=[
    {supplierItemCode:'L. S21005',description:'MRS ROSE ESPRESSO DLCAF AKONOE 250GR',quantity:1},
    {supplierItemCode:'L. S21005',description:'A DIFFERENT REAL PRODUCT',quantity:2},
    {supplierItemCode:'DEL005',description:'Chocolate',quantity:1}
  ];
  const result=applyVerifiedCodeCorrections(lines,profile);
  assert.equal(result[0].supplierItemCode,'ES21005');
  assert.equal(result[0].observedSupplierItemCode,'L. S21005');
  assert.equal(result[1].supplierItemCode,'L. S21005');
  assert.equal(result[2].supplierItemCode,'DEL005');
  assert.equal(profile.mappings.DEL005.stockUnit,'ΓΡ');
});

test('invalid and duplicate code corrections are rejected',()=>{
  assert.throws(()=>validateExplicitCodeRules([]));
  assert.throws(()=>validateExplicitCodeRules([{observedCode:'A',canonicalCode:'',description:'X'}]));
  assert.throws(()=>validateExplicitCodeRules([{observedCode:'A',canonicalCode:'B',description:'X'},{observedCode:'A.',canonicalCode:'C',description:'Y'}]));
});

test('code correction is applied before canonical product mapping',async()=>{
  const source=await readFile(new URL('../src/lib/invoice-supplier-profile-runtime.js',import.meta.url),'utf8');
  assert.ok(source.indexOf('applyVerifiedCodeCorrections(productLines,profile)')<source.indexOf('applyMappings(productLines,profile)'));
});

test('explicit code endpoint is Super Admin gated and workspace sync preserves server corrections',async()=>{
  const source=await readFile(new URL('../src/routes/platform-invoice-learning-workspace.js',import.meta.url),'utf8');
  const gate=source.indexOf('router.use((req,res,next)=>{if(!isSuper(req))');
  assert.ok(gate>=0&&gate<source.indexOf('router.put("/invoice-learning/supplier-profile/code-rules"'));
  assert.match(source,/codeCorrections:\{\.\.\.\(p\.codeCorrections\|\|\{\}\),\.\.\.\(existing\?\.\[0\]\?\.profile\?\.codeCorrections\|\|\{\}\)\}/);
});

test('the correction editor saves a selected code rule without confirming the invoice',async()=>{
  const source=await readFile(new URL('../../client/src/invoice-learning-lab-bootstrap.js',import.meta.url),'utf8');
  assert.match(source,/data-save-code-rule/);
  assert.match(source,/supplier-profile\/code-rules/);
  assert.match(source,/line\.supplierItemCode=canonicalCode/);
  assert.doesNotMatch(source,/saveExplicitCodeRules[\s\S]{0,500}#learn/);
});
