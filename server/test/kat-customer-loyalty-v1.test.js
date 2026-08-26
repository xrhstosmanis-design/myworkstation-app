import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const pos=await readFile(new URL("../src/routes/store-pos.js",import.meta.url),"utf8");
const customers=await readFile(new URL("../src/routes/customer-control-v2.js",import.meta.url),"utf8");
const ui=await readFile(new URL("../../client/src/components/store/StorePosPanel.jsx",import.meta.url),"utf8");

test("loyalty earns one point per collected euro and defers credit-sale points until payment",()=>{
  assert.match(pos,/earnedPoints=customer\?Math\.floor\(Math\.max\(0,summary\.total-creditAmount\)\):0/);
  assert.match(pos,/customer-balance-payment[\s\S]*earnedPoints=Math\.floor\(body\.amount\)/);
  assert.match(pos,/'EARN'/);
  assert.match(pos,/CustomerLoyaltyLedger/);
});

test("redemption is limited to blocks of 100 points and twenty percent of the sale",()=>{
  assert.match(pos,/redeemedPoints%100!==0/);
  assert.match(pos,/redeemedPoints\/100\*5/);
  assert.match(pos,/summary\.total\*\.2/);
  assert.match(pos,/FOR UPDATE/);
  assert.match(ui,/ΕΞΑΡΓΥΡΩΣΗ ΠΟΝΤΩΝ/);
  assert.match(ui,/redeemPoints/);
});

test("customer card scan and backoffice detail expose points and audited loyalty history",()=>{
  assert.match(pos,/SELECT "id","name","balance","creditLimit","points" FROM "Customer"/);
  assert.match(pos,/earnedPoints,redeemedPoints/);
  assert.match(customers,/loyaltyLedger/);
  assert.match(customers,/CustomerLoyaltyLedger/);
});
