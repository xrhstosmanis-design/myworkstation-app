import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
test('actual recovery form sends only three original files after printed attestation, rejects foreign names and withdraws on unmount',async()=>{
 const compiled=await build({entryPoints:[fileURLToPath(new URL('../../client/src/components/platform/FtextLateCashRecovery.jsx',import.meta.url))],bundle:true,write:false,format:'cjs',platform:'node',external:['react','react-dom','react/jsx-runtime']});
 const module={exports:{}};new Function('require','module','exports',compiled.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);
 const dom=new JSDOM('<div id="root"></div>',{url:'https://fixture.invalid/platform-admin'}),keys=['window','document','navigator','HTMLElement','Event','IS_REACT_ACT_ENVIRONMENT'],previous=new Map(keys.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));for(const key of keys)Object.defineProperty(globalThis,key,{configurable:true,writable:true,value:key==='IS_REACT_ACT_ENVIRONMENT'?true:dom.window[key]});
 const React=await import('react'),{createRoot}=await import('react-dom/client'),root=createRoot(document.getElementById('root')),{act}=React;
 const calls=[],id='370a0232-aeb7-4320-9919-d96c3f9f52d5',base='/api/ftext/v1/companies/company/stores/store/installation';let recovered=0,release;
 const request=async(url,options)=>{calls.push({url,body:JSON.parse(options.body)});return {status:'SALE_COMMITTED'};};
 const props={base,terminalPos:'POS-01',requestId:id,request,onRecovered:()=>recovered++};
 const render=()=>act(async()=>root.render(React.createElement(module.exports.default,props)));
 const upload=files=>act(async()=>{const input=document.querySelector('input[type=file]');Object.defineProperty(input,'files',{configurable:true,value:files});input.dispatchEvent(new Event('change',{bubbles:true}));});
 const submit=()=>act(async()=>document.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
 const file=(suffix,content='fixture')=>({name:'mws-cash-'+id+suffix,size:content.length,arrayBuffer:async()=>new TextEncoder().encode(content).buffer});
 try{
  await render();assert.equal(document.querySelector('button').disabled,true);await submit();assert.equal(calls.length,0);
  await act(async()=>document.querySelector('input[type=checkbox]').click());
  await upload([file('.intent.json'),file('.report.json'),{...file('.res'),name:'foreign.res'}]);await submit();assert.equal(calls.length,0);assert.ok(document.querySelector('[role=alert]'));
  await upload([file('.intent(2).json'),file('.report(2).json'),file('(3).res')]);await submit();assert.equal(calls.length,1);assert.equal(recovered,1);assert.equal(calls[0].url,base+'/POS-01/requests/'+id+'/late-cash-receipt');assert.deepEqual(Object.keys(calls[0].body).sort(),['intentBase64','rawResultBase64','reason','reportBase64']);assert.equal(calls[0].body.rawResultBase64,Buffer.from('fixture').toString('base64'));
  props.rejection=true;await render();await upload([file('.intent.json'),file('.report.json'),file('.res')]);await submit();assert.equal(calls.length,2);assert.equal(calls[1].url,base+'/POS-01/requests/'+id+'/rejected-cash-line');assert.equal(calls[1].body.noReceipt,true);
  await upload([{...file('.intent.json'),arrayBuffer:()=>new Promise(resolve=>release=resolve)},file('.report.json'),file('.res')]);await submit();await act(async()=>root.unmount());await act(async()=>release(new TextEncoder().encode('fixture').buffer));assert.equal(calls.length,2);
 }finally{try{await act(async()=>root.unmount());}catch{}dom.window.close();for(const [key,descriptor]of previous)descriptor?Object.defineProperty(globalThis,key,descriptor):delete globalThis[key];}
});
