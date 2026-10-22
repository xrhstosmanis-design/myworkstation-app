import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';

test('mounted POS remembers each operator calculator choice without shared tenant/store preferences or payment writes',async()=>{
 const compiled=await build({entryPoints:[fileURLToPath(new URL('../../client/src/components/store/StorePosPanel.jsx',import.meta.url))],bundle:true,write:false,format:'cjs',platform:'node',external:['react','react-dom','react-dom/client','react/jsx-runtime','pdfjs-dist/build/pdf.worker.min.mjs?url','pdfjs-dist/build/pdf.mjs'],loader:{'.css':'empty'},logOverride:{'empty-import-meta':'silent'}});
 const dom=new JSDOM('<div id="root"></div>',{url:'https://isolated.invalid'}),keys=['window','document','navigator','HTMLElement','MutationObserver','localStorage','fetch','IS_REACT_ACT_ENVIRONMENT'];
 const previous=new Map(keys.map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
 for(const key of keys)Object.defineProperty(globalThis,key,{configurable:true,writable:true,value:key==='IS_REACT_ACT_ENVIRONMENT'?true:key==='fetch'?async()=>({ok:true}):dom.window[key]});
 const module={exports:{}};new Function('require','module','exports',compiled.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);
 const React=await import('react'),{createRoot}=await import('react-dom/client'),{act}=React;
 let root=createRoot(document.getElementById('root'));
 const calls=[],api=async(path,options={})=>{calls.push({path,options});if(path.endsWith('/ftext-cash/capability'))return {storeId:path.split('/')[4],configured:false};if(path.startsWith('/api/store-pos/stores/')&&!path.slice('/api/store-pos/stores/'.length).includes('/'))return {products:[],layout:{quickKeys:[],categories:[]},access:{}};if(path.endsWith('/table-service')||path==='/api/netlink/status')throw Error('not enabled');return {rows:[],items:[],requests:[],offers:[],stations:[],state:{}}};
 const render=async({person='A',store='S',company='C',id=person,identified=true}={})=>act(async()=>root.render(React.createElement(module.exports.default,{api,store:{id:store,name:'Fixture store'},company:{id:company},operator:identified?{id,employeeId:person,fullName:'Fixture operator'}:null})));
 const button=()=>document.querySelector('.pos-keypad-toggle');
 const assertVisible=value=>{assert.equal(Boolean(document.querySelector('.standard-keypad')),value);assert.equal(button().getAttribute('aria-pressed'),String(value));assert.equal(document.querySelector('.standard-pos-grid').classList.contains('without-keypad'),!value);assert.match(button().textContent,/Κομπιουτεράκι/)};
 const toggle=async()=>{const before=calls.length;if(document.querySelector('.pos-header-menu-layer')?.hidden)await act(async()=>document.querySelector('.pos-header-menu-trigger').click());await act(async()=>button().click());assert.equal(calls.slice(before).filter(({options})=>options.method&&options.method!=='GET').length,0,'calculator toggle submits no writes')};
 const preferenceKeys=()=>Object.keys(dom.window.localStorage).filter(key=>key.startsWith('myworkstation:pos-keypad:'));
 const remount=async()=>{await act(async()=>root.unmount());root=createRoot(document.getElementById('root'));};
 try {
  await render();assertVisible(true);
  await toggle();assertVisible(false);assert.equal(preferenceKeys().length,1);
  const key=preferenceKeys()[0];assert.equal(localStorage.getItem(key),'hidden');
  await remount();await render();assertVisible(false);
  await render({person:'B'});assertVisible(true);await toggle();assertVisible(false);await toggle();assertVisible(true);
  await render({id:'renewed-profile-id'});assertVisible(false,'same employee retains choice even if profile ID changes');
  await render({store:'OTHER'});assertVisible(true);await toggle();assertVisible(false);
  await render({company:'OTHER'});assertVisible(true);
  await render();assertVisible(false);
  await toggle();assertVisible(true);await remount();await render();assertVisible(true);
  const count=preferenceKeys().length;
  await render({identified:false});assertVisible(true);await toggle();assertVisible(false);assert.equal(preferenceKeys().length,count,'anonymous choice is not persisted');
  await render({person:'B'});assertVisible(true,'anonymous toggle cannot change another operator');
  await remount();await render({identified:false});assertVisible(true);
  await remount();Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem(key){if(key.startsWith('myworkstation:pos-keypad:'))throw Error('storage read denied');return dom.window.localStorage.getItem(key)},setItem(key,value){if(key.startsWith('myworkstation:pos-keypad:'))throw Error('storage write denied');return dom.window.localStorage.setItem(key,value)}}});
  await render();assertVisible(true);await toggle();assertVisible(false);await toggle();assertVisible(true);
  assert.equal(calls.filter(({path})=>path.endsWith('/checkout')).length,0,'display choices never submit a payment');
 }finally{await act(async()=>root.unmount());dom.window.close();for(const [key,descriptor] of previous){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key]}}
});
