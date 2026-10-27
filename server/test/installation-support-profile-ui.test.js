import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';

// These existing views are represented by inert components: their independent
// data/providers are outside this new read-only view's test scope.
const existingViews={
  name:'isolate-existing-views',
  setup(builder){
    builder.onResolve({filter:/^\.\/(StoreInstallationGuide|SuperAdminStaffScheduler)\.jsx$/},args=>({path:args.path,namespace:'existing-view'}));
    builder.onLoad({filter:/.*/,namespace:'existing-view'},args=>({contents:`import React from 'react'; export default function ExistingView(){return React.createElement('div',{'data-existing-view':${JSON.stringify(args.path)}})}`,loader:'js'}));
  }
};
const compiled=await build({entryPoints:[fileURLToPath(new URL('../../client/src/components/platform/SuperAdminInstallationCenter.jsx',import.meta.url))],bundle:true,write:false,format:'cjs',platform:'node',loader:{'.css':'empty'},external:['react','react-dom','react-dom/client','react/jsx-runtime'],plugins:[existingViews]});
const companies=[
  {id:'company-a',name:'Εταιρεία Α',stores:[{id:'store-a',name:'Κατάστημα Α',city:'Αθήνα',address:'Αθηνάς 1',responsibleEmail:'a@example.test',token:'SECRET-A',password:'HIDDEN-A'}]},
  {id:'company-b',name:'Εταιρεία Β',stores:[{id:'store-b',name:'Κατάστημα Β',city:null,address:null,responsibleEmail:null,token:'SECRET-B'}]}
];

async function withCenter(run){
  const dom=new JSDOM('<div id="root"></div>',{url:'https://isolated.invalid'}),keys=['window','document','navigator','HTMLElement','Node','Event','KeyboardEvent','IS_REACT_ACT_ENVIRONMENT'],previous=new Map(keys.map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
  for(const key of keys)Object.defineProperty(globalThis,key,{configurable:true,writable:true,value:key==='IS_REACT_ACT_ENVIRONMENT'?true:dom.window[key]});
  const React=await import('react'),{createRoot}=await import('react-dom/client'),{act}=React,require=createRequire(import.meta.url),module={exports:{}};
  new Function('require','module','exports',compiled.outputFiles[0].text)(require,module,module.exports);
  const requests=[],opened=[],closed=[],root=createRoot(document.getElementById('root'));
  const request=async(path,options)=>{requests.push({path,options});return {state:{active:false,monthlyPrice:49}}};
  const render=async(input=companies)=>act(async()=>root.render(React.createElement(module.exports.default,{companies:input,request,onOpenTerminals:(...args)=>opened.push(args),onClose:()=>closed.push(true)})));
  const click=async element=>{assert.ok(element,'button missing');await act(async()=>element.click())};
  const byText=(scope,text)=>[...scope.querySelectorAll('button')].find(button=>button.textContent.trim()===text);
  try{await render();await run({dom,render,click,byText,requests,opened,closed})}finally{await act(async()=>root.unmount());dom.window.close();for(const [key,descriptor] of previous){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key]}}
}

test('selected support view shows only authoritative store fields and performs no new request',async()=>withCenter(async({click,byText,requests})=>{
  const cards=[...document.querySelectorAll('.security-list article')],before=requests.length;
  await click(byText(cards[0],'Στοιχεία υποστήριξης'));
  const dialog=document.querySelector('[role="dialog"]');assert.ok(dialog);assert.match(dialog.textContent,/Εταιρεία Α/);assert.match(dialog.textContent,/Κατάστημα Α/);assert.match(dialog.textContent,/Αθηνάς 1/);assert.match(dialog.textContent,/a@example\.test/);
  assert.doesNotMatch(dialog.textContent,/Εταιρεία Β|Κατάστημα Β|SECRET|HIDDEN/);assert.equal(requests.length,before,'opening the new view must not add requests');
  assert.equal(document.activeElement.getAttribute('aria-label'),'Κλείσιμο στοιχείων υποστήριξης');
  await click(byText(dialog,'Κλείσιμο'));assert.equal(document.querySelector('[role="dialog"]'),null);assert.equal(requests.length,before);
}));

