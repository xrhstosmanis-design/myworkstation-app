import test from 'node:test';
import assert from 'node:assert/strict';
import {salesProductReportQuery,matchingSalesProducts} from '../src/services/assistant-sales-product-query.js';

test('only a strict trailing display SKU descriptor changes the canonical filter',()=>{
 assert.equal(salesProductReportQuery('TEST WATER 500ML (SKU FIX-500)'),'TEST WATER 500ML');
 assert.equal(salesProductReportQuery('TEST (PACK) WATER (sku FIX.500/1)'),'TEST (PACK) WATER');
 for(const input of ['FIX-500','TEST WATER','TEST (PACK)','TEST (SKU)','TEST (SKU )','TEST (SKU FIX-500) extra','TEST (SKU FIX 500)','TEST\n(SKU FIX-500)','(SKU FIX-500)','TEST (OTHER FIX-500)'])assert.equal(salesProductReportQuery(input),input);
});

test('exact literal and ordinary normalized searches retain precedence and partial-name semantics',()=>{
 const a={name:'ΝΕΡΟ 500ML',sku:'A'},b={name:'ΝΕΡΟ 500ML (SKU A)',sku:'LITERAL'};
 assert.deepEqual(matchingSalesProducts([a,b],b.name),[b]);
 assert.deepEqual(matchingSalesProducts([a,b],'A'),[a]);
 assert.deepEqual(matchingSalesProducts([a,b],'νερο'),[a,b]);
 assert.deepEqual(matchingSalesProducts([a],'Νερό   500ml'),[a]);
});

test('decorated selection narrows to both real identity fields and leaves duplicates for ambiguity handling',()=>{
 const a={name:'TEST WATER',sku:'FIX-500'},wrongName={name:'TEST WATER 1L',sku:'FIX-500'},wrongSku={name:'TEST WATER',sku:'OTHER'};
 assert.deepEqual(matchingSalesProducts([a,wrongName,wrongSku],'TEST WATER (SKU FIX-500)'),[a]);
 assert.deepEqual(matchingSalesProducts([wrongName,wrongSku],'TEST WATER (SKU FIX-500)'),[]);
 assert.deepEqual(matchingSalesProducts([a,{...a}],'TEST WATER (SKU FIX-500)'),[a,a]);
});
