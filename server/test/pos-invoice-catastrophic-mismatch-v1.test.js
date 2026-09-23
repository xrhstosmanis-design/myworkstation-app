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
  assert.equal(catastrophicUnverifiedInvoiceMismatch({...candidate,verifiedAtOwnTotal:[{code:"VERIFIED"}]}),true,"internal row arithmetic cannot override the printed total");
  assert.equal(catastrophicUnverifiedInvoiceMismatch({...candidate,reviewableProductLines:[{code:"REVIEW"}]}),true,"two review lines cannot excuse a 17k EUR overage");
  assert.equal(catastrophicUnverifiedInvoiceMismatch({...candidate,verifiedProductLines:[{code:"VERIFIED"}]}),false,"a full table verified against the printed total remains available");
  assert.equal(catastrophicUnverifiedInvoiceMismatch({...candidate,productLines:[{grossAmount:90}]}),false,"ordinary header differences remain reviewable");
  assert.equal(catastrophicUnverifiedInvoiceMismatch({...candidate,productLines:[{grossAmount:47.02}]}),false,"a reconciled draft is unaffected");
});
