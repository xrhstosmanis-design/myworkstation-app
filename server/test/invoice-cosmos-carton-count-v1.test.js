import test from 'node:test';
import assert from 'node:assert/strict';
import {stockConversionFromDescription} from '../src/lib/invoice-column-reading.js';
import {stockMultiplierForPersistedInvoiceLine} from '../src/routes/commerce-pos-v244-core.js';
import {assessInvoiceLineForReview} from '../src/lib/invoice-line-review.js';

test('printed COSMOS carton counts convert invoice cartons to stock pieces without changing invoice economics',()=>{
  const cases=[
    ['COCA COLA 500ML (24PACK)',.5,24,12],
    ['SPRITE 1,5LT (1X6PACK)',1,6,6],
    ['ΝΕΡΟ ΖΑΓΟΡΙ 500ML (1X24P)',4,24,96],
    ['AMITA MOTION 1LT (12T)',.25,12,3],
  ];
  for(const [description,quantity,pack,expected] of cases){
    const line={description,quantity,unit:'ΚΙΒ',unitCost:10,netAmount:quantity*10};
    const multiplier=stockMultiplierForPersistedInvoiceLine(line);
    assert.equal(multiplier,pack||1,description);
    assert.equal(quantity*multiplier,expected,description);
    assert.equal(line.netAmount,quantity*line.unitCost,'conversion must leave invoice money alone');
  }
  assert.equal(stockMultiplierForPersistedInvoiceLine({description:'SPRITE 1,5LT (1X6PACK)',quantity:6,unit:'ΤΜΧ',stockUnitsPerInvoiceUnit:6}),1);
  assert.equal(stockConversionFromDescription('SPRITE 1,5LT (1X6PACK)',12,'ΚΙΒ').multiplier,12,'confirmed mapping takes precedence');
});

test('PEGASOS one display of fifty cards holds fifty stock pieces while ordinary piece rows stay unchanged',()=>{
  assert.equal(stockMultiplierForPersistedInvoiceLine({description:'Fifa 365 2027 Adren. Κάρτες Disp. 50τυ Panin',quantity:1,unit:'ΤΕΜ',unitCost:43.7,netAmount:41.51}),50);
  assert.equal(stockMultiplierForPersistedInvoiceLine({description:'Fifa 365 2027 Adren. Κάρτες Disp. 50τυ Panin',quantity:50,unit:'ΤΕΜ'}),1);
  assert.equal(stockMultiplierForPersistedInvoiceLine({description:'Κάρτες 50τυ',quantity:1,unit:'ΤΕΜ'}),1);
});

test('conflicting learned carton size is visible for review',()=>{
  const line={description:'SPRITE 1,5LT (1X6PACK)',rawText:'001 SPRITE 1,5LT (1X6PACK) ΚΙΒ 1 10,00',code:'001',quantity:1,unitCost:10,unit:'ΚΙΒ',stockUnitsPerInvoiceUnit:12};
  assert.match(assessInvoiceLineForReview(line,{matched:true}).reasons.join(' '),/τεμάχια συσκευασίας/);
  assert.doesNotMatch(assessInvoiceLineForReview({...line,stockUnitsPerInvoiceUnit:6},{matched:true}).reasons.join(' '),/τεμάχια συσκευασίας/);
});
