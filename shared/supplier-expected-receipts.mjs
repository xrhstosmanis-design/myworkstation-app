export function expectedReceiptAction(method,path){
  if(method==='GET'&&['/api/commerce/order-suggestions','/api/commerce/order-suggestions/by-supplier','/api/commerce/expected-receipts','/api/commerce/expected-receipts/candidates'].includes(path))return 'read';
  if(method==='POST'&&path==='/api/commerce/expected-receipts')return 'confirm';
  if(method==='POST'&&/^\/api\/commerce\/expected-receipts\/[^/]+\/link$/.test(path))return 'link';
  if(method==='POST'&&/^\/api\/commerce\/expected-receipts\/[^/]+\/cancel-remaining$/.test(path))return 'cancel';
  return null;
}
export const expectedReceiptFields=Object.freeze({
  confirm:['intentActorId','intentCompanyId','storeId','productId','supplierId','invoiceQuantity','invoiceUnit','stockUnitsPerInvoiceUnit','idempotencyKey'],
  link:['intentActorId','intentCompanyId','storeId','version','orderId','sourceDigest','quantity','idempotencyKey'],
  cancel:['intentActorId','intentCompanyId','storeId','version','reason','idempotencyKey']
});

// Both inputs have at most six fractional places. BigInt preserves all twelve.
export function expectedReceiptProduct(quantity,factor){
  const parse=value=>{
    if(!/^\d{1,9}(?:\.\d{1,6})?$/.test(String(value)))return null;
    const [whole,fraction='']=String(value).split('.');
    return BigInt(whole)*1000000n+BigInt(fraction.padEnd(6,'0'));
  };
  const a=parse(quantity),b=parse(factor);
  if(a===null||b===null)return null;
  const result=(a*b).toString().padStart(13,'0');
  return (result.slice(0,-12)+'.'+result.slice(-12)).replace(/\.?0+$/,'');
}
