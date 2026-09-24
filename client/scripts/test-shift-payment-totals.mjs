import assert from "node:assert/strict";
import { addSalePaymentTotals } from "../src/components/store/shift-payment-totals.js";

const totals = { cash: 0, card: 0, iris: 0, total: 0 };
addSalePaymentTotals(totals, { type: "SALE_CASH", amount: 1, payments: [{ method: "CASH", amount: .5 }, { method: "CARD", amount: .5 }] });
assert.deepEqual(totals, { cash: .5, card: .5, iris: 0, total: 1 });
addSalePaymentTotals(totals, { type: "SALE_IRIS", amount: .5, payments: [{ method: "IRIS", amount: .5 }] });
assert.deepEqual(totals, { cash: .5, card: .5, iris: .5, total: 1.5 });
addSalePaymentTotals(totals, { type: "SALE_CARD", amount: 1 });
assert.deepEqual(totals, { cash: .5, card: 1.5, iris: .5, total: 2.5 });
