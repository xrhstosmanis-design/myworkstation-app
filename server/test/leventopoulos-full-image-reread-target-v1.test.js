import test from "node:test";
import assert from "node:assert/strict";
import {verificationLinesForLeventopoulos} from "../src/lib/pos-complete-table-verification.js";

test("single-page Leventopoulos image verifier replaces the actual candidate rows",()=>{
  const original=[{code:"e48266",quantity:1000},{code:"e67977",quantity:10}];
  const wrappers=original.map((line,index)=>({line,index}));
  const selected=verificationLinesForLeventopoulos({pageCount:1,ruleKey:"LEVENTOPOULOS_MM_POS1_COLUMNS",completePrintedTable:true,needsEmptyCompleteTableRead:false,productLines:original,unresolved:wrappers});
  selected.splice(0,selected.length,{code:"e48266",quantity:10});
  assert.deepEqual(original,[{code:"e48266",quantity:10}]);
  assert.equal(wrappers.length,2,"the temporary unresolved wrappers do not hold the saved table");
});

test("other suppliers and multi-page reads keep their existing selection",()=>{
  const rows=[{code:"e48266"}],unresolved=[{line:rows[0],index:0}];
  for(const [pageCount,ruleKey] of [[1,"FRESH_SNACK_COMPLETE_PRINTED_TABLE"],[2,"LEVENTOPOULOS_MM_POS1_COLUMNS"]]){
    assert.equal(verificationLinesForLeventopoulos({pageCount,ruleKey,completePrintedTable:true,needsEmptyCompleteTableRead:false,productLines:rows,unresolved}),unresolved);
  }
  assert.equal(verificationLinesForLeventopoulos({pageCount:1,ruleKey:"LEVENTOPOULOS_MM_POS1_COLUMNS",completePrintedTable:false,needsEmptyCompleteTableRead:false,productLines:rows,unresolved}),unresolved);
});
