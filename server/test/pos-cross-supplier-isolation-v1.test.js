import test from "node:test";
import assert from "node:assert/strict";
import {applyTalosVerifiedPrintedRows} from "../src/routes/platform-invoice-learning-ai.js";
import {verificationLinesForLeventopoulos} from "../src/lib/pos-complete-table-verification.js";

// These rows exercise the supplier boundary. Full invoice arithmetic and physical
// row counts are covered by the supplier-specific invoice regression tests.
const otherSuppliers=[
  {name:"ΛΕΒΕΝΤΟΠΟΥΛΟΣ",taxId:"800503361",ruleKey:"LEVENTOPOULOS_MM_POS1_COLUMNS",line:{code:"e48266",quantity:10,unitPrice:2.8,netAmount:28}},
  {name:"MANTZILAS",taxId:"",ruleKey:"MANTZILAS_COMPLETE_PRINTED_TABLE",line:{code:"00009",quantity:24,unitPrice:1,netAmount:13.49}},
  {name:"DELTA",taxId:"",ruleKey:"DELTA_COMPLETE_PRINTED_TABLE",line:{code:"720547",quantity:2,unitPrice:1.74,netAmount:3.13}},
  {name:"FRESH SNACK",taxId:"",ruleKey:"FRESH_SNACK_COMPLETE_PRINTED_TABLE",line:{code:"101",quantity:6,unitPrice:2.1,netAmount:11.91}},
];

test("TALOS quantity learning cannot rewrite rows of four other suppliers",()=>{
  for(const supplier of otherSuppliers){
    // A TALOS-shaped suffix is deliberately present: the identity boundary,
    // rather than a convenient difference in OCR text, must protect the row.
    const line={...supplier.line,azureRawRow:`${supplier.line.code} PRODUCT TEM 6,00 1.02 6.12 18.40 12.00 1.73 4.39 13`};
    const input={supplier:{name:supplier.name,taxId:supplier.taxId},productLines:[line]};
    const output=applyTalosVerifiedPrintedRows(input);
    assert.deepEqual(output.productLines,[line],supplier.name);
  }
});

test("Leventopoulos single-page reread cannot replace another supplier's table",()=>{
  for(const supplier of otherSuppliers.slice(1)){
    const productLines=[supplier.line],unresolved=[{line:supplier.line,index:0}];
    assert.strictEqual(verificationLinesForLeventopoulos({pageCount:1,ruleKey:supplier.ruleKey,completePrintedTable:true,needsEmptyCompleteTableRead:false,productLines,unresolved}),unresolved,supplier.name);
  }
});
