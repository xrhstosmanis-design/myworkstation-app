import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
async function component(){
 const result=await build({entryPoints:[fileURLToPath(new URL('../../client/src/components/store/PosPermanentPrice.jsx',import.meta.url))],bundle:true,write:false,format:'cjs',platform:'node',packages:'external',loader:{'.css':'empty'}});
 const m={exports:{}};new Function('require','module','exports',result.outputFiles[0].text)(createRequire(import.meta.url),m,m.exports);return m.exports.default;
}
async function environment(run){
 const dom=new JSDOM('<div id="root"></div>'),keys=['window','document','navigator','HTMLElement','IS_REACT_ACT_ENVIRONMENT'],previous=new Map(keys.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
 for(const k of keys)Object.defineProperty(globalThis,k,{configurable:true,writable:true,value:k==='IS_REACT_ACT_ENVIRONMENT'?true:dom.window[k]});
 const React=await import('react'),{createRoot}=await import('react-dom/client'),root=createRoot(document.getElementById('root'));
 try{await run({React,root,dom})}finally{await React.act(async()=>root.unmount());dom.window.close();for(const k of keys){const d=previous.get(k);if(d)Object.defineProperty(globalThis,k,d);else delete globalThis[k]}}
}
const baseline={productId:'p',storeId:'s',productName:'ΝΕΡΟ 500ML',storeName:'LAB',salePrice:0.5};
const props={store:{id:'s',name:'LAB'},product:{id:'p',name:'ΝΕΡΟ 500ML',sku:'W500'},newPrice:0.6,reason:'Δοκιμή',enabled:true,onBusy:()=>{}};
test('mounted permanent price previews exact product/store before explicit save and locks double clicks',async()=>{
 const View=await component();await environment(async({React,root})=>{
  const calls=[],saved=[];let resolve;
  const api=async(path,opt)=>{calls.push({path,opt});return opt?new Promise(r=>resolve=r):baseline};
  await React.act(async()=>root.render(React.createElement(View,{...props,api,onSaved:r=>saved.push(r)})));
  assert.equal(calls.length,1);assert.match(document.body.textContent,/ΝΕΡΟ 500ML.*W500/);assert.match(document.body.textContent,/LAB/);
  await React.act(async()=>{document.querySelector('button').click();document.querySelector('button').click()});
  assert.equal(calls.length,2);const body=JSON.parse(calls[1].opt.body);assert.equal(body.confirm,true);assert.equal(body.expectedPrice,0.5);assert.equal(body.newPrice,0.6);assert.ok(body.requestId);assert.equal(saved.length,0);
  await React.act(async()=>resolve({...baseline,ok:true,eventId:'event',salePrice:0.6}));assert.equal(saved.length,1);
 });
});
test('mounted permanent price retains the same retry receipt and shows server refusal without success',async()=>{
 const View=await component();await environment(async({React,root})=>{
  const bodies=[],saved=[];const api=async(path,opt)=>{if(!opt)return baseline;bodies.push(JSON.parse(opt.body));throw new Error('Η τιμή άλλαξε από άλλο τερματικό.')};
  await React.act(async()=>root.render(React.createElement(View,{...props,api,onSaved:r=>saved.push(r)})));
  await React.act(async()=>document.querySelector('button').click());await React.act(async()=>document.querySelector('button').click());
  assert.equal(bodies.length,2);assert.equal(bodies[0].requestId,bodies[1].requestId);assert.match(document.querySelector('[role=alert]').textContent,/άλλο τερματικό/);assert.equal(saved.length,0);
 });
});
test('mounted permanent price cannot submit denied preparation or apply a late result after store switch',async()=>{
 const View=await component();await environment(async({React,root})=>{
  let resolve;const saved=[],api=async(path,opt)=>opt?new Promise(r=>resolve=r):path.includes('/s/')?baseline:{...baseline,storeId:'other'};
  await React.act(async()=>root.render(React.createElement(View,{...props,key:'s',api,onSaved:r=>saved.push(r)})));
  await React.act(async()=>document.querySelector('button').click());
  await React.act(async()=>root.render(React.createElement(View,{...props,key:'other',store:{id:'other'},enabled:false,api,onSaved:r=>saved.push(r)})));
  await React.act(async()=>resolve({...baseline,ok:true,salePrice:0.6}));assert.equal(saved.length,0);assert.equal(document.querySelector('button').disabled,true);
 });
});
