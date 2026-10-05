import test from "node:test";
import assert from "node:assert/strict";
import {buildLowValueProducts as build,purchaseCost} from "../src/lib/low-value-products.js";
const product=extra=>({productId:"p",name:"Product",sku:"P",unit:"PIECE",trackStock:true,currentStock:100,...extra});
const line=extra=>({productId:"p",quantity:10,lineTotal:124,vatRate:24,source:"POS",occurredAt:"2026-10-03T12:00:00Z",...extra});
const purchase=extra=>({productId:"p",documentId:"old",documentNumber:"OLD",documentDate:"2026-10-01",documentCreatedAt:"2026-10-01",quantity:10,netAmount:60,unit:"PIECE",...extra});
test("documented net cost and actual VAT/returns produce slow and low margin independently",()=>{
 const [r]=build([product()],[line(),line({source:"POS_REVERSAL",quantity:-2,lineTotal:-24.8,occurredAt:"2026-10-05",originalOccurredAt:"2026-10-03"})],[purchase()],{historyDays:30,slowDays:90,marginPercent:50});
 assert.equal(r.soldQuantity,10);assert.equal(r.returnedQuantity,2);assert.equal(r.netQuantity,8);assert.equal(r.salesNet,80);assert.equal(r.costValue,48);assert.equal(r.profit,32);assert.equal(r.margin,40);assert.equal(r.daysOfStock,375);assert.deepEqual(r.flags,["SLOW_MOVEMENT","LOW_MARGIN"]);
});
test("a return keeps original-date cost; a later purchase cannot rewrite it",()=>{
 const [r]=build([product()],[line({source:"POS_REVERSAL",quantity:-2,lineTotal:-24.8,occurredAt:"2026-10-05",originalOccurredAt:"2026-10-03"})],[purchase(),purchase({documentId:"new",documentDate:"2026-10-04",netAmount:90})]);
 assert.equal(r.costValue,-12);assert.equal(r.profit,-8);assert.equal(r.margin,null);assert.equal(r.costEvidence[0].documentId,"old");
 const [missing]=build([product()],[line({source:"POS_REVERSAL",quantity:-2,lineTotal:-24.8,originalOccurredAt:null})],[purchase()]);assert.equal(missing.profit,null);assert.equal(missing.missingCostLines,1);
});
test("unknown/latest invalid cost never falls back to a prior valid document or catalog",()=>{
 const [missing]=build([product({costPrice:1})],[line()],[purchase({documentDate:"2026-10-04"})]);assert.equal(missing.profit,null);assert.equal(missing.margin,null);
 const [invalid]=build([product()],[line()],[purchase(),purchase({documentId:"invalid",documentDate:"2026-10-02",unit:"PACKAGE",unitsPerPackage:0})]);assert.equal(invalid.profit,null);
});
test("explicit approved zero cost remains known; dimensions and all repeated rows are normalized",()=>{
 assert.equal(purchaseCost([purchase({netAmount:0})],product(),Date.now()),0);
 assert.equal(purchaseCost([purchase({quantity:2,unit:"PACKAGE",unitsPerPackage:24,netAmount:48})],product(),Date.now()),1);
 assert.equal(purchaseCost([purchase({quantity:1,unit:"KG",netAmount:10})],product({unit:"G"}),Date.now()),.01);
 assert.equal(purchaseCost([purchase({quantity:1000,unit:"G",netAmount:10})],product({unit:"KG"}),Date.now()),10);
 assert.equal(purchaseCost([purchase({quantity:1,unit:"KG",netAmount:10})],product({unit:"L"}),Date.now()),null);
 assert.equal(purchaseCost([purchase(),purchase()],product(),Date.now()),6);
 const [r]=build([product()],[line()],[purchase({netAmount:0})]);assert.equal(r.margin,100);assert.equal(r.profit,100);
});
test("posted-order factors/corrections require real evidence and recipe cost is not invented",()=>{
 const row=purchase({sourceType:"PURCHASE_ORDER",orderBaseQuantity:24,orderNetAmount:12,orderInvalidUnits:0});assert.equal(purchaseCost([row],product(),Date.now()),.5);
 assert.equal(purchaseCost([{...row,orderInvalidUnits:1}],product(),Date.now()),null);
 assert.equal(purchaseCost([{...row,correctionId:"c",correctionAt:"2026-10-04",correctedUnitCost:.75}],product(),new Date("2026-10-03").getTime()),null);
 assert.equal(purchaseCost([{...row,correctionId:"c",correctionAt:"2026-10-02",correctedUnitCost:.75}],product(),new Date("2026-10-03").getTime()),.75);
 assert.equal(purchaseCost([row],product({hasRecipe:true}),Date.now()),null);
});
test("no sale, no net movement, losses, unknown stock and inconsistent lines stay distinct",()=>{
 assert.deepEqual(build([product()],[],[])[0].flags,["NO_SALES"]);
 assert.equal(build([product({trackStock:false})],[],[])[0].flags.length,0);
 const [loss]=build([product()],[line()],[purchase({netAmount:120})]);assert.ok(loss.flags.includes("LOSS"));assert.equal(loss.profit,-20);
 const [zero]=build([product()],[line(),line({quantity:-10,lineTotal:-124,source:"EXCHANGE"})],[purchase()]);assert.ok(zero.flags.includes("NO_NET_MOVEMENT"));assert.equal(zero.margin,null);
 for(const extra of [{amountsReconciled:false},{quantity:null},{quantity:0,lineTotal:10},{vatRate:null},{quantity:-1,lineTotal:10},{lineTotal:Infinity}]){const [r]=build([product()],[line(extra)],[purchase()]);assert.equal(r.profit,null);assert.equal(r.salesNet,null);assert.ok(r.flags.includes("REVIEW"));assert.ok(!r.flags.some(f=>["NO_SALES","NO_NET_MOVEMENT","SLOW_MOVEMENT"].includes(f)));assert.equal(r.soldQuantity,null);assert.equal(r.daysOfStock,null);}
 const [grams]=build([product({unit:"G"})],[],[]);assert.equal(grams.unitLabel,"G");
});
test("parameter bounds reject nonfinite and impossible thresholds",()=>{
 for(const options of [{historyDays:0},{historyDays:366},{slowDays:0},{slowDays:731},{marginPercent:101},{marginPercent:NaN}])assert.throws(()=>build([],[],[],options),/Μη έγκυρα/);
});
