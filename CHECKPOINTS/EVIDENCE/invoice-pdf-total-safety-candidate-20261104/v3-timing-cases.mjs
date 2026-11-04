// V3: monetary safety and timing are exercised together, not just injected.
const outcomes=events=>events.map(({stage,outcome,attempt})=>[stage,outcome,...(attempt===undefined?[]:[attempt])]);
const prefix=[['exact_file_lookup','ok'],['azure_header','ok'],['azure_supplier_match','ok']];

test('V3 successful full-document total retains the complete timing trace and one request total',async()=>{
 const r=await run({azure:{...complete(),azurePageCount:2,rawText:printedVat},transportSteps:[{}]});
 assert.ifError(r.error);assert.equal(r.result.totalGross,24.8);
 assert.deepEqual(outcomes(r.timings),[...prefix,['openai_attempt','ok',1],['openai_header','ok'],['openai_supplier_match','ok'],['request_total','finished']]);
});
test('V3 missing full-document amount is a policy error even when provider transport finishes',async()=>{
 const r=await run({azure:{...complete(),azurePageCount:2,rawText:printedVat},transportSteps:[{parsed:{...fallback(),totalGross:0}}]});
 assert.equal(r.result,undefined);assert.equal(r.error?.code,'FAST_HEADER_PDF_TOTAL_UNVERIFIED');
 assert.deepEqual(outcomes(r.timings),[...prefix,['openai_attempt','ok',1],['openai_header','ok'],['openai_supplier_match','ok'],['request_total','finished']]);
});
test('V3 two failed provider attempts preserve wrapped error, timing and no successful subtotal',async()=>{
 const r=await run({azure:{...complete(),azurePageCount:2,rawText:printedVat},transportSteps:[{httpStatus:503},{httpStatus:503}]});
 assert.equal(r.result,undefined);assert.equal(r.error?.status,502);
 assert.deepEqual(outcomes(r.timings),[...prefix,['openai_attempt','error',1],['openai_attempt','error',2],['openai_header','error'],['request_total','finished']]);
});
test('V3 missing fallback configuration records no phantom fallback span and returns no subtotal',async()=>{
 const r=await run({azure:{...complete(),azurePageCount:2,rawText:printedVat},openaiConfigured:false});
 assert.equal(r.result,undefined);assert.equal(r.error?.status,502);
 assert.deepEqual(outcomes(r.timings),[...prefix,['request_total','finished']]);
});
test('V3 wallet hold remains original normalized error and a single failed attempt',async()=>{
 const failure=Object.assign(new Error('secret wallet failure'),{code:'AI_WALLET_USAGE_REVIEW',status:503});
 const r=await run({transportSteps:[failure]});
 assert.equal(r.error,failure);assert.equal(r.error.status,409);assert.equal(r.result,undefined);
 assert.deepEqual(outcomes(r.timings),[...prefix,['openai_attempt','error',1],['openai_header','error'],['request_total','finished']]);
});
for(const asynchronous of [false,true])test(`V3 ${asynchronous?'asynchronous':'synchronous'} telemetry failure cannot enable unsafe money`,async()=>{
 const r=await run({azure:{...complete(),azurePageCount:2,rawText:printedVat},transportSteps:[{parsed:{...fallback(),totalGross:0}}],timingOptions:{emit(){const e=new Error('secret sink');if(asynchronous)return Promise.reject(e);throw e;}}});
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(r.result,undefined);assert.equal(r.error?.code,'FAST_HEADER_PDF_TOTAL_UNVERIFIED');assert.equal(r.transportRequests.length,1);
});
test('V3 shared 70-second provider budget is unchanged on retry',async()=>{
 let current=1000;const budgets=[];
 const first=()=>({ok:false,status:503,text:async()=>{current=51000;return 'secret retry failure';}});
 const r=await run({azure:{...complete(),azurePageCount:2,rawText:printedVat},transportSteps:[first,{}],transportNow:()=>current,transportTimeout:ms=>{budgets.push(ms);return undefined;}});
 assert.ifError(r.error);assert.equal(r.result.totalGross,24.8);assert.deepEqual(budgets,[70000,20000]);
 assert.deepEqual(outcomes(r.timings.filter(e=>e.stage==='openai_attempt')),[['openai_attempt','error',1],['openai_attempt','ok',2]]);
});
test('V3 exhausted shared provider budget cannot return partial money or emit a phantom attempt',async()=>{
 let current=1000;const budgets=[];
 const first=()=>({ok:false,status:503,text:async()=>{current=70500;return 'secret exhausted deadline';}});
 const r=await run({azure:{...complete(),azurePageCount:2,rawText:printedVat},transportSteps:[first],transportNow:()=>current,transportTimeout:ms=>{budgets.push(ms);return undefined;}});
 assert.equal(r.result,undefined);assert.equal(r.error?.status,502);assert.deepEqual(budgets,[70000]);assert.equal(r.transportRequests.length,1);
 assert.deepEqual(outcomes(r.timings.filter(e=>e.stage==='openai_attempt')),[['openai_attempt','error',1]]);
});
