import {n40ReadRecord,N40_TRACE_PREFIX} from "../../shared/n40-read-trace.mjs";
import {randomUUID} from "node:crypto";
// Correlate real HTTP completions. Diagnostic headers do not affect authorization.
export function createN40ReadTrace({log=console.info,now=Date.now,limit=200,legacyLimit=20}={}){
  let windowStart=0,correlatedCount=0,legacyCount=0;
  return (req,res,next)=>{
    if(req.method!=="GET")return next();
    const path=req.originalUrl||req.url;
    if(typeof path!=="string"||!path.startsWith("/api/"))return next();
    res.once("finish",()=>{try{
      let scope={storeId:req.headers?.["x-mws-n40-store"],companyId:req.headers?.["x-mws-n40-company"]};
      let traceId=req.headers?.["x-mws-n40-trace"],source="correlation-header";
      if(!n40ReadRecord(path,scope,traceId)){
        const context=req.user?.supportContext;
        // Legacy nested Backoffice readers do not all use the parent API prop.
        // Observe only the already-authenticated Super Admin LAB support scope.
        if(req.user?.tokenType!=="BACKOFFICE_USER"||req.user?.isSuperAdmin!==true||context?.companyId!==req.user.companyId)return;
        scope=context;traceId="n40-"+randomUUID().replaceAll("-","");source="authenticated-support-context";
      }
      const record=n40ReadRecord(path,scope,traceId,res.statusCode,req.user);if(!record)return;
      const time=now();if(time-windowStart>=60000){windowStart=time;correlatedCount=0;legacyCount=0}
      // Concurrent legacy support polling cannot consume the Twin trace budget.
      if(source==="correlation-header"){if(correlatedCount++>=limit)return}
      else if(legacyCount++>=legacyLimit)return;
      log(N40_TRACE_PREFIX,JSON.stringify({...record,side:"server",source}));
    }catch{}});
    next();
  };
}
