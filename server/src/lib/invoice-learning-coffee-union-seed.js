// Manually verified from Coffee Union invoice TDA0009902 (20/08/2026).
// This data is consumed only by the invoice-reading/automatic-entry module.
export const COFFEE_UNION_PROFILE={
 supplierName:'COFFEE UNION ATTICA E.E.',supplierTaxId:'803142360',ruleKey:'COFFEE_UNION',central:true,source:'MANUAL_VERIFIED_INVOICE_LEARNING',
 mappings:{
  ES01000:{supplierItemCode:'ES01000',description:'MRS ROSE ESPRESSO 3KGR CLASSIC TIN',invoiceUnit:'ΚΙΛΟ',stockUnit:'GR',quantityExample:27,unitPrice:36.20,discount1:34.25,netAmountExample:642.64,vatRate:13,stockConversion:{from:'KG',to:'GR',factor:1000},masterTarget:{type:'INGREDIENT',group:'ΚΑΦΕΣ ΣΕ ΚΟΚΚΟΥΣ',key:'MRS_ROSE_ESPRESSO'},verified:true},
  ES16002:{supplierItemCode:'ES16002',description:'IL MODO ESPRESSO DECAF AKOΠΕ 1kg',invoiceUnit:'ΚΙΛΟ',stockUnit:'GR',quantityExample:2,unitPrice:35.70,discount1:34,netAmountExample:47.12,vatRate:13,stockConversion:{from:'KG',to:'GR',factor:1000},masterTarget:{type:'INGREDIENT',group:'ΚΑΦΕΣ ΣΕ ΚΟΚΚΟΥΣ',key:'IL_MODO_DECAF'},verified:true},
  DEL005:{supplierItemCode:'DEL005',description:'DELIZ PREMIUM ΡΟΦΗΜΑ ΣΟΚΟΛΑΤΑΣ 1KGR',invoiceUnit:'ΚΙΛΟ',stockUnit:'GR',quantityExample:1,unitPrice:13.50,discount1:25,netAmountExample:10.13,vatRate:13,stockConversion:{from:'KG',to:'GR',factor:1000},masterTarget:{type:'INGREDIENT',group:'ΣΟΚΟΛΑΤΑ / ΣΚΟΝΗ ΡΟΦΗΜΑΤΟΣ',key:'DELIZ_PREMIUM_CHOCOLATE'},verified:true},
  FR1500:{supplierItemCode:'FR1500',description:'MRS ROSE ΠΟΤΗΡΙ ΠΛΑΣΤΙΚΟ 12OZ (100 ΤΕΜ)',invoiceUnit:'ΠΑΚΕΤΟ',stockUnit:'ΤΜΧ',quantityExample:48,unitPrice:5.30,discount1:15,netAmountExample:216.24,vatRate:24,stockConversion:{from:'PACKAGE',to:'PCS',factor:100},masterTarget:{type:'CONSUMABLE',group:'ΠΟΤΗΡΙΑ',key:'PLASTIC_CUP_12OZ'},verified:true}
 },
 costing:{enabled:true,method:'NET_PURCHASE_COST_PER_STOCK_UNIT',recipeConsumption:true}
};
