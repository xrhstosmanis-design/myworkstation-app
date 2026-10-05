import test from "node:test";
import assert from "node:assert/strict";
import {buildOrderSuggestions} from "../src/lib/order-suggestions.js";
const row=extra=>({productId:"p",name:"Product",sku:"SKU",unit:"PIECE",currentStock:3,minStock:5,soldQuantity:60,returnedQuantity:0,...extra});
test("order proposal uses net sales, delivery plus coverage and rounds pieces upward",()=>{
  const [r]=buildOrderSuggestions([row({returnedQuantity:15})],{historyDays:30,coverageDays:7,leadDays:3});
  assert.equal(r.netQuantity,45);assert.equal(r.dailyDemand,1.5);assert.equal(r.targetStock,15);assert.equal(r.suggestedQuantity,12);assert.equal(r.daysRemaining,2);
  const [fractional]=buildOrderSuggestions([row({soldQuantity:31,returnedQuantity:0,currentStock:0,minStock:0})]);assert.equal(fractional.suggestedQuantity,11);
});
test("minimum fallback, adequate stock and zero demand are explicit",()=>{
  const [fallback]=buildOrderSuggestions([row({soldQuantity:0,minStock:5})]);assert.equal(fallback.suggestedQuantity,2);assert.equal(fallback.dailyDemand,0);assert.equal(fallback.daysRemaining,null);assert.match(fallback.reason,/ελάχιστου/);
  const [enough]=buildOrderSuggestions([row({currentStock:20})]);assert.equal(enough.suggestedQuantity,0);
  const [zero]=buildOrderSuggestions([row({soldQuantity:0,minStock:null,currentStock:0})]);assert.equal(zero.targetStock,0);assert.equal(zero.suggestedQuantity,0);assert.match(zero.reason,/Δεν υπάρχει/);
});
test("negative stock remains a review warning and excessive returns cannot make negative demand",()=>{
  const [negative]=buildOrderSuggestions([row({currentStock:-2,soldQuantity:0})]);assert.equal(negative.suggestedQuantity,7);assert.match(negative.warnings[0],/Αρνητικό απόθεμα/);
  const [returns]=buildOrderSuggestions([row({returnedQuantity:100})]);assert.equal(returns.netQuantity,0);assert.equal(returns.suggestedQuantity,2);assert.ok(returns.warnings.some(w=>/υπερβαίνουν/.test(w)));
});
test("measured units preserve their own dimension and round to three decimals",()=>{
  for(const unit of ["KG","G","L","ML"]){const [r]=buildOrderSuggestions([row({unit,currentStock:0,minStock:0,soldQuantity:1})]);assert.equal(r.suggestedQuantity,.334);assert.notEqual(r.unitLabel,"τεμ.");}
});
test("unknown packs, recipes and incomplete quantities cannot manufacture proposals",()=>{
  for(const extra of [{unit:"PACKAGE"},{unit:""},{hasRecipe:true},{currentStock:null},{currentStock:"invalid"},{minStock:-1},{soldQuantity:Infinity},{returnedQuantity:null}]){
    const [r]=buildOrderSuggestions([row(extra)]);assert.equal(r.suggestedQuantity,null);assert.equal(r.dailyDemand,null);assert.ok(r.reason);
  }
});
test("invalid computation periods are rejected",()=>{
  for(const options of [{historyDays:6},{historyDays:91},{coverageDays:0},{coverageDays:61},{leadDays:-1},{leadDays:31},{leadDays:1.5}])assert.throws(()=>buildOrderSuggestions([row()],options),/Μη έγκυρες/);
});
