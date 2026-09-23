import test from "node:test";
import assert from "node:assert/strict";
import {capturePosInvoiceProviderRows,preservePosInvoiceReadingEvidence} from "../src/lib/pos-invoice-reading-evidence.js";

const profile={requireCompletePrintedTableOnMismatch:true};

test("a complete-table reread retains both real candidate rows without copying invoice economics into future readings",()=>{
  const previous={posHandoff:{totalGross:47.02},productLines:[{code:"G09.00938",rawText:"5,001 1,401 0,001 7,001",quantity:5001,unitCost:401,netAmount:7001,grossAmount:7911.13}]};
  const next={supplierReadingProfile:profile,productLines:[{code:"G09.00938",rawText:"5,00 1,40 0,00 7,00",quantity:5,unitCost:1.4,netAmount:7,grossAmount:7.91,sourceColumnsVerified:true}]};
  const provider=capturePosInvoiceProviderRows(previous);
  previous.productLines[0].quantity=5002;
  const first=preservePosInvoiceReadingEvidence(previous,next,provider);
  assert.equal(first.original.lines[0].quantity,5002);
  assert.equal(first.reread.lines[0].quantity,5);
  assert.equal(first.provider.lines[0].quantity,5001,"the provider snapshot precedes in-place recovery");
  assert.equal(first.original.lines[0].rawText,"5,001 1,401 0,001 7,001");
  const later=preservePosInvoiceReadingEvidence({...previous,posReadingEvidence:first,productLines:next.productLines},{...next,productLines:[]});
  assert.equal(later.original.lines[0].quantity,5002);
  assert.equal(later.reread.lineCount,0);
  assert.equal(previous.productLines[0].quantity,5002);
});

test("the evidence stays bounded and cannot leak a supplier's rows to another invoice flow",()=>{
  const previous={posHandoff:{},productLines:Array.from({length:110},(_,i)=>({code:`${i}`,rawText:"x".repeat(900),quantity:1}))};
  const next={supplierReadingProfile:profile,productLines:[]};
  const result=preservePosInvoiceReadingEvidence(previous,next);
  assert.equal(result.original.lines.length,100);
  assert.equal(result.original.lines[0].rawText.length,320);
  assert.equal(result.original.truncated,true);
  assert.equal(preservePosInvoiceReadingEvidence({...previous,posHandoff:null},next),null);
  assert.equal(preservePosInvoiceReadingEvidence(previous,{...next,supplierReadingProfile:{requireCompletePrintedTableOnMismatch:false}}),null);
});
