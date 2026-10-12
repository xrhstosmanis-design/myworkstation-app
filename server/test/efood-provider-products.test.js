import assert from 'node:assert/strict';
import test from 'node:test';
import {normalizeEfoodWebhook} from '../src/integrations/efood/foundation.js';

const payload=items=>({order_id:'provider-products',status:'READY_FOR_PICKUP',client:{store_id:'9344842',external_partner_config_id:''},items});

test('provider product references retain SKU, barcode strings and actual nested quantities',()=>{
  const items=[{_id:'provider-internal-id',sku:'SLL45E',name:'Mustard',barcode:['05201050130791','000123','05201050130791'],pricing:{pricing_type:'UNIT',quantity:3,unit_price:1.5,total_price:0}},{sku:'WEIGHT',barcode:['000456'],pricing:{pricing_type:'WEIGHT',quantity:0.375}},{sku:'REMOVED',pricing:{quantity:0}}];
  const refs=normalizeEfoodWebhook(payload(items)).productRefs;
  assert.deepEqual(refs[0],{externalProductId:'SLL45E',externalSku:'SLL45E',name:'Mustard',quantity:3,barcodes:['05201050130791','000123']});
  assert.equal(refs[1].quantity,0.375);assert.equal(refs[1].barcodes[0],'000456');assert.equal(refs[2].quantity,0);
  assert.deepEqual(items[0].barcode,['05201050130791','000123','05201050130791']);assert.equal(items[0].pricing.total_price,0); // Never calculate or mutate provider prices.
});

test('legacy references and aliases preserve identity precedence and default quantity',()=>{
  const refs=normalizeEfoodWebhook({order:{id:'legacy',status:'READY_FOR_PICKUP',items:[{id:'PRODUCT',sku:'SKU',quantity:2},{sku:'QTY',qty:'2.5'},{sku:'DEFAULT'},{name:'Barcode only',barcode:'000123',quantity:1}]} ,store_id:'9344842'}).productRefs;
  assert.deepEqual(refs[0],{externalProductId:'PRODUCT',externalSku:'SKU',name:null,quantity:2});
  assert.equal(refs[1].quantity,2.5);assert.equal(refs[2].quantity,1);assert.equal(refs[3].externalSku,'000123');
  assert.equal(normalizeEfoodWebhook(payload([{sku:'SAME',quantity:2,qty:'2',pricing:{quantity:2}}])).productRefs[0].quantity,2);
});

test('invalid or conflicting quantity is rejected instead of invented or silently preferred',()=>{
  for(const quantity of [null,'',true,false,{},[],NaN,Infinity,-1,'-1','two','2,5',Number.MAX_SAFE_INTEGER+1]){
    assert.throws(()=>normalizeEfoodWebhook(payload([{sku:'BAD',pricing:{quantity}}])),error=>error.code==='INVALID_PRODUCT_QUANTITY');
  }
  assert.throws(()=>normalizeEfoodWebhook(payload([{sku:'MISSING',pricing:{pricing_type:'UNIT'}}])),error=>error.code==='INVALID_PRODUCT_QUANTITY');
  assert.throws(()=>normalizeEfoodWebhook(payload([{sku:'CONFLICT',quantity:1,pricing:{quantity:2}}])),error=>error.code==='CONFLICTING_PRODUCT_QUANTITY');
});

test('malformed barcodes cannot become coerced mapping references',()=>{
  for(const barcode of [{},[{}],[null],[true],[''],['000123\nother'],'x'.repeat(301),1.5,-1]){
    assert.throws(()=>normalizeEfoodWebhook(payload([{sku:'BAD',barcode,pricing:{quantity:1}}])),error=>error.code==='INVALID_PRODUCT_BARCODE');
  }
  assert.deepEqual(normalizeEfoodWebhook(payload([{sku:'NO-BARCODE',barcode:[],pricing:{quantity:1}}])).productRefs[0].barcodes,[]);
});
