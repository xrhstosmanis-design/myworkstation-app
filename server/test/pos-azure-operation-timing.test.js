import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {EventEmitter} from 'node:events';
import {createFastHeaderTiming,measureFastHeaderPhase} from '../src/lib/pos-fast-header-timing.js';

const source=readFileSync(new URL('../src/routes/commerce-azure-invoice-reader.js',import.meta.url),'utf8');
const parsingAt=source.indexOf('function parseDataUrl(');
const parsing=source.slice(parsingAt,source.indexOf('\n}',parsingAt)+2);
const at=source.indexOf('export async function callAzure('),end=source.indexOf('\nexport function normalizeAzure',at);
assert.ok(parsingAt>=0&&at>=0&&end>at);
const production=source.slice(at,end).replace(/^export /,'');
const constants=['API_VERSION','MODEL_ID'].map(name=>source.split('\n').find(line=>line.startsWith('const '+name+'='))).join('\n');
const pdf=Buffer.from('%PDF-1.4 SYNTHETIC PRIVATE INVOICE BYTES');
const input={contentData:`data:application/pdf;base64,${pdf.toString('base64')}`,mimeType:'application/pdf'};
const operation='https://synthetic.invalid/private-operation-location';
const payload={status:'succeeded',analyzeResult:{modelId:'prebuilt-invoice',apiVersion:'2024-11-30',content:'private supplier/amount/document data',pages:[{pageNumber:1},{pageNumber:2}]}};
const goodSteps=()=>[{operation,elapsed:20},{payload:{status:'running'},elapsed:10},{payload:{status:'running'},elapsed:10},{payload,elapsed:10}];
const compile=deps=>new Function('meterInvoiceAzure','measureFastHeaderPhase','process','Buffer','Date','AbortSignal','fetch','setTimeout',`${constants}\n${parsing}\n${production}\nreturn callAzure;`)(deps.meter,measureFastHeaderPhase,{env:{AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT:'https://synthetic.invalid/',AZURE_DOCUMENT_INTELLIGENCE_KEY:'private-key'}},Buffer,deps.Date,deps.AbortSignal,deps.fetch,deps.setTimeout);

function harness(options={}){
 const requests=[],waits=[],signals=[],marks=[],events=[],metadata=[];
 const clock={value:1000},res=new EventEmitter();let meterCalls=0;
 const steps=options.steps??goodSteps();
 const observer=Object.hasOwn(options,'observer')?options.observer:options.observed===false?undefined:createFastHeaderTiming(res,{now:()=>clock.value,emit:e=>events.push(e),...options.timingOptions});
 const call=compile({
  meter:async(meta,invoke)=>{meterCalls++;metadata.push(meta);if(options.meterError)throw options.meterError;const result=await invoke(value=>{if(options.markError)throw options.markError;marks.push(value)});if(options.settleError)throw options.settleError;return result},
  Date:{now:()=>clock.value},
  AbortSignal:{timeout:ms=>{if(options.signalError)throw options.signalError;signals.push(ms);return {milliseconds:ms}}},
  setTimeout:(resolve,delay)=>{waits.push(delay);if(options.waitError)throw options.waitError;clock.value+=delay;resolve()},
  fetch:async(url,init)=>{
   requests.push({url,init});const step=steps.shift();assert.ok(step,'unexpected extra provider request');clock.value+=step.elapsed??0;
   if(step.error)throw step.error;
   return {ok:step.ok!==false,status:step.status??202,headers:{get:name=>name==='operation-location'?(step.operation??null):null},text:async()=>step.body??'',json:async()=>{if(step.jsonError)throw step.jsonError;return step.payload}};
  }
 });
 return {requests,waits,signals,marks,events,metadata,res,clock,get meterCalls(){return meterCalls},async run(overrides={}){try{return await call({...input,timeoutMs:options.timeoutMs??10000,...(observer===undefined?{}:{timing:observer}),...overrides})}finally{res.emit('finish');res.emit('close')}}};
}
function phases(h){return h.events.filter(e=>e.stage.startsWith('azure_'));}
function assertPrivateSafe(events){
 for(const e of events){
  assert.deepEqual(Object.keys(e).sort(),['correlationId','elapsedMs','outcome','stage',...(e.stage.startsWith('azure_poll_')?['poll']:[])].sort());
  assert.ok(Number.isFinite(e.elapsedMs)&&e.elapsedMs>=0);
  if(e.stage.startsWith('azure_poll_'))assert.ok(Number.isInteger(e.poll)&&e.poll>=1&&e.poll<=30);
 }
 assert.doesNotMatch(JSON.stringify(events),/private|synthetic|https:|operation-location|supplier|amount|document|base64|PDF|key/i);
}

