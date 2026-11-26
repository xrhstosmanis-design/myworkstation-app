import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';

async function fixture(){
 const hookPath=fileURLToPath(new URL('../../client/src/components/commerce/useNetlinkPaidCheckout.jsx',import.meta.url));
 const compiled=await build({stdin:{contents:`import {useNetlinkPaidCheckout} from ${JSON.stringify(hookPath)}; export default function Fixture(props){props.capture(useNetlinkPaidCheckout(props));return null}`,resolveDir:fileURLToPath(new URL('../..',import.meta.url)),sourcefile:'fixture.jsx',loader:'jsx'},bundle:true,write:false,format:'cjs',platform:'node',external:['react','react-dom','react/jsx-runtime']});
 const module={exports:{}};new Function('require','module','exports',compiled.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);
 const dom=new JSDOM('<div id="root"></div>',{url:'https://fixture.invalid'}),keys=['window','document','navigator','HTMLElement','IS_REACT_ACT_ENVIRONMENT'],previous=new Map(keys.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
 for(const key of keys)Object.defineProperty(globalThis,key,{configurable:true,writable:true,value:key==='IS_REACT_ACT_ENVIRONMENT'?true:dom.window[key]});
 const React=await import('react'),{createRoot}=await import('react-dom/client'),root=createRoot(document.getElementById('root'));let hook;
 return {dom,act:React.act,get hook(){return hook},render:props=>React.act(async()=>root.render(React.createElement(module.exports.default,{...props,capture:value=>{hook=value}}))),close:async()=>{await React.act(async()=>root.unmount());dom.window.close();for(const [key,value] of previous)value?Object.defineProperty(globalThis,key,value):delete globalThis[key]}};
}
const ids=['00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002'];
const items=()=>ids.flatMap(id=>['CARD','FEE'].map(role=>({netlinkIntentId:id,netlinkCheckoutId:'checkout',priceReason:`NETLINK_${role}:${id}`}))).concat([{id:'ordinary-goods'}]);

test('mounted cash confirmation covers one whole mixed basket and all card intents',async()=>{
 const f=await fixture(),calls=[];const api=async(url,options)=>{calls.push({url,body:JSON.parse(options.body)});return {cashReceived:true}};
 try{
  await f.render({api,storeId:'store',getCheckoutId:()=> 'checkout'});let confirmation='';window.confirm=text=>{confirmation=text;return true};
  assert.equal(await f.hook.beforePayment('CASH',items(),27,'checkout'),true);assert.match(confirmation,/27/);assert.equal(calls.length,1);assert.deepEqual(calls[0].body,{storeId:'store',received:true,amount:27,requestIds:ids});
  assert.equal(await f.hook.beforePayment('CARD',items(),27,'checkout'),true);assert.equal(calls.length,1);
  window.confirm=()=>false;assert.equal(await f.hook.beforePayment('CASH',items(),27,'checkout'),false);assert.equal(calls.length,1);
  await assert.rejects(()=>f.hook.beforePayment('CASH',items(),27,'different'));
 }finally{await f.close()}
});

test('mounted sequential completion stops after a store switch and old callbacks cannot issue',async()=>{
 const f=await fixture(),calls=[],errors=[];let release;
 const pending=new Promise(resolve=>{release=resolve});const api=async(url,options)=>{calls.push({url,body:JSON.parse(options.body)});return pending};
 try{
  await f.render({api,storeId:'A',getCheckoutId:()=> 'checkout',onError:x=>errors.push(x)});const previous=f.hook;
  const completion=previous.complete(items());assert.equal(calls.length,1);
  await f.render({api,storeId:'B',getCheckoutId:()=> 'new-checkout',onError:x=>errors.push(x)});
  await f.act(async()=>{release({status:'UNKNOWN'});await completion});assert.equal(calls.length,1);assert.equal(errors.length,0);
  await previous.complete(ids[1]);assert.equal(calls.length,1);assert.equal(f.hook.voucher,null);
 }finally{await f.close()}
});

test('several completed cards remain queued for individual printing without another purchase',async()=>{
 const f=await fixture(),calls=[];
 const api=async(url,options)=>{calls.push(url);const id=decodeURIComponent(url.split('/')[4]);return url.endsWith('/issue')?{status:'COMPLETED',idempotentReplay:true}:{requestId:id,title:'Synthetic card',transactionId:'tx-'+id,amount:10,serviceFeeAmount:.5,customerTotal:10.5,lines:['PRIVATE-SYNTHETIC-PIN']}};
 try{
  await f.render({api,storeId:'A',getCheckoutId:()=> 'checkout'});
  await f.act(async()=>f.hook.complete(items()));assert.equal(f.hook.pendingVoucherCount,2);assert.equal(f.hook.voucher.requestId,ids[0]);assert.doesNotMatch(document.body.textContent,/PRIVATE-SYNTHETIC-PIN/);
  await f.act(async()=>f.hook.closeVoucher());assert.equal(f.hook.voucher.requestId,ids[1]);assert.equal(f.hook.pendingVoucherCount,1);assert.equal(calls.filter(url=>url.endsWith('/issue')).length,2);
  await f.act(async()=>f.hook.closeVoucher());assert.equal(f.hook.voucher,null);assert.equal(calls.length,4);
 }finally{await f.close()}
});

test('reviewed paid recovery requires explicit confirmation and never repeats payment or fiscal checkout',async()=>{
 const f=await fixture(),calls=[],errors=[];
 const api=async(url,options)=>{calls.push({url,body:JSON.parse(options.body)});return {status:'UNKNOWN'}};
 try{
  await f.render({api,storeId:'A',operatorId:'manager',getCheckoutId:()=> 'unused',onError:x=>errors.push(x)});
  const intent={requestId:ids[0],status:'RECOVERY_READY',paid:true};
  window.confirm=()=>false;await f.hook.recover(intent);assert.equal(calls.length,0);
  window.confirm=()=>true;await f.hook.recover(intent);assert.equal(calls.length,1);assert.ok(calls[0].url.endsWith('/recover-paid'));assert.deepEqual(calls[0].body,{storeId:'A',fulfillExistingPaidPurchase:true});assert.equal(errors.length,1);assert.equal(f.hook.voucher,null);
  const previous=f.hook;await f.render({api,storeId:'B',operatorId:'other',getCheckoutId:()=> 'unused'});await previous.recover(intent);assert.equal(calls.length,1);
  await f.hook.recover({...intent,status:'UNKNOWN'});assert.equal(calls.length,1);
 }finally{await f.close()}
});
