import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';

test('mounted two-shift form saves null, reopens it and requires third hour only when selected',async()=>{
 const dom=new JSDOM('<div id="root"></div>',{url:'https://isolated.invalid/'}),keys=['window','document','navigator','HTMLElement','Node','Event','IS_REACT_ACT_ENVIRONMENT'],previous=new Map(keys.map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
 for(const key of keys)Object.defineProperty(globalThis,key,{configurable:true,writable:true,value:key==='IS_REACT_ACT_ENVIRONMENT'?true:dom.window[key]});
 const React=await import('react'),{createRoot}=await import('react-dom/client'),{act}=React;
 const compiled=await build({entryPoints:[fileURLToPath(new URL('../../client/src/components/platform/AutomaticReportSettingsManager.jsx',import.meta.url))],bundle:true,write:false,format:'cjs',platform:'node',loader:{'.css':'empty'},external:['react','react-dom','react-dom/client','react/jsx-runtime']});
 const module={exports:{}};new Function('require','module','exports',compiled.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);
 const root=createRoot(document.getElementById('root')),calls=[],cashRule={mode:'FULL',deliveryTerminalPattern:'DELIVERY',carryOverEnabled:true,posEftposEnabled:true};
 let saved=null;
 const request=async(path,options={})=>{
  calls.push({path,...options});
  if(!path.endsWith('/report-settings'))throw Error('Dispatch is intentionally unavailable in this isolated settings test');
  if(options.method==='PUT'){saved={version:1,configuration:JSON.parse(options.body).configuration};return {settings:saved};}
  return {settings:saved,cashRule,observedTerminals:['TWO'],suggestedDay:'2026-10-15'};
 };
 const button=text=>[...document.querySelectorAll('button')].find(b=>b.textContent===text);
 const change=async(label,value)=>act(async()=>{const input=document.querySelector(`[aria-label="${label}"]`);Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,'value').set.call(input,value);input.dispatchEvent(new dom.window.Event('input',{bubbles:true}));});
 try{
  await act(async()=>root.render(React.createElement(module.exports.default,{company:{id:'c',name:'Company'},store:{id:'s',name:'Two'},request,onClose:()=>{}})));
  const header=document.querySelector('.report-settings-note').textContent;
  assert.doesNotMatch(header,/Η αυτόματη αποστολή δεν έχει ενεργοποιηθεί/);assert.match(header,/Αυτόματες αποστολές/);
  await act(async()=>button('+ Προσθήκη ταμείου').click());await change('Κωδικός ταμείου 1','TWO');
  const slots=()=>document.querySelectorAll('[aria-label="Βάρδιες ταμείου 1"] input');
  await act(async()=>slots()[2].click());await change('Έναρξη 3ης βάρδιας','');
  assert.equal(document.querySelector('[aria-label="Έναρξη 3ης βάρδιας"]').required,false);
  await act(async()=>document.querySelector('.report-settings-confirm input').click());
  assert.equal(document.querySelector('form').checkValidity(),true);
  await act(async()=>document.querySelector('form').dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true})));
  assert.deepEqual(saved.configuration.terminals,[{terminalPos:'TWO',requiredSlots:[1,2]}]);assert.equal(saved.configuration.thirdShiftStartHour,null);
  await act(async()=>button('Ανανέωση ρυθμίσεων').click());assert.equal(document.querySelector('[aria-label="Έναρξη 3ης βάρδιας"]').value,'');assert.equal(slots()[2].checked,false);
  await act(async()=>slots()[2].click());assert.equal(document.querySelector('[aria-label="Έναρξη 3ης βάρδιας"]').required,true);assert.equal(document.querySelector('form').checkValidity(),false);
  await change('Έναρξη 3ης βάρδιας','23');assert.equal(document.querySelector('form').checkValidity(),true);
  assert.equal(calls.filter(c=>c.method==='PUT').length,1);assert.equal(calls.filter(c=>c.method==='POST').length,0);
 }finally{await act(async()=>root.unmount());dom.window.close();for(const [key,descriptor] of previous){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}}
});
