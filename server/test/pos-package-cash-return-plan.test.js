import test from 'node:test';
import assert from 'node:assert/strict';
import {packageStockLine,scannedCashReturnPlan,moneyCents} from '../../shared/pos-package-return.mjs';
test('distinct package price belongs to the current store, with exact cents and shared base stock',()=>{
 const pack={productId:'pack24',baseProductId:'water500',unitsPerPackage:24,quantity:1};
 assert.deepEqual(packageStockLine({...pack,storePrice:'8.00'}),{...pack,stockQuantity:24,unitCents:800,totalCents:800});
 assert.equal(packageStockLine({...pack,quantity:2,storePrice:'7.35'}).totalCents,1470);
 assert.equal(packageStockLine({...pack,quantity:2,storePrice:'7.35'}).stockQuantity,48);
 const six=packageStockLine({...pack,productId:'pack6',baseProductId:'water1500',unitsPerPackage:6,storePrice:'4.10'});
 assert.equal(six.stockQuantity,6);assert.equal(six.totalCents,410);
});
test('cash return restores packs plus loose bottles once in the plan, with unchanged card totals',()=>{
 const r=scannedCashReturnPlan([{productId:'pack24',baseProductId:'water500',unitsPerPackage:24,quantity:2,storePrice:7.35},{productId:'water500',quantity:1,storePrice:0.5},{productId:'pack6',baseProductId:'water1500',unitsPerPackage:6,quantity:1,storePrice:4}]);
 assert.equal(r.refundCents,1920);assert.equal(r.cashDeltaCents,-1920);assert.equal(r.cardDeltaCents,0);
 assert.deepEqual(r.stock,[{productId:'water500',quantity:49},{productId:'water1500',quantity:6}]);
});
test('no-stock items and fractional weighed items do not introduce package stock or floating money errors',()=>{
 const r=scannedCashReturnPlan([{productId:'service',quantity:1,storePrice:1,trackStock:false},{productId:'weighed',quantity:0.125,storePrice:1.2}]);
 assert.equal(scannedCashReturnPlan([{productId:'weighed',quantity:1.005,storePrice:1}]).refundCents,101);
 assert.equal(r.refundCents,115);assert.deepEqual(r.stock,[{productId:'weighed',quantity:0.125}]);
});
test('invalid units, self-links, fractional packs and nonfinite or imprecise money fail closed',()=>{
 const p={productId:'pack',baseProductId:'water',unitsPerPackage:24,quantity:1,storePrice:8};
 for(const bad of [{baseProductId:'pack'},{unitsPerPackage:1},{unitsPerPackage:2.5},{quantity:1.5},{storePrice:0.333333},{quantity:Infinity}])assert.throws(()=>packageStockLine({...p,...bad}));
 for(const v of [null,'',NaN,Infinity,-1,0.001])assert.throws(()=>moneyCents(v));
 assert.throws(()=>scannedCashReturnPlan([]));assert.throws(()=>scannedCashReturnPlan([{productId:'x',quantity:1,storePrice:0}]));
});
