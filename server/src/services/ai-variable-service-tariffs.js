import {createHash} from 'node:crypto';
import {z} from 'zod';
import {MAX_WALLET_MICROS,walletError} from './ai-owner-wallet-contract.js';

// Provider invoice/contract costs in EUR, never the search analytics' USD
// estimates. The operator supplies an auditable pricing/conversion reference.
const price=z.object({provider:z.enum(['SERPER_GOOGLE','GOOGLE_CSE']),currency:z.literal('EUR'),
  providerUnitCostMicros:z.string().regex(/^[1-9][0-9]{0,12}$/),
  basisReference:z.string().trim().min(1).max(240),
  validFrom:z.string().datetime(),validUntil:z.string().datetime()}).strict();
export function variableServiceTariff(provider,source=process.env.AI_OWNER_WALLET_EXTERNAL_COST_TARIFFS,now=new Date()){
  let rows;try{rows=z.array(price).max(20).parse(JSON.parse(source||'[]'));}catch{throw walletError('AI_WALLET_EXTERNAL_TARIFF_REQUIRED',503);}
  const matches=rows.filter(row=>row.provider===provider);
  if(matches.length!==1)throw walletError('AI_WALLET_EXTERNAL_TARIFF_REQUIRED',503);
  const row=matches[0],base=BigInt(row.providerUnitCostMicros),time=+now;
  const charged=(base*150n+99n)/100n;
  if(!Number.isFinite(time)||time<+new Date(row.validFrom)||time>=+new Date(row.validUntil)||charged>MAX_WALLET_MICROS)throw walletError('AI_WALLET_EXTERNAL_TARIFF_REQUIRED',503);
  const tariff={...row,model:provider,billingUnit:'SUCCESSFUL_QUERY',markupBps:5000,unitMicros:String(charged)};
  return {...tariff,version:createHash('sha256').update(JSON.stringify(tariff)).digest('hex')};
}
export function externalServiceReadiness(env=process.env){
  return ['SERPER_GOOGLE','GOOGLE_CSE'].map(provider=>{try{const tariff=variableServiceTariff(provider,env.AI_OWNER_WALLET_EXTERNAL_COST_TARIFFS);return {provider,ready:true,unitMicros:tariff.unitMicros,currency:'EUR',version:tariff.version};}catch{return {provider,ready:false,code:'AI_WALLET_EXTERNAL_TARIFF_REQUIRED'};}});
}
