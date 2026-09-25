import test from "node:test";
import assert from "node:assert/strict";
import {expenseReviewStatus} from "../src/routes/expense-review-policy.js";

test("owner expenses are final on entry while POS and delegated roles await review",()=>{
  for(const role of ["OWNER","SUPER_ADMIN"]){
    assert.equal(expenseReviewStatus({role,tokenType:"USER"}),"CONFIRMED");
    assert.equal(expenseReviewStatus({role,tokenType:"STORE_OPERATOR"}),"PENDING_REVIEW");
  }
  assert.equal(expenseReviewStatus({role:"ADMIN",platformRole:"SUPER_ADMIN",tokenType:"USER"}),"CONFIRMED");
  for(const role of ["ADMIN","MANAGER","OPERATOR"])
    assert.equal(expenseReviewStatus({role,tokenType:"USER"}),"PENDING_REVIEW");
});
