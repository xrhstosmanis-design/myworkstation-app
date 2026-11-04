import {randomUUID} from 'node:crypto';
import {performance} from 'node:perf_hooks';

const stages=new Set(['request_total','exact_file_lookup','azure_header','azure_supplier_match','openai_header','openai_attempt','openai_supplier_match']);
const noTiming=()=>{};
const silentTiming=Object.freeze({start:()=>noTiming,measure:async(_stage,work)=>await work()});
const emitTiming=record=>console.info('POS_FAST_HEADER_TIMING',JSON.stringify(record));

// Observability only: no request data is accepted and no telemetry failure may
// alter the existing provider/result/error path. Provider spans include their
// existing wallet work; request_total starts at this handler, not at file upload.
export function createFastHeaderTiming(res,options={}){
  try{
    const {emit=emitTiming,now=()=>performance.now(),randomId=randomUUID}=options;
    if(typeof emit!=='function'||typeof now!=='function'||typeof randomId!=='function')return silentTiming;
    const correlationId=randomId();
    if(typeof correlationId!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(correlationId))return silentTiming;
    const requestStarted=now();
    if(!Number.isFinite(requestStarted)||typeof res?.once!=='function')return silentTiming;
    let active=false;
    function start(stage,attempt,started){
      try{
        if(!stages.has(stage)||(stage==='openai_attempt'&&![1,2].includes(attempt))||(stage!=='openai_attempt'&&attempt!==undefined))return noTiming;
        const began=started===undefined?now():started;
        if(!Number.isFinite(began))return noTiming;
        let done=false;
        return (outcome='ok')=>{
          try{
            if(!active||done||!(stage==='request_total'?['finished','closed']:['ok','error']).includes(outcome))return;
            done=true;
            const elapsedMs=Math.max(0,Math.round((now()-began)*1000)/1000);
            if(!Number.isFinite(elapsedMs))return;
            const emitted=emit({correlationId,stage,outcome,elapsedMs,...(stage==='openai_attempt'?{attempt}:{})});
            // The default logger is synchronous. Injected/asynchronous sinks
            // must also be unable to produce an unhandled rejection.
            if(emitted&&typeof emitted.then==='function')Promise.resolve(emitted).catch(noTiming);
          }catch{}
        };
      }catch{return noTiming}
    }
    const finishRequest=start('request_total',undefined,requestStarted);
    res.once('finish',()=>finishRequest('finished'));
    res.once('close',()=>finishRequest('closed'));
    active=true;
    return Object.freeze({
      start,
      async measure(stage,work,attempt){
        const finish=start(stage,attempt);
        try{const value=await work();finish('ok');return value}
        catch(error){finish('error');throw error}
      }
    });
  }catch{return silentTiming}
}
