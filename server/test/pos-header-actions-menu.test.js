import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';

test('actual POS central menu preserves authorized launchers, scanner focus, media instances and direct refresh/logout',async()=>{
 const compiled=await build({entryPoints:[fileURLToPath(new URL('../../client/src/components/store/StorePosPanel.jsx',import.meta.url))],bundle:true,write:false,format:'cjs',platform:'node',external:['react','react-dom','react-dom/client','react/jsx-runtime','pdfjs-dist/build/pdf.worker.min.mjs?url','pdfjs-dist/build/pdf.mjs'],loader:{'.css':'empty'},logOverride:{'empty-import-meta':'silent'}});
 const dom=new JSDOM('<div id="root"></div>',{url:'https://isolated.invalid'}),keys=['window','document','navigator','HTMLElement','MutationObserver','localStorage','fetch','MediaRecorder','IS_REACT_ACT_ENVIRONMENT'];
 const previous=new Map(keys.map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));let trackStops=0,radioPauses=0,recordStarts=0;
 const track={stop(){trackStops++},addEventListener(){}},stream={getTracks:()=>[track],getVideoTracks:()=>[track]};
 class Recorder{static isTypeSupported(){return true}state='inactive';start(){this.state='recording';recordStarts++}stop(){this.state='inactive';this.onstop?.()}}
 dom.window.HTMLMediaElement.prototype.play=async()=>{};dom.window.HTMLMediaElement.prototype.pause=()=>{radioPauses++};dom.window.MediaRecorder=Recorder;
 Object.defineProperty(dom.window.navigator,'mediaDevices',{value:{getDisplayMedia:async()=>stream}});
 for(const key of keys)Object.defineProperty(globalThis,key,{configurable:true,writable:true,value:key==='IS_REACT_ACT_ENVIRONMENT'?true:key==='MediaRecorder'?Recorder:key==='fetch'?async()=>({ok:true,json:async()=>({})}):dom.window[key]});
 const module={exports:{}};new Function('require','module','exports',compiled.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);
 const React=await import('react'),{createRoot}=await import('react-dom/client'),{act}=React,root=createRoot(document.getElementById('root'));
 const calls=[];let available=true,logouts=0;
 const api=async(path,options={})=>{calls.push({path,options});if(path.endsWith('/ftext-cash/capability'))return {storeId:path.split('/')[4],configured:false};if(path.includes('barcode-registration?countOnly=true'))return{missingCount:13};if(/^\/api\/store-pos\/stores\/[^/]+$/.test(path))return{products:[],layout:{quickKeys:[],categories:[]},access:{},tableServiceEnabled:available};if(path.endsWith('/online-radio'))return{moduleActive:available,enabled:available,stations:available?[{id:'radio1',name:'Fixture Radio',streamUrl:'https://isolated.invalid/radio'}]:[]};if(path.endsWith('/table-service')&&!available||path==='/api/netlink/status')throw Error('not enabled');return{rows:[],items:[],requests:[],offers:[],stations:[],state:{},areas:[],tables:[],orders:[],products:[]}};
 const render=async(store='S')=>act(async()=>root.render(React.createElement(module.exports.default,{api,store:{id:store,name:'Fixture store'},company:{id:'C'},operator:{id:'O',employeeId:'E',fullName:'Fixture operator'},canRegisterBarcode:available,canPurchaseOrders:available,onLogout:()=>{logouts++}})));
 const click=async(node)=>{assert.ok(node);await act(async()=>node.click())};
 const trigger=()=>document.querySelector('.pos-header-menu-trigger'),layer=()=>document.querySelector('.pos-header-menu-layer'),panel=()=>document.querySelector('.pos-header-menu-panel');
 const open=async()=>{if(layer().hidden)await click(trigger());assert.equal(layer().hidden,false)};
 const button=(selector,text)=>[...document.querySelectorAll(selector)].find(b=>b.textContent.includes(text));
 try{
  await render();assert.equal(layer().hidden,true);assert.ok(panel().textContent.includes('Κατάστημα'));assert.equal(document.querySelectorAll('.pos-flat-brand>strong').length,1);assert.equal(document.querySelector('.pos-flat-brand>strong').textContent,'MyWorkStation');assert.equal(document.querySelector('.pos-header-expand-toggle'),null);assert.equal(document.querySelector('.pos-flat-barcode-badge').textContent,'Barcode: 13');assert.equal(document.querySelectorAll('[data-pos-last-transaction]').length,1);
  const header=document.querySelector('.store-pos-top');assert.equal(header.querySelector('.pos-aux-actions'),null);assert.equal(header.querySelector('.pos-keypad-toggle'),null);assert.ok(header.querySelector('button[title="Πλήρης ανανέωση POS"]'));assert.ok(button('.runtime-top-actions>button','Έξοδος'));
  const baseline=calls.length;await open();assert.equal(trigger().getAttribute('aria-expanded'),'true');assert.ok(panel().contains(document.activeElement),'scanner must not take focus from open menu');
  const close=panel().querySelector('button[aria-label="Κλείσιμο λειτουργιών POS"]');close.focus();await act(async()=>close.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Tab',shiftKey:true,bubbles:true})));assert.equal(document.activeElement,panel().querySelector('.pos-aux-actions>button:last-of-type'));
  await act(async()=>panel().dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true})));assert.equal(layer().hidden,true);assert.equal(document.activeElement,trigger());
  await open();await act(async()=>layer().dispatchEvent(new dom.window.MouseEvent('mousedown',{bubbles:true})));assert.equal(layer().hidden,true);
  assert.equal(calls.slice(baseline).filter(c=>c.options.method&&c.options.method!=='GET').length,0,'opening/closing does not write');
  await open();await click(document.querySelector('.pos-keypad-toggle'));assert.equal(layer().hidden,false);assert.equal(document.querySelector('.standard-keypad'),null);await click(close);
  await open();await click(document.querySelector('.table-service-top-button'));assert.equal(layer().hidden,true);assert.match(document.body.textContent,/Σάλες, τραπέζια και παραγγελίες/);await click(document.querySelector('.pos-standard-modal header button'));
  await open();const audio=document.querySelector('[data-pos-radio-background]');await click(button('.pos-aux-actions>button','Online Ράδιο'));assert.equal(layer().hidden,true);assert.ok(document.querySelector('.pos-online-radio-modal'));
  await click(button('.pos-online-radio-modal button','Play'));const paused=radioPauses;await click(document.querySelector('.pos-online-radio-modal header button'));await open();assert.equal(document.querySelector('[data-pos-radio-background]'),audio);assert.equal(radioPauses,paused);assert.match(button('.pos-aux-actions>button','Online Ράδιο').textContent,/Παίζει/);
  await click(document.querySelector('.mws-screen-recorder>button'));assert.equal(recordStarts,1);assert.equal(layer().hidden,false);await click(close);await open();assert.equal(recordStarts,1);assert.equal(trackStops,0,'menu close must not stop live recording');assert.match(document.querySelector('.mws-screen-recorder>button').textContent,/Διακοπή/);
  await click(close);await click(button('.store-pos-top .runtime-top-actions>button','Έξοδος'));assert.equal(logouts,1);
  await open();available=false;await render('OTHER');assert.equal(layer().hidden,true);await open();assert.equal(document.querySelector('.table-service-top-button'),null);assert.equal(button('.pos-aux-actions>button','Barcode'),undefined);assert.equal(button('.pos-aux-actions>button','Τιμολόγια'),undefined);assert.equal(button('.pos-aux-actions>button','Online Ράδιο'),undefined);assert.ok(button('.pos-aux-actions>button','Chat'));assert.ok(button('.pos-aux-actions>button','Κάρτα εργασίας'));
  assert.equal(calls.filter(c=>/checkout|stock|attendance\/scan/.test(c.path)).length,0,'no business action in this presentation test');
 }finally{await act(async()=>root.unmount());dom.window.close();for(const[key,d]of previous){if(d)Object.defineProperty(globalThis,key,d);else delete globalThis[key]}}
});
