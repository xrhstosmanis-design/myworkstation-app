import {performance} from 'node:perf_hooks';
import {setTimeout as delay} from 'node:timers/promises';

const localHosts=new Set(['localhost','127.0.0.1','[::1]']);
export const stages=[{stores:20,pos:22},{stores:50,pos:55},{stores:100,pos:110}];

// Check before opening a client, creating fixtures, or making any HTTP request.
export function isolatedDestination(env){
  if(env.NODE_ENV!=='test'||env.MWS_CAPACITY_ISOLATED!=='1')throw new Error('Explicit isolated test mode required');
  let app,db;
  try{app=new URL(env.E2E_BASE_URL||'http://127.0.0.1:8080');db=new URL(env.DATABASE_URL)}catch{throw new Error('Invalid isolated destination')}
  if(app.protocol!=='http:'||!localHosts.has(app.hostname)||app.username||app.password||app.pathname!=='/'||app.search||app.hash)throw new Error('Only a loopback HTTP origin is allowed');
  const database=decodeURIComponent(db.pathname.slice(1));
  if(!['postgres:','postgresql:'].includes(db.protocol)||!localHosts.has(db.hostname)||!/^myworkstation(?:_[a-z0-9]+)*_test$/.test(database)||db.hash)throw new Error('Only a dedicated loopback test database is allowed');
  for(const key of db.searchParams.keys())if(!['connection_limit','pool_timeout','schema','application_name'].includes(key))throw new Error('Unsupported database option in isolated test');
  if(db.searchParams.has('schema')&&db.searchParams.get('schema')!=='public')throw new Error('Only the isolated public fixture schema is allowed');
  return {base:app.origin,database,host:db.hostname,port:db.port||'5432'};
}

export function cohort(actors,storeCount){
  if(!stages.some(s=>s.stores===storeCount))throw new Error('Unsupported store stage');
  const result=actors.filter(a=>a.storeIndex<storeCount&&(a.terminalIndex===0||a.storeIndex<storeCount/10));
  if(result.length!==stages.find(s=>s.stores===storeCount).pos)throw new Error('Incorrect active terminal fixture');
  return result;
}

const hash=value=>{let h=2166136261;for(const c of String(value))h=Math.imul(h^c.charCodeAt(0),16777619);return h>>>0};
export function scheduleActions(actors,specs,durationMs,{seed='capacity',burst=false}={}){
  if(!Number.isFinite(durationMs)||durationMs<=0||durationMs>3*60*60*1000)throw new Error('Invalid stage duration');
  const events=[];
  for(const actor of actors)for(const spec of specs){
    if(!Number.isFinite(spec.perMinute)||spec.perMinute<=0)throw new Error('Invalid offered rate');
    const interval=60000/spec.perMinute;
    const phase=burst?0:hash(`${seed}:${actor.id}:${spec.kind}`)/2**32*interval;
    for(let i=0,atMs=phase;atMs<durationMs;i++,atMs=phase+i*interval){
      events.push({id:`${seed}:${actor.id}:${spec.kind}:${i}`,actor,kind:spec.kind,atMs});
      if(events.length>1000000)throw new Error('Stage exceeds bounded event ledger');
      if(burst)break;
    }
  }
  return events.sort((a,b)=>a.atMs-b.atMs||a.id.localeCompare(b.id));
}

const quantile=(values,p)=>values.length?values[Math.ceil(values.length*p)-1]:null;
export function summarize(samples){
  const byKind={};
  for(const sample of samples)(byKind[sample.kind]||=[]).push(sample);
  return Object.fromEntries(Object.entries(byKind).map(([kind,rows])=>{
    const latency=rows.filter(r=>!r.dropped).map(r=>r.latencyMs).sort((a,b)=>a-b);
    const offered=rows.filter(r=>!r.dropped).map(r=>r.offeredLatencyMs).sort((a,b)=>a-b);
    const codes={};for(const r of rows)if(!r.ok)codes[r.errorCode]=(codes[r.errorCode]||0)+1;
    return [kind,{offered:rows.length,started:latency.length,completed:rows.filter(r=>r.ok).length,dropped:rows.filter(r=>r.dropped).length,
      lateOver1s:rows.filter(r=>!r.dropped&&r.dispatchLagMs>1000).length,
      p50Ms:quantile(latency,.50),p95Ms:quantile(latency,.95),p99Ms:quantile(latency,.99),maxMs:latency.at(-1)??null,
      offeredP95Ms:quantile(offered,.95),offeredP99Ms:quantile(offered,.99),errors:codes}];
  }));
}

export async function runSchedule(events,execute,{maxInFlight=256}={}){
  if(!Number.isInteger(maxInFlight)||maxInFlight<1||maxInFlight>1000)throw new Error('Invalid generator concurrency limit');
  if(events.some((e,i)=>!Number.isFinite(e.atMs)||e.atMs<0||(i&&events[i-1].atMs>e.atMs)))throw new Error('Events must be ordered by deadline');
  if(new Set(events.map(e=>e.id)).size!==events.length)throw new Error('Action identities must be unique');
  const start=performance.now(),samples=[],pending=new Set();let peakInFlight=0;
  for(const event of events){
    const wait=event.atMs-(performance.now()-start);
    if(wait>0)await delay(wait);
    const began=performance.now(),dispatchLagMs=Math.max(0,began-start-event.atMs);
    if(pending.size>=maxInFlight){samples.push({id:event.id,actorId:event.actor.id,kind:event.kind,ok:false,dropped:true,errorCode:'GENERATOR_LIMIT',dispatchLagMs});continue}
    const promise=(async()=>{
      let outcome;
      try{outcome=await execute(event)}catch{outcome={ok:false,errorCode:'ACTION_FAILED'}}
      const end=performance.now();
      // Never retain response bodies, tokens, raw errors or connection strings.
      const code=String(outcome?.errorCode||'ACTION_FAILED');
      samples.push({id:event.id,actorId:event.actor.id,kind:event.kind,ok:outcome?.ok===true,dropped:false,
        status:Number.isInteger(outcome?.status)?outcome.status:null,errorCode:/^[A-Z0-9_]{1,80}$/.test(code)?code:'ACTION_FAILED',
        dispatchLagMs,latencyMs:end-began,offeredLatencyMs:end-start-event.atMs});
    })();
    pending.add(promise);peakInFlight=Math.max(peakInFlight,pending.size);
    promise.finally(()=>pending.delete(promise));
  }
  await Promise.all(pending);
  return {elapsedMs:performance.now()-start,peakInFlight,samples,byKind:summarize(samples)};
}

export async function localJson(base,path,{token,method='GET',body,terminalPos,fetchImpl=fetch}={}){
  const origin=new URL(base);
  if(origin.protocol!=='http:'||origin.origin!==base||!localHosts.has(origin.hostname)||origin.username||origin.password||!path.startsWith('/api/')||path.includes('://'))throw new Error('Invalid isolated action');
  const response=await fetchImpl(base+path,{method,redirect:'error',signal:AbortSignal.timeout(30000),
    headers:{...(token?{authorization:`Bearer ${token}`} :{}),...(terminalPos?{'x-mws-terminal-pos':terminalPos}:{}),...(body?{'content-type':'application/json'}:{})},
    ...(body?{body:JSON.stringify(body)}:{})});
  let value;try{value=await response.json()}catch{return {ok:false,status:response.status,errorCode:'INVALID_JSON'}}
  return {ok:response.ok,status:response.status,errorCode:response.ok?null: value?.code||`HTTP_${response.status}`,value};
}
