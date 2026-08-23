// Manually verified from Premium Bakery Foods invoice 178878 (19/08/2026).
// Supplier VAT is intentionally left unset until verified with certainty.
export const PREMIUM_BAKERY_PROFILE={
  supplierName:'ΠΡΟΤΥΠΑ ΠΡΟΪΟΝΤΑ ΑΡΤΟΠΟΙΙΑΣ Α.Ε.',
  supplierTaxId:'',
  ruleKey:'PREMIUM_BAKERY_FOODS',
  central:true,
  source:'MANUAL_VERIFIED_INVOICE_LEARNING',
  barcodePolicy:'PENDING_UNTIL_VERIFIED_OR_MASTER_MATCH',
  invoiceExample:{number:'178878',date:'19/08/2026',netBeforeDiscount:168.22,totalDiscount:50.46,netAmount:117.76,vatAmount:15.31,grossAmount:133.07},
  mappings:{
    '1001-2':{supplierItemCode:'1001-2',description:'ΤΥΡΟΠΙΤΑ ΚΟΥΡΟΥ 160G ΒΟΥΤ(ΚΤΨ)',invoiceUnit:'ΤΜΧ',stockUnit:'ΤΜΧ',quantityExample:100,unitPrice:0.947103,discount1:30,discountAmountExample:28.41,netAmountExample:66.30,vatRate:13,barcode:'',barcodeType:'BARCODE_PENDING',verified:true},
    '1850-2':{supplierItemCode:'1850-2',description:'ΖΥΜΩΤΗ ΜΕ ΓΡΑΒΙΕΡΑ 180G(ΚΤΨ)',invoiceUnit:'ΤΜΧ',stockUnit:'ΤΜΧ',quantityExample:30,unitPrice:0.953303,discount1:30,discountAmountExample:8.58,netAmountExample:20.02,vatRate:13,barcode:'',barcodeType:'BARCODE_PENDING',verified:true},
    '1850-1':{supplierItemCode:'1850-1',description:'ΖΥΜΩΤΗ ΜΕ ΧΩΡΙΑΤΙΚΟ ΛΟΥΚΑΝΙΚΟ 190G(ΚΤΨ)',invoiceUnit:'ΤΜΧ',stockUnit:'ΤΜΧ',quantityExample:40,unitPrice:1.122703,discount1:30,discountAmountExample:13.47,netAmountExample:31.44,vatRate:13,barcode:'',barcodeType:'BARCODE_PENDING',verified:true}
  }
};
