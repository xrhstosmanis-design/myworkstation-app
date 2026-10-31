export function pricingDecimal(input,decimals,max){
  const value=String(input??'').trim().replace(',','.');
  if(!new RegExp('^\\d{1,7}(\\.\\d{1,'+decimals+'})?$').test(value))throw new Error('Γράψε μη αρνητικό ποσό με έως '+decimals+' δεκαδικά.');
  const [whole,part='']=value.split('.'),scaled=BigInt(whole)*10n**BigInt(decimals)+BigInt(part.padEnd(decimals,'0'));
  if(scaled>max)throw new Error('Η τιμή ξεπερνά το επιτρεπόμενο όριο.');
  return scaled;
}
export function pricingPolicy({percentage,callFee,invoiceFee}){
  return {additionalMarkupBps:Number(pricingDecimal(percentage,2,100000n)),callFeeMicros:String(pricingDecimal(callFee,6,1000000000000n)),invoiceFeeMicros:String(pricingDecimal(invoiceFee,6,1000000000000n))};
}
export function pricingDecimalText(value,decimals){
  const amount=BigInt(value??0),scale=10n**BigInt(decimals),part=String(amount%scale).padStart(decimals,'0').replace(/0+$/,'');
  return String(amount/scale)+(part?','+part:'');
}
