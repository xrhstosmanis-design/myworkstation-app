import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
import {fileURLToPath} from 'node:url';
const until=async fn=>{for(let i=0;i<300;i++){if(fn())return fn();await new Promise(r=>setTimeout(r,10))}assert.fail('UI state not observed')};
test('actual POS table modal freezes one printer-compatible round identity after lost reply and refuses changed payload retry',async()=>{
 const bundle=await build({stdin:{contents:`import React from 'react';import {createRoot} from 'react-dom/client';import Modal from './client/src/components/store/StoreTableOrdersModal.jsx';window.root=createRoot(document.getElementById('root'));window.render=()=>window.root.render(React.createElement(Modal,window.props));window.render();`,resolveDir:fileURLToPath(new URL('../../',import.meta.url)),loader:'jsx'},bundle:true,write:false,format:'iife',platform:'browser',define:{'process.env.NODE_ENV':'"production"'},logLevel:'silent'});
 const dom=new JSDOM('<div id="root"></div>',{runScripts:'dangerously',url:'https://isolated.test'}),w=dom.window,requests=[],errors=[];let clears=0,release;
 const cart=[{id:'coffee',quantity:1,preparation:{note:'Ζεστό',allergens:['ΓΑΛΑ'],modifiers:[{id:'milk',description:'EXTRA',price:.5}]}}];
 const response={id:'order',roundNumber:1,tableName:'LAB',addedTotal:1.5,total:1.5,preparationBatches:[{id:'batch',productionStation:'ΚΑΦΕ',printStatus:'QUEUED',jobId:'job'}]};
 w.props={store:{id:'store',name:'LAB'},cart,api:async(path,options={})=>{
  if(path.endsWith('/table-service'))return{areas:[],tables:[{id:'table',name:'LAB'}],orders:[],canConfigure:false};
  if(path.endsWith('/table-orders')){requests.push(JSON.parse(options.body));if(requests.length===1)throw Error('lost reply after commit — δεν εκτελέστηκε συναλλαγή.');if(requests.length===2)throw Object.assign(Error('Η τιμή επιλογής άλλαξε'),{status:409});await new Promise(resolve=>release=resolve);return response}
  throw Error('Unexpected route');
 },setError:text=>errors.push(text),setMessage:()=>{},onCartCleared:()=>clears++,onLoad:()=>{},onClose:()=>{}};
 const send=()=>[...w.document.querySelectorAll('button')].find(button=>/ΑΠΟΣΤΟΛΗ ΠΑΡΑΓΓΕΛΙΑΣ/.test(button.textContent));
 try{
  w.eval(bundle.outputFiles[0].text);await until(()=>send()&&!send().disabled);
  send().click();await until(()=>errors.some(value=>value.includes('lost reply')));await until(()=>!send().disabled);
  assert.equal(errors.some(value=>value.includes('δεν εκτελέστηκε συναλλαγή')),false);
  const first=requests[0];assert.match(first.idempotencyKey,/^[a-f0-9-]{36}$/);assert.equal(first.items[0].modifiers[0].price,.5);assert.deepEqual(first.items[0].allergens,['ΓΑΛΑ']);
  w.props={...w.props,cart:[{...cart[0],quantity:2}]};w.render();await new Promise(r=>setTimeout(r,20));send().click();await until(()=>errors.some(value=>value.includes('αβέβαιη απάντηση')));assert.equal(requests.length,1);
  w.props={...w.props,cart};w.render();await new Promise(r=>setTimeout(r,20));send().click();await until(()=>errors.some(value=>value.includes('Η τιμή επιλογής άλλαξε')));assert.deepEqual(requests[1],first);await until(()=>!send().disabled);
  // A later known refusal cannot erase an earlier ambiguous commit.
  w.props={...w.props,cart:[{...cart[0],quantity:2}]};w.render();await new Promise(r=>setTimeout(r,20));send().click();assert.equal(requests.length,2);
  w.props={...w.props,cart};w.render();await new Promise(r=>setTimeout(r,20));send().click();send().click();await until(()=>requests.length===3);assert.deepEqual(requests[2],first);release();await until(()=>clears===1);assert.equal(requests.length,3);
 }finally{w.root.unmount();w.close()}
});


test('actual POS modal allows correction after a first definitive prewrite refusal with a fresh request key',async()=>{
 const bundle=await build({stdin:{contents:`import React from 'react';import {createRoot} from 'react-dom/client';import Modal from './client/src/components/store/StoreTableOrdersModal.jsx';window.root=createRoot(document.getElementById('root'));window.render=()=>window.root.render(React.createElement(Modal,window.props));window.render();`,resolveDir:fileURLToPath(new URL('../../',import.meta.url)),loader:'jsx'},bundle:true,write:false,format:'iife',platform:'browser',define:{'process.env.NODE_ENV':'"production"'},logLevel:'silent'});
 const dom=new JSDOM('<div id="root"></div>',{runScripts:'dangerously',url:'https://isolated.test'}),w=dom.window,requests=[],errors=[];let clears=0;
 const cart=[{id:'coffee',quantity:1}];
 w.props={store:{id:'store',name:'LAB'},cart,api:async(path,options={})=>{
  if(path.endsWith('/table-service'))return{areas:[],tables:[{id:'table',name:'LAB'}],orders:[],canConfigure:false};
  if(path.endsWith('/table-orders')){requests.push(JSON.parse(options.body));if(requests.length===1)throw Object.assign(Error('Η τιμή επιλογής άλλαξε'),{status:409});return{id:'order',roundNumber:1,tableName:'LAB',addedTotal:2,total:2,preparationBatches:[]}}
  throw Error('Unexpected route');
 },setError:text=>errors.push(text),setMessage:()=>{},onCartCleared:()=>clears++,onLoad:()=>{},onClose:()=>{}};
 const send=()=>[...w.document.querySelectorAll('button')].find(button=>/ΑΠΟΣΤΟΛΗ ΠΑΡΑΓΓΕΛΙΑΣ/.test(button.textContent));
 try{
  w.eval(bundle.outputFiles[0].text);await until(()=>send()&&!send().disabled);send().click();await until(()=>errors.some(value=>value.includes('Διόρθωσε τα στοιχεία')));await until(()=>!send().disabled);
  w.props={...w.props,cart:[{...cart[0],quantity:2}]};w.render();await new Promise(r=>setTimeout(r,20));send().click();await until(()=>clears===1);
  assert.equal(requests.length,2);assert.equal(requests[1].items[0].quantity,2);assert.notEqual(requests[0].idempotencyKey,requests[1].idempotencyKey);
 }finally{w.root.unmount();w.close()}
});
