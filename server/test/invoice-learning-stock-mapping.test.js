import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {invoiceLearningStockMapping} from '../../client/src/lib/invoice-learning-stock-mapping.js';

const runtime = await readFile(new URL('../src/lib/invoice-supplier-profile-runtime.js', import.meta.url), 'utf8');
const context = vm.createContext({});
vm.runInContext(runtime.replace(/^import .*;\n/gm, '').replaceAll('export async function', 'async function') + '\nthis.convert=applySupplierStockConversion;', context);

test('learning retains grams and applies the saved rule once to a different invoice quantity', () => {
  const corrected = {invoiceUnit:'ΚΙΛΟ',stockUnit:'ΓΡ',unit:'ΓΡ',quantity:1000,invoiceQuantity:1,
    packageUnitPrice:13.5,unitPrice:.0135,netAmount:10.13,conversionFactor:1000,unitsPerPackage:1000,packageConversionApplied:true};
  const before = structuredClone(corrected);
  const stored = JSON.parse(JSON.stringify({verified:true,...invoiceLearningStockMapping(corrected)}));
  assert.equal(stored.stockUnit, 'ΓΡ');
  assert.deepEqual(stored.stockConversion, {from:'ΚΙΛΟ',to:'ΓΡ',factor:1000});
  assert.deepEqual(corrected, before);
  assert.equal(stored.quantity, undefined);
  assert.equal(stored.unitPrice, undefined);
  const nextInvoice = {quantity:12,unitPrice:36.2,netAmount:286.36};
  const once = context.convert(nextInvoice, {...stored,invoiceUnit:'ΚΙΛΟ'});
  const twice = context.convert(once, {...stored,invoiceUnit:'ΚΙΛΟ'});
  assert.equal(twice.quantity, 12);
  assert.equal(twice.stockUnit, 'ΓΡ');
  assert.equal(twice.supplierProfileEvidence.stockQuantity, 12000);
  assert.equal(twice.unitPrice, 36.2);
  assert.equal(twice.netAmount, 286.36);
});

test('explicit package-to-piece conversion remains available', () => {
  const mapping = invoiceLearningStockMapping({invoiceUnit:'ΠΑΚΕΤΟ',unit:'ΤΜΧ',unitsPerPackage:100,packageConversionApplied:true});
  assert.deepEqual(mapping, {stockUnit:'ΤΜΧ',stockConversion:{from:'ΠΑΚΕΤΟ',to:'ΤΜΧ',factor:100}});
});

test('catalogue pack metadata cannot invent a stock conversion', () => {
  assert.deepEqual(invoiceLearningStockMapping({invoiceUnit:'ΤΜΧ',unit:'PCS',unitsPerPackage:24}), {stockUnit:'PCS'});
  assert.deepEqual(invoiceLearningStockMapping({invoiceUnit:'KG',unit:'KG',unitsPerPackage:1}), {stockUnit:'KG'});
  assert.deepEqual(invoiceLearningStockMapping({}), {stockUnit:'PCS'});
});

test('invalid conversion factors are never published as stock rules', () => {
  for (const factor of [0, -1, NaN, Infinity]) {
    assert.deepEqual(invoiceLearningStockMapping({invoiceUnit:'KG',stockUnit:'GR',conversionFactor:factor,packageConversionApplied:true}), {stockUnit:'GR'});
  }
});

test('the confirmation handler uses the stock rule serializer', async () => {
  const client = await readFile(new URL('../../client/src/invoice-learning-lab-bootstrap.js', import.meta.url), 'utf8');
  const learn = client.slice(client.indexOf("$('#learn').onclick="));
  assert.match(learn, /\.\.\.invoiceLearningStockMapping\(x\)/);
  assert.doesNotMatch(learn, /stockUnit:'PCS'/);
});
