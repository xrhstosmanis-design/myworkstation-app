import assert from "node:assert/strict";
import test from "node:test";
import {efoodLeafletPrices} from "../src/bundle-promotion-pricing.js";

test("efood subtracts the store's per-item discount from the channel price", () => {
  const base = {storePrice:2.6,efoodPrice:3};
  for (const offer of [
    {offerMode:"FIXED_PRICE",offerPrice:2.3},
    {offerMode:"DISCOUNT_PERCENT",discountPercent:10},
    {offerMode:"DISCOUNT_AMOUNT",discountAmount:0.3},
  ]) {
    assert.deepEqual(efoodLeafletPrices({...base,...offer}), {storeOffer:2.3,discount:0.3,finalPrice:2.7});
  }
});

test("missing channel price and unusable offers are excluded", () => {
  const offer = {storePrice:2.6,offerMode:"FIXED_PRICE",offerPrice:2.3};
  assert.equal(efoodLeafletPrices({...offer,efoodPrice:null}), null);
  assert.equal(efoodLeafletPrices({...offer,efoodPrice:0.3}), null);
  assert.equal(efoodLeafletPrices({...offer,efoodPrice:3,offerPrice:2.6}), null);
});
