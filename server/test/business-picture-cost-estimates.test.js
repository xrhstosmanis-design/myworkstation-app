import test from 'node:test';
import assert from 'node:assert/strict';
import {applyBusinessPictureCostEstimates as apply,collectBusinessPictureMissingCosts as collect} from '../src/business-picture-cost-estimates.js';
import {finishBusinessPictureRow as finish} from '../src/business-picture-totals.js';
const group=extra=>({storeId:'s1',categoryId:'c1',costUnit:'PIECE',knownSalesNet:100,knownSalesCost:60,knownQuantity:10,knownUnitCostValue:60,missingSalesNet:50,missingZeroSalesQuantity:2,missingPricedLines:1,missingZeroPriceLines:1,unsafeMissingLines:0,missingCostLines:2,...extra});
const row=(g=group(),extra={})=>({day:'2035-01-01',month:'2035-01',salesNet:150,costValue:60,estimateKnownCostValue:60,salesLines:12,missingCostLines:g.missingCostLines,salesAbsNet:150,missingSalesAbsNet:50,expenseGross:10,knownExpenseVat:2,costGroups:[g],...extra});
test('priced and free missing units produce explicitly provisional profit without changing canonical nulls',()=>{
 const input=[row()],before=JSON.stringify(input),[estimated]=apply(input),r=finish(estimated);
 assert.equal(estimated.estimatedCostValue,102);assert.equal(r.estimatedGrossProfit,48);assert.equal(r.estimatedNetProfit,40);assert.equal(r.estimatedMargin,32);assert.equal(r.profitEstimateBasis,'CATEGORY_KNOWN_SALES');
 assert.equal(r.grossProfit,null);assert.equal(r.netProfit,null);assert.equal(r.margin,null);assert.ok(Math.abs(r.costCoveragePercent-200/3)<1e-8);assert.equal(JSON.stringify(input),before);
});
test('same loaded-period category basis is shared across days and remains additive',()=>{
 const unknown=row(group({knownSalesNet:0,knownSalesCost:0,knownQuantity:0,knownUnitCostValue:0,missingZeroPriceLines:0,missingZeroSalesQuantity:0,missingCostLines:1}),{salesNet:50,estimateKnownCostValue:0,costValue:0,missingCostLines:1});
 const known=row(group({missingSalesNet:0,missingZeroSalesQuantity:0,missingPricedLines:0,missingZeroPriceLines:0,missingCostLines:0}),{day:'2035-01-02',salesNet:100,missingCostLines:0,missingSalesAbsNet:0,salesAbsNet:100});
 const out=apply([unknown,known]);assert.equal(out[0].estimatedCostValue,30);assert.equal(out[1].estimatedCostValue,60);
 assert.equal(finish(out[0]).estimatedGrossProfit+finish(out[1]).grossProfit,60);
});
test('fallback stays in the same store and zero-price units never borrow another stock unit',()=>{
 const basis=row(group({missingCostLines:0,missingPricedLines:0,missingZeroPriceLines:0,missingSalesNet:0,missingZeroSalesQuantity:0}),{missingCostLines:0});
 const otherCategory=row(group({categoryId:'new',knownSalesNet:0,knownSalesCost:0,knownQuantity:0,knownUnitCostValue:0}));
 const foreign=row(group({storeId:'s2',knownSalesNet:0,knownSalesCost:0,knownQuantity:0,knownUnitCostValue:0}));
 const otherUnit=row(group({costUnit:'KG',knownSalesNet:0,knownSalesCost:0,knownQuantity:0,knownUnitCostValue:0}));
 const out=apply([basis,otherCategory,foreign,otherUnit]);assert.equal(out[1].estimatedCostValue,102);assert.equal(out[1].storeEstimatedCostLines,2);
 assert.equal(out[2].estimatedCostValue,null);assert.equal(out[2].unestimatedCostLines,2);assert.equal(out[3].estimatedCostValue,null);assert.equal(out[3].unestimatedCostLines,1);
});
test('signed returns retain signs while orphan/sign-mismatched rows remain unestimable',()=>{
 const returns=row(group({missingSalesNet:-50,missingZeroSalesQuantity:-2}));assert.equal(apply([returns])[0].estimatedCostValue,18);
 const orphan=row(group({missingCostLines:1,missingSalesNet:0,missingZeroSalesQuantity:0,missingPricedLines:0,missingZeroPriceLines:0,unsafeMissingLines:1}),{missingCostLines:1});
 assert.equal(apply([orphan])[0].unestimatedCostLines,1);assert.equal(finish(apply([orphan])[0]).estimatedGrossProfit,null);
});
test('no evidence, incomplete group coverage and nonfinite inputs never turn into zero-cost profit',()=>{
 for(const data of [row(group(),{costGroups:undefined}),row(group(),{missingCostLines:3}),row(group({knownSalesCost:NaN}))])assert.equal(apply([data])[0].estimatedCostValue,null);
 const none=row(group({knownSalesNet:0,knownSalesCost:0,knownQuantity:0,knownUnitCostValue:0}));assert.equal(apply([none])[0].unestimatedCostLines,2);
});
test('documented zero-cost basis remains distinguishable from no basis',()=>{
 const [r]=apply([row(group({knownSalesCost:0,knownUnitCostValue:0}),{costValue:0,estimateKnownCostValue:0})]);assert.equal(r.estimatedCostValue,0);assert.equal(finish(r).grossProfit,null);assert.equal(finish(r).estimatedGrossProfit,150);
 const actual=finish({...r,missingCostLines:0});assert.equal(actual.grossProfit,150);assert.equal(actual.estimatedGrossProfit,null);
});
test('missing product details preserve daily precision and escape decisions remain with React/print',()=>{
 const item={storeId:'s1',productId:'p1',name:'<test>',sku:'ONE',reason:'MISSING_COST',quantity:2,salesGross:4,salesNet:3};
 const out=collect([{day:'2035-01-01',month:'2035-01',missingCostDetails:[item,item]},{day:'2035-01-02',month:'2035-01',missingCostDetails:[item]}]);
 assert.equal(out.length,2);assert.equal(out[0].lines,2);assert.equal(out[0].quantity,4);assert.equal(out[0].name,'<test>');assert.equal(out[1].day,'2035-01-02');assert.equal(item.quantity,2);
});
