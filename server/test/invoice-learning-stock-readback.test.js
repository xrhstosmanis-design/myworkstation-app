import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../src/routes/platform-invoice-learning-ai.js', import.meta.url), 'utf8');
const normalizer = source.slice(source.indexOf('function normalizeRetailPackaging('), source.indexOf('\nfunction rowTail('));
const knowledge = source.slice(source.indexOf('function learnedScore('), source.indexOf('\nconst lineProperties='));
const evaluate = (records = []) => {
  const context = vm.createContext({
    console,
    money4: value => Math.round((Number(value) + Number.EPSILON) * 10000) / 10000,
    isCaseUnit: unit => /PACKAGE|ΠΑΚΕΤΟ/.test(unit),
    packageFromText: () => 0,
    applyDiscounts: (price, discounts) => discounts.reduce((value, d) => value * (1 - d / 100), price),
    norm: value => String(value || '').toUpperCase().replace(/\W/g, ''),
    knowledgeForSupplier: async () => records,
  });
  vm.runInContext(normalizer + knowledge + '\nthis.normalize=normalizeRetailPackaging;this.apply=applyLearnedKnowledge;', context);
  return context;
};

test('readback keeps an explicit gram rule and converts the current quantity only once', () => {
  const runtime = evaluate();
  const original = {invoiceQuantity:12,quantity:12,invoiceUnit:'ΚΙΛΟ',stockUnit:'ΓΡ',unitsPerPackage:1000,
    packageUnitPrice:36.2,unitPrice:36.2,netAmount:286.36,grossAmount:323.59,discount1:34.08,confirmedPackMapping:true};
  const first = runtime.normalize(original), second = runtime.normalize(first);
  assert.equal(second.unit, 'ΓΡ');
  assert.equal(second.stockUnit, 'ΓΡ');
  assert.equal(second.invoiceQuantity, 12);
  assert.equal(second.quantity, 12000);
  assert.equal(second.unitPrice, .0362);
  assert.equal(second.netAmount, 286.36);
  assert.equal(second.grossAmount, 323.59);
  assert.equal(second.discount1, 34.08);
  assert.equal(original.quantity, 12);
});

test('piece packaging defaults and explicit piece units are preserved', () => {
  for (const stockUnit of [undefined, 'PCS', 'ΤΜΧ']) {
    const line = evaluate().normalize({invoiceUnit:'PACKAGE',stockUnit,quantity:5,unitsPerPackage:100,unitPrice:5.3,netAmount:22.53});
    assert.equal(line.quantity, 500);
    assert.equal(line.unitPrice, .053);
    assert.equal(line.netAmount, 22.53);
    assert.equal(line.stockUnit, stockUnit || 'PCS');
  }
});

test('older knowledge cannot overwrite the explicit supplier gram rule', async () => {
  const runtime = evaluate([{supplierItemCode:'DEL005',stockUnit:'PCS',invoiceUnit:'PACKAGE',unitsPerPackage:12}]);
  const result = await runtime.apply({supplier:{},productLines:[{supplierItemCode:'DEL005',description:'Chocolate',
    confirmedPackMapping:true,invoiceUnit:'ΚΙΛΟ',stockUnit:'GR',invoiceQuantity:1,quantity:1,
    unitsPerPackage:1000,unitPrice:13.5,packageUnitPrice:13.5,netAmount:10.13}]});
  assert.equal(result.productLines[0].stockUnit, 'GR');
  assert.equal(result.productLines[0].quantity, 1000);
  assert.equal(result.productLines[0].invoiceUnit, 'ΚΙΛΟ');
});
