// Missing cost must not turn into a claimed profit. A documented zero-cost
// purchase remains known; an absent/default catalog cost is counted by SQL.
export function finishBusinessPictureRow(row) {
 const missingCostLines=Number(row.missingCostLines||0);
 const known=missingCostLines===0;
 const grossProfit=known?row.salesNet-row.costValue:null;
 return {...row,missingCostLines,costComplete:known,
  margin:known?(row.salesNet?grossProfit/row.salesNet*100:0):null,
  grossProfit,netProfit:known?grossProfit-row.expenses:null,
  purchaseSalesPercent:row.salesNet?row.purchaseNet/row.salesNet*100:0,
  expenseSalesPercent:row.salesNet?Math.max(0,row.expenses-row.expenseVat)/row.salesNet*100:0};
}
