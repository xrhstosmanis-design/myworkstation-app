import test from "node:test";
import assert from "node:assert/strict";
import {tableCashPlan} from "../src/services/table-cash-payment.js";

const first={parts:[],transactionId:"first",requestedCents:300,totalCents:850};

test("300 cents leaves 550 cents outstanding",()=>{
  const payment=tableCashPlan(first);
  assert.deepEqual(payment,{transactionId:"first",amountCents:300,paidCents:300,balanceCents:550});
  assert.deepEqual(tableCashPlan({...first,parts:[payment],transactionId:"final",requestedCents:undefined}),{paidCents:300,balanceCents:550});
});

test("a replay returns the original result without exposing shift metadata",()=>{
  const payment=tableCashPlan(first);
  const parts=[{...payment,actorId:"actor",sessionId:"shift"}];
  assert.deepEqual(tableCashPlan({...first,parts}),{replay:true,...payment});
  assert.throws(()=>tableCashPlan({...first,parts,requestedCents:301}),{status:409});
});

test("successive payments share the remaining balance",()=>{
  const parts=[tableCashPlan(first)];
  const next={...first,transactionId:"another",parts};
  assert.throws(()=>tableCashPlan({...next,requestedCents:551}),{status:409});
  assert.throws(()=>tableCashPlan({...next,requestedCents:550}),{status:409});
  assert.equal(tableCashPlan({...next,requestedCents:200}).balanceCents,350);
});

test("invalid partial amounts and inconsistent balances are rejected",()=>{
  for(const requestedCents of [0,-1,1.5,NaN])assert.throws(()=>tableCashPlan({...first,requestedCents}),{status:409});
  assert.throws(()=>tableCashPlan({...first,parts:[tableCashPlan(first)],transactionId:"next",totalCents:299}),{status:409});
});
