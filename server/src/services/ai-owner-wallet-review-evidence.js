const stages=new Set(['PROVIDER','RESPONSE','USAGE','BOUNDS','SETTLEMENT']);
const reasons=new Set(['PROVIDER_UNAVAILABLE','PROVIDER_RESPONSE_INVALID','USAGE_INVALID','REQUEST_BOUNDS_EXCEEDED','SETTLEMENT_FAILED']);
const fields=['inputTokens','outputTokens','cachedInputTokens','cacheWriteTokens','cacheWrite30mTokens','cacheWrite12hTokens'];
const numeric=value=>Number.isSafeInteger(value)&&value>=0&&value<=1000000000;
const model=value=>typeof value==='string'&&/^[A-Za-z0-9._:-]{1,160}$/.test(value)&&!value.startsWith('sk-')?value:null;
const state=value=>value===undefined?'MISSING':value===null?'NULL':numeric(value)?'VALID':'INVALID';

// Private diagnostic audit only. Never retain prompts, output, files, request
// options, headers, arbitrary provider errors or credentials.
export function sanitizeWalletReviewEvidence(value={}){
  if(!value||typeof value!=='object'||Array.isArray(value))value={};
  const out={schemaVersion:1,stage:stages.has(value.stage)?value.stage:'PROVIDER',reason:reasons.has(value.reason)?value.reason:'PROVIDER_UNAVAILABLE',reported:{},presence:{},limits:{}};
  if(typeof value.responseId==='string'&&/^resp_[A-Za-z0-9_-]{1,195}$/.test(value.responseId))out.responseId=value.responseId;
  if(model(value.model))out.model=model(value.model);
  if(typeof value.responseOk==='boolean')out.responseOk=value.responseOk;
  if(Number.isInteger(value.httpStatus)&&value.httpStatus>=100&&value.httpStatus<=599)out.httpStatus=value.httpStatus;
  for(const key of fields){
    if(numeric(value.reported?.[key]))out.reported[key]=value.reported[key];
    if(['MISSING','NULL','VALID','INVALID'].includes(value.presence?.[key]))out.presence[key]=value.presence[key];
  }
  for(const key of ['inputTokens','outputTokens'])if(numeric(value.limits?.[key]))out.limits[key]=value.limits[key];
  if(Array.isArray(value.acceptedModels))out.acceptedModels=value.acceptedModels.slice(0,20).map(model).filter(Boolean);
  if(typeof value.tariffVersion==='string'&&/^[a-f0-9]{64}$/.test(value.tariffVersion))out.tariffVersion=value.tariffVersion;
  const policy=value.requestCacheWritePolicy;
  if(policy?.schemaVersion===1&&['UNIFORM','MIXED','UNKNOWN'].includes(policy.state)){
    out.requestCacheWritePolicy={schemaVersion:1,state:policy.state};
    if(policy.state==='UNIFORM'&&['30m','12h'].includes(policy.ttl)&&['REQUEST_DEFAULT','REQUEST_EXPLICIT'].includes(policy.source))
      Object.assign(out.requestCacheWritePolicy,{ttl:policy.ttl,source:policy.source});
  }
  return out;
}
export function walletReviewEvidence(result,{stage,reason,limits,tariff,maxOutputTokens}){
  const raw=result?.raw,u=raw?.usage,d=u?.input_tokens_details,w=d?.cache_write_tokens_details;
  const values={inputTokens:u?.input_tokens,outputTokens:u?.output_tokens,cachedInputTokens:d?.cached_tokens,cacheWriteTokens:d?.cache_write_tokens,cacheWrite30mTokens:w?.ttl_30m_tokens,cacheWrite12hTokens:w?.ttl_12h_tokens};
  return sanitizeWalletReviewEvidence({stage,reason,responseId:raw?.id,model:raw?.model,responseOk:result?.response?.ok,httpStatus:result?.response?.status,reported:values,presence:Object.fromEntries(fields.map(key=>[key,state(values[key])])),limits:{inputTokens:limits?.inputTokens??tariff.contextTokens,outputTokens:maxOutputTokens},acceptedModels:tariff.responseModels||[tariff.model],tariffVersion:tariff.version,requestCacheWritePolicy:tariff.requestCacheWritePolicy});
}

