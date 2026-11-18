import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';

test('installation UI binds inspected scope and packet, requires approval, consumes packets and ignores stale responses',async()=>{
 const dom=new JSDOM('<div id="root"></div>',{url:'https://isolated.invalid/'});
 const keys=['window','document','navigator','HTMLElement','Node','Event','IS_REACT_ACT_ENVIRONMENT'],previous=new Map(keys.map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
 for(const key of keys)Object.defineProperty(globalThis,key,{configurable:true,writable:true,value:key==='IS_REACT_ACT_ENVIRONMENT'?true:dom.window[key]});
 const React=await import('react'),{act}=React,{createRoot}=await import('react-dom/client');
 const built=await build({entryPoints:[fileURLToPath(new URL('../../client/src/components/platform/ReportEventInstallationManager.jsx',import.meta.url))],bundle:true,write:false,format:'cjs',platform:'node',external:['react','react-dom','react-dom/client','react/jsx-runtime']});
 const module={exports:{}};new Function('require','module','exports',built.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);
 const root=createRoot(document.getElementById('root')),calls=[];
 const description={profile:'CAPTURE',sourceRevision:'a'.repeat(40),oldPlanHash:'b'.repeat(64),targetPlanHash:'c'.repeat(64)};
 let holdDescribe=false,lateDescribe,lateInstall,failInstall=false,wrongScope=false;
 const packet=store=>({...description,companyId:'c',storeId:store,schema:'public',catalogueSignature:'d'.repeat(64),globalStateSignature:'e'.repeat(64)});
 const request=async(path,options={})=>{
  calls.push({path,...options});
  if(path.includes('/describe'))return holdDescribe?new Promise(resolve=>{lateDescribe=resolve}):description;
  if(path.endsWith('/inspect'))return {eligible:true,packet:packet(wrongScope?'foreign':path.includes('/stores/B/')?'B':'A')};
  if(path.endsWith('/install')){if(failInstall)throw Error('Server flag OFF');return new Promise(resolve=>{lateInstall=resolve});}
  throw Error('Unexpected request');
 };
 const button=label=>[...document.querySelectorAll('button')].find(node=>node.textContent===label);
 const render=store=>act(async()=>root.render(React.createElement(module.exports.default,{company:{id:'c',name:'Company'},store:{id:store,name:store},request})));
 try{
  await render('A');assert.equal(calls.length,0);
  await act(async()=>{const select=document.querySelector('select');select.value='CAPTURE';select.dispatchEvent(new Event('change',{bubbles:true}));});
  assert.equal(calls.length,0);
  await act(async()=>button('Έλεγχος εγκατάστασης αναφορών').click());
  assert.match(document.body.textContent,/aaaaaaaa/);assert.match(document.body.textContent,/c \/ A/);
  assert.equal(button('Εγκατάσταση προετοιμασίας αναφορών').disabled,true);
  await act(async()=>document.querySelector('input[type=checkbox]').click());
  await act(async()=>{button('Εγκατάσταση προετοιμασίας αναφορών').click();button('Εγκατάσταση προετοιμασίας αναφορών')?.click();});
  const installs=calls.filter(call=>call.path.endsWith('/install'));assert.equal(installs.length,1);
  assert.deepEqual(JSON.parse(installs[0].body),{profile:'CAPTURE',packet:packet('A'),explicitAuthorization:true});
  await act(async()=>lateInstall({installed:true}));assert.equal(button('Εγκατάσταση προετοιμασίας αναφορών'),undefined);
  holdDescribe=true;await act(async()=>button('Έλεγχος εγκατάστασης αναφορών').click());
  await render('B');const count=calls.length;
  await act(async()=>lateDescribe(description));assert.equal(calls.length,count,'stale describe cannot request an old-scope inspect');
  assert.doesNotMatch(document.body.textContent,/aaaaaaaa/);
  holdDescribe=false;wrongScope=true;
  await act(async()=>button('Έλεγχος εγκατάστασης αναφορών').click());
  assert.match(document.querySelector('[role=alert]').textContent,/δεν επιβεβαίωσε/);assert.equal(button('Εγκατάσταση προετοιμασίας αναφορών'),undefined);
  wrongScope=false;await act(async()=>button('Έλεγχος εγκατάστασης αναφορών').click());
  await act(async()=>document.querySelector('input[type=checkbox]').click());failInstall=true;
  await act(async()=>button('Εγκατάσταση προετοιμασίας αναφορών').click());
  assert.match(document.querySelector('[role=alert]').textContent,/flag OFF/);assert.equal(button('Εγκατάσταση προετοιμασίας αναφορών'),undefined);
 }finally{await act(async()=>root.unmount());dom.window.close();for(const [key,value]of previous)value?Object.defineProperty(globalThis,key,value):delete globalThis[key];}
});
