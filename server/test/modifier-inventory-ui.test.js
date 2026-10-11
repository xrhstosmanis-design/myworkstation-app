import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
import {fileURLToPath} from 'node:url';

async function fixture(component,api,props){
  const bundle=await build({stdin:{contents:`import React from 'react';import {createRoot} from 'react-dom/client';import Component from './client/src/components/${component}';window.root=createRoot(document.getElementById('root'));window.renderFixture=props=>window.root.render(React.createElement(Component,{api:window.fixtureApi,...props}));`,resolveDir:fileURLToPath(new URL("../../",import.meta.url)),loader:'jsx'},bundle:true,write:false,format:'iife',platform:'browser',loader:{'.css':'empty'},define:{'process.env.NODE_ENV':'"production"'},logLevel:'silent'});
  const dom=new JSDOM('<div id="root"></div>',{runScripts:'dangerously',url:'https://isolated.test'});
  dom.window.fixtureApi=api;dom.window.eval(bundle.outputFiles[0].text);dom.window.renderFixture(props);
  return dom;
}
async function until(fn){for(let i=0;i<1000;i++){const value=fn();if(value)return value;await new Promise(r=>setTimeout(r,10))}assert.fail('Expected rendered state did not appear')}
const button=(w,text)=>{const buttons=[...w.document.querySelectorAll('button')];return buttons.find(b=>b.textContent.trim()===text)||buttons.find(b=>b.textContent.includes(text))};
function setValue(w,input,value){Object.getOwnPropertyDescriptor(w.HTMLInputElement.prototype,'value').set.call(input,value);input.dispatchEvent(new w.Event('input',{bubbles:true}));input.dispatchEvent(new w.Event('change',{bubbles:true}))}

test('rendered management searches selected inventory and saves only an explicitly selected product',async()=>{
  let linked=false;const calls=[];
  const api=async(path,options={})=>{calls.push({path,options});
    if(path==='/api/management/modifiers/groups')return {items:[{id:'g',description:'Extra',modifierCount:1,active:true}]};
    if(path.includes('/groups/g/modifiers'))return {items:[{id:'m',description:'Extra dose',price:linked?.65:.2,inventoryProductId:linked?'p':null,inventoryProductSku:linked?'DB-extra':null}]};
    if(path.includes('/inventory-products?'))return {items:[{id:'p',sku:'DB-extra',name:'Extra dose',price:.65}]};
    if(options.method==='PUT'){assert.deepEqual(JSON.parse(options.body),{storeId:'daily-store',productId:'p'});linked=true;return {ok:true}}
    throw Error(path);
  };
  const dom=await fixture('commerce/ManagementModifiersPanel.jsx',api,{storeId:'daily-store',onClose:()=>{}}),w=dom.window;
  try{
    (await until(()=>button(w,'Extra'))).click();
    (await until(()=>button(w,'Σύνδεση αποθήκης'))).click();
    const input=await until(()=>w.document.querySelector('input'));
    setValue(w,input,'Extra');
    const select=await until(()=>w.document.querySelector('select option[value="p"]')?.parentElement);
    assert.ok(calls.find(c=>c.path.includes('storeId=daily-store')));
    assert.equal(button(w,'Σύνδεση αποθήκης').disabled,true);
    select.value='p';select.dispatchEvent(new w.Event('change',{bubbles:true}));
    await until(()=>!button(w,'Σύνδεση αποθήκης').disabled);button(w,'Σύνδεση αποθήκης').click();
    await until(()=>w.document.body.textContent.includes('Αποθήκη · DB-extra'));
    assert.equal(calls.filter(c=>c.options.method==='PUT').length,1);
  }finally{w.root.unmount();w.close()}
});

test('rendered POS restores current extra price, applies total and sends the same charge',async()=>{
  const calls=[],cart=[{id:'coffee',name:'FREDDO ESPRESSO',salePrice:2.45,baseSalePrice:2.25,quantity:1,preparation:{modifiers:[{id:'extra',description:'EXTRA ΔΟΣΗ',price:.2}]}}];
  const api=async(path,options={})=>{calls.push({path,options});if(options.method==='POST')return {id:'isolated-batch'};return {settings:{environmentalFee:0},groups:[{id:'g',description:'EXTRA',items:[{id:'extra',description:'EXTRA ΔΟΣΗ',price:.65}]}]}};
  const props={store:{id:'daily',name:'DAILY'},cart,onClose:()=>{},setMessage:()=>{},setError:e=>{throw Error(e)}};
  const dom=await fixture('store/StorePreparationModal.jsx',api,props),w=dom.window;w.open=()=>null;
  try{
    await until(()=>button(w,'ΕΦΑΡΜΟΓΗ')&&!button(w,'ΕΦΑΡΜΟΓΗ').disabled);button(w,'ΕΦΑΡΜΟΓΗ').click();
    assert.equal(cart[0].salePrice,2.9);assert.equal(cart[0].preparation.modifierTotal,.65);
    await until(()=>!button(w,'ΑΠΟΣΤΟΛΗ ΣΤΗΝ ΠΑΡΑΓΩΓΗ').disabled);button(w,'ΑΠΟΣΤΟΛΗ ΣΤΗΝ ΠΑΡΑΓΩΓΗ').click();
    await until(()=>calls.some(c=>c.options.method==='POST'));
    const body=JSON.parse(calls.find(c=>c.options.method==='POST').options.body);
    assert.equal(body.items[0].modifiers[0].price,.65);
    assert.equal(body.items[0].productId,'coffee');
  }finally{w.root.unmount();w.close()}
});

test('rendered POS keeps Apply disabled when inventory loading fails',async()=>{
  let observed;const dom=await fixture('store/StorePreparationModal.jsx',async()=>{throw Error('Unavailable inventory product')},{store:{id:'daily'},cart:[{id:'coffee',name:'Coffee',salePrice:2.25}],setError:e=>{observed=e},setMessage:()=>{},onClose:()=>{}});
  try{await until(()=>observed);assert.equal(button(dom.window,'ΕΦΑΡΜΟΓΗ').disabled,true)}finally{dom.window.root.unmount();dom.window.close()}
});
