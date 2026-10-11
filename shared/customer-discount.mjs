export const customerAudience=value=>["DOCTOR","NURSE","STAFF","CUSTOMER"].includes(value)?value:"CUSTOMER";
export function customerLineTotal(unitPrice,quantity,percent,existingTotal){
  const original=Math.round(Number(unitPrice)*Number(quantity)*100);
  const rate=Number(percent);
  if(!(original>0)||!Number.isFinite(rate)||rate<=0||rate>100)return existingTotal;
  const personal=Math.round(original*(10000-Math.round(rate*100))/10000)/100;
  // Keep the better existing offer/category price; never silently stack percentages.
  return Math.min(Number(existingTotal),personal);
}
export function applyCustomerDiscount(items,customer){
  if(!customer)return;
  for(const item of items){
    if(item.promotionGift||item.exchangeReturn||["WHOLESALE","MANUAL","OFFLINE_LOCKED"].includes(item.priceSource))continue;
    const before=Number(item.lineTotal),after=customerLineTotal(item.unitPrice,item.quantity,customer.discountPercent,before);
    if(after>=before)continue;
    item.discount=Math.round((Number(item.discount||0)+before-after)*100)/100;
    item.lineTotal=after;item.effectiveUnitPrice=item.quantity?Math.round(after/item.quantity*100)/100:item.unitPrice;
    item.price=item.effectiveUnitPrice;item.priceSource="CUSTOMER_DISCOUNT";
  }
}
