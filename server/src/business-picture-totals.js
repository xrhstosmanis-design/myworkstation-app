// Missing cost must not turn into a claimed profit. A documented zero-cost
// purchase remains known; an absent/default catalog cost is counted by SQL.
export function finishBusinessPictureRow(row) {
 const missingCostLines=Number(row.missingCostLines||0);
 const known=missingCostLines===0;
 const expenseGross=Number(row.expenseGross||0),knownExpenseVat=Number(row.knownExpenseVat||0);
 const missingExpenseVatPayments=Number(row.missingExpenseVatPayments||0);
 const expenseVatComplete=missingExpenseVatPayments===0;
 const expenses=expenseVatComplete?expenseGross-knownExpenseVat:null;
 const expenseVat=expenseVatComplete?knownExpenseVat:null;
 const grossProfit=known?row.salesNet-row.costValue:null;
 return {...row,missingCostLines,costComplete:known,expenseGross,missingExpenseVatPayments,expenseVatComplete,expenses,expenseVat,
  margin:known?(row.salesNet?grossProfit/row.salesNet*100:0):null,
  grossProfit,netProfit:known&&expenseVatComplete?grossProfit-expenses:null,
  purchaseSalesPercent:row.salesNet?row.purchaseNet/row.salesNet*100:0,
  expenseSalesPercent:expenseVatComplete?(row.salesNet?expenses/row.salesNet*100:0):null};
}
