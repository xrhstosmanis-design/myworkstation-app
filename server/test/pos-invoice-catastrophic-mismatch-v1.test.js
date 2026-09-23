import test from "node:test";
import assert from "node:assert/strict";
import {catastrophicUnverifiedInvoiceMismatch} from "../src/lib/pos-invoice-catastrophic-mismatch.js";

test("BB 6529 cannot publish the 17443.47 EUR unverified table against 47.02 EUR",()=>{
  const candidate={requiresCompletePrintedTable:true,expectedGross:47.02,productLines:[
    {code:"G09.00938",quantity:5001,unitCost:401,grossAmount:7911.13},
    {code:"G09.00901",quantity:5001,unitCost:1.2,grossAmount:6781.13},
    {code:"C08.00807",quantity:2,unitCost:1201,grossAmount:2713.13},
    {code:"OTHER",quantity:1,grossAmount:38.08}
  ]};
  assert.equal(catastrophicUnverifiedInvoiceMismatch(candidate),true);
  assert.equal(catastrophicUnverifiedInvoiceMismatch({...candidate,requiresCompletePrintedTable:false}),false,"other suppliers retain their present flow");
  assert.equal(catastrophicUnverifiedInvoiceMismatch({...candidate,verifiedAtOwnTotal:[{code:"VERIFIED"}]}),false,"independently verified tables retain their review path");
  assert.equal(catastrophicUnverifiedInvoiceMismatch({...candidate,reviewableProductLines:[{code:"REVIEW"}]}),false,"the bounded two-row review path remains available");
  assert.equal(catastrophicUnverifiedInvoiceMismatch({...candidate,productLines:[{grossAmount:47.02}]}),false,"a reconciled draft is unaffected");
});
