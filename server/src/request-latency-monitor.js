import {performance} from "node:perf_hooks";

// Fixed route labels: do not log store IDs, credentials, URLs, request bodies or headers.
const routes=[
  ["GET",/^\/api\/health\/?$/,"health"],
  ["GET",/^\/api\/public\/kat\/pos\/stores\/[^/]+\/orders\/?$/,"kat_orders_poll"],
  ["GET",/^\/api\/cloud\/v1\/stores\/[^/]+\/overview\/?$/,"cloud_store_overview"],
  ["GET",/^\/api\/transactions\/stores\/[^/]+\/overview\/?$/,"store_transactions_overview"],
  ["POST",/^\/api\/ftext\/v1\/device\/(?:work-poll|cash-poll|void-poll|late-receipt-poll|error-evidence-poll)\/?$/,"ftext_device_poll"],
  ["POST",/^\/api\/store-pos\/stores\/[^/]+\/checkout\/?$/,"pos_checkout"]
];
const bounds=[10,25,50,100,250,500,1000,2500,5000,10000,Infinity];

export function monitoredLatencyRoute(method,url){
  if(typeof url!=="string"||url.length>2048)return null;
  const pathname=url.split("?")[0];
  for(const [verb,pattern,label] of routes)if(method===verb&&pattern.test(pathname))return label;
  return null;
}

function upperPercentile(histogram,total,quantile){
  const target=Math.ceil(total*quantile);
  let count=0;
  for(let i=0;i<histogram.length;i++){
    count+=histogram[i];
    if(count>=target)return Number.isFinite(bounds[i])?bounds[i]:">10000";
  }
  return null;
}

// Aggregated response timings, one record per route per active window.
// Failure of observability must never change a POS/payment/online response.
export function createRequestLatencyMonitor({now=()=>performance.now(),wallNow=Date.now,emit=record=>console.info("MWS_HTTP_LATENCY",JSON.stringify(record)),windowMs=60_000}={}){
  let windowStarted=wallNow();
  const collected=new Map();
  const flush=time=>{
    if(time-windowStarted<windowMs)return;
    for(const [route,value] of collected){
      try{
        emit({route,count:value.count,avgMs:Math.round(value.sum/value.count*10)/10,maxMs:Math.round(value.max*10)/10,
          p50UpperMs:upperPercentile(value.histogram,value.count,0.5),
          p95UpperMs:upperPercentile(value.histogram,value.count,0.95),
          p99UpperMs:upperPercentile(value.histogram,value.count,0.99),
          status2xx3xx:value.ok,status4xx:value.clientError,status5xx:value.serverError,
          windowStart:new Date(windowStarted).toISOString(),windowEnd:new Date(time).toISOString()});
      }catch{/* telemetry is best-effort */}
    }
    collected.clear();
    windowStarted=time;
  };
  return (req,res,next)=>{
    const route=monitoredLatencyRoute(req.method,req.originalUrl||req.url);
    if(!route||typeof res?.once!=="function")return next();
    let started;
    try{started=now()}catch{return next()}
    res.once("finish",()=>{
      try{
        const time=wallNow();
        flush(time);
        const ms=Math.max(0,now()-started);
        if(!Number.isFinite(ms))return;
        let value=collected.get(route);
        if(!value){value={count:0,sum:0,max:0,histogram:Array(bounds.length).fill(0),ok:0,clientError:0,serverError:0};collected.set(route,value)}
        value.count++;value.sum+=ms;value.max=Math.max(value.max,ms);
        const index=bounds.findIndex(bound=>ms<=bound);
        value.histogram[index>=0?index:bounds.length-1]++;
        if(res.statusCode>=500)value.serverError++;
        else if(res.statusCode>=400)value.clientError++;
        else value.ok++;
      }catch{/* telemetry is best-effort */}
    });
    next();
  };
}
