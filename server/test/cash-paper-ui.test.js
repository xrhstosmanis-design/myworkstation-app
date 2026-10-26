import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
test('actual mounted paper panel: explicit single read, no automatic retry, escaped source and old-store completion rejected without remount',async()=>{
 const dom=new JSDOM('<div id="root"></div>',{url:'https://isolated.invalid/'}),keys=['window','document','navigator','HTMLElement','Node','Event','IS_REACT_ACT_ENVIRONMENT'],previous=new Map(keys.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
 for(const k of keys)Object.defineProperty(globalThis,k,{configurable:true,writable:true,value:k==='IS_REACT_ACT_ENVIRONMENT'?true:dom.window[k]});
 const React=await import('react'),{createRoot}=await import('react-dom/client'),{act}=React;
 const built=await build({entryPoints:[fileURLToPath(new URL('../../client/src/components/shared/CashPaperReadingPanel.jsx',import.meta.url))],bundle:true,write:false,format:'cjs',platform:'node',external:['react','react-dom','react-dom/client','react/jsx-runtime']});
 const module={exports:{}};new Function('require','module','exports',built.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);const root=createRoot(document.getElementById('root')),calls=[];
 let active='A',hold=false,release,fail=false,status='NOT_READ';const checksum='a'.repeat(64);
 const source=store=>({sourceId:store,checksum,references:[{messageId:'message-'+store,filename:'<img src=x onerror=alert(1)>'}],reading:{status}});
 const completed=store=>({storeId:store,checksum,generation:'0',status:'EXTRACTED_UNVERIFIED',extraction:{documentDate:null,dateText:'21/10',operatorText:store,shiftText:null,notes:[],lines:[{label:'<script>bad</script>',amountText:null,requiresReview:true}]}});
 const api=async(path,options={})=>{calls.push({path,...options});if(!options.method)return {storeId:active,generation:'0',sources:[source(active)]};if(fail)throw Error('Connection lost');if(hold)return new Promise(resolve=>release=()=>resolve(completed('A')));return completed(active);};
 const render=async store=>{active=store;await act(async()=>root.render(React.createElement(module.exports.default,{api,storeId:store})));};
 const button=text=>[...document.querySelectorAll('button')].find(b=>b.textContent===text);
 try{
  await render('A');assert.equal(calls.length,0);await act(async()=>button('Χειρόγραφα καταστήματος').click());assert.equal(calls.length,1);assert.equal(calls[0].method,undefined);
  await act(async()=>{button('Ανάγνωση με AI').click();button('Ανάγνωση με AI').click();});assert.equal(calls.filter(c=>c.method).length,1);assert.equal(button('Ανάγνωση με AI').disabled,true);assert.match(document.body.textContent,/ΠΡΟΣ ΕΛΕΓΧΟ/);assert.equal(document.querySelector('script'),null);assert.equal(document.querySelector('img'),null);
  await render('B');await act(async()=>button('Χειρόγραφα καταστήματος').click());fail=true;await act(async()=>button('Ανάγνωση με AI').click());assert.equal(button('Ανάγνωση με AI').disabled,true);const afterFailure=calls.filter(c=>c.method).length;await act(async()=>Promise.resolve());assert.equal(calls.filter(c=>c.method).length,afterFailure,'no deferred retry');
  fail=false;status='PENDING';await act(async()=>button('Ανανέωση χειρόγραφων').click());assert.equal(button('Ανάγνωση με AI').disabled,true);
  status='NOT_READ';await render('A');await act(async()=>button('Χειρόγραφα καταστήματος').click());hold=true;await act(async()=>button('Ανάγνωση με AI').click());assert.equal(typeof release,'function');
  await render('B');await act(async()=>release());assert.doesNotMatch(document.body.textContent,/message-A|<script>bad/);
  hold=false;await act(async()=>button('Χειρόγραφα καταστήματος').click());assert.match(document.body.textContent,/message-B/);assert.equal(button('Ανάγνωση με AI').disabled,false);
 }finally{await act(async()=>root.unmount());dom.window.close();for(const [k,d]of previous)d?Object.defineProperty(globalThis,k,d):delete globalThis[k];}
});
