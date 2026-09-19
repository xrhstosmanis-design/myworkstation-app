// Fresh Snack receipts use a dense thermal-print layout.  The rule deliberately
// stores no historical item economics: a result may be accepted only after a
// fresh, complete visual reread of every printed row and the VAT footer.
export const FRESH_SNACK_PROFILE={
  supplierName:'FRESH SNACK AE',
  supplierTaxId:'099162880',
  ruleKey:'FRESH_SNACK_COMPLETE_PRINTED_TABLE',
  central:true,
  source:'LAB_21_TLA_006019_LAYOUT_VERIFIED_FOR_SAFE_RECHECK',
  readingRule:{
    requireCompletePrintedTableOnMismatch:true,
    defaultUnit:'TEM',
    acceptance:'CURRENT_IMAGE_ROWS_PLUS_VAT_FOOTER_PLUS_TOTAL'
  }
};