test('actual Azure transport observes POST, waits and polls without changing bytes, marking, deadlines or returned identity',async()=>{
 const h=harness();assert.equal(await h.run(),payload);assert.equal(h.meterCalls,1);assert.deepEqual(h.waits,[700,700,1200]);assert.deepEqual(h.marks,[operation]);
 assert.deepEqual(h.signals,[10000,9280,8570,7360]);assert.equal(h.requests.length,4);
 assert.equal(h.requests[0].url,'https://synthetic.invalid/documentintelligence/documentModels/prebuilt-invoice:analyze?api-version=2024-11-30');
 assert.equal(h.requests[0].init.method,'POST');assert.deepEqual(h.requests[0].init.headers,{'Ocp-Apim-Subscription-Key':'private-key','Content-Type':'application/pdf'});assert.deepEqual(h.requests[0].init.body,pdf);
 for(const request of h.requests.slice(1)){assert.equal(request.url,operation);assert.deepEqual(Object.keys(request.init).sort(),['headers','signal']);assert.deepEqual(request.init.headers,{'Ocp-Apim-Subscription-Key':'private-key'})}
 assert.deepEqual(h.metadata,[{...input,model:'prebuilt-invoice',apiVersion:'2024-11-30'}]);
 assert.deepEqual(phases(h).map(e=>[e.stage,e.outcome,e.elapsedMs,e.poll]),[['azure_submit','ok',20,undefined],['azure_poll_wait','ok',700,1],['azure_poll_request','ok',10,1],['azure_poll_wait','ok',700,2],['azure_poll_request','ok',10,2],['azure_poll_wait','ok',1200,3],['azure_poll_request','ok',10,3]]);
 assert.equal(h.events.at(-1).elapsedMs,2650);assert.equal(h.events.filter(e=>e.stage==='request_total').length,1);assert.equal(new Set(h.events.map(e=>e.correlationId)).size,1);assertPrivateSafe(h.events);
});

test('other unobserved consumers retain the identical transport trace and result with no diagnostics',async()=>{
 const observed=harness(),silent=harness({observed:false});assert.equal(await observed.run(),payload);assert.equal(await silent.run(),payload);
 assert.deepEqual(silent.requests,observed.requests);assert.deepEqual(silent.waits,observed.waits);assert.deepEqual(silent.signals,observed.signals);assert.deepEqual(silent.metadata,observed.metadata);assert.deepEqual(silent.marks,observed.marks);assert.deepEqual(silent.events,[]);
});

test('POST network errors preserve original identity and never mark or poll',async()=>{
 const error=new Error('private POST failure'),h=harness({steps:[{error}]});await assert.rejects(h.run(),e=>e===error);assert.equal(h.requests.length,1);assert.deepEqual(h.waits,[]);assert.deepEqual(h.marks,[]);assert.equal(phases(h)[0].outcome,'error');assertPrivateSafe(h.events);
});

test('POST HTTP failure retains the existing bounded error body while telemetry excludes it',async()=>{
 const body='private'.repeat(100),h=harness({steps:[{ok:false,status:429,body}]});await assert.rejects(h.run(),e=>e.message==='AZURE_ANALYZE_429:'+body.slice(0,300));assert.equal(h.requests.length,1);assert.equal(phases(h)[0].outcome,'error');assertPrivateSafe(h.events);
});

test('missing operation location keeps the existing failure and cannot create a poll',async()=>{
 const h=harness({steps:[{}]});await assert.rejects(h.run(),/AZURE_NO_OPERATION_LOCATION/);assert.equal(h.requests.length,1);assert.deepEqual(h.marks,[]);assert.deepEqual(h.waits,[]);assert.equal(phases(h)[0].outcome,'error');
});

test('wallet rejection before invocation never reaches transport or any Azure phase',async()=>{
 const error=Object.assign(new Error('private wallet hold'),{code:'AI_WALLET_USAGE_REVIEW',status:409}),h=harness({meterError:error});await assert.rejects(h.run(),e=>e===error);assert.equal(h.meterCalls,1);assert.equal(h.requests.length,0);assert.deepEqual(phases(h),[]);
});

test('operation marking failure remains a wallet failure without another provider call',async()=>{
 const error=Object.assign(new Error('private marking conflict'),{code:'AI_WALLET_USAGE_REVIEW'}),h=harness({markError:error});await assert.rejects(h.run(),e=>e===error);assert.equal(h.requests.length,1);assert.deepEqual(h.waits,[]);assert.equal(phases(h)[0].outcome,'ok');
});

