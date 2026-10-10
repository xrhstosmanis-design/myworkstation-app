import {n40ReadRecord,N40_TRACE_PREFIX} from "../../shared/n40-read-trace.mjs";
// Correlate real HTTP completions. Diagnostic headers do not affect authorization.
export function createN40ReadTrace({log=console.info,now=Date.now,limit=200}={}){
  let windowStart=0,count=0;
  return (req,res,next)=>{
    if(req.method!=="GET")return next();
    const scope={storeId:req.headers?.["x-mws-n40-store"],companyId:req.headers?.["x-mws-n40-company"]};
    const traceId=req.headers?.["x-mws-n40-trace"],path=req.originalUrl||req.url;
    if(!n40ReadRecord(path,scope,traceId))return next();
    const time=now();if(time-windowStart>=60000){windowStart=time;count=0}
    if(count++>=limit)return next();
    res.once("finish",()=>{try{const record=n40ReadRecord(path,scope,traceId,res.statusCode,req.user);if(record)log(N40_TRACE_PREFIX,JSON.stringify({...record,side:"server"}))}catch{}});
    next();
  };
}
