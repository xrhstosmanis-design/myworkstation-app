const numeric=value=>Number(String(value??"").replace(",","."));
export const printedRoundingFields=["quantity","unitCost","discount1","discount2","discount3","exciseTotal","vatRate"];

// A displayed two-decimal price may hide at most half a cent per unit.
// This is a per-row precision bound, never a tolerance on an invoice total.
export function invoicePrintedRounding(line){
  const required=[...printedRoundingFields,"netAmount"];
  if(required.some(key=>String(line[key]??"").trim()===""||!Number.isFinite(numeric(line[key]))))return null;
  const quantity=numeric(line.quantity),price=numeric(line.unitCost),printedNet=numeric(line.netAmount);
  const discounts=[line.discount1,line.discount2,line.discount3].map(numeric);
  if(quantity<=0||price<0||printedNet<0||discounts.some(value=>value< -100||value>=100)||Math.abs(price*100-Math.round(price*100))>1e-7)return null;
  const factor=discounts.reduce((product,value)=>product*(1-value/100),1);
  const calculatedNet=quantity*price*factor,difference=printedNet-calculatedNet;
  if(Math.abs(difference)>quantity*.005*factor+.005+1e-8)return null;
  return {net:printedNet,calculatedNet,difference};
}
