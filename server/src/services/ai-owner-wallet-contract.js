import {createHash} from 'node:crypto';
import {z} from 'zod';

export const walletError=(code,status=409)=>Object.assign(new Error(code),{code,status});
export const MAX_WALLET_MICROS=1000000000000n;
const integer=z.number().int().nonnegative().max(1000000000);
export const tariffSchema=z.object({
  model:z.string().trim().min(1).max(160),
  inputMicrosPerMillion:integer,cachedInputMicrosPerMillion:integer,outputMicrosPerMillion:integer,
  contextTokens:z.number().int().positive().max(10000000),
  maxOutputTokens:z.number().int().positive().max(1000000)
}).strict().refine(p=>p.cachedInputMicrosPerMillion<=p.inputMicrosPerMillion&&p.maxOutputTokens<=p.contextTokens);
export function tariffFor(model,source=process.env.AI_OWNER_WALLET_TARIFFS){
  let tariffs;try{tariffs=z.array(tariffSchema).max(30).parse(JSON.parse(source||'[]'))}catch{throw walletError('AI_WALLET_TARIFF_REQUIRED',503)}
  const matches=tariffs.filter(p=>p.model===model);
  if(matches.length!==1)throw walletError('AI_WALLET_TARIFF_REQUIRED',503);
  const tariff=matches[0];
  return {...tariff,currency:'EUR',version:createHash('sha256').update(JSON.stringify(tariff)).digest('hex')};
}
const ceilMillion=n=>(n+999999n)/1000000n;
export function reserveAmount(tariff){
  const amount=ceilMillion(BigInt(tariff.contextTokens)*BigInt(tariff.inputMicrosPerMillion)+BigInt(tariff.maxOutputTokens)*BigInt(tariff.outputMicrosPerMillion));
  if(amount<=0n||amount>MAX_WALLET_MICROS)throw walletError('AI_WALLET_TARIFF_REQUIRED',503);
  return amount;
}
export function meteredUsage(raw,tariff){
  const u=raw?.usage,input=u?.input_tokens,output=u?.output_tokens,cached=u?.input_tokens_details?.cached_tokens??0;
  if(![input,output,cached].every(n=>Number.isSafeInteger(n)&&n>=0)||cached>input||input>tariff.contextTokens||output>tariff.maxOutputTokens||typeof raw?.id!=='string'||!raw.id||raw.id.length>200||raw.model!==tariff.model)throw walletError('AI_WALLET_USAGE_REVIEW',503);
  const amount=ceilMillion(BigInt(input-cached)*BigInt(tariff.inputMicrosPerMillion)+BigInt(cached)*BigInt(tariff.cachedInputMicrosPerMillion)+BigInt(output)*BigInt(tariff.outputMicrosPerMillion));
  return {amount,usage:{providerResponseId:raw.id,model:raw.model,inputTokens:input,cachedInputTokens:cached,outputTokens:output}};
}
export function positiveMicros(value){
  if(typeof value!=='string'||!/^\d{1,13}$/.test(value))throw walletError('AI_WALLET_INVALID_AMOUNT',400);
  const amount=BigInt(value);if(amount<=0n||amount>MAX_WALLET_MICROS)throw walletError('AI_WALLET_INVALID_AMOUNT',400);return amount;
}
export const walletView=row=>({companyId:row.companyId,currency:'EUR',enabled:row.enabled,emailEnabled:row.emailEnabled,notificationOwnerId:row.notificationOwnerId||'',balanceMicros:String(row.balanceMicros),reservedMicros:String(row.reservedMicros),availableMicros:String(BigInt(row.balanceMicros)-BigInt(row.reservedMicros)),lastCreditMicros:String(row.lastCreditMicros),version:row.version,state:BigInt(row.balanceMicros)===0n?'EMPTY':BigInt(row.balanceMicros)<=BigInt(row.lastCreditMicros)/5n?'LOW':'OK'});
