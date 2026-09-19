// Fresh Delicacies prints a compact single-line table.  On a reconciliation
// mismatch, do not retain partial/merged OCR rows: accept only a fresh visual
// reread of every printed row, the VAT footer and the final total.
// This profile intentionally contains no historical quantities or prices.
export const FRESH_DELICACIES_PROFILE={
  supplierName:'FRESH DELICACIES ΠΑΡΑΣΚΕΥΗ ΚΑΙ ΔΙΑΘΕΣΗ ΤΡΟΦΙΜΩΝ ΙΔΙΩΤΙΚΗ ΚΕΦΑΛΑΙΟΥΧΙΚΗ ΕΤΑΙΡΕΙΑ',
  supplierTaxId:'',
  ruleKey:'FRESH_DELICACIES_COMPLETE_PRINTED_TABLE',
  central:true,
  source:'LAB_BB_6439_SAFE_RECONCILIATION_RULE',
  readingRule:{
    requireCompletePrintedTableOnMismatch:true,
    defaultUnit:'TEM',
    acceptance:'CURRENT_IMAGE_ROWS_PLUS_VAT_FOOTER_PLUS_TOTAL'
  }
};
