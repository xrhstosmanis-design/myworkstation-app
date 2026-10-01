import test from 'node:test';
import assert from 'node:assert/strict';
import {finishBusinessPictureRow as finish} from '../src/business-picture-totals.js';
const base={salesNet:100,costValue:60,expenseGross:10,knownExpenseVat:2,missingExpenseVatPayments:0,purchaseNet:80,salesLines:2,missingCostLines:0};
test('complete costs preserve actual gross profit, margin and expenses',()=>{
 const r=finish(base);assert.equal(r.grossProfit,40);assert.equal(r.netProfit,32);assert.equal(r.margin,40);assert.equal(r.costComplete,true);
});
test('one unknown cost suppresses profit even with positive known costs',()=>{
 const r=finish({...base,missingCostLines:1});assert.equal(r.grossProfit,null);assert.equal(r.netProfit,null);assert.equal(r.margin,null);assert.equal(r.costComplete,false);assert.equal(r.salesNet,100);assert.equal(r.costValue,60);
});
test('documented free purchases may produce 100 percent margin',()=>{
 const r=finish({...base,costValue:0});assert.equal(r.grossProfit,100);assert.equal(r.margin,100);
});
test('missing costs propagate into aggregate while complete periods remain usable',()=>{
 const days=[{...base},{...base,salesNet:50,costValue:0,missingCostLines:1}];
 const sum=days.reduce((a,r)=>{for(const k of Object.keys(a))a[k]+=r[k];return a},{salesNet:0,costValue:0,expenseGross:0,knownExpenseVat:0,missingExpenseVatPayments:0,purchaseNet:0,salesLines:0,missingCostLines:0});
 assert.equal(finish(days[0]).netProfit,32);assert.equal(finish(sum).netProfit,null);assert.equal(finish(sum).salesLines,4);assert.equal(finish(sum).missingCostLines,1);
});
test('no sales avoids NaN and still retains known expense outcome',()=>{
 const r=finish({...base,salesNet:0,costValue:0,salesLines:0});assert.equal(r.margin,0);assert.equal(r.netProfit,-8);
});

test('unknown expense VAT preserves gross but suppresses net result without hiding known gross profit',()=>{
 const r=finish({...base,missingExpenseVatPayments:1});assert.equal(r.expenseGross,10);assert.equal(r.expenses,null);assert.equal(r.expenseVat,null);assert.equal(r.netProfit,null);assert.equal(r.expenseSalesPercent,null);assert.equal(r.grossProfit,40);
});
test('documented VAT is deducted exactly once and credit expenses retain their sign',()=>{
 const r=finish(base);assert.equal(r.expenses,8);assert.equal(r.expenseVat,2);assert.equal(r.expenseSalesPercent,8);
 const credit=finish({...base,expenseGross:-10,knownExpenseVat:-2});assert.equal(credit.expenses,-8);assert.equal(credit.expenseSalesPercent,-8);assert.equal(credit.netProfit,48);
});
