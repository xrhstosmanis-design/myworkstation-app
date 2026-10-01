import test from "node:test";
import assert from "node:assert/strict";
import {internetItemPrice} from "../src/internet-market-item-price.js";
test("single Greek decimal item amount remains usable",()=>assert.deepEqual(internetItemPrice("Coca Cola 330ml 0,65 €"),{price:.65,priceReason:null}));
test("currency-prefix and repeated same amount remain usable",()=>assert.deepEqual(internetItemPrice("EUR 0.65 τιμή €0.65"),{price:.65,priceReason:null}));
test("observed LAB per-litre price cannot become item price",()=>assert.deepEqual(internetItemPrice("Πληροφορία Τιμής: 1627.2 € /Λίτρο"),{price:null,priceReason:"UNIT_RATE_ONLY"}));
test("Greek and English weight volume and piece unit rates stay excluded",()=>{
 for(const value of ["1,50 €/kg","2 € / 100ml","3 EUR per litre","4 € ανά κιλό","0,65 € / τεμ.","2 € /100 g"])assert.deepEqual(internetItemPrice(value),{price:null,priceReason:"UNIT_RATE_ONLY"},value);
});
test("a distinct explicitly labelled item amount survives excluded rate and old price",()=>assert.deepEqual(internetItemPrice("1627.2 € /Λίτρο. Παλιά τιμή: €0.87. Τιμή: €0.65"),{price:.65,priceReason:null}));
test("different unlabelled prices cannot silently choose the first or cheapest",()=>assert.deepEqual(internetItemPrice("0.93 € και 1.24 €"),{price:null,priceReason:"AMBIGUOUS_PRICE"}));
test("bulk tiers with different amounts require source review",()=>assert.deepEqual(internetItemPrice("Τιμή: €0.65 Ποσότητα24+ Τιμή: €0.60"),{price:null,priceReason:"AMBIGUOUS_PRICE"}));
test("shipping amount is excluded when clearly labelled",()=>assert.deepEqual(internetItemPrice("Τιμή €0.65 μεταφορικά: €3.80"),{price:.65,priceReason:null}));
test("grouped Greek item amount is read whole rather than truncated",()=>assert.deepEqual(internetItemPrice("1.627,20 €"),{price:1627.2,priceReason:null}));
test("barcode malformed or absent amounts cannot produce a truncated price",()=>{
 for(const value of ["5449000000996 €","€0.6509","τιμή δεν εμφανίζεται"])assert.deepEqual(internetItemPrice(value),{price:null,priceReason:"NO_ITEM_PRICE"},value);
});
