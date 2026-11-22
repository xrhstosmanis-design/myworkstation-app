// Missing cost must not turn into a claimed profit. A documented zero-cost
// purchase remains known; an absent/default catalog cost is counted by SQL.
export function finishBusinessPictureRow(row) {
 const missingCostLines=Number(row.missingCostLines||0);
 const known=missingCostLines===0;
 const expenseGross=Number(row.expenseGross||0),knownExpenseVat=Number(row.knownExpenseVat||0);
 const missingExpenseVatPayments=Number(row.missingExpenseVatPayments||0);
 const expenseVatComplete=missingExpenseVatPayments===0;
 // Owner reporting policy: payments without usable VAT analysis are expensed
 // in full at 0% VAT. This does not change the underlying tax documents.
 const expenses=expenseGross-knownExpenseVat;
 const expenseVat=knownExpenseVat;
 const grossProfit=known?row.salesNet-row.costValue:null;
 const estimateAvailable=!known&&row.estimatedCostValue!=null&&Number.isFinite(Number(row.estimatedCostValue))&&Number(row.unestimatedCostLines||0)===0;
 const estimatedGrossProfit=estimateAvailable?row.salesNet-Number(row.estimatedCostValue):null;
 const salesAbsNet=Number(row.salesAbsNet||0),missingSalesAbsNet=Number(row.missingSalesAbsNet||0);
 const costCoveragePercent=salesAbsNet>0?Math.max(0,Math.min(100,(1-missingSalesAbsNet/salesAbsNet)*100)):(Number(row.salesLines||0)?(1-missingCostLines/Number(row.salesLines))*100:100);
 return {...row,missingCostLines,costComplete:known,expenseGross,missingExpenseVatPayments,expenseVatComplete,expenses,expenseVat,
  estimatedGrossProfit,estimatedNetProfit:estimateAvailable?estimatedGrossProfit-expenses:null,
  estimatedMargin:estimateAvailable?(row.salesNet?estimatedGrossProfit/row.salesNet*100:0):null,
  profitEstimateBasis:estimateAvailable?'CATEGORY_KNOWN_SALES':null,costCoveragePercent,
  margin:known?(row.salesNet?grossProfit/row.salesNet*100:0):null,
  expenseVatPolicy:"DOCUMENTED_OR_ZERO",grossProfit,netProfit:known?grossProfit-expenses:null,
  purchaseSalesPercent:row.salesNet?row.purchaseNet/row.salesNet*100:0,
  expenseSalesPercent:row.salesNet?expenses/row.salesNet*100:0};
}
