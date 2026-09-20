import assert from "node:assert/strict";
import test from "node:test";
import {claimsCompletePrintedTable,verifiedPrintedTableForPersistence} from "../src/invoice-line-reconciliation.js";
import {shouldApplyLearnedPack,stockMultiplierForPersistedInvoiceLine} from "../src/routes/commerce-pos-v244-core.js";

const quantities=[2,1,3,6,3,3,3,2,4,3,1];
const prices=[1.74,1.74,2.07,1.58,1.47,2,2,2.69,1.12,1.6,1.38];
const discounts=[10,10,10,10,10,10,10,10,10,15,15];
const nets=[3.13,1.57,5.59,8.53,3.97,5.4,5.4,4.84,4.03,4.08,1.17];
const gross=[3.54,1.77,6.32,9.64,4.49,6.1,6.1,5.47,4.55,4.61,1.32];
const descriptions=["ΚΑΘΗΜΕΡΙΝΑ ΦΡΕΣΚΟ ΓΑΛΑ ΠΛΗΡΕΣ 1LT","ΚΑΘΗΜΕΡΙΝΑ ΦΡΕΣΚΟ ΓΑΛΑ ΕΛΑΦΡΥ 1LT","ADVANCE Υ.Θ.Ε. 1L ΡΟΦ. ΓΑΛΑΚΤΟΣ","MILKO FREE ΜΠΟΥΚΑΛΙ 450ML","MILCAFE ΧΑΡΤΙ 250ML","VITALINE PROTEINDRINK ΣΟΚΟΛΑΤ 330ML","VITALINE PROTEINDRINK ΦΙΣΤΙΚΙ 330ML","ΜΜMILK ΟΙΚΟΓΕΝΕΙΑΚΟ ΠΛ 1,5L","ΤΟΥ ΤΟΠΟΥ ΜΑΣ ΕΛ 500ML","LIFE ΠΟΡΤΟΚΑΛΙ ΜΠΟΥΚΑΛΙ 400ML","LIFE ΦΡΑΟΥΛΑ ΜΠΑΝΑΝΑ ΜΠΟΥΚΑΛΙ 400ML"];
const rows=quantities.map((quantity,index)=>({
  code:String(720547+index),description:descriptions[index],quantity,unit:"ΤΜΧ",invoiceUnit:"ΤΜΧ",unitsPerPackage:descriptions[index].includes("1LT")?1000:0,
  unitCost:prices[index],discount1:discounts[index],discount2:0,discount3:0,netAmount:nets[index],exciseTotal:0,vatRate:13,grossAmount:gross[index],
  sourceColumnsVerified:true,quantitySource:"AI_COMPLETE_PRINTED_TABLE_VERIFIED"
}));

test("invoice 28897 preserves printed quantities, discounts and VAT",()=>{
  const persisted=verifiedPrintedTableForPersistence(rows,53.91);
  assert.ok(persisted);
  assert.deepEqual(persisted.map(line=>line.quantity),quantities);
  assert.deepEqual(persisted.map(line=>line.discount1),discounts);
  assert.deepEqual(persisted.map(line=>line.vatRate),Array(11).fill(13));
  assert.equal(Number(persisted.reduce((sum,line)=>sum+line.grossAmount,0).toFixed(2)),53.91);
});

test("invoice 28897 does not convert litres or ml into thousands of pieces",()=>{
  assert.equal(stockMultiplierForPersistedInvoiceLine(rows[0]),1);
  assert.equal(stockMultiplierForPersistedInvoiceLine({...rows[3],unitsPerPackage:450}),1);
  assert.equal(shouldApplyLearnedPack(rows[0],1000),false,"a stale learned pack cannot override a verified printed TEM row");
  assert.equal(shouldApplyLearnedPack({...rows[0],sourceColumnsVerified:false,unitsPerPackage:0},12),true,"legacy unverified package learning remains available");
  assert.equal(stockMultiplierForPersistedInvoiceLine({...rows[0],unit:"PACKAGE",invoiceUnit:"PACKAGE",unitsPerPackage:12,packRule:"LEARNED_PACK_12"}),12);
});

test("invoice 28897 fails closed if a verified discount or VAT is corrupted",()=>{
  const corrupt=rows.map((line,index)=>index?line:{...line,discount1:99.9,vatRate:0,netAmount:line.grossAmount});
  assert.equal(claimsCompletePrintedTable(corrupt),true);
  assert.equal(verifiedPrintedTableForPersistence(corrupt,53.91),null);
});
