import {createHash} from 'node:crypto';
import {z} from 'zod';

export const walletError=(code,status=409)=>Object.assign(new Error(code),{code,status});
export const MAX_WALLET_MICROS=1000000000000n;
const integer=z.number().int().nonnegative().max(1000000000);
const cacheWriteRates=z.object({ttl30m:integer,ttl12h:integer}).strict();
const rates={inputMicrosPerMillion:integer,cachedInputMicrosPerMillion:integer,outputMicrosPerMillion:integer,cacheWriteMicrosPerMillion:cacheWriteRates.optional()};
export const tariffSchema=z.object({
  model:z.string().trim().min(1).max(160),
  responseModels:z.array(z.string().trim().min(1).max(160)).min(1).max(20).optional(),
  ...rates,
  longContext:z.object({thresholdTokens:z.number().int().positive().max(10000000),...rates}).strict().optional(),
  contextTokens:z.number().int().positive().max(10000000),
  maxOutputTokens:z.number().int().positive().max(1000000)
}).strict().refine(p=>p.cachedInputMicrosPerMillion<=p.inputMicrosPerMillion&&p.maxOutputTokens<=p.contextTokens&&(!p.longContext||(
  p.longContext.thresholdTokens<p.contextTokens&&p.longContext.cachedInputMicrosPerMillion<=p.longContext.inputMicrosPerMillion&&
  Boolean(p.cacheWriteMicrosPerMillion)===Boolean(p.longContext.cacheWriteMicrosPerMillion)
)));
export function tariffFor(model,source=process.env.AI_OWNER_WALLET_TARIFFS){
  let tariffs;try{tariffs=z.array(tariffSchema).max(30).parse(JSON.parse(source||'[]'))}catch{throw walletError('AI_WALLET_TARIFF_REQUIRED',503)}
  const matches=tariffs.filter(p=>p.model===model);
  if(matches.length!==1)throw walletError('AI_WALLET_TARIFF_REQUIRED',503);
  const tariff=matches[0];
  return {...tariff,currency:'EUR',version:createHash('sha256').update(JSON.stringify(tariff)).digest('hex')};
}
const ceilMillion=n=>(n+999999n)/1000000n;
export function reserveAmount(tariff){
  const tiers=[tariff,...(tariff.longContext?[tariff.longContext]:[])];
  const inputRate=Math.max(...tiers.flatMap(t=>[t.inputMicrosPerMillion,t.cachedInputMicrosPerMillion,...Object.values(t.cacheWriteMicrosPerMillion||{})]));
  const outputRate=Math.max(...tiers.map(t=>t.outputMicrosPerMillion));
  const amount=ceilMillion(BigInt(tariff.contextTokens)*BigInt(inputRate)+BigInt(tariff.maxOutputTokens)*BigInt(outputRate));
  if(amount<=0n||amount>MAX_WALLET_MICROS)throw walletError('AI_WALLET_TARIFF_REQUIRED',503);
  return amount;
}
// Only authoritative, immutable request input counts may narrow a hold.
// The full model tariff/capacity remains unchanged for settlement and history.
export function reserveRequestAmount(tariff,{inputTokens,maxOutputTokens}){
  if(!Number.isSafeInteger(inputTokens)||inputTokens<0||inputTokens>tariff.contextTokens||
    !Number.isSafeInteger(maxOutputTokens)||maxOutputTokens<1||maxOutputTokens>tariff.maxOutputTokens)throw walletError('AI_WALLET_INPUT_COUNT_REQUIRED',409);
  const tier=tariff.longContext&&inputTokens>tariff.longContext.thresholdTokens?tariff.longContext:tariff;
  const inputRate=Math.max(tier.inputMicrosPerMillion,tier.cachedInputMicrosPerMillion,...Object.values(tier.cacheWriteMicrosPerMillion||{}));
  const amount=ceilMillion(BigInt(inputTokens)*BigInt(inputRate)+BigInt(maxOutputTokens)*BigInt(tier.outputMicrosPerMillion));
  if(amount<=0n||amount>MAX_WALLET_MICROS)throw walletError('AI_WALLET_TARIFF_REQUIRED',503);
  return amount;
}
export function meteredUsage(raw,tariff){
  const u=raw?.usage,d=u?.input_tokens_details,input=u?.input_tokens,output=u?.output_tokens,cached=d?.cached_tokens??0;
  const writes=d?.cache_write_tokens===undefined&&!tariff.cacheWriteMicrosPerMillion?0:d?.cache_write_tokens;
  if(![input,output,cached,writes].every(n=>Number.isSafeInteger(n)&&n>=0)||cached+writes>input||input>tariff.contextTokens||output>tariff.maxOutputTokens||typeof raw?.id!=='string'||!raw.id||raw.id.length>200||!(tariff.responseModels||[tariff.model]).includes(raw.model))throw walletError('AI_WALLET_USAGE_REVIEW',503);
  const details=d?.cache_write_tokens_details,requiresWrites=Boolean(tariff.cacheWriteMicrosPerMillion);
  if(requiresWrites&&!Number.isSafeInteger(d?.cached_tokens))throw walletError('AI_WALLET_USAGE_REVIEW',503);
  let short=0,long=0;
  // A provider-reported zero total proves both nonnegative lifetime buckets
  // are zero. An omitted breakdown is then valid; any supplied breakdown is
  // still checked, and positive/unknown writes never receive guessed counts.
  if(writes>0||details!==undefined){
    short=details?.ttl_30m_tokens;long=details?.ttl_12h_tokens;
    if(![short,long].every(n=>Number.isSafeInteger(n)&&n>=0)||short+long!==writes)throw walletError('AI_WALLET_USAGE_REVIEW',503);
  }
  if(writes&&!requiresWrites)throw walletError('AI_WALLET_USAGE_REVIEW',503);
  const extended=Boolean(tariff.longContext&&input>tariff.longContext.thresholdTokens),price=extended?tariff.longContext:tariff;
  // Cache writes replace ordinary input pricing; never add both for one token.
  const amount=ceilMillion(BigInt(input-cached-writes)*BigInt(price.inputMicrosPerMillion)+BigInt(cached)*BigInt(price.cachedInputMicrosPerMillion)+BigInt(output)*BigInt(price.outputMicrosPerMillion)+
    BigInt(short)*BigInt(price.cacheWriteMicrosPerMillion?.ttl30m||0)+BigInt(long)*BigInt(price.cacheWriteMicrosPerMillion?.ttl12h||0));
  return {amount,usage:{providerResponseId:raw.id,model:raw.model,inputTokens:input,cachedInputTokens:cached,outputTokens:output,
    ...(requiresWrites?{cacheWriteTokens:writes,cacheWrite30mTokens:short,cacheWrite12hTokens:long}:{}),...(tariff.longContext?{pricingTier:extended?'LONG_CONTEXT':'STANDARD'}:{})}};
}
export function positiveMicros(value){
  if(typeof value!=='string'||!/^\d{1,13}$/.test(value))throw walletError('AI_WALLET_INVALID_AMOUNT',400);
  const amount=BigInt(value);if(amount<=0n||amount>MAX_WALLET_MICROS)throw walletError('AI_WALLET_INVALID_AMOUNT',400);return amount;
}
export const walletView=row=>({companyId:row.companyId,currency:'EUR',enabled:row.enabled,emailEnabled:row.emailEnabled,notificationOwnerId:row.notificationOwnerId||'',balanceMicros:String(row.balanceMicros),reservedMicros:String(row.reservedMicros),availableMicros:String(BigInt(row.balanceMicros)-BigInt(row.reservedMicros)),lastCreditMicros:String(row.lastCreditMicros),version:row.version,state:BigInt(row.balanceMicros)===0n?'EMPTY':BigInt(row.balanceMicros)<=BigInt(row.lastCreditMicros)/5n?'LOW':'OK'});

