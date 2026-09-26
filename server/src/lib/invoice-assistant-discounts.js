// PurchaseOrderLine stores percentage discounts and calculates without the
// supplier's per-line cent rounding. Keep the printed percentage in slot two;
// slot one represents the effective fixed deduction for that printed net.
export function invoiceAssistantDiscounts({quantity,unitCost,unitDiscountAmount,printedDiscounts,netAmount}){
  const discounts=unitDiscountAmount>0?[unitDiscountAmount/unitCost*100,printedDiscounts[0],printedDiscounts[1]]:[...printedDiscounts];
  if(!(unitDiscountAmount>0))return discounts;
  const factor=(1-discounts[1]/100)*(1-discounts[2]/100);
  const calculated=quantity*unitCost*(1-discounts[0]/100)*factor;
  if(!Number.isFinite(calculated)||!Number.isFinite(netAmount)||Math.abs(calculated-netAmount)>0.05||!(factor>0))return discounts;
  const effective=100*(1-netAmount/(quantity*unitCost*factor));
  if(Number.isFinite(effective)&&effective>=0&&effective<100)discounts[0]=effective;
  return discounts;
}
