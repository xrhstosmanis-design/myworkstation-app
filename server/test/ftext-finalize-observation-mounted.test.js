import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';

const row=(status='CONFIRMED',extra={})=>({id:'original',storeId:'store-a',kind:'FTEXT_CASH',paymentMethod:'CASH',status,...extra});
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return {promise,resolve,reject}};
async function mounted(run,respond){
 const compiled=await build({entryPoints:[fileURLToPath(new URL('../../client/src/components/store/useFtextCashCheckout.js',import.meta.url))],bundle:true,write:false,format:'cjs',platform:'node',external:['react']});
 const module={exports:{}};new Function('require','module','exports',compiled.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);
 const dom=new JSDOM('<div id="root"></div>'),keys=['window','document','navigator','HTMLElement','IS_REACT_ACT_ENVIRONMENT'],previous=new Map(keys.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
 for(const key of keys)Object.defineProperty(globalThis,key,{configurable:true,writable:true,value:key==='IS_REACT_ACT_ENVIRONMENT'?true:dom.window[key]});
 const React=await import('react'),{createRoot}=await import('react-dom/client'),{act}=React,root=createRoot(document.getElementById('root'));
 const oldInterval=globalThis.setInterval,oldClear=globalThis.clearInterval;let tick,gets=0,posts=0,unmounted=false;
 globalThis.setInterval=fn=>(tick=fn,1);globalThis.clearInterval=()=>{};
 const calls=[],commits=[],updates=[],errors=[];
 const api=async(path,options={})=>{assert.match(path,/\/stores\/store-a\/ftext-cash\/(?:original|next)(?:\/finalize)?$/);calls.push({path,options});const post=options.method==='POST';return respond({path,post,get:post?gets:++gets,postCount:post?++posts:posts})};
 function Harness({storeId='store-a',pending={request:{id:'original',kind:'FTEXT_CASH'}}}){module.exports.default({api,storeId,pending,onRequest:r=>updates.push(r),onCommitted:r=>commits.push(r),onCancelled:()=>assert.fail('unexpected cancellation'),onReleased:()=>assert.fail('unexpected release'),onError:e=>errors.push(e)});return null}
 const render=props=>act(async()=>root.render(React.createElement(Harness,props)));
 const unmount=async()=>{await act(async()=>root.unmount());unmounted=true};
 try{await run({render,unmount,act,tick:()=>act(async()=>tick()),calls,commits,updates,errors});}
 finally{if(!unmounted)await unmount();globalThis.setInterval=oldInterval;globalThis.clearInterval=oldClear;dom.window.close();for(const[key,d]of previous)d?Object.defineProperty(globalThis,key,d):delete globalThis[key]}
}

for(const paymentMethod of ['CASH','CARD'])test(`mounted ${paymentMethod} observes committed original immediately after finalize without a timer tick`,()=>mounted(async h=>{
 await h.render({});assert.equal(h.commits.length,1);assert.equal(h.commits[0].saleId,'sale-original');assert.equal(h.commits[0].paymentMethod,paymentMethod);
 assert.equal(h.calls.length,3);assert.equal(h.calls.filter(c=>c.options.method==='POST').length,1);
 await h.tick();await h.tick();assert.equal(h.commits.length,1);assert.equal(h.calls.length,3);
},({post,get})=>post?{saleId:'sale-original'}:{request:row(get===1?'CONFIRMED':'SALE_COMMITTED',{paymentMethod,saleId:get===1?null:'sale-original'})}));

test('mounted slow finalize remains single-flight through immediate observation',async()=>{
 const finish=deferred();await mounted(async h=>{
  await h.render({});assert.equal(h.calls.length,2);await h.tick();await h.tick();assert.equal(h.calls.length,2);assert.equal(h.commits.length,0);
  await h.act(async()=>finish.resolve({saleId:'sale'}));assert.equal(h.calls.length,3);assert.equal(h.commits.length,1);await h.tick();assert.equal(h.calls.length,3);
 },({post,get})=>post?finish.promise:{request:row(get===1?'CONFIRMED':'SALE_COMMITTED')});
});

for(const invalid of [{id:'foreign'},{storeId:'foreign'},{kind:'RBS'}])test(`mounted immediate observation refuses foreign identity ${Object.keys(invalid)[0]}`,()=>mounted(async h=>{
 await h.render({});assert.equal(h.commits.length,0);assert.equal(h.updates.length,1);assert.equal(h.errors.length,1);assert.equal(h.calls.filter(c=>c.options.method==='POST').length,1);
},({post,get})=>post?{saleId:'sale'}:{request:row(get===1?'CONFIRMED':'SALE_COMMITTED',get===1?{}:invalid)}));

for(const when of ['finalize','observation'])test(`mounted store change during ${when} ignores old completion`,async()=>{
 const pending=deferred();await mounted(async h=>{
  await h.render({});const count=h.calls.length;await h.render({storeId:'store-b',pending:null});
  await h.act(async()=>pending.resolve(when==='finalize'?{saleId:'sale'}:{request:row('SALE_COMMITTED')}));
  assert.equal(h.calls.length,count);assert.equal(h.commits.length,0);assert.equal(h.updates.length,1);assert.equal(h.errors.length,0);
 },({post,get})=>post?(when==='finalize'?pending.promise:{saleId:'sale'}):(get===1?{request:row()}:pending.promise));
});

test('mounted unmount while finalize is pending performs no later read or callback',async()=>{
 const finish=deferred();await mounted(async h=>{
  await h.render({});await h.unmount();await h.act(async()=>finish.resolve({saleId:'sale'}));assert.equal(h.calls.length,2);assert.equal(h.commits.length,0);assert.equal(h.errors.length,0);
 },({post})=>post?finish.promise:{request:row()});
});

test('mounted same-store replacement request ignores the old delayed finalize',async()=>{
 const finish=deferred();await mounted(async h=>{
  await h.render({});await h.render({pending:{request:{id:'next',kind:'FTEXT_CASH'}}});
  assert.equal(h.updates.at(-1).id,'next');const count=h.calls.length;
  await h.act(async()=>finish.resolve({saleId:'old-sale'}));
  assert.equal(h.calls.length,count);assert.equal(h.commits.length,0);assert.equal(h.updates.length,2);assert.equal(h.errors.length,0);
 },({path,post})=>path.endsWith('/next')?{request:row('DISPATCHED',{id:'next'})}:post?finish.promise:{request:row()});
});

for(const lost of ['finalize','observation'])test(`mounted lost ${lost} reply recovers same committed request on ordinary poll without another POST`,()=>mounted(async h=>{
 await h.render({});assert.equal(h.commits.length,0);assert.equal(h.errors.length,1);await h.tick();assert.equal(h.commits.length,1);
 assert.equal(h.calls.filter(c=>c.options.method==='POST').length,1);await h.tick();assert.equal(h.commits.length,1);
},({post,get})=>{
 if(post){if(lost==='finalize')throw Error('lost finalize reply');return {saleId:'sale'}}
 if(lost==='observation'&&get===2)throw Error('lost immediate read');
 return {request:row(get===1?'CONFIRMED':'SALE_COMMITTED')};
}));

test('mounted bare finalize success and still-CONFIRMED read do not infer completion',()=>mounted(async h=>{
 await h.render({});assert.equal(h.calls.length,3);assert.equal(h.commits.length,0);assert.equal(h.errors.length,0);
},({post})=>post?{saleId:'sale'}:{request:row()}));

for(const extra of [{paymentMethod:'CARD',operatorConfirmationRequired:true},{paymentMethod:'CARD',operatorOutcome:'NO'},{paymentMethod:'CARD',operatorOutcome:'UNCERTAIN'}])test(`mounted operator CARD ${extra.operatorOutcome||'decision required'} never finalizes or immediately completes`,()=>mounted(async h=>{
 await h.render({});await h.tick();assert.equal(h.calls.filter(c=>c.options.method==='POST').length,0);assert.equal(h.commits.length,0);
},()=>({request:row('CONFIRMED',extra)})));
