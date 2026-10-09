import crypto from "node:crypto";

export const CREDIT_DEFAULTS = Object.freeze({warningUsd:5,criticalUsd:2,version:0});
const CACHE_MS=5*60_000,BASELINE_MAX_AGE_MS=7*24*60*60_000;
export const creditKeyIdentity=key=>crypto.createHash("sha256").update(key).digest("hex");
const problem=(code,status=503)=>Object.assign(new Error(code),{code,status});
const finite=value=>typeof value==="number"&&Number.isFinite(value);

// Costs are billed organization spend, never a prepaid-balance endpoint. No project filter:
// a shared billing account must include spend from every app using that account.
export async function readOrganizationCosts({key,startTime,endTime,fetchImpl=fetch}){
  if(!key)throw problem("BILLING_NOT_CONFIGURED");
  const signal=AbortSignal.timeout(20_000),seen=new Set();
  let page,total=0;
  for(let index=0;index<20;index++){
    const query=new URLSearchParams({start_time:String(startTime),end_time:String(endTime),bucket_width:"1d",limit:"180"});
    if(page)query.set("page",page);
    let response;
    try{response=await fetchImpl(`https://api.openai.com/v1/organization/costs?${query}`,{headers:{Authorization:`Bearer ${key}`},signal,redirect:"error"})}
    catch{throw problem("BILLING_UNAVAILABLE")}
    if(!response.ok)throw problem(response.status===401||response.status===403?"BILLING_ACCESS_DENIED":"BILLING_UNAVAILABLE");
    let raw;try{raw=await response.json()}catch{throw problem("BILLING_INVALID_RESPONSE")}
    if(!Array.isArray(raw.data)||typeof raw.has_more!=="boolean")throw problem("BILLING_INVALID_RESPONSE");
    for(const bucket of raw.data){
      if(!Array.isArray(bucket.results))throw problem("BILLING_INVALID_RESPONSE");
      for(const row of bucket.results){
        if(row.object!=="organization.costs.result"||row.amount?.currency!=="usd"||!finite(row.amount?.value))throw problem("BILLING_INVALID_RESPONSE");
        total+=row.amount.value;
      }
    }
    if(!finite(total)||total<0)throw problem("BILLING_INVALID_RESPONSE");
    if(!raw.has_more)return total;
    if(typeof raw.next_page!=="string"||!raw.next_page||seen.has(raw.next_page))throw problem("BILLING_INVALID_RESPONSE");
    page=raw.next_page;seen.add(page);
  }
  throw problem("BILLING_INCOMPLETE");
}

export function creditSummary(settings,costs,{now=Date.now(),keyIdentity}={}){
  const base={...CREDIT_DEFAULTS,...settings};
  const result={warningUsd:base.warningUsd,criticalUsd:base.criticalUsd,version:base.version,
    baselineAt:base.baselineAt||null,checkedAt:costs?.checkedAt||null,estimated:true,currency:"USD",balanceUsd:null,state:"UNKNOWN",code:"BASELINE_REQUIRED"};
  if(!keyIdentity)return {...result,code:"BILLING_NOT_CONFIGURED"};
  if(!base.baselineAt)return result;
  if(base.keyIdentity!==keyIdentity)return {...result,code:"BILLING_ACCOUNT_CHANGED"};
  const baselineAge=now-Date.parse(base.baselineAt);
  if(!Number.isFinite(baselineAge)||baselineAge<0||baselineAge>BASELINE_MAX_AGE_MS)return {...result,code:"BASELINE_STALE"};
  if(costs?.error)return {...result,code:costs.error};
  const age=now-Date.parse(costs?.checkedAt||"");
  if(!costs||!Number.isFinite(age)||age<0||age>CACHE_MS)return {...result,code:"BILLING_STALE"};
  if(!finite(base.balanceUsd)||!finite(base.baselineCostUsd)||!finite(costs.totalUsd)||costs.totalUsd<base.baselineCostUsd)return {...result,code:"BILLING_REVISED"};
  const balanceUsd=Math.round((base.balanceUsd-(costs.totalUsd-base.baselineCostUsd))*1e6)/1e6;
  const state=balanceUsd<=0?"EXHAUSTED":balanceUsd<=base.criticalUsd?"CRITICAL":balanceUsd<=base.warningUsd?"WARNING":"OK";
  return {...result,balanceUsd,state,code:"ESTIMATED_BALANCE"};
}

export function createCreditMonitor({repository,getKey=()=>process.env.OPENAI_BILLING_ADMIN_KEY||"",now=Date.now,fetchImpl=fetch}){
  let cached=null,pending=null;
  const costs=async(startTime)=>{
    const key=getKey(),identity=key?creditKeyIdentity(key):"",cacheId=`${identity}:${startTime}`;
    if(cached?.cacheId===cacheId&&now()-cached.time<CACHE_MS)return cached.value;
    if(pending?.cacheId===cacheId)return pending.promise;
    const promise=(async()=>{
      let value;try{
        const totalUsd=await readOrganizationCosts({key,startTime,endTime:Math.floor(now()/1000)+1,fetchImpl});
        value={totalUsd,checkedAt:new Date(now()).toISOString()};
      }catch(error){value={error:error.code||"BILLING_UNAVAILABLE",checkedAt:null}}
      cached={cacheId,time:now(),value};return value;
    })();
    pending={cacheId,promise};
    try{return await promise}finally{if(pending?.promise===promise)pending=null}
  };
  const status=async()=>{
    const settings=await repository.read(),key=getKey(),keyIdentity=key?creditKeyIdentity(key):"";
    const preliminary=creditSummary(settings,null,{now:now(),keyIdentity});
    if(preliminary.code!=="BILLING_STALE")return preliminary;
    return creditSummary(settings,await costs(settings.startTime),{now:now(),keyIdentity});
  };
  const save=async({warningUsd,criticalUsd,version,balanceUsd,accountConfirmed},actor)=>{
    if(!finite(warningUsd)||warningUsd<=0||warningUsd>100_000||!finite(criticalUsd)||criticalUsd<0||criticalUsd>=warningUsd||!Number.isInteger(version)||version<0)throw problem("INVALID_CREDIT_SETTINGS",400);
    const current=await repository.read();
    if(current.version!==version)throw problem("CREDIT_SETTINGS_CONFLICT",409);
    let next={...current,warningUsd,criticalUsd};
    if(balanceUsd!==undefined){
      if(!finite(balanceUsd)||balanceUsd< -100_000||balanceUsd>1_000_000||accountConfirmed!==true)throw problem("INVALID_CREDIT_BASELINE",400);
      const key=getKey();if(!key)throw problem("BILLING_NOT_CONFIGURED");
      const startTime=Math.floor(now()/86400_000)*86400;
      // Bypass cached cost for a new balance observation; do not double-count today's spend.
      const baselineCostUsd=await readOrganizationCosts({key,startTime,endTime:Math.floor(now()/1000)+1,fetchImpl});
      next={...next,balanceUsd,baselineCostUsd,startTime,keyIdentity:creditKeyIdentity(key),baselineAt:new Date(now()).toISOString()};
    }
    await repository.save(next,version,actor);
    cached=null;
    return status();
  };
  return {status,save};
}
