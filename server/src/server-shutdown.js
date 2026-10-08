import jwt from "jsonwebtoken";

export function createBackgroundDrain(){
  const tasks=new Set(),stoppers=new Set();
  let stopping=false;
  return {
    get stopping(){return stopping},
    get size(){return tasks.size},
    track(task){
      const promise=Promise.resolve(task);
      tasks.add(promise);
      promise.then(()=>tasks.delete(promise),()=>tasks.delete(promise));
      return promise;
    },
    onStop(stop){if(stopping)stop();else stoppers.add(stop)},
    stop(){
      if(stopping)return;
      stopping=true;
      const errors=[];
      for(const stop of stoppers){try{stop()}catch(error){errors.push(error)}}
      stoppers.clear();
      if(errors.length)throw new AggregateError(errors,"Background timer shutdown failed");
    },
    async drain(){while(tasks.size)await Promise.allSettled([...tasks])}
  };
}

export const backgroundDrain=createBackgroundDrain();

// This is only a shutdown admission filter. The unchanged auth middleware still
// validates the body hash, job/company/store, entitlement and durable lease.
export function allowActiveInvoiceDrainRequest(req,activeJobs,secret){
  if(!["127.0.0.1","::1","::ffff:127.0.0.1"].includes(req.socket?.remoteAddress))return false;
  try{
    const path=String(req.originalUrl||req.url||"").split("?")[0];
    const match=path.match(/^\/api\/commerce\/ai-reader\/jobs\/([^/]+)\/(ai-recheck|product-lines|pos-intake)$/);
    if(!match||!new Set(["POST:ai-recheck","PUT:product-lines","POST:pos-intake"]).has(`${req.method}:${match[2]}`))return false;
    const jobId=decodeURIComponent(match[1]);
    if(!activeJobs.has(jobId))return false;
    const token=String(req.headers?.authorization||"").match(/^Bearer (.+)$/)?.[1];
    if(!token)return false;
    const payload=jwt.verify(token,secret,{issuer:"myworkstation-pos-background",audience:"commerce-pos-background"});
    return payload.tokenType==="POS_BACKGROUND"&&payload.jobId===jobId&&payload.path===path.replace("/api/commerce","")&&payload.method===req.method;
  }catch{return false}
}

export function createServerShutdown({work=backgroundDrain,disconnect,allowInternal=()=>false,signalTarget=process,logger=console,warningDelayMs=25000}){
  let draining=false,shutdownPromise,server;
  const middleware=(req,res,next)=>{
    if(!draining||allowInternal(req))return next();
    res.setHeader("Connection","close");
    res.status(503).json({error:"Ο server ολοκληρώνει αλλαγή έκδοσης. Δοκιμάστε ξανά σε λίγο.",code:"SERVER_DRAINING"});
  };
  function shutdown(signal="SIGTERM"){
    if(shutdownPromise)return shutdownPromise;
    draining=true;
    logger.info("Server shutdown started",{signal,backgroundTasks:work.size});
    try{work.stop()}catch(error){logger.error("Server worker timer shutdown failed",error)}
    // Keep loopback HTTP available for the already-running invoice worker.
    // No force-close or process.exit: platform deadlines remain external.
    const warning=setTimeout(()=>logger.warn("Server shutdown still draining; active work was not force-closed",{backgroundTasks:work.size}),warningDelayMs);
    shutdownPromise=(async()=>{
      await work.drain();
      await new Promise((resolve,reject)=>server.close(error=>error&&error.code!=="ERR_SERVER_NOT_RUNNING"?reject(error):resolve()));
      await work.drain();
      await disconnect();
      logger.info("Server shutdown completed");
    })().finally(()=>clearTimeout(warning));
    return shutdownPromise;
  }
  function install(httpServer){
    if(server)throw new Error("Shutdown coordinator already installed");
    server=httpServer;
    const onSignal=signal=>{shutdown(signal).catch(error=>{logger.error("Server shutdown failed",error);signalTarget.exitCode=1})};
    signalTarget.on("SIGTERM",()=>onSignal("SIGTERM"));
    signalTarget.on("SIGINT",()=>onSignal("SIGINT"));
  }
  return {middleware,shutdown,install,get draining(){return draining}};
}
