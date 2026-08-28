import test from "node:test";
import assert from "node:assert/strict";
import {authorizePaymentRetry,transitionPaymentAttempt} from "../src/payment-attempt-state.js";

test("planned attempt accepts one provider result and identical callback is idempotent",()=>{
  assert.deepEqual(transitionPaymentAttempt({currentStatus:"PLANNED",nextStatus:"SUCCESS"}),{status:"SUCCESS",replay:false});
  assert.deepEqual(transitionPaymentAttempt({currentStatus:"SUCCESS",nextStatus:"SUCCESS"}),{status:"SUCCESS",replay:true});
});

test("timeout blocks blind retry",()=>{
  assert.throws(()=>authorizePaymentRetry("TIMEOUT"),error=>error.code==="PAYMENT_TIMEOUT_RECONCILIATION_REQUIRED");
});

test("timeout can be resolved only after provider reconciliation",()=>{
  assert.throws(()=>transitionPaymentAttempt({currentStatus:"TIMEOUT",nextStatus:"SUCCESS"}),error=>error.code==="PAYMENT_TIMEOUT_RECONCILIATION_REQUIRED");
  assert.deepEqual(transitionPaymentAttempt({currentStatus:"TIMEOUT",nextStatus:"SUCCESS",reconciled:true,reconciliationNote:"Provider confirmed capture"}),{status:"SUCCESS",replay:false,reconciled:true});
});

test("only failed or cancelled attempts can create a retry",()=>{
  assert.deepEqual(authorizePaymentRetry("FAILURE"),{allowed:true});
  assert.deepEqual(authorizePaymentRetry("CANCELLED"),{allowed:true});
  for(const status of ["PLANNED","SUCCESS","REVERSED"])assert.throws(()=>authorizePaymentRetry(status));
});

test("only successful payment can be reversed",()=>{
  assert.deepEqual(transitionPaymentAttempt({currentStatus:"SUCCESS",nextStatus:"REVERSED"}),{status:"REVERSED",replay:false});
  assert.throws(()=>transitionPaymentAttempt({currentStatus:"FAILURE",nextStatus:"REVERSED"}),error=>error.code==="PAYMENT_RESULT_TRANSITION_BLOCKED");
});

