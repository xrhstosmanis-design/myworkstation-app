import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {applyLearnedDiscountsForReconciliation,stockMultiplierForPersistedInvoiceLine} from "../src/routes/commerce-pos-v244-core.js";

test("exact learned discount is used only when it improves the current invoice total",()=>{
  const lines=[
    {code:"ES01000",quantity:27,unitCost:25,discount1:0,netAmount:675,vatRate:13,grossAmount:762.75},
    {code:"DEL005",quantity:1,unitCost:13.5,discount1:4,netAmount:12.96,vatRate:13,grossAmount:14.64,
      learnedDiscounts:{discount1:25,discount2:0,discount3:0,confirmed:true}},
    {code:"FR1500",quantity:48,unitCost:5,discount1:0,netAmount:240,vatRate:13,grossAmount:271.20}
  ];
  const currentTotal=lines.reduce((sum,line)=>sum+line.grossAmount,0);
  const expected=money2(currentTotal-3.2);
  const corrected=applyLearnedDiscountsForReconciliation(lines,expected);
  assert.equal(corrected[1].discount1,25);
  assert.equal(corrected[1].learnedDiscountCorrectionApplied,true);
  assert.equal(money2(corrected.reduce((sum,line)=>sum+line.grossAmount,0)),expected);

  const legitimateNewTerms=applyLearnedDiscountsForReconciliation(lines,money2(currentTotal));
  assert.equal(legitimateNewTerms[1].discount1,4,"history cannot replace current terms when the current invoice already reconciles");
});

test("POS reports every economic mismatch above five cents instead of the five-euro recovery limit",()=>{
  const source=fs.readFileSync(new URL("../src/routes/commerce-pos-v244.js",import.meta.url),"utf8");
  const intake=source.slice(source.indexOf('router.post("/ai-reader/jobs/:jobId/pos-intake"'),source.indexOf("router.use(coreRouter)"));
  assert.match(intake,/const reconciliationRequired=diff>POS_STORED_LINES_TOLERANCE/);
  assert.doesNotMatch(intake,/const reconciliationRequired=diff>POS_HANDOFF_TOLERANCE/);
  const core=fs.readFileSync(new URL("../src/routes/commerce-pos-v244-core.js",import.meta.url),"utf8");
  assert.match(core,/const persistedGross=productLinesGross\(matched\),persistedDifference=/);
  assert.match(core,/body\.reconciliationRequired=persistedDifference>0\.05/);
});

test("an explicitly confirmed package reaches persisted stock conversion",()=>{
  assert.equal(stockMultiplierForPersistedInvoiceLine({invoiceUnit:"PACKAGE",unit:"PACKAGE",quantity:48,
    unitsPerPackage:100,confirmedPackMapping:true}),100);
});

const money2=value=>Math.round((Number(value||0)+Number.EPSILON)*100)/100;