test('unknown fields are explicit and refreshed props cannot leak an old or removed store',async()=>withCenter(async({click,byText,render,requests})=>{
  const cards=[...document.querySelectorAll('.security-list article')];await click(byText(cards[1],'Στοιχεία υποστήριξης'));
  let dialog=document.querySelector('[role="dialog"]');assert.match(dialog.textContent,/Κατάστημα Β/);assert.match(dialog.textContent,/Μη καταχωρημένο/);assert.match(dialog.textContent,/Δεν έχει ελεγχθεί/);assert.match(dialog.querySelector(".install-support-unchecked").textContent,/ΤεχνικόςΔεν έχει ελεγχθεί/);assert.doesNotMatch(dialog.textContent,/Κατάστημα Α|Αθηνάς 1|a@example\.test|SECRET/);
  const before=requests.length;await render([{id:'company-b',name:'Εταιρεία Β',stores:[{id:'store-b',name:'Κατάστημα Β νέο',city:'Πάτρα',address:'Νέα 2',responsibleEmail:null}]}]);
  dialog=document.querySelector('[role="dialog"]');assert.match(dialog.textContent,/Κατάστημα Β νέο/);assert.match(dialog.textContent,/Νέα 2/);assert.doesNotMatch(dialog.textContent,/Αθηνάς 1|Κατάστημα Α/);
  await render([{id:'company-a',name:'Εταιρεία Α',stores:[{id:'store-b',name:'Ξένο ίδιο ID',city:'Αθήνα'}]}]);dialog=document.querySelector('[role="dialog"]');assert.match(dialog.textContent,/δεν είναι πλέον διαθέσιμο/);assert.doesNotMatch(dialog.textContent,/Νέα 2|Ξένο ίδιο ID/);assert.equal(requests.length,before);
}));

test('closing one store and selecting another updates the view without requests or HTML interpretation',async()=>withCenter(async({click,byText,render,requests})=>{
  const risky=[companies[0],{id:'company-b',name:'<img src=x onerror=alert(1)>',stores:[{id:'store-b',name:'Κατάστημα Β',city:'Πάτρα'}]}];
  await render(risky);const cards=[...document.querySelectorAll('.security-list article')],before=requests.length;
  await click(byText(cards[0],'Στοιχεία υποστήριξης'));let dialog=document.querySelector('[role="dialog"]');assert.match(dialog.textContent,/Κατάστημα Α/);
  await click(byText(dialog,'Κλείσιμο'));await click(byText(cards[1],'Στοιχεία υποστήριξης'));dialog=document.querySelector('[role="dialog"]');
  assert.match(dialog.textContent,/<img src=x onerror=alert\(1\)>/);assert.equal(dialog.querySelector('img'),null);assert.match(dialog.textContent,/Κατάστημα Β/);assert.doesNotMatch(dialog.textContent,/Κατάστημα Α|Αθηνάς 1|a@example\.test/);assert.equal(requests.length,before);
}));

test('existing guide, terminal, scheduler and module save controls remain reachable',async()=>withCenter(async({click,byText,requests,opened})=>{
  const card=document.querySelector('.security-list article');await click(byText(card,'Οδηγός εγκατάστασης'));assert.ok(document.querySelector('[data-existing-view="./StoreInstallationGuide.jsx"]'));
  await click(byText(card,'REMOTE / Τερματικά'));assert.equal(opened.length,1);assert.equal(opened[0][0].id,'company-a');assert.equal(opened[0][1].id,'store-a');assert.equal(opened[0][2],true);
  await click(byText(card,'Άνοιγμα AI Προγράμματος'));assert.ok(document.querySelector('[data-existing-view="./SuperAdminStaffScheduler.jsx"]'));
  const before=requests.length;await click(byText(card,'Αποθήκευση module'));assert.equal(requests.length,before+1);assert.equal(requests.at(-1).options.method,'PUT');assert.match(requests.at(-1).path,/company-a\/stores\/store-a$/);
}));

test('keyboard dismissal closes only the new view and restores focus',async()=>withCenter(async({click,byText,dom})=>{
  const button=byText(document.querySelector('.security-list article'),'Στοιχεία υποστήριξης');button.focus();await click(button);const dialog=document.querySelector('[role="dialog"]');
  dialog.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Tab',bubbles:true,cancelable:true}));assert.equal(document.activeElement.getAttribute('aria-label'),'Κλείσιμο στοιχείων υποστήριξης');
  await (await import('react')).act(async()=>dialog.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true})));assert.equal(document.querySelector('[role="dialog"]'),null);assert.equal(document.activeElement,button);
}));