test('wallet settlement failure after successful transport retains its original identity',async()=>{
 const error=Object.assign(new Error('private settle failure'),{code:'AI_WALLET_USAGE_REVIEW'}),h=harness({settleError:error});await assert.rejects(h.run(),e=>e===error);assert.equal(h.requests.length,4);assert.equal(h.meterCalls,1);assert.deepEqual(h.marks,[operation]);assertPrivateSafe(h.events);
});

test('poll network failure preserves original identity and exact request count',async()=>{
 const error=new Error('private poll failure'),h=harness({steps:[{operation},{error}]});await assert.rejects(h.run(),e=>e===error);assert.equal(h.requests.length,2);assert.deepEqual(h.waits,[700]);assert.equal(phases(h).at(-1).outcome,'error');assertPrivateSafe(h.events);
});

test('poll HTTP errors remain fail-stop without a retry or body leak',async()=>{
 const h=harness({steps:[{operation},{ok:false,status:503,body:'private body'}]});await assert.rejects(h.run(),/AZURE_POLL_503/);assert.equal(h.requests.length,2);assert.deepEqual(h.waits,[700]);assert.equal(phases(h).at(-1).outcome,'error');assertPrivateSafe(h.events);
});

test('poll JSON decoding errors retain the original error and diagnostic ordinal',async()=>{
 const error=new SyntaxError('private malformed JSON'),h=harness({steps:[{operation},{jsonError:error}]});await assert.rejects(h.run(),e=>e===error);assert.equal(h.requests.length,2);assert.equal(phases(h).at(-1).poll,1);assert.equal(phases(h).at(-1).outcome,'error');assertPrivateSafe(h.events);
});

for(const status of ['failed','canceled'])test(`provider ${status} payload keeps its existing status failure`,async()=>{
 const h=harness({steps:[{operation},{payload:{status}}]});await assert.rejects(h.run(),new RegExp('AZURE_'+status.toUpperCase()));assert.equal(h.requests.length,2);assert.deepEqual(h.waits,[700]);assert.equal(phases(h).at(-1).outcome,'ok','transport+JSON succeeded, while the provider status is rejected by the original branch');
});

test('deadline refuses the first wait before scheduling or polling',async()=>{
 const h=harness({timeoutMs:700,steps:[{operation,elapsed:20}]});await assert.rejects(h.run(),/AZURE_TIMEOUT/);assert.equal(h.requests.length,1);assert.deepEqual(h.waits,[]);assert.equal(phases(h).length,1);
});

test('shared deadline is not reset between polls',async()=>{
 const h=harness({timeoutMs:1400,steps:[{operation,elapsed:20},{payload:{status:'running'},elapsed:10}]});await assert.rejects(h.run(),/AZURE_TIMEOUT/);assert.equal(h.requests.length,2);assert.deepEqual(h.waits,[700]);assert.deepEqual(h.signals,[1400,680]);
});

test('exact thirty-poll cap and700/700/1200 schedule are retained without a31st request',async()=>{
 const h=harness({timeoutMs:0,steps:[{operation},...Array.from({length:30},()=>({payload:{status:'running'}}))]});await assert.rejects(h.run(),/AZURE_TIMEOUT/);assert.equal(h.requests.length,31);assert.deepEqual(h.waits,[700,700,...Array(28).fill(1200)]);assert.deepEqual(h.signals,[]);assert.equal(phases(h).length,61);assert.equal(phases(h).at(-1).poll,30);assertPrivateSafe(h.events);
});

test('wait failure preserves identity and cannot fall through to a poll',async()=>{
 const error=new Error('private timer failure'),h=harness({waitError:error});await assert.rejects(h.run(),e=>e===error);assert.equal(h.requests.length,1);assert.deepEqual(h.waits,[700]);assert.equal(phases(h).at(-1).stage,'azure_poll_wait');assert.equal(phases(h).at(-1).outcome,'error');
});

test('empty documents retain the old pre-request rejection',async()=>{
 const h=harness();await assert.rejects(h.run({contentData:'data:application/pdf;base64,YQ=='}),/AZURE_EMPTY_DOCUMENT/);assert.equal(h.requests.length,0);assert.deepEqual(phases(h),[]);
});

test('AbortSignal construction errors are not swallowed as instrumentation failures',async()=>{
 const error=new DOMException('private cancellation','AbortError'),h=harness({signalError:error});await assert.rejects(h.run(),e=>e===error);assert.equal(h.requests.length,0);assert.equal(phases(h)[0].outcome,'error');assertPrivateSafe(h.events);
});

