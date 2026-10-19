import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';

// The actual parent/session boundary stays mounted. The panel observer isolates
// only this parent-to-vault denial contract; real vault+panel tests are separate.
const compiled=await build({entryPoints:[fileURLToPath(new URL('../../client/src/components/wholesale/WholesaleApp.jsx',import.meta.url))],bundle:true,write:false,format:'cjs',platform:'node',external:['react','react-dom','react-dom/client','react/jsx-runtime'],plugins:[{name:'observe-only-offline-denial-boundary',setup(builder){
  builder.onLoad({filter:/\/WholesaleOfflinePanel\.jsx$/},()=>({loader:'jsx',contents:"import React from 'react';export default function Panel(props){window.__offlineProps=props;return <section data-offline-observer/>}"}));
  builder.onLoad({filter:/\/WholesaleSuiteWorkspace\.jsx$/},()=>({loader:'jsx',contents:"import React from 'react';export const wholesaleIdentityKey=x=>JSON.stringify([x.userId,x.companyId,x.role]);export const wholesaleAccessEnabled=(a,x)=>a?.enabled===true&&a.companyId===x.companyId&&a.moduleKey==='WHOLESALE_B2B';export default function Suite(){return <div data-suite/>}"}));
}}]});
const module={exports:{}};new Function('require','module','exports',compiled.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);
test('authoritative parent module/store denial reaches offline vault, while transport failure or401 never invents a revocation',async()=>{
  const dom=new JSDOM('<div id="root"></div>',{url:'https://isolated.invalid/wholesale/?storeId=store-a'});
  const keys=['window','document','navigator','HTMLElement','Node','Event','localStorage','sessionStorage','IS_REACT_ACT_ENVIRONMENT'],old=new Map(keys.map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
  for(const key of keys)Object.defineProperty(globalThis,key,{configurable:true,writable:true,value:key==='IS_REACT_ACT_ENVIRONMENT'?true:dom.window[key]});
  const identity={id:'owner-a',companyId:'company-a',role:'OWNER',tokenType:'BACKOFFICE_USER',sessionId:'session-a',sessionVersion:0,exp:Math.floor(Date.now()/1000)+3600};
  localStorage.setItem('token','header.'+Buffer.from(JSON.stringify(identity)).toString('base64url')+'.signature');localStorage.setItem('user',JSON.stringify({id:'owner-a',role:'OWNER',fullName:'Synthetic owner',company:{id:'company-a'}}));
  const React=await import('react'),{act}=React,{createRoot}=await import('react-dom/client');const root=createRoot(document.getElementById('root'));
  let mode='active';const access={companyId:'company-a',moduleKey:'WHOLESALE_B2B',enabled:true,expiresAt:null};
  const api=async route=>{
    if(route==='/api/wholesale/capabilities'){
      if(mode==='network')throw Error('Synthetic transport unavailable');
      if(mode==='401')throw Object.assign(Error('Synthetic session expired'),{status:401});
      return {...access,enabled:mode!=='disabled'};
    }
    if(route.startsWith('/api/wholesale/workspace?')){
      if(mode==='store403')throw Object.assign(Error('Synthetic selected store denied'),{status:403});
      return {company:{id:'company-a',name:'Synthetic company'},user:{id:'owner-a',role:'OWNER'},storeId:'store-a',stores:[{id:'store-a',name:'Synthetic store'}],access};
    }
    throw Error('Unexpected route '+route);
  };
  const refresh=async next=>{mode=next;await act(async()=>{[...document.querySelectorAll('button')].find(x=>x.textContent==='Επανέλεγχος πρόσβασης').click()})};
  try{
    await act(async()=>root.render(React.createElement(module.exports.default,{request:api,search:'?storeId=store-a'})));
    assert.equal(window.__offlineProps.accessDenial,null);
    await refresh('disabled');assert.equal(window.__offlineProps.accessDenial.identity.userId,'owner-a');assert.equal(window.__offlineProps.accessDenial.storeId,null);
    await refresh('active');assert.equal(window.__offlineProps.accessDenial,null);
    await refresh('network');assert.equal(window.__offlineProps.accessDenial,null);
    await refresh('active');await refresh('store403');assert.equal(window.__offlineProps.accessDenial.storeId,'store-a');
    await refresh('active');assert.equal(window.__offlineProps.accessDenial,null);await refresh('401');assert.equal(window.__offlineProps.accessDenial,null);
  }finally{await act(async()=>root.unmount());dom.window.close();for(const key of keys){const descriptor=old.get(key);if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key]}}
});
