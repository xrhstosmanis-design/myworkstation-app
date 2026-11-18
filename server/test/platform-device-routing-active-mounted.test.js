import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {transform} from 'esbuild';
import {JSDOM} from 'jsdom';
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {deviceRoutingFormValues,buildDeviceRoutingUpdate} from '../../client/src/components/platform/device-routing-form.js';

const source=await readFile(new URL('../../client/src/components/platform/PlatformAdminApp.jsx',import.meta.url),'utf8');
const declarations=source.slice(source.indexOf('  const routingFormValues='),source.indexOf('\n',source.indexOf('  const routingFormKey=')));
const callback=source.slice(source.indexOf('  const saveTerminalDeviceRouting='),source.indexOf('  const copyActivation='));
const formStart=source.indexOf('<form key={routingFormKey}');
const form=source.slice(formStart,source.indexOf('</form>',formStart)+7);
const compiled=await transform(`module.exports=function Fixture({initial,calls}){
const {useState,useMemo}=React;
const [terminalManager,setTerminalManager]=useState(initial),[routingTerminalPos,setRoutingTerminalPos]=useState('LAB-POS-02');
const [busy,setBusy]=useState(''),[,setError]=useState(''),[,setMessage]=useState('');
const request=async(path,options)=>{calls.push({path,options});initial={...initial,routing:JSON.parse(options.body)};return {ok:true}};
const refreshTerminals=async()=>setTerminalManager(initial);
${declarations}
${callback}
return ${form};
}`,{loader:'jsx',format:'cjs',jsxFactory:'React.createElement'});
const module={exports:{}};
new Function('React','deviceRoutingFormValues','buildDeviceRoutingUpdate','module',compiled.code)(React,deviceRoutingFormValues,buildDeviceRoutingUpdate,module);

test('actual mapping form submits disabled device flags, reloads stored codes and restores them without touching another terminal',async()=>{
 const dom=new JSDOM('<div id="root"></div>',{url:'https://isolated.invalid'}),keys=['window','document','navigator','HTMLElement','FormData','Event','IS_REACT_ACT_ENVIRONMENT'],saved=new Map(keys.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
 for(const k of keys)Object.defineProperty(globalThis,k,{configurable:true,writable:true,value:k==='IS_REACT_ACT_ENVIRONMENT'?true:dom.window[k]});
 const initial={company:{id:'LAB'},store:{id:'A'},terminals:[{id:'1',terminalPos:'LAB-POS-01',displayName:'One',active:true},{id:'2',terminalPos:'LAB-POS-02',displayName:'Two',active:true}],routing:{fiscalDevices:[{deviceCode:'FISCAL-01',displayName:'One',terminalPos:'LAB-POS-01',active:true},{deviceCode:'FISCAL-02',displayName:'Two',terminalPos:'LAB-POS-02',active:true}],eftposDevices:[{deviceCode:'EFTPOS-01',displayName:'One',fiscalDeviceCode:'FISCAL-01',role:'STORE',active:true},{deviceCode:'EFTPOS-02',displayName:'Two',fiscalDeviceCode:'FISCAL-02',role:'STORE',transactionMode:'DEFERRED',active:true},{deviceCode:'DELIVERY-02',displayName:'Delivery',fiscalDeviceCode:'FISCAL-02',role:'DELIVERY',transactionMode:'IMMEDIATE',active:true}]}},calls=[],root=createRoot(document.getElementById('root'));
 const field=name=>document.querySelector(`[name="${name}"]`);
 const change=async(name,value)=>act(async()=>{field(name).value=value;field(name).dispatchEvent(new dom.window.Event('change',{bubbles:true}))});
 const submit=async()=>act(async()=>document.querySelector('form').dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true})));
 try{
  await act(async()=>root.render(React.createElement(module.exports,{initial,calls})));
  for(const name of ['fiscalActive','storeEftposActive','deliveryEftposActive']){assert.equal(field(name).value,'true');await change(name,'false')}
  await submit();assert.equal(calls.length,1);assert.equal(calls[0].path,'/api/platform/companies/LAB/stores/A/device-routing');
  const disabled=JSON.parse(calls[0].options.body);assert.equal(disabled.fiscalDevices[1].active,false);assert.equal(disabled.eftposDevices[1].active,false);assert.equal(disabled.eftposDevices[2].active,false);
  assert.deepEqual(disabled.fiscalDevices[0],initial.routing.fiscalDevices[0]);assert.deepEqual(disabled.eftposDevices[0],initial.routing.eftposDevices[0]);
  for(const name of ['fiscalActive','storeEftposActive','deliveryEftposActive'])assert.equal(field(name).value,'false');
  assert.equal(field('fiscalDeviceCode').value,'FISCAL-02');assert.equal(field('storeEftposCode').value,'EFTPOS-02');assert.equal(field('deliveryEftposCode').value,'DELIVERY-02');
  assert.equal(field('storeTransactionMode').value,'DEFERRED');assert.equal(field('deliveryTransactionMode').value,'IMMEDIATE');
  await change('terminalPos','LAB-POS-01');assert.equal(field('fiscalActive').value,'true');assert.equal(field('fiscalDeviceCode').value,'FISCAL-01');
  await change('terminalPos','LAB-POS-02');assert.equal(field('fiscalActive').value,'false');assert.equal(field('fiscalDeviceCode').value,'FISCAL-02');
  for(const name of ['fiscalActive','storeEftposActive','deliveryEftposActive'])await change(name,'true');
  await submit();assert.equal(calls.length,2);const restored=JSON.parse(calls[1].options.body);assert.deepEqual(restored,initial.routing);
 }finally{await act(async()=>root.unmount());dom.window.close();for(const [k,d] of saved)d?Object.defineProperty(globalThis,k,d):delete globalThis[k]}
});
