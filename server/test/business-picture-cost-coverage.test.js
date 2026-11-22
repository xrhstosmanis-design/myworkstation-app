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

test('expenses without VAT analysis use the owner zero-rate convention and preserve documented VAT',()=>{
 const r=finish({...base,missingExpenseVatPayments:1});assert.equal(r.expenseGross,10);assert.equal(r.expenses,8);assert.equal(r.expenseVat,2);assert.equal(r.netProfit,32);assert.equal(r.expenseSalesPercent,8);assert.equal(r.grossProfit,40);assert.equal(r.expenseVatComplete,false);assert.equal(r.expenseVatPolicy,"DOCUMENTED_OR_ZERO");
});
test('documented VAT is deducted exactly once and credit expenses retain their sign',()=>{
 const r=finish(base);assert.equal(r.expenses,8);assert.equal(r.expenseVat,2);assert.equal(r.expenseSalesPercent,8);
 const credit=finish({...base,expenseGross:-10,knownExpenseVat:-2});assert.equal(credit.expenses,-8);assert.equal(credit.expenseSalesPercent,-8);assert.equal(credit.netProfit,48);
});

test('all undocumented expense amounts are deducted in full including credits without inventing sales costs',()=>{
 for(const amount of [10,-10,0]){
  const r=finish({...base,expenseGross:amount,knownExpenseVat:0,missingExpenseVatPayments:2});
  assert.equal(r.expenses,amount);assert.equal(r.expenseVat,0);assert.equal(r.netProfit,40-amount);
  assert.equal(finish({...base,expenseGross:amount,knownExpenseVat:0,missingExpenseVatPayments:2,missingCostLines:1}).netProfit,null);
 }
});
test('mixed documented and zero-rate expenses add consistently across days and months',()=>{
 const days=[{...base,expenseGross:124,knownExpenseVat:24},{...base,expenseGross:50,knownExpenseVat:0,missingExpenseVatPayments:1}];
 const total=Object.fromEntries(Object.keys(base).map(k=>[k,days.reduce((sum,r)=>sum+r[k],0)]));
 const r=finish(total);assert.equal(r.expenses,150);assert.equal(r.expenseVat,24);assert.equal(r.netProfit,-70);
 assert.equal(r.expenses,days.reduce((sum,row)=>sum+finish(row).expenses,0));
});
