// Match the POS checkout's audience discount rounding: first round the original
// line to cents, then round its discounted value up to the next ten cents.
export function audienceLineTotal(unitPrice,quantity,discountPercent=0){
  const before=Number((Number(unitPrice||0)*Number(quantity||0)).toFixed(2));
  const percent=Number(discountPercent||0);
  if(!(percent>0)||before<=0)return before;
  return Math.ceil((before*(1-percent/100)-Number.EPSILON)*10)/10;
}
