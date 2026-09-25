import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {COFFEE_UNION_PROFILE} from '../src/lib/invoice-learning-coffee-union-seed.js';

const profileSource = await readFile(new URL('../src/lib/invoice-supplier-profile-runtime.js', import.meta.url), 'utf8');
const profileContext = vm.createContext({console, unitRelativeValues: () => null});
vm.runInContext(profileSource.replace(/^import .*;\n/gm, '').replaceAll('export async function', 'async function')
  + '\nthis.map=applyMappings;', profileContext);

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

test('existing Coffee profile conversion survives subsequent legacy knowledge without unitsPerPackage metadata', async () => {
  const runtime = evaluate([{supplierItemCode:'ES01000',stockUnit:'ΤΜΧ',invoiceUnit:'PACKAGE',unitsPerPackage:1000}]);
  const printed = {supplierItemCode:'ES01000',description:'Coffee',invoiceUnit:'ΚΙΛΟ',
    quantity:12,unitPrice:36.2,netAmount:286.36,grossAmount:323.59,discount1:34.08};
  const mapped = profileContext.map([printed], COFFEE_UNION_PROFILE)[0];
  assert.equal(mapped.quantity, 12);
  assert.equal(mapped.unitPrice, 36.2);
  const result = await runtime.apply({supplier:{},productLines:[mapped]});
  const row = result.productLines[0];
  assert.equal(row.invoiceUnit, 'ΚΙΛΟ');
  assert.equal(row.stockUnit, 'GR');
  assert.equal(row.quantity, 12000);
  assert.equal(row.unitPrice, .0362);
  assert.equal(row.netAmount, 286.36);
  assert.equal(row.discount1, 34.08);
  assert.equal(runtime.normalize(row).quantity, 12000);
});

test('unverified conversion and bare metadata do not gain confirmed conversion priority', () => {
  const printed = {supplierItemCode:'X',quantity:2,unitPrice:10,netAmount:20};
  for (const mapping of [{stockConversion:{factor:1000,to:'GR'}}, {unitsPerPackage:1000}]) {
    const row = profileContext.map([printed], {mappings:{X:mapping}})[0];
    assert.equal(row.confirmedPackMapping, undefined);
    assert.equal(row.packageConversionApplied, undefined);
    assert.equal(row.quantity, 2);
  }
});

test('an exact Super Admin line correction outranks a conflicting OCR piece unit', () => {
  const printed = {supplierItemCode:'FR1500',description:'CUP 12OZ',quantity:48,invoiceUnit:'ΤΜΧ',unit:'ΤΜΧ',
    unitsPerPackage:0,unitPrice:10,netAmount:480,grossAmount:542.40,sourceColumnsVerified:true};
  const explicit = profileContext.map([printed], {mappings:{FR1500:{supplierItemCode:'FR1500',invoiceUnit:'PACKAGE',
    stockUnit:'ΤΜΧ',unitsPerPackage:100,verified:true,source:'SUPER_ADMIN_LINE_CORRECTION'}}})[0];
  assert.equal(explicit.invoiceUnit, 'PACKAGE');
  assert.equal(explicit.unit, 'PACKAGE');
  assert.equal(explicit.unitsPerPackage, 100);
  assert.equal(explicit.confirmedPackMapping, true);

  const legacy = profileContext.map([printed], {mappings:{FR1500:{supplierItemCode:'FR1500',invoiceUnit:'PACKAGE',
    stockUnit:'ΤΜΧ',unitsPerPackage:100,verified:true}}})[0];
  assert.equal(legacy.invoiceUnit, 'ΤΜΧ');
  assert.equal(legacy.confirmedPackMapping, undefined);
});
