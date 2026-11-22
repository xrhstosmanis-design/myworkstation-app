import {z} from 'zod';
import {MAX_WALLET_MICROS,walletError} from './ai-owner-wallet-contract.js';

const fee=z.string().regex(/^(0|[1-9]\d{0,12})$/).refine(v=>BigInt(v)<=MAX_WALLET_MICROS);
export const customerPricingSchema=z.object({additionalMarkupBps:z.number().int().min(0).max(100000),callFeeMicros:fee,invoiceFeeMicros:fee}).strict();
export const DEFAULT_CUSTOMER_PRICING=Object.freeze({additionalMarkupBps:0,callFeeMicros:'0',invoiceFeeMicros:'0'});
export function parseCustomerPricing(value){
  const parsed=customerPricingSchema.safeParse(value);
  if(!parsed.success)throw walletError('AI_WALLET_PRICING_INVALID',400);
  return parsed.data;
}
export function customerCharge(baseMicros,policy,invoiceFeeClaimed=false){
  const base=BigInt(baseMicros);
  if(base<0n||base>MAX_WALLET_MICROS)throw walletError('AI_WALLET_INVALID_AMOUNT',400);
  const p=parseCustomerPricing(policy),markup=(base*BigInt(p.additionalMarkupBps)+9999n)/10000n;
  const call=BigInt(p.callFeeMicros),invoice=invoiceFeeClaimed?BigInt(p.invoiceFeeMicros):0n,total=base+markup+call+invoice;
  if(total>MAX_WALLET_MICROS)throw walletError('AI_WALLET_PRICING_LIMIT',400);
  return {baseMicros:String(base),additionalMarkupMicros:String(markup),callFeeMicros:String(call),invoiceFeeMicros:String(invoice),totalMicros:String(total)};
}
export function pricingSnapshot(policy,{version,invoiceDocumentId=null,invoiceFeeClaimed=false}={}){
  return {schemaVersion:1,policyVersion:version,...parseCustomerPricing(policy),invoiceFeeScope:'FIRST_ASSISTANT_DOCUMENT',invoiceDocumentId,invoiceFeeClaimed};
}
export function chargeFromSnapshot(baseMicros,snapshot){
  if(snapshot?.schemaVersion!==1||!Number.isSafeInteger(snapshot.policyVersion)||snapshot.policyVersion<0||typeof snapshot.invoiceFeeClaimed!=='boolean'||snapshot.invoiceFeeScope!=='FIRST_ASSISTANT_DOCUMENT'||snapshot.invoiceFeeClaimed&&!(typeof snapshot.invoiceDocumentId==='string'&&snapshot.invoiceDocumentId.length>0))throw walletError('AI_WALLET_PRICING_INVALID',409);
  return customerCharge(baseMicros,{additionalMarkupBps:snapshot.additionalMarkupBps,callFeeMicros:snapshot.callFeeMicros,invoiceFeeMicros:snapshot.invoiceFeeMicros},snapshot.invoiceFeeClaimed);
}
export function stableWalletJson(value){
  const sort=v=>Array.isArray(v)?v.map(sort):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,sort(v[k])])):v;
  return JSON.stringify(sort(value));
}
export function publicCustomerCharge(value){
  const keys=['baseMicros','additionalMarkupMicros','callFeeMicros','invoiceFeeMicros','totalMicros'];
  if(!value||keys.some(k=>typeof value[k]!=='string'||!/^(0|[1-9]\d{0,12})$/.test(value[k])||BigInt(value[k])>MAX_WALLET_MICROS))return null;
  if(keys.slice(0,4).reduce((sum,k)=>sum+BigInt(value[k]),0n)!==BigInt(value.totalMicros))return null;
  return Object.fromEntries(keys.map(k=>[k,value[k]]));
}