test('throwing getters/start/finish and rejected asynchronous observers cannot change a successful transport',async()=>{
 const failure=new Error('private diagnostic fault');
 const cases=[Object.defineProperty({},'start',{get(){throw failure}}),{start(){throw failure}},{start(){return Promise.reject(failure)}},{start(){return ()=>{throw failure}}},{start(){return ()=>Promise.reject(failure)}},{start(){return Object.defineProperty({},'then',{get(){throw failure}})}}];
 const baseline=harness({observed:false});await baseline.run();
 for(const observer of cases){const h=harness({observer});assert.equal(await h.run(),payload);assert.deepEqual(h.requests,baseline.requests);assert.deepEqual(h.waits,baseline.waits);assert.deepEqual(h.signals,baseline.signals);assert.deepEqual(h.marks,[operation]);await new Promise(resolve=>setImmediate(resolve))}
});

test('observer faults also preserve the original provider error without retrying',async()=>{
 const original=new Error('private provider failure'),sink=new Error('private sink failure');
 for(const observer of [{start(){throw sink}},{start(){return ()=>Promise.reject(sink)}}]){const h=harness({observer,steps:[{operation},{error:original}]});await assert.rejects(h.run(),e=>e===original);assert.equal(h.requests.length,2);await new Promise(resolve=>setImmediate(resolve))}
});

test('actual timing emitter and clock failures remain silent and leave transport unchanged',async()=>{
 const fault=new Error('private timing failure');
 for(const timingOptions of [{emit(){throw fault}},{emit(){return Promise.reject(fault)}},{now(){throw fault}},{now:()=>NaN}]){const h=harness({timingOptions});assert.equal(await h.run(),payload);assert.equal(h.requests.length,4);assert.deepEqual(h.waits,[700,700,1200]);await new Promise(resolve=>setImmediate(resolve))}
});

test('overlapping calls through one compiled transport keep independent correlations and operation marking',async()=>{
 const eventsA=[],eventsB=[],resA=new EventEmitter(),resB=new EventEmitter(),requests=[],marks=[];let clock=0,releaseA,releaseB;
 const gateA=new Promise(r=>{releaseA=r}),gateB=new Promise(r=>{releaseB=r});
 const bytesA=Buffer.from('%PDF-1.4 private document A original'),bytesB=Buffer.from('%PDF-1.4 private document B original');
 const resultA={status:'succeeded',private:'A'},resultB={status:'succeeded',private:'B'};
 const call=compile({Date:{now:()=>clock},AbortSignal:{timeout:ms=>({milliseconds:ms})},setTimeout:(resolve,delay)=>{clock+=delay;resolve()},meter:async(meta,invoke)=>invoke(op=>marks.push({input:meta.contentData,op})),fetch:async(url,init)=>{
  requests.push({url,init});clock+=10;
  if(init.method==='POST'){const a=init.body.equals(bytesA);await(a?gateA:gateB);return {ok:true,headers:{get:()=>a?'https://synthetic.invalid/opA':'https://synthetic.invalid/opB'}}}
  return {ok:true,json:async()=>url.endsWith('opA')?resultA:resultB};
 }});
 const a={contentData:`data:application/pdf;base64,${bytesA.toString('base64')}`,mimeType:'application/pdf',timing:createFastHeaderTiming(resA,{now:()=>clock,emit:e=>eventsA.push(e),randomId:()=> '11111111-1111-4111-8111-111111111111'})};
 const b={contentData:`data:application/pdf;base64,${bytesB.toString('base64')}`,mimeType:'application/pdf',timing:createFastHeaderTiming(resB,{now:()=>clock,emit:e=>eventsB.push(e),randomId:()=> '22222222-2222-4222-8222-222222222222'})};
 const pendingA=call(a),pendingB=call(b);assert.equal(requests.length,2);releaseB();assert.equal(await pendingB,resultB);resB.emit('finish');releaseA();assert.equal(await pendingA,resultA);resA.emit('finish');
 assert.equal(requests.length,4);assert.deepEqual(marks,[{input:b.contentData,op:'https://synthetic.invalid/opB'},{input:a.contentData,op:'https://synthetic.invalid/opA'}]);
 assert.ok(eventsA.every(e=>e.correlationId==='11111111-1111-4111-8111-111111111111'));assert.ok(eventsB.every(e=>e.correlationId==='22222222-2222-4222-8222-222222222222'));assert.equal(eventsA.filter(e=>e.stage==='azure_poll_request').length,1);assert.equal(eventsB.filter(e=>e.stage==='azure_poll_request').length,1);assertPrivateSafe([...eventsA,...eventsB]);
});
